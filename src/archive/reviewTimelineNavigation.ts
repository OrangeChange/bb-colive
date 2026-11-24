export interface ReviewTimelineNavigationState {
  sessionId: string | null;
  targetEventKey: string | null;
  targetPending: boolean;
  preserveReadingPosition: boolean;
}

export interface ReviewTimelineViewportBounds {
  viewportTop: number;
  viewportBottom: number;
  itemTop: number;
  itemBottom: number;
}

export interface ReviewTimelineScrollAnchor {
  eventKey: string;
  offset: number;
}

export interface ReviewTimelineScrollAnchorSnapshot extends ReviewTimelineScrollAnchor {
  generation: number;
}

export type ReviewTimelineSortDirection = "asc" | "desc";

export interface ReviewTimelineEventWatermark {
  eventTs: number;
  ordinal: number;
  eventKey: string;
}

function compareReviewTimelineEventOrder(
  left: ReviewTimelineEventWatermark,
  right: ReviewTimelineEventWatermark,
): number {
  return left.eventTs - right.eventTs
    || left.ordinal - right.ordinal
    || left.eventKey.localeCompare(right.eventKey);
}

/** 回看时间线的“最新”边缘：倒序在顶部，顺序在底部。 */
export function getReviewTimelineLatestIndex(count: number, direction: ReviewTimelineSortDirection): number {
  if (count <= 0) return -1;
  return direction === "asc" ? count - 1 : 0;
}

export function getReviewTimelineLatestAlignment(direction: ReviewTimelineSortDirection): "start" | "end" {
  return direction === "asc" ? "end" : "start";
}

export function isReviewTimelineAtLatest(
  direction: ReviewTimelineSortDirection,
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  threshold = 1,
): boolean {
  return direction === "asc"
    ? scrollHeight - clientHeight - scrollTop <= threshold
    : scrollTop <= threshold;
}

/** 只有实时刷新越过已见事件水位时才播放入场动画。 */
export function collectFreshReviewEventKeys(
  currentKeys: readonly string[],
  incoming: readonly ReviewTimelineEventWatermark[],
  watermark: ReviewTimelineEventWatermark | null,
): { keys: string[]; watermark: ReviewTimelineEventWatermark | null } {
  const known = new Set(currentKeys);
  const nextWatermark = incoming.reduce((current, item) => (
    current === null || compareReviewTimelineEventOrder(item, current) > 0 ? item : current
  ), watermark);
  const keys = incoming
    .filter((item) => !known.has(item.eventKey) && (watermark === null || compareReviewTimelineEventOrder(item, watermark) > 0))
    .map((item) => item.eventKey);
  return { keys, watermark: nextWatermark };
}

export function advanceReviewTimelineEventWatermark(
  watermark: ReviewTimelineEventWatermark | null,
  incoming: readonly ReviewTimelineEventWatermark[],
): ReviewTimelineEventWatermark | null {
  return incoming.reduce((current, item) => (
    current === null || compareReviewTimelineEventOrder(item, current) > 0 ? item : current
  ), watermark);
}

/** 目标行必须完整落在时间线视口内，才允许结束一次明确的定位。 */
export function isReviewTimelineItemVisible(bounds: ReviewTimelineViewportBounds): boolean {
  return bounds.itemTop >= bounds.viewportTop
    && bounds.itemBottom <= bounds.viewportBottom;
}

export function shouldPauseReviewTimelineAutomation(state: {
  targetPending: boolean;
  restorePending: boolean;
  locatingTarget: boolean;
}): boolean {
  return state.targetPending || state.restorePending || state.locatingTarget;
}

export function shouldPreserveReviewTimelineScroll(
  followingLatest: boolean,
  anchor: ReviewTimelineScrollAnchor | null,
): boolean {
  return !followingLatest && anchor !== null;
}

export function canRestoreReviewTimelineScrollAnchor(
  anchor: ReviewTimelineScrollAnchorSnapshot | null,
  generation: number,
  targetPending: boolean,
): boolean {
  return !targetPending && anchor !== null && anchor.generation === generation;
}

export function shouldCompleteReviewTimelineLocation(
  previousOffset: number | null,
  currentOffset: number,
  stableFrames: number,
  tolerance = 1,
): boolean {
  return previousOffset !== null
    && Math.abs(currentOffset - previousOffset) <= tolerance
    && stableFrames >= 2;
}

export function createReviewTimelineNavigationState(): ReviewTimelineNavigationState {
  return { sessionId: null, targetEventKey: null, targetPending: false, preserveReadingPosition: false };
}

export function updateReviewTimelineNavigationTarget(
  state: ReviewTimelineNavigationState,
  sessionId: string,
  targetEventKey: string | null | undefined,
): ReviewTimelineNavigationState {
  if (targetEventKey) {
    if (state.sessionId === sessionId && state.targetEventKey === targetEventKey && state.targetPending && state.preserveReadingPosition) return state;
    return { sessionId, targetEventKey, targetPending: true, preserveReadingPosition: true };
  }
  if (state.sessionId === sessionId && state.targetPending) return { ...state, targetPending: false };
  if (state.sessionId === sessionId && !state.preserveReadingPosition) return state;
  return { sessionId, targetEventKey: null, targetPending: false, preserveReadingPosition: false };
}

export function releaseReviewTimelineReadingProtection(
  state: ReviewTimelineNavigationState,
): ReviewTimelineNavigationState {
  return state.preserveReadingPosition ? { ...state, preserveReadingPosition: false } : state;
}

export function shouldSaveReviewReadingPosition(
  state: ReviewTimelineNavigationState,
  sessionId: string,
  keywordSearchActive: boolean,
  queryDiffersFromSavedPosition = false,
  explicitResume = false,
): boolean {
  if (state.sessionId === sessionId && state.targetEventKey !== null && state.preserveReadingPosition) return false;
  if (keywordSearchActive || queryDiffersFromSavedPosition) return explicitResume;
  return true;
}
