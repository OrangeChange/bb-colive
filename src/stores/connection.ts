import { uiText } from "../i18n/index.ts";
import { assignEventRenderKey } from "../events/eventIdentity.ts";
import { emit } from '@tauri-apps/api/event';
import { activityStore, ACTIVITY_UPDATE_EVENT } from '../events/activityStore';
import { publishGiftActivity } from '../windows/giftBridge';
import { isStatisticsEvent } from "../events/eventView.ts";
import { SharedRoomConnection } from "../obs/sharedRoomConnection.ts";
/**
 * 弹幕连接编排：DanmuConnection 实例 + 事件缓冲
 *
 * 渲染策略（ui-design §四）：数值类事件（看过/高能榜/点赞/粉丝）不进列表，
 * 聚合到 stats 供连接条显示；列表事件 50ms 批量刷给 React，现场记录按真实房间号
 * 分别保留，列表组件负责虚拟滚动。
 */
import { create } from "zustand";
import {
  MsgType,
  getRoomBaseInfo,
  ApiError,
  loadAnchors,
  upsertAnchor,
  updateAnchorStatuses,
  removeAnchor as removeAnchorFromStore,
  type Anchor,
  type ConnState,
  type ConnectionRuntimeDiagnostic,
  type DanmakuEvent,
  type StatsInfo,
} from "../protocol";
import { getEventId } from "../protocol/adapter";
import { guardIdentityIconsFromEvents, mergeObservedGuardIdentityIcons } from "../protocol/guardIdentityIcons";
import { applyRoomGuardProfileToEvents } from "../protocol/roomGuardProfile";
import { updateDisplayRoomGuardProfile } from "../windows/displayBridge";
import { updateGiftRoomGuardProfile } from "../windows/giftBridge";
import {
  getDiagnosticContext,
  recordDiagnosticContext,
} from "../diagnostics/diagnosticLogger";
import { useSession } from "./session";
import {
  getLiveSession,
  getLiveDedupeKeys,
  putLiveSession,
  type LiveSession,
  type LiveSessions,
} from "./liveSession";
import { keepSameRoomGuardProfile, toClosedState } from "./connectionState";
import { createLiveEventDelivery } from "../runtime/liveEventDelivery.ts";
import {
  DISPLAY_EVENT_REGION,
  EVENT_WINDOW_DELIVERY_FAILURE_REASON,
  GIFT_EVENT_REGION,
  MAIN_EVENT_REGION,
  type EventWindowPublishResult,
} from "../windows/eventWindowChannels";
import { mergeGiftInto } from "../events/giftMerge";
import type { ArchiveEventBatch } from "../archive/archiveWriter.ts";
import {
  initializeArchiveRuntime, getArchiveRepository, getArchiveWriter,
  syncArchiveWriterStatus, scheduleArchiveWriterFlushAndNotify,
  flushArchiveWriter,
} from "../archive/archiveRuntime.ts";
import { routeAcceptedEvents } from "../archive/archiveEventMutations.ts";
import { recordArchiveProjection } from "../archive/archiveDiagnostics.ts";
import {
  ensureLiveArchiveSession,
  addArchivePaidMutations,
  markArchiveLiveEnd,
  markArchiveLiveStart,
  markArchiveUnclean,
  updateArchiveLiveCover,
  updateArchiveLiveTitle,
  toArchiveSessionInput,
  restoreLiveArchiveSession,
  shouldCaptureArchiveEvent,
  shouldReuseArchiveOnLiveStart,
  type LiveArchiveSession,
} from "./liveSession";
import { claimConnectionRuntime, type ConnectionRuntime } from "../archive/connectionRuntime.ts";

const FLUSH_MS = 50;

type EventDecisionReason =
  | "adapted"
  | "new-id"
  | "duplicate-id"
  | "gift-new"
  | "gift-merged"
  | "gift-already-finalized"
  | "combo-source-seen"
  | "sc-delete"
  | "stats-only"
  | "event-and-stats"
  | "main-appended"
  | "window-delivered"
  | "window-not-ready"
  | typeof EVENT_WINDOW_DELIVERY_FAILURE_REASON;

interface EventDecisionInput {
  eventId: string;
  phase: string;
  outcome: string;
  reason?: EventDecisionReason;
  msgType?: MsgType;
  region?: string;
}

let connectionRuntime: ConnectionRuntime | null = null;

function runtimeDiagnosticData(): ConnectionRuntimeDiagnostic | undefined {
  if (!connectionRuntime) return undefined;
  return {
    runtimeId: connectionRuntime.runtimeId,
    generation: connectionRuntime.generation,
  };
}

const EVENT_DECISION_REASONS = new Set<EventDecisionReason>([
  "adapted",
  "new-id",
  "duplicate-id",
  "gift-new",
  "gift-merged",
  "gift-already-finalized",
  "combo-source-seen",
  "sc-delete",
  "stats-only",
  "event-and-stats",
  "main-appended",
  "window-delivered",
  "window-not-ready",
  EVENT_WINDOW_DELIVERY_FAILURE_REASON,
]);

/** 事件链统一诊断入口；只写固定元数据，诊断失败不得影响事件业务。 */
export function recordEventDecision(input: EventDecisionInput, roomId?: number): void {
  try {
    const context = getDiagnosticContext();
    const reason = input.reason && EVENT_DECISION_REASONS.has(input.reason) ? input.reason : undefined;
    recordDiagnosticContext(context, {
      level: "debug",
      subsystem: "event",
      action: input.phase,
      outcome: input.outcome,
      connectionId: conn?.diagnosticConnectionId,
      roomId: roomId ?? useConnection.getState().state.roomId,
      eventId: input.eventId,
      data: {
        ...runtimeDiagnosticData(),
        ...(reason === undefined ? {} : { reason }),
        ...(input.msgType === undefined ? {} : { msgType: input.msgType }),
        ...(input.region === undefined ? {} : { region: input.region }),
      },
    });
  } catch {
    // 诊断记录失败不能阻断弹幕事件处理。
  }
}

function recordWindowPublish(
  event: DanmakuEvent,
  phase: "display-window" | "gift-window",
  region: string,
  result: EventWindowPublishResult,
): void {
  if (result === "not-applicable") return;
  recordEventDecision({
    eventId: getEventId(event),
    phase,
    outcome: result,
    reason: result === "delivered" ? "window-delivered" : "window-not-ready",
    msgType: event.msgType,
    region,
  }, event.roomId);
}

const eventDelivery = createLiveEventDelivery((event, region, result) => {
  recordWindowPublish(event, region === "display" ? "display-window" : "gift-window",
    region === "display" ? DISPLAY_EVENT_REGION : GIFT_EVENT_REGION, result);
});

interface ConnectionState {
  state: ConnState;
  events: DanmakuEvent[];
  /** 当前房间已从原始事件中观测到的用户大航海图标 URL。 */
  guardIconUrlsByUid: ReadonlyMap<string, string>;
  stats: StatsInfo;
  /** 本次连接累计进列表的事件数（状态栏"今日事件"） */
  listCount: number;
  /** 软件运行期间按真实房间号保存的现场会话；不持久化，重启后由历史功能接管。 */
  sessions: LiveSessions;

  /** 主播列表（连接即添加的最近历史，持久化） */
  anchors: Anchor[];
  /** 从持久化恢复主播列表（应用启动时调一次），随后后台刷新开播状态 */
  initAnchors: () => Promise<void>;
  /** 懒刷新全部主播开播状态（启动/展开菜单时调；内部 60s 节流 + 并发去重） */
  refreshAnchors: () => void;
  /** 删除列表项（只移除，不影响当前连接） */
  removeAnchor: (realRoomId: number) => Promise<void>;
  connect: (roomIdInput: string, cookie: string, uid: string) => void;
  disconnect: (reason?: "manual-disconnect" | "app-exit") => void;
}

let conn: SharedRoomConnection | null = null;
interface PendingArchiveEvent {
  event: DanmakuEvent;
  liveStatusBefore: ConnState["liveStatus"];
}

let pendingEvents: PendingArchiveEvent[] = [];
let pendingStats: StatsInfo = {};
interface PendingStatsDecision {
  eventId: string;
  roomId: number;
  msgType: MsgType;
  listed: boolean;
}
let pendingStatsDecisions: PendingStatsDecision[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
/** 已进列表的事件去重键（SC 登录态会重复下发同 id，adapter 注释）。
 *  Map 按插入序 FIFO 淘汰；只在建立新连接时清空，避免切换房间继承旧房间的去重状态。
 *  弹幕 dedupe 已包含原始消息时间，用户后来重发相同内容会进入新键，不会被永久误删。 */
const SEEN_MAX = 20_000;
const seenIds = new Map<string, 1>();
/** 本次连接已收到过来源 SEND_GIFT 的 combo_id。
 *  若原礼物行已经不在当前会话中，用此防止最终 COMBO_SEND 重新制造重复行。 */
const seenComboSources = new Set<string>();
/** reactKey 冲突时加的序号 */
let renderKeySequence = 0;


let archiveSessionSeq = 0;
const archiveRecoveryPromises = new Map<string, Promise<void>>();
const archiveRecoveryCompleted = new Set<string>();




function archiveRecoveryKey(roomId: number, sourceLiveStartedAt: number): string {
  return `${roomId}:${sourceLiveStartedAt}`;
}

/**
 * 应用重启后内存没有旧 archive；在第一次归档写入前按平台开播身份恢复它。
 * 查询失败时只结束恢复尝试，调用方会沿用创建新场次的现有降级路径。
 */
function scheduleArchiveSessionRecovery(roomId: number, sourceLiveStartedAt: number): Promise<void> | null {
  if (!Number.isFinite(roomId) || !Number.isFinite(sourceLiveStartedAt) || sourceLiveStartedAt <= 0) return null;
  const state = useConnection.getState();
  if (state.state.roomId !== roomId || state.state.liveStatus !== 1 || state.state.status !== "connected") return null;
  const live = getLiveSession(state.sessions, roomId);
  if (live.archive) {
    if (live.archive.status === "ended" && live.archive.sourceLiveStartedAt === sourceLiveStartedAt) return null;
    const restored = ensureLiveArchiveSession(live.archive, {
      roomId, ownerId: live.archive.ownerId, now: Date.now(), sourceLiveStartedAt,
      title: state.state.title, coverUrl: state.state.coverUrl,
    });
    if (restored.sessionId === live.archive.sessionId) {
      if (restored !== live.archive) {
        useConnection.setState({ sessions: putLiveSession(state.sessions, roomId, { ...live, archive: restored }) });
        enqueueArchiveLifecycle(restored, state.state.anchorName, state.state.anchorFace);
      }
      return null;
    }
    enqueueArchiveLifecycle(markArchiveUnclean(live.archive, "live-identity-changed"));
    useConnection.setState({ sessions: putLiveSession(state.sessions, roomId, { ...live, archive: undefined }) });
  }
  if (archiveRecoveryCompleted.has(archiveRecoveryKey(roomId, sourceLiveStartedAt))) return null;
  const key = archiveRecoveryKey(roomId, sourceLiveStartedAt);
  const existing = archiveRecoveryPromises.get(key);
  if (existing) return existing;
  const recoveryGeneration = connectionGeneration;

  const recovery = getArchiveRepository()
    .then(async (repository) => {
      const persisted = await getArchiveWriter().runTransferExclusive(async () => {
        const summary = await repository.findResumableSession(roomId, sourceLiveStartedAt);
        if (!summary) return null;
        const nextOrdinal = await repository.getNextEventOrdinal(summary.sessionId);
        return { summary, nextOrdinal };
      });
      if (!persisted) return;
      const { summary, nextOrdinal } = persisted;
      const current = useConnection.getState();
      const currentLive = getLiveSession(current.sessions, roomId);
      if (recoveryGeneration !== connectionGeneration
        || current.state.status !== "connected"
        || current.state.roomId !== roomId
        || current.state.liveStartedAt !== sourceLiveStartedAt
        || current.state.liveStatus !== 1
        || !connectionRuntime?.isCurrent()
        || currentLive.archive) return;
      const restored = restoreLiveArchiveSession(summary, Date.now(), nextOrdinal);
      useConnection.setState({
        sessions: putLiveSession(current.sessions, roomId, { ...currentLive, archive: restored }),
      });
      enqueueArchiveLifecycle(restored, current.state.anchorName, current.state.anchorFace);
    })
    .catch(() => undefined)
    .finally(() => {
      if (archiveRecoveryPromises.get(key) === recovery) archiveRecoveryPromises.delete(key);
      const current = useConnection.getState().state;
      if (recoveryGeneration === connectionGeneration && connectionRuntime?.isCurrent()
        && current.status === "connected" && current.roomId === roomId
        && current.liveStatus === 1 && current.liveStartedAt === sourceLiveStartedAt) {
        archiveRecoveryCompleted.add(key);
        if (pendingEvents.length > 0) flush();
      }
    });
  archiveRecoveryPromises.set(key, recovery);
  return recovery;
}



function makeArchiveOwner(roomId: number, name?: string | null, avatarUrl?: string | null) {
  return {
    ownerId: `room:${roomId}`,
    roomId,
    uid: null,
    name: name ?? null,
    avatarUrl: avatarUrl ?? null,
    updatedAt: Date.now(),
  };
}

function nextArchiveIds(roomId: number, now: number): { archiveId: string; sessionId: string } {
  archiveSessionSeq += 1;
  const suffix = `${now}-${archiveSessionSeq}`;
  return {
    archiveId: `archive-${roomId}-${suffix}`,
    sessionId: `session-${roomId}-${suffix}`,
  };
}

function enqueueArchiveLifecycle(archive: LiveArchiveSession, name?: string | null, avatarUrl?: string | null): void {
  const writer = getArchiveWriter();
  const batch: ArchiveEventBatch = {
    archiveId: archive.archiveId,
    sessionId: archive.sessionId,
    roomId: archive.roomId,
    owner: makeArchiveOwner(archive.roomId, name, avatarUrl),
    session: toArchiveSessionInput(archive, Date.now()),
    mutations: [],
  };
  writer.enqueueBatch(batch);
  syncArchiveWriterStatus(writer);
  scheduleArchiveWriterFlushAndNotify(writer);
}

function updateLiveArchiveSession(
  roomId: number,
  update: (archive: LiveArchiveSession) => LiveArchiveSession,
): LiveArchiveSession | undefined {
  const state = useConnection.getState();
  const live = getLiveSession(state.sessions, roomId);
  if (!live.archive) return undefined;
  const archive = update(live.archive);
  if (archive === live.archive) return archive;
  useConnection.setState({ sessions: putLiveSession(state.sessions, roomId, { ...live, archive }) });
  return archive;
}

function ensureArchiveSessionForAcceptedEvent(
  roomId: number,
  details: {
    name?: string | null
    avatarUrl?: string | null
    title?: string | null
    coverUrl?: string | null
    sourceLiveStartedAt?: number | null
  },
): LiveArchiveSession {
  const state = useConnection.getState();
  const live = getLiveSession(state.sessions, roomId);
  const now = Date.now();
  const archive = ensureLiveArchiveSession(live.archive, {
    roomId,
    ownerId: `room:${roomId}`,
    title: details.title,
    coverUrl: details.coverUrl ?? state.state.coverUrl,
    sourceLiveStartedAt: details.sourceLiveStartedAt ?? state.state.liveStartedAt,
    now,
    ...(live.archive ? {} : nextArchiveIds(roomId, now)),
  });
  if (archive.sessionId !== live.archive?.sessionId && live.archive && live.archive.status !== "ended") {
    const interrupted = markArchiveUnclean(live.archive, "live-identity-changed");
    enqueueArchiveLifecycle(interrupted, details.name, details.avatarUrl);
  }
  if (archive !== live.archive) {
    useConnection.setState({
      sessions: putLiveSession(state.sessions, roomId, { ...live, archive }),
    });
    enqueueArchiveLifecycle(archive, details.name, details.avatarUrl);
  }
  return archive;
}

function currentArchiveSession(roomId?: number): LiveArchiveSession | undefined {
  if (roomId == null) return undefined;
  return getLiveSession(useConnection.getState().sessions, roomId).archive;
}

function markCurrentArchiveUnclean(reason: string, recordingStatus: "stopped" | "reconnecting" = "stopped"): void {
  const roomId = useConnection.getState().state.roomId;
  if (roomId == null) return;
  const archive = updateLiveArchiveSession(roomId, (current) => markArchiveUnclean(current, reason, recordingStatus));
  if (archive) {
    enqueueArchiveLifecycle(archive);
  }
}

/** 把恢复的房间历史重新装入去重表，避免重连时服务器重推近期事件。 */
function seedSeenIds(events: DanmakuEvent[]): void {
  for (const key of getLiveDedupeKeys(events)) {
    if (seenIds.has(key)) continue;
    seenIds.set(key, 1);
    if (seenIds.size > SEEN_MAX) {
      const oldest = seenIds.keys().next().value as string | undefined;
      if (oldest !== undefined) seenIds.delete(oldest);
    }
  }
}

/** 连接代次：旧连接的异步解析、WS 回调不能再改写当前连接的状态或事件。 */
let connectionGeneration = 0;

/** 主播开播状态刷新节流：展开菜单间隔小于此值用缓存（内存态，重启即归零 → 启动必刷） */
const ANCHOR_REFRESH_INTERVAL_MS = 60_000;
let lastAnchorRefreshAt = 0;
let anchorRefreshBlockedUntil = 0;
let anchorRefreshing = false;

function recordAnchorWriteFailure(error: unknown): void {
  recordDiagnosticContext(getDiagnosticContext(), {
    level: "error",
    subsystem: "connection",
    action: "anchor-list-save",
    outcome: "failed",
    data: { message: error instanceof Error ? error.message : String(error) },
  });
}

/** 当前房间开播/下播：实时同步 anchors 里该主播的开播状态并持久化（LIVE 事件驱动，零请求） */
function syncAnchorLive(liveStatus: 0 | 1): void {
  const { state, anchors } = useConnection.getState();
  const roomId = state.roomId;
  if (roomId == null || !anchors.some((a) => a.realRoomId === roomId)) return;
  const updated = anchors.map((a) => (a.realRoomId === roomId ? { ...a, liveStatus } : a));
  useConnection.setState({ anchors: updated });
  void updateAnchorStatuses([{realRoomId:roomId,liveStatus}]).catch(recordAnchorWriteFailure);
}

const flush = () => {
  if (!connectionRuntime?.isCurrent()) return;
  if (pendingEvents.length === 0 && Object.keys(pendingStats).length === 0 && pendingStatsDecisions.length === 0) return;
  const recoveryState = useConnection.getState();
  const recoveryRoomId = recoveryState.state.roomId;
  const recoveryLiveStartedAt = recoveryState.state.liveStartedAt;
  if (recoveryRoomId != null && recoveryLiveStartedAt && !currentArchiveSession(recoveryRoomId)) {
    const recovery = scheduleArchiveSessionRecovery(recoveryRoomId, recoveryLiveStartedAt);
    if (recovery) return;
  }
  const events: DanmakuEvent[] = [];
  const liveStatusesBefore: ConnState["liveStatus"][] = [];
  for (const pending of pendingEvents) {
    const ev = pending.event;
    const key = ev.dedupe ?? ev.id;
    if (seenIds.has(key)) {
      recordEventDecision({
        eventId: getEventId(ev),
        phase: "dedupe",
        outcome: "discarded",
        reason: "duplicate-id",
        msgType: ev.msgType,
      }, ev.roomId);
      continue;
    }
    seenIds.set(key, 1);
    // FIFO 淘汰最旧一批（Map 按插入序），防无限增长
    if (seenIds.size > SEEN_MAX) {
      let drop = seenIds.size - SEEN_MAX;
      for (const k of seenIds.keys()) {
        seenIds.delete(k);
        if (--drop <= 0) break;
      }
    }
    events.push(ev);
    liveStatusesBefore.push(pending.liveStatusBefore);
    recordEventDecision({
      eventId: getEventId(ev),
      phase: "dedupe",
      outcome: "accepted",
      reason: "new-id",
      msgType: ev.msgType,
    }, ev.roomId);
  }
  const stats = pendingStats;
  const statsDecisions = pendingStatsDecisions;
  pendingEvents = [];
  pendingStats = {};
  pendingStatsDecisions = [];
  for (const decision of statsDecisions) {
    recordEventDecision({
      eventId: decision.eventId,
      phase: "stats",
      outcome: "aggregated",
      reason: decision.listed ? "event-and-stats" : "stats-only",
      msgType: decision.msgType,
      region: MAIN_EVENT_REGION,
    }, decision.roomId);
  }
  if (events.length === 0 && Object.keys(stats).length === 0) return;
  let routingState = useConnection.getState();
  for (const event of events) if ((event.msgType === MsgType.AnchorLotStart || event.msgType === MsgType.GuardHonor) && !event.broadcaster) {
    const anchor = routingState.anchors.find(item=>item.realRoomId === event.roomId);
    const sameRoom = routingState.state.roomId === event.roomId;
    const avatar = anchor?.face ?? (sameRoom ? routingState.state.anchorFace : undefined);
    if (avatar) event.broadcaster = {uid:"",uname:anchor?.uname ?? (sameRoom ? routingState.state.anchorName : undefined) ?? "",avatar,guardLevel:0,isAnchor:true};
  }
  const roomId = routingState.state.roomId ?? events[0]?.roomId;
  let archive = currentArchiveSession(roomId);
  const archiveEvents = events.filter((event, index) => {
    const kind = event.msgType === MsgType.LiveStart
      ? "start"
      : event.msgType === MsgType.LiveEnd
        ? "end"
        : "content";
    return shouldCaptureArchiveEvent({
      kind,
      liveStatusBefore: liveStatusesBefore[index],
      archiveStatus: archive?.status,
    });
  });
  const liveStart = archiveEvents.find((event) => event.msgType === MsgType.LiveStart && event.roomId === roomId);
  const incomingLiveStartedAt = liveStart?.liveIdentity?.sourceLiveStartedAt ?? routingState.state.liveStartedAt;
  const incomingLiveIdentity = incomingLiveStartedAt ? { sourceLiveStartedAt: incomingLiveStartedAt } : undefined;
  const shouldCheckArchiveIdentity = Boolean(liveStart || incomingLiveStartedAt || archive?.status === "unclean");
  if (archive && roomId != null && archive.status !== "ended" && shouldCheckArchiveIdentity
    && !shouldReuseArchiveOnLiveStart(archive, incomingLiveIdentity)) {
    const interrupted = markArchiveUnclean(archive, "live-identity-changed");
    if (interrupted !== archive) enqueueArchiveLifecycle(interrupted);
    const live = getLiveSession(routingState.sessions, roomId);
    useConnection.setState({ sessions: putLiveSession(routingState.sessions, roomId, { ...live, archive: undefined }) });
    archive = undefined;
    routingState = useConnection.getState();
  }
  // 先完成档案旁路路由：只有直播中的普通事件、开播边界或已有场次的下播边界
  // 才能进入档案。未开播、轮播和下播后的迟到事件只保留在现场流中。
  const routing = routeAcceptedEvents(archiveEvents);
  recordArchiveProjection(events.length, events.slice(0, 8).map((event) => getEventId(event)));
  const hasArchiveAppend = routing.archiveMutations.some((mutation) => mutation.kind === "append");
  if (archive?.status === "ended" && hasArchiveAppend && roomId != null) {
    const live = getLiveSession(routingState.sessions, roomId);
    useConnection.setState({ sessions: putLiveSession(routingState.sessions, roomId, { ...live, archive: undefined }) });
    archive = undefined;
    routingState = useConnection.getState();
  }
  if (!archive && roomId != null && hasArchiveAppend) {
    const anchor = routingState.anchors.find((item) => item.realRoomId === roomId);
    archive = ensureArchiveSessionForAcceptedEvent(roomId, {
      name: routingState.state.anchorName ?? anchor?.uname,
      avatarUrl: routingState.state.anchorFace ?? anchor?.face,
      title: routingState.state.title,
      coverUrl: routingState.state.coverUrl,
      sourceLiveStartedAt: incomingLiveStartedAt,
    });
    routingState = useConnection.getState();
  }

  if (archive && roomId != null) {
    const anchor = routingState.anchors.find((item) => item.realRoomId === roomId);
    const name = routingState.state.anchorName ?? anchor?.uname;
    const avatarUrl = routingState.state.anchorFace ?? anchor?.face;
    let nextArchive = archive;
    for (const ev of archiveEvents) {
      if (ev.roomId !== roomId || nextArchive.status === "ended") continue;
      if (ev.msgType === MsgType.LiveStart) {
        nextArchive = markArchiveLiveStart(nextArchive, ev.ts, ev.liveIdentity);
      } else if (ev.msgType === MsgType.LiveEnd) {
        nextArchive = markArchiveLiveEnd(nextArchive, ev.ts);
      }
      if (ev.stats?.roomTitle) {
        nextArchive = updateArchiveLiveTitle(nextArchive, ev.stats.roomTitle);
      }
    }
    if (nextArchive !== archive) {
      const live = getLiveSession(routingState.sessions, roomId);
      useConnection.setState({
        sessions: putLiveSession(routingState.sessions, roomId, { ...live, archive: nextArchive }),
      });
      archive = nextArchive;
      routingState = useConnection.getState();
      enqueueArchiveLifecycle(archive, name, avatarUrl);
    }
  }

  // 档案旁路必须位于现场礼物合并、价格阈值和窗口投影之前。
  if (archive && routing.archiveMutations.length > 0) {
    const appendCount = routing.archiveMutations.filter((mutation) => mutation.kind === "append").length;
    const nextArchive = {
      ...addArchivePaidMutations(archive, routing.archiveMutations),
      nextOrdinal: archive.nextOrdinal + appendCount,
    };
    const paidDelta = nextArchive.paidTotal - archive.paidTotal;
    const writer = getArchiveWriter();
    const batch: ArchiveEventBatch = {
      archiveId: archive.archiveId,
      sessionId: archive.sessionId,
      roomId: archive.roomId,
      ordinalStart: archive.nextOrdinal,
      mutations: routing.archiveMutations,
      sessionUpdate: appendCount > 0 || paidDelta > 0
        ? toArchiveSessionInput(nextArchive, Date.now())
        : undefined,
    };
    writer.enqueueBatch(batch);
    syncArchiveWriterStatus(writer);
    scheduleArchiveWriterFlushAndNotify(writer);
    if (appendCount > 0 || paidDelta > 0) {
      archive = nextArchive;
      const live = getLiveSession(routingState.sessions, roomId);
      routingState = {
        ...routingState,
        sessions: putLiveSession(routingState.sessions, roomId, { ...live, archive }),
      };
    }
  }

  const { events: prev, stats: prevStats, listCount } = routingState;
  const sessions = routingState.sessions;
  // React key 唯一化：共享 rnd 的真消息（同 id 不同内容）入列时与缓冲现有 key 比对，
  // 冲突则加序号后缀。重复 key 会让 React 列表协调错乱产生克隆行（同上真机事故）
  const next = [...prev];
  const liveKeys = new Set(next.map((e) => e.reactKey ?? e.id));
  let appended = 0;
  const deliveries: (() => void)[] = [];
  for (const ev of events) {
    // SC 删除：不新增行，回溯给已渲染的匹配 SC 行打删除标记（EventRow 据此加删除线）。
    // 记录已不再按行数截断；如果事件已经不在当前会话中，则自然无法回溯。
    // 替换新对象而非原地变异（EventRow 是 memo）
    if (ev.msgType === MsgType.ScDeleted) {
      const ids = new Set(ev.scDeleteIds ?? []);
      if (ids.size === 0) {
        recordEventDecision({
          eventId: getEventId(ev),
          phase: "sc-delete",
          outcome: "ignored",
          reason: "sc-delete",
          msgType: ev.msgType,
          region: MAIN_EVENT_REGION,
        }, ev.roomId);
        continue;
      }
      let matched = 0;
      deliveries.push(() => eventDelivery.updateWindows(ev));
      for (let i = 0; i < next.length; i++) {
        const row = next[i];
        if (row.msgType === MsgType.SuperChat && !row.scDeleted && ids.has(row.id)) {
          next[i] = { ...row, scDeleted: true };
          matched++;
        }
      }
      recordEventDecision({
        eventId: getEventId(ev),
        phase: "sc-delete",
        outcome: matched > 0 ? "updated" : "ignored",
        reason: "sc-delete",
        msgType: ev.msgType,
        region: MAIN_EVENT_REGION,
      }, ev.roomId);
      continue;
    }
    if (ev.msgType === MsgType.Gift) {
      if (!ev.isComboUpdate && ev.comboId) seenComboSources.add(ev.comboId);
      const mergedGift = mergeGiftInto(next, ev);
      if (mergedGift) {
        recordEventDecision({
          eventId: getEventId(ev),
          phase: "gift-merge",
          outcome: mergedGift.updated ? "updated" : "discarded",
          reason: mergedGift.updated ? "gift-merged" : "gift-already-finalized",
          msgType: ev.msgType,
          region: MAIN_EVENT_REGION,
        }, ev.roomId);
        // 合并不会新增现场行，但副窗口仍需要收到更新后的整行，
        // 否则礼物窗只会显示第一次送礼的数量和金额。
        if (mergedGift.updated) { const updated = mergedGift.updated; deliveries.push(() => eventDelivery.updateGift(updated)); }
        continue;
      }
      // 原 SEND_GIFT 已展示过、但其行已不在当前房间会话中：
      // 最终总结不再重新插入；真正中途接入、只收到 COMBO_SEND 时才降级展示。
      if (ev.isComboUpdate && ev.comboId && seenComboSources.has(ev.comboId)) {
        recordEventDecision({
          eventId: getEventId(ev),
          phase: "gift-merge",
          outcome: "discarded",
          reason: "combo-source-seen",
          msgType: ev.msgType,
          region: MAIN_EVENT_REGION,
        }, ev.roomId);
        continue;
      }
      recordEventDecision({
        eventId: getEventId(ev),
        phase: "gift-merge",
        outcome: "created",
        reason: "gift-new",
        msgType: ev.msgType,
        region: MAIN_EVENT_REGION,
      }, ev.roomId);
    }
    // 无可合并礼物行时，连击事件降级为普通礼物行展示（罕见，通常紧跟 SEND_GIFT）
    let patched = ev.isComboUpdate
      ? { ...ev, isComboUpdate: false, comboFinalized: true }
      : ev;
    patched = assignEventRenderKey(patched, liveKeys, () => ++renderKeySequence);
    next.push(patched);
    recordEventDecision({
      eventId: getEventId(patched),
      phase: "main-window",
      outcome: "appended",
      reason: "main-appended",
      msgType: patched.msgType,
      region: MAIN_EVENT_REGION,
    }, patched.roomId);
    deliveries.push(() => eventDelivery.append(patched));
    appended++;
  }
  const nextListCount = listCount + appended;
  const nextStats = { ...prevStats, ...stats };
  const nextSessions = roomId == null
    ? sessions
    : putLiveSession(sessions, roomId, {
        events: next,
        stats: nextStats,
        listCount: nextListCount,
        ...(archive ? { archive } : {}),
      });
  useConnection.setState({
    events: next,
    guardIconUrlsByUid: mergeObservedGuardIdentityIcons(routingState.guardIconUrlsByUid, events, roomId),
    listCount: nextListCount,
    stats: nextStats,
    sessions: nextSessions,
  });
  deliveries.forEach(deliver => deliver());
};

const startTimer = () => {
  if (flushTimer) return;
  const timer = setInterval(flush, FLUSH_MS);
  flushTimer = timer;
  connectionRuntime?.setTimer(() => {
    if (flushTimer === timer) {
      clearInterval(timer);
      flushTimer = null;
      return;
    }
    clearInterval(timer);
  });
};

const stopTimer = () => {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
};

const onEvent = (ev: DanmakuEvent) => {
  const liveStatusBefore = useConnection.getState().state.liveStatus;
  recordEventDecision({
    eventId: getEventId(ev),
    phase: "adapt",
    outcome: "success",
    reason: "adapted",
    msgType: ev.msgType,
  }, ev.roomId);
  // 开播/下播实时联动主播卡状态（ConnState.liveStatus），并同步主播列表持久化
  if (ev.msgType === MsgType.LiveStart) {
    useConnection.setState((s) => ({
      state: {
        ...s.state,
        liveStatus: 1,
        liveStartedAt: ev.liveIdentity?.sourceLiveStartedAt,
      },
    }))
    syncAnchorLive(1)
  } else if (ev.msgType === MsgType.LiveEnd) {
    useConnection.setState((s) => ({ state: { ...s.state, liveStatus: 0 } }))
    syncAnchorLive(0)
  }
  if (ev.stats?.roomTitle) {
    useConnection.setState((s) => ({ state: { ...s.state, title: ev.stats?.roomTitle } }));
  }
  // 礼物连击合并（含 COMBO_SEND 权威校正）统一在 flush 里做，见 mergeGiftInto
  // 生命周期/房间变更既保留事件行，也更新对应房间的概览快照。
  if (ev.stats) {
    pendingStats = { ...pendingStats, ...ev.stats };
    pendingStatsDecisions.push({
      eventId: getEventId(ev),
      roomId: ev.roomId,
      msgType: ev.msgType,
      listed: !isStatisticsEvent(ev),
    });
  }
  if (!isStatisticsEvent(ev)) {
    pendingEvents.push({ event: ev, liveStatusBefore });
  }
};

export const useConnection = create<ConnectionState>((set, get) => ({
  state: { status: "idle" },
  events: [],
  guardIconUrlsByUid: new Map(),
  stats: {},
  listCount: 0,
  sessions: {},

  anchors: [],

  initAnchors: async () => {
    const owner = connectionRuntime;
    const anchors = await loadAnchors();
    if (!owner?.isCurrent()) return;
    set({ anchors });
    // stale-while-revalidate：旧值先显示，后台刷新开播状态（节流归零 -> 启动必刷）
    get().refreshAnchors();
  },

  refreshAnchors: () => {
    if (anchorRefreshing || Date.now() < anchorRefreshBlockedUntil || Date.now() - lastAnchorRefreshAt < ANCHOR_REFRESH_INTERVAL_MS) return;
    const owner = connectionRuntime;
    anchorRefreshing = true;
    void (async () => {
      try {
        const cookie = useSession.getState().session?.cookie ?? undefined;
        const pending = [...get().anchors];
        const statuses: Array<Pick<Anchor,"realRoomId"|"liveStatus">> = [];
        const currentConnection = conn;
        const revision = currentConnection?.liveStatusRevision ?? 0;
        lastAnchorRefreshAt = Date.now();
        const rooms = await getRoomBaseInfo(pending.map(anchor => anchor.realRoomId), cookie);
        if (!owner?.isCurrent()) return;
        for (const room of rooms) {
          let liveStatus = room.live_status;
          if (get().state.roomId === room.room_id && conn === currentConnection && currentConnection?.isConnected) {
            if (!currentConnection.reconcileLiveStatus(room, revision)) liveStatus = get().state.liveStatus ?? liveStatus;
          }
          statuses.push({ realRoomId: room.room_id, liveStatus });
        }
        const current = get().state;
        const latestStatuses = statuses.map(item => conn?.isConnected && item.realRoomId === current.roomId && current.liveStatus !== undefined
          ? { ...item, liveStatus: current.liveStatus } : item);
        const byRoom = new Map(latestStatuses.map(item => [item.realRoomId, item.liveStatus]));
        set(prev => ({ anchors: prev.anchors.map(anchor => {
          const liveStatus = byRoom.get(anchor.realRoomId);
          return liveStatus === undefined ? anchor : { ...anchor, liveStatus };
        }) }));
        await updateAnchorStatuses(latestStatuses);
      } catch (error) {
        if (error instanceof ApiError && (error.code === 412 || error.code === -412)) anchorRefreshBlockedUntil = Date.now() + 5 * 60_000;
        // 查询失败保留已知状态。
      } finally {
        anchorRefreshing = false;
      }
    })();
  },

  removeAnchor: async (realRoomId) => {
    const anchors = await removeAnchorFromStore(realRoomId);
    set({ anchors });
  },

  connect: (roomIdInput, cookie, uid) => {
    if (!connectionRuntime?.isCurrent()) return;
    const generation = ++connectionGeneration;
    const beforeSwitch = get();
    const requestedRoom = roomIdInput.trim();
    const target = beforeSwitch.anchors.find((a) => a.roomIdInput === requestedRoom);
    const currentRoomId = beforeSwitch.state.roomId;
    const staysInCurrentRoom = currentRoomId == null
      || target?.realRoomId === currentRoomId
      || requestedRoom === String(currentRoomId);
    const reconnectRoomId = target?.realRoomId ?? (requestedRoom === String(currentRoomId) ? currentRoomId : undefined);
    if (!staysInCurrentRoom) activityStore.clear();
    const preservedRoomGuardProfile = staysInCurrentRoom
      ? keepSameRoomGuardProfile(beforeSwitch.state, reconnectRoomId)
      : {};
    // 先把当前房间最后一批待处理事件写入对应会话，再切换连接。
    // 这样断开/切换不会丢掉尚未到刷新点的事件。
    flush();
    if (currentRoomId != null) {
      markCurrentArchiveUnclean(staysInCurrentRoom ? "connection-error" : "connection-switched",
        staysInCurrentRoom ? "reconnecting" : "stopped");
    }
    conn = null;
    // 先让旧连接停止重连和写入，再创建新连接；旧回调由 generation 守卫丢弃。
    connectionRuntime.setConnection(null);
    pendingEvents = [];
    pendingStats = {};
    pendingStatsDecisions = [];
    archiveRecoveryPromises.clear();
    archiveRecoveryCompleted.clear();
    seenIds.clear();
    seenComboSources.clear();
    renderKeySequence = 0;
    const current = get();
    // 已知主播卡可以在点击切换时立即清空两个独立窗口；未知输入等 room_init
    // 确认真实房间后再切换，确保同房重连保留显示缓存。
    if (target) {
      eventDelivery.switchRoom(target.realRoomId);
    }
    const restored: LiveSession = target
      ? getLiveSession(current.sessions, target.realRoomId)
      : { events: [], stats: {}, listCount: 0 };
    const restoredGuardIcons = staysInCurrentRoom
      ? beforeSwitch.guardIconUrlsByUid
      : guardIdentityIconsFromEvents(restored.events, target?.realRoomId);
    seedSeenIds(restored.events);
    // 目标是已知主播时用其身份垫底：connecting 期间主播卡保持头像/名字，
    // 只等绿点随 roomInit 刷新；主播信息到达后自动替换（改名/换头像场景）
    set({
      state: {
        status: "connecting",
        message: uiText("connection.connect.state.message"),
        liveStartedAt: undefined,
        ...preservedRoomGuardProfile,
        ...(target
          ? { roomId: target.realRoomId, anchorName: target.uname, anchorFace: target.face, liveStatus: target.liveStatus }
          : {}),
      },
      events: restored.events,
      guardIconUrlsByUid: restoredGuardIcons,
      stats: restored.stats,
      listCount: restored.listCount,
    });
    let ownedConn: SharedRoomConnection | null = null;
    ownedConn = new SharedRoomConnection({
      onActivityUpdate: fact => {
        if (generation !== connectionGeneration || !connectionRuntime?.isCurrent()) return;
        activityStore.accept(fact);
        publishGiftActivity(fact);
        void emit(ACTIVITY_UPDATE_EVENT, fact).catch(() => {});
      },
      onEvent: (event) => {
        if (generation !== connectionGeneration || !connectionRuntime?.isCurrent()) return;
        onEvent(event);
      },
      onState: (state) => {
        if (generation !== connectionGeneration || !connectionRuntime?.isCurrent()) return;
        // 手动输入短房间号时，连接开始阶段还不知道真实房间号；room_init
        // 到达后再恢复对应房间的会话。已知主播卡则不会重复切换。
        if (state.roomId != null) {
          eventDelivery.switchRoom(state.roomId);
        }
        if (state.roomId != null && get().state.roomId !== state.roomId) {
          const session = getLiveSession(get().sessions, state.roomId);
          seedSeenIds(session.events);
          set({
            events: session.events,
            guardIconUrlsByUid: guardIdentityIconsFromEvents(session.events, state.roomId),
            stats: session.stats,
            listCount: session.listCount,
          });
        }
        // 连接成功才需要批量刷新；error/closed 时把残余缓冲刷掉
        if (state.status === "connected") {
          startTimer();
          // 连接即添加：主播进列表（拿不到主播信息则跳过）
          const a = ownedConn?.anchor;
          if (a && (get().state.status !== "connected" || get().state.roomId !== state.roomId)) {
            void upsertAnchor({ ...a, lastConnectedAt: Date.now() }).then((anchors) => {
              if (generation === connectionGeneration && connectionRuntime?.isCurrent() && conn === ownedConn) {
                const current = get().state;
                set({ anchors: anchors.map(anchor => anchor.realRoomId === current.roomId && current.liveStatus !== undefined
                  ? { ...anchor, liveStatus: current.liveStatus } : anchor) });
              }
            }).catch(recordAnchorWriteFailure);
          }
        } else if (state.status === "error") {
          flush();
          markCurrentArchiveUnclean("connection-error");
          stopTimer();
        } else if (state.status === "reconnecting") {
          flush();
          markCurrentArchiveUnclean("connection-error", "reconnecting");
          stopTimer();
        } else if (state.status === "closed") {
          flush();
          markCurrentArchiveUnclean("connection-closed");
          stopTimer();
        }
        set((prev) => {
          const nextState = { ...prev.state, ...state };
          const profile = state.roomGuardProfile;
          if (!profile || profile.roomId == null || nextState.roomId !== profile.roomId) return { state: nextState };
          const nextEvents = applyRoomGuardProfileToEvents(prev.events, profile.roomId, profile);
          const live = getLiveSession(prev.sessions, profile.roomId);
          const nextSessionEvents = applyRoomGuardProfileToEvents(live.events, profile.roomId, profile);
          const nextSessions = nextSessionEvents === live.events
            ? prev.sessions
            : putLiveSession(prev.sessions, profile.roomId, { ...live, events: nextSessionEvents });
          return {
            state: nextState,
            ...(nextEvents === prev.events ? {} : { events: nextEvents }),
            sessions: nextSessions,
          };
        });
        const currentState = get().state;
        if (state.roomGuardProfile && state.roomGuardProfile.roomId === currentState.roomId) {
          updateDisplayRoomGuardProfile(state.roomGuardProfile);
          updateGiftRoomGuardProfile(state.roomGuardProfile);
        }
        if (state.status === "connected" && currentState.roomId != null) {
          const currentArchive = currentArchiveSession(currentState.roomId);
          if (currentArchive && currentArchive.status !== "ended") {
            if (currentState.liveStatus === 0) {
              flush();
              const ended = updateLiveArchiveSession(currentState.roomId, (archive) =>
                archive.status === "ended" ? archive : markArchiveLiveEnd(archive, null));
              if (ended) enqueueArchiveLifecycle(ended);
            } else if (currentState.liveStatus === 2 || "liveStatus" in state && currentState.liveStatus === undefined
              || currentState.liveStatus === 1 && !currentState.liveStartedAt && currentArchive.status === "unclean") {
              markCurrentArchiveUnclean("live-identity-changed");
              const latest = get();
              const live = getLiveSession(latest.sessions, currentState.roomId);
              set({ sessions: putLiveSession(latest.sessions, currentState.roomId, { ...live, archive: undefined }) });
            }
          }
        }
        if (currentState.liveStatus === 1 && currentState.roomId != null && currentState.liveStartedAt) {
          scheduleArchiveSessionRecovery(currentState.roomId, currentState.liveStartedAt);
        }
        if (state.roomId != null && state.coverUrl) {
          const updatedArchive = updateLiveArchiveSession(
            state.roomId,
            (archive) => updateArchiveLiveCover(archive, state.coverUrl),
          );
          if (updatedArchive) enqueueArchiveLifecycle(updatedArchive);
        }
      },
    }, getDiagnosticContext(), runtimeDiagnosticData());
    conn = ownedConn;
    connectionRuntime.setConnection(ownedConn);
    ownedConn.connect({
      roomIdInput: requestedRoom,
      cookie,
      uid: Number(uid),
      guardIconUrlsByUid: restoredGuardIcons,
      ...preservedRoomGuardProfile,
    }).catch(() => {
      /* 错误已通过 onState({status:'error'}) 上报 */
    });
  },

  disconnect: (reason = "manual-disconnect") => {
    if (!connectionRuntime?.isCurrent()) return;
    ++connectionGeneration;
    conn = null;
    const previousState = get().state;
    connectionRuntime.setConnection(null);
    eventDelivery.clearVoice();
    flush();
    markCurrentArchiveUnclean(reason);
    void flushArchiveWriter();
    stopTimer();
    seenIds.clear();
    seenComboSources.clear();
    pendingStatsDecisions = [];
    renderKeySequence = 0;
    set({ state: toClosedState(previousState) });
  },
}));

connectionRuntime = claimConnectionRuntime();
initializeArchiveRuntime(connectionRuntime);
const anchorRefreshTimer = setInterval(() => useConnection.getState().refreshAnchors(), ANCHOR_REFRESH_INTERVAL_MS);
connectionRuntime.addCleanup(() => clearInterval(anchorRefreshTimer));
connectionRuntime.addCleanup(() => {
  conn = null;

  archiveRecoveryPromises.clear();
  archiveRecoveryCompleted.clear();
  pendingEvents = [];
  pendingStats = {};
  pendingStatsDecisions = [];
  seenIds.clear();
  seenComboSources.clear();
  renderKeySequence = 0;
  eventDelivery.clearVoice();
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    void connectionRuntime?.dispose("hmr");
  });
}
