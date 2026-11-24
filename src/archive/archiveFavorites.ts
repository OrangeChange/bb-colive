import type {
  ArchiveFavoriteCursor,
  ArchiveFavoriteQuery,
  ArchiveFilterState,
  ArchiveKeywordField,
  ArchiveSortDirection,
} from "./archiveTypes.ts";
import { escapeArchiveLikeValue } from "./archiveQuery.ts";
import { buildArchiveSearchFieldsSql } from "./archiveContentSearch.ts";

export interface ArchiveFavoriteQueryPlan {
  pageSql: string;
  pageValues: unknown[];
  totalSql: string;
  totalValues: unknown[];
  limit: number;
  direction: ArchiveSortDirection;
}

const HISTORICAL_EVENT_TS = "CAST(COALESCE(json_extract(hf.event_json, '$.ts'), json_extract(hf.event_json, '$.timestamp'), 0) AS INTEGER)";
const HISTORICAL_MSG_TYPE = "CAST(COALESCE(json_extract(hf.event_json, '$.msgType'), -1) AS INTEGER)";
const HISTORICAL_PRIMARY_CATEGORY = `CASE
    WHEN ${HISTORICAL_MSG_TYPE} = 0 THEN 'danmu'
    WHEN ${HISTORICAL_MSG_TYPE} = 1 THEN 'gift'
    WHEN ${HISTORICAL_MSG_TYPE} = 2 THEN 'superChat'
    WHEN ${HISTORICAL_MSG_TYPE} IN (3, 9) THEN 'guard'
    WHEN ${HISTORICAL_MSG_TYPE} IN (4, 5) THEN 'lottery'
    WHEN ${HISTORICAL_MSG_TYPE} IN (6, 7, 8) THEN 'redPocket'
    WHEN ${HISTORICAL_MSG_TYPE} IN (10, 11) THEN 'interact'
    WHEN ${HISTORICAL_MSG_TYPE} BETWEEN 16 AND 27 THEN 'system'
    ELSE 'unknown'
  END`;
const HISTORICAL_SECONDARY_CATEGORY = `CASE
    WHEN ${HISTORICAL_MSG_TYPE} = 1 THEN CASE
      WHEN COALESCE(json_extract(hf.event_json, '$.gift.blindGiftName'), '') <> '' THEN 'blind'
      WHEN CAST(COALESCE(json_extract(hf.event_json, '$.gift.isFree'), 0) AS INTEGER) = 1
        OR CAST(COALESCE(json_extract(hf.event_json, '$.gift.priceRmb'), 0) AS REAL) = 0 THEN 'free'
      ELSE 'normal'
    END
    ELSE json_extract(hf.event_json, '$.interactKind')
  END`;
const HISTORICAL_USER_NAME = "COALESCE(json_extract(hf.event_json, '$.user.uname'), '')";
const HISTORICAL_USER_UID = "json_extract(hf.event_json, '$.user.uid')";
const HISTORICAL_CONTENT = "COALESCE(hf.search_text, '')";
const HISTORICAL_MEDAL_NAME = "COALESCE(json_extract(hf.event_json, '$.user.medal.name'), '')";
const HISTORICAL_GIFT_NAME = buildArchiveSearchFieldsSql([
  "json_extract(hf.event_json, '$.gift.name')",
  "json_extract(hf.event_json, '$.gift.blindGiftName')",
]);
const ARCHIVE_CONTENT = "COALESCE(e.search_text, '')";
const ARCHIVE_USER_NAME = "COALESCE(e.user_name, json_extract(e.payload_json, '$.user.uname'), '')";
const ARCHIVE_GIFT_NAME = buildArchiveSearchFieldsSql([
  "json_extract(e.payload_json, '$.gift.name')",
  "json_extract(e.payload_json, '$.gift.blindGiftName')",
]);
const ARCHIVE_ALL = buildArchiveSearchFieldsSql([
  ARCHIVE_USER_NAME,
  "p.nickname",
  "json_extract(e.payload_json, '$.user.medal.name')",
  ARCHIVE_GIFT_NAME,
  ARCHIVE_CONTENT,
  "(SELECT group_concat(t.name, ' ') FROM archive_favorite_event_tag aft JOIN archive_favorite_tag t ON t.tag_id = aft.tag_id WHERE aft.event_key = af.event_key)",
  "af.note",
]);
const HISTORICAL_ALL = buildArchiveSearchFieldsSql([
  HISTORICAL_USER_NAME,
  HISTORICAL_MEDAL_NAME,
  HISTORICAL_GIFT_NAME,
  HISTORICAL_CONTENT,
  "(SELECT group_concat(t.name, ' ') FROM archive_historical_favorite_tag hft JOIN archive_favorite_tag t ON t.tag_id = hft.tag_id WHERE hft.legacy_key = hf.legacy_key)",
  "hf.note",
]);

function appendValue(values: unknown[], value: unknown): string {
  values.push(value);
  return `$${values.length}`;
}

function normalizeLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 100;
  return Math.max(1, Math.min(500, Math.floor(value)));
}

function encodeCursor(cursor: ArchiveFavoriteCursor): string {
  return encodeURIComponent(JSON.stringify(cursor));
}

export function decodeArchiveFavoriteCursor(value: string | null | undefined): ArchiveFavoriteCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as Partial<ArchiveFavoriteCursor>;
    if (
      typeof parsed.sortValue !== "number" || !Number.isFinite(parsed.sortValue)
      || typeof parsed.stableId !== "string"
      || (parsed.direction !== "asc" && parsed.direction !== "desc")
    ) throw new Error("invalid cursor fields");
    return parsed as ArchiveFavoriteCursor;
  } catch {
    throw new Error("Invalid archive favorite cursor");
  }
}

function queryFieldColumn(field: ArchiveKeywordField): string {
  switch (field) {
    case "user":
    case "nickname": return "u.keywordUser";
    case "fanMedal": return "u.keywordFanMedal";
    case "gift": return "u.keywordGift";
    case "content": return "u.keywordContent";
    case "note": return "u.keywordNote";
    case "all": return "u.keywordAll";
  }
}

function buildWhere(query: ArchiveFavoriteQuery, values: unknown[]): string[] {
  const filters: ArchiveFilterState = query.filters ?? {};
  const conditions: string[] = [];
  if (query.ownerId !== undefined) {
    conditions.push(`u.ownerId = ${appendValue(values, query.ownerId)}`);
  }

  const searchText = (query.searchText ?? filters.searchText)?.trim();
  if (searchText) {
    const field = query.keywordField ?? "all";
    conditions.push(`${queryFieldColumn(field)} LIKE ${appendValue(values, `%${escapeArchiveLikeValue(searchText)}%`)} ESCAPE '!'`);
  }

  const primaryCategories = [...new Set((query.primaryCategories ?? filters.primaryCategories ?? []).map((value) => value.trim()).filter(Boolean))];
  if (query.primaryCategories !== undefined || filters.primaryCategories !== undefined) {
    if (primaryCategories.length === 0 && filters.filterMode !== "exclude") {
      conditions.push("1 = 0");
    } else if (primaryCategories.length > 0) {
      const placeholders = primaryCategories.map((value) => appendValue(values, value));
      conditions.push(`u.primaryCategory ${filters.filterMode === "exclude" ? "NOT IN" : "IN"} (${placeholders.join(", ")})`);
    }
  }

  const fromTs = query.fromTs ?? filters.fromTs;
  const toTs = query.toTs ?? filters.toTs;
  const timeColumn = query.timeField === "favoritedAt" ? "u.favoritedAt" : "u.eventTs";
  if (fromTs !== undefined) conditions.push(`${timeColumn} >= ${appendValue(values, fromTs)}`);
  if (toTs !== undefined) conditions.push(`${timeColumn} < ${appendValue(values, toTs)}`);
  const tagFilter = query.tagFilter;
  const tagNames = [...new Set((tagFilter?.names ?? []).map((value) => value.trim()).filter(Boolean))];
  if (tagNames.length > 0) {
    const tagPlaceholders = tagNames.map((value) => appendValue(values, value));
    const anyTag = `(u.sourceKind = 'archive' AND EXISTS (
      SELECT 1 FROM archive_favorite_event_tag aft
      JOIN archive_favorite_tag t ON t.tag_id = aft.tag_id
      WHERE aft.event_key = u.eventKey AND t.name IN (${tagPlaceholders.join(", ")})
    )) OR (u.sourceKind = 'historical' AND EXISTS (
      SELECT 1 FROM archive_historical_favorite_tag hft
      JOIN archive_favorite_tag t ON t.tag_id = hft.tag_id
      WHERE hft.legacy_key = u.legacyKey AND t.name IN (${tagPlaceholders.join(", ")})
    ))`;
    if (tagFilter?.mode === "all") {
      conditions.push(tagNames.map((_, index) => {
        const placeholder = tagPlaceholders[index];
        return `(u.sourceKind = 'archive' AND EXISTS (
          SELECT 1 FROM archive_favorite_event_tag aft
          JOIN archive_favorite_tag t ON t.tag_id = aft.tag_id
          WHERE aft.event_key = u.eventKey AND t.name = ${placeholder}
        )) OR (u.sourceKind = 'historical' AND EXISTS (
          SELECT 1 FROM archive_historical_favorite_tag hft
          JOIN archive_favorite_tag t ON t.tag_id = hft.tag_id
          WHERE hft.legacy_key = u.legacyKey AND t.name = ${placeholder}
        ))`;
      }).map((condition) => `(${condition})`).join(" AND "));
    } else {
      conditions.push(`(${anyTag})`);
    }
  }
  return conditions;
}

const UNIFIED_CTE = `WITH unified AS (
  SELECT
    'archive' AS sourceKind,
    af.event_key AS stableId,
    af.event_key AS eventKey,
    NULL AS legacyKey,
    e.session_id AS sessionId,
    s.owner_id AS ownerId,
    o.owner_name AS ownerName,
    e.room_id AS roomId,
    s.title AS sessionTitle,
    s.started_at AS sessionStartedAt,
    s.ended_at AS sessionEndedAt,
    e.event_ts AS eventTs,
    af.favorited_at AS favoritedAt,
    e.primary_category AS primaryCategory,
    e.secondary_category AS secondaryCategory,
    e.user_uid AS userUid,
    e.user_name AS userName,
    p.nickname AS userNickname,
    ${ARCHIVE_CONTENT} AS searchText,
    e.payload_json AS payloadJson,
    1 AS canLocate,
    NULL AS label,
    COALESCE(af.note, '') AS note,
    COALESCE((SELECT json_group_array(t.name)
      FROM archive_favorite_event_tag aft
      JOIN archive_favorite_tag t ON t.tag_id = aft.tag_id
      WHERE aft.event_key = af.event_key), '[]') AS tagsJson,
    ${buildArchiveSearchFieldsSql([ARCHIVE_USER_NAME, "p.nickname"])} AS keywordUser,
    ${ARCHIVE_CONTENT} AS keywordContent,
    LOWER(COALESCE(json_extract(e.payload_json, '$.user.medal.name'), '')) AS keywordFanMedal,
    ${ARCHIVE_GIFT_NAME} AS keywordGift,
    LOWER(COALESCE(af.note, '')) AS keywordNote,
    ${ARCHIVE_ALL} AS keywordAll
  FROM archive_favorite af
  JOIN archive_event e ON e.event_key = af.event_key
  JOIN archive_session s ON s.session_id = e.session_id
  JOIN archive_owner o ON o.owner_id = s.owner_id
  LEFT JOIN archive_user_profile p ON p.user_uid = e.user_uid
  UNION ALL
  SELECT
    'historical' AS sourceKind,
    hf.legacy_key AS stableId,
    NULL AS eventKey,
    hf.legacy_key AS legacyKey,
    NULL AS sessionId,
    NULL AS ownerId,
    NULL AS ownerName,
    hf.room_id AS roomId,
    NULL AS sessionTitle,
    NULL AS sessionStartedAt,
    NULL AS sessionEndedAt,
    ${HISTORICAL_EVENT_TS} AS eventTs,
    hf.favorited_at AS favoritedAt,
    ${HISTORICAL_PRIMARY_CATEGORY} AS primaryCategory,
    ${HISTORICAL_SECONDARY_CATEGORY} AS secondaryCategory,
    ${HISTORICAL_USER_UID} AS userUid,
    ${HISTORICAL_USER_NAME} AS userName,
    NULL AS userNickname,
    ${HISTORICAL_CONTENT} AS searchText,
    hf.event_json AS payloadJson,
    0 AS canLocate,
    hf.label AS label,
    COALESCE(hf.note, '') AS note,
    COALESCE((SELECT json_group_array(t.name)
      FROM archive_historical_favorite_tag hft
      JOIN archive_favorite_tag t ON t.tag_id = hft.tag_id
      WHERE hft.legacy_key = hf.legacy_key), '[]') AS tagsJson,
    LOWER(${HISTORICAL_USER_NAME}) AS keywordUser,
    ${HISTORICAL_CONTENT} AS keywordContent,
    LOWER(${HISTORICAL_MEDAL_NAME}) AS keywordFanMedal,
    LOWER(${HISTORICAL_GIFT_NAME}) AS keywordGift,
    LOWER(COALESCE(hf.note, '')) AS keywordNote,
    ${HISTORICAL_ALL} AS keywordAll
  FROM archive_historical_favorite hf
)`;

export function buildArchiveFavoriteQueryPlan(query: ArchiveFavoriteQuery = {}): ArchiveFavoriteQueryPlan {
  const cursor = decodeArchiveFavoriteCursor(query.cursor);
  const direction: ArchiveSortDirection = cursor?.direction ?? (query.direction === "asc" ? "asc" : "desc");
  const sortColumn = query.sort === "eventTs" ? "u.eventTs" : "u.favoritedAt";
  const baseValues: unknown[] = [];
  const baseConditions = buildWhere(query, baseValues);
  const totalConditions = [...baseConditions];
  const totalValues = [...baseValues];
  const pageValues = [...baseValues];
  const pageConditions = [...baseConditions];
  if (cursor) {
    const operator = direction === "asc" ? ">" : "<";
    const sortValue = appendValue(pageValues, cursor.sortValue);
    const stableId = appendValue(pageValues, cursor.stableId);
    pageConditions.push(`(${sortColumn} ${operator} ${sortValue} OR (${sortColumn} = ${sortValue} AND u.stableId ${operator} ${stableId}))`);
  }
  const limit = normalizeLimit(query.limit);
  const limitPlaceholder = appendValue(pageValues, limit + 1);
  const where = pageConditions.length > 0 ? `WHERE ${pageConditions.join(" AND ")}` : "";
  const totalWhere = totalConditions.length > 0 ? `WHERE ${totalConditions.join(" AND ")}` : "";
  return {
    pageSql: `${UNIFIED_CTE}
      SELECT u.* FROM unified u
      ${where}
      ORDER BY ${sortColumn} ${direction.toUpperCase()}, u.stableId ${direction.toUpperCase()}
      LIMIT ${limitPlaceholder}`,
    pageValues,
    totalSql: `${UNIFIED_CTE}
      SELECT COUNT(*) AS totalCount FROM unified u
      ${totalWhere}`,
    totalValues,
    limit,
    direction,
  };
}

export function encodeArchiveFavoritePageCursor(item: { eventTs: number; favoritedAt: number; stableId: string }, sort: "eventTs" | "favoritedAt", direction: ArchiveSortDirection): string {
  return encodeCursor({ sortValue: sort === "eventTs" ? item.eventTs : item.favoritedAt, stableId: item.stableId, direction });
}
