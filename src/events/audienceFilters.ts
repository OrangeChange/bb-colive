import type { DanmakuEvent } from "../protocol/types.ts";

export interface AudienceFilterSettings {
  showCrossRoomEvents: boolean;
  minimumWealthLevel: number;
  minimumCurrentRoomMedalLevel: number;
}

export const DEFAULT_AUDIENCE_FILTERS: AudienceFilterSettings = {
  showCrossRoomEvents: true,
  minimumWealthLevel: 0,
  minimumCurrentRoomMedalLevel: 0,
};

const level = (value: unknown): number => typeof value === "number" && Number.isFinite(value)
  ? Math.max(0, Math.floor(value))
  : 0;

export function normalizeAudienceFilters(value: unknown): AudienceFilterSettings {
  const input = value && typeof value === "object" ? value as Partial<AudienceFilterSettings> : {};
  return {
    showCrossRoomEvents: input.showCrossRoomEvents !== false,
    minimumWealthLevel: level(input.minimumWealthLevel),
    minimumCurrentRoomMedalLevel: level(input.minimumCurrentRoomMedalLevel),
  };
}

/** 只依据事件携带的真实事实筛选；字段未知时保留。 */
export function isAllowedByAudienceFilters(
  event: DanmakuEvent,
  filters: AudienceFilterSettings,
  targetRoomId: number | null | undefined,
): boolean {
  if (!filters.showCrossRoomEvents && targetRoomId != null && event.roomId !== targetRoomId) return false;
  const wealth = event.user?.wealthLevel;
  if (filters.minimumWealthLevel > 0 && wealth !== undefined && wealth < filters.minimumWealthLevel) return false;
  if (filters.minimumCurrentRoomMedalLevel > 0) {
    const medal = event.user?.medal;
    if (medal?.isCurrentRoom === false) return false;
    if (medal?.isCurrentRoom === true && medal.level < filters.minimumCurrentRoomMedalLevel) return false;
  }
  return true;
}
