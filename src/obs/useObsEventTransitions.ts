import { useEffect, useRef, useState } from "react";
import type { DanmakuEvent } from "../protocol/types.ts";
import { getEventAnimationExitDuration } from "../eventDisplaySettings.ts";
import { reconcileEventRemovalTransitions, type EventRemovalRow } from "../events/eventRemovalTransition.ts";
import type { EventWindowPreferences } from "../windows/eventWindowPreferences.ts";

const EMPTY_REMOVALS: readonly string[] = [];

export function sameObsValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length &&
    keys.every(key => Object.prototype.hasOwnProperty.call(right, key) && sameObsValue(left[key], right[key]));
}

export function reuseObsEvents<T extends { id: string; reactKey?: string }>(previous: T[], incoming: readonly T[]): T[] {
  const previousByKey = new Map(previous.map(event => [event.reactKey ?? event.id, event]));
  const result = incoming.map(event => {
    const old = previousByKey.get(event.reactKey ?? event.id);
    return old && sameObsValue(old, event) ? old : event;
  });
  return result.length === previous.length && result.every((event, index) => event === previous[index]) ? previous : result;
}

export function useObsEventTransitions(events: DanmakuEvent[], preferences: EventWindowPreferences, immediateRemovalKeys: readonly string[] = EMPTY_REMOVALS, animatedRemovalKeys: readonly string[] = EMPTY_REMOVALS) {
  const previousEvents = useRef<DanmakuEvent[]>([]);
  events = reuseObsEvents(previousEvents.current, events);
  previousEvents.current = events;
  const duration = getEventAnimationExitDuration(preferences.display.eventAnimationPreset, preferences.display.eventAnimationDurationMs);
  const expiry = preferences.eventExpiry;
  const [stored, setStored] = useState(() => ({
    events, duration, capacity: preferences.capacity, expiryEnabled: expiry.enabled,
    expirySeconds: expiry.seconds, immediateRemovalKeys, animatedRemovalKeys,
    rows: events.map(event => ({ event })) as EventRemovalRow<DanmakuEvent>[],
  }));
  let current = stored;
  if (stored.events !== events || stored.duration !== duration || stored.capacity !== preferences.capacity ||
      stored.expiryEnabled !== expiry.enabled || stored.expirySeconds !== expiry.seconds ||
      !sameObsValue(stored.immediateRemovalKeys, immediateRemovalKeys) || !sameObsValue(stored.animatedRemovalKeys, animatedRemovalKeys)) {
    const immediate = new Set(immediateRemovalKeys);
    const currentTime = Date.now();
    current = {
      events, duration, capacity: preferences.capacity, expiryEnabled: expiry.enabled,
      expirySeconds: expiry.seconds, immediateRemovalKeys, animatedRemovalKeys,
      rows: reconcileEventRemovalTransitions(stored.rows, events, currentTime, duration, event => {
        if (immediate.has(event.reactKey ?? event.id)) return false;
        const key = event.reactKey ?? event.id;
        return animatedRemovalKeys.includes(key) || stored.rows.some(row => (row.event.reactKey ?? row.event.id) === key && row.removeAt !== undefined);
      }),
    };
    setStored(current);
  }
  useEffect(() => {
    const deadlines = current.rows.flatMap(row => row.removeAt === undefined ? [] : [row.removeAt]);
    if (!deadlines.length) return;
    const timer = setTimeout(() => {
      const now = Date.now();
      setStored(previous => ({ ...previous, rows: previous.rows.filter(row => row.removeAt === undefined || row.removeAt > now) }));
    }, Math.max(1, Math.min(...deadlines) - Date.now()));
    return () => clearTimeout(timer);
  }, [current.rows]);
  return {
    events: current.rows.map(row => row.event),
    removingEventIds: new Set(current.rows.filter(row => row.removeAt !== undefined).map(row => row.event.reactKey ?? row.event.id)),
  };
}
