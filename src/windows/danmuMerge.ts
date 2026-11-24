import { MsgType, type DanmakuEvent, type EmoteInfo } from "../protocol/types.ts";

export const DEFAULT_SAME_DANMU_WINDOW_SECONDS = 8;
export const MIN_SAME_DANMU_WINDOW_SECONDS = 1;
export const MAX_SAME_DANMU_WINDOW_SECONDS = 60;

export type SameDanmuMergeSettings = {
  mergeSameDanmu: boolean;
  sameDanmuWindowSeconds: number;
};

export function clampSameDanmuWindowSeconds(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SAME_DANMU_WINDOW_SECONDS;
  return Math.min(MAX_SAME_DANMU_WINDOW_SECONDS, Math.max(MIN_SAME_DANMU_WINDOW_SECONDS, Math.round(value)));
}

function serializeEmotes(emotes?: Record<string, EmoteInfo>): string {
  if (!emotes) return "";
  return Object.entries(emotes)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([token, emote]) => `${token}:${emote.url}:${emote.width}:${emote.height}`)
    .join("|");
}

/** 只为副窗口生成弹幕内容键；不包含 UID，因此不同用户的相同内容也能合并。 */
export function getDanmuContentKey(event: DanmakuEvent): string | null {
  if (event.msgType !== MsgType.Danmu) return null;
  if (event.emoticon) {
    return `big:${event.text ?? ""}:${event.emoticon.unique ?? ""}:${event.emoticon.url}`;
  }
  return `text:${event.text ?? ""}:emotes:${serializeEmotes(event.emotes)}`;
}

export function mergeSameDanmuEvent(
  events: DanmakuEvent[],
  event: DanmakuEvent,
  settings: SameDanmuMergeSettings,
): DanmakuEvent[] | null {
  if (!settings.mergeSameDanmu || event.msgType !== MsgType.Danmu) return null;
  const key = getDanmuContentKey(event);
  if (!key) return null;
  const windowMs = clampSameDanmuWindowSeconds(settings.sameDanmuWindowSeconds) * 1000;

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const current = events[index];
    if (current.msgType !== MsgType.Danmu) continue;
    const currentKey = getDanmuContentKey(current);
    if (currentKey !== key) continue;
    if (Math.abs(event.ts - current.ts) > windowMs) continue;

    const next = [...events];
    next[index] = {
      ...current,
      ts: event.ts,
      danmuRepeatCount: (current.danmuRepeatCount ?? 1) + 1,
    };
    return next;
  }
  return null;
}
