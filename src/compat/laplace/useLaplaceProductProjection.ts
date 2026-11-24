import type { LaplaceNativeGuardEntryFilters, LaplaceGuardEntryRecord } from './nativeGuardEntry';
import type { LaplaceNativeTextFilters, LaplaceTextFilterRecord } from './nativeTextFilters';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { LaplaceProductEventSettings } from './productEventSettings';
import { selectLaplaceProductProjection } from './productProjection';
import type { LaplaceProductSessionReader, LaplaceProductSnapshot } from './productSession';
import type { LaplaceActivityState, LaplaceAdmissionSettings, LaplaceEvent } from './types';

const empty: LaplaceProductSnapshot = Object.freeze({ roomId: null, generation: 0, resetEpoch: 0,
  records: Object.freeze([]), sc: Object.freeze({ candidates: Object.freeze([]), nextExpiryAt: null }) });
const emptyReader: LaplaceProductSessionReader = { getSnapshot: () => empty, subscribe: () => () => {} };
export function useLaplaceProductSnapshot(session: LaplaceProductSessionReader | null) {
  const reader = session ?? emptyReader;
  return useSyncExternalStore(reader.subscribe, reader.getSnapshot, reader.getSnapshot);
}
/** A read-only view. The owner schedules SC/native paid expiry; this hook schedules only an
 * earlier legacy non-SC deadline, without changing oracle/static/design hooks. */
export function useLaplaceProductProjection(records: readonly { sequence: number; event: LaplaceEvent; source?: LaplaceTextFilterRecord['source'] & LaplaceGuardEntryRecord['source'] & { scIdentity?: string; activity?: LaplaceActivityState } }[],
  snapshot: LaplaceProductSnapshot, settings: LaplaceAdmissionSettings, mode: 'live' | 'simulation', scrollable: boolean, productEvents?: LaplaceProductEventSettings, nativeTextFilters?: LaplaceNativeTextFilters, nativeGuardEntry?: LaplaceNativeGuardEntryFilters) {
  const [clock, setClock] = useState(Date.now);
  // Read the unfiltered owner snapshot, never the paced main-list subset.
  // The set is derived anew and cannot outlive retained terminal evidence.
  const activityTerminals = useMemo(() => mode === 'live' ? new Set(snapshot.records
    .filter(record => record.source.activity?.terminal === true).map(record => record.source.activity!.identity)) : undefined,
  [snapshot.records, mode]);
  const projection = useMemo(() => selectLaplaceProductProjection(records, snapshot.sc, settings,
    { mode, scrollable, now: Date.now(), productEvents, nativeTextFilters, nativeGuardEntry, activityTerminals, paid: snapshot.paid }), [activityTerminals, records, snapshot.sc, snapshot.paid, settings, mode, scrollable, clock, productEvents, nativeTextFilters, nativeGuardEntry]);
  const ownerDeadlines = [snapshot.sc.nextExpiryAt, snapshot.paid?.nextExpiryAt].filter((value): value is number => typeof value === 'number');
  const ownerExpiryAt = ownerDeadlines.length ? Math.min(...ownerDeadlines) : null;
  useEffect(() => {
    if (projection.nextExpiryAt === null || ownerExpiryAt !== null && projection.nextExpiryAt >= ownerExpiryAt) return;
    const timer = setTimeout(() => setClock(Date.now()), Math.max(1, Math.min(2_147_483_647, projection.nextExpiryAt - Date.now())));
    return () => clearTimeout(timer);
  }, [projection.nextExpiryAt, ownerExpiryAt, clock]);
  return projection;
}
