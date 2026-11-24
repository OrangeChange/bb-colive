import { DEFAULT_REVIEW_STYLE_SETTINGS, normalizeReviewStyleSettings, type ReviewStyleSettings } from './reviewStyleSettings.ts';
import { create } from "zustand";
import { DEFAULT_STICKY_EVENT_SETTINGS, normalizeStickyEventSettings, type StickyEventSettings } from './windows/stickyEventModel.ts';
import { persist } from "zustand/middleware";
import {
  clampEventSpacing,
  clampEventPadding,
  normalizeEventAnimationDuration,
  clampEventFontSize,
  DEFAULT_EVENT_DISPLAY_PREFERENCES,
  DEFAULT_EVENT_FONT_SIZE,
  normalizeEventDisplayPreferences,
  type EventDisplayPreferences,
} from "./eventDisplaySettings.ts";
import {
  createDefaultEventStyleSettings,
  normalizeEventStyleSettings,
  type EventStyleSettings,
} from "./eventStyleSettings.ts";
import { normalizeLiveContentAlignment, normalizeLiveScrollDirection, type LiveContentAlignment, type LiveScrollDirection } from "./events/feedScroll.ts";
import {
  DEFAULT_WINDOW_APPEARANCE,
  normalizeWindowAppearance,
  type WindowAppearanceSettings,
} from "./windowAppearance.ts";
import {
  DEFAULT_EVENT_EXPIRY,
  normalizeEventExpiry,
  type EventExpirySettings,
} from "./windows/windowEventExpiry.ts";
import {
  clampSameDanmuWindowSeconds,
  DEFAULT_SAME_DANMU_WINDOW_SECONDS,
} from "./windows/danmuMerge.ts";
import {
  createDefaultDisplayWindowFilters,
  normalizeDisplayWindowFilters,
  type DisplayEventFilters,
} from "./eventFilterSettings.ts";

export type CloseBehavior = "exit" | "tray";
export type MinimizeBehavior = "taskbar" | "tray";

export const DEFAULT_UI_SCALE = 1;
export const MIN_UI_SCALE = 0.8;
export const MAX_UI_SCALE = 1.25;
export { DEFAULT_EVENT_FONT_SIZE } from "./eventDisplaySettings.ts";

type GeneralSettingsState = {
  uiScale: number;
  eventFontSize: number;
  reviewStyleSettings: ReviewStyleSettings;
  windowEventFontSize: number;
  eventDisplayPreferences: EventDisplayPreferences;
  eventStyleSettings: EventStyleSettings;
  liveScrollDirection: LiveScrollDirection;
  liveContentAlignment: LiveContentAlignment | undefined;
  windowAppearance: WindowAppearanceSettings;
  windowScheme: "follow" | "light" | "dark";
  eventExpiry: EventExpirySettings;
  stickyEvents: StickyEventSettings;
  eventWindowCapacity: number;
  mergeSameDanmu: boolean;
  sameDanmuWindowSeconds: number;
  showLiveGiftEffect: boolean;
  showLiveGuardEffect: boolean;
  showGiftWindowEffect: boolean;
  showGuardWindowEffect: boolean;
  showObsGiftEffect: boolean;
  showObsGuardEffect: boolean;
  favoriteEditOnAdd: boolean;
  displayWindowFilters: DisplayEventFilters;
  closeBehavior: CloseBehavior;
  minimizeBehavior: MinimizeBehavior;
  startOnBoot: boolean;
  autoConnectOnStartup: boolean;
  reviewOpenCurrentOwner: boolean;
  reviewArchiveRetentionDays: number | null;
  reviewOwnerRetentionDays: Record<string, number | null>;
  reviewPinnedOwnerRoomIds: number[];
  setUiScale: (scale: number) => void;
  setEventFontSize: (size: number) => void;
  setReviewStyleSettings: (value: Partial<ReviewStyleSettings>) => void;
  resetReviewStyle: () => void;
  setWindowEventFontSize: (size: number) => void;
  setEventSpacing: (spacing: number) => void;
  setEventPadding: (padding: number) => void;
  setEventAnimationPreset: (preset: EventDisplayPreferences["eventAnimationPreset"]) => void;
  setEventAnimationDuration: (duration: number) => void;
  setEventDisplayPreference: <K extends keyof EventDisplayPreferences>(key: K, value: EventDisplayPreferences[K]) => void;
  setEventStyleSettings: (value: EventStyleSettings | ((current: EventStyleSettings) => EventStyleSettings)) => void;
  setLiveScrollDirection: (direction: LiveScrollDirection) => void;
  setLiveContentAlignment: (alignment: LiveContentAlignment) => void;
  setWindowScheme: (scheme: "follow" | "light" | "dark") => void;
  setWindowAppearance: (value: WindowAppearanceSettings | ((current: WindowAppearanceSettings) => WindowAppearanceSettings)) => void;
  setEventExpiry: (value: EventExpirySettings | ((current: EventExpirySettings) => EventExpirySettings)) => void;
  setStickyEvents: (value: StickyEventSettings | ((current: StickyEventSettings) => StickyEventSettings)) => void;
  setEventWindowCapacity: (value: number) => void;
  setMergeSameDanmu: (enabled: boolean) => void;
  setSameDanmuWindowSeconds: (seconds: number) => void;
  setShowLiveGiftEffect: (enabled: boolean) => void;
  setShowLiveGuardEffect: (enabled: boolean) => void;
  setShowGiftWindowEffect: (enabled: boolean) => void;
  setShowGuardWindowEffect: (enabled: boolean) => void;
  setShowObsGiftEffect: (enabled: boolean) => void;
  setShowObsGuardEffect: (enabled: boolean) => void;
  setFavoriteEditOnAdd: (enabled: boolean) => void;
  setDisplayWindowFilters: (value: DisplayEventFilters | ((current: DisplayEventFilters) => DisplayEventFilters)) => void;
  setCloseBehavior: (behavior: CloseBehavior) => void;
  setMinimizeBehavior: (behavior: MinimizeBehavior) => void;
  setStartOnBoot: (enabled: boolean) => void;
  setAutoConnectOnStartup: (enabled: boolean) => void;
  setReviewOpenCurrentOwner: (enabled: boolean) => void;
  setReviewArchiveRetentionDays: (days: number | null) => void;
  setReviewOwnerRetentionDays: (ownerId: string, days: number | null | undefined) => void;
  setReviewOwnerPinned: (roomId: number, pinned: boolean) => void;
  resetLive: () => void;
  resetWindows: () => void;
  resetDanmu: () => void;
  resetEventDisplay: () => void;
  resetEventFilters: () => void;
  resetReview: () => void;
  resetGeneral: () => void;
};

const clampScale = (scale: number) => Math.min(MAX_UI_SCALE, Math.max(MIN_UI_SCALE, scale));

const defaultGeneralSettings = {
  uiScale: DEFAULT_UI_SCALE,
  eventFontSize: DEFAULT_EVENT_FONT_SIZE,
  reviewStyleSettings: { ...DEFAULT_REVIEW_STYLE_SETTINGS },
  windowEventFontSize: DEFAULT_EVENT_FONT_SIZE,
  eventDisplayPreferences: DEFAULT_EVENT_DISPLAY_PREFERENCES,
  eventStyleSettings: createDefaultEventStyleSettings(),
  liveScrollDirection: "bottom" as LiveScrollDirection,
  liveContentAlignment: "top" as LiveContentAlignment,
  windowAppearance: DEFAULT_WINDOW_APPEARANCE,
  windowScheme: "follow" as "follow" | "light" | "dark",
  eventExpiry: DEFAULT_EVENT_EXPIRY,
  stickyEvents: DEFAULT_STICKY_EVENT_SETTINGS,
  eventWindowCapacity: 50,
  mergeSameDanmu: false,
  sameDanmuWindowSeconds: DEFAULT_SAME_DANMU_WINDOW_SECONDS,
  showLiveGiftEffect: false,
  showLiveGuardEffect: false,
  showGiftWindowEffect: false,
  showGuardWindowEffect: false,
  showObsGiftEffect: false,
  showObsGuardEffect: false,
  favoriteEditOnAdd: false,
  displayWindowFilters: createDefaultDisplayWindowFilters(),
  closeBehavior: "exit" as CloseBehavior,
  minimizeBehavior: "taskbar" as MinimizeBehavior,
  startOnBoot: false,
  autoConnectOnStartup: false,
  reviewOpenCurrentOwner: true,
  reviewArchiveRetentionDays: null,
  reviewOwnerRetentionDays: {},
  reviewPinnedOwnerRoomIds: [],
};

const defaultGeneralSectionSettings = {
  uiScale: defaultGeneralSettings.uiScale,
  closeBehavior: defaultGeneralSettings.closeBehavior,
  minimizeBehavior: defaultGeneralSettings.minimizeBehavior,
  startOnBoot: defaultGeneralSettings.startOnBoot,
  autoConnectOnStartup: defaultGeneralSettings.autoConnectOnStartup,
};

const defaultReviewSectionSettings = {
  reviewOpenCurrentOwner: defaultGeneralSettings.reviewOpenCurrentOwner,
  reviewArchiveRetentionDays: defaultGeneralSettings.reviewArchiveRetentionDays,
  reviewOwnerRetentionDays: defaultGeneralSettings.reviewOwnerRetentionDays,
  reviewPinnedOwnerRoomIds: defaultGeneralSettings.reviewPinnedOwnerRoomIds,
};

function normalizeReviewArchiveRetentionDays(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || value <= 0) return null;
  return Math.max(1, Math.floor(value));
}

function normalizeReviewPinnedOwnerRoomIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((roomId): roomId is number => Number.isSafeInteger(roomId) && roomId > 0))];
}

const defaultDanmuSectionSettings = {
  eventFontSize: defaultGeneralSettings.eventFontSize,
  windowEventFontSize: defaultGeneralSettings.windowEventFontSize,
  eventDisplayPreferences: { ...DEFAULT_EVENT_DISPLAY_PREFERENCES },
  eventStyleSettings: createDefaultEventStyleSettings(),
  liveScrollDirection: defaultGeneralSettings.liveScrollDirection,
  liveContentAlignment: defaultGeneralSettings.liveContentAlignment,
  favoriteEditOnAdd: defaultGeneralSettings.favoriteEditOnAdd,
};

const eventFilterPreferenceKeys = ["showAutoDanmaku", "showPhoneNotVerified", "onlyGuardEntry"] as const;

export function resetEventDisplayPreferenceValues(current: EventDisplayPreferences): EventDisplayPreferences {
  const reset = { ...current,
    eventAnimationPreset: DEFAULT_EVENT_DISPLAY_PREFERENCES.eventAnimationPreset,
    eventAnimationDurationMs: DEFAULT_EVENT_DISPLAY_PREFERENCES.eventAnimationDurationMs,
  };
  for (const key of eventFilterPreferenceKeys) reset[key] = current[key] as never;
  return reset;
}

export function resetEventFilterPreferenceValues(current: EventDisplayPreferences): EventDisplayPreferences {
  const reset = { ...current };
  for (const key of eventFilterPreferenceKeys) reset[key] = defaultDanmuSectionSettings.eventDisplayPreferences[key] as never;
  return reset;
}

export const useGeneralSettings = create<GeneralSettingsState>()(
  persist(
    (set) => ({
      ...defaultGeneralSettings,
      setUiScale: (uiScale) => set({ uiScale: clampScale(uiScale) }),
      setReviewStyleSettings: (value) => set(state => ({reviewStyleSettings: normalizeReviewStyleSettings({...state.reviewStyleSettings,...value})})),
      resetReviewStyle: () => set({reviewStyleSettings:{...DEFAULT_REVIEW_STYLE_SETTINGS}}),
      setEventFontSize: (eventFontSize) => set({ eventFontSize: clampEventFontSize(eventFontSize) }),
      setWindowEventFontSize: (windowEventFontSize) => set({ windowEventFontSize: clampEventFontSize(windowEventFontSize) }),
      setEventSpacing: (eventSpacing) => set((state) => ({
        eventDisplayPreferences: { ...state.eventDisplayPreferences, eventSpacing: clampEventSpacing(eventSpacing) },
      })),
      setEventPadding: (eventPadding) => set((state) => ({
        eventDisplayPreferences: { ...state.eventDisplayPreferences, eventPadding: clampEventPadding(eventPadding) },
      })),
      setEventAnimationPreset: (eventAnimationPreset) => set((state) => ({
        eventDisplayPreferences: { ...state.eventDisplayPreferences, eventAnimationPreset },
      })),
      setEventAnimationDuration: (eventAnimationDurationMs) => set((state) => ({
        eventDisplayPreferences: {
          ...state.eventDisplayPreferences,
          eventAnimationDurationMs: normalizeEventAnimationDuration(eventAnimationDurationMs),
        },
      })),
      setEventDisplayPreference: (key, value) => set((state) => ({
        eventDisplayPreferences: { ...state.eventDisplayPreferences, [key]: value },
      })),
      setEventStyleSettings: (value) => set((state) => ({
        eventStyleSettings: normalizeEventStyleSettings(
          typeof value === "function" ? value(state.eventStyleSettings) : value,
        ),
      })),
      setLiveScrollDirection: (liveScrollDirection) => set({ liveScrollDirection }),
      setLiveContentAlignment: (liveContentAlignment) => set({ liveContentAlignment }),
      setWindowScheme: (windowScheme) => set({windowScheme}),
      setWindowAppearance: (value) => set((state) => ({
        windowAppearance: normalizeWindowAppearance(
          typeof value === "function" ? value(state.windowAppearance) : value,
        ),
      })),
      setEventExpiry: (value) => set((state) => ({
        eventExpiry: normalizeEventExpiry(
          typeof value === "function" ? value(state.eventExpiry) : value,
        ),
      })),
      setMergeSameDanmu: (mergeSameDanmu) => set({ mergeSameDanmu }),
      setStickyEvents: (value) => set((state) => ({ stickyEvents: normalizeStickyEventSettings(typeof value === 'function' ? value(state.stickyEvents) : value) })),
      setEventWindowCapacity: (eventWindowCapacity) => set({ eventWindowCapacity: Math.min(100, Math.max(1, Math.floor(eventWindowCapacity))) }),
      setSameDanmuWindowSeconds: (sameDanmuWindowSeconds) => set({ sameDanmuWindowSeconds: clampSameDanmuWindowSeconds(sameDanmuWindowSeconds) }),
      setShowLiveGiftEffect: (showLiveGiftEffect) => set({ showLiveGiftEffect }),
      setShowLiveGuardEffect: (showLiveGuardEffect) => set({ showLiveGuardEffect }),
      setShowGiftWindowEffect: (showGiftWindowEffect) => set({ showGiftWindowEffect }),
      setShowGuardWindowEffect: (showGuardWindowEffect) => set({ showGuardWindowEffect }),
      setShowObsGiftEffect: (showObsGiftEffect) => set({ showObsGiftEffect }),
      setShowObsGuardEffect: (showObsGuardEffect) => set({ showObsGuardEffect }),
      setFavoriteEditOnAdd: (favoriteEditOnAdd) => set({ favoriteEditOnAdd }),
      setDisplayWindowFilters: (value) => set((state) => ({
        displayWindowFilters: normalizeDisplayWindowFilters(
          typeof value === "function" ? value(state.displayWindowFilters) : value,
        ),
      })),
      setCloseBehavior: (closeBehavior) => set({ closeBehavior }),
      setMinimizeBehavior: (minimizeBehavior) => set({ minimizeBehavior }),
      setStartOnBoot: (startOnBoot) => set({ startOnBoot }),
      setAutoConnectOnStartup: (autoConnectOnStartup) => set({ autoConnectOnStartup }),
      setReviewOpenCurrentOwner: (reviewOpenCurrentOwner) => set({ reviewOpenCurrentOwner }),
      setReviewArchiveRetentionDays: (reviewArchiveRetentionDays) => set({
        reviewArchiveRetentionDays: normalizeReviewArchiveRetentionDays(reviewArchiveRetentionDays),
      }),
      setReviewOwnerRetentionDays: (ownerId, days) => set((state) => {
        const next = { ...state.reviewOwnerRetentionDays };
        if (days === undefined) delete next[ownerId];
        else next[ownerId] = normalizeReviewArchiveRetentionDays(days);
        return { reviewOwnerRetentionDays: next };
      }),
      setReviewOwnerPinned: (roomId, pinned) => set((state) => {
        if (!Number.isSafeInteger(roomId) || roomId <= 0) return state;
        const next = new Set(state.reviewPinnedOwnerRoomIds);
        if (pinned) next.add(roomId);
        else next.delete(roomId);
        return { reviewPinnedOwnerRoomIds: [...next] };
      }),
      // 现场分类的可变设置属于 SceneSettings；保留接口供分类级恢复调用。
      resetLive: () => set({ showLiveGiftEffect: defaultGeneralSettings.showLiveGiftEffect, showLiveGuardEffect: defaultGeneralSettings.showLiveGuardEffect }),
      // 副窗口的开关和锁定属于运行状态，外观与显示策略仍可恢复默认。
      resetWindows: () => set({
        windowScheme: "follow",
        windowAppearance: { ...DEFAULT_WINDOW_APPEARANCE },
        showGiftWindowEffect: defaultGeneralSettings.showGiftWindowEffect,
        showGuardWindowEffect: defaultGeneralSettings.showGuardWindowEffect,
        displayWindowFilters: createDefaultDisplayWindowFilters(),
      }),
      resetDanmu: () => set({
        ...defaultDanmuSectionSettings,
        eventDisplayPreferences: { ...defaultDanmuSectionSettings.eventDisplayPreferences },
        eventStyleSettings: createDefaultEventStyleSettings(),
        liveScrollDirection: defaultDanmuSectionSettings.liveScrollDirection,
        liveContentAlignment: defaultDanmuSectionSettings.liveContentAlignment,
      }),
      resetEventDisplay: () => set((state) => ({
        eventWindowCapacity: 50,
        eventExpiry: { ...DEFAULT_EVENT_EXPIRY },
        mergeSameDanmu: defaultGeneralSettings.mergeSameDanmu,
        sameDanmuWindowSeconds: defaultGeneralSettings.sameDanmuWindowSeconds,
        favoriteEditOnAdd: defaultDanmuSectionSettings.favoriteEditOnAdd,
        eventDisplayPreferences: resetEventDisplayPreferenceValues(state.eventDisplayPreferences),
        liveScrollDirection: defaultDanmuSectionSettings.liveScrollDirection,
        liveContentAlignment: defaultDanmuSectionSettings.liveContentAlignment,
        stickyEvents: { ...DEFAULT_STICKY_EVENT_SETTINGS },
      })),
      resetEventFilters: () => set((state) => ({
        eventDisplayPreferences: resetEventFilterPreferenceValues(state.eventDisplayPreferences),
      })),
      resetReview: () => set({ ...defaultReviewSectionSettings, reviewOwnerRetentionDays: {}, reviewPinnedOwnerRoomIds: [] }),
      resetGeneral: () => set({ ...defaultGeneralSectionSettings }),
    }),
    {
      name: "danmu-general-settings",
      partialize: (state) => ({
        uiScale: state.uiScale,
        eventFontSize: state.eventFontSize,
        reviewStyleSettings: state.reviewStyleSettings,
        windowEventFontSize: state.windowEventFontSize,
        eventDisplayPreferences: state.eventDisplayPreferences,
        eventStyleSettings: state.eventStyleSettings,
        liveScrollDirection: state.liveScrollDirection,
        liveContentAlignment: state.liveContentAlignment,
        showLiveGiftEffect: state.showLiveGiftEffect,
        showLiveGuardEffect: state.showLiveGuardEffect,
        showGiftWindowEffect: state.showGiftWindowEffect,
        showGuardWindowEffect: state.showGuardWindowEffect,
        showObsGiftEffect: state.showObsGiftEffect,
        showObsGuardEffect: state.showObsGuardEffect,
        favoriteEditOnAdd: state.favoriteEditOnAdd,
        windowAppearance: state.windowAppearance,
        windowScheme: state.windowScheme,
        eventExpiry: state.eventExpiry,
        stickyEvents: state.stickyEvents,
        eventWindowCapacity: state.eventWindowCapacity,
        mergeSameDanmu: state.mergeSameDanmu,
        sameDanmuWindowSeconds: state.sameDanmuWindowSeconds,
        displayWindowFilters: state.displayWindowFilters,
        closeBehavior: state.closeBehavior,
        minimizeBehavior: state.minimizeBehavior,
        startOnBoot: state.startOnBoot,
        autoConnectOnStartup: state.autoConnectOnStartup,
        reviewOpenCurrentOwner: state.reviewOpenCurrentOwner,
        reviewArchiveRetentionDays: state.reviewArchiveRetentionDays,
        reviewOwnerRetentionDays: state.reviewOwnerRetentionDays,
        reviewPinnedOwnerRoomIds: state.reviewPinnedOwnerRoomIds,
      }),
      merge: (persisted, current) => {
        const saved = typeof persisted === "object" && persisted !== null ? persisted as Partial<GeneralSettingsState> : {};
        return {
          ...current,
          uiScale: typeof saved.uiScale === "number" ? clampScale(saved.uiScale) : current.uiScale,
          eventFontSize: typeof saved.eventFontSize === "number" ? clampEventFontSize(saved.eventFontSize) : current.eventFontSize,
          windowEventFontSize: typeof saved.windowEventFontSize === "number" ? clampEventFontSize(saved.windowEventFontSize) : current.windowEventFontSize,
          reviewStyleSettings: normalizeReviewStyleSettings(saved.reviewStyleSettings),
          eventDisplayPreferences: normalizeEventDisplayPreferences(saved.eventDisplayPreferences),
          eventStyleSettings: normalizeEventStyleSettings(saved.eventStyleSettings),
          liveScrollDirection: normalizeLiveScrollDirection(saved.liveScrollDirection),
          liveContentAlignment: saved.liveContentAlignment === undefined
            ? "top"
            : normalizeLiveContentAlignment(saved.liveContentAlignment),
          windowAppearance: normalizeWindowAppearance(saved.windowAppearance),
          windowScheme: saved.windowScheme === "light" || saved.windowScheme === "dark" ? saved.windowScheme : "follow",
          eventExpiry: normalizeEventExpiry(saved.eventExpiry),
          stickyEvents: normalizeStickyEventSettings(saved.stickyEvents),
          eventWindowCapacity: typeof saved.eventWindowCapacity === "number"
            ? Math.min(100, Math.max(1, Math.floor(saved.eventWindowCapacity))) : 50,
          mergeSameDanmu: saved.mergeSameDanmu === true,
          sameDanmuWindowSeconds: typeof saved.sameDanmuWindowSeconds === "number"
            ? clampSameDanmuWindowSeconds(saved.sameDanmuWindowSeconds)
            : current.sameDanmuWindowSeconds,
          showLiveGiftEffect: saved.showLiveGiftEffect === true,
          showLiveGuardEffect: saved.showLiveGuardEffect === true,
          showGiftWindowEffect: saved.showGiftWindowEffect === true,
          showGuardWindowEffect: saved.showGuardWindowEffect === true,
          showObsGiftEffect: saved.showObsGiftEffect === true,
          showObsGuardEffect: saved.showObsGuardEffect === true,
          favoriteEditOnAdd: saved.favoriteEditOnAdd === true,
          displayWindowFilters: normalizeDisplayWindowFilters(saved.displayWindowFilters),
          closeBehavior: saved.closeBehavior === "tray" ? "tray" : "exit",
          minimizeBehavior: saved.minimizeBehavior === "tray" ? "tray" : "taskbar",
          startOnBoot: saved.startOnBoot === true,
          autoConnectOnStartup: saved.autoConnectOnStartup === true,
          reviewOpenCurrentOwner: saved.reviewOpenCurrentOwner !== false,
          reviewArchiveRetentionDays: typeof saved.reviewArchiveRetentionDays === "number"
            ? normalizeReviewArchiveRetentionDays(saved.reviewArchiveRetentionDays)
            : current.reviewArchiveRetentionDays,
          reviewOwnerRetentionDays: saved.reviewOwnerRetentionDays && typeof saved.reviewOwnerRetentionDays === "object"
            ? Object.fromEntries(Object.entries(saved.reviewOwnerRetentionDays).flatMap(([ownerId, value]) => (
              typeof value === "number" && Number.isFinite(value) && value > 0
                ? [[ownerId, normalizeReviewArchiveRetentionDays(value)]]
                : value === null ? [[ownerId, null]] : []
            )))
            : current.reviewOwnerRetentionDays,
          reviewPinnedOwnerRoomIds: normalizeReviewPinnedOwnerRoomIds(saved.reviewPinnedOwnerRoomIds),
        };
      },
    },
  ),
);

