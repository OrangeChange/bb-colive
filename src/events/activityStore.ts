import { activityEventKey, activityKey, createActivityLifecycle, type ActivityFacts } from './activityLifecycle.ts';
import type { DanmakuEvent } from '../protocol/types.ts';

const model = createActivityLifecycle();
const listeners = new Map<string, Set<() => void>>();
export const ACTIVITY_UPDATE_EVENT = 'native-activity:update';
export const activityStore = {
  get: (event: DanmakuEvent) => {
    const key = activityEventKey(event);
    return key ? model.get(key) ?? event.activity : undefined;
  },
  accept(fact: ActivityFacts) {
    const key = activityKey(fact), previous = model.get(key);
    const next = model.acceptFact(fact);
    if (next !== previous) listeners.get(key)?.forEach(listener => listener());
  },
  clear() {
    model.clear();
    listeners.forEach(group => group.forEach(listener => listener()));
  },
  subscribe(event: DanmakuEvent, listener: () => void) {
    const key = activityEventKey(event);
    if (!key) return () => {};
    let group = listeners.get(key);
    if (!group) listeners.set(key, group = new Set());
    group.add(listener);
    return () => { group.delete(listener); if (!group.size) listeners.delete(key); };
  },
};
