import { uiText } from "../i18n/index.ts";
import { UiSearchInput } from "./ui/SearchInput.tsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EventRowSlot } from "./EventRowSlot";
import type {
  ArchiveFavoriteItem,
  ArchiveFavoritePage,
  ArchiveFavoriteSort,
  ArchiveFavoriteTag,
  ArchiveFavoriteTagFilter,
  ArchiveOwnerSummary,
  ArchiveRepositoryContract,
  ArchiveSortDirection,
} from "../archive/archiveTypes.ts";
import type { DanmakuEvent } from "../protocol/types.ts";
import { EventRow } from "./EventRow.tsx";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { FavoriteOrganizationEditor } from "./FavoriteOrganizationEditor.tsx";
import { formatArchiveDateTime } from "../archive/archiveDisplay.ts";
import { getReviewDateRange } from "../archive/archiveState.ts";
import type { ReviewDatePreset } from "../archive/archiveState.ts";
import { shouldShowAutoDanmaku, shouldShowPhoneNotVerified } from "../eventDisplaySettings.ts";
import { useGeneralSettings } from "../generalSettings.ts";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { CATEGORY_OPTIONS } from "./ReviewSearchControls.tsx";
import { actionButtonClass, dangerActionButtonClass, filterActionButtonClass } from "./actionButtonStyles";
import { createArchiveRequestId, recordArchiveDiagnostic } from "../archive/archiveDiagnostics.ts";
import { UiSelect } from "./ui/Select";
import { createArchiveFavoriteActions } from "../archive/archiveRuntime.ts";

const PAGE_SIZE = 50;

const inputClass = "h-8 rounded-md border border-line bg-bg px-2.5 ui-type-control text-t1 outline-none focus:border-accent focus:ring-2 focus:ring-accent-ring";
const buttonClass = actionButtonClass;
const tagFilterButtonClass = "inline-flex h-7 items-center rounded-md border px-2 ui-type-control transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring";
const favoriteKeywordFieldOptions = [
  { value: "all", label: uiText("reviewFavoritesPanel.favoriteKeywordFieldOptions.label") },
  { value: "user", label: uiText("reviewFavoritesPanel.favoriteKeywordFieldOptions.label2") },
  { value: "fanMedal", label: uiText("reviewFavoritesPanel.favoriteKeywordFieldOptions.label3") },
  { value: "gift", label: uiText("reviewFavoritesPanel.favoriteKeywordFieldOptions.label4") },
  { value: "content", label: uiText("reviewFavoritesPanel.favoriteKeywordFieldOptions.label5") },
  { value: "note", label: uiText("reviewFavoritesPanel.favoriteKeywordFieldOptions.label6") },
] as const;
const favoriteTimeFieldOptions = [
  { value: "favoritedAt", label: uiText("reviewFavoritesPanel.favoriteTimeFieldOptions.label") },
  { value: "eventTs", label: uiText("reviewFavoritesPanel.favoriteTimeFieldOptions.label2") },
] as const;
const favoriteTimePresetOptions = [
  { value: "all", label: uiText("reviewFavoritesPanel.favoriteTimePresetOptions.label") },
  { value: "today", label: uiText("reviewFavoritesPanel.favoriteTimePresetOptions.label2") },
  { value: "yesterday", label: uiText("reviewFavoritesPanel.favoriteTimePresetOptions.label3") },
  { value: "1w", label: uiText("reviewFavoritesPanel.favoriteTimePresetOptions.label4") },
  { value: "1mo", label: uiText("reviewFavoritesPanel.favoriteTimePresetOptions.label5") },
  { value: "week", label: uiText("reviewFavoritesPanel.favoriteTimePresetOptions.label6") },
  { value: "lastWeek", label: uiText("reviewFavoritesPanel.favoriteTimePresetOptions.label7") },
  { value: "month", label: uiText("reviewFavoritesPanel.favoriteTimePresetOptions.label8") },
  { value: "lastMonth", label: uiText("reviewFavoritesPanel.favoriteTimePresetOptions.label9") },
  { value: "custom", label: uiText("reviewFavoritesPanel.favoriteTimePresetOptions.label10") },
] as const;
const favoriteSortOptions = favoriteTimeFieldOptions;
const favoriteDirectionOptions = [
  { value: "desc", label: uiText("reviewFavoritesPanel.favoriteDirectionOptions.label") },
  { value: "asc", label: uiText("reviewFavoritesPanel.favoriteDirectionOptions.label2") },
] as const;
const favoriteTagModeOptions = [
  { value: "any", label: uiText("reviewFavoritesPanel.favoriteTagModeOptions.label") },
  { value: "all", label: uiText("reviewFavoritesPanel.favoriteTagModeOptions.label2") },
] as const;

function eventFromItem(item: ArchiveFavoriteItem): DanmakuEvent | null {
  if (!item.event) return null;
  return {
    ...item.event,
    id: item.event.id || item.eventKey || item.stableId,
    roomId: Number.isFinite(item.event.roomId) ? item.event.roomId : item.roomId,
    ts: Number.isFinite(item.event.ts) ? item.event.ts : item.eventTs,
  };
}

function targetKey(item: ArchiveFavoriteItem): string {
  return `${item.sourceKind}:${item.stableId}`;
}

function parseDateTime(value: string): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function ReviewFavoritesPanel({
  repository,
  owners,
  active,
  refreshKey,
  onOpenFavorite,
}: {
  repository: ArchiveRepositoryContract;
  owners: readonly ArchiveOwnerSummary[];
  active: boolean;
  refreshKey: unknown;
  onOpenFavorite: (item: ArchiveFavoriteItem) => void;
}) {
  const displayPreferences = useGeneralSettings((state) => state.eventDisplayPreferences);
  const [keyword, setKeyword] = useState("");
  const [keywordField, setKeywordField] = useState<"all" | "user" | "fanMedal" | "gift" | "content" | "note">("all");
  const [ownerId, setOwnerId] = useState("");
  const [category, setCategory] = useState("");
  const [timeField, setTimeField] = useState<ArchiveFavoriteSort>("favoritedAt");
  const [timePreset, setTimePreset] = useState<ReviewDatePreset>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<ArchiveFavoriteSort>("favoritedAt");
  const [direction, setDirection] = useState<ArchiveSortDirection>("desc");
  const [advanced, setAdvanced] = useState(false);
  const [tagFilter, setTagFilter] = useState<ArchiveFavoriteTagFilter>({ names: [], mode: "any" });
  const [page, setPage] = useState<ArchiveFavoritePage>({ items: [], nextCursor: null, totalCount: null });
  const visibleItems = useMemo(() => page.items.filter(item => {
    const event = eventFromItem(item);
    return !event || (shouldShowAutoDanmaku(event, displayPreferences.showAutoDanmaku)
      && shouldShowPhoneNotVerified(event, displayPreferences.showPhoneNotVerified));
  }), [page.items, displayPreferences.showAutoDanmaku, displayPreferences.showPhoneNotVerified]);
  const [tags, setTags] = useState<ArchiveFavoriteTag[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<ArchiveFavoriteItem | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [singleRemove, setSingleRemove] = useState<ArchiveFavoriteItem | null>(null);
  const [tagBatchName, setTagBatchName] = useState("");
  const [manageTags, setManageTags] = useState(false);
  const [tagToDelete, setTagToDelete] = useState<ArchiveFavoriteTag | null>(null);
  const [tagRenameValues, setTagRenameValues] = useState<Record<number, string>>({});
  const [reloadToken, setReloadToken] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);

  const range = useMemo(() => timePreset === "custom"
    ? { fromTs: parseDateTime(from), toTs: parseDateTime(to) }
    : getReviewDateRange(timePreset), [from, timePreset, to]);
  const rangeError = timePreset === "custom"
    && range.fromTs !== undefined
    && range.toTs !== undefined
    && range.fromTs >= range.toTs
    ? uiText("reviewFavoritesPanel.ReviewFavoritesPanel.rangeError")
    : null;
  const hasActiveFilters = Boolean(
    keyword.trim()
    || ownerId
    || category
    || tagFilter.names.length > 0
    || timePreset !== "all",
  );
  const query = useMemo(() => ({
    keywordField,
    searchText: keyword.trim() || undefined,
    ownerId: ownerId || undefined,
    primaryCategories: category ? [category] : undefined,
    timeField,
    fromTs: range.fromTs,
    toTs: range.toTs,
    sort,
    direction,
    tagFilter: tagFilter.names.length > 0 ? tagFilter : undefined,
  }), [category, direction, keyword, keywordField, ownerId, range, sort, tagFilter, timeField]);
  const queryKey = JSON.stringify(query);

  const load = useCallback(async (cursor: string | null = null, append = false) => {
    const requestId = createArchiveRequestId("archive-query");
    setLoading(true);
    setError(null);
    recordArchiveDiagnostic("request", "archive-query", "started", {
      requestId,
      data: { surface: "favorites", append, includeTotal: cursor === null },
    });
    try {
      const result = await repository.queryFavorites({ ...query, cursor, limit: PAGE_SIZE, includeTotal: cursor === null });
      setPage((current) => append ? { ...result, items: [...current.items, ...result.items] } : result);
      recordArchiveDiagnostic("success", "archive-query", "completed", {
        requestId,
        count: result.items.length,
        data: { surface: "favorites", append },
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      recordArchiveDiagnostic("failure", "archive-query", "failed", {
        requestId,
        data: { surface: "favorites", append },
      });
    } finally {
      setLoading(false);
    }
  }, [query, repository]);

  useEffect(() => {
    if (!active) return;
    if (rangeError) {
      setError(rangeError);
      return;
    }
    void load();
  }, [active, load, rangeError, refreshKey, reloadToken, queryKey]);

  useEffect(() => {
    if (!active) return;
    setSelected(new Set());
  }, [active, queryKey, reloadToken]);

  useEffect(() => {
    const loadedKeys = new Set(visibleItems.map(targetKey));
    setSelected((current) => {
      const next = new Set([...current].filter((key) => loadedKeys.has(key)));
      return next.size === current.size ? current : next;
    });
  }, [visibleItems]);

  useEffect(() => {
    if (!active) return;
    const requestId = createArchiveRequestId("archive-query");
    recordArchiveDiagnostic("request", "archive-query", "started", {
      requestId,
      data: { surface: "favorite-tags" },
    });
    void repository.listFavoriteTags()
      .then((result) => {
        setTags(result);
        recordArchiveDiagnostic("success", "archive-query", "completed", {
          requestId,
          count: result.length,
          data: { surface: "favorite-tags" },
        });
      })
      .catch(() => {
        setTags([]);
        recordArchiveDiagnostic("failure", "archive-query", "failed", {
          requestId,
          data: { surface: "favorite-tags" },
        });
      });
  }, [active, refreshKey, reloadToken, repository]);

  const updateItem = (item: ArchiveFavoriteItem) => {
    setPage((current) => ({ ...current, items: current.items.map((value) => value.stableId === item.stableId && value.sourceKind === item.sourceKind ? item : value) }));
    setEditingItem(null);
    void repository.listFavoriteTags().then(setTags).catch(() => undefined);
  };
  const toggleSelected = (item: ArchiveFavoriteItem) => setSelected((current) => {
    const next = new Set(current);
    const key = targetKey(item);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const selectedItems = visibleItems.filter((item) => selected.has(targetKey(item)));
  const allLoadedSelected = visibleItems.length > 0 && visibleItems.every((item) => selected.has(targetKey(item)));
  const toggleAllLoaded = () => setSelected((current) => {
    const next = new Set(current);
    const loadedKeys = visibleItems.map(targetKey);
    if (allLoadedSelected) {
      loadedKeys.forEach((key) => next.delete(key));
    } else {
      loadedKeys.forEach((key) => next.add(key));
    }
    return next;
  });
  const removeSelected = async () => {
    const requestId = createArchiveRequestId("archive-favorite");
    setActionError(null);
    recordArchiveDiagnostic("request", "archive-favorite", "started", {
      requestId,
      count: selectedItems.length,
      data: { operation: "remove-selected", surface: "favorites" },
    });
    try {
      const result = await createArchiveFavoriteActions(repository).remove(selectedItems.map((item) => ({ sourceKind: item.sourceKind, stableId: item.stableId })));
      setActionError(result.refresh === "failed" ? uiText("reviewFavoritesPanel.ReviewFavoritesPanel.removeSelected") : null);
      setConfirmRemove(false);
      setSelected(new Set());
      recordArchiveDiagnostic("success", "archive-favorite", "removed", {
        requestId,
        count: selectedItems.length,
        data: { operation: "remove-selected", surface: "favorites" },
      });
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : String(reason));
      recordArchiveDiagnostic("failure", "archive-favorite", "failed", {
        requestId,
        count: selectedItems.length,
        data: { operation: "remove-selected", surface: "favorites" },
      });
    }
  };
  const removeSingle = async () => {
    if (!singleRemove) return;
    const requestId = createArchiveRequestId("archive-favorite");
    setActionError(null);
    recordArchiveDiagnostic("request", "archive-favorite", "started", {
      requestId,
      count: 1,
      data: { operation: "remove-single", surface: "favorites" },
    });
    try {
      const result = await createArchiveFavoriteActions(repository).remove([{ sourceKind: singleRemove.sourceKind, stableId: singleRemove.stableId }]);
      setActionError(result.refresh === "failed" ? uiText("reviewFavoritesPanel.ReviewFavoritesPanel.removeSingle") : null);
      setSingleRemove(null);
      setSelected((current) => {
        const next = new Set(current);
        next.delete(targetKey(singleRemove));
        return next;
      });
      recordArchiveDiagnostic("success", "archive-favorite", "removed", {
        requestId,
        count: 1,
        data: { operation: "remove-single", surface: "favorites" },
      });
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : String(reason));
      recordArchiveDiagnostic("failure", "archive-favorite", "failed", {
        requestId,
        count: 1,
        data: { operation: "remove-single", surface: "favorites" },
      });
    }
  };
  const addTagToSelected = async () => {
    const name = tagBatchName.trim();
    if (!name || selectedItems.length === 0) return;
    const requestId = createArchiveRequestId("archive-favorite");
    setActionError(null);
    recordArchiveDiagnostic("request", "archive-favorite", "started", {
      requestId,
      count: selectedItems.length,
      data: { operation: "add-tag", surface: "favorites" },
    });
    try {
      if (!tags.some((tag) => tag.name === name)) await repository.createFavoriteTag(name);
      await repository.batchUpdateFavoriteOrganization(selectedItems.map((item) => ({
        target: { sourceKind: item.sourceKind, stableId: item.stableId },
        note: item.note,
        tags: [...new Set([...item.tags, name])],
      })));
      setTagBatchName("");
      setSelected(new Set());
      setReloadToken((value) => value + 1);
      recordArchiveDiagnostic("success", "archive-favorite", "updated", {
        requestId,
        count: selectedItems.length,
        data: { operation: "add-tag", surface: "favorites" },
      });
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : String(reason));
      recordArchiveDiagnostic("failure", "archive-favorite", "failed", {
        requestId,
        count: selectedItems.length,
        data: { operation: "add-tag", surface: "favorites" },
      });
    }
  };
  const removeTagFromSelected = async (name: string) => {
    if (!name || selectedItems.length === 0) return;
    const requestId = createArchiveRequestId("archive-favorite");
    setActionError(null);
    recordArchiveDiagnostic("request", "archive-favorite", "started", {
      requestId,
      count: selectedItems.length,
      data: { operation: "remove-tag", surface: "favorites" },
    });
    try {
      await repository.batchUpdateFavoriteOrganization(selectedItems.map((item) => ({
        target: { sourceKind: item.sourceKind, stableId: item.stableId },
        note: item.note,
        tags: item.tags.filter((tag) => tag !== name),
      })));
      setSelected(new Set());
      setReloadToken((value) => value + 1);
      recordArchiveDiagnostic("success", "archive-favorite", "updated", {
        requestId,
        count: selectedItems.length,
        data: { operation: "remove-tag", surface: "favorites" },
      });
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : String(reason));
      recordArchiveDiagnostic("failure", "archive-favorite", "failed", {
        requestId,
        count: selectedItems.length,
        data: { operation: "remove-tag", surface: "favorites" },
      });
    }
  };
  const renameTag = async (tag: ArchiveFavoriteTag) => {
    const name = (tagRenameValues[tag.tagId] ?? tag.name).trim();
    if (!name || name === tag.name) return;
    const requestId = createArchiveRequestId("archive-favorite");
    setActionError(null);
    recordArchiveDiagnostic("request", "archive-favorite", "started", {
      requestId,
      data: { operation: "rename-tag", surface: "favorites" },
    });
    try {
      await repository.renameFavoriteTag(tag.tagId, name);
      setTagFilter((current) => ({ ...current, names: current.names.map((value) => value === tag.name ? name : value) }));
      setReloadToken((value) => value + 1);
      recordArchiveDiagnostic("success", "archive-favorite", "updated", {
        requestId,
        data: { operation: "rename-tag", surface: "favorites" },
      });
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : String(reason));
      recordArchiveDiagnostic("failure", "archive-favorite", "failed", {
        requestId,
        data: { operation: "rename-tag", surface: "favorites" },
      });
    }
  };
  const deleteTag = async () => {
    if (!tagToDelete) return;
    const requestId = createArchiveRequestId("archive-favorite");
    setActionError(null);
    recordArchiveDiagnostic("request", "archive-favorite", "started", {
      requestId,
      data: { operation: "delete-tag", surface: "favorites" },
    });
    try {
      await repository.deleteFavoriteTag(tagToDelete.tagId);
      setTagFilter((current) => ({ ...current, names: current.names.filter((value) => value !== tagToDelete.name) }));
      setTagToDelete(null);
      setReloadToken((value) => value + 1);
      recordArchiveDiagnostic("success", "archive-favorite", "updated", {
        requestId,
        data: { operation: "delete-tag", surface: "favorites" },
      });
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : String(reason));
      recordArchiveDiagnostic("failure", "archive-favorite", "failed", {
        requestId,
        data: { operation: "delete-tag", surface: "favorites" },
      });
    }
  };
  const exportSelected = async () => {
    if (selectedItems.length === 0) return;
    const requestId = createArchiveRequestId("archive-export");
    let pathProvided = false;
    setActionError(null);
    recordArchiveDiagnostic("request", "archive-export", "started", {
      requestId,
      count: selectedItems.length,
      data: { surface: "favorites", phase: "path-select" },
    });
    try {
      const path = await save({ defaultPath: "收藏结果.json", filters: [{ name: "JSON", extensions: ["json"] }] });
      if (!path) {
        recordArchiveDiagnostic("cancel", "archive-export", "canceled", {
          requestId,
          count: selectedItems.length,
          data: { surface: "favorites", phase: "path-select" },
        });
        return;
      }
      pathProvided = true;
      await invoke("write_archive_transfer", {
        path,
        contents: JSON.stringify({
          format: "danmu-favorite-results",
          formatVersion: 1,
          exportedAt: Date.now(),
          restorable: false,
          favorites: selectedItems,
        }, null, 2),
      });
      setSelected(new Set());
      recordArchiveDiagnostic("success", "archive-export", "written", {
        requestId,
        count: selectedItems.length,
        pathProvided,
        data: { surface: "favorites", phase: "write" },
      });
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : String(reason));
      recordArchiveDiagnostic("failure", "archive-export", "failed", {
        requestId,
        count: selectedItems.length,
        pathProvided,
        data: { surface: "favorites", phase: "write" },
      });
    }
  };
  const createTagForEditor = async (name: string): Promise<ArchiveFavoriteTag> => {
    const requestId = createArchiveRequestId("archive-favorite");
    recordArchiveDiagnostic("request", "archive-favorite", "started", {
      requestId,
      data: { operation: "create-tag", surface: "favorites" },
    });
    try {
      const tag = await repository.createFavoriteTag(name);
      recordArchiveDiagnostic("success", "archive-favorite", "updated", {
        requestId,
        data: { operation: "create-tag", surface: "favorites" },
      });
      return tag;
    } catch (reason) {
      recordArchiveDiagnostic("failure", "archive-favorite", "failed", {
        requestId,
        data: { operation: "create-tag", surface: "favorites" },
      });
      throw reason;
    }
  };
  const saveEditedFavorite = async (note: string, selectedTags: readonly string[]) => {
    if (!editingItem) return;
    const requestId = createArchiveRequestId("archive-favorite");
    recordArchiveDiagnostic("request", "archive-favorite", "started", {
      requestId,
      data: { operation: "edit", surface: "favorites" },
    });
    try {
      await repository.updateFavoriteOrganization({
        target: { sourceKind: editingItem.sourceKind, stableId: editingItem.stableId },
        note,
        tags: selectedTags,
      });
      updateItem({ ...editingItem, note, tags: [...selectedTags] });
      recordArchiveDiagnostic("success", "archive-favorite", "updated", {
        requestId,
        data: { operation: "edit", surface: "favorites" },
      });
    } catch (reason) {
      recordArchiveDiagnostic("failure", "archive-favorite", "failed", {
        requestId,
        data: { operation: "edit", surface: "favorites" },
      });
      throw reason;
    }
  };
  const clearFilters = () => {
    setKeyword(""); setKeywordField("all"); setOwnerId(""); setCategory(""); setTimeField("favoritedAt"); setTimePreset("all"); setFrom(""); setTo(""); setTagFilter({ names: [], mode: "any" });
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <section className="rounded-xl border border-line bg-surface p-3" aria-label={uiText("reviewFavoritesPanel.aria_label")}>
        <div className="flex flex-wrap items-center gap-2">
          <strong className="ui-type-section-title text-t1">{uiText("reviewFavoritesPanel.ReviewFavoritesPanel")}</strong>
          {page.totalCount !== null && <span className="ui-type-meta text-t3">{uiText("reviewFavoritesPanel.ReviewFavoritesPanel2")}{page.totalCount} {uiText("reviewFavoritesPanel.ReviewFavoritesPanel3")}</span>}
          <UiSelect ariaLabel={uiText("reviewFavoritesPanel.ariaLabel")} className={inputClass} options={favoriteKeywordFieldOptions} value={keywordField} onValueChange={(value) => setKeywordField(value as typeof keywordField)} />
          <UiSearchInput aria-label={uiText("reviewFavoritesPanel.aria_label2")} value={keyword} onValueChange={setKeyword} placeholder={uiText("reviewFavoritesPanel.placeholder")} className="min-w-40 flex-1" />
          <UiSelect
            ariaLabel={uiText("reviewFavoritesPanel.ariaLabel2")}
            className={inputClass}
            options={[{ value: "", label: uiText("reviewFavoritesPanel.options.label") }, ...owners.map((owner) => ({ value: owner.ownerId, label: owner.name?.trim() || uiText("reviewFavoritesPanel.options.label2", { roomId: owner.roomId }) }))]}
            value={ownerId}
            onValueChange={setOwnerId}
          />
          <button type="button" className={buttonClass} aria-expanded={advanced} onClick={() => setAdvanced((value) => !value)}>{advanced ? uiText("reviewFavoritesPanel.ReviewFavoritesPanel4") : uiText("reviewFavoritesPanel.ReviewFavoritesPanel5")}</button>
          {hasActiveFilters && <button type="button" className={filterActionButtonClass} onClick={clearFilters}>{uiText("reviewFavoritesPanel.ReviewFavoritesPanel6")}</button>}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 ui-type-meta text-t2">
          <span>{uiText("reviewFavoritesPanel.ReviewFavoritesPanel7")}</span>
          {tags.length === 0 && <span className="text-t3">{uiText("reviewFavoritesPanel.ReviewFavoritesPanel8")}</span>}
          {tags.map((tag) => {
            const activeTag = tagFilter.names.includes(tag.name);
            return <button key={tag.tagId} type="button" className={`${tagFilterButtonClass} ${activeTag ? "border-accent bg-accent-subtle font-medium text-accent-text" : "border-line bg-bg text-t2 hover:border-accent/50 hover:bg-raised hover:text-t1"}`} aria-pressed={activeTag} onClick={() => setTagFilter((current) => ({ ...current, names: current.names.includes(tag.name) ? current.names.filter((value) => value !== tag.name) : [...current.names, tag.name] }))}>{activeTag ? "✓ " : ""}{tag.name}</button>;
          })}
          {tagFilter.names.length > 1 && <UiSelect ariaLabel={uiText("reviewFavoritesPanel.ariaLabel3")} className={inputClass} options={favoriteTagModeOptions} value={tagFilter.mode ?? "any"} onValueChange={(value) => setTagFilter((current) => ({ ...current, mode: value as "any" | "all" }))} />}
        </div>
        {advanced && (
          <div className="mt-3 border-t border-line pt-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 ui-type-meta text-t2">
              <label className="flex items-center gap-2"><span>{uiText("reviewFavoritesPanel.ReviewFavoritesPanel9")}</span><UiSelect ariaLabel={uiText("reviewFavoritesPanel.ariaLabel4")} className={`${inputClass} min-w-32`} options={[{ value: "", label: uiText("reviewFavoritesPanel.options.label3") }, ...CATEGORY_OPTIONS]} value={category} onValueChange={setCategory} /></label>
              <div className="flex flex-wrap items-center gap-2">
                <span>{uiText("reviewFavoritesPanel.ReviewFavoritesPanel10")}</span>
                <UiSelect ariaLabel={uiText("reviewFavoritesPanel.ariaLabel5")} className={inputClass} options={favoriteTimeFieldOptions} value={timeField} onValueChange={(value) => setTimeField(value as ArchiveFavoriteSort)} />
                <UiSelect ariaLabel={uiText("reviewFavoritesPanel.ariaLabel6")} className={inputClass} options={favoriteTimePresetOptions} value={timePreset} onValueChange={(value) => setTimePreset(value as ReviewDatePreset)} />
              </div>
            </div>
            {timePreset === "custom" && (
              <div className="mt-2 flex flex-wrap items-center gap-2 ui-type-meta text-t2">
                <label className="flex flex-wrap items-center gap-2"><span>{uiText("reviewFavoritesPanel.ReviewFavoritesPanel11")}</span><input aria-label={uiText("reviewFavoritesPanel.aria_label3")} type="datetime-local" step="60" className={inputClass} value={from} onChange={(event) => setFrom(event.target.value)} /></label>
                <span>{uiText("reviewFavoritesPanel.ReviewFavoritesPanel12")}</span>
                <label className="flex flex-wrap items-center gap-2"><span>{uiText("reviewFavoritesPanel.ReviewFavoritesPanel13")}</span><input aria-label={uiText("reviewFavoritesPanel.aria_label4")} type="datetime-local" step="60" className={inputClass} value={to} onChange={(event) => setTo(event.target.value)} /></label>
                {rangeError && <span role="alert" className="text-danger">{rangeError}</span>}
              </div>
            )}
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-2 px-1">
        <span className="ui-type-meta text-t3">{uiText("reviewFavoritesPanel.ReviewFavoritesPanel14")}</span>
        <UiSelect ariaLabel={uiText("reviewFavoritesPanel.ariaLabel7")} className={inputClass} options={favoriteSortOptions} value={sort} onValueChange={(value) => setSort(value as ArchiveFavoriteSort)} />
        <UiSelect ariaLabel={uiText("reviewFavoritesPanel.ariaLabel8")} className={inputClass} options={favoriteDirectionOptions} value={direction} onValueChange={(value) => setDirection(value as ArchiveSortDirection)} />
        <button type="button" className={buttonClass} aria-expanded={manageTags} onClick={() => setManageTags((value) => !value)}>{manageTags ? uiText("reviewFavoritesPanel.ReviewFavoritesPanel15") : uiText("reviewFavoritesPanel.ReviewFavoritesPanel16")}</button>
        <button type="button" className={buttonClass} onClick={toggleAllLoaded} disabled={visibleItems.length === 0}>{allLoadedSelected ? uiText("reviewFavoritesPanel.ReviewFavoritesPanel17") : uiText("reviewFavoritesPanel.ReviewFavoritesPanel18")}</button>
        {selectedItems.length > 0 && <><span className="ui-type-meta text-accent-text">{uiText("reviewFavoritesPanel.ReviewFavoritesPanel19")}{selectedItems.length} {uiText("reviewFavoritesPanel.ReviewFavoritesPanel3")}</span><button type="button" className={dangerActionButtonClass} onClick={() => setConfirmRemove(true)}>{uiText("reviewFavoritesPanel.ReviewFavoritesPanel20")}</button><button type="button" className={buttonClass} onClick={() => void exportSelected()}>{uiText("reviewFavoritesPanel.ReviewFavoritesPanel21")}</button><input className={`${inputClass} w-28`} value={tagBatchName} onChange={(event) => setTagBatchName(event.target.value)} placeholder={uiText("reviewFavoritesPanel.placeholder2")} /><button type="button" className={buttonClass} onClick={() => void addTagToSelected()} disabled={!tagBatchName.trim()}>{uiText("reviewFavoritesPanel.ReviewFavoritesPanel22")}</button><UiSelect ariaLabel={uiText("reviewFavoritesPanel.ariaLabel9")} className={inputClass} options={[{ value: "", label: uiText("reviewFavoritesPanel.options.label4") }, ...tags.map((tag) => ({ value: tag.name, label: tag.name }))]} value="" onValueChange={(value) => { if (value) void removeTagFromSelected(value); }} /></>}
      </div>

        {manageTags && <div className="rounded-xl border border-line bg-surface p-3"><p className="mb-2 ui-type-meta text-t3">{uiText("reviewFavoritesPanel.ReviewFavoritesPanel23")}</p><div className="flex flex-col gap-2">{tags.length === 0 ? <span className="ui-type-meta text-t3">{uiText("reviewFavoritesPanel.ReviewFavoritesPanel8")}</span> : tags.map((tag) => <div key={tag.tagId} className="flex flex-wrap items-center gap-2"><input aria-label={uiText("reviewFavoritesPanel.aria_label5", { name: tag.name })} className={`${inputClass} min-w-32 flex-1`} value={tagRenameValues[tag.tagId] ?? tag.name} onChange={(event) => setTagRenameValues((current) => ({ ...current, [tag.tagId]: event.target.value }))} /><span className="ui-type-meta text-t3">{uiText("reviewFavoritesPanel.ReviewFavoritesPanel24")}{tag.usageCount} {uiText("reviewFavoritesPanel.ReviewFavoritesPanel3")}</span><button type="button" className={buttonClass} onClick={() => void renameTag(tag)}>{uiText("reviewFavoritesPanel.ReviewFavoritesPanel25")}</button><button type="button" className={dangerActionButtonClass} onClick={() => setTagToDelete(tag)}>{uiText("common.delete")}</button></div>)}</div></div>}

      {error && <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 ui-type-control text-danger">{uiText("reviewFavoritesPanel.ReviewFavoritesPanel26")}{error}<button type="button" className="ml-2 underline" onClick={() => void load()}>{uiText("common.retry")}</button></div>}
      {actionError && <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 ui-type-control text-danger">{uiText("reviewFavoritesPanel.ReviewFavoritesPanel27")}{actionError}<button type="button" className="ml-2 underline" onClick={() => setActionError(null)}>{uiText("common.close")}</button></div>}
      {!error && loading && page.items.length === 0 && <div role="status" className="rounded-xl border border-line px-4 py-10 text-center ui-type-control text-t3">{uiText("reviewFavoritesPanel.ReviewFavoritesPanel28")}</div>}
      {!error && !loading && visibleItems.length === 0 && <div className="px-4 py-10 text-center ui-type-control text-t3"><p>{hasActiveFilters ? uiText("reviewFavoritesPanel.ReviewFavoritesPanel29") : page.items.length ? uiText("reviewFavoritesPanel.ReviewFavoritesPanel30") : uiText("reviewFavoritesPanel.ReviewFavoritesPanel31")}</p>{hasActiveFilters ? <button type="button" className={`${filterActionButtonClass} mt-3`} onClick={clearFilters}>{uiText("reviewFavoritesPanel.ReviewFavoritesPanel32")}</button> : <p className="mt-2">{page.items.length ? uiText("reviewFavoritesPanel.ReviewFavoritesPanel33") : uiText("reviewFavoritesPanel.ReviewFavoritesPanel34")}</p>}</div>}
      <section aria-label={uiText("reviewFavoritesPanel.aria_label6")} data-style-api="1"  className="event-area review flex min-w-0 flex-col gap-2">

        <div className="event-list flex min-w-0 flex-col gap-2">
        {visibleItems.map((item) => {
          const event = eventFromItem(item);
          const key = targetKey(item);
          return <article key={key} className={`rounded-xl border border-line bg-surface p-2.5 ${selected.has(key) ? "border-accent/60 ring-1 ring-accent/30" : ""}`}>
            <div className="flex items-start gap-2">
              <input type="checkbox" aria-label={uiText("reviewFavoritesPanel.aria_label7", { value: item.userName || uiText("reviewFavoritesPanel.aria_label.value") })} checked={selected.has(key)} onChange={() => toggleSelected(item)} className="mt-2 size-4 accent-[var(--accent)]" />
              <div className="min-w-0 flex-1">
                {event ? <EventRowSlot><EventRow ev={event} archiveLayout reviewLayout showTime   animateOnMount={false} /></EventRowSlot> : <div className="px-2 py-2 ui-type-control text-t2">{item.userName || uiText("reviewFavoritesPanel.ReviewFavoritesPanel35")}　{item.searchText || uiText("reviewFavoritesPanel.ReviewFavoritesPanel36")}</div>}
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 pl-2 ui-type-meta text-t3">
                  <span>{item.ownerName || uiText("reviewFavoritesPanel.ReviewFavoritesPanel37", { roomId: item.roomId })}</span><span>/</span><span>{item.sessionTitle || (item.sessionId ? uiText("reviewFavoritesPanel.ReviewFavoritesPanel38") : uiText("reviewFavoritesPanel.ReviewFavoritesPanel39"))}</span><span>/</span><time>{formatArchiveDateTime(item.eventTs)}</time><span>{uiText("reviewFavoritesPanel.ReviewFavoritesPanel40")}{formatArchiveDateTime(item.favoritedAt)}</span>
                  {item.tags.map((tag) => <span key={tag} className="rounded-full bg-accent-subtle px-1.5 py-0.5 text-accent-text">#{tag}</span>)}
                  {item.note && <span className="truncate text-t2" title={item.note}>{uiText("reviewFavoritesPanel.ReviewFavoritesPanel41")}{item.note}</span>}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-1">
                <button type="button" className={editingItem && targetKey(editingItem) === key ? filterActionButtonClass : buttonClass} onClick={() => setEditingItem((current) => current && targetKey(current) === key ? null : item)}>{editingItem && targetKey(editingItem) === key ? uiText("reviewFavoritesPanel.ReviewFavoritesPanel42") : uiText("reviewFavoritesPanel.ReviewFavoritesPanel43")}</button>
                <button type="button" className={dangerActionButtonClass} onClick={() => setSingleRemove(item)}>{uiText("reviewFavoritesPanel.ReviewFavoritesPanel20")}</button>
                {item.canLocate && item.sessionId && item.eventKey ? <button type="button" className={buttonClass} onClick={() => onOpenFavorite(item)}>{uiText("reviewFavoritesPanel.ReviewFavoritesPanel44")}</button> : <span className="rounded-md border border-line px-2.5 py-1.5 ui-type-meta text-t3" title={uiText("reviewFavoritesPanel.title")}>{uiText("reviewFavoritesPanel.ReviewFavoritesPanel39")}</span>}
              </div>
            </div>
          </article>;
        })}
        </div>
      </section>
      {page.nextCursor && <button type="button" className={`${buttonClass} mx-auto`} disabled={loading} onClick={() => void load(page.nextCursor, true)}>{loading ? uiText("reviewFavoritesPanel.ReviewFavoritesPanel45") : uiText("reviewFavoritesPanel.ReviewFavoritesPanel46")}</button>}
      {editingItem && <FavoriteOrganizationEditor
        title={uiText("reviewFavoritesPanel.title2", { value: editingItem.userName || uiText("reviewFavoritesPanel.title.value") })}
        initialNote={editingItem.note}
        initialTags={editingItem.tags}
        tags={tags}
        onCreateTag={createTagForEditor}
        onSave={saveEditedFavorite}
        onCancel={() => setEditingItem(null)}
      />}
      {confirmRemove && <ConfirmDialog title={uiText("reviewFavoritesPanel.title3")} description={uiText("reviewFavoritesPanel.description", { length: selectedItems.length })} confirmLabel={uiText("reviewFavoritesPanel.confirmLabel")} confirmTone="danger" onCancel={() => setConfirmRemove(false)} onConfirm={removeSelected} />}
      {singleRemove && <ConfirmDialog title={uiText("reviewFavoritesPanel.title4")} description={uiText("reviewFavoritesPanel.description2")} confirmLabel={uiText("reviewFavoritesPanel.confirmLabel")} confirmTone="danger" onCancel={() => setSingleRemove(null)} onConfirm={removeSingle} />}
      {tagToDelete && <ConfirmDialog title={uiText("reviewFavoritesPanel.title5", { name: tagToDelete.name })} description={uiText("reviewFavoritesPanel.description3")} confirmLabel={uiText("reviewFavoritesPanel.confirmLabel2")} confirmTone="danger" onCancel={() => setTagToDelete(null)} onConfirm={deleteTag} />}
    </div>
  );
}
