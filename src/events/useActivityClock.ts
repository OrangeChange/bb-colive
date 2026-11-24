import { useCallback, useSyncExternalStore } from 'react';
import { activityStore } from './activityStore.ts';
import { activityPresentation } from './activityLifecycle.ts';
import type { DanmakuEvent } from '../protocol/types.ts';

let now = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();
function subscribeClock(listener: () => void) {
  listeners.add(listener);
  if (!timer) { now = Date.now(); timer = setInterval(() => { now = Date.now(); listeners.forEach(notify => notify()); }, 1000); }
  return () => { listeners.delete(listener); if (!listeners.size && timer) { clearInterval(timer); timer = undefined; } };
}
const inactive = () => () => {};
export function useActivityPresentation(event: DanmakuEvent, fixedNow?: number, visible = true) {
  const subscribe = useCallback((notify: () => void) => activityStore.subscribe(event, notify), [event]);
  const get = useCallback(() => fixedNow === undefined ? activityStore.get(event) : event.activity, [event, fixedNow]);
  const fact = useSyncExternalStore(subscribe, get, get);
  const current = fact ?? event.activity ?? (event.lottery?.timing ? {
    roomId:event.roomId, kind:event.msgType === 4 ? 'anchor' as const : 'red-pocket' as const,
    activityId:event.lottery.id ?? 0, observedAt:event.lottery.timing.observedAt, timing:event.lottery.timing,
  } : undefined);
  const state = activityPresentation(current, fixedNow ?? Date.now()).state;
  const ticking = visible && fixedNow === undefined && (state === 'scheduled' || state === 'running');
  const clock = useSyncExternalStore(ticking ? subscribeClock : inactive, () => now, () => now);
  return activityPresentation(current, fixedNow ?? (ticking ? clock : Date.now()));
}
