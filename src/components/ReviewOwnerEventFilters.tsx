import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type {
  ArchiveFilterState,
  ArchiveKeywordCondition,
  ArchiveKeywordField,
  ArchiveKeywordOperator,
  ReviewOwnerEventQuery,
  ReviewOwnerEventQueryPatch,
} from "../archive/archiveTypes.ts";
import { getArchiveKeywordJoin } from "../archive/archiveTypes.ts";
import { recordArchiveDiagnostic } from "../archive/archiveDiagnostics.ts";
import {
  appendReviewFilterPreset,
  applyReviewQuickCondition,
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
import {
  cloneFilters,
  filterConditionCount,
  KEYWORD_FIELDS,
  keywordFieldLabel,
  loadReviewSearchHistory,
  advancedFilterConditionCount,
  ReviewAdvancedFilters,
  ReviewFilterPresetMenu,
  REVIEW_SEARCH_HISTORY_KEY,
  SEARCH_SUGGESTIONS,
} from "./ReviewSearchControls";
import { ReviewFilterShell } from "./ReviewFilterShell";
import { ReviewFilterPopover } from "./ReviewFilterPopover";
import { UiCombobox } from "./ui/Combobox";
import { UiSelect } from "./ui/Select";
import { mergeComboboxOptions } from "./ui/comboboxOptions";

const toggleClass = "inline-flex min-h-8 items-center rounded-md border px-2.5 py-1 ui-type-control transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring";
export function ReviewOwnerEventFilters({
  query,
  onChange,
  onReplaceFilters,
  onClear,
  collapsed,
  onCollapsedChange,
}: {
  query: ReviewOwnerEventQuery;
  onChange: (patch: ReviewOwnerEventQueryPatch) => void;
  onReplaceFilters: (filters: ArchiveFilterState) => void;
  onClear: () => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}) {
  const uiLanguage = useUiLanguage();
  const filters = query.filters;
  const [keywordField, setKeywordField] = useState<ArchiveKeywordField>("content");
  const [keywordDraft, setKeywordDraft] = useState("");
  const [recentSearches, setRecentSearches] = useState(loadReviewSearchHistory);
  const [moreConditionsOpen, setMoreConditionsOpen] = useState(false);
  const filterShellRef = useRef<HTMLElement>(null);
  const moreConditionsTriggerRef = useRef<HTMLButtonElement>(null);
  const [filterPresets, setFilterPresets] = useState<ReviewFilterPreset[]>(loadReviewFilterPresets);

  const keywordConditions = useMemo(() => filters.keywordConditions ?? [], [filters.keywordConditions]);
  const suggestionOptions = useMemo(() => mergeComboboxOptions(recentSearches, SEARCH_SUGGESTIONS), [recentSearches, uiLanguage]);
  const legacyKeywordOperator: ArchiveKeywordOperator = filters.keywordOperator === "or" ? "or" : "and";
  const activePresetId = filterPresets.find((preset) => isReviewFilterPresetActive(preset, filters))?.id ?? null;
  const hasConditions = filterConditionCount(filters, keywordConditions.length) > 0
    || Boolean(filters.searchText?.trim());
  const conditionCount = filterConditionCount(filters, keywordConditions.length) + (filters.searchText?.trim() ? 1 : 0);

  useEffect(() => saveReviewFilterPresets(filterPresets), [filterPresets]);

  useEffect(() => {
    if (!collapsed || !moreConditionsOpen) return;
    setMoreConditionsOpen(false);
  }, [collapsed, moreConditionsOpen]);

  const updateFilters = (patch: Partial<ArchiveFilterState>) => {
    onChange({ filters: { ...cloneFilters(filters), ...patch } });
  };

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

  const applyQuickCondition = (condition: ReviewQuickConditionId) => {
    onReplaceFilters(applyReviewQuickCondition(filters, condition));
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
    onChange({ replaceFilters: cloneFilters(preset.filters) });
  };

  return (
    <>
    <ReviewFilterShell
      ariaLabel={uiText("reviewOwnerEventFilters.ariaLabel2")}
      contentId="review-owner-event-filter-content"
      conditionCount={conditionCount}
      collapsed={collapsed}
      onCollapsedChange={onCollapsedChange}
      onClear={hasConditions ? onClear : undefined}
      shellRef={filterShellRef}
      className="review-owner-event-filters"
      dataAttributes={{ "data-review-owner-event-filters": "" }}
    >

      <div data-review-owner-event-keyword-row className="flex min-w-0 flex-wrap items-center gap-1.5">
        <UiSelect
          id="review-owner-event-keyword-field"
          ariaLabel={uiText("reviewOwnerEventFilters.ariaLabel3")}
          options={KEYWORD_FIELDS}
          value={keywordField}
          onValueChange={(value) => setKeywordField(value as ArchiveKeywordField)}
        />
        <div data-review-owner-event-keyword-input className="min-w-40 flex-1">
          <UiCombobox
            id="review-owner-event-keyword-input"
            ariaLabel={uiText("reviewOwnerEventFilters.ariaLabel4")}
            placeholder={uiText("reviewOwnerEventFilters.placeholder")}
            value={keywordDraft}
            options={suggestionOptions}
            onValueChange={setKeywordDraft}
            onKeyDown={onKeywordKeyDown}
            className="w-full"
          />
        </div>
        <button type="button" disabled={!keywordDraft.trim()} className={`${toggleClass} border-line bg-bg text-t2 enabled:hover:border-accent/50 enabled:hover:text-t1 disabled:opacity-40`} onClick={addKeyword}>{uiText("common.add")}</button>
      </div>

      {keywordConditions.length > 0 && (
        <div role="list" aria-label={uiText("reviewOwnerEventFilters.aria_label")} className="flex flex-wrap items-center gap-1.5">
          {keywordConditions.map((condition, index) => (
            <span key={`${condition.field}:${condition.value}:${index}`} className="inline-flex items-center gap-1">
              {index > 0 && (
                <label className="inline-flex items-center gap-1 ui-type-meta text-t3">
                  <span className="sr-only">{uiText("reviewOwnerEventFilters.ReviewOwnerEventFilters")}</span>
                  <UiSelect
                    ariaLabel={uiText("reviewOwnerEventFilters.ariaLabel", { value: index + 1 })}
                    size="micro"
                    options={[{ value: "and", label: uiText("reviewOwnerEventFilters.options.label") }, { value: "or", label: uiText("reviewOwnerEventFilters.options.label2") }]}
                    value={getArchiveKeywordJoin(condition, index, legacyKeywordOperator)}
                    onValueChange={(value) => setKeywordJoin(index, value as ArchiveKeywordOperator)}
                    className="w-12"
                  />
                </label>
              )}
              <span role="listitem" className="inline-flex items-center gap-1 rounded-full bg-accent-subtle px-2 py-0.5 ui-type-meta text-accent-text">
                {keywordFieldLabel(condition.field)}：{condition.value}
                <button type="button" aria-label={uiText("reviewOwnerEventFilters.aria_label2", { value: condition.value })} className="rounded-full px-1 text-accent-text hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring" onClick={() => removeKeyword(index)}>×</button>
              </span>
            </span>
          ))}
        </div>
      )}

      <div className="flex min-w-0 flex-wrap items-center gap-1.5" aria-label={uiText("reviewOwnerEventFilters.aria_label3")}>
        <span className="ui-type-meta text-t3">{uiText("reviewOwnerEventFilters.ReviewOwnerEventFilters2")}</span>
        {REVIEW_QUICK_CONDITIONS.map((condition) => {
          const active = isReviewQuickConditionActive(filters, condition.value);
          return <button key={condition.value} type="button" aria-pressed={active} className={`${toggleClass} ${active ? "border-accent bg-accent-subtle text-accent-text" : "border-line bg-bg text-t2 hover:border-accent/50 hover:text-t1"}`} onClick={() => applyQuickCondition(condition.value)}>{condition.label}</button>;
        })}
        <ReviewFilterPresetMenu activePresetId={activePresetId} presets={filterPresets} onApply={applyPreset} onSave={savePreset} onRename={renamePreset} onDelete={deletePreset} />
        <span aria-hidden="true" className="review-filter-inline-divider mx-1 h-4 w-px bg-line" />
        <button type="button" aria-label={uiText("reviewOwnerEventFilters.aria_label4")} aria-pressed={filters.favoriteOnly === true} className={`${toggleClass} ${filters.favoriteOnly ? "border-accent bg-accent-subtle text-accent-text" : "border-line bg-bg text-t2 hover:border-accent/50 hover:text-t1"}`} onClick={() => updateFilters({ favoriteOnly: filters.favoriteOnly ? undefined : true })}>{uiText("reviewOwnerEventFilters.ReviewOwnerEventFilters3")}</button>
        <button ref={moreConditionsTriggerRef} type="button" aria-expanded={moreConditionsOpen} aria-controls="review-owner-event-advanced" aria-label={uiText("reviewOwnerEventFilters.aria_label5")} className={`ml-auto ${toggleClass} ${moreConditionsOpen ? "border-accent bg-accent-subtle text-accent-text" : "border-line bg-bg text-t2 hover:border-accent/50 hover:text-t1"}`} onClick={() => setMoreConditionsOpen((current) => !current)}>
          {moreConditionsOpen ? uiText("reviewOwnerEventFilters.ReviewOwnerEventFilters4") : uiText("reviewOwnerEventFilters.ReviewOwnerEventFilters5")}
          {advancedFilterConditionCount(filters) > 0 ? ` · ${advancedFilterConditionCount(filters)}` : ""}
        </button>
      </div>

    </ReviewFilterShell>
    <ReviewFilterPopover open={!collapsed && moreConditionsOpen} onOpenChange={setMoreConditionsOpen} anchorRef={filterShellRef} triggerRef={moreConditionsTriggerRef}>
          <ReviewAdvancedFilters level="owner" filters={filters} onChangeFilters={onReplaceFilters} />
    </ReviewFilterPopover>
    </>
  );
}
