import { MsgType, type DanmakuEvent } from "../protocol/types.ts";
import { isHiddenEvent } from "../events/eventView.ts";
import { mergeGiftInto } from "../events/giftMerge.ts";
import { isGiftWithinPriceRange } from "../giftThreshold.ts";
import type {
  ArchiveCursorPage,
  ArchiveEventRecord,
  ArchiveFilterState,
  ArchiveSortDirection,
} from "./archiveTypes.ts";
import { getArchiveKeywordJoin } from "./archiveTypes.ts";
import { shouldShowBigEmote, shouldShowAutoDanmaku, shouldShowPhoneNotVerified } from "../eventDisplaySettings.ts";
import { buildArchiveContentText, buildArchiveKeywordText } from "./archiveContentSearch.ts";

export interface ArchiveProjectionOptions {
  showAutoDanmaku?: boolean;
  showPhoneNotVerified?: boolean;
  filters?: ArchiveFilterState;
  direction?: ArchiveSortDirection;
}

export interface ArchiveProjectedEvent {
  eventKey: string;
  sourceEventKeys: string[];
  sessionId: string;
  roomId: number;
  ordinal: number;
  eventTs: number;
  primaryCategory: string;
  secondaryCategory: string | null;
  favorited: boolean;
  record: ArchiveEventRecord;
  event: DanmakuEvent;
}

export function findProjectedEventBySourceKey(
  rows: ArchiveProjectedEvent[],
  sourceEventKey: string,
): ArchiveProjectedEvent | undefined {
  return rows.find((row) => row.sourceEventKeys.includes(sourceEventKey));
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function parseEvent(record: ArchiveEventRecord): DanmakuEvent | null {
  try {
    const parsed: unknown = JSON.parse(record.payloadJson);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const event = parsed as DanmakuEvent;
    return {
      ...event,
      id: typeof event.id === "string" && event.id ? event.id : record.eventKey,
      roomId: finiteNumber(event.roomId, record.roomId),
      ts: finiteNumber(event.ts, record.eventTs),
    };
  } catch {
    return null;
  }
}

function eventTime(item: Pick<ArchiveProjectedEvent, "event" | "eventTs">): number {
  return finiteNumber(item.event.ts, item.eventTs);
}

function compareRecords(a: ArchiveEventRecord, b: ArchiveEventRecord, direction: ArchiveSortDirection): number {
  const sign = direction === "desc" ? -1 : 1;
  return sign * (
    a.eventTs - b.eventTs
    || a.ordinal - b.ordinal
    || a.eventKey.localeCompare(b.eventKey)
  );
}

function compareProjected(a: ArchiveProjectedEvent, b: ArchiveProjectedEvent, direction: ArchiveSortDirection): number {
  const sign = direction === "desc" ? -1 : 1;
  return sign * (
    eventTime(a) - eventTime(b)
    || a.ordinal - b.ordinal
    || a.eventKey.localeCompare(b.eventKey)
  );
}

/** 把游标页按事件三元组稳定拼接；重复页不会造成重复行。 */
export function appendArchiveEventPage(
  current: readonly ArchiveEventRecord[],
  page: ArchiveCursorPage<ArchiveEventRecord>,
  direction: ArchiveSortDirection = "asc",
): ArchiveEventRecord[] {
  const byKey = new Map(current.map((item) => [item.eventKey, item]));
  for (const item of page.items) {
    if (!byKey.has(item.eventKey)) byKey.set(item.eventKey, item);
  }
  return [...byKey.values()].sort((a, b) => compareRecords(a, b, direction));
}

function matchesArchiveFilters(record: ArchiveEventRecord, event: DanmakuEvent, filters: ArchiveFilterState): boolean {
  if (filters.showBigEmote === false && !shouldShowBigEmote(event.emoticon, false)) return false;
  if (filters.primaryCategories !== undefined) {
    const matches = filters.primaryCategories.includes(record.primaryCategory);
    if (filters.filterMode === "exclude" ? matches : !matches) return false;
  }
  const secondaryCategories = [
    ...(filters.secondaryCategories ?? []),
    ...(filters.eventTypes ?? []),
  ];
  if ((filters.secondaryCategories !== undefined || filters.eventTypes !== undefined)
    && record.secondaryCategory !== null
    && record.secondaryCategory !== undefined) {
    const matches = secondaryCategories.includes(record.secondaryCategory);
    if (filters.filterMode === "exclude" ? matches : !matches) return false;
  }
  if (filters.userUid && (record.userUid ?? event.user?.uid) !== filters.userUid) return false;
  if (filters.userIdentity) {
    const user = event.user;
    if (!user) return false;
    const identityMatches = filters.userIdentity === "admin"
      ? user.isAdmin === true
      : filters.userIdentity === "anchor"
        ? user.isAnchor === true
        : filters.userIdentity === "guard"
          ? [1, 2, 3].includes(user.guardLevel)
        : filters.userIdentity === "captain"
          ? user.guardLevel === 1
          : filters.userIdentity === "admiral"
            ? user.guardLevel === 2
            : filters.userIdentity === "viceroy"
              ? user.guardLevel === 3
              : (user.guardLevel ?? 0) === 0 && user.isAdmin !== true && user.isAnchor !== true;
    if (!identityMatches) return false;
  }
  if (filters.fanMedal) {
    const medal = event.user?.medal;
    const medalMatches = medal?.isCurrentRoom === true
      && (filters.fanMedal !== "currentLighted" || medal.isLighted === true);
    if (!medalMatches) return false;
  }
  if (filters.giftPriceMinRmb !== undefined || filters.giftPriceMaxRmb !== undefined) {
    if (event.msgType !== MsgType.Gift || !event.gift) return false;
    if (!isGiftWithinPriceRange(event.gift, filters.giftPriceMinRmb, filters.giftPriceMaxRmb, filters.giftPriceMode === "cumulative" ? "cumulative" : "unit")) return false;
  }
  if (filters.favoriteOnly && !record.favorited) return false;
  if (filters.fromTs !== undefined && record.eventTs < filters.fromTs) return false;
  if (filters.toTs !== undefined && record.eventTs >= filters.toTs) return false;
  const keywordConditions = filters.keywordConditions?.filter((condition) => condition.value.trim() !== "") ?? [];
  if (keywordConditions.length > 0) {
    const matches = keywordConditions.map((condition) => {
      const value = condition.value.trim().toLocaleLowerCase();
      switch (condition.field) {
        case "user":
        case "nickname":
          return [record.userName ?? event.user?.uname, record.userNickname].filter(Boolean).join(" ").toLocaleLowerCase().includes(value);
        case "all":
          return [record.userName ?? event.user?.uname, record.userNickname, buildArchiveKeywordText(event, condition.field)].filter(Boolean).join(" ").toLocaleLowerCase().includes(value);
        case "fanMedal":
        case "gift":
        case "content":
          return buildArchiveKeywordText(event, condition.field).includes(value);
        default:
          return false;
      }
    });
    const keywordGroups: boolean[][] = [[matches[0]]];
    for (let index = 1; index < matches.length; index += 1) {
      const join = getArchiveKeywordJoin(keywordConditions[index], index, filters.keywordOperator);
      if (join === "or") keywordGroups.push([matches[index]]);
      else keywordGroups[keywordGroups.length - 1].push(matches[index]);
    }
    if (!keywordGroups.some((group) => group.every(Boolean))) return false;
  }
  const search = filters.searchText?.trim().toLocaleLowerCase();
  if (search && keywordConditions.length === 0) {
    const indexed = buildArchiveContentText(event);
    if (!indexed.includes(search)) return false;
  }
  return true;
}

function toProjected(record: ArchiveEventRecord, event: DanmakuEvent): ArchiveProjectedEvent {
  return {
    eventKey: record.eventKey,
    sourceEventKeys: [record.eventKey],
    sessionId: record.sessionId,
    roomId: record.roomId,
    ordinal: record.ordinal,
    eventTs: record.eventTs,
    primaryCategory: record.primaryCategory,
    secondaryCategory: record.secondaryCategory,
    favorited: record.favorited,
    record,
    event,
  };
}

function mergeGiftRowsInSession(rows: ArchiveProjectedEvent[]): ArchiveProjectedEvent[] {
  const sorted = [...rows].sort((a, b) => compareProjected(a, b, "asc"));
  const mergedEvents: DanmakuEvent[] = [];
  const mergedRows: ArchiveProjectedEvent[] = [];

  for (const row of sorted) {
    const candidate: DanmakuEvent = {
      ...row.event,
      gift: row.event.gift ? { ...row.event.gift } : undefined,
    };
    const result = candidate.msgType === MsgType.Gift ? mergeGiftInto(mergedEvents, candidate) : null;
    if (!result) {
      mergedEvents.push(candidate);
      mergedRows.push({ ...row, event: candidate });
      continue;
    }
    if (!result.updated) continue;
    const index = mergedEvents.indexOf(result.updated);
    const previous = mergedRows[index];
    if (!previous) continue;
    mergedRows[index] = {
      ...previous,
      event: result.updated,
      favorited: previous.favorited || row.favorited,
      sourceEventKeys: [...previous.sourceEventKeys, row.eventKey],
    };
  }
  return mergedRows;
}

function mergeGiftRows(rows: ArchiveProjectedEvent[]): ArchiveProjectedEvent[] {
  // comboId 只在单场内有意义。主播历史可能交错多个场次，不能跨场合并同名礼物。
  const bySession = new Map<string, ArchiveProjectedEvent[]>();
  for (const row of rows) {
    const sessionRows = bySession.get(row.sessionId) ?? [];
    sessionRows.push(row);
    bySession.set(row.sessionId, sessionRows);
  }
  return [...bySession.values()].flatMap(mergeGiftRowsInSession);
}

export function projectArchiveEvents(
  records: readonly ArchiveEventRecord[],
  options: ArchiveProjectionOptions = {},
): ArchiveProjectedEvent[] {
  const filters = options.filters ?? {};
  const direction = options.direction ?? "asc";
  const rows: ArchiveProjectedEvent[] = [];
  for (const record of records) {
    const event = parseEvent(record);
    if (!event || isHiddenEvent(event)) continue;
    if (!shouldShowAutoDanmaku(event, options.showAutoDanmaku ?? true)) continue;
    if (!shouldShowPhoneNotVerified(event, options.showPhoneNotVerified ?? true)) continue;
    if (!matchesArchiveFilters(record, event, filters)) continue;
    rows.push(toProjected(record, event));
  }
  return mergeGiftRows(rows).sort((a, b) => compareProjected(a, b, direction));
}

export function formatReviewEventTime(timestamp: number): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return "--:--:--";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
