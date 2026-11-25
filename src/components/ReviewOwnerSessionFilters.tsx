import { DateTimeField } from "./DateTimeField";
import { Button } from "./shadcn/button";
import { useUiLanguage } from "../i18n/react.ts";
import { localized, uiText } from "../i18n/index.ts";
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

const buttonClass = "inline-flex h-8 items-center rounded-md border px-2.5 ui-type-control transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring";

const sortOptions: readonly { value: ArchiveSessionSort; label: string }[] = localized(() => ([
  { value: "startedAt", label: uiText("reviewOwnerSessionFilters.sortOptions.label") },
  { value: "duration", label: uiText("reviewOwnerSessionFilters.sortOptions.label2") },
  { value: "eventCount", label: uiText("reviewOwnerSessionFilters.sortOptions.label3") },
  { value: "paidTotal", label: uiText("reviewOwnerSessionFilters.sortOptions.label4") },
  { value: "favoriteCount", label: uiText("reviewOwnerSessionFilters.sortOptions.label5") },
]));

const dateOptions: readonly { value: ReviewDatePreset; label: string }[] = localized(() => ([
  { value: "all", label: uiText("reviewOwnerSessionFilters.dateOptions.label") },
  { value: "today", label: uiText("reviewOwnerSessionFilters.dateOptions.label2") },
  { value: "yesterday", label: uiText("reviewOwnerSessionFilters.dateOptions.label3") },
  { value: "week", label: uiText("reviewOwnerSessionFilters.dateOptions.label4") },
  { value: "lastWeek", label: uiText("reviewOwnerSessionFilters.dateOptions.label5") },
  { value: "month", label: uiText("reviewOwnerSessionFilters.dateOptions.label6") },
  { value: "lastMonth", label: uiText("reviewOwnerSessionFilters.dateOptions.label7") },
  { value: "custom", label: uiText("reviewOwnerSessionFilters.dateOptions.label8") },
]));

const statusOptions = localized(() => ([
  { value: "all", label: uiText("reviewOwnerSessionFilters.statusOptions.label") },
  ...(["active", "ended", "unclean"] as const).map(value => ({ value, label: formatArchiveSessionStatus(value) })),
] as const));

const qualityOptions = localized(() => ([
  { value: "all", label: uiText("reviewOwnerSessionFilters.qualityOptions.label") },
  ...(["in-progress", "complete", "incomplete"] as const).map(value => ({ value, label: formatArchiveQuality(value) })),
] as const));

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
  useUiLanguage();
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
      ariaLabel={uiText("reviewOwnerSessionFilters.ariaLabel")}
      contentId="review-owner-session-filter-content"
      conditionCount={conditionCount}
      collapsed={collapsed}
      onCollapsedChange={onCollapsedChange}
      onClear={hasConditions ? onClear : undefined}
      className="review-owner-session-filter-shell"
    >
      <div className="review-owner-session-filters flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <label className="sr-only" htmlFor="review-owner-session-title">{uiText("reviewOwnerSessionFilters.ReviewOwnerSessionFilters")}</label>
        <UiSearchInput id="review-owner-session-title" aria-label={uiText("reviewOwnerSessionFilters.aria_label")} placeholder={uiText("reviewOwnerSessionFilters.placeholder")} value={query.title} onValueChange={title => onChange({ title })} className="min-w-44 flex-1" />
        <div className="flex items-center gap-1 ui-type-meta text-t2">
          <span>{uiText("reviewOwnerSessionFilters.ReviewOwnerSessionFilters2")}</span>
          <UiSelect ariaLabel={uiText("reviewOwnerSessionFilters.ariaLabel2")} options={dateOptions} value={datePreset} onValueChange={(value) => setDatePreset(value as ReviewDatePreset)} />
        </div>
      </div>

      {(customDateOpen || query.startedFromTs !== undefined || query.startedToTs !== undefined) && (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <label className="flex items-center gap-1 ui-type-meta text-t2">
            <span>{uiText("reviewOwnerSessionFilters.ReviewOwnerSessionFilters3")}</span>
            <DateTimeField label={uiText("reviewOwnerSessionFilters.aria_label2")} value={query.startedFromTs === undefined ? undefined : new Date(query.startedFromTs)} onChange={date => onChange({ startedFromTs: date?.getTime() })} />
          </label>
          <label className="flex items-center gap-1 ui-type-meta text-t2">
            <span>{uiText("reviewOwnerSessionFilters.ReviewOwnerSessionFilters4")}</span>
            <DateTimeField label={uiText("reviewOwnerSessionFilters.aria_label3")} value={query.startedToTs === undefined ? undefined : new Date(query.startedToTs)} onChange={date => onChange({ startedToTs: date?.getTime() })} />
          </label>
        </div>
      )}

      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <div className="flex items-center gap-1 ui-type-meta text-t2">
          <span>{uiText("reviewOwnerSessionFilters.ReviewOwnerSessionFilters5")}</span>
          <UiSelect ariaLabel={uiText("reviewOwnerSessionFilters.ariaLabel3")} options={statusOptions} value={selectedStatus(query)} onValueChange={setStatus} />
        </div>
        <div className="flex items-center gap-1 ui-type-meta text-t2">
          <span>{uiText("reviewOwnerSessionFilters.ReviewOwnerSessionFilters6")}</span>
          <UiSelect ariaLabel={uiText("reviewOwnerSessionFilters.ariaLabel4")} options={qualityOptions} value={selectedQuality(query)} onValueChange={setQuality} />
        </div>
        <Button variant="outline"
          type="button"
          aria-pressed={query.favoriteOnly}
          className={`${buttonClass} ${query.favoriteOnly ? "border-accent bg-accent-subtle text-accent-text" : "border-line bg-bg text-t2 hover:border-accent/50 hover:bg-raised hover:text-t1"}`}
          onClick={() => onChange({ favoriteOnly: !query.favoriteOnly })}
        >{uiText("reviewOwnerSessionFilters.ReviewOwnerSessionFilters7")}</Button>
        <div className="ml-auto flex items-center gap-1 ui-type-meta text-t2">
          <span>{uiText("reviewOwnerSessionFilters.ReviewOwnerSessionFilters8")}</span>
          <UiSelect ariaLabel={uiText("reviewOwnerSessionFilters.ariaLabel5")} options={sortOptions} value={query.sort} onValueChange={(value) => onChange({ sort: value as ArchiveSessionSort })} />
          <UiSelect ariaLabel={uiText("reviewOwnerSessionFilters.ariaLabel6")} options={(["desc", "asc"] as const).map(value => ({ value, label: formatArchiveSortDirection(value, query.sort) }))} value={query.direction} onValueChange={(value) => onChange({ direction: value as ArchiveSortDirection })} />
        </div>
      </div>
      </div>
    </ReviewFilterShell>
  );
}
