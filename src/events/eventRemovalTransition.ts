export interface EventRemovalRow<T> { event: T; removeAt?: number }

/** 保留退出中的行，后续快照不延长退出时间。 */
export function reconcileEventRemovalTransitions<T extends { id: string; reactKey?: string }>(
  previous: readonly EventRemovalRow<T>[], incoming: readonly T[], now: number,
  duration: number, shouldAnimate: (event: T) => boolean,
): EventRemovalRow<T>[] {
  const keys = new Set(incoming.map(event => event.reactKey ?? event.id));
  const retained = previous.flatMap(row => {
    if (keys.has(row.event.reactKey ?? row.event.id)) return [];
    if (!shouldAnimate(row.event) || duration <= 0) return [];
    const removeAt = row.removeAt ?? now + duration;
    return removeAt > now ? [{ event: row.event, removeAt }] : [];
  });
  return [...retained, ...incoming.map(event => ({ event }))];
}
