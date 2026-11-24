import type { EventFilterState } from "../events/eventView.ts";
import type { SceneLayoutMode } from "./sceneLayout.ts";
import { normalizeGiftThresholdMode, type GiftThresholdMode } from "../giftThreshold.ts";
import { DEFAULT_AUDIENCE_FILTERS, normalizeAudienceFilters, type AudienceFilterSettings } from "../events/audienceFilters.ts";

export const SCENE_SETTINGS_KEY = "bb-colive.scene-settings.v1";
export const SCENE_SETTINGS_CHANGED = "danmu-scene-settings-changed";

export interface SceneSettings {
  filters: EventFilterState;
  giftThreshold: number;
  giftThresholdMode: GiftThresholdMode;
  audienceFilters: AudienceFilterSettings;
  layoutMode: SceneLayoutMode;
  leftRatio: number;
  leftBoundaries: number[];
  rightBoundaries: number[];
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const DEFAULT_FILTERS: EventFilterState = {
  left: {
    danmu: true,
    interact: true,
    interactKinds: {
      entry: true,
      follow: true,
      share: true,
      specialFollow: true,
      mutualFollow: true,
      like: true,
    },
  },
  right: {
    gift: true,
    giftKinds: { free: true, normal: true, blind: true, redPocket: true, anchorLot: true },
    superChat: true,
    guard: true,
  },
};

function cloneFilters(filters: EventFilterState): EventFilterState {
  return {
    left: {
      danmu: filters.left.danmu,
      interact: filters.left.interact,
      interactKinds: { ...filters.left.interactKinds },
    },
    right: {
      gift: filters.right.gift,
      giftKinds: { ...filters.right.giftKinds },
      superChat: filters.right.superChat,
      guard: filters.right.guard,
    },
  };
}

export const DEFAULT_SCENE_SETTINGS: SceneSettings = {
  filters: cloneFilters(DEFAULT_FILTERS),
  giftThreshold: 0.1,
  giftThresholdMode: "unit",
  audienceFilters: { ...DEFAULT_AUDIENCE_FILTERS },
  layoutMode: "dual",
  leftRatio: 0.5,
  leftBoundaries: [0.75],
  rightBoundaries: [1 / 3, 2 / 3],
};

export function createDefaultSceneSettings(): SceneSettings {
  return {
    ...DEFAULT_SCENE_SETTINGS,
    filters: cloneFilters(DEFAULT_SCENE_SETTINGS.filters),
    audienceFilters: { ...DEFAULT_AUDIENCE_FILTERS },
    leftBoundaries: [...DEFAULT_SCENE_SETTINGS.leftBoundaries],
    rightBoundaries: [...DEFAULT_SCENE_SETTINGS.rightBoundaries],
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeBoundaries(value: unknown, fallback: number[]): number[] {
  if (!Array.isArray(value)) return [...fallback];
  const values = value
    .filter((item): item is number => typeof item === "number" && Number.isFinite(item))
    .map((item) => Math.min(1, Math.max(0, item)));
  return values.length > 0 ? values : [...fallback];
}

function normalizeFilters(value: unknown): EventFilterState {
  const input = asRecord(value);
  const left = asRecord(input.left);
  const leftKinds = asRecord(left.interactKinds);
  const right = asRecord(input.right);
  const rightKinds = asRecord(right.giftKinds);

  return {
    left: {
      danmu: readBoolean(left.danmu, DEFAULT_FILTERS.left.danmu),
      interact: readBoolean(left.interact, DEFAULT_FILTERS.left.interact),
      interactKinds: {
        entry: readBoolean(leftKinds.entry, DEFAULT_FILTERS.left.interactKinds.entry),
        follow: readBoolean(leftKinds.follow, DEFAULT_FILTERS.left.interactKinds.follow),
        share: readBoolean(leftKinds.share, DEFAULT_FILTERS.left.interactKinds.share),
        specialFollow: readBoolean(leftKinds.specialFollow, DEFAULT_FILTERS.left.interactKinds.specialFollow),
        mutualFollow: readBoolean(leftKinds.mutualFollow, DEFAULT_FILTERS.left.interactKinds.mutualFollow),
        like: readBoolean(leftKinds.like, DEFAULT_FILTERS.left.interactKinds.like),
      },
    },
    right: {
      gift: readBoolean(right.gift, DEFAULT_FILTERS.right.gift),
      giftKinds: {
        free: readBoolean(rightKinds.free, DEFAULT_FILTERS.right.giftKinds.free),
        normal: readBoolean(rightKinds.normal, DEFAULT_FILTERS.right.giftKinds.normal),
        blind: readBoolean(rightKinds.blind, DEFAULT_FILTERS.right.giftKinds.blind),
        redPocket: readBoolean(rightKinds.redPocket, DEFAULT_FILTERS.right.giftKinds.redPocket),
        anchorLot: readBoolean(rightKinds.anchorLot, DEFAULT_FILTERS.right.giftKinds.anchorLot),
      },
      superChat: readBoolean(right.superChat, DEFAULT_FILTERS.right.superChat),
      guard: readBoolean(right.guard, DEFAULT_FILTERS.right.guard),
    },
  };
}

function getStorage(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadSceneSettings(storage?: StorageLike): SceneSettings {
  const target = getStorage(storage);
  if (!target) return createDefaultSceneSettings();

  try {
    const raw = target.getItem(SCENE_SETTINGS_KEY);
    if (!raw) return createDefaultSceneSettings();
    const input = asRecord(JSON.parse(raw) as unknown);
    const layoutMode = input.layoutMode === "partition" ? "partition" : input.layoutMode === "dual" ? "dual" : DEFAULT_SCENE_SETTINGS.layoutMode;
    const giftThreshold = Math.max(0, readNumber(input.giftThreshold, DEFAULT_SCENE_SETTINGS.giftThreshold));
    const giftThresholdMode = normalizeGiftThresholdMode(input.giftThresholdMode);
    const leftRatio = Math.min(0.72, Math.max(0.28, readNumber(input.leftRatio, DEFAULT_SCENE_SETTINGS.leftRatio)));

    return {
      filters: normalizeFilters(input.filters),
      giftThreshold,
      giftThresholdMode,
      audienceFilters: normalizeAudienceFilters(input.audienceFilters),
      layoutMode,
      leftRatio,
      leftBoundaries: normalizeBoundaries(input.leftBoundaries, DEFAULT_SCENE_SETTINGS.leftBoundaries),
      rightBoundaries: normalizeBoundaries(input.rightBoundaries, DEFAULT_SCENE_SETTINGS.rightBoundaries),
    };
  } catch {
    return createDefaultSceneSettings();
  }
}

export function saveSceneSettings(settings: SceneSettings, storage?: StorageLike): void {
  const target = getStorage(storage);
  if (!target) return;
  try {
    target.setItem(SCENE_SETTINGS_KEY, JSON.stringify(settings));
    if (!storage && typeof window !== "undefined") window.dispatchEvent(new Event(SCENE_SETTINGS_CHANGED));
  } catch {
    // 浏览器存储不可用时不影响现场使用。
  }
}
