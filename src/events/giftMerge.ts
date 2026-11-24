import { MsgType, type DanmakuEvent, type GiftInfo } from "../protocol/types.ts";
import { getEventBookmarkKey, getEventMarkKey } from "./eventIdentity.ts";

function annotationIdentity(row: DanmakuEvent) {
  return row.annotationIdentity ?? { markKey: getEventMarkKey(row), bookmarkKey: getEventBookmarkKey(row) };
}

function giftPayment(gift: GiftInfo): number | undefined {
  if (gift.isFree === true || gift.coinType === "silver") return 0;
  return typeof gift.paymentRmb === "number" && Number.isFinite(gift.paymentRmb)
    ? gift.paymentRmb : undefined;
}

function mergedPayment(prev: GiftInfo, gift: GiftInfo, cumulative: boolean | undefined): number | undefined {
  const previous = giftPayment(prev);
  const incoming = giftPayment(gift);
  if (cumulative) {
    if (incoming !== undefined) return incoming;
    if (prev.isFree === true || prev.coinType === "silver") return 0;
    if (!prev.blindGiftName && gift.coinType === "gold" && typeof gift.total === "number"
      && Number.isFinite(gift.total) && gift.total > 0) return gift.total / 1000;
    // 没有累计支付时，已有支付必须覆盖摘要的完整数量。
    return prev.count === gift.count ? previous : undefined;
  }
  return previous !== undefined && incoming !== undefined ? previous + incoming : undefined;
}

/** 礼物连击合并窗口：同 uid+giftId 距该行最近一次送礼超过此时间则落新行。 */
export const COMBO_WINDOW_MS = 8000;

export type GiftMergeResult = { updated: DanmakuEvent | null };

/**
 * 将普通礼物/连击进度合并到现场事件数组。
 *
 * 盲盒结果本身不能互相合并；但普通 COMBO_SEND 可能先到，形成一个没有盲盒
 * 信息的占位行。随后收到同一连击的真实结果时，应升级这行，而不是再追加一行。
 */
export function mergeGiftInto(next: DanmakuEvent[], ev: DanmakuEvent): GiftMergeResult | null {
  const gift = ev.gift;
  if (!gift || !ev.user) return null;

  if (gift.blindGiftName) {
    if (!ev.comboId) return null;

    for (let i = next.length - 1; i >= 0; i--) {
      const row = next[i];
      if (row.msgType !== MsgType.Gift || row.comboId !== ev.comboId) continue;
      if (row.user?.uid !== ev.user.uid || row.gift?.id !== gift.id) continue;
      if (row.gift.blindGiftName) return null;

      // 保留占位行的业务键，保证独立礼物窗用原键替换，而不是再显示一行。
      next[i] = {
        ...row,
        ...ev,
        firstOccurredAt: row.firstOccurredAt ?? row.ts,
        id: row.id,
        reactKey: row.reactKey,
        dedupe: row.dedupe,
        annotationIdentity: annotationIdentity(row),
        comboFinalized: row.comboFinalized || ev.comboFinalized,
      };
      return { updated: next[i] };
    }
    return null;
  }

  // COMBO_SEND / 带 combo_id 的 SEND_GIFT 先做精确匹配。combo_id 自带场次，
  // 服务端总结即使延迟超过 8 秒，也仍属于原连击。
  if (ev.comboId) {
    for (let i = next.length - 1; i >= 0; i--) {
      const row = next[i];
      if (row.msgType !== MsgType.Gift || row.comboId !== ev.comboId) continue;
      const prev = row.gift;
      if (!prev) return null;
      if (row.user?.uid !== ev.user.uid || prev.id !== gift.id) continue;
      // COMBO_SEND 已给出权威总数后，迟到/重推的逐条 SEND_GIFT 只消费、不再累加。
      if (row.comboFinalized && !ev.isComboUpdate) return { updated: null };
      next[i] = {
        ...row,
        ts: ev.ts,
        firstOccurredAt: row.firstOccurredAt ?? row.ts,
        comboFinalized: row.comboFinalized || ev.isComboUpdate,
        gift: ev.isComboUpdate
          ? { ...prev, count: gift.count, total: gift.total, totalRmb: gift.totalRmb,
              paymentRmb: mergedPayment(prev, gift, true) }
          : {
              ...prev,
              count: (prev.count ?? 0) + gift.count,
              total: (prev.total ?? 0) + gift.total,
              totalRmb: (prev.totalRmb ?? 0) + (gift.totalRmb ?? 0),
              paymentRmb: mergedPayment(prev, gift, false),
            },
      };
      return { updated: next[i] };
    }
  }

  // 缺少精确 ID 时，在当前房间已有现场记录中做滑动 8 秒兜底。
  for (let i = next.length - 1; i >= 0; i--) {
    const row = next[i];
    if (row.msgType !== MsgType.Gift || row.isComboUpdate) continue;
    if (row.user?.uid !== ev.user.uid) continue;
    if (row.gift?.id !== gift.id) continue;
    if (row.comboFinalized) return null;
    // 两边都有 ID 却不同，就是两轮独立连送。
    if (row.comboId && ev.comboId && row.comboId !== ev.comboId) return null;
    if (ev.ts - row.ts > COMBO_WINDOW_MS) return null;
    const prev = row.gift!;
    next[i] = {
      ...row,
      ts: ev.ts,
      firstOccurredAt: row.firstOccurredAt ?? row.ts,
      comboId: row.comboId ?? ev.comboId,
      annotationIdentity: annotationIdentity(row),
      comboFinalized: row.comboFinalized || ev.isComboUpdate,
      gift: ev.isComboUpdate
        ? { ...prev, count: gift.count, total: gift.total, totalRmb: gift.totalRmb,
            paymentRmb: mergedPayment(prev, gift, true) }
        : {
            ...prev,
            count: (prev.count ?? 0) + gift.count,
            total: (prev.total ?? 0) + gift.total,
            totalRmb: (prev.totalRmb ?? 0) + (gift.totalRmb ?? 0),
            paymentRmb: mergedPayment(prev, gift, false),
          },
    };
    return { updated: next[i] };
  }
  return null;
}
