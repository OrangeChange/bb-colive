export type EventExpirySettings = {
  enabled: boolean;
  seconds: number;
};

export const DEFAULT_EVENT_EXPIRY: EventExpirySettings = {
  enabled: false,
  seconds: 10,
};

export const MIN_EVENT_EXPIRY_SECONDS = 1;
export const MAX_EVENT_EXPIRY_SECONDS = 3600;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function normalizeEventExpiry(value: unknown): EventExpirySettings {
  const input = typeof value === "object" && value !== null ? value as Partial<EventExpirySettings> : {};
  return {
    enabled: input.enabled === true,
    seconds: typeof input.seconds === "number" && Number.isFinite(input.seconds)
      ? Math.round(clamp(input.seconds, MIN_EVENT_EXPIRY_SECONDS, MAX_EVENT_EXPIRY_SECONDS))
      : DEFAULT_EVENT_EXPIRY.seconds,
  };
}

export function isEventExpired(receivedAt: number, now: number, settings: EventExpirySettings): boolean {
  return settings.enabled && now - receivedAt >= settings.seconds * 1000;
}

export function pruneExpiredEvents<T extends { receivedAt: number }>(
  events: T[],
  now: number,
  settings: EventExpirySettings,
): T[] {
  if (!settings.enabled) return events;
  return events.filter(({ receivedAt }) => !isEventExpired(receivedAt, now, settings));
}
