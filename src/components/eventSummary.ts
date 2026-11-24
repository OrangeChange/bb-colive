import { uiText } from "../i18n/index.ts";
import { MsgType, type DanmakuEvent, type GiftInfo } from "../protocol/types.ts";

export interface GiftSummary {
  totalRmb: number;
  blindProfitRmb: number;
  blindCount: number;
}

function finite(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 汇总当前礼物投影中的礼物；红包、天选等其他收益区事件不计入。 */
export function summarizeGiftEvents(events: DanmakuEvent[], visibleIndices: number[]): GiftSummary {
  let totalRmb = 0;
  let blindProfitRmb = 0;
  let blindCount = 0;
  for (const index of visibleIndices) {
    const event = events[index];
    if (event?.msgType !== MsgType.Gift || !event.gift) continue;
    const gift: GiftInfo = event.gift;
    const count = gift.count || 1;
    if (gift.blindGiftName) {
      blindCount += 1;
      const hitUnit = gift.blindHitPriceRmb ?? gift.priceRmb;
      const costUnit = gift.blindPriceRmb;
      if (finite(hitUnit)) totalRmb += hitUnit * count;
      if (finite(hitUnit) && finite(costUnit)) blindProfitRmb += (hitUnit - costUnit) * count;
      continue;
    }
    if (finite(gift.totalRmb)) totalRmb += gift.totalRmb;
    else if (finite(gift.priceRmb)) totalRmb += gift.priceRmb * count;
  }
  return { totalRmb: roundMoney(totalRmb), blindProfitRmb: roundMoney(blindProfitRmb), blindCount };
}

function money(value: number): string {
  return `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: value % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

export function formatGiftSummary(summary: GiftSummary): string {
  const blind = summary.blindCount > 0
    ? uiText("liveSummary.blindProfit", { sign: summary.blindProfitRmb > 0 ? "▲+" : summary.blindProfitRmb < 0 ? "▼-" : "", amount: money(Math.abs(summary.blindProfitRmb)).slice(1) })
    : "";
  return uiText("liveSummary.total", { amount: money(summary.totalRmb), blind });
}
