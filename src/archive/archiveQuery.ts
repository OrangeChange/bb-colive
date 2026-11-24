import type {
  ArchiveFilterState,
  ArchiveKeywordCondition,
  ArchiveKeywordField,
  ArchiveKeywordOperator,
  ArchiveUserIdentity,
  ArchiveFanMedalFilter,
  ArchiveGiftPriceMode,
} from "./archiveTypes.ts";
import { getArchiveKeywordJoin } from "./archiveTypes.ts";
import { UNKNOWN_MSG_TYPE_CODE } from "../protocol/eventTypeCodes.ts";
import { NON_EVENT_PROTOCOL_COMMANDS } from "../protocol/nonEventCommands.ts";
import { buildArchiveSearchFieldsSql } from "./archiveContentSearch.ts";

export interface ArchiveQueryAliases {
  eventAlias?: string;
  favoriteAlias?: string;
  profileAlias?: string;
}

export interface ArchiveQueryOptions extends ArchiveQueryAliases {
  placeholderOffset?: number;
}

export interface ArchiveQuery {
  whereSql: string;
  values: unknown[];
  joinsSql: string;
}

const DEFAULT_ALIASES: Required<ArchiveQueryAliases> = {
  eventAlias: "e",
  favoriteAlias: "f",
  profileAlias: "p",
};

function placeholder(values: unknown[], value: unknown, offset: number): string {
  values.push(value);
  return `$${offset + values.length}`;
}

function uniqueNonEmpty(values: readonly string[] | undefined): string[] {
  if (!values) return [];
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

/** LIKE 只由程序加入包围符；用户输入的通配符会被转义，不能改变查询结构。 */
export function escapeArchiveLikeValue(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/!/g, "!!")
    .replace(/%/g, "!%")
    .replace(/_/g, "!_")
    .replace(/\\/g, "!\\");
}

function normalizedKeywordConditions(filters: ArchiveFilterState): ArchiveKeywordCondition[] {
  const explicit = (filters.keywordConditions ?? [])
    .map((condition) => ({ ...condition, value: condition.value.trim() }))
    .filter((condition) => condition.value.length > 0);
  if (explicit.length > 0) {
    return explicit.map((condition, index) => ({
      ...condition,
      join: index === 0 ? undefined : getArchiveKeywordJoin(condition, index, filters.keywordOperator),
    }));
  }
  const searchText = filters.searchText?.trim();
  return searchText ? [{ field: "content", value: searchText }] : [];
}

function keywordColumn(
  field: ArchiveKeywordField,
  aliases: Required<ArchiveQueryAliases>,
): string {
  const event = aliases.eventAlias;
  const medalName = `COALESCE(json_extract(${event}.payload_json, '$.user.medal.name'), '')`;
  const giftName = `COALESCE(json_extract(${event}.payload_json, '$.gift.name'), '')`;
  const blindGiftName = `COALESCE(json_extract(${event}.payload_json, '$.gift.blindGiftName'), '')`;
  const userName = `COALESCE(${event}.user_name, json_extract(${event}.payload_json, '$.user.uname'), '')`;
  const nickname = `COALESCE(${aliases.profileAlias}.nickname, '')`;
  const content = `COALESCE(${event}.search_text, '')`;
  switch (field) {
    case "user":
    case "nickname":
      return buildArchiveSearchFieldsSql([userName, nickname]);
    case "fanMedal":
      return `LOWER(${medalName})`;
    case "gift":
      return buildArchiveSearchFieldsSql([giftName, blindGiftName]);
    case "note":
      return "''";
    case "all":
      return buildArchiveSearchFieldsSql([userName, nickname, medalName, giftName, blindGiftName, content]);
    case "content":
      return `LOWER(${content})`;
  }
}

function identityConditionSql(identity: ArchiveUserIdentity, eventAlias: string): string {
  const guardLevel = `CAST(json_extract(${eventAlias}.payload_json, '$.user.guardLevel') AS INTEGER)`;
  const isAdmin = `CAST(json_extract(${eventAlias}.payload_json, '$.user.isAdmin') AS INTEGER)`;
  const isAnchor = `CAST(json_extract(${eventAlias}.payload_json, '$.user.isAnchor') AS INTEGER)`;
  switch (identity) {
    case "admin":
      return `${isAdmin} = 1`;
    case "anchor":
      return `${isAnchor} = 1`;
    case "guard":
      return `${guardLevel} IN (1, 2, 3)`;
    case "captain":
      return `${guardLevel} = 1`;
    case "admiral":
      return `${guardLevel} = 2`;
    case "viceroy":
      return `${guardLevel} = 3`;
    case "normal":
      return `COALESCE(${guardLevel}, 0) = 0 AND COALESCE(${isAdmin}, 0) = 0 AND COALESCE(${isAnchor}, 0) = 0`;
  }
}

function fanMedalConditionSql(filter: ArchiveFanMedalFilter, eventAlias: string): string {
  const currentRoom = `CAST(json_extract(${eventAlias}.payload_json, '$.user.medal.isCurrentRoom') AS INTEGER)`;
  if (filter === "currentLighted") {
    const lighted = `CAST(json_extract(${eventAlias}.payload_json, '$.user.medal.isLighted') AS INTEGER)`;
    return `${currentRoom} = 1 AND ${lighted} = 1`;
  }
  return `${currentRoom} = 1`;
}

function giftPriceExpression(eventAlias: string, mode: ArchiveGiftPriceMode): string {
  const blindName = `json_extract(${eventAlias}.payload_json, '$.gift.blindGiftName')`;
  const unitPrice = `CASE WHEN COALESCE(${blindName}, '') <> '' THEN json_extract(${eventAlias}.payload_json, '$.gift.blindPriceRmb') ELSE json_extract(${eventAlias}.payload_json, '$.gift.priceRmb') END`;
  if (mode !== "cumulative") return unitPrice;
  const count = `COALESCE(CAST(json_extract(${eventAlias}.payload_json, '$.gift.count') AS REAL), 1)`;
  return `(${unitPrice}) * (${count})`;
}

function finitePriceBound(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function appendGiftPriceConditions(
  filters: ArchiveFilterState,
  eventAlias: string,
  values: unknown[],
  offset: number,
  conditions: string[],
): void {
  const min = finitePriceBound(filters.giftPriceMinRmb);
  const max = finitePriceBound(filters.giftPriceMaxRmb);
  if (min === undefined && max === undefined) return;
  conditions.push(`${eventAlias}.primary_category = ${placeholder(values, "gift", offset)}`);
  const expression = giftPriceExpression(eventAlias, filters.giftPriceMode === "cumulative" ? "cumulative" : "unit");
  // 与现场阈值一致：无法从原始事件确认价格时保留事件，不静默丢失档案内容。
  if (min !== undefined) {
    conditions.push(`(${expression} IS NULL OR ${expression} >= ${placeholder(values, min, offset)})`);
  }
  if (max !== undefined) {
    conditions.push(`(${expression} IS NULL OR ${expression} <= ${placeholder(values, max, offset)})`);
  }
}

function keywordConditionSql(
  condition: ArchiveKeywordCondition,
  aliases: Required<ArchiveQueryAliases>,
  values: unknown[],
  offset: number,
): string {
  const bound = placeholder(values, `%${escapeArchiveLikeValue(condition.value)}%`, offset);
  return `${keywordColumn(condition.field, aliases)} LIKE ${bound} ESCAPE '!'`;
}

function keywordExpressionSql(
  conditions: readonly ArchiveKeywordCondition[],
  aliases: Required<ArchiveQueryAliases>,
  values: unknown[],
  offset: number,
  legacyOperator: ArchiveKeywordOperator | undefined,
): string {
  const conditionSql = conditions.map((condition) => keywordConditionSql(condition, aliases, values, offset));
  const groups: string[][] = [[]];
  for (let index = 1; index < conditions.length; index += 1) {
    const join = getArchiveKeywordJoin(conditions[index], index, legacyOperator).toUpperCase();
    if (join === "OR") groups.push([]);
    groups[groups.length - 1].push(conditionSql[index]);
  }
  groups[0].unshift(conditionSql[0]);
  return groups
    .map((group) => group.length === 1 ? group[0] : `(${group.join(" AND ")})`)
    .join(" OR ");
}

/**
 * 只生成受控 SQL 片段和 bind values。字段名、排序和作用域由调用方固定，
 * 用户输入永远只进入 values，不进入 SQL 文本。
 */
export function buildArchiveQuery(
  filters: ArchiveFilterState = {},
  options: ArchiveQueryOptions = {},
): ArchiveQuery {
  const aliases: Required<ArchiveQueryAliases> = {
    ...DEFAULT_ALIASES,
    eventAlias: options.eventAlias ?? DEFAULT_ALIASES.eventAlias,
    favoriteAlias: options.favoriteAlias ?? DEFAULT_ALIASES.favoriteAlias,
    profileAlias: options.profileAlias ?? DEFAULT_ALIASES.profileAlias,
  };
  const offset = options.placeholderOffset ?? 0;
  const values: unknown[] = [];
  const conditions: string[] = [];

  const nonEventCommands = NON_EVENT_PROTOCOL_COMMANDS.map((command) => `'${command}'`).join(", ");
  conditions.push(`NOT (
    CAST(COALESCE(json_extract(${aliases.eventAlias}.payload_json, '$.msgType'), -1) AS INTEGER) = ${UNKNOWN_MSG_TYPE_CODE}
    AND COALESCE(json_extract(${aliases.eventAlias}.payload_json, '$.text'), '') IN (${nonEventCommands})
  )`);

  const keywordConditions = normalizedKeywordConditions(filters);
  if (keywordConditions.length > 0) {
    conditions.push(`(${keywordExpressionSql(keywordConditions, aliases, values, offset, filters.keywordOperator)})`);
  }

  const primaryCategories = uniqueNonEmpty(filters.primaryCategories);
  if (filters.primaryCategories !== undefined && primaryCategories.length === 0 && filters.filterMode !== "exclude") {
    conditions.push("1 = 0");
  } else if (primaryCategories.length > 0) {
    const placeholders = primaryCategories.map((value) => placeholder(values, value, offset));
    const operator = filters.filterMode === "exclude" ? "NOT IN" : "IN";
    conditions.push(`${aliases.eventAlias}.primary_category ${operator} (${placeholders.join(", ")})`);
  }

  const secondaryCategories = uniqueNonEmpty([
    ...(filters.secondaryCategories ?? []),
    ...(filters.eventTypes ?? []),
  ]);
  const hasSecondarySelection = filters.secondaryCategories !== undefined || filters.eventTypes !== undefined;
  if (hasSecondarySelection && secondaryCategories.length === 0 && filters.filterMode !== "exclude") {
    conditions.push(`${aliases.eventAlias}.secondary_category IS NULL`);
  } else if (secondaryCategories.length > 0) {
    const placeholders = secondaryCategories.map((value) => placeholder(values, value, offset));
    const secondaryColumn = `${aliases.eventAlias}.secondary_category`;
    conditions.push(filters.filterMode === "exclude"
      ? `(${secondaryColumn} IS NULL OR ${secondaryColumn} NOT IN (${placeholders.join(", ")}))`
      : `(${secondaryColumn} IS NULL OR ${secondaryColumn} IN (${placeholders.join(", ")}))`);
  }

  if (filters.userUid?.trim()) {
    conditions.push(`${aliases.eventAlias}.user_uid = ${placeholder(values, filters.userUid.trim(), offset)}`);
  }
  if (filters.userIdentity) {
    conditions.push(identityConditionSql(filters.userIdentity, aliases.eventAlias));
  }
  if (filters.fanMedal) {
    conditions.push(fanMedalConditionSql(filters.fanMedal, aliases.eventAlias));
  }
  appendGiftPriceConditions(filters, aliases.eventAlias, values, offset, conditions);
  if (filters.favoriteOnly) {
    conditions.push(`${aliases.favoriteAlias}.event_key IS NOT NULL`);
  }
  if (filters.fromTs !== undefined) {
    conditions.push(`${aliases.eventAlias}.event_ts >= ${placeholder(values, filters.fromTs, offset)}`);
  }
  if (filters.toTs !== undefined) {
    conditions.push(`${aliases.eventAlias}.event_ts < ${placeholder(values, filters.toTs, offset)}`);
  }

  return {
    whereSql: conditions.join(" AND "),
    values,
    joinsSql: `LEFT JOIN archive_user_profile ${aliases.profileAlias} ON ${aliases.profileAlias}.user_uid = ${aliases.eventAlias}.user_uid
       LEFT JOIN archive_favorite ${aliases.favoriteAlias} ON ${aliases.favoriteAlias}.event_key = ${aliases.eventAlias}.event_key`,
  };
}

export function hasArchiveKeywordConditions(filters: ArchiveFilterState = {}): boolean {
  return normalizedKeywordConditions(filters).length > 0;
}
