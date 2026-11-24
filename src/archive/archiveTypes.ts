import type { DanmakuEvent } from "../protocol/types.ts";
import type { ArchiveCloudMetadata } from './archiveCloudMetadata.ts';

export type ArchiveQuality = "in-progress" | "complete" | "incomplete";
export type ArchiveSessionStatus = "active" | "ended" | "unclean";
export type ArchiveRecordingStatus = "recording" | "reconnecting" | "stopped";
export type ArchiveSortDirection = "asc" | "desc";
export type ArchiveSearchScope = "session" | "owner" | "all";
export type ArchiveSessionSort = "startedAt" | "duration" | "eventCount" | "paidTotal" | "favoriteCount";
export type ArchiveUserIdentity = "normal" | "admin" | "anchor" | "guard" | "captain" | "admiral" | "viceroy";
export type ArchiveFanMedalFilter = "current" | "currentLighted";
export type ArchiveGiftPriceMode = "unit" | "cumulative";
export type ArchiveFavoriteSourceKind = "archive" | "historical";
export type ArchiveFavoriteSort = "favoritedAt" | "eventTs";
/** nickname 是旧版筛选状态的兼容值；新界面统一显示为用户。 */
export type ArchiveKeywordField = "all" | "user" | "nickname" | "fanMedal" | "gift" | "content" | "note";
export type ArchiveKeywordOperator = "and" | "or";
export type ArchiveIdentityEvidence = "live-key" | "source-live-time" | "sub-session-key" | "unavailable";
export type ArchiveTitleSource = "bilibili" | "time";

export interface ArchiveKeywordCondition {
  field: ArchiveKeywordField;
  value: string;
  /** 与前一个关键词的连接方式；第一项忽略此字段。 */
  join?: ArchiveKeywordOperator;
}

export function getArchiveKeywordJoin(
  condition: ArchiveKeywordCondition,
  index: number,
  legacyOperator?: ArchiveKeywordOperator,
): ArchiveKeywordOperator {
  if (index === 0) return "and";
  if (condition.join === "or") return "or";
  if (condition.join === "and") return "and";
  return legacyOperator === "or" ? "or" : "and";
}

export interface ArchiveDatabaseResult {
  rowsAffected: number;
  lastInsertId?: number;
}

export interface ArchiveTransactionStatement {
  sql: string;
  values: unknown[];
}

export type ArchiveTransactionExecutor = (
  statements: readonly ArchiveTransactionStatement[],
) => Promise<ArchiveDatabaseResult[]>;

export interface ArchiveDatabaseHealth {
  available: boolean;
  schemaVersion: number;
  ownerCount: number;
  sourceCount: number;
  sessionCount: number;
  eventCount: number;
  favoriteCount: number;
  nicknameCount: number;
  readingStateCount: number;
  pageCount: number;
  pageSize: number;
  bytes: number;
  error: string | null;
}

export interface ArchiveDatabase {
  execute(query: string, bindValues?: unknown[]): Promise<ArchiveDatabaseResult>;
  select<T>(query: string, bindValues?: unknown[]): Promise<T>;
  executeTransaction?: ArchiveTransactionExecutor;
}

export interface ArchiveOwnerInput {
  ownerId: string;
  roomId: number;
  uid?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  createdAt?: number;
  updatedAt?: number;
}

export interface ArchiveOwnerSummary {
  ownerId: string;
  roomId: number;
  uid: string | null;
  name: string | null;
  avatarUrl: string | null;
  createdAt: number;
  updatedAt: number;
  sessionCount: number;
  eventCount: number;
  paidTotal: number;
  favoriteCount: number;
  incompleteSessionCount: number;
  latestSessionAt: number | null;
}

export interface ArchiveOwnerQuery {
  searchText?: string;
  limit?: number;
}

export interface ArchiveSessionInput {
  cloudMetadata?: ArchiveCloudMetadata | null;
  sessionId: string;
  ownerId: string;
  roomId: number;
  title?: string | null;
  coverUrl?: string | null;
  latestTitle?: string | null;
  titleSource?: ArchiveTitleSource;
  liveKey?: string | null;
  subSessionKey?: string | null;
  sourceLiveStartedAt?: number | null;
  identityEvidence?: ArchiveIdentityEvidence | null;
  startedAt: number;
  endedAt?: number | null;
  status: ArchiveSessionStatus;
  quality: ArchiveQuality;
  qualityReason?: string | null;
  recordingStatus?: ArchiveRecordingStatus;
  stopReason?: string | null;
  qualityReasons?: string[];
  eventCount?: number;
  paidTotal?: number;
  favoriteCount?: number;
  createdAt?: number;
  updatedAt?: number;
}

export interface ArchiveSessionUpdate {
  cloudMetadata?: ArchiveCloudMetadata | null;
  sessionId: string;
  startedAt?: number;
  title?: string | null;
  coverUrl?: string | null;
  latestTitle?: string | null;
  titleSource?: ArchiveTitleSource;
  liveKey?: string | null;
  subSessionKey?: string | null;
  sourceLiveStartedAt?: number | null;
  identityEvidence?: ArchiveIdentityEvidence | null;
  endedAt?: number | null;
  status?: ArchiveSessionStatus;
  quality?: ArchiveQuality;
  qualityReason?: string | null;
  recordingStatus?: ArchiveRecordingStatus;
  stopReason?: string | null;
  qualityReasons?: string[];
  eventCount?: number;
  paidTotal?: number;
  favoriteCount?: number;
  updatedAt?: number;
}

export interface ArchiveSessionSummary extends ArchiveSessionInput {
  recordingStatus: ArchiveRecordingStatus;
  stopReason: string | null;
  qualityReasons: string[];
  /** 当前档案中保存的主播显示名；导出时用于人类可读的场次信息。 */
  ownerName?: string | null;
  durationMs: number | null;
}

export interface ArchiveSessionQuery {
  ownerId?: string;
  searchText?: string;
  filters?: ArchiveFilterState;
  status?: ArchiveSessionStatus | readonly ArchiveSessionStatus[];
  recordingStatus?: ArchiveRecordingStatus | readonly ArchiveRecordingStatus[];
  quality?: ArchiveQuality | readonly ArchiveQuality[];
  favoriteOnly?: boolean;
  fromTs?: number;
  toTs?: number;
  sort?: ArchiveSessionSort;
  direction?: ArchiveSortDirection;
  limit?: number;
  offset?: number;
}

export type ArchiveEventPayload = DanmakuEvent | string;

export interface ArchiveEventInput {
  eventKey: string;
  sessionId: string;
  roomId: number;
  ordinal: number;
  eventTs: number;
  primaryCategory: string;
  secondaryCategory?: string | null;
  userUid?: string | null;
  userName?: string | null;
  searchText: string;
  payload: ArchiveEventPayload;
  sourceId?: string | null;
}

export interface ArchiveEventUpdate {
  eventKey: string;
  patch: {
    scDeleted?: boolean;
  };
}

export interface ArchiveSourceEventRangeUpdate {
  namespace: string;
  serverId: string;
  roomId: string;
  fromSequence: string;
  throughSequence: string;
  targetSessionId: string | null;
}

export interface ArchiveEventRecord {
  eventKey: string;
  sessionId: string;
  roomId: number;
  ordinal: number;
  eventTs: number;
  primaryCategory: string;
  secondaryCategory: string | null;
  userUid: string | null;
  userName: string | null;
  userNickname?: string | null;
  searchText: string;
  payloadJson: string;
  sourceId: string | null;
  favorited: boolean;
  sessionTitle?: string | null;
  sessionStartedAt?: number;
  sessionEndedAt?: number | null;
  sessionStatus?: ArchiveSessionStatus;
  sessionQuality?: ArchiveQuality;
  sessionQualityReason?: string | null;
  sessionRecordingStatus?: ArchiveRecordingStatus;
  sessionStopReason?: string | null;
  sessionQualityReasons?: string[];
}

export interface ArchiveHistoricalFavoriteInput {
  legacyKey: string;
  roomId: number;
  eventId: string;
  event: DanmakuEvent;
  favoritedAt: number;
  label: string;
  note?: string;
  tags?: string[];
}

export interface ArchiveHistoricalFavoriteRecord extends ArchiveHistoricalFavoriteInput {}

export interface ArchiveFavoriteCursor {
  sortValue: number;
  stableId: string;
  direction: ArchiveSortDirection;
}

export interface ArchiveFavoriteQuery {
  ownerId?: string;
  searchText?: string;
  keywordField?: ArchiveKeywordField;
  filters?: ArchiveFilterState;
  primaryCategories?: readonly string[];
  timeField?: ArchiveFavoriteSort;
  fromTs?: number;
  toTs?: number;
  tagFilter?: ArchiveFavoriteTagFilter;
  sort?: ArchiveFavoriteSort;
  direction?: ArchiveSortDirection;
  cursor?: string | null;
  limit?: number;
  includeTotal?: boolean;
}

export interface ArchiveFavoriteItem {
  sourceKind: ArchiveFavoriteSourceKind;
  stableId: string;
  eventKey: string | null;
  legacyKey: string | null;
  sessionId: string | null;
  ownerId: string | null;
  ownerName: string | null;
  roomId: number;
  sessionTitle: string | null;
  sessionStartedAt: number | null;
  sessionEndedAt: number | null;
  eventTs: number;
  favoritedAt: number;
  primaryCategory: string | null;
  secondaryCategory: string | null;
  userUid: string | null;
  userName: string | null;
  userNickname: string | null;
  searchText: string;
  payloadJson: string;
  event: DanmakuEvent | null;
  canLocate: boolean;
  label: string | null;
  note: string;
  tags: string[];
}

export interface ArchiveFavoriteTag {
  tagId: number;
  name: string;
  createdAt: number;
  updatedAt: number;
  usageCount: number;
}

export interface ArchiveFavoriteOrganizationTarget {
  sourceKind: ArchiveFavoriteSourceKind;
  stableId: string;
}

export interface ArchiveFavoriteOrganizationPatch {
  target: ArchiveFavoriteOrganizationTarget;
  note?: string;
  tags?: readonly string[];
}

export interface ArchiveFavoriteOrganization {
  note: string;
  tags: string[];
}

export interface ArchiveFavoriteTagFilter {
  names: readonly string[];
  mode?: "any" | "all";
}

export type ArchiveFavoritePage = ArchiveCursorPage<ArchiveFavoriteItem>;

export type ArchiveFilterMode = "include" | "exclude";

export interface ArchiveFilterState {
  searchText?: string;
  keywordConditions?: readonly ArchiveKeywordCondition[];
  keywordOperator?: ArchiveKeywordOperator;
  /** 分类和细分类型共用的筛选方式；未设置时按包含模式兼容旧状态。 */
  filterMode?: ArchiveFilterMode;
  primaryCategories?: readonly string[];
  secondaryCategories?: readonly string[];
  eventTypes?: readonly string[];
  /** 回看专用显示筛选；未设置时显示独立大表情。 */
  showBigEmote?: boolean;
  userUid?: string;
  /** 发送者身份；不设置时不限制身份。 */
  userIdentity?: ArchiveUserIdentity;
  /** 当前主播粉丝牌条件；不设置时不限制粉丝牌。 */
  fanMedal?: ArchiveFanMedalFilter;
  favoriteOnly?: boolean;
  /** 回看专用礼物价格条件，不读取现场礼物阈值设置。 */
  giftPriceMinRmb?: number;
  giftPriceMaxRmb?: number;
  giftPriceMode?: ArchiveGiftPriceMode;
  fromTs?: number;
  toTs?: number;
}

export type ReviewOwnerMode = "sessions" | "events";

export interface ReviewOwnerSessionQuery {
  title: string;
  startedFromTs?: number;
  startedToTs?: number;
  status?: readonly ArchiveSessionStatus[];
  quality?: readonly ArchiveQuality[];
  favoriteOnly: boolean;
  sort: ArchiveSessionSort;
  direction: ArchiveSortDirection;
}

export interface ReviewOwnerEventQuery {
  filters: ArchiveFilterState;
  sort: "latestMatch" | "sessionStartedAt" | "matchCount";
  direction: ArchiveSortDirection;
}

export interface ReviewOwnerState {
  mode: ReviewOwnerMode;
  sessionQuery: ReviewOwnerSessionQuery;
  eventQuery: ReviewOwnerEventQuery;
}

export interface ReviewOwnerEventQueryPatch extends Partial<Omit<ReviewOwnerEventQuery, "filters">> {
  /** 对现有事件条件做字段级合并。 */
  filters?: ArchiveFilterState;
  /** 完整替换事件条件；传入空对象可清除全部条件。 */
  replaceFilters?: ArchiveFilterState;
}

export interface ReviewOwnerStatePatch {
  mode?: ReviewOwnerMode;
  sessionQuery?: Partial<ReviewOwnerSessionQuery>;
  eventQuery?: ReviewOwnerEventQueryPatch;
}

export interface ArchiveEventQuery {
  sessionId?: string;
  ownerId?: string;
  filters?: ArchiveFilterState;
  cursor?: string | null;
  anchor?: {
    eventKey?: string | null;
    fallbackEventTs?: number | null;
  };
  limit?: number;
  direction?: ArchiveSortDirection;
  /** 仅首屏需要时请求筛选结果总数，避免每个分页请求重复 COUNT。 */
  includeTotal?: boolean;
}

export interface ArchiveEventCursor {
  eventTs: number;
  ordinal: number;
  eventKey: string;
  direction: ArchiveSortDirection;
}

export interface ArchiveCursorPage<T> {
  items: T[];
  nextCursor: string | null;
  /** 未受游标影响的当前筛选结果总数；后续分页可复用首屏统计。 */
  totalCount: number | null;
}

export type ArchiveEventPage = ArchiveCursorPage<ArchiveEventRecord>;

export interface ArchiveOwnerEventGroupQuery {
  ownerId: string;
  filters: ArchiveFilterState;
  sort?: "latestMatch" | "sessionStartedAt" | "matchCount";
  direction?: ArchiveSortDirection;
  offset?: number;
  groupLimit?: number;
  previewLimit?: number;
}

export interface ArchiveOwnerEventMatchGroup {
  session: ArchiveSessionSummary;
  matchCount: number;
  latestMatchTs: number;
  matches: ArchiveEventRecord[];
}

export interface ArchiveOwnerEventGroupPage {
  items: ArchiveOwnerEventMatchGroup[];
  nextOffset: number | null;
  hasMore: boolean;
}

export interface ArchiveReadingState {
  sessionId: string;
  eventKey: string | null;
  fallbackEventTs: number | null;
  sortDirection: ArchiveSortDirection;
  filters: ArchiveFilterState;
  searchScope: ArchiveSearchScope;
  updatedAt: number;
}

export interface ArchiveDeleteScope {
  /** 删除所有可删除的档案；必须单独使用，仍保护记录中和重连中的场次。 */
  all?: boolean;
  /** 按 owner/主播 UID 约束；ownerId 是档案库里的稳定 owner 键。 */
  ownerId?: string;
  ownerUid?: string;
  /** 显式删除主播的全部可删除档案，必须同时提供 ownerId 或 ownerUid。 */
  ownerAll?: boolean;
  /** 显式保留一个主播并删除其他主播的可删除档案，必须提供 ownerId。 */
  keepOnlyOwnerId?: string;
  /** 单场删除。指定后不能再带日期范围。 */
  sessionId?: string;
  /** 精确删除多个场次；可与 ownerId 一起使用，不能再带日期范围或其他范围。 */
  sessionIds?: readonly string[];
  /** 删除开播时间早于此时间的场次。 */
  beforeTs?: number;
  /** 删除开播时间落在 [fromTs, toTs) 的场次。 */
  fromTs?: number;
  toTs?: number;
}

export interface ArchiveDeleteSessionSnapshot {
  sessionId: string;
  ownerId: string;
  status: ArchiveSessionStatus;
  recordingStatus?: ArchiveRecordingStatus;
  updatedAt: number;
  quality: ArchiveQuality;
}

export interface ArchiveDeletePreview {
  previewId?: string;
  ownerCount: number;
  sessionCount: number;
  /** 本次预览实际允许删除的精确场次集合。 */
  sessionIds: string[];
  /** 本次预览范围内每个目标场次的复查快照。 */
  sessionSnapshots: ArchiveDeleteSessionSnapshot[];
  eventCount: number;
  favoriteCount: number;
  resourceReferenceCount: number;
  bytes: number;
  blockedSessionCount: number;
  blockedSessionIds: string[];
  blockedSessionStates: Array<{
    sessionId: string;
    status: ArchiveSessionStatus;
    recordingStatus?: ArchiveRecordingStatus;
  }>;
}

export interface ArchiveImportCounts {
  ownerCount: number;
  sessionCount: number;
  imported: number;
  newEvents: number;
  skipped: number;
  completedFields: number;
  conflicts: number;
  unmatched: number;
}

export interface ArchiveImportPreview extends ArchiveImportCounts {
  previewId: string;
}

export type ArchiveTransferScope =
  | { kind: "all" }
  | { kind: "owner"; ownerId?: string; ownerUid?: string }
  | { kind: "session"; sessionId: string }
  | { kind: "date"; fromTs: number; toTs: number }
  | { kind: "result"; sessionId?: string; ownerId?: string; eventKeys: readonly string[] };

export interface ArchiveResourcePolicy {
  binariesIncluded: false;
  urlsIncluded: true;
  cacheStrategy: "cache-first-network-fallback";
}

export interface ArchiveTransferSourceSummary {
  sourceCount: number;
  missingCount: number;
  conflictCount: number;
}

export interface ArchiveTransferManifest {
  format: "danmu-archive";
  formatVersion: 1;
  schemaVersion: number;
  featureId: "review-archive";
  featureVersion: 1;
  exportedAt: number;
  scope: ArchiveTransferScope["kind"];
  restorable: boolean;
  sourceSummary: ArchiveTransferSourceSummary;
  resourcePolicy: ArchiveResourcePolicy;
  resourceUrls: string[];
  counts: {
    ownerCount: number;
    sessionCount: number;
    eventCount: number;
    favoriteCount: number;
    nicknameCount: number;
    readingStateCount: number;
  };
}

export interface ArchiveExportEvent {
  eventKey: string;
  sessionId: string;
  roomId: number;
  ordinal: number;
  eventTs: number;
  primaryCategory: string;
  secondaryCategory: string | null;
  userUid: string | null;
  userName: string | null;
  searchText: string;
  payloadJson: string;
  sourceId: string | null;
}

export interface ArchiveFavoriteExport {
  eventKey: string;
  sessionId: string;
  favoritedAt: number;
  note?: string;
  tags?: string[];
}

export interface ArchiveNicknameExport {
  userUid: string;
  nickname: string | null;
  updatedAt: number;
}

export interface ArchiveExportSession {
  session: ArchiveSessionInput;
  events: ArchiveExportEvent[];
  favorites: ArchiveFavoriteExport[];
  readingState: ArchiveReadingState | null;
}

export interface ArchiveArchiveBundle {
  format: "danmu-archive";
  formatVersion: 1;
  schemaVersion: number;
  manifest: ArchiveTransferManifest;
  owners: ArchiveOwnerInput[];
  sessions: ArchiveExportSession[];
  nicknames: ArchiveNicknameExport[];
  historicalFavorites: ArchiveHistoricalFavoriteInput[];
}

export interface ArchiveExportSnapshot {
  owners: ArchiveOwnerInput[];
  sessions: ArchiveExportSession[];
  nicknames: ArchiveNicknameExport[];
  historicalFavorites: ArchiveHistoricalFavoriteInput[];
}

export interface ArchiveSessionImportPatch {
  cloudMetadata?: ArchiveCloudMetadata | null;
  sessionId: string;
  title?: string | null;
  coverUrl?: string | null;
  endedAt?: number | null;
  qualityReason?: string | null;
  qualityReasons?: string[];
}

export interface ArchiveImportPlan {
  sourceId: string;
  counts: ArchiveImportCounts;
  owners: ArchiveOwnerInput[];
  sessionCreates: ArchiveSessionInput[];
  sessionPatches: ArchiveSessionImportPatch[];
  newEvents: ArchiveExportEvent[];
  favorites: ArchiveFavoriteExport[];
  nicknames: ArchiveNicknameExport[];
  readingStates: ArchiveReadingState[];
  historicalFavorites: ArchiveHistoricalFavoriteInput[];
  affectedSessionIds: string[];
}

export interface ArchiveImportResult extends ArchiveImportCounts {
  sourceId: string;
}

export interface ArchiveRepositoryContract {
  initialize(): Promise<void>;
  getHealthSnapshot(): Promise<ArchiveDatabaseHealth>;
  upsertOwner(input: ArchiveOwnerInput): Promise<void>;
  fillOwnerProfile(input: ArchiveOwnerInput): Promise<void>;
  upsertSession(input: ArchiveSessionInput): Promise<void>;
  appendEvents(events: readonly ArchiveEventInput[]): Promise<number>;
  getNextEventOrdinal(sessionId: string): Promise<number>;
  updateEvent(input: ArchiveEventUpdate): Promise<void>;
  reassignSourceEventRange(input: ArchiveSourceEventRangeUpdate): Promise<number>;
  updateSession(input: ArchiveSessionUpdate): Promise<void>;
  recomputePaidTotals(sessionIds?: readonly string[]): Promise<number>;
  recomputeEventCounts(sessionIds?: readonly string[]): Promise<number>;
  listOwners(query?: ArchiveOwnerQuery): Promise<ArchiveOwnerSummary[]>;
  listSessions(query?: ArchiveSessionQuery): Promise<ArchiveSessionSummary[]>;
  findResumableSession(roomId: number, sourceLiveStartedAt: number): Promise<ArchiveSessionSummary | null>;
  queryOwnerEventGroups(query: ArchiveOwnerEventGroupQuery): Promise<ArchiveOwnerEventGroupPage>;
  getSession(sessionId: string): Promise<ArchiveSessionSummary | null>;
  queryEvents(query: ArchiveEventQuery): Promise<ArchiveEventPage>;
  queryFavorites(query?: ArchiveFavoriteQuery): Promise<ArchiveFavoritePage>;
  listFavoriteTags(): Promise<ArchiveFavoriteTag[]>;
  getFavoriteOrganization(target: ArchiveFavoriteOrganizationTarget): Promise<ArchiveFavoriteOrganization | null>;
  updateFavoriteOrganization(patch: ArchiveFavoriteOrganizationPatch): Promise<void>;
  batchUpdateFavoriteOrganization(patches: readonly ArchiveFavoriteOrganizationPatch[]): Promise<void>;
  setFavoriteTags(target: ArchiveFavoriteOrganizationTarget, tags: readonly string[]): Promise<void>;
  removeFavoriteItem(target: ArchiveFavoriteOrganizationTarget): Promise<void>;
  removeFavorites(targets: readonly ArchiveFavoriteOrganizationTarget[]): Promise<void>;
  createFavoriteTag(name: string): Promise<ArchiveFavoriteTag>;
  renameFavoriteTag(tagId: number, name: string): Promise<void>;
  deleteFavoriteTag(tagId: number): Promise<void>;
  setFavorite(eventKey: string, favorited: boolean, favoritedAt?: number): Promise<void>;
  saveHistoricalFavorite(input: ArchiveHistoricalFavoriteInput): Promise<void>;
  listHistoricalFavorites(): Promise<ArchiveHistoricalFavoriteRecord[]>;
  setNickname(userUid: string, nickname: string | null): Promise<void>;
  getReadingState(sessionId: string): Promise<ArchiveReadingState | null>;
  saveReadingState(state: ArchiveReadingState): Promise<void>;
  getEvent(eventKey: string): Promise<ArchiveEventRecord | null>;
  getTransferSnapshot(scope: ArchiveTransferScope): Promise<ArchiveExportSnapshot>;
  commitArchiveImport(plan: ArchiveImportPlan): Promise<ArchiveImportResult>;
  rollbackCloudRecoveryRun(sourceId: string, createdSessionIds: readonly string[]): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  deleteBefore(scope: ArchiveDeleteScope): Promise<void>;
  getDeletePreview(scope: ArchiveDeleteScope): Promise<ArchiveDeletePreview>;
  deleteArchive(scope: ArchiveDeleteScope, sessionIds?: readonly string[]): Promise<void>;
}
