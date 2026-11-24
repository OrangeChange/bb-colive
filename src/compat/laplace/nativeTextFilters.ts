import { assertNativeTextFilters as assertLaplaceNativeTextFilters, evaluateNativeTextFilters as evaluateLaplaceNativeTextFilters } from '../../nativeTextFilterFacts.mjs';
import type { LaplaceAdmissionSettings } from './types.ts';

export interface LaplaceNativeTextFilters { showAutoDanmaku: boolean; showPhoneNotVerified: boolean }
export interface LaplaceTextFilterRecord { source?: { nativeTextFilterFacts?: unknown } }
export { assertNativeTextFilters as assertLaplaceNativeTextFilters, evaluateNativeTextFilters as evaluateLaplaceNativeTextFilters } from '../../nativeTextFilterFacts.mjs';
export function allowsLaplaceNativeTextRecord(record: LaplaceTextFilterRecord | undefined, filters: LaplaceNativeTextFilters): boolean {
  return evaluateLaplaceNativeTextFilters(record, filters).allowed;
}
/** Fixed neutralization; global values never become source settings or SC-owner dependencies. */
export function nativeLaplaceTextSourceSettings<T extends LaplaceAdmissionSettings>(settings: T): T {
  return { ...settings, showAutoDanmaku: true, showPhoneNotVerified: true };
}
/** A bounded current-snapshot summary, not a history or render/timer side effect. */
export function laplaceNativeTextDiagnostics(records: readonly LaplaceTextFilterRecord[], filters: LaplaceNativeTextFilters) {
  assertLaplaceNativeTextFilters(filters);
  const result = { invalid: 0, auto: 0, phone: 0 };
  for (const row of records) {
    const decision = evaluateLaplaceNativeTextFilters(row, filters);
    if (decision.invalid) result.invalid++;
    if (decision.auto) result.auto++;
    if (decision.phone) result.phone++;
  }
  return result;
}
