/**
 * B站 HTTP API 层（移植自 danmu_tool/webview_verify/src/main.js，已通过风控验证）
 *
 * 两个关键约束（详见 danmu_tool/webview-verify-result.md）：
 * 1. HEADERS 不含 accept-encoding —— plugin-http 的 reqwest 不自动解压，请求压缩会拿到二进制
 * 2. 插件已启用 unsafe-headers feature —— 否则 sec-fetch 系列及 origin、referer 被剥，B站 -352 风控拦截
 */
import { fetch } from '@tauri-apps/plugin-http'
import { md5 } from 'js-md5'
import type { RoomGuardProfile } from './types'
import { profileFromAchievementLevel } from './roomGuardProfile.ts'

const HEADERS: Record<string, string> = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
  'origin': 'https://live.bilibili.com',
  'referer': 'https://live.bilibili.com/',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-site',
  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'accept-language': 'zh-CN,zh;q=0.9',
}

/** 通用请求头副本（crossDomain 回跳等直接 fetch 的场景复用） */
export const BILI_HEADERS: Record<string, string> = { ...HEADERS }

// ============ wbi 签名 ============

const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29,
  28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25,
  54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
]

const getMixinKey = (raw: string) => MIXIN_KEY_ENC_TAB.map(n => raw[n]).join('').slice(0, 32)
export const keyFromUrl = (url: string) => url.slice(url.lastIndexOf('/') + 1, url.lastIndexOf('.'))

export function encWbi(params: Record<string, string>, imgKey: string, subKey: string, ts: number): string {
  const mixinKey = getMixinKey(imgKey + subKey)
  const signed = { ...params, wts: String(ts) }
  const charFilter = /[!'()*]/g
  const query = Object.keys(signed).sort().map(k => {
    const v = String((signed as Record<string, string>)[k]).replace(charFilter, '')
    return `${encodeURIComponent(k)}=${encodeURIComponent(v)}`
  }).join('&')
  const wRid = md5(query + mixinKey)
  return `${query}&w_rid=${wRid}`
}

// ============ 通用请求 ============

/** 常见业务错误码 -> 用户可读文案（未命中时回退技术信息） */
const API_ERROR_TEXT: Record<number, string> = {
  60004: '房间不存在，请检查房间号',
  [-352]: '请求被风控拦截，请稍后重试',
  [-412]: '请求被拦截，请稍后重试',
  [-101]: '登录已失效，请重新扫码登录',
  [-400]: '请求参数错误',
  [-1]: '接口暂不可用，请稍后重试',
}

const REQUEST_ERROR_DETAIL_LIMIT = 240
type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord | undefined {
  return typeof value === 'object' && value !== null ? value as UnknownRecord : undefined
}

function safeRequestErrorText(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  const text = String(value).trim()
  if (!text) return undefined
  return text.replace(/https?:\/\/[^\s)]+/gi, '[redacted-url]').slice(0, REQUEST_ERROR_DETAIL_LIMIT)
}

function requestErrorField(error: UnknownRecord | undefined, key: string): string | undefined {
  return safeRequestErrorText(error?.[key])
}

function requestEndpoint(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.host}${parsed.pathname}`
  } catch {
    return 'bili-api'
  }
}

export type RequestFailureCategory = 'network' | 'cancelled' | 'error'

export interface RequestFailureDetails {
  category: RequestFailureCategory
  summary: string
  errorName?: string
  errorCode?: string
  errorMessage?: string
  causeName?: string
  causeCode?: string
  causeMessage?: string
}

/** 从 WebView/Tauri HTTP 插件可能返回的 Error、对象或字符串中提取安全诊断字段。 */
export function describeRequestFailure(error: unknown): RequestFailureDetails {
  const source = error instanceof BiliTransportError ? error.originalError : error
  const record = asRecord(source)
  const causeRecord = asRecord(record?.cause)
  const errorName = requestErrorField(record, 'name')
  const errorCode = requestErrorField(record, 'code')
  const errorMessage = requestErrorField(record, 'message') ?? safeRequestErrorText(typeof source === 'string' ? source : undefined)
  const causeName = requestErrorField(causeRecord, 'name')
  const causeCode = requestErrorField(causeRecord, 'code')
  const causeMessage = requestErrorField(causeRecord, 'message') ?? safeRequestErrorText(typeof record?.cause === 'string' ? record.cause : undefined)
  const signal = [errorName, errorCode, errorMessage, causeName, causeCode, causeMessage].filter(Boolean).join(' ').toLowerCase()
  const category: RequestFailureCategory = /abort/.test(signal)
    ? 'cancelled'
    : /econnreset|etimedout|enotfound|eai_again|econnrefused|err_network|error sending request|network request|fetch failed|failed to fetch|dns|timed out|timeout|tls|connection reset|connection refused|proxy/.test(signal)
      ? 'network'
      : 'error'
  return {
    category,
    summary: category === 'cancelled' ? 'operation cancelled' : category === 'network' ? 'network request failed' : 'unexpected error',
    ...(errorName ? { errorName } : {}),
    ...(errorCode ? { errorCode } : {}),
    ...(errorMessage ? { errorMessage } : {}),
    ...(causeName ? { causeName } : {}),
    ...(causeCode ? { causeCode } : {}),
    ...(causeMessage ? { causeMessage } : {}),
  }
}

export class BiliTransportError extends Error {
  readonly endpoint: string
  readonly originalError: unknown

  constructor(url: string, originalError: unknown) {
    super('网络异常，请检查网络或代理后重试')
    this.name = 'BiliTransportError'
    this.endpoint = requestEndpoint(url)
    this.originalError = originalError
  }
}

export function isRetryableRequestFailure(error: unknown): boolean {
  return describeRequestFailure(error).category === 'network'
}

export interface NetworkRetryOptions {
  maxRetries?: number
  delayMs?: number
  onRetry?: (attempt: number, error: unknown) => void
  sleep?: (delayMs: number) => Promise<void>
}

/** 对幂等网络请求提供一次有界重试；业务错误和取消不会重试。 */
export async function withNetworkRetry<T>(operation: () => Promise<T>, options: NetworkRetryOptions = {}): Promise<T> {
  const maxRetries = Math.max(0, Math.floor(options.maxRetries ?? 1))
  const delayMs = Math.max(0, options.delayMs ?? 300)
  let retries = 0
  while (true) {
    try {
      return await operation()
    } catch (error) {
      if (retries >= maxRetries || !isRetryableRequestFailure(error)) throw error
      retries += 1
      options.onRetry?.(retries, error)
      if (delayMs > 0) await (options.sleep ?? ((delay: number) => new Promise<void>((resolve) => setTimeout(resolve, delay))))(delayMs)
    }
  }
}

export class ApiError extends Error {
  /** 用户可读文案；未识别的错误码时为 undefined（UI 回退到 message） */
  friendly?: string
  constructor(message: string, public code?: number, public body?: unknown) {
    super(message)
    if (code !== undefined && API_ERROR_TEXT[code]) this.friendly = API_ERROR_TEXT[code]
  }
}

export async function biliGet<T = any>(url: string, cookie?: string, signal?: AbortSignal): Promise<T> {
  const headers: Record<string, string> = { ...HEADERS }
  if (cookie) headers['Cookie'] = cookie
  let resp: Response
  try {
    resp = await fetch(url, { headers, signal })
  } catch (error) {
    throw new BiliTransportError(url, error)
  }
  const data = await resp.json().catch(() => {
    const e = new ApiError(`响应非 JSON（HTTP ${resp.status}）：${url}`, resp.status)
    e.friendly = resp.status === 403 || resp.status === 412 ? '请求被拦截，请稍后重试' : '服务响应异常，请稍后重试'
    throw e
  })
  if (data.code !== 0) throw new ApiError(`接口失败 code=${data.code}：${url}`, data.code, data)
  return data.data as T
}

// ============ 各 API ============

export interface NavData {
  isLogin: boolean
  mid: number
  uname: string
  face: string
  wbi_img: { img_url: string; sub_url: string }
}

/** 登录态 + wbi 密钥 */
export const getNav = (cookie: string) => biliGet<NavData>('https://api.bilibili.com/x/web-interface/nav', cookie)

export interface RoomInitData {
  room_id: number       // 真实房间号
  short_id: number
  uid: number           // 主播 UID
  live_status: 0 | 1 | 2
  /** 当前直播开播时间，Unix 秒；未开播或接口未提供时可能缺失。 */
  live_time?: number
  locked?: boolean
  encrypted?: boolean
}

/** 官方批量房间信息；live_time 使用北京时间。 */
export async function getRoomBaseInfo(roomIds: readonly (string | number)[], cookie?: string): Promise<RoomInitData[]> {
  if (!roomIds.length) return []
  const query = new URLSearchParams({ req_biz: 'web_room_componet' })
  for (const id of new Set(roomIds.map(String))) query.append('room_ids', id)
  const data = await biliGet<{ by_room_ids: Record<string, {
    room_id: number; short_id?: number; uid: number; live_status: 0 | 1 | 2;
    live_time?: string | number; locked?: boolean; encrypted?: boolean;
  }> }>(`https://api.live.bilibili.com/xlive/web-room/v1/index/getRoomBaseInfo?${query}`, cookie)
  return Object.values(data.by_room_ids).map(room => {
    const time = typeof room.live_time === 'number' ? room.live_time
      : room.live_time ? Date.parse(room.live_time.replace(' ', 'T') + '+08:00') / 1000 : undefined
    return { room_id: room.room_id, short_id: room.short_id ?? 0, uid: room.uid, live_status: room.live_status,
      live_time: time !== undefined && Number.isFinite(time) && time > 0 ? time : undefined,
      ...(room.locked === undefined ? {} : { locked: room.locked }),
      ...(room.encrypted === undefined ? {} : { encrypted: room.encrypted }) }
  })
}

let roomInitBlockedUntil = 0
/** 短号 -> 真实房间号 + 主播 UID */
export async function getRealRoomId(shortId: string | number, cookie?: string): Promise<RoomInitData> {
  if (Date.now() >= roomInitBlockedUntil) {
    try {
      return await biliGet<RoomInitData>(`https://api.live.bilibili.com/room/v1/Room/room_init?id=${shortId}`, cookie)
    } catch (error) {
      if (!(error instanceof ApiError) || error.code !== 412) throw error
      roomInitBlockedUntil = Date.now() + 5 * 60_000
    }
  }
  const rooms = await getRoomBaseInfo([shortId], cookie)
  const room = rooms.find(value => value.room_id === Number(shortId) || value.short_id === Number(shortId))
  if (!room) throw new ApiError('房间不存在，请检查房间号', 60004)
  return room
}

export interface DanmuInfoData {
  token: string
  host_list: { host: string; wss_port: number; ws_port: number }[]
}

/** 弹幕 WS token（wbi 签名，风控核心步骤） */
export async function getDanmuInfo(roomId: number, cookie: string, imgKey: string, subKey: string): Promise<DanmuInfoData> {
  const ts = Math.floor(Date.now() / 1000)
  const signed = encWbi({ id: String(roomId), type: '0' }, imgKey, subKey, ts)
  // 此接口携带 DedeUserID 会触发 -352；保留 SESSDATA 等登录凭据，仅调整本次请求。
  const requestCookie = cookie.split(';').filter(part => part.trim().split('=')[0] !== 'DedeUserID').join(';')
  return biliGet<DanmuInfoData>(`https://api.live.bilibili.com/xlive/web-room/v1/index/getDanmuInfo?${signed}`, requestCookie)
}

/** buvid3（风控指纹） */
export async function getFinger(): Promise<string | null> {
  try {
    const data = await biliGet<{ b_3: string }>('https://api.bilibili.com/x/frontend/finger/spi')
    return data?.b_3 || null
  } catch {
    return null // 拿不到不阻断连接（验证结论：无 buvid 也能连）
  }
}

/** 房间标题等信息（连接时取一次初始标题）；B站当前主要返回 data.room_info.title，兼容旧顶层 title。 */
export interface RoomInfoData {
  title?: string | null
  uname?: string | null
  room_info?: {
    title?: string | null
    user_cover?: string | null
    cover?: string | null
    live_start_time?: number | null
    room_id?: number
    uid?: number
  }
  guard_info?: { count?: number; anchor_guard_achieve_level?: number | null }
  roomGuardProfile?: RoomGuardProfile
}

export const getRoomInfo = (realRoomId: number, cookie?: string) =>
  biliGet<RoomInfoData>(`https://api.live.bilibili.com/xlive/web-room/v1/index/getInfoByRoom?room_id=${realRoomId}`, cookie)
    .then((data) => ({
    ...data,
    title: data.room_info?.title?.trim() || data.title?.trim() || "",
    coverUrl: data.room_info?.user_cover?.trim() || data.room_info?.cover?.trim() || undefined,
    liveStartTime: data.room_info?.live_start_time && data.room_info.live_start_time > 0
      ? data.room_info.live_start_time * 1000
      : undefined,
    roomGuardProfile: profileFromAchievementLevel(
      data.guard_info?.anchor_guard_achieve_level,
      'room-info',
      data.guard_info?.count,
    ),
  }))

export interface MasterInfoData {
  uname: string
  face: string
}

/** 主播信息（名字+头像，room_init 拿 uid 后调用） */
export const getMasterInfo = (uid: number, cookie?: string) =>
  biliGet<{ info: { uname: string; face: string } }>(`https://api.live.bilibili.com/live_user/v1/Master/info?uid=${uid}`, cookie)
    .then(d => ({ uname: d.info.uname, face: d.info.face }))

export interface GiftConfigItem {
  id: number
  name: string
  img_basic?: string
  webp?: string
  gif?: string
  effect?: number
  effect_id?: number
  has_imaged_gift?: number
}

/** 全量礼物配置（约 900+ 条，含图标 URL）。无需登录，用途：盲盒本体图标等报文不带图的场景 */
export const getGiftConfig = (roomId: number, cookie?: string) =>
  biliGet<{ list: GiftConfigItem[] }>(`https://api.live.bilibili.com/xlive/web-room/v1/giftPanel/giftConfig?platform=pc&room_id=${roomId}`, cookie)

export interface GiftEffectConfigItem {
  id?: number | string
  bind_gift_ids?: Array<number | string> | number | string
  plan_platform?: Array<number | string> | number | string
  web_mp4?: string
  web_mp4_json?: string
}

export interface GiftEffectConfigData {
  full_sc_resource?: {
    base_version?: number | string
    ttl?: number | string
    conf_list?: GiftEffectConfigItem[]
  }
}

/** 官方 Web 礼物特效资源索引（VAP 透明 MP4 + 配置 JSON）。 */
export const getGiftEffectConfig = (roomId: number, cookie?: string) =>
  biliGet<GiftEffectConfigData>(
    `https://api.live.bilibili.com/xlive/general-interface/v1/fullScSpecialEffect/GetEffectConfListV2?platform=pc&room_id=${roomId}`,
    cookie,
  )

// ============ 扫码登录 API（流程编排在 login.ts） ============

export interface QrGenerateData {
  url: string          // 二维码内容
  qrcode_key: string
}

export const qrGenerate = () =>
  biliGet<QrGenerateData>('https://passport.bilibili.com/x/passport-login/web/qrcode/generate?source=main-fe-header')

export interface QrPollData {
  code: number        // 0 成功 86038 过期 86090 待确认 86101 待扫码
  url?: string        // crossDomain 回跳地址（set-cookie fallback 用）
  refresh_token?: string
}

/** poll 响应需读 set-cookie，故不走 biliGet */
export async function qrPoll(qrcodeKey: string): Promise<{ poll: QrPollData; setCookies: string[] }> {
  const resp = await fetch(
    `https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=${qrcodeKey}&source=main-fe-header`,
    { headers: HEADERS },
  )
  const json = await resp.json()
  return { poll: json.data ?? { code: json.code }, setCookies: getSetCookies(resp) }
}

// ============ set-cookie 解析 ============

const SESSION_COOKIE_KEYS = ['SESSDATA', 'bili_jct', 'DedeUserID', 'DedeUserID__ckMd5']

export function parseCookiesFromSetCookie(setCookieArr: string[]): Record<string, string> {
  const cookies: Record<string, string> = {}
  for (const line of setCookieArr) {
    if (!line) continue
    const pair = line.split(';')[0]
    const eq = pair.indexOf('=')
    if (eq === -1) continue
    const k = pair.slice(0, eq).trim()
    const v = pair.slice(eq + 1).trim()
    if (SESSION_COOKIE_KEYS.includes(k)) cookies[k] = decodeURIComponent(v)
  }
  return cookies
}

export const cookieStrFromSetCookie = (arr: string[]) => arr.filter(Boolean).map(c => c.split(';')[0]).join('; ')

/** plugin-http 的 Headers 可能没有 getSetCookie，做多级 fallback */
function getSetCookies(resp: any): string[] {
  if (typeof resp.headers?.getSetCookie === 'function') return resp.headers.getSetCookie()
  const sc = resp.headers?.get?.('set-cookie')
  if (!sc) return []
  // 多条 set-cookie 被 join 时按 ", key=" 边界粗略切分
  return sc.split(/,(?=\s*[^ ;,]+=[^;]+)/g)
}
