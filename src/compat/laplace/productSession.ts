import { readLaplaceNativePaidSticky } from './nativePaidStickyFact.ts';
import { createLaplaceProductPaidStickyLifecycle, type LaplaceProductPaidStickySnapshot } from './productPaidStickyLifecycle.ts';
import { createLaplaceProductScLifecycle, resolveLiveScFact, type LaplaceProductScFact, type LaplaceProductScSnapshot } from './productScLifecycle.ts';
import type { LaplaceAdmissionSettings, LaplaceInputNotification, LaplaceInputRecord, LaplaceInputSnapshot } from './types.ts';

export interface LaplaceProductClock {
  now(): number;
  setTimeout(callback: () => void, delay: number): ReturnType<typeof setTimeout>;
  clearTimeout(timer: ReturnType<typeof setTimeout>): void;
}
export const laplaceProductClock: LaplaceProductClock = {
  now: () => Date.now(), setTimeout: (callback, delay) => setTimeout(callback, delay), clearTimeout: timer => clearTimeout(timer),
};
export interface LaplaceProductSource {
  getSnapshot(): LaplaceInputSnapshot;
  subscribe(listener: (notice: LaplaceInputNotification) => void): () => void;
}
export interface LaplaceProductSnapshot {
  readonly roomId: number | null; readonly generation: number; readonly resetEpoch: number;
  readonly records: readonly LaplaceInputRecord[]; readonly sc: LaplaceProductScSnapshot;
  /** Explicit live capability; omitted for all legacy/direct and simulation owners. */
  readonly paid?: LaplaceProductPaidStickySnapshot;
}
/** One explicitly activated consumer owns input and expiry independently of
 * renderer/editor subscriptions. Configure is an authority API, not a reader API. */
export function createLaplaceProductSession({ source, settings: initialSettings, clock = laplaceProductClock, resolveScFact, nativePaidSticky = false }: {
  source: LaplaceProductSource; settings: LaplaceAdmissionSettings; clock?: LaplaceProductClock;
  nativePaidSticky?: boolean;
  resolveScFact?: (record: LaplaceInputRecord) => LaplaceProductScFact | null;
}) {
  // A rejected canonical gift/guard projected as SC must not gain authority
  // through the older SC resolver. Genuine SC and default-off owners are unchanged.
  const model = createLaplaceProductScLifecycle({ resolveScFact: nativePaidSticky
    ? record => readLaplaceNativePaidSticky(record) === undefined ? (resolveScFact ?? resolveLiveScFact)(record) : null
    : resolveScFact });
  const paid = nativePaidSticky ? createLaplaceProductPaidStickyLifecycle() : undefined;
  let settings = { ...initialSettings };
  let input = source.getSnapshot();
  const records = new Map(input.records.map(record => [record.sequence, record]));
  let resetEpoch = 0, disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  model.applyDelta({ records: input.records, removedSequences: [] }, settings, clock.now());
  paid?.applyDelta({ records: input.records, removedSequences: [] }, settings, clock.now(), input);
  let cached: LaplaceProductSnapshot = Object.freeze({ roomId: input.roomId, generation: input.generation, resetEpoch,
    records: Object.freeze([...records.values()]), sc: model.snapshot(clock.now()), ...(paid ? { paid: paid.snapshot(clock.now()) } : {}) });
  const refresh = (recordsChanged = false) => {
    cached = Object.freeze({ roomId: input.roomId, generation: input.generation, resetEpoch,
      records: recordsChanged ? Object.freeze([...records.values()].sort((a, b) => a.sequence - b.sequence)) : cached.records,
      sc: model.snapshot(clock.now()), ...(paid ? { paid: paid.snapshot(clock.now()) } : {}) });
  };
  const nextExpiry = () => {
    const deadlines = [cached.sc.nextExpiryAt, cached.paid?.nextExpiryAt].filter((value): value is number => typeof value === 'number');
    return deadlines.length ? Math.min(...deadlines) : null;
  };
  const schedule = () => {
    if (timer !== undefined) clock.clearTimeout(timer);
    timer = undefined;
    const deadline = nextExpiry();
    if (disposed || deadline === null) return;
    timer = clock.setTimeout(() => { timer = undefined; refresh(); schedule(); for (const listener of listeners) listener(); },
      Math.max(1, Math.min(2_147_483_647, deadline - clock.now())));
    (timer as unknown as { unref?: () => void }).unref?.();
  };
  const publish = (recordsChanged = false) => { refresh(recordsChanged); schedule(); for (const listener of listeners) listener(); };
  const applyInputNotification = (notice: LaplaceInputNotification) => {
    if (disposed) return;
    const next = notice.type === 'reset' ? notice.snapshot : notice;
    if (next.generation < input.generation || next.revision <= input.revision
      || next.generation === input.generation && next.roomId !== input.roomId && notice.type !== 'reset') return;
    if (notice.type === 'reset' || next.generation !== input.generation) {
      records.clear(); model.clear(); paid?.clear(); resetEpoch++;
    } else for (const sequence of notice.removedSequences) records.delete(sequence);
    for (const record of next.records) records.set(record.sequence, record);
    model.applyDelta({ records: next.records, removedSequences: notice.type === 'reset' ? [] : notice.removedSequences }, settings, clock.now());
    paid?.applyDelta({ records: next.records, removedSequences: notice.type === 'reset' ? [] : notice.removedSequences }, settings, clock.now(), next);
    input = { ...next, records: [] }; // No duplicate historical log in session metadata.
    publish(true);
  };
  const unsubscribe = source.subscribe(applyInputNotification);
  schedule();
  return {
    applyInputNotification,
    configure(next: LaplaceAdmissionSettings) {
      if (disposed) throw new Error('LAPLACE product session disposed');
      if (Object.keys({ ...settings, ...next }).every(key => settings[key as keyof LaplaceAdmissionSettings] === next[key as keyof LaplaceAdmissionSettings])) return;
      settings = { ...next }; model.configure(settings, clock.now()); paid?.configure(settings, clock.now()); publish();
    },
    getSnapshot(): LaplaceProductSnapshot {
      // A late browser timer must not make synchronous readers show expired paid cards.
      // This never admits, subscribes, notifies, or creates/reschedules a timer.
      const deadline = nextExpiry();
      if (!disposed && deadline !== null && deadline <= clock.now()) refresh();
      return cached;
    },
    subscribe(listener: () => void) { if (disposed) return () => {}; listeners.add(listener); return () => { listeners.delete(listener); }; },
    reset() { if (disposed) return; records.clear(); model.clear(); paid?.clear(); resetEpoch++; publish(true); },
    dispose() {
      if (disposed) return; disposed = true; unsubscribe();
      if (timer !== undefined) clock.clearTimeout(timer); timer = undefined;
      records.clear(); model.dispose(); paid?.dispose(); resetEpoch++; refresh(true); listeners.clear();
    },
  };
}
export type LaplaceProductSession = ReturnType<typeof createLaplaceProductSession>;
export type LaplaceProductSessionReader = Pick<LaplaceProductSession, 'getSnapshot' | 'subscribe'>;
