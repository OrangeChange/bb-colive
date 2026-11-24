import { appDataFile } from "../appData.ts";
import Database from "@tauri-apps/plugin-sql";
import { readArchiveCloudMetadata } from './archiveCloudMetadata.ts';
import { initializeArchiveDatabase } from "./archiveSchema.ts";
import { normalizeArchiveSessionState, isArchiveSessionRecording } from './archiveSessionState.ts';
import { applyArchivePaidTotal, normalizeArchivePrimaryCategory, type ArchiveAppendMutation } from "./archiveEventMutations.ts";
import { buildArchiveContentTextFromPayload } from "./archiveContentSearch.ts";
import { buildArchiveQuery, escapeArchiveLikeValue } from "./archiveQuery.ts";
import { archiveResourceUrls } from "./archiveResourceUrls.ts";
import { executeArchiveTransaction } from "./archiveTransaction.ts";
import { buildArchiveFavoriteQueryPlan, encodeArchiveFavoritePageCursor } from "./archiveFavorites.ts";
import type { DanmakuEvent } from "../protocol/types.ts";
import { MsgType } from "../protocol/eventTypeCodes.ts";
import type {
  ArchiveDatabase,
  ArchiveDatabaseResult,
  ArchiveDatabaseHealth,
  ArchiveTransactionExecutor,
  ArchiveTransactionStatement,
  ArchiveDeleteSessionSnapshot,
  ArchiveDeletePreview,
  ArchiveDeleteScope,
  ArchiveExportEvent,
  ArchiveExportSnapshot,
  ArchiveFavoriteItem,
  ArchiveFavoritePage,
  ArchiveFavoriteQuery,
  ArchiveFavoriteTag,
  ArchiveFavoriteOrganizationPatch,
  ArchiveFavoriteOrganization,
  ArchiveFavoriteOrganizationTarget,
  ArchiveFavoriteExport,
  ArchiveEventCursor,
  ArchiveEventInput,
  ArchiveEventUpdate,
  ArchiveEventPage,
  ArchiveEventQuery,
  ArchiveEventRecord,
  ArchiveFilterState,
  ArchiveHistoricalFavoriteInput,
  ArchiveHistoricalFavoriteRecord,
  ArchiveImportPlan,
  ArchiveImportResult,
  ArchiveNicknameExport,
  ArchiveOwnerInput,
  ArchiveOwnerEventGroupPage,
  ArchiveOwnerEventGroupQuery,
  ArchiveOwnerEventMatchGroup,
  ArchiveOwnerQuery,
  ArchiveOwnerSummary,
  ArchiveReadingState,
  ArchiveRepositoryContract,
  ArchiveSearchScope,
  ArchiveSessionInput,
  ArchiveSessionQuery,
  ArchiveSessionSummary,
  ArchiveSessionUpdate,
  ArchiveSortDirection,
  ArchiveSourceEventRangeUpdate,
  ArchiveTransferScope,
} from "./archiveTypes.ts";

export const ARCHIVE_DATABASE_PATH = "sqlite:archive.sqlite";

export function createArchiveDatabaseOpener<T extends ArchiveDatabase>(
  loadDatabase: (path: string) => Promise<T>,
): () => Promise<T> {
  let databasePromise: Promise<T> | null = null;

  return () => {
    if (databasePromise === null) {
      databasePromise = loadDatabase(ARCHIVE_DATABASE_PATH)
        .then(async (database) => {
          await initializeArchiveDatabase(database);
          return database;
        })
        .catch((error) => {
          databasePromise = null;
          throw error;
        });
    }
    return databasePromise;
  };
}

export const openArchiveDatabase = createArchiveDatabaseOpener(
  async (path) => Database.load(`sqlite:${await appDataFile(path.replace(/^sqlite:/, ""))}`),
);

/** 应用启动时收口上一个进程的记录状态，保留已确认的下播与质量证据。 */
export async function reconcileStaleArchiveSessions(
  repository: Pick<ArchiveRepositoryContract, "listSessions" | "updateSession">,
  updatedAt = Date.now(),
): Promise<number> {
  let count = 0;
  while (true) {
    const activeSessions = await repository.listSessions({ recordingStatus: ['recording', 'reconnecting'] });
    for (const session of activeSessions) {
      await repository.updateSession({
        sessionId: session.sessionId,
        status: session.status === 'ended' ? 'ended' : 'unclean',
        recordingStatus: 'stopped',
        stopReason: 'previous-runtime',
        updatedAt,
      });
    }
    count += activeSessions.length;
    if (activeSessions.length < 100) return count;
  }
}

type DatabaseRow = Record<string, unknown>;

const SESSION_COLUMNS = `
  s.session_id AS sessionId,
  s.owner_id AS ownerId,
  s.room_id AS roomId,
  s.title AS title,
  s.cover_url AS coverUrl,
  s.cloud_metadata AS cloudMetadata,
  s.latest_title AS latestTitle,
  s.title_source AS titleSource,
  s.live_key AS liveKey,
  s.sub_session_key AS subSessionKey,
  s.source_live_started_at AS sourceLiveStartedAt,
  s.identity_evidence AS identityEvidence,
  s.started_at AS startedAt,
  s.ended_at AS endedAt,
  s.status AS status,
  s.quality AS quality,
  s.quality_reason AS qualityReason,
  s.recording_status AS recordingStatus,
  s.stop_reason AS stopReason,
  s.quality_reasons AS qualityReasons,
  s.event_count AS eventCount,
  s.paid_total AS paidTotal,
  s.favorite_count AS favoriteCount,
  s.created_at AS createdAt,
  s.updated_at AS updatedAt`;

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function rowValue(row: DatabaseRow, camelName: string, snakeName: string): unknown {
  if (hasOwn(row, camelName)) {
    return row[camelName];
  }
  return row[snakeName];
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function asNullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : asNumber(value);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function parseStringArray(value: unknown): string[] {
  const source = asString(value, "[]");
  try {
    const parsed = JSON.parse(source) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function asNullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : asString(value);
}

function fallbackArchiveTitle(startedAt: number): string {
  const date = new Date(startedAt);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())} 直播`;
}

function normalizeLimit(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.min(500, Math.floor(value)));
}

function serializePayload(payload: ArchiveEventInput["payload"]): string {
  return typeof payload === "string" ? payload : JSON.stringify(payload);
}

function parseEventPayload(payload: unknown): DanmakuEvent | null {
  if (typeof payload !== "string" || payload.trim() === "") return null;
  try {
    const parsed: unknown = JSON.parse(payload);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as DanmakuEvent;
  } catch {
    return null;
  }
}

function encodeCursor(cursor: ArchiveEventCursor): string {
  return encodeURIComponent(JSON.stringify(cursor));
}

function decodeCursor(value: string | null | undefined): ArchiveEventCursor | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as Partial<ArchiveEventCursor>;
    if (
      typeof parsed.eventTs !== "number" ||
      typeof parsed.ordinal !== "number" ||
      typeof parsed.eventKey !== "string" ||
      (parsed.direction !== "asc" && parsed.direction !== "desc")
    ) {
      throw new Error("invalid cursor fields");
    }
    return parsed as ArchiveEventCursor;
  } catch {
    throw new Error("Invalid archive event cursor");
  }
}

function mapEventRow(row: DatabaseRow): ArchiveEventRecord {
  return {
    eventKey: asString(rowValue(row, "eventKey", "event_key")),
    sessionId: asString(rowValue(row, "sessionId", "session_id")),
    roomId: asNumber(rowValue(row, "roomId", "room_id")),
    ordinal: asNumber(rowValue(row, "ordinal", "ordinal")),
    eventTs: asNumber(rowValue(row, "eventTs", "event_ts")),
    primaryCategory: asString(rowValue(row, "primaryCategory", "primary_category")),
    secondaryCategory: asNullableString(rowValue(row, "secondaryCategory", "secondary_category")),
    userUid: asNullableString(rowValue(row, "userUid", "user_uid")),
    userName: asNullableString(rowValue(row, "userName", "user_name")),
    userNickname: asNullableString(rowValue(row, "userNickname", "user_nickname")),
    searchText: asString(rowValue(row, "searchText", "search_text")),
    payloadJson: asString(rowValue(row, "payloadJson", "payload_json")),
    sourceId: asNullableString(rowValue(row, "sourceId", "source_id")),
    favorited: asNumber(rowValue(row, "favorited", "favorited")) > 0
      || rowValue(row, "favorited", "favorited") === true,
    sessionTitle: asNullableString(rowValue(row, "sessionTitle", "session_title")),
    sessionStartedAt: rowValue(row, "sessionStartedAt", "session_started_at") === null
      || rowValue(row, "sessionStartedAt", "session_started_at") === undefined
      ? undefined
      : asNumber(rowValue(row, "sessionStartedAt", "session_started_at")),
    sessionEndedAt: asNullableNumber(rowValue(row, "sessionEndedAt", "session_ended_at")),
    sessionStatus: asNullableString(rowValue(row, "sessionStatus", "session_status")) as ArchiveEventRecord["sessionStatus"],
    sessionQuality: asNullableString(rowValue(row, "sessionQuality", "session_quality")) as ArchiveEventRecord["sessionQuality"],
    sessionQualityReason: asNullableString(rowValue(row, "sessionQualityReason", "session_quality_reason")),
    sessionRecordingStatus: rowValue(row, 'sessionRecordingStatus', 'session_recording_status') as ArchiveEventRecord['sessionRecordingStatus'],
    sessionStopReason: asNullableString(rowValue(row, 'sessionStopReason', 'session_stop_reason')),
    sessionQualityReasons: parseQualityReasons(rowValue(row, 'sessionQualityReasons', 'session_quality_reasons')),
  };
}

function mapHistoricalFavoriteRow(row: DatabaseRow): ArchiveHistoricalFavoriteRecord {
  const eventJson = asString(rowValue(row, "eventJson", "event_json"));
  const tagsJson = asString(rowValue(row, "tagsJson", "tags_json"), "[]");
  let tags: string[] = [];
  try {
    const parsedTags = JSON.parse(tagsJson) as unknown;
    if (Array.isArray(parsedTags)) tags = parsedTags.filter((value): value is string => typeof value === "string");
  } catch {
    tags = [];
  }
  let event: ArchiveHistoricalFavoriteRecord["event"];
  try {
    const parsed: unknown = JSON.parse(eventJson);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("event payload is not an object");
    }
    event = parsed as ArchiveHistoricalFavoriteRecord["event"];
  } catch (error) {
    throw new Error(`Invalid archive historical favorite ${asString(rowValue(row, "legacyKey", "legacy_key"))}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return {
    legacyKey: asString(rowValue(row, "legacyKey", "legacy_key")),
    roomId: asNumber(rowValue(row, "roomId", "room_id")),
    eventId: asString(rowValue(row, "eventId", "event_id")),
    event,
    favoritedAt: asNumber(rowValue(row, "favoritedAt", "favorited_at")),
    label: asString(rowValue(row, "label", "label")),
    note: asString(rowValue(row, "note", "note")),
    tags,
  };
}

function parseFavoritePayload(payloadJson: string): DanmakuEvent | null {
  try {
    const parsed: unknown = JSON.parse(payloadJson);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as DanmakuEvent : null;
  } catch {
    return null;
  }
}

function mapFavoriteItemRow(row: DatabaseRow): ArchiveFavoriteItem {
  const payloadJson = asString(rowValue(row, "payloadJson", "payload_json"));
  const tagsJson = asString(rowValue(row, "tagsJson", "tags_json"), "[]");
  let tags: string[] = [];
  try {
    const parsed = JSON.parse(tagsJson) as unknown;
    if (Array.isArray(parsed)) tags = parsed.filter((value): value is string => typeof value === "string");
  } catch {
    tags = [];
  }
  return {
    sourceKind: asString(rowValue(row, "sourceKind", "source_kind")) as ArchiveFavoriteItem["sourceKind"],
    stableId: asString(rowValue(row, "stableId", "stable_id")),
    eventKey: asNullableString(rowValue(row, "eventKey", "event_key")),
    legacyKey: asNullableString(rowValue(row, "legacyKey", "legacy_key")),
    sessionId: asNullableString(rowValue(row, "sessionId", "session_id")),
    ownerId: asNullableString(rowValue(row, "ownerId", "owner_id")),
    ownerName: asNullableString(rowValue(row, "ownerName", "owner_name")),
    roomId: asNumber(rowValue(row, "roomId", "room_id")),
    sessionTitle: asNullableString(rowValue(row, "sessionTitle", "session_title")),
    sessionStartedAt: asNullableNumber(rowValue(row, "sessionStartedAt", "session_started_at")),
    sessionEndedAt: asNullableNumber(rowValue(row, "sessionEndedAt", "session_ended_at")),
    eventTs: asNumber(rowValue(row, "eventTs", "event_ts")),
    favoritedAt: asNumber(rowValue(row, "favoritedAt", "favorited_at")),
    primaryCategory: asNullableString(rowValue(row, "primaryCategory", "primary_category")),
    secondaryCategory: asNullableString(rowValue(row, "secondaryCategory", "secondary_category")),
    userUid: asNullableString(rowValue(row, "userUid", "user_uid")),
    userName: asNullableString(rowValue(row, "userName", "user_name")),
    userNickname: asNullableString(rowValue(row, "userNickname", "user_nickname")),
    searchText: asString(rowValue(row, "searchText", "search_text")),
    payloadJson,
    event: parseFavoritePayload(payloadJson),
    canLocate: asNumber(rowValue(row, "canLocate", "can_locate")) > 0
      || rowValue(row, "canLocate", "can_locate") === true,
    label: asNullableString(rowValue(row, "label", "label")),
    note: asString(rowValue(row, "note", "note")),
    tags,
  };
}

function mapOwnerRow(row: DatabaseRow): ArchiveOwnerSummary {
  return {
    ownerId: asString(rowValue(row, "ownerId", "owner_id")),
    roomId: asNumber(rowValue(row, "roomId", "room_id")),
    uid: asNullableString(rowValue(row, "uid", "owner_uid")),
    name: asNullableString(rowValue(row, "name", "owner_name")),
    avatarUrl: asNullableString(rowValue(row, "avatarUrl", "owner_avatar_url")),
    createdAt: asNumber(rowValue(row, "createdAt", "created_at")),
    updatedAt: asNumber(rowValue(row, "updatedAt", "updated_at")),
    sessionCount: asNumber(rowValue(row, "sessionCount", "session_count")),
    eventCount: asNumber(rowValue(row, "eventCount", "event_count")),
    paidTotal: asNumber(rowValue(row, "paidTotal", "paid_total")),
    favoriteCount: asNumber(rowValue(row, "favoriteCount", "favorite_count")),
    incompleteSessionCount: asNumber(rowValue(row, "incompleteSessionCount", "incomplete_session_count")),
    latestSessionAt: asNullableNumber(rowValue(row, "latestSessionAt", "latest_session_at")),
  };
}

function mapSessionRow(row: DatabaseRow): ArchiveSessionSummary {
  const startedAt = asNumber(rowValue(row, "startedAt", "started_at"));
  const endedAt = asNullableNumber(rowValue(row, "endedAt", "ended_at"));
  const storedTitle = asNullableString(rowValue(row, "title", "title"));
  return normalizeArchiveSessionState({
    sessionId: asString(rowValue(row, "sessionId", "session_id")),
    ownerId: asString(rowValue(row, "ownerId", "owner_id")),
    roomId: asNumber(rowValue(row, "roomId", "room_id")),
    title: storedTitle ?? fallbackArchiveTitle(startedAt),
    coverUrl: asNullableString(rowValue(row, "coverUrl", "cover_url")),
    cloudMetadata: readArchiveCloudMetadata(rowValue(row, 'cloudMetadata', 'cloud_metadata')),
    latestTitle: asNullableString(rowValue(row, "latestTitle", "latest_title")),
    titleSource: asString(rowValue(row, "titleSource", "title_source"), "time") as ArchiveSessionSummary["titleSource"],
    liveKey: asNullableString(rowValue(row, "liveKey", "live_key")),
    subSessionKey: asNullableString(rowValue(row, "subSessionKey", "sub_session_key")),
    sourceLiveStartedAt: asNullableNumber(rowValue(row, "sourceLiveStartedAt", "source_live_started_at")),
    identityEvidence: asNullableString(rowValue(row, "identityEvidence", "identity_evidence")) as ArchiveSessionSummary["identityEvidence"],
    startedAt,
    endedAt,
    status: asString(rowValue(row, "status", "status")) as ArchiveSessionSummary["status"],
    quality: asString(rowValue(row, "quality", "quality")) as ArchiveSessionSummary["quality"],
    qualityReason: asNullableString(rowValue(row, "qualityReason", "quality_reason")),
    recordingStatus: rowValue(row, 'recordingStatus', 'recording_status') as ArchiveSessionSummary['recordingStatus'] | undefined,
    stopReason: rowValue(row, 'stopReason', 'stop_reason') as string | null | undefined,
    qualityReasons: parseQualityReasons(rowValue(row, 'qualityReasons', 'quality_reasons')),
    eventCount: asNumber(rowValue(row, "eventCount", "event_count")),
    paidTotal: asNumber(rowValue(row, "paidTotal", "paid_total")),
    favoriteCount: asNumber(rowValue(row, "favoriteCount", "favorite_count")),
    createdAt: asNumber(rowValue(row, "createdAt", "created_at")),
    updatedAt: asNumber(rowValue(row, "updatedAt", "updated_at")),
    durationMs: endedAt === null ? null : Math.max(0, endedAt - startedAt),
  });
}

function parseQualityReasons(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  return typeof value === 'string' ? JSON.parse(value) as string[] : value as string[];
}

function mapSessionInputRow(row: DatabaseRow): ArchiveSessionInput {
  const session = mapSessionRow(row);
  return {
    sessionId: session.sessionId,
    ownerId: session.ownerId,
    roomId: session.roomId,
    title: session.title,
    coverUrl: session.coverUrl,
    cloudMetadata: session.cloudMetadata,
    latestTitle: session.latestTitle,
    titleSource: session.titleSource,
    liveKey: session.liveKey,
    subSessionKey: session.subSessionKey,
    sourceLiveStartedAt: session.sourceLiveStartedAt,
    identityEvidence: session.identityEvidence,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    status: session.status,
    quality: session.quality,
    qualityReason: session.qualityReason,
    recordingStatus: session.recordingStatus,
    stopReason: session.stopReason,
    qualityReasons: session.qualityReasons,
    eventCount: session.eventCount,
    paidTotal: session.paidTotal,
    favoriteCount: session.favoriteCount,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

function mapOwnerInputRow(row: DatabaseRow): ArchiveOwnerInput {
  return {
    ownerId: asString(rowValue(row, "ownerId", "owner_id")),
    roomId: asNumber(rowValue(row, "roomId", "room_id")),
    uid: asNullableString(rowValue(row, "uid", "owner_uid")),
    name: asNullableString(rowValue(row, "name", "owner_name")),
    avatarUrl: asNullableString(rowValue(row, "avatarUrl", "owner_avatar_url")),
    createdAt: asNumber(rowValue(row, "createdAt", "created_at")),
    updatedAt: asNumber(rowValue(row, "updatedAt", "updated_at")),
  };
}

function mapExportEventRow(row: DatabaseRow): ArchiveExportEvent {
  return {
    eventKey: asString(rowValue(row, "eventKey", "event_key")),
    sessionId: asString(rowValue(row, "sessionId", "session_id")),
    roomId: asNumber(rowValue(row, "roomId", "room_id")),
    ordinal: asNumber(rowValue(row, "ordinal", "ordinal")),
    eventTs: asNumber(rowValue(row, "eventTs", "event_ts")),
    primaryCategory: asString(rowValue(row, "primaryCategory", "primary_category")),
    secondaryCategory: asNullableString(rowValue(row, "secondaryCategory", "secondary_category")),
    userUid: asNullableString(rowValue(row, "userUid", "user_uid")),
    userName: asNullableString(rowValue(row, "userName", "user_name")),
    searchText: asString(rowValue(row, "searchText", "search_text")),
    payloadJson: asString(rowValue(row, "payloadJson", "payload_json")),
    sourceId: asNullableString(rowValue(row, "sourceId", "source_id")),
  };
}

function mapNicknameRow(row: DatabaseRow): ArchiveNicknameExport {
  return {
    userUid: asString(rowValue(row, "userUid", "user_uid")),
    nickname: asNullableString(rowValue(row, "nickname", "nickname")),
    updatedAt: asNumber(rowValue(row, "updatedAt", "updated_at")),
  };
}

function mapFavoriteRow(row: DatabaseRow): ArchiveFavoriteExport {
  const tagsJson = asString(rowValue(row, "tagsJson", "tags_json"), "[]");
  let tags: string[] = [];
  try {
    const parsed = JSON.parse(tagsJson) as unknown;
    if (Array.isArray(parsed)) tags = parsed.filter((value): value is string => typeof value === "string");
  } catch {
    tags = [];
  }
  return {
    eventKey: asString(rowValue(row, "eventKey", "event_key")),
    sessionId: asString(rowValue(row, "sessionId", "session_id")),
    favoritedAt: asNumber(rowValue(row, "favoritedAt", "favorited_at")),
    note: asString(rowValue(row, "note", "note")),
    tags,
  };
}

function appendPlaceholder(_conditions: string[], values: unknown[], value: unknown): string {
  values.push(value);
  return `$${values.length}`;
}

function appendInCondition(
  conditions: string[],
  values: unknown[],
  column: string,
  items: readonly string[],
): void {
  if (items.length === 0) {
    return;
  }
  const placeholders = items.map((item) => appendPlaceholder(conditions, values, item));
  conditions.push(`${column} IN (${placeholders.join(", ")})`);
}

function appendOptionalStringFilter(
  conditions: string[],
  values: unknown[],
  column: string,
  value: string | undefined,
): void {
  if (value === undefined || value.trim() === "") {
    return;
  }
  conditions.push(`${column} LIKE ${appendPlaceholder(conditions, values, `%${escapeArchiveLikeValue(value)}%`)} ESCAPE '!'`);
}

function normalizeStatuses(value: ArchiveSessionQuery["status"]): readonly string[] {
  return value === undefined ? [] : typeof value === "string" ? [value] : [...value];
}

function normalizeQualities(value: ArchiveSessionQuery["quality"]): readonly string[] {
  return value === undefined ? [] : typeof value === "string" ? [value] : [...value];
}

function sessionSortColumn(sort: ArchiveSessionQuery["sort"]): string {
  switch (sort) {
    case "duration":
      return "(CASE WHEN s.ended_at IS NULL THEN 0 ELSE s.ended_at - s.started_at END)";
    case "eventCount":
      return "s.event_count";
    case "paidTotal":
      return "s.paid_total";
    case "favoriteCount":
      return "s.favorite_count";
    case "startedAt":
    case undefined:
      return "s.started_at";
  }
}

function normalizeDirection(direction: ArchiveSortDirection | undefined): ArchiveSortDirection {
  return direction === "desc" ? "desc" : "asc";
}

function ownerEventGroupSortColumn(sort: ArchiveOwnerEventGroupQuery["sort"]): string {
  switch (sort) {
    case "sessionStartedAt":
      return "s.started_at";
    case "matchCount":
      return "COUNT(*)";
    case "latestMatch":
    default:
      return "MAX(e.event_ts)";
  }
}

function deleteScopeParts(scope: ArchiveDeleteScope, includeLifecycle = true): { whereSql: string; values: unknown[] } {
  const values: unknown[] = [];
  const conditions: string[] = [];
  if (scope.sessionId !== undefined) {
    conditions.push(`s.session_id = ${appendPlaceholder(conditions, values, scope.sessionId)}`);
  }
  if (scope.sessionIds !== undefined) {
    const sessionIds = [...new Set(scope.sessionIds)];
    if (sessionIds.length === 0) throw new Error("删除范围至少需要一个场次");
    const placeholders = sessionIds.map((sessionId) => appendPlaceholder(conditions, values, sessionId));
    conditions.push(`s.session_id IN (${placeholders.join(", ")})`);
  }
  if (scope.ownerId !== undefined) {
    conditions.push(`s.owner_id = ${appendPlaceholder(conditions, values, scope.ownerId)}`);
  }
  if (scope.ownerUid !== undefined) {
    conditions.push(`o.owner_uid = ${appendPlaceholder(conditions, values, scope.ownerUid)}`);
  }
  if (scope.keepOnlyOwnerId !== undefined) {
    conditions.push(`s.owner_id <> ${appendPlaceholder(conditions, values, scope.keepOnlyOwnerId)}`);
  }
  if (scope.beforeTs !== undefined) {
    conditions.push(`s.started_at < ${appendPlaceholder(conditions, values, scope.beforeTs)}`);
  }
  if (scope.fromTs !== undefined) {
    conditions.push(`s.started_at >= ${appendPlaceholder(conditions, values, scope.fromTs)}`);
  }
  if (scope.toTs !== undefined) {
    conditions.push(`s.started_at < ${appendPlaceholder(conditions, values, scope.toTs)}`);
  }
  if (conditions.length === 0 && !scope.all) {
    throw new Error("Archive delete scope requires an explicit boundary");
  }
  if (conditions.length === 0) conditions.push("1 = 1");
  if (includeLifecycle) {
    conditions.push("s.recording_status = 'stopped'");
  }
  return { whereSql: conditions.join(" AND "), values };
}

function splitAggregateIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.length > 0);
  }
  if (typeof value !== "string" || value.trim() === "") return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string" && item.length > 0);
    }
  } catch {
    // 兼容旧查询返回的逗号分隔值。
  }
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseDeleteSessionSnapshots(value: unknown): ArchiveDeleteSessionSnapshot[] {
  if (value === null || value === undefined || value === "") return [];
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map((item) => {
    const snapshot = item as Record<string, unknown>;
    return {
      sessionId: asString(snapshot.sessionId ?? snapshot.session_id),
      ownerId: asString(snapshot.ownerId ?? snapshot.owner_id),
      status: asString(snapshot.status) as ArchiveDeleteSessionSnapshot["status"],
      ...(snapshot.recordingStatus === undefined ? {} : { recordingStatus: snapshot.recordingStatus as ArchiveDeleteSessionSnapshot['recordingStatus'] }),
      updatedAt: asNumber(snapshot.updatedAt ?? snapshot.updated_at),
      quality: asString(snapshot.quality) as ArchiveDeleteSessionSnapshot["quality"],
    };
  });
}

function scopedSessionIds(sessionIds: readonly string[]): { sql: string; values: unknown[] } {
  const values: unknown[] = [];
  if (sessionIds.length === 0) return { sql: "NULL", values };
  const placeholders = sessionIds.map((sessionId) => appendPlaceholder([], values, sessionId));
  return { sql: placeholders.join(", "), values };
}

function scopedEventUids(uids: readonly string[]): { sql: string; values: unknown[] } {
  const values: unknown[] = [];
  if (uids.length === 0) return { sql: "NULL", values };
  const placeholders = uids.map((uid) => appendPlaceholder([], values, uid));
  return { sql: placeholders.join(", "), values };
}

export class ArchiveRepository implements ArchiveRepositoryContract {
  private readonly database: ArchiveDatabase;
  private readonly transactionExecutor: ArchiveTransactionExecutor;
  private eventCountsReconciled = false;
  private readonly readingStateSaveChains = new Map<string, Promise<void>>();

  constructor(database: ArchiveDatabase, transactionExecutor?: ArchiveTransactionExecutor) {
    this.database = database;
    const databaseTransaction = database.executeTransaction;
    this.transactionExecutor = transactionExecutor
      ?? (databaseTransaction
        ? (statements) => databaseTransaction.call(database, statements)
        : executeArchiveTransaction);
  }

  async initialize(): Promise<void> {
    await initializeArchiveDatabase(this.database);
  }

  private executeTransaction(
    statements: readonly ArchiveTransactionStatement[],
  ): Promise<ArchiveDatabaseResult[]> {
    return this.transactionExecutor(statements);
  }

  private executeWrite(sql: string, values: unknown[] = []): Promise<ArchiveDatabaseResult[]> {
    return this.executeTransaction([{ sql, values }]);
  }

  async getHealthSnapshot(): Promise<ArchiveDatabaseHealth> {
    const unavailable = (error: unknown): ArchiveDatabaseHealth => ({
      available: false,
      schemaVersion: 0,
      ownerCount: 0,
      sourceCount: 0,
      sessionCount: 0,
      eventCount: 0,
      favoriteCount: 0,
      nicknameCount: 0,
      readingStateCount: 0,
      pageCount: 0,
      pageSize: 0,
      bytes: 0,
      error: error instanceof Error ? error.message : String(error),
    });

    try {
      const schemaRows = await this.database.select<DatabaseRow[]>("PRAGMA user_version");
      const pageCountRows = await this.database.select<DatabaseRow[]>("PRAGMA page_count");
      const pageSizeRows = await this.database.select<DatabaseRow[]>("PRAGMA page_size");
      const statsRows = await this.database.select<DatabaseRow[]>(
        `SELECT
          (SELECT COUNT(*) FROM archive_owner o
            WHERE EXISTS (SELECT 1 FROM archive_session s WHERE s.owner_id = o.owner_id)) AS ownerCount,
          (SELECT COUNT(*) FROM archive_source) AS sourceCount,
          (SELECT COUNT(*) FROM archive_session) AS sessionCount,
          (SELECT COUNT(*) FROM archive_event) AS eventCount,
          (SELECT COUNT(*) FROM archive_favorite) AS favoriteCount,
          (SELECT COUNT(*) FROM archive_user_profile) AS nicknameCount,
          (SELECT COUNT(*) FROM archive_reading_state) AS readingStateCount`,
      );
      const schemaVersion = asNumber(rowValue(schemaRows[0] ?? {}, "userVersion", "user_version"));
      const pageCount = asNumber(rowValue(pageCountRows[0] ?? {}, "pageCount", "page_count"));
      const pageSize = asNumber(rowValue(pageSizeRows[0] ?? {}, "pageSize", "page_size"));
      const stats = statsRows[0] ?? {};
      return {
        available: true,
        schemaVersion,
        ownerCount: asNumber(rowValue(stats, "ownerCount", "owner_count")),
        sourceCount: asNumber(rowValue(stats, "sourceCount", "source_count")),
        sessionCount: asNumber(rowValue(stats, "sessionCount", "session_count")),
        eventCount: asNumber(rowValue(stats, "eventCount", "event_count")),
        favoriteCount: asNumber(rowValue(stats, "favoriteCount", "favorite_count")),
        nicknameCount: asNumber(rowValue(stats, "nicknameCount", "nickname_count")),
        readingStateCount: asNumber(rowValue(stats, "readingStateCount", "reading_state_count")),
        pageCount,
        pageSize,
        bytes: pageCount * pageSize,
        error: null,
      };
    } catch (error) {
      return unavailable(error);
    }
  }

  async fillOwnerProfile(input: ArchiveOwnerInput): Promise<void> {
    await this.executeWrite(
      `UPDATE archive_owner SET
        owner_uid = COALESCE(NULLIF(trim(owner_uid), ''), NULLIF(trim($3), '')),
        owner_name = COALESCE(NULLIF(trim(owner_name), ''), NULLIF(trim($4), '')),
        owner_avatar_url = COALESCE(NULLIF(trim(owner_avatar_url), ''), NULLIF(trim($5), ''))
       WHERE owner_id = $1 AND room_id = $2`,
      [input.ownerId, input.roomId, input.uid ?? null, input.name ?? null, input.avatarUrl ?? null],
    );
  }

  async upsertOwner(input: ArchiveOwnerInput): Promise<void> {
    const timestamp = input.updatedAt ?? Date.now();
    const createdAt = input.createdAt ?? timestamp;
    await this.executeWrite(
      `INSERT INTO archive_owner (
        owner_id, room_id, owner_uid, owner_name, owner_avatar_url, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT(owner_id) DO UPDATE SET
        room_id = excluded.room_id,
        owner_uid = COALESCE(NULLIF(trim(excluded.owner_uid), ''), archive_owner.owner_uid),
        owner_name = COALESCE(NULLIF(trim(excluded.owner_name), ''), archive_owner.owner_name),
        owner_avatar_url = COALESCE(NULLIF(trim(excluded.owner_avatar_url), ''), archive_owner.owner_avatar_url),
        updated_at = excluded.updated_at`,
      [
        input.ownerId,
        input.roomId,
        input.uid ?? null,
        input.name ?? null,
        input.avatarUrl ?? null,
        createdAt,
        timestamp,
      ],
    );
  }

  async upsertSession(input: ArchiveSessionInput): Promise<void> {
    input = normalizeArchiveSessionState(input);
    const timestamp = input.updatedAt ?? Date.now();
    const createdAt = input.createdAt ?? timestamp;
    await this.executeWrite(
      `INSERT INTO archive_session (
        session_id, owner_id, room_id, title, cover_url, latest_title, title_source, live_key, sub_session_key,
        source_live_started_at, identity_evidence, started_at, ended_at, status, quality,
        quality_reason, event_count, paid_total, favorite_count, created_at, updated_at,
        recording_status, stop_reason, quality_reasons, cloud_metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
      ON CONFLICT(session_id) DO UPDATE SET
        owner_id = excluded.owner_id,
        room_id = excluded.room_id,
        title = excluded.title,
        cover_url = excluded.cover_url,
        cloud_metadata = COALESCE(excluded.cloud_metadata, archive_session.cloud_metadata),
        latest_title = excluded.latest_title,
        title_source = excluded.title_source,
        live_key = excluded.live_key,
        sub_session_key = excluded.sub_session_key,
        source_live_started_at = excluded.source_live_started_at,
        identity_evidence = excluded.identity_evidence,
        started_at = excluded.started_at,
        ended_at = excluded.ended_at,
        status = excluded.status,
        quality = excluded.quality,
        quality_reason = excluded.quality_reason,
        recording_status = excluded.recording_status,
        stop_reason = excluded.stop_reason,
        quality_reasons = excluded.quality_reasons,
        event_count = excluded.event_count,
        paid_total = excluded.paid_total,
        favorite_count = excluded.favorite_count,
        updated_at = excluded.updated_at`,
      [
        input.sessionId,
        input.ownerId,
        input.roomId,
        input.title ?? null,
        input.coverUrl ?? null,
        input.latestTitle ?? input.title ?? null,
        input.titleSource ?? "time",
        input.liveKey ?? null,
        input.subSessionKey ?? null,
        input.sourceLiveStartedAt ?? null,
        input.identityEvidence ?? "unavailable",
        input.startedAt,
        input.endedAt ?? null,
        input.status,
        input.quality,
        input.qualityReason ?? null,
        input.eventCount ?? 0,
        input.paidTotal ?? 0,
        input.favoriteCount ?? 0,
        createdAt,
        timestamp,
        input.recordingStatus,
        input.stopReason,
        JSON.stringify(input.qualityReasons),
        input.cloudMetadata ? JSON.stringify(input.cloudMetadata) : null,
      ],
    );
  }

  async appendEvents(events: readonly ArchiveEventInput[]): Promise<number> {
    if (events.length === 0) {
      return 0;
    }

    const statements: ArchiveTransactionStatement[] = [];
    const eventResultIndexes: number[] = [];
    const sessionIds = new Set<string>();
    for (const event of events) {
      const contentText = buildArchiveContentTextFromPayload(event.payload, event.searchText);
      eventResultIndexes.push(statements.length);
      statements.push({
        sql: `INSERT INTO archive_event (
          event_key, session_id, room_id, ordinal, event_ts, primary_category,
          secondary_category, user_uid, user_name, search_text, payload_json, source_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT(event_key) DO NOTHING`,
        values: [
          event.eventKey,
          event.sessionId,
          event.roomId,
          event.ordinal,
          event.eventTs,
          normalizeArchivePrimaryCategory(event.primaryCategory),
          event.secondaryCategory ?? null,
          event.userUid ?? null,
          event.userName ?? null,
          contentText,
          serializePayload(event.payload),
          event.sourceId ?? null,
        ],
      });
      statements.push({
        sql: `INSERT INTO archive_search_index (event_key, session_id, search_text)
          SELECT $1, $2, $3
          WHERE EXISTS (SELECT 1 FROM archive_event WHERE event_key = $1)
          ON CONFLICT(event_key) DO UPDATE SET search_text = excluded.search_text`,
        values: [event.eventKey, event.sessionId, contentText],
      });
      sessionIds.add(event.sessionId);
    }

    const updatedAt = Date.now();
    for (const sessionId of sessionIds) {
      statements.push({
        sql: `UPDATE archive_session
          SET event_count = (SELECT COUNT(*) FROM archive_event WHERE session_id = $1),
              updated_at = $2
          WHERE session_id = $1`,
        values: [sessionId, updatedAt],
      });
    }

    const results = await this.executeTransaction(statements);
    return eventResultIndexes.reduce(
      (count, index) => count + (results[index]?.rowsAffected ?? 0),
      0,
    );
  }

  async getNextEventOrdinal(sessionId: string): Promise<number> {
    const rows = await this.database.select<DatabaseRow[]>(
      `SELECT COALESCE(MAX(ordinal) + 1, 0) AS nextOrdinal
       FROM archive_event
       WHERE session_id = $1`,
      [sessionId],
    );
    return Math.max(0, Math.floor(asNumber(rowValue(rows[0] ?? {}, "nextOrdinal", "next_ordinal"))));
  }

  async updateEvent(input: ArchiveEventUpdate): Promise<void> {
    if (input.patch.scDeleted === undefined) return;
    await this.executeWrite(
      `UPDATE archive_event
       SET payload_json = json_set(payload_json, '$.scDeleted', json('true'))
       WHERE event_key = $1`,
      [input.eventKey],
    );
  }

  async reassignSourceEventRange(input: ArchiveSourceEventRangeUpdate): Promise<number> {
    if (!/^(0|[1-9][0-9]*)$/.test(input.fromSequence) || !/^(0|[1-9][0-9]*)$/.test(input.throughSequence)
      || BigInt(input.fromSequence) > BigInt(input.throughSequence)) throw new Error('恢复记录的归属范围无效');
    if (input.targetSessionId === null) return 0;
    let changed = 0;
    while (true) {
      const rows = await this.database.select<DatabaseRow[]>(
      `SELECT event_key, session_id
       FROM archive_event
       WHERE json_valid(event_key)
         AND json_extract(event_key, '$[0]') = $1
         AND json_extract(event_key, '$[1]') = $2
         AND json_extract(event_key, '$[2]') = $3
         AND (length(CAST(json_extract(event_key, '$[3]') AS TEXT)) > length($4)
           OR (length(CAST(json_extract(event_key, '$[3]') AS TEXT)) = length($4)
             AND CAST(json_extract(event_key, '$[3]') AS TEXT) >= $4))
         AND (length(CAST(json_extract(event_key, '$[3]') AS TEXT)) < length($5)
           OR (length(CAST(json_extract(event_key, '$[3]') AS TEXT)) = length($5)
             AND CAST(json_extract(event_key, '$[3]') AS TEXT) <= $5))
         AND session_id <> $6
       ORDER BY length(CAST(json_extract(event_key, '$[3]') AS TEXT)),
         CAST(json_extract(event_key, '$[3]') AS TEXT),
         CAST(json_extract(event_key, '$[4]') AS INTEGER)
       LIMIT 256`,
        [input.namespace, input.serverId, input.roomId, input.fromSequence, input.throughSequence,
          input.targetSessionId],
      );
      if (!rows.length) return changed;
      let ordinal = await this.getNextEventOrdinal(input.targetSessionId);
      const statements: ArchiveTransactionStatement[] = [];
      const sourceSessionIds = new Set<string>();
      for (const row of rows) {
        const eventKey = String(rowValue(row, 'event_key', 'eventKey'));
        sourceSessionIds.add(String(rowValue(row, 'session_id', 'sessionId')));
        statements.push(
          { sql: 'UPDATE archive_favorite SET session_id = $1 WHERE event_key = $2',
            values: [input.targetSessionId, eventKey] },
          { sql: 'UPDATE archive_search_index SET session_id = $1 WHERE event_key = $2',
            values: [input.targetSessionId, eventKey] },
          { sql: 'UPDATE archive_event SET session_id = $1, ordinal = $2 WHERE event_key = $3',
            values: [input.targetSessionId, ordinal++, eventKey] },
        );
      }
      for (const sessionId of new Set([...sourceSessionIds, input.targetSessionId])) statements.push({
        sql: `UPDATE archive_session SET favorite_count = (
          SELECT COUNT(*) FROM archive_favorite WHERE session_id = $1
        ) WHERE session_id = $1`,
        values: [sessionId],
      });
      await this.executeTransaction(statements);
      changed += rows.length;
    }
  }

  async updateSession(input: ArchiveSessionUpdate): Promise<void> {
    const assignments: string[] = [];
    const values: unknown[] = [];
    const add = (column: string, value: unknown): void => {
      values.push(value);
      assignments.push(`${column} = $${values.length}`);
    };

    if (hasOwn(input, "title") && input.title !== undefined) add("title", input.title);
    if (hasOwn(input, "coverUrl") && input.coverUrl !== undefined) add("cover_url", input.coverUrl);
    if (hasOwn(input, "latestTitle") && input.latestTitle !== undefined) add("latest_title", input.latestTitle);
    if (hasOwn(input, "titleSource") && input.titleSource !== undefined) add("title_source", input.titleSource);
    if (hasOwn(input, "liveKey") && input.liveKey !== undefined) add("live_key", input.liveKey);
    if (hasOwn(input, "subSessionKey") && input.subSessionKey !== undefined) add("sub_session_key", input.subSessionKey);
    if (hasOwn(input, "sourceLiveStartedAt") && input.sourceLiveStartedAt !== undefined) add("source_live_started_at", input.sourceLiveStartedAt);
    if (input.startedAt !== undefined) add('started_at', input.startedAt);
    if (input.cloudMetadata !== undefined) add('cloud_metadata', input.cloudMetadata === null ? null : JSON.stringify(input.cloudMetadata));
    if (hasOwn(input, "identityEvidence") && input.identityEvidence !== undefined) add("identity_evidence", input.identityEvidence);
    if (hasOwn(input, "endedAt") && input.endedAt !== undefined) add("ended_at", input.endedAt);
    if (hasOwn(input, "status") && input.status !== undefined) add("status", input.status);
    if (hasOwn(input, "quality") && input.quality !== undefined) add("quality", input.quality);
    if (hasOwn(input, "qualityReason") && input.qualityReason !== undefined) add("quality_reason", input.qualityReason);
    if (input.recordingStatus !== undefined) add('recording_status', input.recordingStatus);
    if (input.stopReason !== undefined) add('stop_reason', input.stopReason);
    if (input.qualityReasons !== undefined) add('quality_reasons', JSON.stringify(input.qualityReasons));
    if (hasOwn(input, "eventCount") && input.eventCount !== undefined) add("event_count", input.eventCount);
    if (hasOwn(input, "paidTotal") && input.paidTotal !== undefined) add("paid_total", input.paidTotal);
    if (hasOwn(input, "favoriteCount") && input.favoriteCount !== undefined) add("favorite_count", input.favoriteCount);
    add("updated_at", input.updatedAt ?? Date.now());
    values.push(input.sessionId);
    const sessionPlaceholder = `$${values.length}`;

    await this.executeWrite(
      `UPDATE archive_session SET ${assignments.join(", ")} WHERE session_id = ${sessionPlaceholder}`,
      values,
    );
  }

  async recomputePaidTotals(sessionIds?: readonly string[]): Promise<number> {
    const scope = sessionIds === undefined ? null : scopedSessionIds([...new Set(sessionIds)]);
    if (scope && scope.values.length === 0) return 0;
    const rows = await this.database.select<DatabaseRow[]>(
      `SELECT
        s.session_id AS sessionId,
        s.paid_total AS paidTotal,
        e.event_key AS eventKey,
        e.ordinal AS ordinal,
        e.payload_json AS payloadJson
       FROM archive_session s
       LEFT JOIN archive_event e ON e.session_id = s.session_id
         AND CASE WHEN json_valid(e.payload_json)
           THEN json_extract(e.payload_json, '$.msgType') IN (
             ${MsgType.Gift}, ${MsgType.SuperChat}, ${MsgType.GuardBuy}, ${MsgType.GuardHonor}
           ) ELSE 0 END
       ${scope ? `WHERE s.session_id IN (${scope.sql})` : ''}
       ORDER BY s.session_id ASC, e.ordinal ASC, e.event_key ASC`,
      scope?.values ?? [],
    );
    const sessionStates = new Map<string, {
      currentTotal: number;
      mutations: ArchiveAppendMutation[];
    }>();

    for (const row of rows) {
      const sessionId = asString(rowValue(row, "sessionId", "session_id"));
      if (!sessionId) continue;
      let state = sessionStates.get(sessionId);
      if (!state) {
        state = {
          currentTotal: asNumber(rowValue(row, "paidTotal", "paid_total")),
          mutations: [],
        };
        sessionStates.set(sessionId, state);
      }

      const payload = parseEventPayload(rowValue(row, "payloadJson", "payload_json"));
      if (!payload) continue;
      state.mutations.push({
        kind: "append",
        type: "append",
        eventKey: asString(rowValue(row, "eventKey", "event_key")),
        event: payload,
      });
    }

    const updates: Array<{
      sessionId: string;
      paidTotal: number;
      expectedPaidTotal: number;
    }> = [];
    for (const [sessionId, state] of sessionStates) {
      const paidTotal = applyArchivePaidTotal(
        { total: 0, comboAmounts: {}, finalizedCombos: {} },
        state.mutations,
      ).total;
      if (paidTotal !== state.currentTotal) {
        updates.push({
          sessionId,
          paidTotal,
          expectedPaidTotal: state.currentTotal,
        });
      }
    }

    const updatedAt = Date.now();
    const statements = updates.map((update): ArchiveTransactionStatement => ({
      sql: `UPDATE archive_session
        SET paid_total = $1, updated_at = $2
        WHERE session_id = $3 AND paid_total = $4`,
      values: [update.paidTotal, updatedAt, update.sessionId, update.expectedPaidTotal],
    }));
    const results = await this.executeTransaction(statements);
    return results.reduce((count, result) => count + result.rowsAffected, 0);
  }

  async recomputeEventCounts(sessionIds?: readonly string[]): Promise<number> {
    const scope = sessionIds === undefined ? null : scopedSessionIds([...new Set(sessionIds)]);
    if (scope && scope.values.length === 0) return 0;
    const results = await this.executeWrite(
      `UPDATE archive_session
       SET event_count = (
         SELECT COUNT(*)
         FROM archive_event e
         WHERE e.session_id = archive_session.session_id
       )
       WHERE ${scope ? `session_id IN (${scope.sql}) AND ` : ''}COALESCE(event_count, 0) <> (
         SELECT COUNT(*)
         FROM archive_event e
         WHERE e.session_id = archive_session.session_id
       )`, scope?.values ?? [],
    );
    this.eventCountsReconciled = true;
    return results.reduce((count, result) => count + result.rowsAffected, 0);
  }

  async listOwners(query: ArchiveOwnerQuery = {}): Promise<ArchiveOwnerSummary[]> {
    const conditions: string[] = [
      "EXISTS (SELECT 1 FROM archive_session s WHERE s.owner_id = o.owner_id)",
    ];
    const values: unknown[] = [];
    if (query.searchText?.trim()) {
      const pattern = `%${escapeArchiveLikeValue(query.searchText)}%`;
      const first = appendPlaceholder(conditions, values, pattern);
      const second = appendPlaceholder(conditions, values, pattern);
      const third = appendPlaceholder(conditions, values, pattern);
      conditions.push(`(
        o.owner_name LIKE ${first} ESCAPE '!'
        OR o.owner_uid LIKE ${second} ESCAPE '!'
        OR CAST(o.room_id AS TEXT) LIKE ${third} ESCAPE '!'
      )`);
    }
    const limit = appendPlaceholder(conditions, values, normalizeLimit(query.limit, 100));
    const where = conditions.length === 0 ? "" : `WHERE ${conditions.join(" AND ")}`;
    const rows = await this.database.select<DatabaseRow[]>(
      `WITH session_metrics AS (
        SELECT
          s.owner_id,
          COUNT(*) AS session_count,
          COALESCE(SUM(s.paid_total), 0) AS paid_total,
          COALESCE(SUM(s.favorite_count), 0) AS favorite_count,
          COALESCE(SUM(CASE WHEN s.quality = 'incomplete' THEN 1 ELSE 0 END), 0) AS incomplete_session_count,
          MAX(s.started_at) AS latest_session_at
        FROM archive_session s
        GROUP BY s.owner_id
      ), event_metrics AS (
        ${this.eventCountsReconciled
          ? `SELECT
          s.owner_id,
          COALESCE(SUM(s.event_count), 0) AS event_count
        FROM archive_session s
        GROUP BY s.owner_id`
          : `SELECT
          s.owner_id,
          COUNT(DISTINCT e.event_key) AS event_count
        FROM archive_session s
        LEFT JOIN archive_event e ON e.session_id = s.session_id
        GROUP BY s.owner_id`}
      )
      SELECT
        o.owner_id AS ownerId,
        o.room_id AS roomId,
        o.owner_uid AS uid,
        o.owner_name AS name,
        o.owner_avatar_url AS avatarUrl,
        o.created_at AS createdAt,
        o.updated_at AS updatedAt,
        COALESCE(sm.session_count, 0) AS sessionCount,
        COALESCE(em.event_count, 0) AS eventCount,
        COALESCE(sm.paid_total, 0) AS paidTotal,
        COALESCE(sm.favorite_count, 0) AS favoriteCount,
        COALESCE(sm.incomplete_session_count, 0) AS incompleteSessionCount,
        sm.latest_session_at AS latestSessionAt
      FROM archive_owner o
      LEFT JOIN session_metrics sm ON sm.owner_id = o.owner_id
      LEFT JOIN event_metrics em ON em.owner_id = o.owner_id
      ${where}
      ORDER BY o.updated_at DESC, o.owner_id ASC
      LIMIT ${limit}`,
      values,
    );
    return rows.map(mapOwnerRow);
  }

  async listSessions(query: ArchiveSessionQuery = {}): Promise<ArchiveSessionSummary[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (query.ownerId !== undefined) {
      conditions.push(`s.owner_id = ${appendPlaceholder(conditions, values, query.ownerId)}`);
    }
    appendOptionalStringFilter(conditions, values, "s.title", query.searchText);
    const statuses = normalizeStatuses(query.status);
    appendInCondition(conditions, values, "s.status", statuses);
    const recordingStatuses = query.recordingStatus === undefined ? []
      : Array.isArray(query.recordingStatus) ? query.recordingStatus : [query.recordingStatus];
    appendInCondition(conditions, values, 's.recording_status', recordingStatuses);
    const qualities = normalizeQualities(query.quality);
    appendInCondition(conditions, values, "s.quality", qualities);
    if (query.favoriteOnly) {
      conditions.push("s.favorite_count > 0");
    }
    if (query.fromTs !== undefined) {
      conditions.push(`s.started_at >= ${appendPlaceholder(conditions, values, query.fromTs)}`);
    }
    if (query.toTs !== undefined) {
      conditions.push(`s.started_at < ${appendPlaceholder(conditions, values, query.toTs)}`);
    }
    if (query.filters) {
      const eventFilter = buildArchiveQuery(query.filters, {
        eventAlias: "ae",
        favoriteAlias: "af",
        profileAlias: "ap",
        placeholderOffset: values.length,
      });
      if (eventFilter.whereSql) {
        conditions.push(`EXISTS (
          SELECT 1
          FROM archive_event ae
          ${eventFilter.joinsSql}
          WHERE ae.session_id = s.session_id AND ${eventFilter.whereSql}
        )`);
        values.push(...eventFilter.values);
      }
    }
    const limit = appendPlaceholder(conditions, values, normalizeLimit(query.limit, 100));
    const offset = query.offset === undefined || !Number.isFinite(query.offset)
      ? 0
      : Math.max(0, Math.floor(query.offset));
    const offsetPlaceholder = appendPlaceholder(conditions, values, offset);
    const direction = normalizeDirection(query.direction);
    const sortColumn = sessionSortColumn(query.sort);
    const where = conditions.length === 0 ? "" : `WHERE ${conditions.join(" AND ")}`;
    const rows = await this.database.select<DatabaseRow[]>(
      `SELECT ${SESSION_COLUMNS}
       FROM archive_session s
       ${where}
       ORDER BY CASE WHEN s.recording_status IN ('recording', 'reconnecting') THEN 0 ELSE 1 END ASC,
         ${sortColumn} ${direction.toUpperCase()}, s.session_id ASC
       LIMIT ${limit} OFFSET ${offsetPlaceholder}`,
      values,
    );
    return rows.map(mapSessionRow);
  }

  async findResumableSession(roomId: number, sourceLiveStartedAt: number): Promise<ArchiveSessionSummary | null> {
    if (!Number.isFinite(roomId) || !Number.isFinite(sourceLiveStartedAt) || sourceLiveStartedAt <= 0) {
      return null;
    }
    const rows = await this.database.select<DatabaseRow[]>(
      `SELECT ${SESSION_COLUMNS}
       FROM archive_session s
       WHERE s.room_id = $1
         AND s.source_live_started_at = $2
         AND s.status IN ('active', 'unclean')
       ORDER BY s.updated_at DESC, s.started_at DESC, s.session_id DESC
       LIMIT 1`,
      [roomId, sourceLiveStartedAt],
    );
    const row = rows[0];
    return row ? mapSessionRow(row) : null;
  }

  async queryOwnerEventGroups(
    query: ArchiveOwnerEventGroupQuery,
  ): Promise<ArchiveOwnerEventGroupPage> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    conditions.push(`s.owner_id = ${appendPlaceholder(conditions, values, query.ownerId)}`);
    const eventFilter = buildArchiveQuery(query.filters, {
      eventAlias: "e",
      favoriteAlias: "af",
      profileAlias: "ap",
      placeholderOffset: values.length,
    });
    if (eventFilter.whereSql) {
      conditions.push(eventFilter.whereSql);
      values.push(...eventFilter.values);
    }

    const groupLimit = Math.min(200, normalizeLimit(query.groupLimit, 50));
    const previewLimit = Math.min(3, normalizeLimit(query.previewLimit, 3));
    const offset = query.offset === undefined || !Number.isFinite(query.offset)
      ? 0
      : Math.max(0, Math.floor(query.offset));
    const limitPlaceholder = appendPlaceholder([], values, groupLimit + 1);
    const offsetPlaceholder = appendPlaceholder([], values, offset);
    const direction = query.direction === "asc" ? "ASC" : "DESC";
    const sortColumn = ownerEventGroupSortColumn(query.sort);
    const aggregateRows = await this.database.select<DatabaseRow[]>(
      `SELECT ${SESSION_COLUMNS},
        COUNT(*) AS matchCount,
        MAX(e.event_ts) AS latestMatchTs
       FROM archive_session s
       JOIN archive_event e ON e.session_id = s.session_id
       ${eventFilter.joinsSql}
       WHERE ${conditions.join(" AND ")}
       GROUP BY s.session_id
       ORDER BY ${sortColumn} ${direction}, s.session_id ASC
       LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
      values,
    );

    const hasMore = aggregateRows.length > groupLimit;
    const pageRows = aggregateRows.slice(0, groupLimit);
    const nextOffset = hasMore ? offset + groupLimit : null;
    if (pageRows.length === 0) {
      return { items: [], nextOffset, hasMore };
    }

    const sessionIds = scopedSessionIds(pageRows.map((row) => asString(rowValue(row, "sessionId", "session_id"))));
    const previewValues = [...sessionIds.values];
    const previewFilter = buildArchiveQuery(query.filters, {
      eventAlias: "e",
      favoriteAlias: "af",
      profileAlias: "ap",
      placeholderOffset: previewValues.length,
    });
    const previewConditions = [`e.session_id IN (${sessionIds.sql})`];
    if (previewFilter.whereSql) {
      previewConditions.push(previewFilter.whereSql);
      previewValues.push(...previewFilter.values);
    }
    const previewLimitPlaceholder = appendPlaceholder([], previewValues, previewLimit);
    const previewRows = await this.database.select<DatabaseRow[]>(
      `SELECT ranked.*
       FROM (
         SELECT
           e.event_key AS eventKey,
           e.session_id AS sessionId,
           e.room_id AS roomId,
           e.ordinal AS ordinal,
           e.event_ts AS eventTs,
           e.primary_category AS primaryCategory,
           e.secondary_category AS secondaryCategory,
           e.user_uid AS userUid,
           e.user_name AS userName,
           ap.nickname AS userNickname,
           e.search_text AS searchText,
           e.payload_json AS payloadJson,
           e.source_id AS sourceId,
           CASE WHEN af.event_key IS NULL THEN 0 ELSE 1 END AS favorited,
           s.title AS sessionTitle,
           s.started_at AS sessionStartedAt,
           s.ended_at AS sessionEndedAt,
           s.status AS sessionStatus,
           s.quality AS sessionQuality,
           s.quality_reason AS sessionQualityReason,
           s.recording_status AS sessionRecordingStatus,
           s.stop_reason AS sessionStopReason,
           s.quality_reasons AS sessionQualityReasons,
           ROW_NUMBER() OVER (
             PARTITION BY e.session_id
             ORDER BY e.event_ts ASC, e.ordinal ASC, e.event_key ASC
           ) AS previewRank
         FROM archive_event e
         JOIN archive_session s ON s.session_id = e.session_id
         ${previewFilter.joinsSql}
         WHERE ${previewConditions.join(" AND ")}
       ) ranked
       WHERE ranked.previewRank <= ${previewLimitPlaceholder}
       ORDER BY ranked.sessionId ASC, ranked.eventTs ASC, ranked.ordinal ASC, ranked.eventKey ASC`,
      previewValues,
    );
    const previewsBySession = new Map<string, ArchiveEventRecord[]>();
    for (const row of previewRows) {
      const event = mapEventRow(row);
      const matches = previewsBySession.get(event.sessionId);
      if (matches) {
        matches.push(event);
      } else {
        previewsBySession.set(event.sessionId, [event]);
      }
    }

    const items: ArchiveOwnerEventMatchGroup[] = pageRows.map((row) => {
      const session = mapSessionRow(row);
      return {
        session,
        matchCount: asNumber(rowValue(row, "matchCount", "match_count")),
        latestMatchTs: asNumber(rowValue(row, "latestMatchTs", "latest_match_ts")),
        matches: previewsBySession.get(session.sessionId) ?? [],
      };
    });
    return { items, nextOffset, hasMore };
  }

  async getSession(sessionId: string): Promise<ArchiveSessionSummary | null> {
    const rows = await this.database.select<DatabaseRow[]>(
      `SELECT ${SESSION_COLUMNS}
       FROM archive_session s
       WHERE s.session_id = $1
       LIMIT 1`,
      [sessionId],
    );
    return rows.length === 0 ? null : mapSessionRow(rows[0]);
  }

  private async findEventAnchor(
    query: ArchiveEventQuery,
    filters: ArchiveFilterState,
    direction: ArchiveSortDirection,
  ): Promise<ArchiveEventCursor | null> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (query.sessionId !== undefined) {
      conditions.push(`e.session_id = ${appendPlaceholder(conditions, values, query.sessionId)}`);
    }
    if (query.ownerId !== undefined) {
      conditions.push(`s.owner_id = ${appendPlaceholder(conditions, values, query.ownerId)}`);
    }
    const eventFilter = buildArchiveQuery(filters, { placeholderOffset: values.length });
    if (eventFilter.whereSql) {
      conditions.push(eventFilter.whereSql);
      values.push(...eventFilter.values);
    }
    const fromSql = `FROM archive_event e
       JOIN archive_session s ON s.session_id = e.session_id
       ${eventFilter.joinsSql}`;
    const wherePrefix = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")} AND ` : "WHERE ";

    if (query.anchor?.eventKey) {
      const exactValues = [...values, query.anchor.eventKey];
      const exactPlaceholder = `$${exactValues.length}`;
      const rows = await this.database.select<DatabaseRow[]>(
        `SELECT e.event_ts AS eventTs, e.ordinal AS ordinal, e.event_key AS eventKey
         ${fromSql}
         ${wherePrefix}e.event_key = ${exactPlaceholder}
         LIMIT 1`,
        exactValues,
      );
      const exact = rows[0];
      if (exact) {
        return {
          eventTs: asNumber(rowValue(exact, "eventTs", "event_ts")),
          ordinal: asNumber(rowValue(exact, "ordinal", "ordinal")),
          eventKey: asString(rowValue(exact, "eventKey", "event_key")),
          direction,
        };
      }
    }

    if (query.anchor?.fallbackEventTs === null || query.anchor?.fallbackEventTs === undefined) {
      return null;
    }
    const nearestValues = [...values, query.anchor.fallbackEventTs];
    const nearestPlaceholder = `$${nearestValues.length}`;
    const rows = await this.database.select<DatabaseRow[]>(
      `SELECT e.event_ts AS eventTs, e.ordinal AS ordinal, e.event_key AS eventKey
       ${fromSql}
       ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")} AND ` : "WHERE "}1 = 1
       ORDER BY ABS(e.event_ts - ${nearestPlaceholder}) ASC,
         e.event_ts ${direction.toUpperCase()}, e.ordinal ${direction.toUpperCase()}, e.event_key ${direction.toUpperCase()}
       LIMIT 1`,
      nearestValues,
    );
    const nearest = rows[0];
    if (!nearest) return null;
    return {
      eventTs: asNumber(rowValue(nearest, "eventTs", "event_ts")),
      ordinal: asNumber(rowValue(nearest, "ordinal", "ordinal")),
      eventKey: asString(rowValue(nearest, "eventKey", "event_key")),
      direction,
    };
  }

  async queryEvents(query: ArchiveEventQuery): Promise<ArchiveEventPage> {
    const cursor = decodeCursor(query.cursor);
    const direction = cursor?.direction ?? normalizeDirection(query.direction);
    const filters: ArchiveFilterState = query.filters ?? {};
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (query.sessionId !== undefined) {
      conditions.push(`e.session_id = ${appendPlaceholder(conditions, values, query.sessionId)}`);
    }
    if (query.ownerId !== undefined) {
      conditions.push(`s.owner_id = ${appendPlaceholder(conditions, values, query.ownerId)}`);
    }
    const eventFilter = buildArchiveQuery(filters, {
      placeholderOffset: values.length,
    });
    if (eventFilter.whereSql) {
      conditions.push(eventFilter.whereSql);
      values.push(...eventFilter.values);
    }

    // 总数必须基于筛选条件统计，不能把游标/锚点条件算进去；否则第二页开始会把总数误报成剩余数量。
    const totalConditions = [...conditions];
    const totalValues = [...values];

    if (cursor) {
      const eventTs = appendPlaceholder(conditions, values, cursor.eventTs);
      const ordinal = appendPlaceholder(conditions, values, cursor.ordinal);
      const eventKey = appendPlaceholder(conditions, values, cursor.eventKey);
      const operator = direction === "asc" ? ">" : "<";
      conditions.push(`(
        e.event_ts ${operator} ${eventTs}
        OR (e.event_ts = ${eventTs} AND e.ordinal ${operator} ${ordinal})
        OR (e.event_ts = ${eventTs} AND e.ordinal = ${ordinal} AND e.event_key ${operator} ${eventKey})
      )`);
    } else if (query.anchor?.eventKey || (query.anchor?.fallbackEventTs !== null && query.anchor?.fallbackEventTs !== undefined)) {
      const anchor = await this.findEventAnchor(query, filters, direction);
      if (anchor) {
        const eventTs = appendPlaceholder(conditions, values, anchor.eventTs);
        const ordinal = appendPlaceholder(conditions, values, anchor.ordinal);
        const eventKey = appendPlaceholder(conditions, values, anchor.eventKey);
        const operator = direction === "asc" ? ">" : "<";
        const inclusiveOperator = direction === "asc" ? ">=" : "<=";
        conditions.push(`(
          e.event_ts ${operator} ${eventTs}
          OR (e.event_ts = ${eventTs} AND e.ordinal ${operator} ${ordinal})
          OR (e.event_ts = ${eventTs} AND e.ordinal = ${ordinal} AND e.event_key ${inclusiveOperator} ${eventKey})
        )`);
      }
    }

    const limitValue = normalizeLimit(query.limit, 100);
    const limit = appendPlaceholder(conditions, values, limitValue + 1);
    const where = conditions.length === 0 ? "" : `WHERE ${conditions.join(" AND ")}`;
    const rows = await this.database.select<DatabaseRow[]>(
      `SELECT
        e.event_key AS eventKey,
        e.session_id AS sessionId,
        e.room_id AS roomId,
        e.ordinal AS ordinal,
        e.event_ts AS eventTs,
        e.primary_category AS primaryCategory,
        e.secondary_category AS secondaryCategory,
        e.user_uid AS userUid,
        e.user_name AS userName,
        p.nickname AS userNickname,
        e.search_text AS searchText,
        e.payload_json AS payloadJson,
        e.source_id AS sourceId,
        CASE WHEN f.event_key IS NULL THEN 0 ELSE 1 END AS favorited,
        s.title AS sessionTitle,
        s.started_at AS sessionStartedAt,
        s.ended_at AS sessionEndedAt,
        s.status AS sessionStatus,
        s.quality AS sessionQuality,
        s.quality_reason AS sessionQualityReason,
        s.recording_status AS sessionRecordingStatus,
        s.stop_reason AS sessionStopReason,
        s.quality_reasons AS sessionQualityReasons
       FROM archive_event e
       JOIN archive_session s ON s.session_id = e.session_id
       ${eventFilter.joinsSql}
       ${where}
       ORDER BY e.event_ts ${direction.toUpperCase()}, e.ordinal ${direction.toUpperCase()}, e.event_key ${direction.toUpperCase()}
       LIMIT ${limit}`,
      values,
    );

    const pageRows = rows.slice(0, limitValue).map(mapEventRow);
    const hasNextPage = rows.length > limitValue;
    const last = pageRows[pageRows.length - 1];
    let totalCount: number | null = null;
    if (!cursor && query.includeTotal) {
      const totalWhere = totalConditions.length === 0 ? "" : `WHERE ${totalConditions.join(" AND ")}`;
      const totalRows = await this.database.select<DatabaseRow[]>(
        `SELECT COUNT(DISTINCT e.event_key) AS totalCount
         FROM archive_event e
         JOIN archive_session s ON s.session_id = e.session_id
         ${eventFilter.joinsSql}
         ${totalWhere}`,
        totalValues,
      );
      totalCount = asNumber(rowValue(totalRows[0], "totalCount", "total_count"));
    }
    return {
      items: pageRows,
      nextCursor: hasNextPage && last
        ? encodeCursor({
          eventTs: last.eventTs,
          ordinal: last.ordinal,
          eventKey: last.eventKey,
          direction,
        })
        : null,
      totalCount,
    };
  }

  async queryFavorites(query: ArchiveFavoriteQuery = {}): Promise<ArchiveFavoritePage> {
    const plan = buildArchiveFavoriteQueryPlan(query);
    const rows = await this.database.select<DatabaseRow[]>(plan.pageSql, plan.pageValues);
    const pageRows = rows.slice(0, plan.limit).map(mapFavoriteItemRow);
    const hasNextPage = rows.length > plan.limit;
    const last = pageRows[pageRows.length - 1];
    let totalCount: number | null = null;
    if (!query.cursor && query.includeTotal) {
      const totalRows = await this.database.select<DatabaseRow[]>(plan.totalSql, plan.totalValues);
      totalCount = asNumber(rowValue(totalRows[0] ?? {}, "totalCount", "total_count"));
    }
    return {
      items: pageRows,
      nextCursor: hasNextPage && last
        ? encodeArchiveFavoritePageCursor(last, query.sort === "eventTs" ? "eventTs" : "favoritedAt", plan.direction)
        : null,
      totalCount,
    };
  }

  async setFavorite(eventKey: string, favorited: boolean, favoritedAt?: number): Promise<void> {
    const now = Date.now();
    const statements: ArchiveTransactionStatement[] = [];
    if (favorited) {
      statements.push({
        sql: `INSERT INTO archive_favorite (event_key, session_id, favorited_at)
          SELECT event_key, session_id, $2
          FROM archive_event
          WHERE event_key = $1
          ON CONFLICT(event_key) DO NOTHING`,
        values: [eventKey, favoritedAt ?? now],
      });
    } else {
      statements.push({
        sql: "DELETE FROM archive_favorite_event_tag WHERE event_key = $1",
        values: [eventKey],
      });
      statements.push({
        sql: "DELETE FROM archive_favorite WHERE event_key = $1",
        values: [eventKey],
      });
    }
    statements.push({
      sql: `UPDATE archive_session
        SET favorite_count = (
          SELECT COUNT(*) FROM archive_favorite WHERE session_id = archive_session.session_id
        ), updated_at = $2
        WHERE session_id = (
          SELECT session_id FROM archive_event WHERE event_key = $1
        )`,
      values: [eventKey, now],
    });
    await this.executeTransaction(statements);
  }

  async removeFavoriteItem(target: ArchiveFavoriteOrganizationTarget): Promise<void> {
    if (target.sourceKind === "archive") {
      await this.setFavorite(target.stableId, false);
      return;
    }
    await this.executeWrite("DELETE FROM archive_historical_favorite WHERE legacy_key = $1", [target.stableId]);
  }

  async removeFavorites(targets: readonly ArchiveFavoriteOrganizationTarget[]): Promise<void> {
    const uniqueTargets = [...new Map(targets.map((target) => [`${target.sourceKind}:${target.stableId}`, target])).values()];
    if (uniqueTargets.length === 0) return;
    const statements: ArchiveTransactionStatement[] = [];
    const archiveKeys = uniqueTargets.filter((target) => target.sourceKind === "archive").map((target) => target.stableId);
    const historicalKeys = uniqueTargets.filter((target) => target.sourceKind === "historical").map((target) => target.stableId);
    if (archiveKeys.length > 0) {
      const placeholders = archiveKeys.map((_, index) => `$${index + 1}`).join(", ");
      statements.push({
        sql: `DELETE FROM archive_favorite_event_tag WHERE event_key IN (${placeholders})`,
        values: archiveKeys,
      });
      statements.push({
        sql: `DELETE FROM archive_favorite WHERE event_key IN (${placeholders})`,
        values: archiveKeys,
      });
      statements.push({
        sql: `UPDATE archive_session SET favorite_count = (
          SELECT COUNT(*) FROM archive_favorite WHERE session_id = archive_session.session_id
        ), updated_at = $${archiveKeys.length + 1}
        WHERE session_id IN (
          SELECT session_id FROM archive_event WHERE event_key IN (${placeholders})
        )`,
        values: [...archiveKeys, Date.now()],
      });
    }
    if (historicalKeys.length > 0) {
      const placeholders = historicalKeys.map((_, index) => `$${index + 1}`).join(", ");
      statements.push({
        sql: `DELETE FROM archive_historical_favorite WHERE legacy_key IN (${placeholders})`,
        values: historicalKeys,
      });
    }
    await this.executeTransaction(statements);
  }

  async saveHistoricalFavorite(input: ArchiveHistoricalFavoriteInput): Promise<void> {
    const statements: ArchiveTransactionStatement[] = [{
      sql: `INSERT INTO archive_historical_favorite (
        legacy_key, room_id, event_id, event_json, favorited_at, label, note, search_text
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT(legacy_key) DO UPDATE SET
        room_id = excluded.room_id,
        event_id = excluded.event_id,
        event_json = excluded.event_json,
        favorited_at = excluded.favorited_at,
        label = excluded.label,
        note = excluded.note,
        search_text = excluded.search_text`,
      values: [
        input.legacyKey,
        input.roomId,
        input.eventId,
        JSON.stringify(input.event),
        input.favoritedAt,
        input.label,
        input.note?.trim() ?? "",
        buildArchiveContentTextFromPayload(input.event),
      ],
    }];
    if (input.tags !== undefined) statements.push(...this.favoriteTagAddStatements({ sourceKind: "historical", stableId: input.legacyKey }, input.tags));
    await this.executeTransaction(statements);
  }

  async listHistoricalFavorites(): Promise<ArchiveHistoricalFavoriteRecord[]> {
    const rows = await this.database.select<DatabaseRow[]>(
      `SELECT
        legacy_key AS legacyKey,
        room_id AS roomId,
        event_id AS eventId,
        event_json AS eventJson,
        favorited_at AS favoritedAt,
        label AS label,
        note AS note,
        COALESCE((SELECT json_group_array(t.name)
          FROM archive_historical_favorite_tag hft
          JOIN archive_favorite_tag t ON t.tag_id = hft.tag_id
          WHERE hft.legacy_key = archive_historical_favorite.legacy_key), '[]') AS tagsJson
       FROM archive_historical_favorite
       ORDER BY favorited_at ASC, legacy_key ASC`,
    );
    return rows.map(mapHistoricalFavoriteRow);
  }

  async listFavoriteTags(): Promise<ArchiveFavoriteTag[]> {
    const rows = await this.database.select<DatabaseRow[]>(
      `SELECT
        t.tag_id AS tagId,
        t.name AS name,
        t.created_at AS createdAt,
        t.updated_at AS updatedAt,
        (
          SELECT COUNT(*) FROM archive_favorite_event_tag eft WHERE eft.tag_id = t.tag_id
        ) + (
          SELECT COUNT(*) FROM archive_historical_favorite_tag hft WHERE hft.tag_id = t.tag_id
        ) AS usageCount
       FROM archive_favorite_tag t
       ORDER BY t.name COLLATE NOCASE ASC, t.tag_id ASC`,
    );
    return rows.map((row) => ({
      tagId: asNumber(rowValue(row, "tagId", "tag_id")),
      name: asString(rowValue(row, "name", "name")),
      createdAt: asNumber(rowValue(row, "createdAt", "created_at")),
      updatedAt: asNumber(rowValue(row, "updatedAt", "updated_at")),
      usageCount: asNumber(rowValue(row, "usageCount", "usage_count")),
    }));
  }

  async getFavoriteOrganization(target: ArchiveFavoriteOrganizationTarget): Promise<ArchiveFavoriteOrganization | null> {
    const isArchive = target.sourceKind === "archive";
    const keyColumn = isArchive ? "event_key" : "legacy_key";
    const table = isArchive ? "archive_favorite" : "archive_historical_favorite";
    const relationTable = isArchive ? "archive_favorite_event_tag" : "archive_historical_favorite_tag";
    const rows = await this.database.select<DatabaseRow[]>(
      `SELECT
        note AS note,
        COALESCE((SELECT json_group_array(t.name)
          FROM ${relationTable} ft
          JOIN archive_favorite_tag t ON t.tag_id = ft.tag_id
          WHERE ft.${keyColumn} = ${table}.${keyColumn}), '[]') AS tagsJson
       FROM ${table}
       WHERE ${keyColumn} = $1
       LIMIT 1`,
      [target.stableId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      note: asString(rowValue(row, "note", "note")),
      tags: parseStringArray(rowValue(row, "tagsJson", "tags_json")),
    };
  }

  private favoriteOrganizationStatements(
    target: ArchiveFavoriteOrganizationTarget,
    tags: readonly string[],
  ): ArchiveTransactionStatement[] {
    const relationTable = target.sourceKind === "archive"
      ? "archive_favorite_event_tag"
      : "archive_historical_favorite_tag";
    const relationColumn = target.sourceKind === "archive" ? "event_key" : "legacy_key";
    return [
      {
      sql: `DELETE FROM ${relationTable} WHERE ${relationColumn} = $1`,
      values: [target.stableId],
      },
      ...this.favoriteTagAddStatements(target, tags),
    ];
  }

  private favoriteTagAddStatements(
    target: ArchiveFavoriteOrganizationTarget,
    tags: readonly string[],
  ): ArchiveTransactionStatement[] {
    const normalizedTags = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
    const now = Date.now();
    const relationTable = target.sourceKind === "archive"
      ? "archive_favorite_event_tag"
      : "archive_historical_favorite_tag";
    const relationColumn = target.sourceKind === "archive" ? "event_key" : "legacy_key";
    const statements: ArchiveTransactionStatement[] = [];
    for (const tag of normalizedTags) {
      statements.push({
        sql: `INSERT INTO archive_favorite_tag (name, created_at, updated_at)
          VALUES ($1, $2, $2)
          ON CONFLICT(name) DO UPDATE SET updated_at = excluded.updated_at`,
        values: [tag, now],
      });
      statements.push({
        sql: `INSERT INTO ${relationTable} (${relationColumn}, tag_id)
          SELECT $1, tag_id FROM archive_favorite_tag WHERE name = $2
          ON CONFLICT(${relationColumn}, tag_id) DO NOTHING`,
        values: [target.stableId, tag],
      });
    }
    return statements;
  }

  async setFavoriteTags(target: ArchiveFavoriteOrganizationTarget, tags: readonly string[]): Promise<void> {
    await this.executeTransaction(this.favoriteOrganizationStatements(target, tags));
  }

  async updateFavoriteOrganization(patch: ArchiveFavoriteOrganizationPatch): Promise<void> {
    const statements: ArchiveTransactionStatement[] = [];
    if (patch.note !== undefined) {
      const noteTable = patch.target.sourceKind === "archive" ? "archive_favorite" : "archive_historical_favorite";
      const noteColumn = patch.target.sourceKind === "archive" ? "event_key" : "legacy_key";
      statements.push({
        sql: `UPDATE ${noteTable} SET note = $1 WHERE ${noteColumn} = $2`,
        values: [patch.note.trim(), patch.target.stableId],
      });
    }
    if (patch.tags !== undefined) statements.push(...this.favoriteOrganizationStatements(patch.target, patch.tags));
    if (statements.length > 0) await this.executeTransaction(statements);
  }

  async batchUpdateFavoriteOrganization(patches: readonly ArchiveFavoriteOrganizationPatch[]): Promise<void> {
    const statements: ArchiveTransactionStatement[] = [];
    for (const patch of patches) {
      if (patch.note !== undefined) {
        const noteTable = patch.target.sourceKind === "archive" ? "archive_favorite" : "archive_historical_favorite";
        const noteColumn = patch.target.sourceKind === "archive" ? "event_key" : "legacy_key";
        statements.push({
          sql: `UPDATE ${noteTable} SET note = $1 WHERE ${noteColumn} = $2`,
          values: [patch.note.trim(), patch.target.stableId],
        });
      }
      if (patch.tags !== undefined) statements.push(...this.favoriteOrganizationStatements(patch.target, patch.tags));
    }
    if (statements.length > 0) await this.executeTransaction(statements);
  }

  async createFavoriteTag(name: string): Promise<ArchiveFavoriteTag> {
    const normalized = name.trim();
    if (!normalized) throw new Error("标签名称不能为空");
    const now = Date.now();
    await this.executeWrite(
      `INSERT INTO archive_favorite_tag (name, created_at, updated_at)
       VALUES ($1, $2, $2)
       ON CONFLICT(name) DO UPDATE SET updated_at = excluded.updated_at`,
      [normalized, now],
    );
    const rows = await this.database.select<DatabaseRow[]>(
      `SELECT tag_id AS tagId, name, created_at AS createdAt, updated_at AS updatedAt,
        0 AS usageCount FROM archive_favorite_tag WHERE name = $1 LIMIT 1`,
      [normalized],
    );
    const row = rows[0];
    if (!row) throw new Error("标签创建后无法读取");
    return {
      tagId: asNumber(rowValue(row, "tagId", "tag_id")),
      name: asString(rowValue(row, "name", "name")),
      createdAt: asNumber(rowValue(row, "createdAt", "created_at")),
      updatedAt: asNumber(rowValue(row, "updatedAt", "updated_at")),
      usageCount: 0,
    };
  }

  async renameFavoriteTag(tagId: number, name: string): Promise<void> {
    const normalized = name.trim();
    if (!normalized) throw new Error("标签名称不能为空");
    await this.executeWrite(
      `UPDATE archive_favorite_tag SET name = $1, updated_at = $2 WHERE tag_id = $3`,
      [normalized, Date.now(), tagId],
    );
  }

  async deleteFavoriteTag(tagId: number): Promise<void> {
    await this.executeWrite("DELETE FROM archive_favorite_tag WHERE tag_id = $1", [tagId]);
  }

  async setNickname(userUid: string, nickname: string | null): Promise<void> {
    await this.executeWrite(
      `INSERT INTO archive_user_profile (user_uid, nickname, updated_at)
       VALUES ($1, $2, $3)
       ON CONFLICT(user_uid) DO UPDATE SET
         nickname = excluded.nickname,
         updated_at = excluded.updated_at`,
      [userUid, nickname, Date.now()],
    );
  }

  async getReadingState(sessionId: string): Promise<ArchiveReadingState | null> {
    const rows = await this.database.select<DatabaseRow[]>(
      `SELECT
        session_id AS sessionId,
        event_key AS eventKey,
        fallback_event_ts AS fallbackEventTs,
        sort_direction AS sortDirection,
        filters_json AS filtersJson,
        search_scope AS searchScope,
        updated_at AS updatedAt
       FROM archive_reading_state
       WHERE session_id = $1
       LIMIT 1`,
      [sessionId],
    );
    if (rows.length === 0) {
      return null;
    }
    const row = rows[0];
    let filters: ArchiveFilterState = {};
    const filtersJson = asString(rowValue(row, "filtersJson", "filters_json"), "{}");
    try {
      const parsed: unknown = JSON.parse(filtersJson);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("filters_json must contain an object");
      }
      filters = parsed as ArchiveFilterState;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid archive reading state filters for session ${sessionId}: ${reason}`);
    }
    return {
      sessionId: asString(rowValue(row, "sessionId", "session_id")),
      eventKey: asNullableString(rowValue(row, "eventKey", "event_key")),
      fallbackEventTs: asNullableNumber(rowValue(row, "fallbackEventTs", "fallback_event_ts")),
      sortDirection: asString(rowValue(row, "sortDirection", "sort_direction")) as ArchiveSortDirection,
      filters,
      searchScope: asString(rowValue(row, "searchScope", "search_scope")) as ArchiveSearchScope,
      updatedAt: asNumber(rowValue(row, "updatedAt", "updated_at")),
    };
  }

  async saveReadingState(state: ArchiveReadingState): Promise<void> {
    const query = `INSERT INTO archive_reading_state (
      session_id, event_key, fallback_event_ts, sort_direction, filters_json, search_scope, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT(session_id) DO UPDATE SET
      event_key = excluded.event_key,
      fallback_event_ts = excluded.fallback_event_ts,
      sort_direction = excluded.sort_direction,
      filters_json = excluded.filters_json,
      search_scope = excluded.search_scope,
      updated_at = excluded.updated_at`;
    const bindValues = [
      state.sessionId,
      state.eventKey,
      state.fallbackEventTs,
      state.sortDirection,
      JSON.stringify(state.filters),
      state.searchScope,
      state.updatedAt,
    ];
    const previous = this.readingStateSaveChains.get(state.sessionId) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        await this.executeWrite(query, bindValues);
      });
    this.readingStateSaveChains.set(state.sessionId, next);
    try {
      await next;
    } finally {
      if (this.readingStateSaveChains.get(state.sessionId) === next) {
        this.readingStateSaveChains.delete(state.sessionId);
      }
    }
  }

  async getEvent(eventKey: string): Promise<ArchiveEventRecord | null> {
    const rows = await this.database.select<DatabaseRow[]>(
      `SELECT
        e.event_key AS eventKey,
        e.session_id AS sessionId,
        e.room_id AS roomId,
        e.ordinal AS ordinal,
        e.event_ts AS eventTs,
        e.primary_category AS primaryCategory,
        e.secondary_category AS secondaryCategory,
        e.user_uid AS userUid,
        e.user_name AS userName,
        p.nickname AS userNickname,
        e.search_text AS searchText,
        e.payload_json AS payloadJson,
        e.source_id AS sourceId,
        CASE WHEN f.event_key IS NULL THEN 0 ELSE 1 END AS favorited,
        s.title AS sessionTitle,
        s.started_at AS sessionStartedAt,
        s.ended_at AS sessionEndedAt,
        s.status AS sessionStatus,
        s.quality AS sessionQuality,
        s.quality_reason AS sessionQualityReason,
        s.recording_status AS sessionRecordingStatus,
        s.stop_reason AS sessionStopReason,
        s.quality_reasons AS sessionQualityReasons
       FROM archive_event e
       JOIN archive_session s ON s.session_id = e.session_id
       LEFT JOIN archive_user_profile p ON p.user_uid = e.user_uid
       LEFT JOIN archive_favorite f ON f.event_key = e.event_key
       WHERE e.event_key = $1
       LIMIT 1`,
      [eventKey],
    );
    return rows.length === 0 ? null : mapEventRow(rows[0]);
  }

  async getTransferSnapshot(scope: ArchiveTransferScope): Promise<ArchiveExportSnapshot> {
    const ownerConditions: string[] = [];
    const ownerValues: unknown[] = [];
    if (scope.kind === "owner") {
      if (scope.ownerId === undefined && scope.ownerUid === undefined) {
        throw new Error("档案导出范围需要 ownerId 或 ownerUid");
      }
      if (scope.ownerId !== undefined) {
        ownerConditions.push(`o.owner_id = ${appendPlaceholder(ownerConditions, ownerValues, scope.ownerId)}`);
      }
      if (scope.ownerUid !== undefined) {
        ownerConditions.push(`o.owner_uid = ${appendPlaceholder(ownerConditions, ownerValues, scope.ownerUid)}`);
      }
    } else if (scope.kind === "session") {
      ownerConditions.push(`EXISTS (
        SELECT 1 FROM archive_session scoped_session
        WHERE scoped_session.session_id = ${appendPlaceholder(ownerConditions, ownerValues, scope.sessionId)}
          AND scoped_session.owner_id = o.owner_id
      )`);
    } else if (scope.kind === "date") {
      ownerConditions.push(`EXISTS (
        SELECT 1 FROM archive_session scoped_session
        WHERE scoped_session.owner_id = o.owner_id
          AND scoped_session.started_at >= ${appendPlaceholder(ownerConditions, ownerValues, scope.fromTs)}
          AND scoped_session.started_at < ${appendPlaceholder(ownerConditions, ownerValues, scope.toTs)}
      )`);
    } else if (scope.kind === "result") {
      if (scope.ownerId !== undefined) {
        ownerConditions.push(`o.owner_id = ${appendPlaceholder(ownerConditions, ownerValues, scope.ownerId)}`);
      }
      if (scope.sessionId !== undefined) {
        ownerConditions.push(`EXISTS (
          SELECT 1 FROM archive_session scoped_session
          WHERE scoped_session.session_id = ${appendPlaceholder(ownerConditions, ownerValues, scope.sessionId)}
            AND scoped_session.owner_id = o.owner_id
        )`);
      }
    }
    const ownerWhere = ownerConditions.length > 0 ? `WHERE ${ownerConditions.join(" AND ")}` : "";
    const ownerRows = await this.database.select<DatabaseRow[]>(
      `SELECT
        o.owner_id AS ownerId,
        o.room_id AS roomId,
        o.owner_uid AS uid,
        o.owner_name AS name,
        o.owner_avatar_url AS avatarUrl,
        o.created_at AS createdAt,
        o.updated_at AS updatedAt
       FROM archive_owner o
       ${ownerWhere}
       ORDER BY o.owner_id ASC`,
      ownerValues,
    );
    const owners = ownerRows.map(mapOwnerInputRow);
    const ownerIds = owners.map((owner) => owner.ownerId);

    const sessionConditions: string[] = [];
    const sessionValues: unknown[] = [];
    if (scope.kind === "session") {
      sessionConditions.push(`s.session_id = ${appendPlaceholder(sessionConditions, sessionValues, scope.sessionId)}`);
    } else if (scope.kind === "date") {
      sessionConditions.push(`s.started_at >= ${appendPlaceholder(sessionConditions, sessionValues, scope.fromTs)}`);
      sessionConditions.push(`s.started_at < ${appendPlaceholder(sessionConditions, sessionValues, scope.toTs)}`);
    } else if (scope.kind === "owner" || (scope.kind === "result" && scope.ownerId !== undefined)) {
      const ownerTokens = scopedSessionIds(ownerIds);
      sessionConditions.push(`s.owner_id IN (${ownerTokens.sql})`);
      sessionValues.push(...ownerTokens.values);
    } else if (scope.kind === "result" && scope.sessionId !== undefined) {
      sessionConditions.push(`s.session_id = ${appendPlaceholder(sessionConditions, sessionValues, scope.sessionId)}`);
    }
    const sessionWhere = sessionConditions.length > 0 ? `WHERE ${sessionConditions.join(" AND ")}` : "";
    const sessionRows = await this.database.select<DatabaseRow[]>(
      `SELECT ${SESSION_COLUMNS}
       FROM archive_session s
       ${sessionWhere}
       ORDER BY s.started_at ASC, s.session_id ASC`,
      sessionValues,
    );
    const sessionInputs = sessionRows.map(mapSessionInputRow);
    const sessionIds = sessionInputs.map((session) => session.sessionId);
    const sessionTokens = scopedSessionIds(sessionIds);

    const eventRows = await this.database.select<DatabaseRow[]>(
      `SELECT
        e.event_key AS eventKey,
        e.session_id AS sessionId,
        e.room_id AS roomId,
        e.ordinal AS ordinal,
        e.event_ts AS eventTs,
        e.primary_category AS primaryCategory,
        e.secondary_category AS secondaryCategory,
        e.user_uid AS userUid,
        e.user_name AS userName,
        e.search_text AS searchText,
        e.payload_json AS payloadJson,
        e.source_id AS sourceId
       FROM archive_event e
       WHERE e.session_id IN (${sessionTokens.sql})
       ORDER BY e.session_id ASC, e.event_ts ASC, e.ordinal ASC, e.event_key ASC`,
      sessionTokens.values,
    );
    const events = eventRows.map(mapExportEventRow);
    const favoriteRows = await this.database.select<DatabaseRow[]>(
      `SELECT event_key AS eventKey, session_id AS sessionId, favorited_at AS favoritedAt,
        COALESCE(note, '') AS note,
        COALESCE((SELECT json_group_array(t.name)
          FROM archive_favorite_event_tag eft
          JOIN archive_favorite_tag t ON t.tag_id = eft.tag_id
          WHERE eft.event_key = archive_favorite.event_key), '[]') AS tagsJson
       FROM archive_favorite
       WHERE session_id IN (${sessionTokens.sql})
       ORDER BY session_id ASC, event_key ASC`,
      sessionTokens.values,
    );
    const favorites = favoriteRows.map(mapFavoriteRow);
    const readingRows = await this.database.select<DatabaseRow[]>(
      `SELECT
        session_id AS sessionId,
        event_key AS eventKey,
        fallback_event_ts AS fallbackEventTs,
        sort_direction AS sortDirection,
        filters_json AS filtersJson,
        search_scope AS searchScope,
        updated_at AS updatedAt
       FROM archive_reading_state
       WHERE session_id IN (${sessionTokens.sql})`,
      sessionTokens.values,
    );
    const readingBySession = new Map<string, ArchiveReadingState>();
    for (const row of readingRows) {
      const sessionId = asString(rowValue(row, "sessionId", "session_id"));
      const filtersJson = asString(rowValue(row, "filtersJson", "filters_json"), "{}");
      let filters: ArchiveFilterState = {};
      try {
        const parsed: unknown = JSON.parse(filtersJson);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) filters = parsed as ArchiveFilterState;
      } catch {
        filters = {};
      }
      readingBySession.set(sessionId, {
        sessionId,
        eventKey: asNullableString(rowValue(row, "eventKey", "event_key")),
        fallbackEventTs: asNullableNumber(rowValue(row, "fallbackEventTs", "fallback_event_ts")),
        sortDirection: asString(rowValue(row, "sortDirection", "sort_direction")) as ArchiveSortDirection,
        filters,
        searchScope: asString(rowValue(row, "searchScope", "search_scope")) as ArchiveSearchScope,
        updatedAt: asNumber(rowValue(row, "updatedAt", "updated_at")),
      });
    }

    const eventUids = [...new Set(events.map((event) => event.userUid).filter((uid): uid is string => Boolean(uid)))];
    const uidTokens = scopedEventUids(eventUids);
    const nicknameRows = await this.database.select<DatabaseRow[]>(
      `SELECT user_uid AS userUid, nickname AS nickname, updated_at AS updatedAt
       FROM archive_user_profile
       WHERE user_uid IN (${uidTokens.sql})
       ORDER BY user_uid ASC`,
      uidTokens.values,
    );
    const nicknames = nicknameRows.map(mapNicknameRow);

    const rooms = [...new Set(sessionInputs.map((session) => session.roomId))];
    const roomTokens = scopedEventUids(rooms.map(String));
    const historicalRows = scope.kind === "all"
      ? await this.database.select<DatabaseRow[]>(
        `SELECT legacy_key AS legacyKey, room_id AS roomId, event_id AS eventId,
                event_json AS eventJson, favorited_at AS favoritedAt, label AS label, note AS note,
                COALESCE((SELECT json_group_array(t.name)
                  FROM archive_historical_favorite_tag hft
                  JOIN archive_favorite_tag t ON t.tag_id = hft.tag_id
                  WHERE hft.legacy_key = archive_historical_favorite.legacy_key), '[]') AS tagsJson
         FROM archive_historical_favorite ORDER BY favorited_at ASC, legacy_key ASC`,
      )
      : await this.database.select<DatabaseRow[]>(
        `SELECT legacy_key AS legacyKey, room_id AS roomId, event_id AS eventId,
                event_json AS eventJson, favorited_at AS favoritedAt, label AS label, note AS note,
                COALESCE((SELECT json_group_array(t.name)
                  FROM archive_historical_favorite_tag hft
                  JOIN archive_favorite_tag t ON t.tag_id = hft.tag_id
                  WHERE hft.legacy_key = archive_historical_favorite.legacy_key), '[]') AS tagsJson
         FROM archive_historical_favorite
         WHERE CAST(room_id AS TEXT) IN (${roomTokens.sql})
         ORDER BY favorited_at ASC, legacy_key ASC`,
        roomTokens.values,
      );
    const historicalFavorites = historicalRows.map(mapHistoricalFavoriteRow);
    const eventBySession = new Map<string, ArchiveExportEvent[]>();
    for (const event of events) {
      const items = eventBySession.get(event.sessionId) ?? [];
      items.push(event);
      eventBySession.set(event.sessionId, items);
    }
    const favoritesBySession = new Map<string, ArchiveFavoriteExport[]>();
    for (const favorite of favorites) {
      const items = favoritesBySession.get(favorite.sessionId) ?? [];
      items.push(favorite);
      favoritesBySession.set(favorite.sessionId, items);
    }
    return {
      owners,
      sessions: sessionInputs.map((session) => ({
        session,
        events: eventBySession.get(session.sessionId) ?? [],
        favorites: favoritesBySession.get(session.sessionId) ?? [],
        readingState: readingBySession.get(session.sessionId) ?? null,
      })),
      nicknames,
      historicalFavorites,
    };
  }

  async commitArchiveImport(plan: ArchiveImportPlan): Promise<ArchiveImportResult> {
    const affectedSessionIds = new Set(plan.affectedSessionIds);
    const statements: ArchiveTransactionStatement[] = [];
    const eventResultIndexes: number[] = [];

    for (const owner of plan.owners) {
      statements.push({
        sql: `UPDATE archive_owner
          SET owner_uid = CASE WHEN owner_uid IS NULL OR owner_uid = '' THEN $3 ELSE owner_uid END,
              owner_name = CASE WHEN owner_name IS NULL OR owner_name = '' THEN $4 ELSE owner_name END,
              owner_avatar_url = CASE WHEN owner_avatar_url IS NULL OR owner_avatar_url = '' THEN $5 ELSE owner_avatar_url END,
              updated_at = CASE WHEN updated_at < $6 THEN $6 ELSE updated_at END
          WHERE owner_id = (
            SELECT owner_id
            FROM archive_owner
            WHERE owner_id = $1 OR room_id = $2 OR (owner_uid = $3 AND $3 IS NOT NULL)
            ORDER BY CASE WHEN owner_id = $1 THEN 0 WHEN room_id = $2 THEN 1 ELSE 2 END
            LIMIT 1
          )`,
        values: [owner.ownerId, owner.roomId, owner.uid ?? null, owner.name ?? null, owner.avatarUrl ?? null, owner.updatedAt],
      });
      statements.push({
        sql: `INSERT INTO archive_owner (
          owner_id, room_id, owner_uid, owner_name, owner_avatar_url, created_at, updated_at
        )
        SELECT $1, $2, $3, $4, $5, $6, $7
        WHERE NOT EXISTS (
          SELECT 1
          FROM archive_owner
          WHERE owner_id = $1 OR room_id = $2 OR (owner_uid = $3 AND $3 IS NOT NULL)
        )`,
        values: [owner.ownerId, owner.roomId, owner.uid ?? null, owner.name ?? null, owner.avatarUrl ?? null, owner.createdAt, owner.updatedAt],
      });
    }

    statements.unshift({
      sql: `INSERT INTO archive_source (
        source_id, source_kind, imported_at, completed_count, conflict_count
      ) VALUES ($1, 'import', $2, $3, $4)
      ON CONFLICT(source_id) DO UPDATE SET
        completed_count = excluded.completed_count,
        conflict_count = excluded.conflict_count`,
      values: [plan.sourceId, Date.now(), plan.counts.completedFields, plan.counts.conflicts],
    });

    for (const incoming of plan.sessionCreates) {
      const normalized = normalizeArchiveSessionState(incoming);
      const session = { ...normalized, recordingStatus: 'stopped' as const,
        status: normalized.status === 'active' ? 'unclean' as const : normalized.status };
      const owner = plan.owners.find((candidate) => candidate.ownerId === session.ownerId);
      if (owner) {
        statements.push({
          sql: `INSERT INTO archive_session (
            session_id, owner_id, room_id, title, cover_url, latest_title, title_source, live_key, sub_session_key,
            source_live_started_at, identity_evidence, started_at, ended_at, status, quality,
            quality_reason, event_count, paid_total, favorite_count, created_at, updated_at,
            recording_status, stop_reason, quality_reasons
          )
          SELECT $1,
            COALESCE((
              SELECT owner_id
              FROM archive_owner
              WHERE owner_id = $2 OR room_id = $3 OR (owner_uid = $4 AND $4 IS NOT NULL)
              ORDER BY CASE WHEN owner_id = $2 THEN 0 WHEN room_id = $3 THEN 1 ELSE 2 END
              LIMIT 1
            ), $2),
            $3, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 0, $18, 0, $19, $20, $21, $22, $23
          ON CONFLICT(session_id) DO NOTHING`,
          values: [
            session.sessionId,
            session.ownerId,
            owner.roomId,
            owner.uid ?? null,
            session.title ?? null,
            session.coverUrl ?? null,
            session.latestTitle ?? session.title ?? null,
            session.titleSource ?? "time",
            session.liveKey ?? null,
            session.subSessionKey ?? null,
            session.sourceLiveStartedAt ?? null,
            session.identityEvidence ?? "unavailable",
            session.startedAt,
            session.endedAt ?? null,
            session.status,
            session.quality,
            session.qualityReason ?? null,
            session.paidTotal ?? 0,
            session.createdAt,
            session.updatedAt,
            session.recordingStatus,
            session.stopReason,
            JSON.stringify(session.qualityReasons),
          ],
        });
      } else {
        statements.push({
          sql: `INSERT INTO archive_session (
            session_id, owner_id, room_id, title, cover_url, latest_title, title_source, live_key, sub_session_key,
            source_live_started_at, identity_evidence, started_at, ended_at, status, quality,
            quality_reason, event_count, paid_total, favorite_count, created_at, updated_at,
            recording_status, stop_reason, quality_reasons
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 0, $17, 0, $18, $19, $20, $21, $22)
          ON CONFLICT(session_id) DO NOTHING`,
          values: [
            session.sessionId,
            session.ownerId,
            session.roomId,
            session.title ?? null,
            session.coverUrl ?? null,
            session.latestTitle ?? session.title ?? null,
            session.titleSource ?? "time",
            session.liveKey ?? null,
            session.subSessionKey ?? null,
            session.sourceLiveStartedAt ?? null,
            session.identityEvidence ?? "unavailable",
            session.startedAt,
            session.endedAt ?? null,
            session.status,
            session.quality,
            session.qualityReason ?? null,
            session.paidTotal ?? 0,
            session.createdAt,
            session.updatedAt,
            session.recordingStatus,
            session.stopReason,
            JSON.stringify(session.qualityReasons),
          ],
        });
      }
      if (session.cloudMetadata) statements.push({
        sql: 'UPDATE archive_session SET cloud_metadata = COALESCE(cloud_metadata, $2) WHERE session_id = $1',
        values: [session.sessionId, JSON.stringify(session.cloudMetadata)],
      });
      affectedSessionIds.add(session.sessionId);
    }

    for (const patch of plan.sessionPatches) {
      const values: unknown[] = [patch.sessionId];
      const assignments: string[] = [];
      if (patch.cloudMetadata) {
        values.push(JSON.stringify(patch.cloudMetadata));
        assignments.push(`cloud_metadata = COALESCE(cloud_metadata, $${values.length})`);
      }
      if (patch.title !== undefined) {
        values.push(patch.title);
        assignments.push(`title = CASE WHEN title IS NULL OR title = '' THEN $${values.length} ELSE title END`);
      }
      if (patch.coverUrl !== undefined) {
        values.push(patch.coverUrl);
        assignments.push(`cover_url = CASE WHEN cover_url IS NULL OR cover_url = '' THEN $${values.length} ELSE cover_url END`);
      }
      if (patch.endedAt !== undefined) {
        values.push(patch.endedAt);
        assignments.push(`ended_at = CASE WHEN ended_at IS NULL THEN $${values.length} ELSE ended_at END`);
      }
      if (patch.qualityReason !== undefined) {
        values.push(patch.qualityReason);
        assignments.push(`quality_reason = CASE WHEN quality_reason IS NULL OR quality_reason = '' THEN $${values.length} ELSE quality_reason END`);
      }
      if (patch.qualityReasons !== undefined) {
        values.push(JSON.stringify(patch.qualityReasons));
        assignments.push(`quality_reasons = (
          SELECT json_group_array(value) FROM (
            SELECT value FROM json_each(archive_session.quality_reasons)
            UNION SELECT value FROM json_each($${values.length})
          )
        )`);
        if (patch.qualityReasons.length > 0) assignments.push("quality = 'incomplete'");
      }
      if (assignments.length > 0) {
        values.push(Date.now());
        assignments.push(`updated_at = $${values.length}`);
        statements.push({
          sql: `UPDATE archive_session SET ${assignments.join(", ")} WHERE session_id = $1`,
          values,
        });
        affectedSessionIds.add(patch.sessionId);
      }
    }

    for (const event of plan.newEvents) {
      const contentText = buildArchiveContentTextFromPayload(event.payloadJson, event.searchText);
      eventResultIndexes.push(statements.length);
      statements.push({
        sql: `INSERT INTO archive_event (
          event_key, session_id, room_id, ordinal, event_ts, primary_category,
          secondary_category, user_uid, user_name, search_text, payload_json, source_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT(event_key) DO NOTHING`,
        values: [
          event.eventKey,
          event.sessionId,
          event.roomId,
          event.ordinal,
          event.eventTs,
          normalizeArchivePrimaryCategory(event.primaryCategory),
          event.secondaryCategory ?? null,
          event.userUid ?? null,
          event.userName ?? null,
          contentText,
          event.payloadJson,
          event.sourceId ?? plan.sourceId,
        ],
      });
      statements.push({
        sql: `INSERT INTO archive_search_index (event_key, session_id, search_text)
          SELECT $1, $2, $3
          WHERE EXISTS (SELECT 1 FROM archive_event WHERE event_key = $1)
          ON CONFLICT(event_key) DO UPDATE SET search_text = excluded.search_text`,
        values: [event.eventKey, event.sessionId, contentText],
      });
      statements.push({
        sql: `INSERT INTO archive_event_source (event_key, source_id)
          SELECT $1, $2
          WHERE EXISTS (SELECT 1 FROM archive_event WHERE event_key = $1)
          ON CONFLICT(event_key, source_id) DO NOTHING`,
        values: [event.eventKey, plan.sourceId],
      });
      affectedSessionIds.add(event.sessionId);
    }

    for (const favorite of plan.favorites) {
      statements.push({
        sql: `INSERT INTO archive_favorite (event_key, session_id, favorited_at, note)
          SELECT event_key, session_id, $3, $4
          FROM archive_event
          WHERE event_key = $1 AND session_id = $2
          ON CONFLICT(event_key) DO UPDATE SET
            note = CASE WHEN archive_favorite.note IS NULL OR archive_favorite.note = '' THEN excluded.note ELSE archive_favorite.note END`,
        values: [favorite.eventKey, favorite.sessionId, favorite.favoritedAt, favorite.note?.trim() ?? ""],
      });
      statements.push(...this.favoriteTagAddStatements({ sourceKind: "archive", stableId: favorite.eventKey }, favorite.tags ?? []));
      affectedSessionIds.add(favorite.sessionId);
    }

    for (const nickname of plan.nicknames) {
      statements.push({
        sql: `INSERT INTO archive_user_profile (user_uid, nickname, updated_at)
          VALUES ($1, $2, $3)
          ON CONFLICT(user_uid) DO UPDATE SET
            nickname = CASE WHEN archive_user_profile.nickname IS NULL OR archive_user_profile.nickname = '' THEN excluded.nickname ELSE archive_user_profile.nickname END,
            updated_at = CASE WHEN archive_user_profile.nickname IS NULL OR archive_user_profile.nickname = '' THEN excluded.updated_at ELSE archive_user_profile.updated_at END`,
        values: [nickname.userUid, nickname.nickname, nickname.updatedAt],
      });
    }

    for (const readingState of plan.readingStates) {
      statements.push({
        sql: `INSERT INTO archive_reading_state (
          session_id, event_key, fallback_event_ts, sort_direction, filters_json, search_scope, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT(session_id) DO NOTHING`,
        values: [
          readingState.sessionId,
          readingState.eventKey,
          readingState.fallbackEventTs,
          readingState.sortDirection,
          JSON.stringify(readingState.filters),
          readingState.searchScope,
          readingState.updatedAt,
        ],
      });
    }

    for (const historicalFavorite of plan.historicalFavorites) {
      statements.push({
        sql: `INSERT INTO archive_historical_favorite (
          legacy_key, room_id, event_id, event_json, favorited_at, label, note, search_text
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT(legacy_key) DO UPDATE SET
          note = CASE WHEN archive_historical_favorite.note IS NULL OR archive_historical_favorite.note = '' THEN excluded.note ELSE archive_historical_favorite.note END`,
        values: [
          historicalFavorite.legacyKey,
          historicalFavorite.roomId,
          historicalFavorite.eventId,
          JSON.stringify(historicalFavorite.event),
          historicalFavorite.favoritedAt,
          historicalFavorite.label,
          historicalFavorite.note?.trim() ?? "",
          buildArchiveContentTextFromPayload(historicalFavorite.event),
        ],
      });
      statements.push(...this.favoriteTagAddStatements({ sourceKind: "historical", stableId: historicalFavorite.legacyKey }, historicalFavorite.tags ?? []));
    }

    for (const sessionId of affectedSessionIds) {
      statements.push({
        sql: `UPDATE archive_session
          SET event_count = (SELECT COUNT(*) FROM archive_event WHERE session_id = $1),
              favorite_count = (SELECT COUNT(*) FROM archive_favorite WHERE session_id = $1),
              updated_at = $2
          WHERE session_id = $1`,
        values: [sessionId, Date.now()],
      });
    }
    statements.push({
      sql: `UPDATE archive_source
        SET completed_count = $2, conflict_count = $3
        WHERE source_id = $1`,
      values: [plan.sourceId, plan.counts.completedFields, plan.counts.conflicts],
    });

    const results = await this.executeTransaction(statements);
    let importedEvents = 0;
    let racedSkipped = 0;
    for (const index of eventResultIndexes) {
      if ((results[index]?.rowsAffected ?? 0) > 0) importedEvents += 1;
      else racedSkipped += 1;
    }
    return {
      ...plan.counts,
      imported: importedEvents,
      newEvents: importedEvents,
      skipped: plan.counts.skipped + racedSkipped,
      sourceId: plan.sourceId,
    };
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.executeTransaction([
      {
        sql: "DELETE FROM archive_session WHERE session_id = $1",
        values: [sessionId],
      },
      {
        sql: "DELETE FROM archive_owner WHERE NOT EXISTS (SELECT 1 FROM archive_session s WHERE s.owner_id = archive_owner.owner_id)",
        values: [],
      },
    ]);
  }

  async rollbackCloudRecoveryRun(sourceId: string, createdSessionIds: readonly string[]): Promise<void> {
    const affectedRows = await this.database.select<DatabaseRow[]>(
      "SELECT DISTINCT session_id AS sessionId FROM archive_event WHERE source_id = $1",
      [sourceId],
    );
    const affectedSessionIds = [...new Set([
      ...createdSessionIds,
      ...affectedRows.map(row => asString(rowValue(row, "sessionId", "session_id"))).filter(Boolean),
    ])];
    const sessionIds = [...new Set(createdSessionIds)];
    const sessionValues: unknown[] = [];
    const sessionCondition = sessionIds.length === 0
      ? "0 = 1"
      : `session_id IN (${sessionIds.map(sessionId => appendPlaceholder([], sessionValues, sessionId)).join(", ")})`;
    await this.executeTransaction([
      { sql: "DELETE FROM archive_event WHERE source_id = $1", values: [sourceId] },
      { sql: `DELETE FROM archive_session WHERE ${sessionCondition}
          AND NOT EXISTS (SELECT 1 FROM archive_event e WHERE e.session_id = archive_session.session_id)`, values: sessionValues },
      { sql: "DELETE FROM archive_owner WHERE NOT EXISTS (SELECT 1 FROM archive_session s WHERE s.owner_id = archive_owner.owner_id)", values: [] },
    ]);
    await this.recomputeEventCounts(affectedSessionIds);
    await this.recomputePaidTotals(affectedSessionIds);
  }

  async deleteBefore(scope: ArchiveDeleteScope): Promise<void> {
    await this.deleteArchive(scope);
  }

  async deleteArchive(scope: ArchiveDeleteScope, sessionIds?: readonly string[]): Promise<void> {
    const boundary = deleteScopeParts(scope, false);
    const exactIds = sessionIds === undefined ? undefined : [...new Set(sessionIds)];
    const values = [...boundary.values];
    const exactCondition = exactIds === undefined
      ? null
      : exactIds.length === 0
        ? "0 = 1"
        : `s.session_id IN (${exactIds.map((sessionId) => appendPlaceholder([], values, sessionId)).join(", ")})`;
    const lifecycleConditions = ["s.recording_status = 'stopped'"];
    const deleteWhere = exactCondition === null
      ? ["1 = 1", boundary.whereSql, ...lifecycleConditions].join(" AND ")
      : [boundary.whereSql, exactCondition, ...lifecycleConditions].join(" AND ");
    const validationWhere = exactIds === undefined
      ? null
      : [boundary.whereSql, exactCondition ?? "1 = 1", ...lifecycleConditions].join(" AND ");
    const validationCountCondition = validationWhere === null
      ? ""
      : ` AND (
        SELECT COUNT(*)
          FROM archive_session s
          JOIN archive_owner o ON o.owner_id = s.owner_id
          WHERE ${validationWhere}
        ) = ${appendPlaceholder([], values, exactIds?.length ?? 0)}`;
    const [result] = await this.executeTransaction([
      {
        sql: `DELETE FROM archive_session
          WHERE session_id IN (
            SELECT s.session_id
            FROM archive_session s
            JOIN archive_owner o ON o.owner_id = s.owner_id
            WHERE ${deleteWhere}
          )${validationCountCondition}`,
        values,
      },
      {
        sql: "DELETE FROM archive_owner WHERE NOT EXISTS (SELECT 1 FROM archive_session s WHERE s.owner_id = archive_owner.owner_id)",
        values: [],
      },
    ]);
    if (exactIds !== undefined && (result?.rowsAffected ?? 0) !== exactIds.length) {
      throw new Error("删除目标已变化，请重新预览");
    }
  }

  async getDeletePreview(scope: ArchiveDeleteScope): Promise<ArchiveDeletePreview> {
    const boundary = deleteScopeParts(scope, false);
    const eligibleConditions = [boundary.whereSql];
    eligibleConditions.push("recording_status = 'stopped'");
    const blockedConditions: string[] = [];
    blockedConditions.push("recording_status IN ('recording', 'reconnecting')");
    const values = [...boundary.values];
    const rows = await this.database.select<DatabaseRow[]>(
      `WITH target_sessions AS (
        SELECT s.session_id, s.owner_id, s.status, s.recording_status, s.updated_at, s.quality
        FROM archive_session s
        JOIN archive_owner o ON o.owner_id = s.owner_id
        WHERE ${boundary.whereSql}
      ), deletable_sessions AS (
        SELECT session_id, owner_id FROM target_sessions
        WHERE ${eligibleConditions.slice(1).join(" AND ") || "1 = 1"}
      ), target_events AS (
        SELECT e.event_key, e.payload_json, e.search_text
        FROM archive_event e
        JOIN deletable_sessions s ON s.session_id = e.session_id
      )
      SELECT
        (SELECT COUNT(*) FROM deletable_sessions) AS sessionCount,
        (SELECT COUNT(DISTINCT owner_id) FROM deletable_sessions) AS ownerCount,
        (SELECT json_group_array(session_id) FROM (
          SELECT session_id FROM deletable_sessions ORDER BY session_id
        )) AS sessionIds,
        (SELECT json_group_array(json_object(
          'sessionId', session_id,
          'ownerId', owner_id,
          'status', status,
          'recordingStatus', recording_status,
          'updatedAt', updated_at,
          'quality', quality
        )) FROM (
          SELECT session_id, owner_id, status, recording_status, updated_at, quality
          FROM target_sessions
          ORDER BY session_id
        )) AS sessionSnapshots,
        (SELECT COUNT(*) FROM target_events) AS eventCount,
        (SELECT COUNT(*) FROM archive_favorite f JOIN target_events e ON e.event_key = f.event_key) AS favoriteCount,
        0 AS resourceReferenceCount,
        COALESCE((
          SELECT SUM(
            length(CAST(COALESCE(payload_json, '') AS BLOB))
            + length(CAST(COALESCE(search_text, '') AS BLOB))
          ) FROM target_events
        ), 0) AS bytes,
        (SELECT COUNT(*) FROM target_sessions WHERE ${blockedConditions.join(" OR ") || "0 = 1"}) AS blockedSessionCount,
        (SELECT json_group_array(session_id) FROM (
          SELECT session_id FROM target_sessions
          WHERE ${blockedConditions.join(" OR ") || "0 = 1"}
          ORDER BY session_id
        )) AS blockedSessionIds,
        (SELECT GROUP_CONCAT(status, ',') FROM (
          SELECT status FROM target_sessions
          WHERE ${blockedConditions.join(" OR ") || "0 = 1"}
          ORDER BY session_id
        )) AS blockedSessionStatuses,
        (SELECT GROUP_CONCAT(recording_status, ',') FROM (
          SELECT recording_status FROM target_sessions
          WHERE ${blockedConditions.join(' OR ')} ORDER BY session_id
        )) AS blockedRecordingStatuses`,
      values,
    );
    const resourceRows = await this.database.select<DatabaseRow[]>(
      `WITH target_sessions AS (
        SELECT s.session_id, s.owner_id, s.status, s.recording_status, s.updated_at, s.quality
        FROM archive_session s
        JOIN archive_owner o ON o.owner_id = s.owner_id
        WHERE ${boundary.whereSql}
      ), deletable_sessions AS (
        SELECT session_id, owner_id FROM target_sessions
        WHERE ${eligibleConditions.slice(1).join(" AND ") || "1 = 1"}
      )
      SELECT e.payload_json AS payloadJson
      FROM archive_event e
      JOIN deletable_sessions s ON s.session_id = e.session_id`,
      boundary.values,
    );
    const resourceUrls = new Set<string>();
    for (const resourceRow of resourceRows) {
      for (const url of archiveResourceUrls(rowValue(resourceRow, "payloadJson", "payload_json"))) {
        resourceUrls.add(url);
      }
    }
    const row = rows[0] ?? {};
    const sessionIds = splitAggregateIds(rowValue(row, "sessionIds", "session_ids"));
    const sessionSnapshots = parseDeleteSessionSnapshots(rowValue(row, "sessionSnapshots", "session_snapshots"));
    const blockedSessionIds = splitAggregateIds(rowValue(row, "blockedSessionIds", "blocked_session_ids"));
    const blockedSessionStatuses = splitAggregateIds(rowValue(row, "blockedSessionStatuses", "blocked_session_statuses"));
    const blockedRecordingStatuses = splitAggregateIds(rowValue(row, 'blockedRecordingStatuses', 'blocked_recording_statuses'));
    return {
      ownerCount: asNumber(rowValue(row, "ownerCount", "owner_count")),
      sessionCount: asNumber(rowValue(row, "sessionCount", "session_count")),
      sessionIds,
      sessionSnapshots,
      eventCount: asNumber(rowValue(row, "eventCount", "event_count")),
      favoriteCount: asNumber(rowValue(row, "favoriteCount", "favorite_count")),
      resourceReferenceCount: resourceUrls.size,
      bytes: asNumber(rowValue(row, "bytes", "bytes")),
      blockedSessionCount: asNumber(rowValue(row, "blockedSessionCount", "blocked_session_count")),
      blockedSessionIds,
      blockedSessionStates: blockedSessionIds.flatMap((sessionId, index) => {
        const status = blockedSessionStatuses[index];
        const recordingStatus = blockedRecordingStatuses[index] as ArchiveSessionSummary['recordingStatus'];
        return isArchiveSessionRecording({ recordingStatus })
          ? [{ sessionId, status: status as ArchiveSessionSummary['status'], recordingStatus }] : [];
      }),
    };
  }
}
