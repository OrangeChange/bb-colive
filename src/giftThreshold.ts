import { MsgType, type DanmakuEvent, type GiftInfo } from "./protocol/types.ts";

export type GiftThresholdMode = "unit" | "cumulative";
export type GiftPriceRangeMode = GiftThresholdMode;

/** 礼物单价输入框上下箭头的步进；手动输入和存储仍保留两位小数。 */
export const GIFT_THRESHOLD_INPUT_STEP = 0.5;

/** 礼物单价阈值的归一化精度；允许筛选低于 1 元的礼物。 */
export const GIFT_THRESHOLD_STEP = 0.01;

export function normalizeGiftThreshold(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value / GIFT_THRESHOLD_STEP) * GIFT_THRESHOLD_STEP;
}

export function stepGiftThreshold(value: number, direction: 1 | -1): number {
  const next = normalizeGiftThreshold(value) + direction * GIFT_THRESHOLD_INPUT_STEP;
  return normalizeGiftThreshold(Math.max(0, next));
}

/** 归一化礼物阈值判断方式；未知值回退到当前稳定的单件价格口径。 */
export function normalizeGiftThresholdMode(value: unknown): GiftThresholdMode {
  return value === "cumulative" ? "cumulative" : "unit";
}

function giftPriceAmount(
  gift: Pick<GiftInfo, "priceRmb" | "isFree" | "blindGiftName" | "blindPriceRmb"> & Partial<Pick<GiftInfo, "count">>,
  mode: GiftThresholdMode,
): number | null {
  const unitPrice = gift.blindGiftName ? gift.blindPriceRmb : gift.priceRmb;
  if (unitPrice == null || !Number.isFinite(unitPrice)) return null;
  const count = typeof gift.count === "number" && Number.isFinite(gift.count) && gift.count > 0 ? gift.count : 1;
  return mode === "cumulative" ? unitPrice * count : unitPrice;
}

function finiteNonNegative(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/** 返回付费事件参与显示门槛的金额；非付费事件和金额未知事件返回 null。 */
export function paidEventAmount(event: DanmakuEvent, mode: GiftThresholdMode = "unit"): number | null {
  if (event.msgType === MsgType.Gift) return giftPriceAmount(event.gift ?? {}, mode);
  if (event.msgType === MsgType.SuperChat) return finiteNonNegative(event.sc?.price);
  if (event.msgType !== MsgType.GuardBuy) return null;
  const unit = finiteNonNegative(event.guard?.priceRmb)
    ?? (finiteNonNegative(event.guard?.price) == null ? null : finiteNonNegative(event.guard?.price)! / 1000);
  if (unit === null) return null;
  const count = finiteNonNegative(event.guard?.count);
  return mode === "cumulative" ? unit * (count && count > 0 ? count : 1) : unit;
}

function amountsEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= Number.EPSILON * Math.max(1, Math.abs(left), Math.abs(right)) * 8;
}

/** 礼物、醒目留言和大航海购买共用最低显示金额；金额未知时保留事件。 */
export function isPaidEventVisibleAtThreshold(
  event: DanmakuEvent,
  threshold: number,
  mode: GiftThresholdMode = "unit",
): boolean {
  const normalized = normalizeGiftThreshold(threshold);
  if (normalized <= 0) return true;
  const amount = paidEventAmount(event, mode);
  return amount === null || amount > normalized || amountsEqual(amount, normalized);
}

/** 回看价格范围沿用现场价格口径，但范围条件独立于现场设置。未知价格保留。 */
export function isGiftWithinPriceRange(
  gift: Pick<GiftInfo, "priceRmb" | "isFree" | "blindGiftName" | "blindPriceRmb"> & Partial<Pick<GiftInfo, "count">>,
  min: number | undefined,
  max: number | undefined,
  mode: GiftThresholdMode = "unit",
): boolean {
  const normalizedMin = min === undefined ? undefined : normalizeGiftThreshold(min);
  const normalizedMax = max === undefined ? undefined : normalizeGiftThreshold(max);
  if (normalizedMin === undefined && normalizedMax === undefined) return true;
  const amount = giftPriceAmount(gift, mode);
  if (amount === null) return true;
  if (normalizedMin !== undefined && amount < normalizedMin) return false;
  if (normalizedMax !== undefined && amount > normalizedMax) return false;
  return true;
}

/** 按礼物实付单件或事件累计人民币价格筛选；未知价格暂时保留。 */
export function isGiftVisibleAtThreshold(
  gift: Pick<GiftInfo, "priceRmb" | "isFree" | "blindGiftName" | "blindPriceRmb"> & Partial<Pick<GiftInfo, "count">>,
  threshold: number,
  mode: GiftThresholdMode = "unit",
): boolean {
  const normalized = normalizeGiftThreshold(threshold);
  if (normalized <= 0) return true;
  return isGiftWithinPriceRange(gift, normalized, undefined, mode);
}
