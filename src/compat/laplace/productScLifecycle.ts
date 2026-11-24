import { stickyGiftDuration } from '../../windows/stickyEventModel.ts';
import { admitsLaplaceEvent } from './admission.ts';
import type { LaplaceAdmissionSettings, LaplaceEvent, LaplaceInputRecord } from './types.ts';

export interface LaplaceProductScFact { identity: string; amountRmb: number | null | undefined }
export interface LaplaceProductScCandidate {
  sequence: number; event: LaplaceEvent; admittedAt: number; expiresAt: number;
}
export interface LaplaceProductScSnapshot {
  candidates: readonly LaplaceProductScCandidate[]; nextExpiryAt: number | null;
}
export const resolveLiveScFact = (record: LaplaceInputRecord): LaplaceProductScFact | null =>
  record.event.type === 'superchat' && record.source.scIdentity
    ? { identity: record.source.scIdentity, amountRmb: record.event.bbPaidAmount?.unit } : null;

/** Product-only clocks. Original renderer timestamps/durations and source oracle
 * remain untouched. Identity/admission state is bounded by retained SC rows. */
export function createLaplaceProductScLifecycle({ resolveScFact = resolveLiveScFact }: {
  resolveScFact?: (record: LaplaceInputRecord) => LaplaceProductScFact | null;
} = {}) {
  const rows = new Map<number, { record: LaplaceInputRecord; fact: LaplaceProductScFact }>();
  const identities = new Map<string, Set<number>>();
  const admissions = new Map<string, number>();
  let settings: LaplaceAdmissionSettings = {};
  const validNow = (now: number) => { if (!Number.isFinite(now)) throw new RangeError('Finite product clock required'); };
  const representative = (sequences: Set<number>) => {
    let newest: ReturnType<typeof rows.get>;
    let deleted = false;
    for (const sequence of sequences) {
      const row = rows.get(sequence)!;
      deleted ||= row.record.event.deleted === true;
      if (!newest || sequence > newest.record.sequence) newest = row;
    }
    return { newest: newest!, deleted };
  };
  const eligible = (row: NonNullable<ReturnType<typeof rows.get>>, deleted: boolean) =>
    !deleted && settings.showStickyBar !== false && stickyGiftDuration(row.fact.amountRmb as number) > 0
    && admitsLaplaceEvent(row.record.event, { ...settings, hostPaidFilter: true })
    && row.record.event.priceNormalized! > settings.showGiftStickyAbove!;
  const admit = (now: number) => {
    for (const [identity, sequences] of identities) {
      const { newest, deleted } = representative(sequences);
      if (!admissions.has(identity) && eligible(newest, deleted)) admissions.set(identity, now);
    }
  };
  const remove = (sequence: number) => {
    const previous = rows.get(sequence);
    if (!previous) return;
    rows.delete(sequence);
    identities.get(previous.fact.identity)?.delete(sequence);
  };
  const clear = () => { rows.clear(); identities.clear(); admissions.clear(); };
  return {
    clear, reset: clear, dispose: clear,
    configure(next: LaplaceAdmissionSettings, now: number) {
      validNow(now); settings = { ...next }; admit(now);
    },
    applyDelta(delta: { records: readonly LaplaceInputRecord[]; removedSequences: readonly number[] }, next: LaplaceAdmissionSettings, now: number) {
      validNow(now); settings = { ...next };
      for (const sequence of delta.removedSequences) remove(sequence);
      for (const record of delta.records) {
        remove(record.sequence);
        const fact = resolveScFact(record);
        if (!fact || record.event.type !== 'superchat') continue;
        rows.set(record.sequence, { record, fact });
        const sequences = identities.get(fact.identity) ?? new Set<number>();
        sequences.add(record.sequence); identities.set(fact.identity, sequences);
      }
      // Collect only after the whole delta: last-reference replacement inherits.
      for (const [identity, sequences] of identities) if (!sequences.size) {
        identities.delete(identity); admissions.delete(identity);
      }
      admit(now);
    },
    snapshot(now: number): LaplaceProductScSnapshot {
      validNow(now);
      const candidates: LaplaceProductScCandidate[] = [];
      let nextExpiryAt = Infinity;
      for (const [identity, sequences] of identities) {
        const admittedAt = admissions.get(identity);
        if (admittedAt === undefined) continue;
        const { newest, deleted } = representative(sequences);
        const seconds = stickyGiftDuration(newest.fact.amountRmb as number);
        const expiresAt = admittedAt + seconds * 1000;
        if (deleted || seconds <= 0 || expiresAt <= now) continue;
        nextExpiryAt = Math.min(nextExpiryAt, expiresAt);
        if (eligible(newest, false)) candidates.push({ sequence: newest.record.sequence, event: newest.record.event, admittedAt, expiresAt });
      }
      candidates.sort((a, b) => b.sequence - a.sequence);
      return Object.freeze({ candidates: Object.freeze(candidates.map(candidate => Object.freeze(candidate))), nextExpiryAt: Number.isFinite(nextExpiryAt) ? nextExpiryAt : null });
    },
    retainedCounts: () => ({ records: rows.size, identities: identities.size, admissions: admissions.size }),
  };
}
