import { MsgType, type DanmakuEvent, type DanmakuUser, type GiftInfo } from "../protocol/types.ts";
import { resolveReplyMention } from "../events/replyMentions.ts";
import { projectArchiveEvents, type ArchiveProjectedEvent } from "./archiveProjection.ts";
import type {
  ArchiveEventQuery,
  ArchiveEventRecord,
  ArchiveFilterState,
  ArchiveRepositoryContract,
  ArchiveSessionQuery,
  ArchiveSessionSummary,
} from "./archiveTypes.ts";
import type {
  ArchiveDataExportCategory,
  ArchiveDataExportCollectionOptions,
  ArchiveDataExportCommonRow,
  ArchiveDataExportItem,
  ArchiveDataExportRow,
  ArchiveDataExportScope,
  ArchiveDataExportSnapshot,
  ArchiveDataExportStats,
  ArchiveDataExportSummaryKey,
  ArchiveDataExportSummaryBlock,
} from "./archiveDataExportTypes.ts";

const CATEGORY_KEYS: ArchiveDataExportCategory[] = ["danmaku", "interaction", "gift", "superchat", "guard"];
const PAGE_SIZE = 500;
const SESSION_PAGE_SIZE = 100;

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("导出已取消", "AbortError");
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function guardName(level: unknown): "舰长" | "提督" | "总督" | null {
  return level === 1 ? "舰长" : level === 2 ? "提督" : level === 3 ? "总督" : null;
}

function currentRoomMedal(user?: DanmakuUser): string | null {
  const medal = user?.medal;
  if (!medal || medal.isCurrentRoom !== true || !medal.name) return null;
  return `${medal.name} ${medal.level}`;
}

function commonRow(projected: ArchiveProjectedEvent, guardLevel?: number): ArchiveDataExportCommonRow {
  const user = projected.event.user;
  return {
    "场次ID": projected.sessionId,
    "事件时间": formatDateTime(projected.eventTs),
    "用户UID": user?.uid ?? projected.record.userUid ?? null,
    "用户名": user?.uname ?? projected.record.userName ?? null,
    "粉丝牌": currentRoomMedal(user),
    "荣耀等级": finite(user?.wealthLevel),
    "大航海身份": guardName(guardLevel ?? user?.guardLevel),
  };
}

function danmakuText(event: DanmakuEvent): string {
  const text = event.text ?? "";
  const resolution = resolveReplyMention(text, event.replyTo);
  if (!resolution || !event.replyTo || !resolution.prepend) return text;
  return `${resolution.label} ${text}`;
}

function giftPayment(gift: GiftInfo): number | null {
  if (gift.isFree === true || gift.coinType === "silver") return 0;
  const payment = finite((gift as GiftInfo & { paymentRmb?: number }).paymentRmb);
  return payment === null ? null : roundMoney(payment);
}

function giftRow(projected: ArchiveProjectedEvent, kind: "普通礼物" | "盲盒"): ArchiveDataExportRow {
  const gift = projected.event.gift!;
  const count = finite(gift.count);
  const hitValue = kind === "盲盒" ? finite(gift.blindHitPriceRmb) : finite(gift.priceRmb);
  const value = hitValue === null || count === null ? null : roundMoney(hitValue * count);
  const payment = kind === "盲盒"
    ? giftPayment(gift)
    : giftPayment(gift);
  return {
    ...commonRow(projected),
    "礼物类型": kind,
    "礼物名称": gift.name || null,
    "数量": count,
    "礼物价值": value,
    "实际支付金额": payment,
    "盲盒名称": kind === "盲盒" ? gift.blindGiftName ?? null : null,
  };
}

export function classifyArchiveExportEvent(event: DanmakuEvent): ArchiveDataExportCategory | null {
  switch (event.msgType) {
    case MsgType.Danmu: return "danmaku";
    case MsgType.Interact: return "interaction";
    case MsgType.Gift: return event.gift?.blindGiftName ? "gift" : "gift";
    case MsgType.RedPocketStart: return "gift";
    case MsgType.SuperChat: return "superchat";
    case MsgType.GuardBuy: return "guard";
    default: return null;
  }
}

export function projectArchiveDataEvent(projected: ArchiveProjectedEvent): ArchiveDataExportItem | null {
  const { event } = projected;
  const category = classifyArchiveExportEvent(event);
  if (!category) return null;

  let row: ArchiveDataExportRow;
  if (category === "danmaku") {
    row = { ...commonRow(projected), "内容": danmakuText(event) };
  } else if (category === "interaction") {
    row = { ...commonRow(projected), "内容": event.text ?? "" };
  } else if (category === "superchat") {
    row = { ...commonRow(projected), "内容": event.sc?.message ?? event.text ?? "", "金额": finite(event.sc?.price) };
  } else if (category === "guard") {
    row = {
      ...commonRow(projected, event.guard?.level),
      "动作": event.guard?.action ?? null,
      "时长": event.guard ? `${event.guard.count}${event.guard.unit ?? ""}` : null,
      "金额": finite(event.guard?.priceRmb),
    };
  } else if (event.msgType === MsgType.RedPocketStart) {
    row = {
      ...commonRow(projected),
      "礼物类型": "红包",
      "礼物名称": null,
      "数量": null,
      "礼物价值": null,
      "实际支付金额": finite(event.lottery?.totalPrice) === null ? null : roundMoney((event.lottery?.totalPrice as number) / 1000),
      "盲盒名称": null,
    };
  } else {
    row = giftRow(projected, event.gift?.blindGiftName ? "盲盒" : "普通礼物");
  }

  return {
    category,
    sessionId: projected.sessionId,
    eventTs: projected.eventTs,
    ordinal: projected.ordinal,
    eventKey: projected.eventKey,
    row,
  };
}

export function projectArchiveDataEvents(projectedRows: readonly ArchiveProjectedEvent[]): ArchiveDataExportItem[] {
  return projectedRows.flatMap((row) => {
    const item = projectArchiveDataEvent(row);
    return item ? [item] : [];
  });
}

function emptyStats(): ArchiveDataExportStats {
  return { eventCount: 0, uniqueUserCount: 0, quantity: null, value: null, amount: null };
}

function summarizeRowGroup(rows: readonly ArchiveDataExportItem[]): ArchiveDataExportStats {
  const users = new Set(rows.map((item) => item.row["用户UID"]).filter((uid): uid is string => typeof uid === "string" && uid.length > 0));
  const quantities = rows.map((item) => finite(item.row["数量"]));
  const values = rows.map((item) => finite(item.row["礼物价值"]));
  const amounts = rows.map((item) => finite(item.row["实际支付金额"] ?? item.row["金额"]));
  let quantity = 0;
  for (const value of quantities) quantity += value ?? 0;
  return {
    eventCount: rows.length,
    uniqueUserCount: users.size,
    quantity: quantities.some((value) => value !== null) ? roundMoney(quantity) : null,
    value: values.some((value) => value !== null) && values.every((value) => value !== null)
      ? roundMoney((values as number[]).reduce((sum, value) => sum + value, 0))
      : null,
    amount: amounts.some((value) => value !== null) && amounts.every((value) => value !== null)
      ? roundMoney((amounts as number[]).reduce((sum, value) => sum + value, 0))
      : null,
  };
}

function summarizeRows(rows: readonly ArchiveDataExportItem[]): Record<ArchiveDataExportSummaryKey, ArchiveDataExportStats> {
  const stats = Object.fromEntries([
    "danmaku", "interaction", "normalGift", "blindGift", "redPocket", "superchat", "guard", "captain", "admiral", "viceroy",
  ].map((key) => [key, emptyStats()])) as Record<ArchiveDataExportSummaryKey, ArchiveDataExportStats>;
  for (const category of ["danmaku", "interaction", "superchat", "guard"] as const) {
    const categoryRows = rows.filter((item) => item.category === category);
    stats[category] = summarizeRowGroup(categoryRows);
  }
  stats.normalGift = summarizeRowGroup(rows.filter((item) => item.category === "gift" && item.row["礼物类型"] === "普通礼物"));
  stats.blindGift = summarizeRowGroup(rows.filter((item) => item.category === "gift" && item.row["礼物类型"] === "盲盒"));
  stats.redPocket = summarizeRowGroup(rows.filter((item) => item.category === "gift" && item.row["礼物类型"] === "红包"));
  for (const [key, level] of [["captain", 1], ["admiral", 2], ["viceroy", 3]] as const) {
    const guardRows = rows.filter((item) => item.category === "guard" && item.row["大航海身份"] === guardName(level));
    stats[key] = summarizeRowGroup(guardRows);
  }
  return stats;
}

export function buildArchiveDataSummary(
  sessions: readonly ArchiveSessionSummary[],
  rows: readonly ArchiveDataExportItem[] | readonly { category: ArchiveDataExportCategory; sessionId: string; row: ArchiveDataExportRow }[],
): ArchiveDataExportSummaryBlock[] {
  return sessions.map((session) => ({
    session,
    stats: summarizeRows(rows.filter((row) => row.sessionId === session.sessionId) as ArchiveDataExportItem[]),
    exportedEventCount: rows.filter((row) => row.sessionId === session.sessionId).length,
  }));
}

async function readSessionRecords(
  repository: ArchiveRepositoryContract,
  sessionId: string,
  filters: ArchiveFilterState | undefined,
  options: ArchiveDataExportCollectionOptions,
): Promise<ArchiveEventRecord[]> {
  const records: ArchiveEventRecord[] = [];
  let cursor: string | null = null;
  do {
    throwIfAborted(options.signal);
    const query: ArchiveEventQuery = { sessionId, filters, direction: "asc", cursor, limit: PAGE_SIZE };
    const page = await repository.queryEvents(query);
    records.push(...page.items);
    cursor = page.nextCursor;
    options.onProgress?.({ phase: "events", completed: records.length, total: page.totalCount ?? records.length, sessionId, eventCount: records.length });
  } while (cursor !== null);
  return records;
}

async function readSessions(repository: ArchiveRepositoryContract, scope: ArchiveDataExportScope, signal?: AbortSignal): Promise<ArchiveSessionSummary[]> {
  if (scope.kind === "session") {
    const session = await repository.getSession(scope.sessionId);
    if (!session) throw new Error("场次不存在");
    return [session];
  }
  if (scope.kind === "sessions") {
    const sessions = await Promise.all([...new Set(scope.sessionIds)].map((id) => repository.getSession(id)));
    return sessions.filter((session): session is ArchiveSessionSummary => session !== null);
  }
  const baseQuery: ArchiveSessionQuery = scope.kind === "owner"
    ? { ...(scope.sessionQuery ?? {}), ownerId: scope.ownerId }
    : {};
  const sessions: ArchiveSessionSummary[] = [];
  let offset = 0;
  while (true) {
    throwIfAborted(signal);
    const page = await repository.listSessions({ ...baseQuery, limit: SESSION_PAGE_SIZE, offset });
    sessions.push(...page);
    if (page.length < SESSION_PAGE_SIZE) break;
    offset += page.length;
  }
  return sessions;
}

export async function collectArchiveDataExportSnapshot(
  repository: ArchiveRepositoryContract,
  scope: ArchiveDataExportScope,
  options: ArchiveDataExportCollectionOptions = {},
): Promise<ArchiveDataExportSnapshot> {
  const sessions = await readSessions(repository, scope, options.signal);
  const filters = scope.filters;
  const records: ArchiveEventRecord[] = [];
  for (let index = 0; index < sessions.length; index += 1) {
    throwIfAborted(options.signal);
    const sessionRecords = await readSessionRecords(repository, sessions[index].sessionId, filters, options);
    records.push(...sessionRecords);
    options.onProgress?.({ phase: "sessions", completed: index + 1, total: sessions.length, sessionId: sessions[index].sessionId, eventCount: sessionRecords.length });
  }
  return { sessions, records };
}

export function buildArchiveDataBundle(
  snapshot: ArchiveDataExportSnapshot,
  scope: ArchiveDataExportScope,
  filters?: ArchiveFilterState,
): { items: ArchiveDataExportItem[]; rowsByCategory: Record<ArchiveDataExportCategory, ArchiveDataExportRow[]>; summary: ArchiveDataExportSummaryBlock[] } {
  void scope;
  const projected = projectArchiveEvents(snapshot.records, { filters, direction: "asc" });
  const items = projectArchiveDataEvents(projected);
  const rowsByCategory = Object.fromEntries(CATEGORY_KEYS.map((category) => [category, items.filter((item) => item.category === category).map((item) => item.row)])) as Record<ArchiveDataExportCategory, ArchiveDataExportRow[]>;
  return { items, rowsByCategory, summary: buildArchiveDataSummary(snapshot.sessions, items) };
}
