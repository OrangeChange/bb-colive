/** Product presentation only. Never changes source amounts or admission. */
export function validProductHighlightThreshold(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 99999999;
}
export function productHighlight(amount: unknown, threshold: unknown): boolean {
  return typeof amount === 'number' && Number.isFinite(amount) && validProductHighlightThreshold(threshold) && amount >= threshold;
}
export function productGiftHighlight(event: { blindGift?: unknown; giftAmount?: unknown }, amount: unknown, threshold: unknown): boolean {
  if (event.blindGift) {
    const price = (event.blindGift as { gift_tip_price?: unknown }).gift_tip_price;
    if (typeof price !== 'number' || !Number.isFinite(price)
      || typeof event.giftAmount !== 'number' || !Number.isFinite(event.giftAmount)) return false;
  }
  return productHighlight(amount, threshold);
}
export function productCurrentRankVisible(enabled: unknown, rank: unknown): boolean {
  return enabled === true && typeof rank === 'number' && Number.isFinite(rank) && rank > 0;
}
