import { UiSearchInput } from "./ui/SearchInput.tsx";
import { useState } from "react";
import type {
  ArchiveQuality,
  ArchiveSessionSort,
  ArchiveSessionStatus,
  ArchiveSortDirection,
  ReviewOwnerSessionQuery,
} from "../archive/archiveTypes.ts";
import { getReviewDatePreset, getReviewDateRange, type ReviewDatePreset } from "../archive/archiveState.ts";
import { ReviewFilterShell } from "./ReviewFilterShell";
import { UiSelect } from "./ui/Select";
import { formatArchiveSessionStatus, formatArchiveQuality, formatArchiveSortDirection } from "../archive/archiveDisplay.ts";

const controlClass = "h-8 min-w-0 rounded-md border border-line bg-bg px-2 ui-type-control text-t1 outline-none focus:border-accent focus:ring-2 focus:ring-accent-ring";
const buttonClass = "inline-flex h-8 items-center rounded-md border px-2.5 ui-type-control transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring";

function dateValue(timestamp: number | undefined): string {
  if (timestamp === undefined) return "";
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseDateValue(value: string): number | undefined {
  if (!value) return undefined;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

const sortOptions: readonly { value: ArchiveSessionSort; label: string }[] = [
  { value: "startedAt", label: "开播时间" },
  { value: "duration", label: "直播时长" },
  { value: "eventCount", label: "事件数量" },
  { value: "paidTotal", label: "付费总额" },
  { value: "favoriteCount", label: "收藏数量" },
];

const dateOptions: readonly { value: ReviewDatePreset; label: string }[] = [
  { value: "all", label: "全部时间" },
  { value: "today", label: "今天" },
  { value: "yesterday", label: "昨天" },
  { value: "week", label: "本周" },
  { value: "lastWeek", label: "上周" },
  { value: "month", label: "本月" },
  { value: "lastMonth", label: "上月" },
  { value: "custom", label: "自定义" },
];

const statusOptions = [
  { value: "all", label: "全部" },
  ...(["active", "ended", "unclean"] as const).map(value => ({ value, label: formatArchiveSessionStatus(value) })),
] as const;

const qualityOptions = [
  { value: "all", label: "全部" },
  ...(["in-progress", "complete", "incomplete"] as const).map(value => ({ value, label: formatArchiveQuality(value) })),
] as const;

function selectedStatus(query: ReviewOwnerSessionQuery): "all" | ArchiveSessionStatus {
  if (!query.status || query.status.length === 0) return "all";
  return query.status[0] ?? "all";
}

function selectedQuality(query: ReviewOwnerSessionQuery): "all" | ArchiveQuality {
  if (!query.quality || query.quality.length === 0) return "all";
  return query.quality[0] ?? "all";
}

export function ReviewOwnerSessionFilters({
  query,
  onChange,
  onClear,
  collapsed,
  onCollapsedChange,
}: {
  query: ReviewOwnerSessionQuery;
  onChange: (patch: Partial<ReviewOwnerSessionQuery>) => void;
  onClear: () => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}) {
  const [customDateOpen, setCustomDateOpen] = useState(false);
  const datePreset = customDateOpen
    ? "custom"
    : getReviewDatePreset({ fromTs: query.startedFromTs, toTs: query.startedToTs });
  const hasConditions = Boolean(
    query.title.trim()
    || query.startedFromTs !== undefined
    || query.startedToTs !== undefined
    || (query.status && query.status.length > 0)
    || (query.quality && query.quality.length > 0)
    || query.favoriteOnly,
  );
  const conditionCount = [
    query.title.trim(),
    query.startedFromTs !== undefined || query.startedToTs !== undefined,
    Boolean(query.status?.length),
    Boolean(query.quality?.length),
    query.favoriteOnly,
  ].filter(Boolean).length;

  const setDatePreset = (value: ReviewDatePreset) => {
    if (value === "custom") {
      setCustomDateOpen(true);
      return;
    }
    setCustomDateOpen(false);
    const range = getReviewDateRange(value);
    onChange({ startedFromTs: range.fromTs, startedToTs: range.toTs });
  };

  const setStatus = (value: string) => {
    const status: readonly ArchiveSessionStatus[] | undefined = value === "all" ? undefined : [value as ArchiveSessionStatus];
    onChange({ status });
  };

  const setQuality = (value: string) => {
    onChange({ quality: value === "all" ? undefined : [value as ArchiveQuality] });
  };

  return (
    <ReviewFilterShell
      ariaLabel="场次筛选"
      contentId="review-owner-session-filter-content"
      conditionCount={conditionCount}
      collapsed={collapsed}
      onCollapsedChange={onCollapsedChange}
      onClear={hasConditions ? onClear : undefined}
      className="review-owner-session-filter-shell"
    >
      <div className="review-owner-session-filters flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <label className="sr-only" htmlFor="review-owner-session-title">搜索直播标题</label>
        <UiSearchInput id="review-owner-session-title" aria-label="搜索直播标题" placeholder="搜索直播标题" value={query.title} onValueChange={title => onChange({ title })} className="min-w-44 flex-1" />
        <div className="flex items-center gap-1 ui-type-meta text-t2">
          <span>开播时间</span>
          <UiSelect ariaLabel="场次开播时间" options={dateOptions} value={datePreset} onValueChange={(value) => setDatePreset(value as ReviewDatePreset)} />
        </div>
      </div>

      {(customDateOpen || query.startedFromTs !== undefined || query.startedToTs !== undefined) && (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <label className="flex items-center gap-1 ui-type-meta text-t2">
            <span>开始</span>
            <input type="datetime-local" step="60" aria-label="场次开播起始时间" className={controlClass} value={dateValue(query.startedFromTs)} onChange={(event) => onChange({ startedFromTs: parseDateValue(event.target.value) })} />
          </label>
          <label className="flex items-center gap-1 ui-type-meta text-t2">
            <span>结束</span>
            <input type="datetime-local" step="60" aria-label="场次开播结束时间" className={controlClass} value={dateValue(query.startedToTs)} onChange={(event) => onChange({ startedToTs: parseDateValue(event.target.value) })} />
          </label>
        </div>
      )}

      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <div className="flex items-center gap-1 ui-type-meta text-t2">
          <span>直播状态</span>
          <UiSelect ariaLabel="直播状态" options={statusOptions} value={selectedStatus(query)} onValueChange={setStatus} />
        </div>
        <div className="flex items-center gap-1 ui-type-meta text-t2">
          <span>记录质量</span>
          <UiSelect ariaLabel="记录质量" options={qualityOptions} value={selectedQuality(query)} onValueChange={setQuality} />
        </div>
        <button
          type="button"
          aria-pressed={query.favoriteOnly}
          className={`${buttonClass} ${query.favoriteOnly ? "border-accent bg-accent-subtle text-accent-text" : "border-line bg-bg text-t2 hover:border-accent/50 hover:bg-raised hover:text-t1"}`}
          onClick={() => onChange({ favoriteOnly: !query.favoriteOnly })}
        >只看有收藏的场次</button>
        <div className="ml-auto flex items-center gap-1 ui-type-meta text-t2">
          <span>排序</span>
          <UiSelect ariaLabel="场次排序字段" options={sortOptions} value={query.sort} onValueChange={(value) => onChange({ sort: value as ArchiveSessionSort })} />
          <UiSelect ariaLabel="场次排序方向" options={(["desc", "asc"] as const).map(value => ({ value, label: formatArchiveSortDirection(value, query.sort) }))} value={query.direction} onValueChange={(value) => onChange({ direction: value as ArchiveSortDirection })} />
        </div>
      </div>
      </div>
    </ReviewFilterShell>
  );
}
