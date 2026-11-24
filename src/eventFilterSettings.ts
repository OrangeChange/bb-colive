import type { DanmakuEvent, InteractKind } from "./protocol/types.ts";
import {
  INTERACT_KIND_OPTIONS,
  isEventVisibleInPane,
  type EventFilterState,
} from "./events/eventView.ts";

/** 弹幕窗对应主区域左侧的一级筛选和互动二级筛选。 */
export type DisplayEventFilters = EventFilterState["left"];

export { INTERACT_KIND_OPTIONS };

export function createDefaultDisplayWindowFilters(): DisplayEventFilters {
  return {
    danmu: true,
    interact: true,
    interactKinds: Object.fromEntries(
      INTERACT_KIND_OPTIONS.map(({ key }) => [key, true]),
    ) as Record<InteractKind, boolean>,
  };
}

export const DEFAULT_DISPLAY_WINDOW_FILTERS = createDefaultDisplayWindowFilters();

export function normalizeDisplayWindowFilters(value: unknown): DisplayEventFilters {
  const input = typeof value === "object" && value !== null
    ? value as Partial<DisplayEventFilters>
    : {};
  const kinds = typeof input.interactKinds === "object" && input.interactKinds !== null
    ? input.interactKinds as Partial<Record<InteractKind, boolean>>
    : {};

  return {
    danmu: input.danmu !== false,
    interact: input.interact !== false,
    interactKinds: Object.fromEntries(
      INTERACT_KIND_OPTIONS.map(({ key }) => [key, kinds[key] !== false]),
    ) as Record<InteractKind, boolean>,
  };
}

/** 与主区域左侧使用同一套事件可见性判断，不包含右区礼物/SC/大航海。 */
export function isDisplayWindowEventVisible(event: DanmakuEvent, filters: DisplayEventFilters, showPhoneNotVerified = false): boolean {
  return isEventVisibleInPane(event, "left", filters, 0, {}, "unit", false, true, showPhoneNotVerified);
}
