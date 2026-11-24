import { uiText } from "../i18n/index.ts";
import type { ArchiveFilterState } from "./archiveTypes.ts";
import { getArchiveKeywordJoin } from "./archiveTypes.ts";
import { cloneReviewFilters } from "./archiveState.ts";

export type ReviewQuickConditionId = "excludeInteract" | "revenue";

export const REVIEW_REVENUE_CATEGORIES = ["gift", "lottery", "redPocket", "superChat", "guard"] as const;

export const REVIEW_QUICK_CONDITIONS: readonly { value: ReviewQuickConditionId; label: string }[] = [
  { value: "excludeInteract", label: uiText("reviewFilterPresets.REVIEW_QUICK_CONDITIONS.label") },
  { value: "revenue", label: uiText("reviewFilterPresets.REVIEW_QUICK_CONDITIONS.label2") },
];

export interface ReviewFilterPreset {
  id: string;
  name: string;
  filters: ArchiveFilterState;
  updatedAt: number;
}

export const REVIEW_FILTER_PRESETS_STORAGE_KEY = "danmu-review-filter-presets";
const MAX_REVIEW_FILTER_PRESETS = 24;

const REVIEW_FILTER_COMPARISON_KEYS = [
  "searchText",
  "keywordConditions",
  "filterMode",
  "primaryCategories",
  "secondaryCategories",
  "eventTypes",
  "showBigEmote",
  "userUid",
  "userIdentity",
  "fanMedal",
  "favoriteOnly",
  "giftPriceMinRmb",
  "giftPriceMaxRmb",
  "giftPriceMode",
  "fromTs",
  "toTs",
] as const;

function normalizeReviewFiltersForComparison(filters: ArchiveFilterState): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const key of REVIEW_FILTER_COMPARISON_KEYS) {
    const value = filters[key];
    if (key === "keywordConditions") {
      normalized[key] = (value as ArchiveFilterState["keywordConditions"] ?? []).map((condition, index) => ({
        field: condition.field,
        value: condition.value,
        join: index === 0 ? undefined : getArchiveKeywordJoin(condition, index, filters.keywordOperator),
      }));
      continue;
    }
    if (Array.isArray(value)) {
      normalized[key] = [...value].sort();
    } else if (value && typeof value === "object") {
      normalized[key] = Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
    } else if (value !== undefined) {
      normalized[key] = value;
    }
  }
  return normalized;
}

export function isReviewFilterPresetActive(
  preset: ReviewFilterPreset,
  filters: ArchiveFilterState,
): boolean {
  return JSON.stringify(normalizeReviewFiltersForComparison(preset.filters))
    === JSON.stringify(normalizeReviewFiltersForComparison(filters));
}

function sameStringSet(left: readonly string[] | undefined, right: readonly string[]): boolean {
  if (!left || left.length !== right.length) return false;
  const expected = new Set(right);
  return new Set(left).size === expected.size && left.every((value) => expected.has(value));
}

export function isReviewQuickConditionActive(
  filters: ArchiveFilterState,
  condition: ReviewQuickConditionId,
  _now = Date.now(),
): boolean {
  if (condition === "excludeInteract") {
    return filters.filterMode === "exclude" && sameStringSet(filters.primaryCategories, ["interact"])
      && !filters.secondaryCategories?.length && !filters.eventTypes?.length;
  }
  return filters.filterMode !== "exclude"
    && sameStringSet(filters.primaryCategories, REVIEW_REVENUE_CATEGORIES)
    && !filters.secondaryCategories?.length
    && !filters.eventTypes?.length;
}

/** 内置快捷条件只改分类/日期相关条件，保留用户、身份、价格和收藏条件。 */
export function applyReviewQuickCondition(
  filters: ArchiveFilterState,
  condition: ReviewQuickConditionId,
  _now = Date.now(),
): ArchiveFilterState {
  const next = cloneReviewFilters(filters);
  if (isReviewQuickConditionActive(filters, condition, _now)) {
    next.filterMode = undefined;
    next.primaryCategories = undefined;
    next.secondaryCategories = undefined;
    next.eventTypes = undefined;
    return next;
  }

  if (condition === "excludeInteract") {
    next.filterMode = "exclude";
    next.primaryCategories = ["interact"];
    next.secondaryCategories = undefined;
    next.eventTypes = undefined;
  } else {
    next.filterMode = "include";
    next.primaryCategories = [...REVIEW_REVENUE_CATEGORIES];
    next.secondaryCategories = undefined;
    next.eventTypes = undefined;
  }
  return next;
}

function createPresetId(): string {
  const randomUuid = globalThis.crypto?.randomUUID;
  if (randomUuid) return randomUuid.call(globalThis.crypto);
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createReviewFilterPreset(
  name: string,
  filters: ArchiveFilterState,
  now = Date.now(),
): ReviewFilterPreset | null {
  const normalizedName = name.trim();
  if (!normalizedName) return null;
  return { id: createPresetId(), name: normalizedName.slice(0, 40), filters: cloneReviewFilters(filters), updatedAt: now };
}

export function normalizeReviewFilterPresets(value: unknown): ReviewFilterPreset[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): ReviewFilterPreset[] => {
    if (typeof item !== "object" || item === null) return [];
    const candidate = item as Partial<ReviewFilterPreset>;
    if (typeof candidate.id !== "string" || typeof candidate.name !== "string" || !candidate.name.trim()) return [];
    if (typeof candidate.filters !== "object" || candidate.filters === null) return [];
    return [{
      id: candidate.id,
      name: candidate.name.trim().slice(0, 40),
      filters: cloneReviewFilters(candidate.filters as ArchiveFilterState),
      updatedAt: typeof candidate.updatedAt === "number" && Number.isFinite(candidate.updatedAt) ? candidate.updatedAt : 0,
    }];
  }).slice(0, MAX_REVIEW_FILTER_PRESETS);
}

export function renameReviewFilterPreset(
  presets: readonly ReviewFilterPreset[],
  id: string,
  name: string,
): ReviewFilterPreset[] {
  const normalizedName = name.trim();
  if (!normalizedName) return [...presets];
  return presets.map((preset) => preset.id === id ? { ...preset, name: normalizedName.slice(0, 40) } : { ...preset, filters: cloneReviewFilters(preset.filters) });
}

export function removeReviewFilterPreset(
  presets: readonly ReviewFilterPreset[],
  id: string,
): ReviewFilterPreset[] {
  return presets.filter((preset) => preset.id !== id).map((preset) => ({ ...preset, filters: cloneReviewFilters(preset.filters) }));
}

export function appendReviewFilterPreset(
  presets: readonly ReviewFilterPreset[],
  preset: ReviewFilterPreset,
): ReviewFilterPreset[] {
  return [...presets, preset].slice(0, MAX_REVIEW_FILTER_PRESETS).map((item) => ({ ...item, filters: cloneReviewFilters(item.filters) }));
}

export function loadReviewFilterPresets(): ReviewFilterPreset[] {
  if (typeof window === "undefined") return [];
  try {
    return normalizeReviewFilterPresets(JSON.parse(window.localStorage.getItem(REVIEW_FILTER_PRESETS_STORAGE_KEY) ?? "null"));
  } catch {
    return [];
  }
}

export function saveReviewFilterPresets(presets: readonly ReviewFilterPreset[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REVIEW_FILTER_PRESETS_STORAGE_KEY, JSON.stringify(presets.slice(0, MAX_REVIEW_FILTER_PRESETS)));
  } catch {
    // 本地存储不可用时仍保留当前组件内的预设。
  }
}
