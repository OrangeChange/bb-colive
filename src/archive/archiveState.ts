import type { Anchor } from "../protocol/anchors.ts";
import type {
  ArchiveEventRecord,
  ArchiveFilterState,
  ArchiveOwnerSummary,
  ArchiveReadingState,
  ArchiveFilterMode,
  ArchiveSearchScope,
  ArchiveSessionSort,
  ArchiveSortDirection,
  ReviewOwnerState,
  ReviewOwnerStatePatch,
} from "./archiveTypes.ts";

export type ReviewRoute =
  | { level: "home" }
  | { level: "owner"; roomId: number }
  | { level: "session"; roomId: number; sessionId: string };

export interface ReviewQueryState {
  searchText: string;
  searchScope: ArchiveSearchScope;
  filters: ArchiveFilterState;
  sort: ArchiveSessionSort;
  sortDirection: ArchiveSortDirection;
}

export function createDefaultReviewOwnerState(): ReviewOwnerState {
  return {
    mode: "sessions",
    sessionQuery: {
      title: "",
      favoriteOnly: false,
      sort: "startedAt",
      direction: "desc",
    },
    eventQuery: {
      filters: {},
      sort: "latestMatch",
      direction: "desc",
    },
  };
}

export function applyReviewOwnerStatePatch(
  current: ReviewOwnerState,
  patch: ReviewOwnerStatePatch,
): ReviewOwnerState {
  const eventPatch = patch.eventQuery;
  const { filters: filterPatch, replaceFilters, ...eventFieldsPatch } = eventPatch ?? {};
  return {
    ...current,
    ...patch,
    sessionQuery: patch.sessionQuery
      ? { ...current.sessionQuery, ...patch.sessionQuery }
      : current.sessionQuery,
    eventQuery: eventPatch
      ? {
          ...current.eventQuery,
          ...eventFieldsPatch,
          filters: replaceFilters !== undefined
            ? { ...replaceFilters }
            : filterPatch
              ? { ...current.eventQuery.filters, ...filterPatch }
              : current.eventQuery.filters,
        }
      : current.eventQuery,
  };
}

/**
 * 回看顶部检索栏的全局记忆项。它不绑定某个主播或场次，切换档案时仍沿用。
 */
export const DEFAULT_REVIEW_QUERY_PREFERENCES: ReviewQueryState = {
  searchText: "",
  searchScope: "session",
  filters: {},
  sort: "startedAt",
  sortDirection: "desc",
};

export interface ReviewLevelState {
  query: ReviewQueryState;
  ownerState?: ReviewOwnerState;
  targetEventKey?: string | null;
  scrollTop: number;
}

export interface ReviewLevelStatePatch extends Partial<Omit<ReviewLevelState, "ownerState">> {
  ownerState?: ReviewOwnerStatePatch;
}

export interface ReviewHistoryState {
  stack: ReviewRoute[];
  levels: Record<string, ReviewLevelState>;
}

export interface ReviewOwnerCardData {
  roomId: number;
  anchor: Anchor;
  owner: ArchiveOwnerSummary | null;
}

/** 设置页优先显示档案中保存的名称，旧档案缺名时用本机主播历史补足。 */
export function getArchiveOwnerLabel(
  owner: Pick<ArchiveOwnerSummary, "roomId" | "name">,
  anchors: readonly Pick<Anchor, "realRoomId" | "uname">[],
): string {
  const savedName = owner.name?.trim();
  if (savedName) return savedName;
  const anchorName = anchors.find((anchor) => anchor.realRoomId === owner.roomId)?.uname.trim();
  return anchorName || `房间 ${owner.roomId}`;
}

export const DEFAULT_REVIEW_QUERY: ReviewQueryState = {
  searchText: "",
  searchScope: "owner",
  filters: {},
  sort: "startedAt",
  sortDirection: "desc",
};

export const DEFAULT_REVIEW_SESSION_QUERY: ReviewQueryState = {
  ...DEFAULT_REVIEW_QUERY,
  searchScope: DEFAULT_REVIEW_QUERY_PREFERENCES.searchScope,
  sortDirection: DEFAULT_REVIEW_QUERY_PREFERENCES.sortDirection,
};

export type ReviewFilterUpdateMode = "merge" | "replace";

export interface ReviewQueryPatchOptions {
  filters?: ReviewFilterUpdateMode;
}

export type ReviewDatePreset =
  | "all"
  | "2m"
  | "5m"
  | "15m"
  | "20m"
  | "1h"
  | "2h"
  | "3h"
  | "6h"
  | "12h"
  | "1d"
  | "2d"
  | "1w"
  | "1mo"
  | "today"
  | "yesterday"
  | "week"
  | "lastWeek"
  | "month"
  | "lastMonth"
  | "thisYear"
  | "lastYear"
  | "custom";

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DATE_PRESET_TOLERANCE_MS = 5_000;

export interface ReadingStateRestoreToken {
  key: string;
  generation: number;
}

export interface ReadingStateRestoreGuard {
  begin(key: string): ReadingStateRestoreToken;
  markDirty(key: string): void;
  canApply(token: ReadingStateRestoreToken): boolean;
  invalidate(token: ReadingStateRestoreToken): void;
  complete(token: ReadingStateRestoreToken): void;
}

/**
 * 只在回看查询状态层区分 filters 的 patch merge 与完整 replace，
 * 避免用空对象清除条件时继续继承旧 user/category/date 字段。
 */
export function applyReviewQueryPatch(
  current: ReviewQueryState,
  patch: Partial<ReviewQueryState>,
  options: ReviewQueryPatchOptions = {},
): ReviewQueryState {
  const filters = options.filters === "replace"
    ? cloneReviewFilters(patch.filters ?? {})
    : patch.filters
      ? cloneReviewFilters({ ...current.filters, ...patch.filters })
      : cloneReviewFilters(current.filters);
  return {
    ...current,
    ...patch,
    filters,
  };
}

export interface ReviewDateRange {
  fromTs?: number;
  toTs?: number;
}

function startOfLocalDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function startOfLocalWeek(timestamp: number): number {
  const date = new Date(startOfLocalDay(timestamp));
  const daysSinceMonday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - daysSinceMonday);
  return date.getTime();
}

function startOfLocalMonth(timestamp: number): number {
  const date = new Date(startOfLocalDay(timestamp));
  date.setDate(1);
  return date.getTime();
}

function startOfLocalYear(timestamp: number): number {
  const date = new Date(startOfLocalDay(timestamp));
  date.setMonth(0, 1);
  return date.getTime();
}

function addLocalDays(timestamp: number, days: number): number {
  const date = new Date(timestamp);
  date.setDate(date.getDate() + days);
  return date.getTime();
}

function addLocalMonths(timestamp: number, months: number): number {
  const date = new Date(timestamp);
  date.setMonth(date.getMonth() + months);
  return date.getTime();
}

/** 返回回看时间预设对应的半开时间区间；滚动预设只设置开始时间。 */
export function getReviewDateRange(preset: ReviewDatePreset, now = Date.now()): ReviewDateRange {
  switch (preset) {
    case "2m": return { fromTs: now - 2 * MINUTE_MS, toTs: undefined };
    case "5m": return { fromTs: now - 5 * MINUTE_MS, toTs: undefined };
    case "15m": return { fromTs: now - 15 * MINUTE_MS, toTs: undefined };
    case "20m": return { fromTs: now - 20 * MINUTE_MS, toTs: undefined };
    case "1h": return { fromTs: now - HOUR_MS, toTs: undefined };
    case "2h": return { fromTs: now - 2 * HOUR_MS, toTs: undefined };
    case "3h": return { fromTs: now - 3 * HOUR_MS, toTs: undefined };
    case "6h": return { fromTs: now - 6 * HOUR_MS, toTs: undefined };
    case "12h": return { fromTs: now - 12 * HOUR_MS, toTs: undefined };
    case "1d": return { fromTs: now - DAY_MS, toTs: undefined };
    case "2d": return { fromTs: now - 2 * DAY_MS, toTs: undefined };
    case "1w": return { fromTs: now - 7 * DAY_MS, toTs: undefined };
    case "1mo": return { fromTs: now - 30 * DAY_MS, toTs: undefined };
    case "today": {
      const fromTs = startOfLocalDay(now);
      return { fromTs, toTs: addLocalDays(fromTs, 1) };
    }
    case "yesterday": {
      const toTs = startOfLocalDay(now);
      return { fromTs: addLocalDays(toTs, -1), toTs };
    }
    case "week": {
      const fromTs = startOfLocalWeek(now);
      return { fromTs, toTs: addLocalDays(fromTs, 7) };
    }
    case "lastWeek": {
      const toTs = startOfLocalWeek(now);
      return { fromTs: addLocalDays(toTs, -7), toTs };
    }
    case "month": {
      const fromTs = startOfLocalMonth(now);
      return { fromTs, toTs: addLocalMonths(fromTs, 1) };
    }
    case "lastMonth": {
      const toTs = startOfLocalMonth(now);
      return { fromTs: addLocalMonths(toTs, -1), toTs };
    }
    case "thisYear": {
      const fromTs = startOfLocalYear(now);
      return { fromTs, toTs: addLocalMonths(fromTs, 12) };
    }
    case "lastYear": {
      const toTs = startOfLocalYear(now);
      return { fromTs: addLocalMonths(toTs, -12), toTs };
    }
    case "all":
    case "custom":
      return {};
  }
}

/** 识别滚动直播时长预设或本地日历范围；含其他分钟级范围时返回 custom。 */
export function getReviewDatePreset(
  filters: ArchiveFilterState,
  now = Date.now(),
): ReviewDatePreset {
  if (filters.fromTs === undefined && filters.toTs === undefined) return "all";
  if (filters.fromTs === undefined || !Number.isFinite(filters.fromTs) || (filters.toTs !== undefined && !Number.isFinite(filters.toTs))) return "custom";
  const rollingPresets: readonly [ReviewDatePreset, number][] = [
    ["2m", 2 * MINUTE_MS],
    ["5m", 5 * MINUTE_MS],
    ["15m", 15 * MINUTE_MS],
    ["20m", 20 * MINUTE_MS],
    ["1h", HOUR_MS],
    ["2h", 2 * HOUR_MS],
    ["3h", 3 * HOUR_MS],
    ["6h", 6 * HOUR_MS],
    ["12h", 12 * HOUR_MS],
    ["1d", DAY_MS],
    ["2d", 2 * DAY_MS],
    ["1w", 7 * DAY_MS],
    ["1mo", 30 * DAY_MS],
  ];
  if (filters.toTs === undefined) {
    return rollingPresets.find(([, duration]) => Math.abs(filters.fromTs! - (now - duration)) <= DATE_PRESET_TOLERANCE_MS)?.[0] ?? "custom";
  }
  const calendarPresets: readonly ReviewDatePreset[] = ["today", "yesterday", "week", "lastWeek", "month", "lastMonth", "thisYear", "lastYear"];
  return calendarPresets.find((preset) => {
    const range = getReviewDateRange(preset, now);
    return Math.abs(filters.fromTs! - (range.fromTs ?? 0)) <= DATE_PRESET_TOLERANCE_MS
      && Math.abs(filters.toTs! - (range.toTs ?? 0)) <= DATE_PRESET_TOLERANCE_MS;
  }) ?? "custom";
}

/**
 * 阅读锚点存在时，首屏同时向当前方向和反方向取页；没有锚点时保留普通单向游标。
 */
export function getReviewReadingDirections(
  direction: ArchiveSortDirection,
  anchored: boolean,
): ArchiveSortDirection[] {
  if (!anchored) return [direction];
  return [direction, direction === "asc" ? "desc" : "asc"];
}

/**
 * 首次跟随最新事件时，查询方向固定从最新端取窗口；显示顺序由时间线另行决定。
 * 有阅读锚点时仍按锚点两侧取页，避免把显示顺序误当成数据库分页方向。
 */
export function getReviewInitialQueryDirections(
  direction: ArchiveSortDirection,
  anchored: boolean,
  followingLatest: boolean,
): ArchiveSortDirection[] {
  if (followingLatest && !anchored) return ["desc"];
  return getReviewReadingDirections(direction, anchored);
}

/** 把阅读恢复的异步请求绑定到查询代际，并在用户改查询后使旧结果失效。 */
export function createReadingStateRestoreGuard(): ReadingStateRestoreGuard {
  const generations = new Map<string, number>();
  const pending = new Map<string, { generation: number; dirty: boolean }>();

  return {
    begin(key) {
      const generation = (generations.get(key) ?? 0) + 1;
      generations.set(key, generation);
      pending.set(key, { generation, dirty: false });
      return { key, generation };
    },
    markDirty(key) {
      const entry = pending.get(key);
      if (entry) entry.dirty = true;
    },
    canApply(token) {
      const entry = pending.get(token.key);
      return Boolean(entry && entry.generation === token.generation && !entry.dirty);
    },
    invalidate(token) {
      const entry = pending.get(token.key);
      if (!entry || entry.generation !== token.generation) return;
      pending.delete(token.key);
      generations.set(token.key, token.generation + 1);
    },
    complete(token) {
      const entry = pending.get(token.key);
      if (entry?.generation === token.generation) pending.delete(token.key);
    },
  };
}

export function cloneReviewFilters(filters: ArchiveFilterState = {}): ArchiveFilterState {
  return {
    ...filters,
    ...(filters.keywordConditions ? { keywordConditions: filters.keywordConditions.map((condition) => ({ ...condition })) } : {}),
    ...(filters.primaryCategories ? { primaryCategories: [...filters.primaryCategories] } : {}),
    ...(filters.secondaryCategories ? { secondaryCategories: [...filters.secondaryCategories] } : {}),
    ...(filters.eventTypes ? { eventTypes: [...filters.eventTypes] } : {}),
  };
}

/** 从筛选结果返回原文时只继承事件分类/细分分类；关键词和其它条件均退出。 */
export function createCategoryOnlyArchiveFilters(filters: ArchiveFilterState): ArchiveFilterState {
  return {
    ...(filters.filterMode ? { filterMode: filters.filterMode } : {}),
    ...(filters.primaryCategories !== undefined ? { primaryCategories: [...filters.primaryCategories] } : {}),
    ...(filters.secondaryCategories !== undefined ? { secondaryCategories: [...filters.secondaryCategories] } : {}),
    ...(filters.eventTypes !== undefined ? { eventTypes: [...filters.eventTypes] } : {}),
  };
}

function normalizeOptionList(values: readonly string[] | undefined, options: readonly string[]): string[] {
  const allowed = new Set(options);
  return [...new Set((values ?? []).filter((value) => allowed.has(value)))];
}

function switchFilterSelection(
  selected: readonly string[] | undefined,
  currentMode: ArchiveFilterMode,
  nextMode: ArchiveFilterMode,
  options: readonly string[],
): string[] | undefined {
  const normalizedOptions = [...new Set(options)];
  if (normalizedOptions.length === 0) return undefined;
  const selectedSet = new Set(normalizeOptionList(selected, normalizedOptions));
  const effectiveSelected = currentMode === "include" && selected === undefined
    ? new Set(normalizedOptions)
    : selectedSet;
  const nextSelected = nextMode === currentMode
    ? effectiveSelected
    : new Set(normalizedOptions.filter((option) => !effectiveSelected.has(option)));

  if (nextSelected.size === 0) return nextMode === "include" ? [] : undefined;
  if (nextMode === "include" && nextSelected.size === normalizedOptions.length) return undefined;
  return normalizedOptions.filter((option) => nextSelected.has(option));
}

/** 在包含/排除之间切换，并反选按钮集合以保持实际筛选结果不跳变。 */
export function switchReviewFilterMode(
  filters: ArchiveFilterState,
  nextMode: ArchiveFilterMode,
  primaryOptions: readonly string[],
  secondaryOptions: readonly string[],
): ArchiveFilterState {
  const currentMode: ArchiveFilterMode = filters.filterMode === "exclude" ? "exclude" : "include";
  const secondarySelected = filters.secondaryCategories === undefined && filters.eventTypes === undefined
    ? undefined
    : [
        ...(filters.secondaryCategories ?? []),
        ...(filters.eventTypes ?? []),
      ];
  const next: ArchiveFilterState = {
    ...cloneReviewFilters(filters),
    filterMode: nextMode,
    primaryCategories: switchFilterSelection(filters.primaryCategories, currentMode, nextMode, primaryOptions),
    secondaryCategories: switchFilterSelection(secondarySelected, currentMode, nextMode, secondaryOptions),
  };
  if (filters.eventTypes !== undefined) next.eventTypes = undefined;
  return next;
}

function cloneQuery(query: ReviewQueryState = DEFAULT_REVIEW_QUERY): ReviewQueryState {
  return {
    ...query,
    filters: cloneReviewFilters(query.filters),
  };
}

export function normalizeReviewQueryPreferences(value: unknown): ReviewQueryState {
  const input = typeof value === "object" && value !== null ? value as Partial<ReviewQueryState> : {};
  const sort = input.sort === "duration"
    || input.sort === "eventCount"
    || input.sort === "paidTotal"
    || input.sort === "favoriteCount"
    ? input.sort
    : "startedAt";
  return {
    searchText: typeof input.searchText === "string" ? input.searchText : "",
    searchScope: input.searchScope === "owner" ? "owner" : "session",
    filters: cloneReviewFilters({
      ...(input.filters ?? {}),
      filterMode: input.filters?.filterMode === "exclude" ? "exclude" : undefined,
    }),
    sort,
    sortDirection: input.sortDirection === "asc" ? "asc" : "desc",
  };
}

function createLevelState(route?: ReviewRoute, preferredQuery?: ReviewQueryState): ReviewLevelState {
  const baseQuery = preferredQuery ?? (route?.level === "session" ? DEFAULT_REVIEW_SESSION_QUERY : DEFAULT_REVIEW_QUERY);
  return {
    query: cloneQuery(baseQuery),
    ...(route?.level === "owner" ? { ownerState: createDefaultReviewOwnerState() } : {}),
    scrollTop: 0,
  };
}

export function reviewRouteKey(route: ReviewRoute): string {
  switch (route.level) {
    case "home":
      return "home";
    case "owner":
      return `owner:${route.roomId}`;
    case "session":
      return `session:${route.roomId}:${route.sessionId}`;
  }
}

export function createReviewHistoryState(preferredQuery?: ReviewQueryState): ReviewHistoryState {
  const home: ReviewRoute = { level: "home" };
  return {
    stack: [home],
    levels: { [reviewRouteKey(home)]: createLevelState(home, preferredQuery) },
  };
}

/** 首次打开回看时使用的入口；之后由 ReviewPanel 保留用户已经浏览的位置。 */
export function getReviewEntryRoute(
  currentRoomId: number | null | undefined,
  openCurrentOwner: boolean,
): ReviewRoute {
  return openCurrentOwner && Number.isInteger(currentRoomId) && currentRoomId! > 0
    ? { level: "owner", roomId: currentRoomId! }
    : { level: "home" };
}

export function getReviewLevelState(
  historyState: ReviewHistoryState,
  route: ReviewRoute,
): ReviewLevelState {
  const state = historyState.levels[reviewRouteKey(route)] ?? createLevelState(route);
  return route.level === "owner" && !state.ownerState
    ? { ...state, ownerState: createDefaultReviewOwnerState() }
    : state;
}

export function updateReviewLevelState(
  historyState: ReviewHistoryState,
  route: ReviewRoute,
  patch: ReviewLevelStatePatch,
): ReviewHistoryState {
  const key = reviewRouteKey(route);
  const current = getReviewLevelState(historyState, route);
  const query = patch.query
    ? {
        ...current.query,
        ...patch.query,
        filters: patch.query.filters ? cloneReviewFilters(patch.query.filters) : cloneReviewFilters(current.query.filters),
      }
    : current.query;
  const { ownerState: ownerStatePatch, ...levelPatch } = patch;
  return {
    ...historyState,
    levels: {
      ...historyState.levels,
      [key]: {
        ...current,
        ...levelPatch,
        query,
        ...(ownerStatePatch
          ? { ownerState: applyReviewOwnerStatePatch(current.ownerState ?? createDefaultReviewOwnerState(), ownerStatePatch) }
          : current.ownerState ? { ownerState: current.ownerState } : {}),
      },
    },
  };
}

export function pushReviewRoute(
  historyState: ReviewHistoryState,
  route: ReviewRoute,
): ReviewHistoryState {
  const key = reviewRouteKey(route);
  const current = historyState.stack[historyState.stack.length - 1];
  if (current && reviewRouteKey(current) === key) return historyState;
  return {
    ...historyState,
    stack: [...historyState.stack, route],
    levels: historyState.levels[key] ? historyState.levels : { ...historyState.levels, [key]: createLevelState(route) },
  };
}

export function popReviewRoute(
  historyState: ReviewHistoryState,
  route: ReviewRoute,
): ReviewHistoryState {
  const currentIndex = historyState.stack.map(reviewRouteKey).lastIndexOf(reviewRouteKey(route));
  if (currentIndex <= 0) {
    return { ...historyState, stack: [{ level: "home" }] };
  }
  return { ...historyState, stack: historyState.stack.slice(0, currentIndex) };
}

/** 返回上一层；query、筛选、排序和 scrollTop 保存在 historyState.levels 中。 */
export function navigateBack(
  route: ReviewRoute,
  historyState: ReviewHistoryState,
): ReviewRoute {
  const currentIndex = historyState.stack.map(reviewRouteKey).lastIndexOf(reviewRouteKey(route));
  if (currentIndex > 0) return historyState.stack[currentIndex - 1];
  if (route.level === "session") return { level: "owner", roomId: route.roomId };
  return { level: "home" };
}

export function mergeReviewOwners(
  anchors: readonly Anchor[],
  owners: readonly ArchiveOwnerSummary[],
): ReviewOwnerCardData[] {
  const cards = anchors.map((anchor) => ({
    roomId: anchor.realRoomId,
    anchor,
    owner: owners.find((owner) => owner.roomId === anchor.realRoomId) ?? null,
  }));
  const anchorRoomIds = new Set(anchors.map((anchor) => anchor.realRoomId));
  for (const owner of owners) {
    if (anchorRoomIds.has(owner.roomId)) continue;
    cards.push({
      roomId: owner.roomId,
      anchor: {
        roomIdInput: String(owner.roomId),
        realRoomId: owner.roomId,
        uname: owner.name?.trim() || `房间 ${owner.roomId}`,
        face: owner.avatarUrl ?? undefined,
        lastConnectedAt: owner.updatedAt,
      },
      owner,
    });
  }
  return cards;
}

export interface ReadingPositionResolution {
  eventKey?: string;
  fallbackTs?: number;
}

type StableArchiveEvent = Pick<ArchiveEventRecord, "eventKey" | "eventTs" | "ordinal">;

/**
 * 根据稳定事件键恢复阅读位置；筛选或导入删除目标后，使用最近时间，
 * 完全没有可用时间时回到当前结果的首个事件。
 */
export function restoreReadingPosition(
  page: { items: readonly StableArchiveEvent[] } | readonly StableArchiveEvent[],
  state: ArchiveReadingState | null | undefined,
): ReadingPositionResolution {
  const items: readonly StableArchiveEvent[] = "items" in page ? page.items : page;
  if (items.length === 0) {
    return state?.fallbackEventTs === null || state?.fallbackEventTs === undefined
      ? {}
      : { fallbackTs: state.fallbackEventTs };
  }

  if (state?.eventKey) {
    const exact = items.find((item) => item.eventKey === state.eventKey);
    if (exact) return { eventKey: exact.eventKey };
  }

  if (state?.fallbackEventTs !== null && state?.fallbackEventTs !== undefined) {
    const nearest = items.reduce<StableArchiveEvent>((best, item) => {
      if (!best) return item;
      const distance = Math.abs(item.eventTs - state.fallbackEventTs!);
      const bestDistance = Math.abs(best.eventTs - state.fallbackEventTs!);
      return distance < bestDistance
        || (distance === bestDistance && (
          item.eventTs < best.eventTs
          || (item.eventTs === best.eventTs && (
            item.ordinal < best.ordinal
            || (item.ordinal === best.ordinal && item.eventKey.localeCompare(best.eventKey) < 0)
          ))
        ))
        ? item
        : best;
    }, items[0]);
    return { eventKey: nearest.eventKey, fallbackTs: state.fallbackEventTs };
  }

  return { eventKey: items[0].eventKey };
}
