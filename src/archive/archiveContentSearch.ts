import type { DanmakuEvent } from "../protocol/types.ts";
import type { ArchiveKeywordField } from "./archiveTypes.ts";
import { buildEventContentText } from "../events/eventContentText.ts";

/**
 * 回看“内容”字段的唯一语义：只索引事件自身可读内容和结构化回复目标，不混入用户名、昵称或粉丝牌。
 * 用户信息由独立的“用户”字段负责匹配。
 */
export function buildArchiveContentText(event: DanmakuEvent): string {
  return buildEventContentText(event).toLocaleLowerCase();
}

/** 固定搜索字段按传入顺序排空拼接，字段内部空格保持原样。 */
export function buildArchiveSearchFieldsSql(parts: readonly string[]): string {
  return `(SELECT LOWER(COALESCE(group_concat(part, ' '), '')) FROM (
    SELECT part FROM (
      ${parts.map((part, index) => `SELECT ${index} AS position, ${part} AS part`).join(" UNION ALL ")}
    ) WHERE part <> '' ORDER BY position
  ))`;
}

/** 关键词字段只读取事件 payload 中对应的可读字段；用户信息由投影/SQL 另行处理。 */
export function buildArchiveKeywordText(event: DanmakuEvent, field: ArchiveKeywordField): string {
  if (field === "fanMedal") {
    return typeof event.user?.medal?.name === "string" ? event.user.medal.name.toLocaleLowerCase() : "";
  }
  if (field === "gift") {
    return [event.gift?.name, event.gift?.blindGiftName]
      .filter((part): part is string => typeof part === "string" && part.length > 0)
      .join(" ")
      .toLocaleLowerCase();
  }
  if (field === "all") {
    return [buildArchiveKeywordText(event, "fanMedal"), buildArchiveKeywordText(event, "gift"), buildArchiveContentText(event)]
      .filter(Boolean)
      .join(" ");
  }
  if (field === "user" || field === "nickname") return "";
  if (field === "note") return "";
  return buildArchiveContentText(event);
}

export function buildArchiveContentTextFromPayload(payload: unknown, fallback = ""): string {
  const event = typeof payload === "string"
    ? parseArchiveEventPayload(payload)
    : isRecord(payload)
      ? payload as unknown as DanmakuEvent
      : null;
  return event ? buildArchiveContentText(event) : fallback.trim().toLocaleLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseArchiveEventPayload(payload: string): DanmakuEvent | null {
  try {
    const parsed: unknown = JSON.parse(payload);
    return isRecord(parsed) ? parsed as unknown as DanmakuEvent : null;
  } catch {
    return null;
  }
}
