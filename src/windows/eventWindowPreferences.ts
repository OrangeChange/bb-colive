import {
  resolveEventDisplayPreferences,
  clampEventFontSize,
  DEFAULT_EVENT_DISPLAY_PREFERENCES,
  DEFAULT_EVENT_FONT_SIZE,
  normalizeEventDisplayPreferences,
  type EventDisplayPreferences,
} from "../eventDisplaySettings.ts";
import { normalizeUserNicknames } from "../userNicknames.ts";
import { DEFAULT_STICKY_EVENT_SETTINGS, normalizeStickyEventSettings, type StickyEventSettings } from './stickyEventModel.ts';
import {
  createDefaultEventStyleSettings,
  normalizeEventStyleSettings,
  type EventStyleSettings,
} from "../eventStyleSettings.ts";
import { normalizeGiftThreshold, normalizeGiftThresholdMode, type GiftThresholdMode } from "../giftThreshold.ts";
import { normalizeLiveContentAlignment, normalizeLiveScrollDirection, type LiveContentAlignment, type LiveScrollDirection } from "../events/feedScroll.ts";
import { DEFAULT_WINDOW_APPEARANCE, normalizeWindowAppearance, type WindowAppearanceSettings } from "../windowAppearance.ts";
import { DEFAULT_EVENT_EXPIRY, normalizeEventExpiry, type EventExpirySettings } from "./windowEventExpiry.ts";
import {
  clampSameDanmuWindowSeconds,
  DEFAULT_SAME_DANMU_WINDOW_SECONDS,
} from "./danmuMerge.ts";
import {
  createDefaultDisplayWindowFilters,
  normalizeDisplayWindowFilters,
  type DisplayEventFilters,
} from "../eventFilterSettings.ts";
import type { useGeneralSettings } from "../generalSettings.ts";
import type { NativeThemeProjection } from "../themes/nativeThemeProjection.ts";
import { DEFAULT_AUDIENCE_FILTERS, normalizeAudienceFilters, type AudienceFilterSettings } from "../events/audienceFilters.ts";
import type { EventFilterState } from '../events/eventView.ts';
import { resolveThemeEventVisibility } from '../themes/themeEventVisibility.ts';

export type EventWindowSettings = Pick<ReturnType<typeof useGeneralSettings.getState>,
  "windowEventFontSize" | "liveContentAlignment" | "liveScrollDirection" | "windowAppearance" |
  "eventExpiry" | "stickyEvents" | "mergeSameDanmu" | "sameDanmuWindowSeconds" | "showGiftWindowEffect" | "showGuardWindowEffect" |
  "displayWindowFilters" | "eventDisplayPreferences" | "eventStyleSettings" | "eventWindowCapacity">;

export function createEventWindowPreferences(
  settings: EventWindowSettings,
  scene: { giftThreshold: number; giftThresholdMode: GiftThresholdMode; audienceFilters?: AudienceFilterSettings; filters?: EventFilterState },
): EventWindowPreferences {
  return {
    userNicknames: {},
    displayScale: 1,
    sceneFilters: scene.filters,
    fontSize: settings.windowEventFontSize,
    giftThreshold: scene.giftThreshold,
    giftThresholdMode: scene.giftThresholdMode,
    audienceFilters: normalizeAudienceFilters(scene.audienceFilters),
    scrollDirection: settings.liveScrollDirection,
    contentAlignment: settings.liveContentAlignment,
    appearance: settings.windowAppearance,
    eventExpiry: settings.eventExpiry,
    stickyEvents: normalizeStickyEventSettings(settings.stickyEvents),
    capacity: typeof settings.eventWindowCapacity === "number"
      ? Math.min(100, Math.max(1, Math.floor(settings.eventWindowCapacity))) : 50,
    mergeSameDanmu: settings.mergeSameDanmu,
    sameDanmuWindowSeconds: settings.sameDanmuWindowSeconds,
    showGiftEffect: settings.showGiftWindowEffect,
    showGuardEffect: settings.showGuardWindowEffect === true,
    displayFilters: settings.displayWindowFilters,
    display: { ...settings.eventDisplayPreferences, showTimestamp: false, maskUsername: false },
    eventStyleSettings: settings.eventStyleSettings,
  };
}

/** 主窗口向两个独立 WebView 下发事件视觉偏好的统一事件。 */
export const EVENT_WINDOW_PREFERENCES_EVENT = "event-window:preferences";

export type EventWindowPreferences = {
  userNicknames?: Record<string, string>;
  sceneFilters?: EventFilterState;
  eventVisibility?: import("../themes/nativeComponentAppearance.ts").NativeEventVisibility;
  displayScale: number;
  fontSize: number;
  giftThreshold: number;
  giftThresholdMode: GiftThresholdMode;
  audienceFilters: AudienceFilterSettings;
  scrollDirection: LiveScrollDirection;
  contentAlignment?: LiveContentAlignment;
  appearance: WindowAppearanceSettings;
  eventExpiry: EventExpirySettings;
  stickyEvents: StickyEventSettings;
  capacity: number;
  mergeSameDanmu: boolean;
  sameDanmuWindowSeconds: number;
  showGiftEffect: boolean;
  showGuardEffect?: boolean;
  displayFilters: DisplayEventFilters;
  display: EventDisplayPreferences & { showTimestamp: boolean; maskUsername: boolean };
  eventStyleSettings: EventStyleSettings;
};

export const DEFAULT_EVENT_WINDOW_PREFERENCES: EventWindowPreferences = {
  userNicknames: {},
  sceneFilters: undefined,
  displayScale: 1,
  fontSize: DEFAULT_EVENT_FONT_SIZE,
  giftThreshold: 0.1,
  giftThresholdMode: "unit",
  audienceFilters: DEFAULT_AUDIENCE_FILTERS,
  scrollDirection: "bottom",
  contentAlignment: "top",
  appearance: DEFAULT_WINDOW_APPEARANCE,
  eventExpiry: DEFAULT_EVENT_EXPIRY,
  stickyEvents: DEFAULT_STICKY_EVENT_SETTINGS,
  capacity: 50,
  mergeSameDanmu: false,
  sameDanmuWindowSeconds: DEFAULT_SAME_DANMU_WINDOW_SECONDS,
  showGiftEffect: false,
  showGuardEffect: false,
  displayFilters: createDefaultDisplayWindowFilters(),
  display: { ...DEFAULT_EVENT_DISPLAY_PREFERENCES, showTimestamp: false, maskUsername: false },
  eventStyleSettings: createDefaultEventStyleSettings(),
};

export function normalizeEventWindowPreferences(value: unknown): EventWindowPreferences {
  const input = typeof value === "object" && value !== null ? value as Partial<EventWindowPreferences> : {};
  return {
    userNicknames: normalizeUserNicknames(input.userNicknames),
    sceneFilters: input.sceneFilters,
    displayScale: typeof input.displayScale === "number" && Number.isFinite(input.displayScale) ? Math.max(0.5, Math.min(3, input.displayScale)) : 1,
    fontSize: typeof input.fontSize === "number" ? clampEventFontSize(input.fontSize) : DEFAULT_EVENT_FONT_SIZE,
    giftThreshold: typeof input.giftThreshold === "number"
      ? normalizeGiftThreshold(input.giftThreshold)
      : 0.1,
    giftThresholdMode: normalizeGiftThresholdMode(input.giftThresholdMode),
    audienceFilters: normalizeAudienceFilters(input.audienceFilters),
    scrollDirection: normalizeLiveScrollDirection(input.scrollDirection),
    contentAlignment: normalizeLiveContentAlignment(input.contentAlignment),
    appearance: normalizeWindowAppearance(input.appearance),
    eventExpiry: normalizeEventExpiry(input.eventExpiry),
    stickyEvents: normalizeStickyEventSettings(input.stickyEvents),
    capacity: typeof input.capacity === "number" ? Math.min(100, Math.max(1, Math.floor(input.capacity))) : 50,
    mergeSameDanmu: input.mergeSameDanmu === true,
    sameDanmuWindowSeconds: typeof input.sameDanmuWindowSeconds === "number"
      ? clampSameDanmuWindowSeconds(input.sameDanmuWindowSeconds)
      : DEFAULT_SAME_DANMU_WINDOW_SECONDS,
    showGiftEffect: input.showGiftEffect === true,
    showGuardEffect: input.showGuardEffect === true,
    displayFilters: normalizeDisplayWindowFilters(input.displayFilters),
    display: {
      ...normalizeEventDisplayPreferences(input.display),
      showTimestamp: typeof (input.display as { showTimestamp?: unknown } | undefined)?.showTimestamp === "boolean"
        ? (input.display as { showTimestamp: boolean }).showTimestamp : false,
      maskUsername: (input.display as { maskUsername?: unknown } | undefined)?.maskUsername === true,
    },
    eventStyleSettings: { ...input.eventStyleSettings, ...normalizeEventStyleSettings(input.eventStyleSettings) },
  };
}

/** 将副窗口收到的设置同时写入同步快照和 React 状态使用的值。 */
export function applyEventWindowPreferences(
  preferencesRef: { current: EventWindowPreferences },
  value: unknown,
): EventWindowPreferences {
  const normalized = applyEventWindowBehaviorPreferences(preferencesRef.current, value);
  preferencesRef.current = normalized;
  return normalized;
}

/** 更新软件拥有的窗口行为，保留已发布主题拥有的视觉字段。 */
export function applyEventWindowBehaviorPreferences(
  current: EventWindowPreferences,
  value: unknown,
): EventWindowPreferences {
  const incoming = normalizeEventWindowPreferences(value);
  return {
    ...incoming,
    eventVisibility: current.eventVisibility,
    displayScale: current.displayScale,
    fontSize: current.fontSize,
    display: resolveEventDisplayPreferences(current.display, incoming.display),
    eventStyleSettings: current.eventStyleSettings,
  };
}

/** 只替换主题拥有的视觉字段，保留窗口布局、筛选、置顶栏和事件寿命。 */
export function applyNativeThemeProjectionToWindowPreferences(
  current: EventWindowPreferences,
  projection: NativeThemeProjection,
): EventWindowPreferences {
  return {
    ...current,
    eventVisibility: resolveThemeEventVisibility(projection.eventVisibility, 'windows'),
    displayScale: projection.displayScale,
    fontSize: projection.display.baseFontSize,
    display: resolveEventDisplayPreferences({
      ...current.display,
      ...projection.display,
      showTimestamp: projection.display.showTimestamp,
      maskUsername: projection.display.maskUsername,
    }, current.display),
    eventStyleSettings: { ...projection.settings, ...normalizeEventStyleSettings(projection.settings) },
  };
}
