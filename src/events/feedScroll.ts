const MAX_UNREAD = 999;
export const FEED_FOLLOW_THRESHOLD = 80;

export type LiveScrollDirection = "bottom" | "top";

export type LiveContentAlignment = "top" | "bottom";

export function normalizeLiveContentAlignment(value: unknown): LiveContentAlignment {
  return value === "bottom" ? "bottom" : "top";
}

/** 未显式设置时统一从顶部对齐。 */
export function resolveFeedContentAlignment(_mode: string, _direction: LiveScrollDirection, alignment?: LiveContentAlignment): LiveContentAlignment {
  return alignment ?? "top";
}

export type FeedStackAlignment = "start" | "end";

export function getRetainedFeedWindowStart(previousWindow: readonly string[], nextIds: readonly string[], size: number): number | undefined {
  const indexes = new Map(nextIds.map((id, index) => [id, index]));
  for (let offset = 0; offset < previousWindow.length; offset++) {
    const index = indexes.get(previousWindow[offset]);
    if (index !== undefined) return Math.max(0, Math.min(Math.max(0, nextIds.length - size), index - offset));
  }
  return undefined;
}

export function normalizeLiveScrollDirection(value: unknown): LiveScrollDirection {
  return value === "top" ? "top" : "bottom";
}

/** 短列表整组对齐；未传新字段的调用保留旧方向对应关系。 */
export function getFeedStackAlignment(direction: LiveScrollDirection, alignment?: LiveContentAlignment): FeedStackAlignment {
  return (alignment ?? (direction === "top" ? "bottom" : "top")) === "bottom" ? "end" : "start";
}

export interface FeedScrollSession {
  /** 是否已经从真实滚动容器初始化过。 */
  initialized: boolean;
  /** 上次记录的像素位置；视图高度变化时会自动限制到有效范围。 */
  scrollTop: number;
  /** 是否跟随最新消息；为 true 时恢复到当前滚动方向的最新边缘。 */
  followingLatest: boolean;
  /** 该区域上次离开时的未读数量。 */
  unreadCount: number;
  /** 上次记录的可见事件数，用来计算离开期间新增的事件。 */
  visibleCount: number;
  /** 兼容来源列表重建时恢复的可见事件锚点。 */
  anchorId?: string;
  anchorOffset?: number;
  /** 文本或用户筛选期间保留的原列表阅读位置。 */
  queryPosition?: FeedReadingPosition;
}

export interface FeedReadingPosition {
  scrollTop: number;
  followingLatest: boolean;
  anchorId?: string;
  anchorOffset?: number;
}

export interface FeedLayoutSnapshot {
  scrollTop: number;
  followingLatest: boolean;
  readingAnchor?: { eventKey: string; offset: number };
}

export function captureFeedLayoutSnapshot(
  session: Pick<FeedScrollSession, "scrollTop" | "followingLatest"> & Pick<FeedLayoutSnapshot, "readingAnchor">,
): FeedLayoutSnapshot {
  return {
    scrollTop: session.scrollTop,
    followingLatest: session.followingLatest,
    ...(session.readingAnchor ? { readingAnchor: session.readingAnchor } : {}),
  };
}

export function restoreFeedLayoutSnapshot(
  snapshot: FeedLayoutSnapshot,
  scrollHeight: number,
  clientHeight: number,
  direction: LiveScrollDirection = "bottom",
  anchor?: { start: number; paddingTop: number },
): FeedLayoutSnapshot {
  return {
    scrollTop: !snapshot.followingLatest && snapshot.readingAnchor && anchor
      ? getFeedAnchorScrollTop({ anchorStart: anchor.start, anchorOffset: snapshot.readingAnchor.offset,
        paddingTop: anchor.paddingTop, scrollHeight, clientHeight })
      : getRestoredScrollTop(snapshot, scrollHeight, clientHeight, direction),
    followingLatest: snapshot.followingLatest,
  };
}

export function createFeedScrollSession(visibleCount: number): FeedScrollSession {
  return {
    initialized: false,
    scrollTop: 0,
    followingLatest: true,
    unreadCount: 0,
    visibleCount: Math.max(0, visibleCount),
  };
}

export function getRestoredScrollTop(
  session: Pick<FeedScrollSession, "scrollTop" | "followingLatest">,
  scrollHeight: number,
  clientHeight: number,
  direction: LiveScrollDirection = "bottom",
): number {
  if (session.followingLatest) return getLatestScrollTop(direction, scrollHeight, clientHeight);
  const maxScrollTop = Math.max(0, scrollHeight - clientHeight);
  return Math.min(maxScrollTop, Math.max(0, session.scrollTop));
}

export function getLatestScrollTop(
  direction: LiveScrollDirection,
  scrollHeight: number,
  clientHeight: number,
): number {
  return direction === "top" ? 0 : Math.max(0, scrollHeight - clientHeight);
}

export interface TopAppendScrollMetrics {
  scrollTop: number;
  previousScrollHeight: number;
  nextScrollHeight: number;
  clientHeight: number;
  followingLatest: boolean;
}

/** 顶部追加时保持阅读位置；跟随最新时始终回到顶部。 */
export function getTopAppendScrollTop(metrics: TopAppendScrollMetrics): number {
  if (metrics.followingLatest) return 0;
  const maxScrollTop = Math.max(0, metrics.nextScrollHeight - metrics.clientHeight);
  const nextScrollTop = metrics.scrollTop + metrics.nextScrollHeight - metrics.previousScrollHeight;
  return Math.min(maxScrollTop, Math.max(0, nextScrollTop));
}

export interface TopAppendAnchorChange {
  visibleCount: number;
  anchorVisibleCount: number;
  scrollHeightChanged: boolean;
  prependSettling: boolean;
  measurementChanged?: boolean;
}

/** 真实前插、前插安全区重排和行高重测均保留顶部阅读锚点。 */
export function shouldAdjustTopAppendAnchor(change: TopAppendAnchorChange): boolean {
  return change.visibleCount > change.anchorVisibleCount
    || change.measurementChanged === true
    || (change.prependSettling && change.scrollHeightChanged);
}

/** 读取最新行测量坐标，不把它提前裁剪为可执行的滚动目标。 */
export function getFeedMeasurementStart(virtualizer: {
  getTotalSize: () => number;
  measurementsCache: readonly { start: number }[];
}, index: number): number | undefined {
  virtualizer.getTotalSize();
  return virtualizer.measurementsCache[index]?.start;
}

/** 仅在事件视口偏移计算完成后限制最终滚动位置。 */
export function getFeedAnchorScrollTop(metrics: {
  anchorStart: number;
  anchorOffset: number;
  paddingTop: number;
  scrollHeight: number;
  clientHeight: number;
}): number {
  return Math.min(Math.max(0, metrics.scrollHeight - metrics.clientHeight),
    Math.max(0, metrics.anchorStart + metrics.paddingTop - metrics.anchorOffset));
}

export function isFollowingLatest(
  direction: LiveScrollDirection,
  scrollTop: number,
  scrollHeight?: number,
  clientHeight?: number,
): boolean {
  if (direction === "top") return scrollTop <= FEED_FOLLOW_THRESHOLD;
  if (scrollHeight == null || clientHeight == null) return false;
  return Math.max(0, scrollHeight - clientHeight) - scrollTop <= FEED_FOLLOW_THRESHOLD;
}

export function captureFeedScrollSession(
  session: FeedScrollSession,
  metrics: {
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
    unreadCount: number;
    visibleCount: number;
    direction?: LiveScrollDirection;
  },
): void {
  const maxScrollTop = Math.max(0, metrics.scrollHeight - metrics.clientHeight);
  const scrollTop = Math.min(maxScrollTop, Math.max(0, metrics.scrollTop));
  session.initialized = true;
  session.scrollTop = scrollTop;
  session.followingLatest = isFollowingLatest(
    metrics.direction ?? "bottom",
    metrics.scrollTop,
    metrics.scrollHeight,
    metrics.clientHeight,
  );
  session.unreadCount = Math.max(0, metrics.unreadCount);
  session.visibleCount = Math.max(0, metrics.visibleCount);
}

/** 根据列表变化决定是否累计未读消息；视图切换不把历史消息算作新消息。 */
export function updateUnreadCount(
  currentUnread: number,
  previousVisibleCount: number,
  nextVisibleCount: number,
  viewChanged: boolean,
  followingLatest: boolean,
): number {
  if (viewChanged) return 0;
  const appended = nextVisibleCount - previousVisibleCount;
  if (appended <= 0 || followingLatest) return followingLatest ? 0 : currentUnread;
  return Math.min(MAX_UNREAD, currentUnread + appended);
}

export function scrollSticky(event: { currentTarget: HTMLElement; deltaX: number; deltaY: number; preventDefault(): void }) {
  const area = event.currentTarget;
  if (area.scrollWidth <= area.clientWidth || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
  event.preventDefault();
  area.scrollLeft += event.deltaY;
}
