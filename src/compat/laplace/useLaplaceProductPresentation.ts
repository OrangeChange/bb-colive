import { useSyncExternalStore } from 'react';
import { getLaplaceProductPresentationStore } from './productPresentationSettings';
export function useLaplaceProductPresentation() {
  const store = getLaplaceProductPresentationStore();
  return { store, snapshot: useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot) };
}
