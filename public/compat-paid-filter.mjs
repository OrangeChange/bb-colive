/** Canonical RMB facts only. Display price/coin fields are never a fallback. */
const known = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
export function paidAmountVisible(facts, threshold, mode = 'unit') {
  const amount = facts?.[mode === 'cumulative' ? 'cumulative' : 'unit'];
  if (!known(threshold) || threshold <= 0 || !known(amount)) return true;
  return amount >= threshold || Math.abs(amount - threshold) <= Number.EPSILON * Math.max(1, Math.abs(threshold));
}
/** A merged row retains its original unit fact; cumulative unknown stays unknown. */
export function mergePaidAmounts(first, next) {
  return { unit: known(first?.unit) ? first.unit : null,
    cumulative: known(first?.cumulative) && known(next?.cumulative) ? first.cumulative + next.cumulative : null };
}
