import { stickyGiftDuration } from '../../windows/stickyEventModel.ts';
import { admitsLaplaceEvent } from './admission.ts';
import { laplaceNativePaidStickyIdentity, readLaplaceNativePaidSticky } from './nativePaidStickyFact.ts';
import type { LaplaceAdmissionSettings, LaplaceEvent, LaplaceInputRecord, LaplaceNativePaidStickyFact } from './types.ts';

export interface LaplaceProductPaidStickyCandidate {
  sequence: number; event: LaplaceEvent; admittedAt: number; expiresAt: number;
}
export interface LaplaceProductPaidStickySnapshot {
  readonly enabled: true;
  readonly candidates: readonly LaplaceProductPaidStickyCandidate[];
  readonly nextExpiryAt: number | null;
  /** Current retained invalid markers only; no historical error ledger. */
  readonly invalidFacts: number;
}
/** The existing source admission, before source-timestamp expiry or display cap. */
export const admitsLaplacePaidSticky = (event: LaplaceEvent, settings: LaplaceAdmissionSettings): boolean =>
  settings.showStickyBar !== false && admitsLaplaceEvent(event, settings)
  && (event.type === 'gift' && event.coinType === 'gold' || event.type === 'toast')
  && event.priceNormalized! > settings.showGiftStickyAbove!;

/** Native gift/guard clocks only. Every row, identity and admission is owned by
 * retained input references, including unknown-amount representatives. */
export function createLaplaceProductPaidStickyLifecycle() {
  const rows = new Map<number, { record: LaplaceInputRecord; fact: LaplaceNativePaidStickyFact | null }>();
  const identities = new Map<string, Set<number>>();
  const admissions = new Map<string, number>();
  let settings: LaplaceAdmissionSettings = {};
  const validNow = (now: number) => { if (!Number.isFinite(now)) throw new RangeError('Finite product clock required'); };
  const representative = (sequences: Set<number>) => {
    let newest: NonNullable<ReturnType<typeof rows.get>> | undefined;
    for (const sequence of sequences) {
      const row = rows.get(sequence)!;
      if (!newest || sequence > newest.record.sequence) newest = row;
    }
    return newest!;
  };
  const eligible = (row: NonNullable<ReturnType<typeof rows.get>>) => row.fact !== null
    && stickyGiftDuration(row.fact.amountRmb as number) > 0 && admitsLaplacePaidSticky(row.record.event, settings);
  const admit = (now: number) => {
    for (const [identity, sequences] of identities)
      if (!admissions.has(identity) && eligible(representative(sequences))) admissions.set(identity, now);
  };
  const remove = (sequence: number) => {
    const previous = rows.get(sequence);
    if (!previous) return;
    rows.delete(sequence);
    if (previous.fact) identities.get(laplaceNativePaidStickyIdentity(previous.fact))?.delete(sequence);
  };
  const clear = () => { rows.clear(); identities.clear(); admissions.clear(); };
  return {
    clear, reset: clear, dispose: clear,
    configure(next: LaplaceAdmissionSettings, now: number) {
      validNow(now); settings = { ...next }; admit(now);
    },
    applyDelta(delta: { records: readonly LaplaceInputRecord[]; removedSequences: readonly number[] },
      next: LaplaceAdmissionSettings, now: number, scope: { roomId: number | null; generation: number }) {
      validNow(now); settings = { ...next };
      for (const sequence of delta.removedSequences) remove(sequence);
      for (const record of delta.records) {
        remove(record.sequence);
        const fact = readLaplaceNativePaidSticky(record, scope);
        if (fact === undefined) continue;
        rows.set(record.sequence, { record, fact });
        if (fact === null) continue;
        const identity = laplaceNativePaidStickyIdentity(fact), sequences = identities.get(identity) ?? new Set<number>();
        sequences.add(record.sequence); identities.set(identity, sequences);
      }
      // Atomic last-reference replacement inherits admission. Final eviction
      // ends replay protection; no uncharged ID cache survives the retained row.
      for (const [identity, sequences] of identities) if (!sequences.size) {
        identities.delete(identity); admissions.delete(identity);
      }
      admit(now);
    },
    snapshot(now: number): LaplaceProductPaidStickySnapshot {
      validNow(now);
      const candidates: LaplaceProductPaidStickyCandidate[] = [];
      let nextExpiryAt = Infinity, invalidFacts = 0;
      for (const row of rows.values()) if (row.fact === null) invalidFacts++;
      for (const [identity, sequences] of identities) {
        const admittedAt = admissions.get(identity);
        if (admittedAt === undefined) continue;
        const newest = representative(sequences), seconds = stickyGiftDuration(newest.fact!.amountRmb as number);
        const expiresAt = admittedAt + seconds * 1000;
        if (seconds <= 0 || expiresAt <= now) continue;
        nextExpiryAt = Math.min(nextExpiryAt, expiresAt);
        if (eligible(newest)) candidates.push({ sequence: newest.record.sequence, event: newest.record.event, admittedAt, expiresAt });
      }
      candidates.sort((a, b) => b.sequence - a.sequence);
      return Object.freeze({ enabled: true, candidates: Object.freeze(candidates.map(candidate => Object.freeze(candidate))),
        nextExpiryAt: Number.isFinite(nextExpiryAt) ? nextExpiryAt : null, invalidFacts });
    },
    retainedCounts: () => ({ records: rows.size, identities: identities.size, admissions: admissions.size }),
  };
}
