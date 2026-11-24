import type { ArchiveEventInput } from "./archiveTypes.ts";
import type { DanmakuEvent } from "../protocol/types.ts";
import { buildArchiveContentText } from "./archiveContentSearch.ts";

import { MsgType } from "../protocol/eventTypeCodes.ts";
import { stableArchiveEventKey } from "../events/eventIdentity.ts";
export { stableArchiveEventKey } from "../events/eventIdentity.ts";

const STATS_ONLY_TYPES = new Set<number>([
  MsgType.WatchedChange,
  MsgType.OnlineRank,
  MsgType.LikeUpdate,
  MsgType.FansUpdate,
]);

export interface ArchiveAppendMutation {
  kind: "append";
  type: "append";
  eventKey: string;
  event: DanmakuEvent;
}

export interface ArchiveUpdateMutation {
  kind: "update";
  type: "update";
  targetEventKeys: readonly string[];
  patch: {
    scDeleted: true;
  };
  event: DanmakuEvent;
}

export type ArchiveMutation = ArchiveAppendMutation | ArchiveUpdateMutation;

export interface ArchiveRoutingResult {
  liveEvents: DanmakuEvent[];
  archiveMutations: ArchiveMutation[];
}

export interface ArchivePaidTotalState {
  total: number;
  comboAmounts: Readonly<Record<string, number>>;
  finalizedCombos: Readonly<Record<string, true>>;
}

/** 兼容旧档案与旧导入包：生命周期已并入系统分类。 */
export function normalizeArchivePrimaryCategory(category: string): string {
  return category === "lifecycle" ? "system" : category;
}



function eventIdentity(event: DanmakuEvent): string {
  return event.dedupe ?? event.id;
}

function finiteAmount(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** 返回一条已接受事件对应的实际付费金额（人民币）；无法确认金额的事件按 0 计。 */
export function getArchiveEventPaidAmount(event: DanmakuEvent): number {
  switch (event.msgType as number) {
    case MsgType.Gift: {
      const gift = event.gift;
      if (!gift || gift.isFree === true) return 0;
      const count = finiteAmount(gift.count) ?? 1;
      const blindPrice = finiteAmount(gift.blindPriceRmb);
      if (gift.blindGiftName && blindPrice !== null) return blindPrice * count;
      const total = finiteAmount(gift.totalRmb);
      if (total !== null) return total;
      const unit = finiteAmount(gift.priceRmb);
      return unit === null ? 0 : unit * count;
    }
    case MsgType.SuperChat:
      return finiteAmount(event.sc?.price) ?? 0;
    case MsgType.GuardBuy:
    case MsgType.GuardHonor:
      return finiteAmount(event.guard?.priceRmb) ?? 0;
    default:
      return 0;
  }
}

/** 仅累计 append mutation；SC 删除等 update 不会重复计入付费。 */
export function applyArchivePaidTotal(
  state: ArchivePaidTotalState,
  mutations: readonly ArchiveMutation[],
): ArchivePaidTotalState {
  let total = state.total;
  const comboAmounts = { ...state.comboAmounts };
  const finalizedCombos = { ...state.finalizedCombos };

  for (const mutation of mutations) {
    if (mutation.kind !== "append") continue;
    const amount = getArchiveEventPaidAmount(mutation.event);
    const comboId = mutation.event.msgType === MsgType.Gift ? mutation.event.comboId : undefined;
    if (!comboId) {
      total += amount;
      continue;
    }
    if (finalizedCombos[comboId] && !mutation.event.isComboUpdate) continue;

    const previous = comboAmounts[comboId] ?? 0;
    if (mutation.event.isComboUpdate) {
      total += Math.max(0, amount - previous);
      comboAmounts[comboId] = Math.max(previous, amount);
      finalizedCombos[comboId] = true;
    } else {
      total += amount;
      comboAmounts[comboId] = previous + amount;
    }
  }

  return {
    total: Math.round(total * 1000) / 1000,
    comboAmounts,
    finalizedCombos,
  };
}

export function sumArchivePaidTotal(mutations: readonly ArchiveMutation[]): number {
  return applyArchivePaidTotal(
    { total: 0, comboAmounts: {}, finalizedCombos: {} },
    mutations,
  ).total;
}

function primaryCategory(event: DanmakuEvent): string {
  switch (event.msgType as number) {
    case 0: return "danmu";
    case MsgType.Gift: return "gift";
    case 2: return "superChat";
    case 3:
    case 9: return "guard";
    case 4:
    case 5: return "lottery";
    case 6:
    case 7:
    case 8: return "redPocket";
    case 10:
    case 11: return "interact";
    case 16:
    case 17:
    case 18:
    case 19:
    case 20:
    case 21:
    case 24:
    case 25:
    case 26:
    case 27: return "system";
    case 22:
    case 23: return "system";
    default: return "unknown";
  }
}

function secondaryCategory(event: DanmakuEvent): string | null {
  if (event.msgType === MsgType.Gift) {
    if (event.gift?.blindGiftName) return "blind";
    if (event.gift?.isFree === true || event.gift?.priceRmb === 0) return "free";
    return "normal";
  }
  return event.interactKind ?? null;
}

function toAppendMutation(event: DanmakuEvent): ArchiveAppendMutation {
  return {
    kind: "append",
    type: "append",
    eventKey: stableArchiveEventKey(event.roomId, eventIdentity(event)),
    event,
  };
}

function toUpdateMutation(event: DanmakuEvent): ArchiveUpdateMutation | null {
  const targetEventKeys = (event.scDeleteIds ?? [])
    .map((eventId) => eventId.trim())
    .filter(Boolean)
    .map((eventId) => stableArchiveEventKey(event.roomId, eventId));
  if (targetEventKeys.length === 0) return null;
  return {
    kind: "update",
    type: "update",
    targetEventKeys,
    patch: { scDeleted: true },
    event,
  };
}

/**
 * 把已经越过协议适配和现场去重边界的事件转换成档案 mutation。
 * 这里不看价格阈值、不看 pane 筛选，也不执行礼物合并。
 */
export function toArchiveMutations(events: readonly DanmakuEvent[]): ArchiveMutation[] {
  const mutations: ArchiveMutation[] = [];
  const seenAppendKeys = new Set<string>();

  for (const event of events) {
    if (STATS_ONLY_TYPES.has(event.msgType as number)) continue;
    if ((event.msgType as number) === MsgType.ScDeleted) {
      const update = toUpdateMutation(event);
      if (update) mutations.push(update);
      continue;
    }
    const append = toAppendMutation(event);
    if (seenAppendKeys.has(append.eventKey)) continue;
    seenAppendKeys.add(append.eventKey);
    mutations.push(append);
  }

  return mutations;
}

/**
 * 供现场 flush 使用的纯路由：去重只为保护调用者直接传入的批次，
 * 实际连接仍以 connection.ts 的 seenIds 为权威去重表。
 */
export function routeAcceptedEvents(events: readonly DanmakuEvent[]): ArchiveRoutingResult {
  const liveEvents: DanmakuEvent[] = [];
  const seen = new Set<string>();

  for (const event of events) {
    if (STATS_ONLY_TYPES.has(event.msgType as number)) continue;
    const key = eventIdentity(event);
    if (seen.has(key)) continue;
    seen.add(key);
    liveEvents.push(event);
  }

  return {
    liveEvents,
    archiveMutations: toArchiveMutations(liveEvents),
  };
}

export function toArchiveEventInput(
  mutation: ArchiveAppendMutation,
  input: { sessionId: string; roomId: number; ordinal: number; eventKey: string },
): ArchiveEventInput {
  const event = mutation.event;
  return {
    eventKey: input.eventKey,
    sessionId: input.sessionId,
    roomId: input.roomId,
    ordinal: input.ordinal,
    eventTs: event.ts,
    primaryCategory: primaryCategory(event),
    secondaryCategory: secondaryCategory(event),
    userUid: event.user?.uid ?? null,
    userName: event.user?.uname ?? null,
    searchText: buildArchiveContentText(event),
    payload: event,
    sourceId: null,
  };
}
