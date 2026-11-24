import { assertLaplaceNativeGuardEntryFilters, allowsLaplaceNativeGuardEntryRecord, admitsLaplaceNativeGuardEntryRecord, type LaplaceNativeGuardEntryFilters, type LaplaceGuardEntryRecord } from './nativeGuardEntry.ts';
import { readLaplaceNativePaidSticky } from './nativePaidStickyFact.ts';
import { admitsLaplacePaidSticky, type LaplaceProductPaidStickySnapshot } from './productPaidStickyLifecycle.ts';
import { assertLaplaceNativeTextFilters, allowsLaplaceNativeTextRecord, nativeLaplaceTextSourceSettings, type LaplaceNativeTextFilters, type LaplaceTextFilterRecord } from './nativeTextFilters.ts';
import { allowsProductEvent, productLaplaceSourceSettings, productLaplaceGiftSourceSettings } from './productAdmission.ts';
import { assertLaplaceProductEventSettings, type LaplaceProductEventInput } from './productEventSettings.ts';
import { selectLaplaceProjection } from './projection.ts';
import type { LaplaceProductScSnapshot } from './productScLifecycle.ts';
import type { LaplaceActivityState, LaplaceAdmissionSettings, LaplaceEvent, LaplaceProjectionMode } from './types.ts';

/** Deliberate product override: main and unsupported non-SC semantics stay source-faithful;
 * unpaced SC clocks are owned by the activated consumer, never the renderer. */
export function selectLaplaceProductProjection(
  delivered: readonly { sequence: number; event: LaplaceEvent; source?: LaplaceTextFilterRecord['source'] & LaplaceGuardEntryRecord['source'] & { scIdentity?: string; activity?: LaplaceActivityState } }[], sc: LaplaceProductScSnapshot,
  settings: LaplaceAdmissionSettings,
  options: { mode?: LaplaceProjectionMode; now?: number; scrollable?: boolean; productEvents?: LaplaceProductEventInput; nativeTextFilters?: LaplaceNativeTextFilters; nativeGuardEntry?: LaplaceNativeGuardEntryFilters; activityTerminals?: ReadonlySet<string>; paid?: LaplaceProductPaidStickySnapshot } = {},
): { events: LaplaceEvent[]; stickyEvents: LaplaceEvent[]; nextExpiryAt: number | null } {
  if (options.productEvents) assertLaplaceProductEventSettings(options.productEvents);
  if (options.nativeTextFilters !== undefined) assertLaplaceNativeTextFilters(options.nativeTextFilters);
  if (options.nativeGuardEntry !== undefined) assertLaplaceNativeGuardEntryFilters(options.nativeGuardEntry);
  const now = options.now ?? Date.now();
  if (options.nativeTextFilters) {
    delivered = delivered.filter(row => allowsLaplaceNativeTextRecord(row, options.nativeTextFilters!));
    settings = nativeLaplaceTextSourceSettings(settings);
  }
  if (options.nativeGuardEntry) delivered = delivered.filter(row => allowsLaplaceNativeGuardEntryRecord(row, options.nativeGuardEntry!));
  if (options.productEvents) {
    delivered = delivered.filter(row => allowsProductEvent(row.event, options.productEvents!));
    settings = (options.productEvents.version === 2 || options.productEvents.version === 3) ? productLaplaceGiftSourceSettings(settings) : productLaplaceSourceSettings(settings);
  }
  // Group only trusted host identities, before the main cap. Pending records
  // are intentionally absent here; updates cannot jump the delivery queue.
  const mainRows: LaplaceEvent[] = [];
  const mainRecords: typeof delivered[number][] = [];
  const positions = new Map<string, number>();
  for (const row of delivered) {
    const identity = row.event.type === 'superchat' ? row.source?.scIdentity : undefined;
    const position = identity ? positions.get(identity) : undefined;
    if (position === undefined) {
      if (identity) positions.set(identity, mainRows.length);
      mainRows.push(row.event);
      mainRecords.push(row);
    } else {
      const deleted = mainRows[position].deleted || row.event.deleted;
      mainRows[position] = deleted ? { ...row.event, deleted: true } : row.event;
      mainRecords[position] = { ...row, event: mainRows[position] };
    }
  }
  const admission = (rows: typeof delivered) => options.nativeGuardEntry
    ? (_event: LaplaceEvent, sourceSettings: LaplaceAdmissionSettings, sourceIndex: number) => admitsLaplaceNativeGuardEntryRecord(rows[sourceIndex], sourceSettings, options.nativeGuardEntry!)
    : undefined;
  const main = selectLaplaceProjection(mainRows, settings, { ...options, now, admit: admission(mainRecords) });
  const paidEnabled = options.paid?.enabled === true;
  const nonSc = delivered.filter(row => row.event.type !== 'superchat'
    && (!paidEnabled || readLaplaceNativePaidSticky(row) === undefined));
  const ended = new Set(nonSc.filter(row => row.source?.activity?.phase === 'start'
    && options.activityTerminals?.has(row.source.activity.identity)).map(row => row.event));
  const legacy = selectLaplaceProjection(nonSc.map(row => row.event),
    { ...settings, limitStickyAmount: nonSc.length || 1 }, { ...options, now, admit: admission(nonSc), stickyPredicate: event => !ended.has(event) });
  const sequence = new Map(nonSc.map(row => [row.event, row.sequence]));
  const merged = [
    ...legacy.stickyEvents.map(event => ({ event, sequence: sequence.get(event)! })),
    ...sc.candidates.filter(candidate => candidate.expiresAt > now),
    ...(paidEnabled ? options.paid!.candidates.filter(candidate => candidate.expiresAt > now
      && admitsLaplacePaidSticky(candidate.event, settings)
      && (!options.productEvents || allowsProductEvent(candidate.event, options.productEvents))) : []),
  ].sort((a, b) => b.sequence - a.sequence);
  const deadlines = [legacy.nextExpiryAt, sc.nextExpiryAt, paidEnabled ? options.paid!.nextExpiryAt : null].filter((value): value is number => value !== null && value > now);
  return {
    events: main.events,
    stickyEvents: settings.showStickyBar === false ? [] : merged.slice(0, settings.limitStickyAmount || 20).map(row => row.event),
    nextExpiryAt: deadlines.length ? Math.min(...deadlines) : null,
  };
}
