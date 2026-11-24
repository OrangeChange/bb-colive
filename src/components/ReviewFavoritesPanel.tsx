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
  { value: "all", label: "全部字段" },
  { value: "user", label: "用户" },
  { value: "fanMedal", label: "粉丝牌" },
  { value: "gift", label: "礼物" },
  { value: "content", label: "内容" },
  { value: "note", label: "备注" },
] as const;
const favoriteTimeFieldOptions = [
  { value: "favoritedAt", label: "收藏时间" },
  { value: "eventTs", label: "事件时间" },
] as const;
const favoriteTimePresetOptions = [
  { value: "all", label: "全部时间" },
  { value: "today", label: "今天" },
  { value: "yesterday", label: "昨天" },
  { value: "1w", label: "过去 7 天" },
  { value: "1mo", label: "过去 30 天" },
  { value: "week", label: "本周" },
  { value: "lastWeek", label: "上周" },
  { value: "month", label: "本月" },
  { value: "lastMonth", label: "上月" },
  { value: "custom", label: "自定义" },
] as const;
const favoriteSortOptions = favoriteTimeFieldOptions;
const favoriteDirectionOptions = [
  { value: "desc", label: "倒序排列" },
  { value: "asc", label: "顺序排列" },
] as const;
const favoriteTagModeOptions = [
  { value: "any", label: "任一标签" },
  { value: "all", label: "全部标签" },
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
    ? "开始时间必须早于结束时间"
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
      setActionError(result.refresh === "failed" ? "已保存，刷新失败" : null);
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
      setActionError(result.refresh === "failed" ? "已保存，刷新失败" : null);
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
      <section className="rounded-xl border border-line bg-surface p-3" aria-label="收藏筛选">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="ui-type-section-title text-t1">收藏</strong>
          {page.totalCount !== null && <span className="ui-type-meta text-t3">共 {page.totalCount} 条</span>}
          <UiSelect ariaLabel="收藏关键词字段" className={inputClass} options={favoriteKeywordFieldOptions} value={keywordField} onValueChange={(value) => setKeywordField(value as typeof keywordField)} />
          <UiSearchInput aria-label="搜索收藏" value={keyword} onValueChange={setKeyword} placeholder="搜索收藏" className="min-w-40 flex-1" />
          <UiSelect
            ariaLabel="收藏主播"
            className={inputClass}
            options={[{ value: "", label: "全部主播" }, ...owners.map((owner) => ({ value: owner.ownerId, label: owner.name?.trim() || `房间 ${owner.roomId}` }))]}
            value={ownerId}
            onValueChange={setOwnerId}
          />
          <button type="button" className={buttonClass} aria-expanded={advanced} onClick={() => setAdvanced((value) => !value)}>{advanced ? "收起筛选" : "更多筛选"}</button>
          {hasActiveFilters && <button type="button" className={filterActionButtonClass} onClick={clearFilters}>清除条件</button>}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 ui-type-meta text-t2">
          <span>标签</span>
          {tags.length === 0 && <span className="text-t3">暂无标签</span>}
          {tags.map((tag) => {
            const activeTag = tagFilter.names.includes(tag.name);
            return <button key={tag.tagId} type="button" className={`${tagFilterButtonClass} ${activeTag ? "border-accent bg-accent-subtle font-medium text-accent-text" : "border-line bg-bg text-t2 hover:border-accent/50 hover:bg-raised hover:text-t1"}`} aria-pressed={activeTag} onClick={() => setTagFilter((current) => ({ ...current, names: current.names.includes(tag.name) ? current.names.filter((value) => value !== tag.name) : [...current.names, tag.name] }))}>{activeTag ? "✓ " : ""}{tag.name}</button>;
          })}
          {tagFilter.names.length > 1 && <UiSelect ariaLabel="标签筛选方式" className={inputClass} options={favoriteTagModeOptions} value={tagFilter.mode ?? "any"} onValueChange={(value) => setTagFilter((current) => ({ ...current, mode: value as "any" | "all" }))} />}
        </div>
        {advanced && (
          <div className="mt-3 border-t border-line pt-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 ui-type-meta text-t2">
              <label className="flex items-center gap-2"><span>事件分类</span><UiSelect ariaLabel="事件分类" className={`${inputClass} min-w-32`} options={[{ value: "", label: "全部分类" }, ...CATEGORY_OPTIONS]} value={category} onValueChange={setCategory} /></label>
              <div className="flex flex-wrap items-center gap-2">
                <span>时间</span>
                <UiSelect ariaLabel="时间依据" className={inputClass} options={favoriteTimeFieldOptions} value={timeField} onValueChange={(value) => setTimeField(value as ArchiveFavoriteSort)} />
                <UiSelect ariaLabel="时间范围" className={inputClass} options={favoriteTimePresetOptions} value={timePreset} onValueChange={(value) => setTimePreset(value as ReviewDatePreset)} />
              </div>
            </div>
            {timePreset === "custom" && (
              <div className="mt-2 flex flex-wrap items-center gap-2 ui-type-meta text-t2">
                <label className="flex flex-wrap items-center gap-2"><span>开始</span><input aria-label="时间范围开始" type="datetime-local" step="60" className={inputClass} value={from} onChange={(event) => setFrom(event.target.value)} /></label>
                <span>至</span>
                <label className="flex flex-wrap items-center gap-2"><span>结束</span><input aria-label="时间范围结束" type="datetime-local" step="60" className={inputClass} value={to} onChange={(event) => setTo(event.target.value)} /></label>
                {rangeError && <span role="alert" className="text-danger">{rangeError}</span>}
              </div>
            )}
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-2 px-1">
        <span className="ui-type-meta text-t3">排序</span>
        <UiSelect ariaLabel="收藏排序字段" className={inputClass} options={favoriteSortOptions} value={sort} onValueChange={(value) => setSort(value as ArchiveFavoriteSort)} />
        <UiSelect ariaLabel="收藏排序方向" className={inputClass} options={favoriteDirectionOptions} value={direction} onValueChange={(value) => setDirection(value as ArchiveSortDirection)} />
        <button type="button" className={buttonClass} aria-expanded={manageTags} onClick={() => setManageTags((value) => !value)}>{manageTags ? "收起标签管理" : "管理标签"}</button>
        <button type="button" className={buttonClass} onClick={toggleAllLoaded} disabled={visibleItems.length === 0}>{allLoadedSelected ? "取消全选" : "全选当前列表"}</button>
        {selectedItems.length > 0 && <><span className="ui-type-meta text-accent-text">已选 {selectedItems.length} 条</span><button type="button" className={dangerActionButtonClass} onClick={() => setConfirmRemove(true)}>取消收藏</button><button type="button" className={buttonClass} onClick={() => void exportSelected()}>导出所选</button><input className={`${inputClass} w-28`} value={tagBatchName} onChange={(event) => setTagBatchName(event.target.value)} placeholder="输入标签名称" /><button type="button" className={buttonClass} onClick={() => void addTagToSelected()} disabled={!tagBatchName.trim()}>添加标签</button><UiSelect ariaLabel="批量移除标签" className={inputClass} options={[{ value: "", label: "移除标签…" }, ...tags.map((tag) => ({ value: tag.name, label: tag.name }))]} value="" onValueChange={(value) => { if (value) void removeTagFromSelected(value); }} /></>}
      </div>

        {manageTags && <div className="rounded-xl border border-line bg-surface p-3"><p className="mb-2 ui-type-meta text-t3">只删除标签关联，不影响收藏、备注或原始事件。</p><div className="flex flex-col gap-2">{tags.length === 0 ? <span className="ui-type-meta text-t3">暂无标签</span> : tags.map((tag) => <div key={tag.tagId} className="flex flex-wrap items-center gap-2"><input aria-label={`重命名标签 ${tag.name}`} className={`${inputClass} min-w-32 flex-1`} value={tagRenameValues[tag.tagId] ?? tag.name} onChange={(event) => setTagRenameValues((current) => ({ ...current, [tag.tagId]: event.target.value }))} /><span className="ui-type-meta text-t3">已用 {tag.usageCount} 条</span><button type="button" className={buttonClass} onClick={() => void renameTag(tag)}>重命名</button><button type="button" className={dangerActionButtonClass} onClick={() => setTagToDelete(tag)}>删除</button></div>)}</div></div>}

      {error && <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 ui-type-control text-danger">收藏暂时无法加载：{error}<button type="button" className="ml-2 underline" onClick={() => void load()}>重试</button></div>}
      {actionError && <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 ui-type-control text-danger">收藏操作失败：{actionError}<button type="button" className="ml-2 underline" onClick={() => setActionError(null)}>关闭</button></div>}
      {!error && loading && page.items.length === 0 && <div role="status" className="rounded-xl border border-line px-4 py-10 text-center ui-type-control text-t3">正在加载收藏…</div>}
      {!error && !loading && visibleItems.length === 0 && <div className="px-4 py-10 text-center ui-type-control text-t3"><p>{hasActiveFilters ? "没有符合条件的收藏" : page.items.length ? "当前收藏已被事件显示设置隐藏" : "还没有收藏"}</p>{hasActiveFilters ? <button type="button" className={`${filterActionButtonClass} mt-3`} onClick={clearFilters}>清除筛选</button> : <p className="mt-2">{page.items.length ? "可在设置中调整自动弹幕和未验证手机号用户的显示范围。" : "在现场或回看中收藏事件后，可以在这里查找和整理。"}</p>}</div>}
      <section aria-label="收藏列表" data-style-api="1"  className="event-area review flex min-w-0 flex-col gap-2">

        <div className="event-list flex min-w-0 flex-col gap-2">
        {visibleItems.map((item) => {
          const event = eventFromItem(item);
          const key = targetKey(item);
          return <article key={key} className={`rounded-xl border border-line bg-surface p-2.5 ${selected.has(key) ? "border-accent/60 ring-1 ring-accent/30" : ""}`}>
            <div className="flex items-start gap-2">
              <input type="checkbox" aria-label={`选择收藏：${item.userName || "未知用户"}`} checked={selected.has(key)} onChange={() => toggleSelected(item)} className="mt-2 size-4 accent-[var(--accent)]" />
              <div className="min-w-0 flex-1">
                {event ? <EventRowSlot><EventRow ev={event} archiveLayout reviewLayout showTime   animateOnMount={false} /></EventRowSlot> : <div className="px-2 py-2 ui-type-control text-t2">{item.userName || "未知用户"}　{item.searchText || "暂时无法显示事件内容"}</div>}
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 pl-2 ui-type-meta text-t3">
                  <span>{item.ownerName || `房间 ${item.roomId}`}</span><span>/</span><span>{item.sessionTitle || (item.sessionId ? "未命名场次" : "无法定位原事件")}</span><span>/</span><time>{formatArchiveDateTime(item.eventTs)}</time><span>· 收藏于 {formatArchiveDateTime(item.favoritedAt)}</span>
                  {item.tags.map((tag) => <span key={tag} className="rounded-full bg-accent-subtle px-1.5 py-0.5 text-accent-text">#{tag}</span>)}
                  {item.note && <span className="truncate text-t2" title={item.note}>备注：{item.note}</span>}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-1">
                <button type="button" className={editingItem && targetKey(editingItem) === key ? filterActionButtonClass : buttonClass} onClick={() => setEditingItem((current) => current && targetKey(current) === key ? null : item)}>{editingItem && targetKey(editingItem) === key ? "关闭编辑" : "编辑收藏"}</button>
                <button type="button" className={dangerActionButtonClass} onClick={() => setSingleRemove(item)}>取消收藏</button>
                {item.canLocate && item.sessionId && item.eventKey ? <button type="button" className={buttonClass} onClick={() => onOpenFavorite(item)}>查看上下文</button> : <span className="rounded-md border border-line px-2.5 py-1.5 ui-type-meta text-t3" title="这条收藏没有关联到当前档案场次">无法定位原事件</span>}
              </div>
            </div>
          </article>;
        })}
        </div>
      </section>
      {page.nextCursor && <button type="button" className={`${buttonClass} mx-auto`} disabled={loading} onClick={() => void load(page.nextCursor, true)}>{loading ? "正在加载…" : "加载更多收藏"}</button>}
      {editingItem && <FavoriteOrganizationEditor
        title={`编辑收藏 · ${editingItem.userName || "未知用户"}`}
        initialNote={editingItem.note}
        initialTags={editingItem.tags}
        tags={tags}
        onCreateTag={createTagForEditor}
        onSave={saveEditedFavorite}
        onCancel={() => setEditingItem(null)}
      />}
      {confirmRemove && <ConfirmDialog title="取消所选收藏" description={`将取消 ${selectedItems.length} 条收藏；备注和标签也会随收藏关系一起移除。档案事件本身不会删除。`} confirmLabel="取消收藏" confirmTone="danger" onCancel={() => setConfirmRemove(false)} onConfirm={removeSelected} />}
      {singleRemove && <ConfirmDialog title="取消收藏" description="将取消这条收藏，并移除它的备注和标签；档案事件本身不会删除。" confirmLabel="取消收藏" confirmTone="danger" onCancel={() => setSingleRemove(null)} onConfirm={removeSingle} />}
      {tagToDelete && <ConfirmDialog title={`删除标签“${tagToDelete.name}”`} description={`将删除这个标签以及它与收藏的关联，但不会删除收藏、备注或原始事件。`} confirmLabel="删除标签" confirmTone="danger" onCancel={() => setTagToDelete(null)} onConfirm={deleteTag} />}
    </div>
  );
}
