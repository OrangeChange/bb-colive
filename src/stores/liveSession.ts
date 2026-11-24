import type { DanmakuEvent, LiveIdentity, StatsInfo } from "../protocol/types.ts";
import type {
  ArchiveIdentityEvidence,
  ArchiveQuality,
  ArchiveRecordingStatus,
  ArchiveSessionInput,
  ArchiveSessionStatus,
  ArchiveSessionSummary,
  ArchiveTitleSource,
} from "../archive/archiveTypes.ts";
import { applyArchivePaidTotal, type ArchiveMutation } from "../archive/archiveEventMutations.ts";
import { ARCHIVE_START_TIME_TOLERANCE_MS } from "../archive/archiveQuality.ts";
import { hasArchiveLateStartEvidence, normalizeArchiveSessionState } from "../archive/archiveSessionState.ts";

export interface LiveArchiveSession {
  archiveId: string;
  sessionId: string;
  ownerId: string;
  roomId: number;
  title: string | null;
  coverUrl: string | null;
  latestTitle: string | null;
  titleSource: ArchiveTitleSource;
  liveKey: string | null;
  subSessionKey: string | null;
  sourceLiveStartedAt: number | null;
  identityEvidence: ArchiveIdentityEvidence;
  startedAt: number;
  endedAt: number | null;
  status: ArchiveSessionStatus;
  quality: ArchiveQuality;
  qualityReason: string | null;
  recordingStatus: ArchiveRecordingStatus;
  stopReason?: string | null;
  qualityReasons?: string[];
  nextOrdinal: number;
  paidTotal: number;
  paidComboAmounts: Record<string, number>;
  finalizedPaidCombos: Record<string, true>;
  sawLiveStart: boolean;
  sawLiveEnd: boolean;
}

export interface LiveArchiveSessionInput {
  roomId: number;
  ownerId: string;
  now: number;
  title?: string | null;
  coverUrl?: string | null;
  sourceLiveStartedAt?: number | null;
  archiveId?: string;
  sessionId?: string;
}

export type ArchiveCaptureEventKind = "content" | "start" | "end";

/**
 * 档案捕获边界：普通事件只有在事件到达前处于直播中才允许写入；
 * 开播可以开启场次；下播只允许关闭已有且尚未结束的场次。
 */
export function shouldCaptureArchiveEvent(input: {
  kind: ArchiveCaptureEventKind;
  liveStatusBefore?: 0 | 1 | 2;
  archiveStatus?: ArchiveSessionStatus;
}): boolean {
  if (input.kind === "start") return true;
  if (input.kind === "end") return input.archiveStatus !== undefined && input.archiveStatus !== "ended";
  return input.liveStatusBefore === 1;
}

export type ArchiveIdentityMatch = "same" | "different" | "candidate" | "unknown";

type ComparableLiveIdentity = {
  liveKey?: string | null;
  subSessionKey?: string | null;
  sourceLiveStartedAt?: number | null;
};

export function compareArchiveLiveIdentity(
  left: ComparableLiveIdentity,
  right: ComparableLiveIdentity,
): ArchiveIdentityMatch {
  if (left.sourceLiveStartedAt && right.sourceLiveStartedAt) {
    return left.sourceLiveStartedAt === right.sourceLiveStartedAt ? "same" : "different";
  }
  return "unknown";
}

/**
 * 判断收到新的 LIVE 边界时，是否可以把它接回当前内存场次。
 * 中断后的场次必须有相同开播时间才能恢复；连续采集时允许补齐身份。
 */
export function shouldReuseArchiveOnLiveStart(
  existing: Pick<LiveArchiveSession, "status" | "liveKey" | "subSessionKey" | "sourceLiveStartedAt">,
  incoming?: LiveIdentity,
): boolean {
  if (existing.status === "ended") return false;
  const match = compareArchiveLiveIdentity(existing, incoming ?? {});
  if (match === "same") return true;
  if (match === "different") return false;
  return existing.status === "active";
}

function identityEvidence(identity: LiveIdentity | undefined): ArchiveIdentityEvidence {
  if (identity?.sourceLiveStartedAt) return "source-live-time";
  return "unavailable";
}

function fallbackArchiveTitle(now: number): string {
  const date = new Date(now);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())} 直播`;
}

function normalizeTitle(title?: string | null): string | null {
  const normalized = title?.trim();
  return normalized ? normalized : null;
}

function normalizeCoverUrl(coverUrl?: string | null): string | null {
  const normalized = coverUrl?.trim();
  return normalized ? normalized : null;
}

function applyLiveIdentity(archive: LiveArchiveSession, identity?: LiveIdentity): LiveArchiveSession {
  if (!identity?.sourceLiveStartedAt || archive.sourceLiveStartedAt === identity.sourceLiveStartedAt) return archive;
  return {
    ...archive,
    sourceLiveStartedAt: archive.sourceLiveStartedAt ?? identity.sourceLiveStartedAt,
    identityEvidence: archive.identityEvidence === "unavailable" ? identityEvidence(identity) : archive.identityEvidence,
  };
}

export function createLiveArchiveSession(input: LiveArchiveSessionInput): LiveArchiveSession {
  const baseId = input.sessionId ?? `session-${input.roomId}-${input.now}`;
  const title = normalizeTitle(input.title) ?? fallbackArchiveTitle(input.now);
  const sourceLiveStartedAt = input.sourceLiveStartedAt && input.sourceLiveStartedAt > 0 ? input.sourceLiveStartedAt : null;
  return normalizeArchiveSessionState({
    archiveId: input.archiveId ?? `archive-${input.roomId}-${input.now}`,
    sessionId: baseId,
    ownerId: input.ownerId,
    roomId: input.roomId,
    title,
    coverUrl: normalizeCoverUrl(input.coverUrl),
    latestTitle: normalizeTitle(input.title) ?? null,
    titleSource: normalizeTitle(input.title) ? "bilibili" : "time",
    liveKey: null,
    subSessionKey: null,
    sourceLiveStartedAt,
    identityEvidence: sourceLiveStartedAt ? "source-live-time" : "unavailable",
    startedAt: input.now,
    endedAt: null,
    status: "active",
    recordingStatus: 'recording',
    stopReason: null,
    qualityReasons: hasArchiveLateStartEvidence({ startedAt: input.now, sourceLiveStartedAt })
      ? ["live-start-not-captured"] : [],
    quality: "in-progress",
    qualityReason: sourceLiveStartedAt
      ? hasArchiveLateStartEvidence({ startedAt: input.now, sourceLiveStartedAt }) ? "live-start-not-captured" : null
      : "start-time-unknown",
    nextOrdinal: 0,
    paidTotal: 0,
    paidComboAmounts: {},
    finalizedPaidCombos: {},
    sawLiveStart: false,
    sawLiveEnd: false,
  });
}

/** 连续采集或明确同场时复用档案；已结束或身份无法确认的中断场次另建档案。 */
export function ensureLiveArchiveSession(
  existing: LiveArchiveSession | undefined,
  input: LiveArchiveSessionInput,
): LiveArchiveSession {
  const incomingStart = input.sourceLiveStartedAt && input.sourceLiveStartedAt > 0 ? input.sourceLiveStartedAt : null;
  if (existing && existing.roomId === input.roomId && existing.status !== "ended") {
    const identityMatches = compareArchiveLiveIdentity(existing, { sourceLiveStartedAt: incomingStart }) === "same"
      || existing.status === "active" && compareArchiveLiveIdentity(existing, { sourceLiveStartedAt: incomingStart }) !== "different";
    if (identityMatches) {
      const incomingTitle = normalizeTitle(input.title);
      const incomingCoverUrl = normalizeCoverUrl(input.coverUrl);
      const title = incomingTitle && existing.titleSource === "time" ? incomingTitle : existing.title;
      const coverUrl = existing.coverUrl ?? incomingCoverUrl;
      const latestTitle = incomingTitle ?? existing.latestTitle;
      const titleSource = incomingTitle && existing.titleSource === "time" ? "bilibili" : existing.titleSource;
      const sourceLiveStartedAt = existing.sourceLiveStartedAt ?? incomingStart;
      const nextIdentityEvidence = sourceLiveStartedAt ? "source-live-time" : existing.identityEvidence;
      const qualityReasons = normalizeArchiveSessionState(existing).qualityReasons;
      const addLateStart = hasArchiveLateStartEvidence({ startedAt: existing.startedAt, sourceLiveStartedAt })
        && !qualityReasons.includes("live-start-not-captured");
      if (existing.ownerId === input.ownerId
        && existing.title === title
        && existing.coverUrl === coverUrl
        && existing.latestTitle === latestTitle
        && existing.titleSource === titleSource
        && existing.sourceLiveStartedAt === sourceLiveStartedAt
        && existing.identityEvidence === nextIdentityEvidence
        && existing.status === "active"
        && existing.recordingStatus === "recording"
        && existing.stopReason === null
        && !addLateStart
        && existing.endedAt === null) {
        return existing;
      }
      return normalizeArchiveSessionState({
        ...existing,
        ownerId: input.ownerId,
        title,
        coverUrl,
        latestTitle,
        titleSource,
        sourceLiveStartedAt,
        qualityReasons: addLateStart ? [...qualityReasons, "live-start-not-captured"] : qualityReasons,
        identityEvidence: nextIdentityEvidence,
        status: "active",
        recordingStatus: "recording",
        stopReason: null,
        endedAt: null,
      });
    }
  }
  return createLiveArchiveSession({ ...input, sourceLiveStartedAt: incomingStart });
}

/**
 * 确认同场后从数据库恢复采集，并记录两次运行之间的采集中断。数据库只保存事件计数和累计金额，
 * 因而连击临时状态在恢复后从空值开始；场次身份、顺序和累计金额必须保留。
 */
export function restoreLiveArchiveSession(
  summary: ArchiveSessionSummary,
  now: number,
  nextOrdinal = summary.eventCount ?? 0,
): LiveArchiveSession {
  const normalized = normalizeArchiveSessionState(summary);
  return normalizeArchiveSessionState({
    archiveId: `archive-${summary.sessionId}`,
    sessionId: summary.sessionId,
    ownerId: summary.ownerId,
    roomId: summary.roomId,
    title: normalizeTitle(summary.title) ?? fallbackArchiveTitle(summary.startedAt || now),
    coverUrl: normalizeCoverUrl(summary.coverUrl),
    latestTitle: normalizeTitle(summary.latestTitle) ?? normalizeTitle(summary.title),
    titleSource: summary.titleSource ?? "time",
    liveKey: summary.liveKey ?? null,
    subSessionKey: summary.subSessionKey ?? null,
    sourceLiveStartedAt: summary.sourceLiveStartedAt ?? null,
    identityEvidence: summary.identityEvidence ?? "unavailable",
    startedAt: summary.startedAt,
    endedAt: null,
    status: "active",
    quality: normalized.quality,
    qualityReason: summary.qualityReason ?? "recovered-after-interruption",
    recordingStatus: 'recording',
    stopReason: null,
    qualityReasons: [...new Set([...normalized.qualityReasons, "recovered-after-interruption"])],
    nextOrdinal: Math.max(0, nextOrdinal),
    paidTotal: summary.paidTotal ?? 0,
    paidComboAmounts: {},
    finalizedPaidCombos: {},
    // 恢复场次已经有持久化质量结论；重复收到 LIVE 边界时不能重新计算并覆盖中断原因。
    sawLiveStart: true,
    sawLiveEnd: false,
  });
}

/** 仅在事件已通过本批去重后使用；已结束场次的迟到事件继续写回原场次。 */
export function getLiveArchiveSessionForAcceptedEvent(
  existing: LiveArchiveSession | undefined,
  input: LiveArchiveSessionInput,
): LiveArchiveSession {
  return existing ?? createLiveArchiveSession(input);
}

export function addArchivePaidMutations(
  archive: LiveArchiveSession,
  mutations: readonly ArchiveMutation[],
): LiveArchiveSession {
  const next = applyArchivePaidTotal({
    total: archive.paidTotal,
    comboAmounts: archive.paidComboAmounts,
    finalizedCombos: archive.finalizedPaidCombos,
  }, mutations);
  return {
    ...archive,
    paidTotal: next.total,
    paidComboAmounts: { ...next.comboAmounts },
    finalizedPaidCombos: { ...next.finalizedCombos },
  };
}

export function markArchiveLiveStart(
  archive: LiveArchiveSession,
  eventTs: number,
  identity?: LiveIdentity,
): LiveArchiveSession {
  const next = applyLiveIdentity(archive, identity);
  const isFirstLiveStart = !archive.sawLiveStart;
  const qualityReason = isFirstLiveStart
    ? next.sourceLiveStartedAt
      ? next.sourceLiveStartedAt < eventTs - ARCHIVE_START_TIME_TOLERANCE_MS
        ? "live-start-not-captured"
        : null
      : "start-time-unknown"
    : archive.qualityReason;
  const previous = normalizeArchiveSessionState(archive);
  const qualityReasons = [...new Set([
    ...previous.qualityReasons,
    ...(qualityReason === "live-start-not-captured" ? [qualityReason] : []),
  ])];
  return normalizeArchiveSessionState({
    ...next,
    startedAt: isFirstLiveStart ? eventTs : archive.startedAt,
    endedAt: null,
    status: "active",
    recordingStatus: "recording",
    stopReason: null,
    quality: "in-progress",
    qualityReason,
    qualityReasons,
    sawLiveStart: true,
    sawLiveEnd: false,
  });
}

/** 直播中标题变化只更新最新标题；主标题保持首次有效标题稳定。 */
export function updateArchiveLiveTitle(archive: LiveArchiveSession, title: string | null | undefined): LiveArchiveSession {
  const nextTitle = normalizeTitle(title);
  if (!nextTitle || archive.latestTitle === nextTitle) return archive;
  return { ...archive, latestTitle: nextTitle };
}

/** 异步房间信息只允许补齐当前场次的空封面，不覆盖已保存的封面。 */
export function updateArchiveLiveCover(
  archive: LiveArchiveSession,
  coverUrl: string | null | undefined,
): LiveArchiveSession {
  const nextCoverUrl = normalizeCoverUrl(coverUrl);
  if (archive.coverUrl || !nextCoverUrl) return archive;
  return { ...archive, coverUrl: nextCoverUrl };
}

export function markArchiveLiveEnd(
  archive: LiveArchiveSession,
  eventTs: number | null,
): LiveArchiveSession {
  const normalized = normalizeArchiveSessionState(archive);
  return normalizeArchiveSessionState({
    ...archive,
    endedAt: eventTs,
    status: "ended",
    recordingStatus: "stopped",
    stopReason: null,
    quality: normalized.qualityReasons.length > 0 ? "incomplete"
      : eventTs !== null && archive.sawLiveStart && archive.sourceLiveStartedAt ? "complete" : "in-progress",
    qualityReasons: normalized.qualityReasons,
    sawLiveEnd: true,
  });
}

export function markArchiveUnclean(
  archive: LiveArchiveSession,
  reason: string,
  recordingStatus: "stopped" | "reconnecting" = "stopped",
): LiveArchiveSession {
  if (archive.status === "ended") return archive;
  const normalized = normalizeArchiveSessionState(archive);
  const interrupted = archive.status === "active"
    && ["connection-switched", "connection-error", "connection-closed", "manual-disconnect", "app-exit"].includes(reason);
  return normalizeArchiveSessionState({
    ...archive,
    status: "unclean",
    recordingStatus,
    stopReason: recordingStatus === "stopped" ? reason : null,
    quality: normalized.quality,
    qualityReasons: [...new Set([...normalized.qualityReasons, ...(interrupted ? [reason] : [])])],
  });
}

export function toArchiveSessionInput(archive: LiveArchiveSession, updatedAt: number): ArchiveSessionInput {
  return {
    sessionId: archive.sessionId,
    ownerId: archive.ownerId,
    roomId: archive.roomId,
    title: archive.title,
    coverUrl: archive.coverUrl,
    latestTitle: archive.latestTitle,
    titleSource: archive.titleSource,
    liveKey: archive.liveKey,
    subSessionKey: archive.subSessionKey,
    sourceLiveStartedAt: archive.sourceLiveStartedAt,
    identityEvidence: archive.identityEvidence,
    startedAt: archive.startedAt,
    endedAt: archive.endedAt,
    status: archive.status,
    recordingStatus: archive.recordingStatus,
    stopReason: archive.stopReason,
    qualityReasons: archive.qualityReasons,
    quality: archive.quality,
    qualityReason: archive.qualityReason,
    eventCount: archive.nextOrdinal,
    paidTotal: archive.paidTotal,
    createdAt: archive.startedAt,
    updatedAt,
  };
}

/** 软件运行期间，一个真实房间对应的一份现场会话。 */
export interface LiveSession {
  events: DanmakuEvent[];
  stats: StatsInfo;
  listCount: number;
  archive?: LiveArchiveSession;
}

/** 使用对象而不是 Map，便于和 Zustand 状态一起做不可变更新。 */
export type LiveSessions = Record<string, LiveSession>;

export function getLiveSession(sessions: LiveSessions, roomId: number): LiveSession {
  return sessions[String(roomId)] ?? { events: [], stats: {}, listCount: 0 };
}

export function putLiveSession(
  sessions: LiveSessions,
  roomId: number,
  session: LiveSession,
): LiveSessions {
  return { ...sessions, [String(roomId)]: session };
}

export function getLiveDedupeKeys(events: DanmakuEvent[]): string[] {
  return events.map((event) => event.dedupe ?? event.id);
}
