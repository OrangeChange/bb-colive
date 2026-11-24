import { useSyncExternalStore } from 'react';
import { getLaplaceProductEventStore } from './productEventSettings';
export function useLaplaceProductEvents() {
  const store = getLaplaceProductEventStore();
  return { store, snapshot: useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot) };
}
