import { DateTimeField } from "./DateTimeField";
import { Input } from "./shadcn/input";
import { Button } from "./shadcn/button";
import { useUiLanguage } from "../i18n/react.ts";
import { localized, uiText } from "../i18n/index.ts";
import { ChevronDown as LucideChevronDown, X as LucideX } from "lucide-react";
import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type {
  ArchiveFilterState,
  ArchiveFilterMode,
  ArchiveKeywordCondition,
  ArchiveKeywordField,
  ArchiveKeywordOperator,
  ArchiveSearchScope,
  ArchiveUserIdentity,
  ArchiveFanMedalFilter,
  ArchiveGiftPriceMode,
} from "../archive/archiveTypes.ts";
import { getArchiveKeywordJoin } from "../archive/archiveTypes.ts";
import { getReviewDatePreset, getReviewDateRange, switchReviewFilterMode } from "../archive/archiveState.ts";
import type { ReviewDatePreset, ReviewQueryState } from "../archive/archiveState.ts";
import { recordArchiveDiagnostic } from "../archive/archiveDiagnostics.ts";
import { ReviewFilterShell } from "./ReviewFilterShell";
import { ReviewFilterPopover, ReviewFilterSubmenuLayerContext } from "./ReviewFilterPopover";
import { PopoverContent, PopoverAnchor, Popover } from "./shadcn/popover";
import { compactFilterActionButtonClass } from "./actionButtonStyles";
import { UiCombobox } from "./ui/Combobox";
import { UiSelect } from "./ui/Select";
import { mergeComboboxOptions } from "./ui/comboboxOptions";
import {
  applyReviewQuickCondition,
  appendReviewFilterPreset,
  createReviewFilterPreset,
  isReviewFilterPresetActive,
  isReviewQuickConditionActive,
  loadReviewFilterPresets,
  renameReviewFilterPreset,
  removeReviewFilterPreset,
  REVIEW_QUICK_CONDITIONS,
  saveReviewFilterPresets,
  type ReviewFilterPreset,
  type ReviewQuickConditionId,
} from "../archive/reviewFilterPresets.ts";

type ReviewSearchLevel = "session";
type DatePreset = ReviewDatePreset;

export interface ReviewSearchControlsProps {
  level: ReviewSearchLevel;
  query: ReviewQueryState;
  onChange: (patch: Partial<ReviewQueryState>) => void;
  onClearSearch?: () => void;
  onClearFilters?: () => void;
  onReplaceFilters?: (filters: ArchiveFilterState) => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  activeUserFilter?: { uid: string; name: string } | null;
  onClearUserFilter?: () => void;
}

export const CATEGORY_OPTIONS: readonly { value: string; label: string }[] = localized(() => ([
  { value: "danmu", label: uiText("reviewSearchControls.CATEGORY_OPTIONS.label") },
  { value: "interact", label: uiText("reviewSearchControls.CATEGORY_OPTIONS.label2") },
  { value: "gift", label: uiText("reviewSearchControls.CATEGORY_OPTIONS.label3") },
  { value: "lottery", label: uiText("reviewSearchControls.CATEGORY_OPTIONS.label4") },
  { value: "redPocket", label: uiText("reviewSearchControls.CATEGORY_OPTIONS.label5") },
  { value: "superChat", label: uiText("reviewSearchControls.CATEGORY_OPTIONS.label6") },
  { value: "guard", label: uiText("reviewSearchControls.CATEGORY_OPTIONS.label7") },
  { value: "system", label: uiText("reviewSearchControls.CATEGORY_OPTIONS.label8") },
]));

export const GIFT_TYPE_OPTIONS: readonly { value: string; label: string }[] = localized(() => ([
  { value: "normal", label: uiText("reviewSearchControls.GIFT_TYPE_OPTIONS.label") },
  { value: "blind", label: uiText("reviewSearchControls.GIFT_TYPE_OPTIONS.label2") },
  { value: "free", label: uiText("reviewSearchControls.GIFT_TYPE_OPTIONS.label3") },
]));

export const INTERACT_TYPE_OPTIONS: readonly { value: string; label: string }[] = localized(() => ([
  { value: "entry", label: uiText("reviewSearchControls.INTERACT_TYPE_OPTIONS.label") },
  { value: "follow", label: uiText("reviewSearchControls.INTERACT_TYPE_OPTIONS.label2") },
  { value: "share", label: uiText("reviewSearchControls.INTERACT_TYPE_OPTIONS.label3") },
  { value: "specialFollow", label: uiText("reviewSearchControls.INTERACT_TYPE_OPTIONS.label4") },
  { value: "mutualFollow", label: uiText("reviewSearchControls.INTERACT_TYPE_OPTIONS.label5") },
  { value: "like", label: uiText("reviewSearchControls.INTERACT_TYPE_OPTIONS.label6") },
]));

export const SECONDARY_OPTIONS = [...GIFT_TYPE_OPTIONS, ...INTERACT_TYPE_OPTIONS] as const;

export const KEYWORD_FIELDS: readonly { value: ArchiveKeywordField; label: string }[] = localized(() => ([
  { value: "all", label: uiText("reviewSearchControls.KEYWORD_FIELDS.label") },
  { value: "user", label: uiText("reviewSearchControls.KEYWORD_FIELDS.label2") },
  { value: "fanMedal", label: uiText("reviewSearchControls.KEYWORD_FIELDS.label3") },
  { value: "gift", label: uiText("reviewSearchControls.KEYWORD_FIELDS.label4") },
  { value: "content", label: uiText("reviewSearchControls.KEYWORD_FIELDS.label5") },
]));

export const USER_IDENTITY_OPTIONS: readonly { value: ArchiveUserIdentity | ""; label: string }[] = localized(() => ([
  { value: "", label: uiText("reviewSearchControls.USER_IDENTITY_OPTIONS.label") },
  { value: "normal", label: uiText("reviewSearchControls.USER_IDENTITY_OPTIONS.label2") },
  { value: "guard", label: uiText("reviewSearchControls.USER_IDENTITY_OPTIONS.label3") },
  { value: "captain", label: uiText("reviewSearchControls.USER_IDENTITY_OPTIONS.label4") },
  { value: "admiral", label: uiText("reviewSearchControls.USER_IDENTITY_OPTIONS.label5") },
  { value: "viceroy", label: uiText("reviewSearchControls.USER_IDENTITY_OPTIONS.label6") },
  { value: "admin", label: uiText("reviewSearchControls.USER_IDENTITY_OPTIONS.label7") },
  { value: "anchor", label: uiText("reviewSearchControls.USER_IDENTITY_OPTIONS.label8") },
]));

export const FAN_MEDAL_OPTIONS: readonly { value: ArchiveFanMedalFilter | ""; label: string }[] = localized(() => ([
  { value: "", label: uiText("reviewSearchControls.FAN_MEDAL_OPTIONS.label") },
  { value: "current", label: uiText("reviewSearchControls.FAN_MEDAL_OPTIONS.label2") },
  { value: "currentLighted", label: uiText("reviewSearchControls.FAN_MEDAL_OPTIONS.label3") },
]));

export const REVIEW_SEARCH_HISTORY_KEY = "danmu-review-search-history";
export const SEARCH_SUGGESTIONS = localized(() => ([uiText("reviewSearchControls.SEARCH_SUGGESTIONS"), uiText("reviewSearchControls.SEARCH_SUGGESTIONS2"), uiText("reviewSearchControls.SEARCH_SUGGESTIONS3"), uiText("reviewSearchControls.SEARCH_SUGGESTIONS4"), uiText("reviewSearchControls.SEARCH_SUGGESTIONS5"), uiText("reviewSearchControls.SEARCH_SUGGESTIONS6"), uiText("reviewSearchControls.SEARCH_SUGGESTIONS7")] as const));
const REVIEW_DATE_OPTIONS: readonly { value: DatePreset; label: string }[] = localized(() => ([
  { value: "all", label: uiText("reviewSearchControls.REVIEW_DATE_OPTIONS.label") },
  { value: "2m", label: uiText("reviewSearchControls.REVIEW_DATE_OPTIONS.label2") },
  { value: "5m", label: uiText("reviewSearchControls.REVIEW_DATE_OPTIONS.label3") },
  { value: "20m", label: uiText("reviewSearchControls.REVIEW_DATE_OPTIONS.label4") },
  { value: "1h", label: uiText("reviewSearchControls.REVIEW_DATE_OPTIONS.label5") },
  { value: "2h", label: uiText("reviewSearchControls.REVIEW_DATE_OPTIONS.label6") },
  { value: "12h", label: uiText("reviewSearchControls.REVIEW_DATE_OPTIONS.label7") },
  { value: "1d", label: uiText("reviewSearchControls.REVIEW_DATE_OPTIONS.label8") },
  { value: "1w", label: uiText("reviewSearchControls.REVIEW_DATE_OPTIONS.label9") },
  { value: "1mo", label: uiText("reviewSearchControls.REVIEW_DATE_OPTIONS.label10") },
  { value: "today", label: uiText("reviewSearchControls.REVIEW_DATE_OPTIONS.label11") },
  { value: "yesterday", label: uiText("reviewSearchControls.REVIEW_DATE_OPTIONS.label12") },
  { value: "week", label: uiText("reviewSearchControls.REVIEW_DATE_OPTIONS.label13") },
  { value: "lastWeek", label: uiText("reviewSearchControls.REVIEW_DATE_OPTIONS.label14") },
  { value: "month", label: uiText("reviewSearchControls.REVIEW_DATE_OPTIONS.label15") },
  { value: "lastMonth", label: uiText("reviewSearchControls.REVIEW_DATE_OPTIONS.label16") },
  { value: "custom", label: uiText("reviewSearchControls.REVIEW_DATE_OPTIONS.label17") },
]));

const inputClass = "h-8 min-w-0 rounded-md border border-line bg-bg px-2 ui-type-control text-t1 outline-none placeholder:text-t3 focus:border-accent focus:ring-2 focus:ring-accent-ring";
const toggleClass = "inline-flex min-h-8 items-center rounded-md border px-2 py-1 ui-type-control transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring";

export function cloneFilters(filters: ArchiveFilterState): ArchiveFilterState {
  return {
    ...filters,
    keywordConditions: filters.keywordConditions?.map((condition) => ({ ...condition })),
    primaryCategories: filters.primaryCategories ? [...filters.primaryCategories] : undefined,
    secondaryCategories: filters.secondaryCategories ? [...filters.secondaryCategories] : undefined,
    eventTypes: filters.eventTypes ? [...filters.eventTypes] : undefined,
  };
}

export function dateInputValue(timestamp: number | undefined): string {
  if (timestamp === undefined) return "";
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function dateInputTimestamp(value: string): number | undefined {
  if (!value) return undefined;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function isSearchActive(filters: ArchiveFilterState): boolean {
  return Boolean(filters.searchText?.trim() || filters.keywordConditions?.some((condition) => condition.value.trim()));
}

function filterPatch(filters: ArchiveFilterState, patch: Partial<ArchiveFilterState>): Partial<ReviewQueryState> {
  return { filters: { ...cloneFilters(filters), ...patch }, searchText: "" };
}

export function optionIsSelected(
  filters: ArchiveFilterState,
  key: "primaryCategories" | "secondaryCategories",
  value: string,
): boolean {
  const mode: ArchiveFilterMode = filters.filterMode === "exclude" ? "exclude" : "include";
  const selected = new Set([
    ...(filters[key] ?? []),
    ...(key === "secondaryCategories" ? filters.eventTypes ?? [] : []),
  ]);
  const hasExplicitSelection = key === "secondaryCategories"
    ? filters.secondaryCategories !== undefined || filters.eventTypes !== undefined
    : filters.primaryCategories !== undefined;
  if (mode === "include" && !hasExplicitSelection) return true;
  return selected.has(value);
}

export function selectionPatch(
  filters: ArchiveFilterState,
  key: "primaryCategories" | "secondaryCategories",
  value: string,
  options: readonly { value: string; label: string }[],
): Partial<ArchiveFilterState> {
  const mode: ArchiveFilterMode = filters.filterMode === "exclude" ? "exclude" : "include";
  const allValues = options.map((option) => option.value);
  const current = new Set([
    ...(filters[key] ?? []),
    ...(key === "secondaryCategories" ? filters.eventTypes ?? [] : []),
  ]);
  const hasExplicitSelection = key === "secondaryCategories"
    ? filters.secondaryCategories !== undefined || filters.eventTypes !== undefined
    : filters.primaryCategories !== undefined;
  if (mode === "include" && !hasExplicitSelection) allValues.forEach((item) => current.add(item));
  if (current.has(value)) current.delete(value);
  else current.add(value);
  const next = allValues.filter((item) => current.has(item));
  const normalized = mode === "include"
    ? next.length === allValues.length ? undefined : next
    : next.length === 0 ? undefined : next;
  return key === "secondaryCategories"
    ? { secondaryCategories: normalized, eventTypes: undefined }
    : { primaryCategories: normalized };
}

/** 回看分类的快捷操作只修改当前分类集合，始终保留当前的包含/排除模式。 */
export function areAllReviewCategoriesEnabled(filters: ArchiveFilterState): boolean {
  const mode: ArchiveFilterMode = filters.filterMode === "exclude" ? "exclude" : "include";
  const allSelected = (values: readonly string[] | undefined, options: readonly { value: string; label: string }[]) => {
    if (mode === "include" && values === undefined) return true;
    if (values === undefined) return false;
    const selected = new Set(values);
    return options.every((option) => selected.has(option.value));
  };
  return allSelected(filters.primaryCategories, CATEGORY_OPTIONS);
}

export function setAllReviewCategories(filters: ArchiveFilterState, enabled: boolean): ArchiveFilterState {
  const mode: ArchiveFilterMode = filters.filterMode === "exclude" ? "exclude" : "include";
  const allPrimary = CATEGORY_OPTIONS.map((option) => option.value);
  return {
    ...cloneFilters(filters),
    filterMode: filters.filterMode,
    primaryCategories: enabled
      ? mode === "exclude" ? allPrimary : undefined
      : mode === "include" ? [] : undefined,
  };
}

export function filterConditionCount(filters: ArchiveFilterState, keywordCount: number): number {
  return keywordCount
    + (filters.primaryCategories !== undefined ? 1 : 0)
    + (filters.secondaryCategories !== undefined || filters.eventTypes !== undefined ? 1 : 0)
    + (filters.userUid ? 1 : 0)
    + (filters.userIdentity ? 1 : 0)
    + (filters.fanMedal ? 1 : 0)
    + (filters.giftPriceMinRmb !== undefined || filters.giftPriceMaxRmb !== undefined ? 1 : 0)
    + (filters.favoriteOnly ? 1 : 0)
    + (filters.showBigEmote === false ? 1 : 0)
    + (filters.fromTs !== undefined || filters.toTs !== undefined ? 1 : 0);
}

export function advancedFilterConditionCount(filters: ArchiveFilterState): number {
  return (filters.primaryCategories !== undefined ? 1 : 0)
    + (filters.secondaryCategories !== undefined || filters.eventTypes !== undefined ? 1 : 0)
    + (filters.userIdentity ? 1 : 0)
    + (filters.fanMedal ? 1 : 0)
    + (filters.giftPriceMinRmb !== undefined || filters.giftPriceMaxRmb !== undefined ? 1 : 0)
    + (filters.fromTs !== undefined || filters.toTs !== undefined ? 1 : 0);
}

function IconChevronDown({ open }: { open: boolean }) {
  return (
    <LucideChevronDown className={["size-3 transition-transform", open ? "rotate-180" : ""].join(" ")} aria-hidden="true" />
  );
}

export function ReviewFilterSubmenu({
  label,
  active,
  filterMode,
  options,
  isSelected,
  onPrimaryToggle,
  onToggle,
}: {
  label: string;
  active: boolean;
  filterMode: ArchiveFilterMode;
  options: readonly { value: string; label: string }[];
  isSelected: (value: string) => boolean;
  onPrimaryToggle: () => void;
  onToggle: (value: string) => void;
}) {
  useUiLanguage();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef(false);
  const suppressFocusOpenRef = useRef(false);
  const entryFocusRef = useRef<"first" | "last" | null>(null);
  const unregisterSubmenuRef = useRef<(() => void) | null>(null);
  const submenuLayer = useContext(ReviewFilterSubmenuLayerContext);
  const focusEntry = useCallback(() => {
    if (!entryFocusRef.current || !submenuRef.current) return;
    const items = submenuRef.current.querySelectorAll<HTMLButtonElement>('[role="menuitemcheckbox"]');
    const item = entryFocusRef.current === "first" ? items[0] : items[items.length - 1];
    if (!item) return;
    entryFocusRef.current = null;
    item.focus({ preventScroll: true });
  }, []);
  const setSubmenuRef = useCallback((element: HTMLDivElement | null) => {
    unregisterSubmenuRef.current?.();
    unregisterSubmenuRef.current = null;
    submenuRef.current = element;
    if (element) {
      unregisterSubmenuRef.current = submenuLayer?.registerSubmenu(element) ?? null;
      focusEntry();
    }
  }, [submenuLayer, focusEntry]);
  const closeWhenFocusLeaves = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)
      && !submenuRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
    <div
      className="relative flex h-8 items-center"
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={(event) => { if (!submenuRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false); }}
      onFocus={() => { if (suppressFocusOpenRef.current) suppressFocusOpenRef.current = false; else setOpen(true); }}
      onBlur={closeWhenFocusLeaves}
    >
      <PopoverAnchor asChild>
      <Button variant="outline"
        ref={triggerRef}
        type="button"
        aria-pressed={active}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={onPrimaryToggle}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          entryFocusRef.current = event.key === "ArrowUp" || event.key === "End" ? "last" : "first";
          if (open) focusEntry();
          else setOpen(true);
        }}
        className={`${toggleClass} inline-flex h-8 items-center gap-1 ${active ? filterMode === "include" ? "border-accent bg-accent-subtle font-medium text-accent-text" : "border-danger/60 bg-danger/10 font-medium text-danger" : "border-line bg-bg text-t2 hover:border-accent/50 hover:bg-raised hover:text-t1"}`}
      >
        {label}
        <IconChevronDown open={open} />
      </Button>
      </PopoverAnchor>

        <PopoverContent
          ref={setSubmenuRef}
          data-ui-overlay="true"
          align="start"
          sideOffset={0}
          collisionPadding={8}
          onOpenAutoFocus={(event) => { event.preventDefault(); focusEntry(); }}
          onEscapeKeyDown={() => { restoreFocusRef.current = true; }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (restoreFocusRef.current) {
              restoreFocusRef.current = false;
              suppressFocusOpenRef.current = document.activeElement !== triggerRef.current;
              triggerRef.current?.focus({ preventScroll: true });
            }
          }}
          onPointerLeave={(event) => { if (!triggerRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false); }}
          onBlur={closeWhenFocusLeaves}
          onKeyDown={(event) => {
            const items = Array.from(submenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemcheckbox"]') ?? []);
            const current = items.indexOf(document.activeElement as HTMLButtonElement);
            const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
              : event.key === "ArrowDown" ? Math.min(items.length - 1, current + 1)
                : event.key === "ArrowUp" ? Math.max(0, current - 1) : -1;
            if (next >= 0) { event.preventDefault(); items[next]?.focus(); }
          }}
          className="ui-motion-enter z-50 pt-1"
        >
          <div role="menu" aria-label={uiText("reviewSearchControls.aria_label", { label: label })} className="min-w-32 overflow-y-auto rounded-md border border-line bg-surface p-1 shadow-lg shadow-black/20" style={{ maxHeight: "var(--radix-popover-content-available-height)" }}>
            {options.map((option) => {
              const checked = isSelected(option.value);
              return (
                <Button variant="outline"
                  key={option.value}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={checked}
                  onClick={() => onToggle(option.value)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left ui-type-control text-t2 transition-colors hover:bg-raised hover:text-t1 focus-visible:bg-raised focus-visible:outline-none"
                >
                  <span className={checked ? filterMode === "include" ? "size-1.5 rounded-full bg-accent" : "size-1.5 rounded-full bg-danger" : "size-1.5 rounded-full border border-line"} aria-hidden="true" />
                  {option.label}
                </Button>
              );
            })}
          </div>
        </PopoverContent>

    </div>
    </Popover>
  );
}

export function ReviewAdvancedFilters({
  level,
  filters,
  searchScope,
  onChangeFilters,
  onChangeSearchScope,
}: {
  level: "session" | "owner";
  filters: ArchiveFilterState;
  searchScope?: ArchiveSearchScope;
  onChangeFilters: (filters: ArchiveFilterState) => void;
  onChangeSearchScope?: (scope: ArchiveSearchScope) => void;
}) {
  useUiLanguage();
  const [datePreset, setDatePreset] = useState<DatePreset>(() => getReviewDatePreset(filters));
  const filterMode: ArchiveFilterMode = filters.filterMode === "exclude" ? "exclude" : "include";
  const visibleDatePreset: DatePreset = [
    "all", "2m", "5m", "20m", "1h", "2h", "12h", "1d", "1w", "1mo",
    "today", "yesterday", "week", "lastWeek", "month", "lastMonth", "custom",
  ].includes(datePreset) ? datePreset : "custom";

  useEffect(() => {
    setDatePreset(getReviewDatePreset(filters));
  }, [filters.fromTs, filters.toTs]);

  const updateFilters = (patch: Partial<ArchiveFilterState>) => {
    onChangeFilters({ ...cloneFilters(filters), ...patch });
  };

  const setRange = (value: DatePreset) => {
    setDatePreset(value);
    if (value === "custom") return;
    if (value === "all") {
      updateFilters({ fromTs: undefined, toTs: undefined });
      return;
    }
    updateFilters(getReviewDateRange(value));
  };

  const setGiftPrice = (key: "giftPriceMinRmb" | "giftPriceMaxRmb", value: string) => {
    const normalized = value.trim() === "" ? undefined : Number(value);
    updateFilters({ [key]: normalized !== undefined && Number.isFinite(normalized) && normalized >= 0 ? normalized : undefined });
  };

  const changeFilterMode = (nextMode: ArchiveFilterMode) => {
    if (nextMode === filterMode) return;
    onChangeFilters(switchReviewFilterMode(
      filters,
      nextMode,
      CATEGORY_OPTIONS.map((option) => option.value),
      [...GIFT_TYPE_OPTIONS, ...INTERACT_TYPE_OPTIONS].map((option) => option.value),
    ));
  };

  const toggleFilterOption = (
    key: "primaryCategories" | "secondaryCategories",
    value: string,
    options: readonly { value: string; label: string }[],
  ) => updateFilters(selectionPatch(filters, key, value, options));

  return (
    <>
      <div className="review-filter-advanced-section review-filter-category-section" aria-label={uiText("reviewSearchControls.aria_label2")}>
        <span className="ui-type-meta text-t3">{uiText("reviewSearchControls.ReviewAdvancedFilters")}</span>
        <Button variant="outline"
          type="button"
          aria-label={areAllReviewCategoriesEnabled(filters) ? uiText("reviewSearchControls.aria_label3") : uiText("reviewSearchControls.aria_label4")}
          className={`${toggleClass} ${areAllReviewCategoriesEnabled(filters) ? "border-accent bg-accent-subtle text-accent-text" : "border-line bg-bg text-t2 hover:border-accent/50 hover:bg-raised hover:text-t1"}`}
          onClick={() => onChangeFilters(setAllReviewCategories(filters, !areAllReviewCategoriesEnabled(filters)))}
        >{areAllReviewCategoriesEnabled(filters) ? uiText("reviewSearchControls.ReviewAdvancedFilters2") : uiText("common.selectAll")}</Button>
        <div className="inline-flex rounded-md border border-line bg-bg p-0.5" aria-label={uiText("reviewSearchControls.aria_label5")}>
          {(["include", "exclude"] as const).map((mode) => (
            <Button variant="outline" key={mode} type="button" aria-pressed={filterMode === mode} className={`rounded px-2 py-0.5 ui-type-meta transition-colors ${filterMode === mode ? mode === "include" ? "bg-accent-subtle text-accent-text" : "bg-danger/10 text-danger" : "text-t3 hover:text-t1"}`} onClick={() => changeFilterMode(mode)}>
              {mode === "include" ? uiText("reviewSearchControls.ReviewAdvancedFilters3") : uiText("reviewSearchControls.ReviewAdvancedFilters4")}
            </Button>
          ))}
        </div>
        <span aria-hidden="true" className="mx-1 h-4 w-px bg-line" />
        {CATEGORY_OPTIONS.map((option) => {
          const active = optionIsSelected(filters, "primaryCategories", option.value);
          if (option.value === "interact" || option.value === "gift") {
            const submenuOptions = option.value === "interact" ? INTERACT_TYPE_OPTIONS : GIFT_TYPE_OPTIONS;
            return (
              <ReviewFilterSubmenu
                key={option.value}
                label={option.label}
                active={active}
                filterMode={filterMode}
                options={submenuOptions}
                isSelected={(value) => optionIsSelected(filters, "secondaryCategories", value)}
                onPrimaryToggle={() => toggleFilterOption("primaryCategories", option.value, CATEGORY_OPTIONS)}
                onToggle={(value) => toggleFilterOption("secondaryCategories", value, SECONDARY_OPTIONS)}
              />
            );
          }
          return <Button variant="outline" key={option.value} type="button" aria-pressed={active} className={`${toggleClass} ${active ? filterMode === "include" ? "border-accent bg-accent-subtle text-accent-text" : "border-danger/60 bg-danger/10 text-danger" : "border-line bg-bg text-t2 hover:border-accent/50 hover:bg-raised hover:text-t1"}`} onClick={() => toggleFilterOption("primaryCategories", option.value, CATEGORY_OPTIONS)}>{active ? (filterMode === "include" ? "✓ " : "− ") : ""}{option.label}</Button>;
        })}
      </div>

      <div className="review-filter-advanced-grid">
        <div className="review-filter-advanced-section review-filter-advanced-group" aria-label={uiText("reviewSearchControls.aria_label6")}>
          <h3 className="review-filter-advanced-group-title ui-type-control text-t1">{uiText("reviewSearchControls.ReviewAdvancedFilters5")}</h3>
          <div className="review-filter-advanced-controls">
            <label className="flex items-center gap-1 ui-type-meta text-t2">
              <span>{uiText("reviewSearchControls.ReviewAdvancedFilters6")}</span>
              <UiSelect
                ariaLabel={uiText("reviewSearchControls.ariaLabel2")}
                options={USER_IDENTITY_OPTIONS}
                value={filters.userIdentity ?? ""}
                onValueChange={(value) => updateFilters({ userIdentity: (value || undefined) as ArchiveUserIdentity | undefined })}
              />
            </label>
            <label className="flex items-center gap-1 ui-type-meta text-t2">
              <span>{uiText("reviewSearchControls.ReviewAdvancedFilters7")}</span>
              <UiSelect
                ariaLabel={uiText("reviewSearchControls.ariaLabel3")}
                options={FAN_MEDAL_OPTIONS}
                value={filters.fanMedal ?? ""}
                onValueChange={(value) => updateFilters({ fanMedal: (value || undefined) as ArchiveFanMedalFilter | undefined })}
              />
            </label>
          </div>
        </div>

        <div className="review-filter-advanced-section review-filter-advanced-group" aria-label={uiText("reviewSearchControls.aria_label7")}>
          <h3 className="review-filter-advanced-group-title ui-type-control text-t1">{uiText("reviewSearchControls.ReviewAdvancedFilters8")}</h3>
          <div className="review-filter-advanced-controls">
            <UiSelect
              ariaLabel={uiText("reviewSearchControls.ariaLabel4")}
              options={[{ value: "unit", label: uiText("reviewSearchControls.options.label") }, { value: "cumulative", label: uiText("reviewSearchControls.options.label2") }]}
              value={filters.giftPriceMode ?? "unit"}
              onValueChange={(value) => updateFilters({ giftPriceMode: value as ArchiveGiftPriceMode })}
            />
            <div className="review-filter-price-range">
              <Input type="number" min="0" step="0.01" aria-label={uiText("reviewSearchControls.aria_label8")} placeholder={uiText("reviewSearchControls.placeholder")} className={`${inputClass} w-20`} value={filters.giftPriceMinRmb ?? ""} onChange={(event) => setGiftPrice("giftPriceMinRmb", event.target.value)} />
              <span className="ui-type-meta text-t3">{uiText("reviewSearchControls.ReviewAdvancedFilters9")}</span>
              <Input type="number" min="0" step="0.01" aria-label={uiText("reviewSearchControls.aria_label9")} placeholder={uiText("reviewSearchControls.placeholder2")} className={`${inputClass} w-20`} value={filters.giftPriceMaxRmb ?? ""} onChange={(event) => setGiftPrice("giftPriceMaxRmb", event.target.value)} />
              <span className="ui-type-meta text-t3">{uiText("reviewSearchControls.ReviewAdvancedFilters10")}</span>
            </div>
            {(filters.giftPriceMinRmb !== undefined || filters.giftPriceMaxRmb !== undefined) && <span className="ui-type-meta text-t3">{uiText("reviewSearchControls.ReviewAdvancedFilters11")}</span>}
          </div>
        </div>
      </div>

      <div className={`review-filter-advanced-grid ${level === "session" ? "review-filter-time-scope-grid" : ""}`}>
        <div className={`review-filter-advanced-section ${level === "owner" ? "review-filter-time-full" : ""}`} aria-label={uiText("reviewSearchControls.aria_label10")}>
          <label className="flex items-center gap-1 ui-type-meta text-t2">
            <span>{uiText("reviewSearchControls.ReviewAdvancedFilters12")}</span>
            <UiSelect
              ariaLabel={uiText("reviewSearchControls.ariaLabel5")}
              options={REVIEW_DATE_OPTIONS}
              value={visibleDatePreset}
              onValueChange={(value) => setRange(value as DatePreset)}
            />
          </label>
          {(datePreset === "custom" || filters.fromTs !== undefined || filters.toTs !== undefined) && (
            <>
              <label className="flex items-center gap-1 ui-type-meta text-t2">
                <span>{uiText("reviewSearchControls.ReviewAdvancedFilters13")}</span>
                <DateTimeField label={uiText("reviewSearchControls.aria_label11")} value={filters.fromTs === undefined ? undefined : new Date(filters.fromTs)} onChange={date => updateFilters({ fromTs: date?.getTime() })} />
              </label>
              <label className="flex items-center gap-1 ui-type-meta text-t2">
                <span>{uiText("reviewSearchControls.ReviewAdvancedFilters14")}</span>
                <DateTimeField label={uiText("reviewSearchControls.aria_label12")} value={filters.toTs === undefined ? undefined : new Date(filters.toTs)} onChange={date => updateFilters({ toTs: date?.getTime() })} />
              </label>
            </>
          )}
        </div>
        {level === "session" && (
          <div className="review-filter-advanced-section" aria-label={uiText("reviewSearchControls.aria_label13")}>
            <label className="flex items-center gap-1 ui-type-meta text-t2">
              <span>{uiText("reviewSearchControls.ReviewAdvancedFilters15")}</span>
              <UiSelect
                ariaLabel={uiText("reviewSearchControls.ariaLabel6")}
                options={[{ value: "session", label: uiText("reviewSearchControls.options.label3") }, { value: "owner", label: uiText("reviewSearchControls.options.label4") }]}
                value={searchScope === "owner" ? "owner" : "session"}
                onValueChange={(value) => onChangeSearchScope?.(value as ArchiveSearchScope)}
              />
            </label>
          </div>
        )}
      </div>
    </>
  );
}

export function loadReviewSearchHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(REVIEW_SEARCH_HISTORY_KEY) ?? "null");
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 8)
      : [];
  } catch {
    return [];
  }
}

export function keywordFieldLabel(field: ArchiveKeywordField): string {
  return KEYWORD_FIELDS.find((option) => option.value === field)?.label
    ?? (field === "nickname" ? uiText("reviewSearchControls.keywordFieldLabel") : field);
}

export function ReviewFilterPresetMenu({
  presets,
  activePresetId,
  onApply,
  onSave,
  onRename,
  onDelete,
}: {
  presets: readonly ReviewFilterPreset[];
  activePresetId: string | null;
  onApply: (preset: ReviewFilterPreset) => void;
  onSave: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  useUiLanguage();
  const [addOpen, setAddOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const addTriggerRef = useRef<HTMLButtonElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const [addMenuPosition, setAddMenuPosition] = useState<{ top: number; left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    if (!addOpen) {
      setAddMenuPosition(null);
      return;
    }
    const syncPosition = () => {
      const trigger = addTriggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const margin = 8;
      const width = Math.min(288, Math.max(0, window.innerWidth - margin * 2));
      const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin));
      const estimatedHeight = 56;
      const below = rect.bottom + 6;
      const top = below + estimatedHeight <= window.innerHeight - margin
        ? below
        : Math.max(margin, rect.top - estimatedHeight - 6);
      setAddMenuPosition({ top, left, width });
    };
    syncPosition();
    window.addEventListener("resize", syncPosition);
    window.addEventListener("scroll", syncPosition, true);
    return () => {
      window.removeEventListener("resize", syncPosition);
      window.removeEventListener("scroll", syncPosition, true);
    };
  }, [addOpen]);

  useEffect(() => {
    if (!addOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (addTriggerRef.current?.contains(target) || addMenuRef.current?.contains(target)) return;
      setAddOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [addOpen]);

  const saveCurrent = () => {
    if (!nameDraft.trim()) return;
    onSave(nameDraft);
    setNameDraft("");
    setAddOpen(false);
    setManageOpen(false);
  };

  const deleteCurrent = (id: string) => {
    onDelete(id);
    if (presets.length <= 1) {
      setManageOpen(false);
    }
  };

  const commitRename = (id: string) => {
    if (!editingName.trim()) return;
    onRename(id, editingName);
    setEditingId(null);
    setEditingName("");
  };

  return (
    <div className="relative flex min-w-0 flex-wrap items-center gap-1.5">
      {presets.map((preset) => {
        const active = preset.id === activePresetId;
        return (
        <div key={preset.id} className={`review-filter-preset-chip inline-flex min-w-0 items-center rounded-md border ${manageOpen ? "border-danger/40 bg-danger/5" : active ? "border-accent bg-accent-subtle" : "border-line bg-bg"}`}>
          {editingId === preset.id ? (
            <>
              <label className="sr-only" htmlFor={`review-filter-preset-edit-${preset.id}`}>{uiText("reviewSearchControls.ReviewFilterPresetMenu")}</label>
              <Input id={`review-filter-preset-edit-${preset.id}`} value={editingName} maxLength={40} className={`${inputClass} min-w-0 w-28 border-0 bg-transparent`} onChange={(event) => setEditingName(event.target.value)} onKeyDown={(event) => { if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return; if (event.key === "Enter") { event.preventDefault(); commitRename(preset.id); } if (event.key === "Escape") { setEditingId(null); setEditingName(""); } }} autoFocus />
              <Button variant="outline" type="button" className="shrink-0 rounded px-1.5 py-1 ui-type-meta text-accent-text hover:bg-accent-subtle" onClick={() => commitRename(preset.id)}>{uiText("common.save")}</Button>
            </>
          ) : (
            <>
              <Button variant="outline" type="button" aria-pressed={active} className={`min-w-0 max-w-32 truncate rounded px-2 py-1 text-left ui-type-control ${active ? "text-accent-text" : "text-t2 hover:text-accent-text"}`} title={uiText("reviewSearchControls.title", { name: preset.name })} onClick={() => { onApply(preset); setManageOpen(false); }}>{preset.name}</Button>
              {manageOpen && <>
                <Button variant="outline" type="button" className="shrink-0 rounded px-1 py-1 ui-type-meta text-t3 hover:bg-raised hover:text-t1" aria-label={uiText("reviewSearchControls.aria_label14", { name: preset.name })} onClick={() => { setEditingId(preset.id); setEditingName(preset.name); }}>{uiText("reviewSearchControls.ReviewFilterPresetMenu2")}</Button>
                <Button variant="outline" type="button" className="shrink-0 rounded px-1.5 py-1 text-t2 hover:bg-danger/10 hover:text-danger" aria-label={uiText("reviewSearchControls.aria_label15", { name: preset.name })} onClick={() => deleteCurrent(preset.id)}>
                  <LucideX className="size-3" aria-hidden="true" />
                </Button>
              </>}
            </>
          )}
        </div>
        );
      })}
      <span className="review-filter-preset-divider" aria-hidden="true" />
      <Button variant="outline"
        ref={addTriggerRef}
        type="button"
        aria-expanded={addOpen}
        aria-controls="review-filter-add-menu"
        className={`${toggleClass} border-line bg-bg text-t2 hover:border-accent/50 hover:bg-raised hover:text-t1`}
        onClick={() => setAddOpen((value) => !value)}
      >{uiText("reviewSearchControls.ReviewFilterPresetMenu3")}</Button>
      <Button variant="outline"
        type="button"
        aria-pressed={manageOpen}
        disabled={presets.length === 0}
        className={`${toggleClass} ${manageOpen ? "border-accent bg-accent-subtle text-accent-text enabled:hover:border-accent enabled:hover:bg-accent/15" : "border-line bg-bg text-t2 enabled:hover:border-accent/50 enabled:hover:bg-raised enabled:hover:text-t1"} disabled:cursor-not-allowed disabled:opacity-40`}
        onClick={() => { setManageOpen((value) => !value); setAddOpen(false); }}
      >{manageOpen ? uiText("reviewSearchControls.ReviewFilterPresetMenu4") : uiText("reviewSearchControls.ReviewFilterPresetMenu5")}</Button>
      {addOpen && addMenuPosition && createPortal(
        <div ref={addMenuRef} id="review-filter-add-menu" className="ui-motion-enter review-filter-presets-menu z-50 flex items-center gap-1.5 rounded-lg border border-line bg-surface p-2 shadow-lg shadow-black/25" role="group" aria-label={uiText("reviewSearchControls.aria_label16")} style={{ position: "fixed", top: addMenuPosition.top, left: addMenuPosition.left, width: addMenuPosition.width }}>
          <label className="sr-only" htmlFor="review-filter-preset-name">{uiText("reviewSearchControls.ReviewFilterPresetMenu6")}</label>
          <Input id="review-filter-preset-name" value={nameDraft} maxLength={40} placeholder={uiText("reviewSearchControls.placeholder3")} className={`${inputClass} min-w-0 flex-1`} onChange={(event) => setNameDraft(event.target.value)} onKeyDown={(event) => { if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return; if (event.key === "Enter") { event.preventDefault(); saveCurrent(); } }} autoFocus />
          <Button variant="outline" type="button" disabled={!nameDraft.trim()} className={`${toggleClass} shrink-0 border-accent/60 bg-accent-subtle text-accent-text disabled:opacity-50`} onClick={saveCurrent}>{uiText("common.save")}</Button>
        </div>,
        document.body,
      )}
    </div>
  );
}

export function ReviewSearchControls({ level, query, onChange, onClearSearch, onClearFilters, onReplaceFilters, collapsed, onCollapsedChange, activeUserFilter, onClearUserFilter }: ReviewSearchControlsProps) {
  const uiLanguage = useUiLanguage();
  const [keywordField, setKeywordField] = useState<ArchiveKeywordField>("content");
  const [keywordDraft, setKeywordDraft] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>(loadReviewSearchHistory);
  const [localFiltersCollapsed, setLocalFiltersCollapsed] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const filtersCollapsed = collapsed ?? localFiltersCollapsed;
  const advancedTriggerRef = useRef<HTMLButtonElement>(null);
  const filterShellRef = useRef<HTMLElement>(null);
  const [filterPresets, setFilterPresets] = useState<ReviewFilterPreset[]>(loadReviewFilterPresets);
  const filters = query.filters;
  const activePresetId = filterPresets.find((preset) => isReviewFilterPresetActive(preset, filters))?.id ?? null;
  const keywordConditions = useMemo(() => filters.keywordConditions ?? [], [filters.keywordConditions]);
  const suggestionOptions = useMemo(() => mergeComboboxOptions(recentSearches, SEARCH_SUGGESTIONS), [recentSearches, uiLanguage]);
  const legacyKeywordOperator: ArchiveKeywordOperator = filters.keywordOperator === "or" ? "or" : "and";
  const searchActive = isSearchActive(filters);
  const conditionCount = filterConditionCount(filters, keywordConditions.length) + (filters.searchText?.trim() ? 1 : 0);

  const setFiltersCollapsed = (next: boolean) => {
    if (onCollapsedChange) onCollapsedChange(next);
    else setLocalFiltersCollapsed(next);
  };

  useEffect(() => {
    if (filtersCollapsed) setAdvancedOpen(false);
  }, [filtersCollapsed]);

  useEffect(() => {
    saveReviewFilterPresets(filterPresets);
  }, [filterPresets]);

  const updateFilters = (patch: Partial<ArchiveFilterState>) => onChange(filterPatch(filters, patch));

  const addKeyword = () => {
    const value = keywordDraft.trim();
    if (!value) return;
    const next: ArchiveKeywordCondition[] = keywordConditions.map((condition, index) => ({
      ...condition,
      join: index === 0 ? undefined : getArchiveKeywordJoin(condition, index, legacyKeywordOperator),
    }));
    next.push({ field: keywordField, value, ...(next.length > 0 ? { join: legacyKeywordOperator } : {}) });
    updateFilters({ keywordConditions: next, keywordOperator: undefined, searchText: undefined });
    setRecentSearches((current) => {
      const updated = [value, ...current.filter((item) => item !== value)].slice(0, 8);
      try {
        window.localStorage.setItem(REVIEW_SEARCH_HISTORY_KEY, JSON.stringify(updated));
      } catch {
        // 本地存储不可用时仍保留当前组件内的最近搜索。
      }
      return updated;
    });
    setKeywordDraft("");
  };

  const onKeywordKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      addKeyword();
    }
  };

  const removeKeyword = (index: number) => {
    const next = keywordConditions
      .filter((_, itemIndex) => itemIndex !== index)
      .map((condition, itemIndex) => ({
        ...condition,
        join: itemIndex === 0 ? undefined : getArchiveKeywordJoin(condition, itemIndex, legacyKeywordOperator),
      }));
    updateFilters({ keywordConditions: next.length > 0 ? next : undefined, keywordOperator: undefined });
  };

  const setKeywordJoin = (index: number, join: ArchiveKeywordOperator) => {
    if (index <= 0 || index >= keywordConditions.length) return;
    const next = keywordConditions.map((condition, itemIndex) => ({
      ...condition,
      join: itemIndex === 0 ? undefined : itemIndex === index ? join : getArchiveKeywordJoin(condition, itemIndex, legacyKeywordOperator),
    }));
    updateFilters({ keywordConditions: next, keywordOperator: undefined });
  };

  const applyQuickCondition = (value: ReviewQuickConditionId) => {
    updateFilters(applyReviewQuickCondition(filters, value));
  };

  const savePreset = (name: string) => {
    const preset = createReviewFilterPreset(name, filters);
    if (!preset) return;
    recordArchiveDiagnostic("setting-change", "review-filter-preset", "saved", { data: { operation: "save", nameLength: preset.name.length } });
    setFilterPresets((current) => appendReviewFilterPreset(current, preset));
  };

  const renamePreset = (id: string, name: string) => {
    recordArchiveDiagnostic("setting-change", "review-filter-preset", "renamed", { data: { operation: "rename", presetId: id, nameLength: name.trim().length } });
    setFilterPresets((current) => renameReviewFilterPreset(current, id, name));
  };

  const deletePreset = (id: string) => {
    recordArchiveDiagnostic("setting-change", "review-filter-preset", "deleted", { data: { operation: "delete", presetId: id } });
    setFilterPresets((current) => removeReviewFilterPreset(current, id));
  };

  const applyPreset = (preset: ReviewFilterPreset) => {
    recordArchiveDiagnostic("query", "review-filter-preset", "applied", { data: { operation: "apply", presetId: preset.id } });
    if (onReplaceFilters) onReplaceFilters(preset.filters);
    else onChange({ filters: cloneFilters(preset.filters), searchText: "" });
  };

  return (
    <>
    <ReviewFilterShell
      ariaLabel={uiText("reviewSearchControls.ariaLabel7")}
      contentId={`review-filter-content-${level}`}
      conditionCount={conditionCount}
      collapsed={filtersCollapsed}
      onCollapsedChange={setFiltersCollapsed}
      onClear={onClearFilters ?? (() => onChange({ filters: {}, searchText: "" }))}
      shellRef={filterShellRef}
      dataAttributes={{ "data-review-search-controls": "" }}
      headerActions={activeUserFilter && onClearUserFilter ? (
        <div className="flex min-w-0 items-center gap-1.5" data-review-user-filter>
          <span className="max-w-48 truncate ui-type-meta text-t2" title={activeUserFilter.name}>{uiText("reviewSearchControls.headerActions")}{activeUserFilter.name}</span>
          <Button variant="outline" type="button" aria-label={uiText("reviewSearchControls.aria_label17")} className={compactFilterActionButtonClass} onClick={onClearUserFilter}>{uiText("reviewSearchControls.headerActions2")}</Button>
        </div>
      ) : undefined}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <UiSelect
          id="review-keyword-field"
          ariaLabel={uiText("reviewSearchControls.ariaLabel8")}
          options={KEYWORD_FIELDS}
          value={keywordField}
          onValueChange={(value) => setKeywordField(value as ArchiveKeywordField)}
        />
        <UiCombobox
          id="review-keyword-input"
          ariaLabel={uiText("reviewSearchControls.ariaLabel9")}
          placeholder={uiText("reviewSearchControls.placeholder4")}
          value={keywordDraft}
          options={suggestionOptions}
          onValueChange={setKeywordDraft}
          onKeyDown={onKeywordKeyDown}
          className="w-44 flex-1"
        />
        <Button variant="outline" type="button" className={`${toggleClass} border-line bg-bg text-t2 hover:border-accent/50 hover:bg-raised hover:text-t1`} onClick={addKeyword}>{uiText("common.add")}</Button>
        {searchActive && (
          <Button variant="outline" type="button" aria-label={uiText("reviewSearchControls.aria_label18")} className={compactFilterActionButtonClass} onClick={() => onClearSearch?.()}>{uiText("reviewSearchControls.ReviewSearchControls")}</Button>
        )}
      </div>

      {keywordConditions.length > 0 && (
        <div role="list" aria-label={uiText("reviewSearchControls.aria_label19")} className="flex flex-wrap items-center gap-1.5">
          {keywordConditions.map((condition, index) => (
            <span key={`${condition.field}:${condition.value}:${index}`} className="inline-flex items-center gap-1">
              {index > 0 && (
                <label className="inline-flex items-center gap-1 ui-type-meta text-t3">
                  <span className="sr-only">{uiText("reviewSearchControls.ReviewSearchControls2")}</span>
                  <UiSelect
                    ariaLabel={uiText("reviewSearchControls.ariaLabel", { value: index + 1 })}
                    size="micro"
                    options={[{ value: "and", label: uiText("reviewSearchControls.options.label5") }, { value: "or", label: uiText("reviewSearchControls.options.label6") }]}
                    value={getArchiveKeywordJoin(condition, index, legacyKeywordOperator)}
                    onValueChange={(value) => setKeywordJoin(index, value as ArchiveKeywordOperator)}
                    className="w-12"
                  />
                </label>
              )}
              <span role="listitem" className="inline-flex items-center gap-1 rounded-full bg-accent-subtle px-2 py-0.5 ui-type-meta text-accent-text">
                {keywordFieldLabel(condition.field)}：{condition.value}
                <Button variant="outline" type="button" aria-label={uiText("reviewSearchControls.aria_label20", { value: condition.value })} className="rounded-full px-1 text-accent-text hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring" onClick={() => removeKeyword(index)}>×</Button>
              </span>
            </span>
          ))}
        </div>
      )}

      <div className="flex min-w-0 flex-wrap items-center gap-1.5" aria-label={uiText("reviewSearchControls.aria_label21")}>
        <span className="ui-type-meta text-t3">{uiText("reviewSearchControls.ReviewSearchControls3")}</span>
        {REVIEW_QUICK_CONDITIONS.map((condition) => {
          const active = isReviewQuickConditionActive(filters, condition.value);
          return <Button variant="outline" key={condition.value} type="button" aria-pressed={active} className={`${toggleClass} ${active ? "border-accent bg-accent-subtle text-accent-text" : "border-line bg-bg text-t2 hover:border-accent/50 hover:bg-raised hover:text-t1"}`} onClick={() => applyQuickCondition(condition.value)}>{condition.label}</Button>;
        })}
        <ReviewFilterPresetMenu activePresetId={activePresetId} presets={filterPresets} onApply={applyPreset} onSave={savePreset} onRename={renamePreset} onDelete={deletePreset} />
        <span aria-hidden="true" className="review-filter-inline-divider mx-1 h-4 w-px bg-line" />
        <div aria-label={uiText("reviewSearchControls.aria_label22")} className="inline-flex">
          <Button variant="outline" type="button" aria-label={uiText("reviewSearchControls.aria_label23")} aria-pressed={filters.favoriteOnly === true} className={`${toggleClass} ${filters.favoriteOnly ? "border-accent bg-accent-subtle text-accent-text" : "border-line bg-bg text-t2 hover:border-accent/50 hover:bg-raised hover:text-t1"}`} onClick={() => updateFilters({ favoriteOnly: filters.favoriteOnly ? undefined : true })}>{uiText("reviewSearchControls.ReviewSearchControls4")}</Button>
        </div>
        <Button variant="outline"
          ref={advancedTriggerRef}
          type="button"
          aria-expanded={advancedOpen}
          aria-controls={`review-filter-advanced-${level}`}
          className={`${toggleClass} ml-auto ${advancedOpen ? "border-accent bg-accent-subtle text-accent-text" : "border-line bg-bg text-t2 hover:border-accent/50 hover:bg-raised hover:text-t1"}`}
          onClick={() => setAdvancedOpen((value) => !value)}
        >{uiText("reviewSearchControls.ReviewSearchControls5")}{advancedFilterConditionCount(filters) > 0 ? ` · ${advancedFilterConditionCount(filters)}` : ""}</Button>
      </div>

    </ReviewFilterShell>

      <ReviewFilterPopover open={!filtersCollapsed && advancedOpen} onOpenChange={setAdvancedOpen} anchorRef={filterShellRef} triggerRef={advancedTriggerRef}>
        <ReviewAdvancedFilters
          level={level}
          filters={filters}
          searchScope={query.searchScope}
          onChangeFilters={(nextFilters) => onChange({ filters: nextFilters, searchText: "" })}
          onChangeSearchScope={(searchScope) => onChange({ searchScope })}
        />
      </ReviewFilterPopover>
    </>
  );
}
