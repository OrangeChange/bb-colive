import { DEFAULT_LAPLACE_RETENTION, laplaceRecordBytes, retainLaplaceRecords, validateLaplaceRetention } from './retention.ts';
import { laplaceProductClock, type LaplaceProductClock } from './productSession.ts';
import type { LaplaceProductScFact } from './productScLifecycle.ts';
import type { LaplaceEvent, LaplaceInputNotification, LaplaceInputRecord, LaplaceInputSnapshot, LaplaceRetentionPolicy } from './types.ts';

/** Synthetic facts have explicit provenance, independent of canonical live paid
 * amounts. Reused fixture scId is never a generated-occurrence identity. */
export function createLaplaceProductSimulationSource(identity: string, clock: LaplaceProductClock = laplaceProductClock,
  policyInput: LaplaceRetentionPolicy = DEFAULT_LAPLACE_RETENTION) {
  const policy = validateLaplaceRetention(policyInput);
  let records: LaplaceInputRecord[] = [], sequence = 0, generation = 1, revision = 0;
  let evictedRecords = 0, rejectedOversizeRecords = 0, retainedBytes = 0, disposed = false;
  const facts = new Map<number, LaplaceProductScFact & { provenance: 'simulation' }>();
  const sizes = new Map<number, number>();
  const listeners = new Set<(notice: LaplaceInputNotification) => void>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const getSnapshot = (): LaplaceInputSnapshot => ({ roomId: null, generation, revision, records,
    retention: { configured: true, policy, retainedBytes, evictedRecords, rejectedOversizeRecords } });
  const notify = (type: 'batch' | 'retention', changed: LaplaceInputRecord[], removedSequences: number[]) => {
    revision++;
    const notice = { ...getSnapshot(), type, records: changed, removedSequences };
    for (const listener of listeners) listener(notice);
  };
  const schedule = () => {
    if (timer !== undefined) clock.clearTimeout(timer); timer = undefined;
    if (disposed || !records.length) return;
    const next = Math.min(...records.map(record => record.receivedAt)) + policy.maxAgeMs + 1;
    timer = clock.setTimeout(() => { timer = undefined; prune(); }, Math.max(1, Math.min(2_147_483_647, next - clock.now())));
    (timer as unknown as { unref?: () => void }).unref?.();
  };
  const retain = (input: LaplaceInputRecord[]) => {
    const result = retainLaplaceRecords(input, policy, clock.now(), record => sizes.get(record.sequence)!);
    const kept = new Set(result.records.map(record => record.sequence));
    const removed = input.filter(record => !kept.has(record.sequence)).map(record => record.sequence);
    for (const key of removed) { facts.delete(key); sizes.delete(key); }
    records = result.records; retainedBytes = result.bytes; evictedRecords += result.evicted; rejectedOversizeRecords += result.oversize;
    return removed;
  };
  const prune = () => {
    if (disposed) return;
    const removed = retain(records);
    if (removed.length) notify('retention', [], removed);
    schedule();
  };
  const makeRecord = (event: LaplaceEvent, inheritedIdentity?: string): LaplaceInputRecord => {
    const record: LaplaceInputRecord = { event: structuredClone(event), sequence: ++sequence, receivedAt: clock.now(),
      source: { platform: 'bilibili', sourceMode: 'canonical', sourceCommand: 'original-preview', sourceEventId: event.id,
        userIdentity: String(event.uid ?? ''), timestampUnit: 'milliseconds', timestampFallback: false } };
    if (event.type === 'superchat') facts.set(record.sequence, {
      provenance: 'simulation', identity: inheritedIdentity ?? `simulation:${identity}:${generation}:${sequence}`,
      amountRmb: typeof event.priceNormalized === 'number' && Number.isFinite(event.priceNormalized) && event.priceNormalized > 0 ? event.priceNormalized : null,
    });
    sizes.set(record.sequence, laplaceRecordBytes(record));
    return record;
  };
  const checkEvents = (events: readonly LaplaceEvent[]) => {
    if (disposed) throw new Error('Simulation source disposed');
    if (events.some(event => event.type === 'superchat-delete')) throw new Error('Simulation deletion requires an explicit retained synthetic identity');
  };
  return {
    getSnapshot,
    subscribe(listener: (notice: LaplaceInputNotification) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    resolveScFact: (record: LaplaceInputRecord) => facts.get(record.sequence) ?? null,
    ingest(events: readonly LaplaceEvent[]) {
      checkEvents(events);
      const incoming = events.slice(-policy.maxRecords).map(event => makeRecord(event));
      const identities = incoming.map(record => facts.get(record.sequence)?.identity ?? null);
      const removed = retain([...records, ...incoming]);
      const kept = new Set(records.map(record => record.sequence));
      notify('batch', incoming.filter(record => kept.has(record.sequence)), removed); schedule(); return identities;
    },
    replace(syntheticIdentity: string, event: LaplaceEvent) {
      checkEvents([event]);
      const old = records.find(record => facts.get(record.sequence)?.identity === syntheticIdentity);
      if (!old) throw new Error('Synthetic identity is no longer retained');
      const next = makeRecord(old.event.deleted && event.type === 'superchat' ? { ...event, deleted: true } : event, syntheticIdentity);
      const removed = retain([...records.filter(record => record !== old), next]);
      facts.delete(old.sequence); sizes.delete(old.sequence);
      notify('batch', records.includes(next) ? [next] : [], [old.sequence, ...removed]); schedule();
    },
    clear() {
      if (disposed) return;
      records = []; facts.clear(); sizes.clear(); retainedBytes = 0; evictedRecords = 0; rejectedOversizeRecords = 0;
      generation++; revision++; sequence = 0; schedule();
      for (const listener of listeners) listener({ type: 'reset', snapshot: getSnapshot() });
    },
    prune,
    retainedCounts: () => ({ records: records.length, facts: facts.size, sizes: sizes.size }),
    dispose() {
      disposed = true; if (timer !== undefined) clock.clearTimeout(timer); timer = undefined;
      records = []; facts.clear(); sizes.clear(); listeners.clear(); retainedBytes = 0;
    },
  };
}
