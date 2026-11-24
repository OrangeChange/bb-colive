import type { LaplaceInputRecord, LaplaceRetentionPolicy } from './types.ts';

/** BB-only budget explicitly approved 2026-10-04: 20,000 records, 64 MB
 * (64,000,000 serialized UTF-8 bytes), six hours, whichever is reached first.
 * This is neither Laplace's 50/10 display limit nor an actual JS heap estimate. */
export const DEFAULT_LAPLACE_RETENTION: Readonly<LaplaceRetentionPolicy> = Object.freeze({
  maxRecords: 20_000, maxBytes: 64_000_000, maxAgeMs: 6 * 60 * 60_000,
});
export function validateLaplaceRetention(policy: LaplaceRetentionPolicy): LaplaceRetentionPolicy {
  if (!Number.isSafeInteger(policy.maxRecords) || policy.maxRecords < 1
    || !Number.isSafeInteger(policy.maxBytes) || policy.maxBytes < 1
    || !Number.isFinite(policy.maxAgeMs) || policy.maxAgeMs <= 0) throw new RangeError('Invalid LAPLACE retention budget');
  return { ...policy };
}
const utf8 = new TextEncoder();
export function laplaceRecordBytes(record: LaplaceInputRecord): number {
  return utf8.encode(JSON.stringify(record)).byteLength;
}
/** Whole records only. Complete result walls are never silently truncated to
 * satisfy a byte budget. Oversize records are reported and not retained. */
export function retainLaplaceRecords(records: readonly LaplaceInputRecord[], policy: LaplaceRetentionPolicy, now: number,
  sizeOf: (record: LaplaceInputRecord) => number = laplaceRecordBytes) {
  validateLaplaceRetention(policy);
  let bytes = 0, oversize = 0;
  const sized: Array<{ record: LaplaceInputRecord; bytes: number }> = [];
  for (const record of records) {
    if (record.receivedAt < now - policy.maxAgeMs) continue;
    const size = sizeOf(record);
    if (!Number.isSafeInteger(size) || size < 0) throw new RangeError('Invalid serialized record byte size');
    if (size > policy.maxBytes) { oversize++; continue; }
    sized.push({ record, bytes: size }); bytes += size;
  }
  let start = 0;
  while (sized.length - start > policy.maxRecords || bytes > policy.maxBytes) bytes -= sized[start++].bytes;
  const retained = sized.slice(start).map(item => item.record);
  return { records: retained, bytes, evicted: records.length - retained.length - oversize, oversize };
}
