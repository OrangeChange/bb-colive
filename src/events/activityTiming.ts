import type { ActivityTiming } from '../protocol/types.ts';

const seconds = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : undefined;
};
const timestamp = (value: unknown): number | undefined => {
  const result = seconds(value);
  return result && result * 1000;
};

export function activityTimingFromPayload(kind: 'anchor' | 'red-pocket', data: Record<string, unknown>, observedAt = Date.now()): ActivityTiming | undefined {
  const serverNow = timestamp(data.current_time);
  if (kind === 'anchor') {
    const remaining = seconds(data.time);
    if (remaining === undefined) return undefined;
    return { endsAt: (serverNow ?? observedAt) + remaining * 1000, serverNow, observedAt, source: 'remaining' };
  }
  const startsAt = timestamp(data.start_time);
  const end = timestamp(data.end_time);
  const duration = seconds(data.last_time);
  const endsAt = end ?? (startsAt !== undefined && duration !== undefined ? startsAt + duration * 1000 : undefined);
  if (endsAt === undefined) return undefined;
  return { startsAt, endsAt, serverNow, observedAt, source: end !== undefined ? 'end-time' : 'start-duration' };
}

/** 将服务端绝对时间换算至主端接收时钟，输出端不重新锚定。 */
export function localActivityTime(timing: ActivityTiming, time: number): number {
  return time + (timing.serverNow === undefined ? 0 : timing.observedAt - timing.serverNow);
}
