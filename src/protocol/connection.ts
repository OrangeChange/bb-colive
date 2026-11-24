/**
 * 弹幕连接生命周期：room_init -> getDanmuInfo(wbi) -> finger(buvid) -> KeepLiveWS
 *
 * 状态回调驱动主窗口 UI（protocolStore），事件回调驱动三路分发
 * （eventStore / SQLite / emit('danmu:event')，由上层 protocolStore 编排）。
 * 协议层只在主窗口实例化（architecture.md §二）。
 */
import { KeepLiveWS } from '@laplace.live/ws'
import { getDanmuInfo, getFinger, getMasterInfo, getNav, getRealRoomId, getRoomInfo, keyFromUrl, ApiError, BiliTransportError, describeRequestFailure, withNetworkRetry } from './api'
import { completeGuardAvatar } from './guardAvatar'
import { adapt } from './adapter'
import { activityFactFromMessage } from '../events/activityLifecycle'
import { loadGiftConfig } from './gifts'
import { loadGiftEffectResources } from './giftEffects'
import { getDiagnosticContext } from '../diagnostics/diagnosticLogger'
import type { DiagnosticContext } from '../diagnostics/diagnosticLogger'
import { sourceDiagnosticLogger } from '../diagnostics/sourceLogger'
import { recordFeatureDiagnostic } from '../diagnostics/featureDiagnostics'
import { recordArchiveSourceEvent } from '../archive/archiveDiagnostics.ts'
import { AdapterContext, ConnState, DanmakuEvent, RoomGuardProfile, MsgType } from './types'
import { adaptLaplaceStateMessage } from './laplaceCompatibility'
import type { LaplaceStateUpdate } from './laplaceCompatibility'
import { classifyAdaptationResult, type AdaptationDiagnosticResult } from './adaptationDiagnostics'
import type { RoomInitData } from './api'

const DEFAULT_WS_URL = 'wss://broadcastlv.chat.bilibili.com:443/sub'
type ConnectionStage = 'nav' | 'room_init' | 'master' | 'room_info' | 'danmu_info' | 'buvid' | 'gift_config' | 'gift_effect' | 'websocket'
const STAGE_OUTCOMES = new Set(['start', 'success', 'failure', 'cancelled'])

function normalizeLiveStartedAt(value: number | null | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined
  return value < 1_000_000_000_000 ? Math.round(value * 1000) : Math.round(value)
}

interface StageOptions<T> {
  optional?: boolean
  isSuccess?: (value: T) => boolean
  failureData?: Record<string, unknown>
}

function diagnosticErrorDetails(error: unknown): Record<string, unknown> {
  if (error instanceof ApiError) {
    const code = Number.isSafeInteger(error.code) ? error.code : undefined
    const httpStatus = code !== undefined && code >= 100 && code <= 599 ? code : undefined
    return {
      category: 'api',
      ...(httpStatus === undefined ? {} : { httpStatus }),
      ...(code === undefined || httpStatus !== undefined ? {} : { apiCode: code }),
      summary: error.friendly ? 'api request rejected' : 'api request failed',
    }
  }
  if (error instanceof BiliTransportError) {
    const details = describeRequestFailure(error)
    return { ...details, category: details.category === 'cancelled' ? 'cancelled' : 'network', summary: details.category === 'cancelled' ? details.summary : 'network request failed', endpoint: error.endpoint }
  }
  return { ...describeRequestFailure(error) }
}

export interface ConnectParams {
  /** 用户输入（短号或真实房间号均可，room_init 会解析） */
  roomIdInput: string
  /** 登录 cookie */
  cookie: string
  /** 登录 uid（nav.mid，WS auth 用） */
  uid: number
  /** 是否在事件上保留原始报文（调试用，默认 false） */
  keepRaw?: boolean
  /** 重连同一房间时沿用本机已观测到的用户图标 URL。 */
  guardIconUrlsByUid?: ReadonlyMap<string, string>
  /** 同一房间重连时暂时沿用的直播间档位，room_info 成功后会刷新。 */
  roomGuardProfile?: RoomGuardProfile
}

export interface ConnectionCallbacks {
  onActivityUpdate?: (fact: import('../events/activityLifecycle').ActivityFacts) => void
  onEvent: (event: DanmakuEvent) => void
  onState: (state: ConnState) => void
  /** 可选的 Laplace 兼容状态输出；不影响现有事件和统计逻辑。 */
  onLaplaceStateUpdate?: (update: LaplaceStateUpdate) => void
}

export interface ConnectionRuntimeDiagnostic {
  runtimeId: string
  generation: number
}


/** 连接成功后待 upsert 进主播列表的信息 */
export interface AnchorInfo {
  roomIdInput: string
  realRoomId: number
  uname: string
  face?: string
  liveStatus?: 0 | 1 | 2
}

export class DanmuConnection {
  private live: KeepLiveWS | null = null
  private ctx: AdapterContext | null = null
  private closedByUser = false
  private anchorInfo: AnchorInfo | null = null
  private roomTitle: string | undefined
  private roomCoverUrl: string | undefined
  private liveStartedAt: number | undefined
  private liveStatus: 0 | 1 | 2 = 0
  private liveEvidenceRevision = 0
  private readonly diagnosticContext: DiagnosticContext
  private connectionId: string | undefined
  private connectionStartedAt: number | null = null
  private activeStages = new Map<ConnectionStage, number>()
  private reportedRoomGuardProfileKey: string | undefined
  private readonly diagnosedTransports = new WeakSet<object>()

  constructor(
    private cb: ConnectionCallbacks,
    diagnosticContext: DiagnosticContext = getDiagnosticContext(),
    private readonly runtimeDiagnostic?: ConnectionRuntimeDiagnostic,
  ) {
    this.diagnosticContext = diagnosticContext
  }

  get diagnosticConnectionId(): string | undefined {
    return this.connectionId
  }

  get isConnected(): boolean {
    return !!this.live?.connection?.live
  }

  /** 本次连接的主播信息（room_init 后可用；拉取失败为 null） */
  get anchor(): AnchorInfo | null {
    return this.anchorInfo
  }

  get liveStatusRevision(): number {
    return this.liveEvidenceRevision
  }

  reconcileLiveStatus(room: RoomInitData, revision: number): boolean {
    if (this.closedByUser || !this.isConnected || room.room_id !== this.ctx?.roomId
      || revision !== this.liveEvidenceRevision) return false
    const startedAt = normalizeLiveStartedAt(room.live_time)
    if (this.liveStatus === 0 && room.live_status === 1 && startedAt !== undefined && startedAt === this.liveStartedAt) return false
    if (room.live_status === 1 && (startedAt !== undefined || this.liveStatus !== 1)) this.liveStartedAt = startedAt
    this.liveStatus = room.live_status
    if (this.anchorInfo) this.anchorInfo.liveStatus = this.liveStatus
    this.cb.onState({ status: 'connected', roomId: room.room_id,
      liveStatus: this.liveStatus, liveStartedAt: this.liveStartedAt })
    return true
  }

  /** 全流程连接。抛出的错误会先通过 onState({status:'error'}) 回调上报 */
  async connect(params: ConnectParams): Promise<void> {
    this.closedByUser = false
    this.roomTitle = undefined
    this.roomCoverUrl = undefined
    this.liveStartedAt = undefined
    this.reportedRoomGuardProfileKey = undefined
    this.connectionId = this.diagnosticContext.nextConnectionId()
    this.connectionStartedAt = Date.now()
    this.activeStages.clear()
    this.recordConnectionLifecycle('connection:start')
    try {
      this.cb.onState({ status: 'connecting', message: '正在解析房间…' })

      // 1. nav（wbi 密钥）
      const nav = await this.runStage('nav', async () => {
        const value = await getNav(params.cookie)
        // 密钥只在内存中用于后续签名；不进入任何诊断记录。
        keyFromUrl(value.wbi_img.img_url)
        keyFromUrl(value.wbi_img.sub_url)
        return value
      })
      if (!nav || this.closedByUser) return
      const imgKey = keyFromUrl(nav.wbi_img.img_url)
      const subKey = keyFromUrl(nav.wbi_img.sub_url)

      // 2. room_init（短号 -> 真实房间号 + 主播 uid）
      const roomInit = await this.runStage('room_init', async () => {
        const value = await getRealRoomId(params.roomIdInput.trim(), params.cookie)
        if (value.locked) throw new Error('直播间已被封禁')
        if (value.encrypted) throw new Error('直播间已加密')
        return value
      })
      if (!roomInit || this.closedByUser) return

      this.ctx = {
        roomId: roomInit.room_id,
        anchorUid: String(roomInit.uid),
        viewerUid: String(params.uid),
        keepRaw: params.keepRaw ?? false,
        ...(params.roomGuardProfile ? {
          roomGuardProfile: {
            ...params.roomGuardProfile,
            roomId: roomInit.room_id,
            anchorUid: String(roomInit.uid),
          },
        } : {}),
        wealthByUid: new Map(),
        wealthIconUrlsByLevel: new Map(),
        guardIconUrlsByUid: new Map(params.guardIconUrlsByUid),
      }
      // 3. 主播信息（头像+名字，拿不到不阻断连接）
      const master = await this.runStage('master', () => getMasterInfo(roomInit.uid, params.cookie), { optional: true })
      if (this.closedByUser) return
      if (this.ctx && master) this.ctx.anchorName = master.uname
      this.liveStatus = roomInit.live_status
      this.liveStartedAt = normalizeLiveStartedAt(roomInit.live_time)
      this.anchorInfo = master
        ? { roomIdInput: params.roomIdInput.trim(), realRoomId: roomInit.room_id, uname: master.uname, face: master.face, liveStatus: roomInit.live_status }
        : null

      // 标题是档案的主标题来源；异步获取，不阻塞弹幕连接，失败时回看层回退到时间命名。
      const roomInfoEvidenceRevision = this.liveEvidenceRevision
      void this.runStage('room_info', () => getRoomInfo(roomInit.room_id, params.cookie), {
        optional: true,
        isSuccess: (value) => Boolean(value),
        failureData: { category: 'unavailable', summary: 'room title unavailable' },
      }).then((roomInfo) => {
        if (this.closedByUser) return;
        const title = roomInfo?.title?.trim();
        if (title) this.roomTitle = title;
        const coverUrl = roomInfo?.coverUrl?.trim();
        if (coverUrl) this.roomCoverUrl = coverUrl;
        if (!this.liveStartedAt && roomInfoEvidenceRevision === this.liveEvidenceRevision) this.liveStartedAt = roomInfo?.liveStartTime;
        const resolvedProfile = roomInfo?.roomGuardProfile;
        if (resolvedProfile && resolvedProfile.source !== 'unknown') {
          this.ctx!.roomGuardProfile = {
            ...resolvedProfile,
            roomId: roomInit.room_id,
            anchorUid: String(roomInit.uid),
          };
          this.recordRoomGuardProfile(this.ctx!.roomGuardProfile!)
        }
        const roomGuardProfile = this.ctx?.roomGuardProfile;
        if (!title && !this.roomCoverUrl && !this.liveStartedAt && !roomGuardProfile) return;
        this.cb.onState({
          status: this.isConnected ? 'connected' : 'connecting',
          roomId: roomInit.room_id,
          ...(title ? { title } : {}),
          ...(this.roomCoverUrl ? { coverUrl: this.roomCoverUrl } : {}),
          ...(this.liveStartedAt ? { liveStartedAt: this.liveStartedAt } : {}),
          ...(roomGuardProfile ? { roomGuardProfile } : {}),
        });
      }).catch(() => undefined)

      this.cb.onState({
        status: 'connecting',
        roomId: roomInit.room_id,
        shortId: roomInit.short_id || undefined,
        liveStatus: roomInit.live_status,
        ...(this.liveStartedAt ? { liveStartedAt: this.liveStartedAt } : {}),
        ...(this.roomCoverUrl ? { coverUrl: this.roomCoverUrl } : {}),
        // 主播信息拿不到时不带键，避免 undefined 覆盖 store 里垫底的已知主播身份
        ...(master ? { anchorName: master.uname, anchorFace: master.face } : {}),
        ...(this.roomTitle ? { title: this.roomTitle } : {}),
        ...(this.ctx?.roomGuardProfile ? { roomGuardProfile: this.ctx.roomGuardProfile } : {}),
        roomIdInput: params.roomIdInput.trim(),
        message: '正在获取弹幕凭证…',
      })

      // 3. getDanmuInfo（wbi 签名，风控核心步骤）
      const danmuInfo = await this.runStage('danmu_info', () => getDanmuInfo(roomInit.room_id, params.cookie, imgKey, subKey))
      if (!danmuInfo || this.closedByUser) return

      // 4. buvid（拿不到不阻断）
      const buvidResult = await this.runStage('buvid', () => getFinger(), {
        optional: true,
        isSuccess: (value) => value !== null,
        failureData: { category: 'unavailable', summary: 'buvid unavailable' },
      })
      if (this.closedByUser) return
      const buvid = buvidResult ?? null

      // 4.5 预加载礼物图标和官方独立特效资源；两者失败都不阻断弹幕连接。
      await Promise.all([
        this.runStage('gift_config', () => loadGiftConfig(roomInit.room_id, params.cookie), { optional: true }),
        this.runStage('gift_effect', () => loadGiftEffectResources(roomInit.room_id, params.cookie), { optional: true }),
      ])
      if (this.closedByUser) return

      // 5. WS
      this.cb.onState({ status: 'connecting', roomId: roomInit.room_id, liveStatus: roomInit.live_status, message: '正在连接弹幕服务器…' })
      const address = danmuInfo.host_list?.[0]
        ? `wss://${danmuInfo.host_list[0].host}:${danmuInfo.host_list[0].wss_port}/sub`
        : DEFAULT_WS_URL
      this.beginStage('websocket')
      try {
        this.openWs(roomInit.room_id, params.uid, danmuInfo.token, address, buvid, params.cookie)
      } catch (error) {
        this.settleStage('websocket', 'failure', diagnosticErrorDetails(error))
        throw error
      }
    } catch (e: unknown) {
      // 切换/断开期间被取消的异步连接不应把旧错误冒泡到当前 UI
      if (this.closedByUser) {
        this.cancelActiveStages()
        return
      }
      this.recordConnectionLifecycle('connection:failure', {
        durationMs: this.connectionStartedAt === null ? 0 : Math.max(0, Date.now() - this.connectionStartedAt),
        ...diagnosticErrorDetails(e),
      })
      this.connectionStartedAt = null
      // UI 给人话 + 错误码数字（便于用户上报排查）；技术细节保留在 e.message，供后续日志面板
      const message =
        e instanceof ApiError
          ? e.friendly
            ? e.code !== undefined ? `${e.friendly}（${e.code}）` : e.friendly
            : e.code !== undefined ? `接口异常（${e.code}）` : '接口异常'
          : e instanceof BiliTransportError || e instanceof TypeError
            ? '网络异常，请检查网络后重试'
            : e instanceof Error ? e.message : String(e)
      this.cb.onState({ status: 'error', message })
      throw e
    }
  }

  private beginStage(stage: ConnectionStage): void {
    const start = { outcome: 'start' as const }
    this.activeStages.set(stage, Date.now())
    this.recordConnectionLifecycle(`${stage}:${start.outcome}`)
  }

  private settleStage(stage: ConnectionStage, outcome: 'success' | 'failure' | 'cancelled', details: Record<string, unknown> = {}): void {
    const startedAt = this.activeStages.get(stage)
    if (startedAt === undefined) return
    this.activeStages.delete(stage)
    this.recordConnectionLifecycle(`${stage}:${outcome}`, {
      durationMs: Math.max(0, Date.now() - startedAt),
      ...details,
    })
  }

  private async runStage<T>(stage: ConnectionStage, operation: () => Promise<T>, options: StageOptions<T> = {}): Promise<T | undefined> {
    this.beginStage(stage)
    try {
      const value = await withNetworkRetry(operation, {
        onRetry: (attempt, error) => this.recordStageRetry(stage, attempt, error),
      })
      if (this.closedByUser) {
        const cancelled = { outcome: 'cancelled' as const }
        this.settleStage(stage, cancelled.outcome)
        return undefined
      }
      if (options.isSuccess && !options.isSuccess(value)) {
        const failure = { outcome: 'failure' as const }
        this.settleStage(stage, failure.outcome, options.failureData ?? { category: 'unavailable', summary: 'stage result unavailable' })
        return value
      }
      const success = { outcome: 'success' as const }
      this.settleStage(stage, success.outcome)
      return value
    } catch (error) {
      if (this.closedByUser) {
        const cancelled = { outcome: 'cancelled' as const }
        this.settleStage(stage, cancelled.outcome)
        return undefined
      }
      const failure = { outcome: 'failure' as const }
      this.settleStage(stage, failure.outcome, diagnosticErrorDetails(error))
      if (options.optional) return undefined
      throw error
    }
  }

  private markConnectionSuccess(phase: string): void {
    if (this.connectionStartedAt === null) return
    this.recordConnectionLifecycle('connection:success', {
      durationMs: Math.max(0, Date.now() - this.connectionStartedAt),
      phase,
    })
    this.connectionStartedAt = null
  }

  private cancelActiveStages(): void {
    for (const stage of [...this.activeStages.keys()]) this.settleStage(stage, 'cancelled')
    if (this.connectionStartedAt !== null) {
    this.recordConnectionLifecycle('connection:cancelled', {
        durationMs: Math.max(0, Date.now() - this.connectionStartedAt),
      })
      this.connectionStartedAt = null
    }
  }

  private recordStageRetry(stage: ConnectionStage, attempt: number, error: unknown): void {
    this.diagnosticContext.record({
      level: 'warn',
      subsystem: 'connection',
      action: stage,
      outcome: 'retry',
      connectionId: this.connectionId,
      roomId: this.ctx?.roomId,
      data: { attempt, ...diagnosticErrorDetails(error), ...(this.runtimeDiagnostic ?? {}) },
    })
  }

  private recordRoomGuardProfile(profile: RoomGuardProfile): void {
    const key = `${profile.roomId ?? ''}:${profile.anchorUid ?? ''}:${profile.anchorGuardAchieveLevel ?? ''}:${profile.guardCount ?? ''}:${profile.source}`
    if (this.reportedRoomGuardProfileKey === key) return
    this.reportedRoomGuardProfileKey = key
    this.diagnosticContext.record({
      level: 'info',
      subsystem: 'connection',
      action: 'room-guard-profile',
      outcome: 'observed',
      connectionId: this.connectionId,
      roomId: profile.roomId,
      data: {
        ...(profile.anchorGuardAchieveLevel === undefined ? {} : { anchorGuardAchieveLevel: profile.anchorGuardAchieveLevel }),
        ...(profile.guardCount === undefined ? {} : { guardCount: profile.guardCount }),
        source: profile.source,
        ...(this.runtimeDiagnostic ?? {}),
      },
    })
  }

  private recordConnectionLifecycle(kind: string, data?: Record<string, unknown>): void {
    const separator = kind.lastIndexOf(':')
    const outcome = separator > 0 ? kind.slice(separator + 1) : ''
    const isStage = STAGE_OUTCOMES.has(outcome)
    this.diagnosticContext.record({
      level: outcome === 'failure' ? 'error' : 'info',
      subsystem: 'connection',
      action: isStage ? kind.slice(0, separator) : 'lifecycle',
      outcome: isStage ? outcome : 'observed',
      connectionId: this.connectionId,
      roomId: this.ctx?.roomId,
      data: isStage
        ? { ...(data ?? {}), ...(this.runtimeDiagnostic ?? {}) }
        : { lifecycle: kind, ...(data ?? {}), ...(this.runtimeDiagnostic ?? {}) },
    })
    if (isStage) {
      const featureStage = outcome === 'start'
        ? 'request'
        : outcome === 'success'
          ? 'success'
          : outcome === 'failure'
            ? 'failure'
            : 'cancel'
      recordFeatureDiagnostic({
        featureId: 'scene',
        stage: featureStage,
        action: kind.slice(0, separator),
        outcome: outcome === 'start' ? 'started' : outcome,
        data: {
          ...(this.runtimeDiagnostic ?? {}),
          ...(typeof data?.category === 'string' ? { category: data.category } : {}),
          ...(typeof data?.phase === 'string' ? { phase: data.phase } : {}),
        },
      })
    }
  }

  private recordAdaptationDiagnostic(cmd: string, result: AdaptationDiagnosticResult, error?: unknown): void {
    if (result.outcome === 'accepted') return
    this.diagnosticContext.record({
      level: result.outcome === 'failure' ? 'error' : 'debug',
      subsystem: 'event',
      action: 'adaptation',
      outcome: result.outcome,
      connectionId: this.connectionId,
      roomId: this.ctx?.roomId,
      data: {
        cmd,
        reason: result.reason,
        eventCount: result.eventCount,
        ...(error === undefined ? {} : { errorType: error instanceof Error ? error.name : typeof error }),
        ...(this.runtimeDiagnostic ?? {}),
      },
    })
  }

  private openWs(roomId: number, uid: number, key: string, address: string, buvid: string | null, cookie: string) {
    this.closeInternal()

    const live = new KeepLiveWS(roomId, { address, key, uid, buvid: buvid || undefined })
    this.live = live
    this.attachTransportDiagnostics(live, roomId, address)

    this.recordConnectionLifecycle('connect', { roomId, uid, address, buvidPresent: buvid !== null })

    live.addEventListener('open', () => {
      if (this.closedByUser || this.live !== live) return
      this.attachTransportDiagnostics(live, roomId, address)
      this.settleStage('websocket', 'success', { phase: 'open' })
      this.markConnectionSuccess('open')
      this.recordConnectionLifecycle('open', { roomId })
      this.cb.onState({ status: 'connecting', roomId, message: '连接已建立，等待进入房间…' })
    })
    let reconnecting = false
    let reconnectGeneration = 0
    const publishConnected = () => {
      if (this.closedByUser || this.live !== live) return
      this.settleStage('websocket', 'success', { phase: 'live' })
      this.markConnectionSuccess('live')
      this.recordConnectionLifecycle('live', { roomId })
      this.cb.onState({
        status: 'connected',
        roomId,
        ...(this.anchorInfo
          ? { anchorName: this.anchorInfo.uname, anchorFace: this.anchorInfo.face, roomIdInput: this.anchorInfo.roomIdInput }
          : {}),
        ...(this.roomTitle ? { title: this.roomTitle } : {}),
        liveStatus: this.liveStatus,
        liveStartedAt: this.liveStartedAt,
        ...(this.roomCoverUrl ? { coverUrl: this.roomCoverUrl } : {}),
        ...(this.ctx?.roomGuardProfile ? { roomGuardProfile: this.ctx.roomGuardProfile } : {}),
        message: buvid ? undefined : '（无 buvid 连接）',
      })
    }
    live.addEventListener('live', () => {
      if (this.closedByUser || this.live !== live) return
      if (!reconnecting) {
        publishConnected()
        return
      }
      reconnecting = false
      const recoveryGeneration = reconnectGeneration
      const revision = this.liveEvidenceRevision
      void this.runStage('room_init', () => getRealRoomId(String(roomId), cookie)).then((room) => {
        if (this.closedByUser || this.live !== live || recoveryGeneration !== reconnectGeneration) return
        if (room && room.room_id === roomId && revision === this.liveEvidenceRevision) {
          const startedAt = normalizeLiveStartedAt(room.live_time)
          // 已确认下播后，相同开播时间的旧快照不能重新开启上一场。
          if (!(this.liveStatus === 0 && room.live_status === 1 && startedAt === this.liveStartedAt)) {
            this.liveStatus = room.live_status
            this.liveStartedAt = startedAt
            if (this.anchorInfo) this.anchorInfo.liveStatus = this.liveStatus
          }
        }
        if (!room && revision === this.liveEvidenceRevision) {
          // 连接已恢复但直播尚未确认，等待现有直播消息。
          this.cb.onState({ status: 'connected', roomId, liveStatus: undefined, liveStartedAt: undefined })
          return
        }
        publishConnected()
      }).catch(() => {
        if (this.closedByUser || this.live !== live || recoveryGeneration !== reconnectGeneration) return
        if (revision !== this.liveEvidenceRevision) publishConnected()
        else this.cb.onState({ status: 'connected', roomId, liveStatus: undefined, liveStartedAt: undefined })
      })
    })
    live.addEventListener('error', () => {
      if (this.live !== live) return
      // KeepLiveWS 内部自动重连；仅在用户主动关闭后到达才算终止
      if (this.closedByUser) {
        this.cb.onState({ status: 'closed', roomId })
      } else {
        reconnecting = true
        reconnectGeneration += 1
        this.recordWebsocketFailure('websocket error')
        this.recordConnectionLifecycle('reconnect', { roomId, reason: 'error' })
        this.cb.onState({ status: 'reconnecting', roomId, message: '连接出错，重连中…' })
      }
    })
    live.addEventListener('close', () => {
      if (this.live !== live) return
      if (this.closedByUser) {
        this.cb.onState({ status: 'closed', roomId })
      } else {
        reconnecting = true
        reconnectGeneration += 1
        this.recordWebsocketFailure('websocket closed')
        this.recordConnectionLifecycle('reconnect', { roomId, reason: 'close' })
        this.cb.onState({ status: 'reconnecting', roomId, message: '连接断开，重连中…' })
      }
    })

    // 裸事件总线 -> 统一模型
    live.addEventListener('msg', (e: any) => {
      if (this.closedByUser || this.live !== live || !this.ctx) return
      sourceDiagnosticLogger.record({
        cmd: String(e.data?.cmd ?? ''),
        data: e.data,
        roomId,
        connectionId: this.connectionId,
      }, this.diagnosticContext)
      recordArchiveSourceEvent(`source:${this.connectionId ?? 'unknown'}:${String(e.data?.cmd ?? 'unknown')}`)
      const laplaceUpdate = adaptLaplaceStateMessage(e.data)
      if (laplaceUpdate) this.cb.onLaplaceStateUpdate?.(laplaceUpdate)
      const activity = activityFactFromMessage(e.data, roomId)
      if (activity) this.cb.onActivityUpdate?.(activity)
      let adapted: ReturnType<typeof adapt> = null
      let adaptationError: unknown
      try {
        adapted = adapt(e.data, this.ctx)
      } catch (error) {
        adaptationError = error
      }
      const adaptationResult = classifyAdaptationResult(adapted, Boolean(laplaceUpdate), adaptationError)
      this.recordAdaptationDiagnostic(String(e.data?.cmd ?? ''), adaptationResult, adaptationError)
      if (adaptationError !== undefined) return
      for (const event of Array.isArray(adapted) ? adapted : adapted ? [adapted] : []) {
        if (event.msgType === MsgType.LiveStart) {
          this.liveEvidenceRevision += 1
          this.liveStatus = 1
          this.liveStartedAt = event.liveIdentity?.sourceLiveStartedAt
        } else if (event.msgType === MsgType.LiveEnd) {
          this.liveEvidenceRevision += 1
          this.liveStatus = 0
        }
        if (this.anchorInfo) this.anchorInfo.liveStatus = this.liveStatus
        if (event.msgType === MsgType.GuardBuy && event.user && !event.user.avatar) {
          const ctx = this.ctx;
          void completeGuardAvatar(event, ctx, async id => {
            try {
              const info = await getMasterInfo(id, cookie)
              this.recordConnectionLifecycle('guard-avatar', { outcome: info.face ? 'success' : 'missing', roomId })
              return info
            } catch (error) {
              this.recordConnectionLifecycle('guard-avatar', { outcome: 'failure', roomId, ...describeRequestFailure(error) })
              throw error
            }
          }).then(completed => {
            if (!this.closedByUser && this.live === live && this.ctx === ctx) this.cb.onEvent(completed)
          })
        } else {
          this.cb.onEvent(event)
        }
      }
    })
  }

  /**
   * KeepLiveWS 只向上转发 close/error，不保留原生 CloseEvent 的诊断字段。
   * 连接库公开了当前底层 LiveWS 和原生 WebSocket，因此在不改变连接行为的
   * 前提下补采集 code/reason/wasClean，便于区分服务端关闭与本地网络错误。
   */
  private attachTransportDiagnostics(live: KeepLiveWS, roomId: number, address: string): void {
    const transport = (live as KeepLiveWS & { connection?: { ws?: WebSocket } }).connection?.ws
    if (!transport || this.diagnosedTransports.has(transport)) return
    this.diagnosedTransports.add(transport)
    transport.addEventListener('close', (event) => {
      this.recordConnectionLifecycle('transport-close', {
        roomId,
        address,
        code: event.code,
        reason: event.reason || undefined,
        wasClean: event.wasClean,
        readyState: transport.readyState,
      })
    })
    transport.addEventListener('error', () => {
      this.recordConnectionLifecycle('transport-error', {
        roomId,
        address,
        readyState: transport.readyState,
      })
    })
  }

  private recordWebsocketFailure(summary: string): void {
    if (this.activeStages.has('websocket')) {
      this.settleStage('websocket', 'failure', { category: 'websocket', summary })
      return
    }
    this.recordConnectionLifecycle('websocket:failure', { durationMs: 0, category: 'websocket', summary })
  }

  /** 手动断开（不再重连） */
  disconnect(): void {
    this.closedByUser = true
    this.cancelActiveStages()
    this.closeInternal()
    this.recordConnectionLifecycle('disconnect', { roomId: this.ctx?.roomId })
    this.cb.onState({ status: 'closed', roomId: this.ctx?.roomId })
  }

  private closeInternal(): void {
    if (this.live) {
      const live = this.live
      this.live = null
      // 触发 close 事件由 closedByUser 标记走 closed 状态，这里不再重复 onState
      try { live.close() } catch { /* 忽略 */ }
    }
  }
}
