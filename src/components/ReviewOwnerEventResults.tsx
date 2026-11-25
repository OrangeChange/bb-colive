import { Button } from "./shadcn/button";
import { useUiLanguage } from "../i18n/react.ts";
import { localized, uiText } from "../i18n/index.ts";
import { useState } from "react";
import { EventRowSlot } from "./EventRowSlot";
import type { ArchiveOwnerEventGroupPage, ArchiveEventRecord } from "../archive/archiveTypes.ts";
import type { DanmakuEvent } from "../protocol/types.ts";
import { EventRow } from "./EventRow";
import { useGeneralSettings } from "../generalSettings.ts";
import { shouldShowAutoDanmaku, shouldShowPhoneNotVerified } from "../eventDisplaySettings.ts";
import type { ArchiveSortDirection, ReviewOwnerEventQuery } from "../archive/archiveTypes.ts";
import { formatArchiveDateTime, formatArchiveSessionStatus, formatArchiveRecordingStatus, formatArchiveQuality, formatArchiveSortDirection } from "../archive/archiveDisplay.ts";
import { getArchiveRecordNotices } from "../archive/archiveQuality.ts";
import { compactFilterActionButtonClass } from "./actionButtonStyles";
import { UiSelect } from "./ui/Select";

const toolbarButtonClass = "inline-flex h-8 items-center rounded-md border px-2.5 ui-type-control transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring";

const eventSortOptions: readonly { value: ReviewOwnerEventQuery["sort"]; label: string }[] = localized(() => ([
  { value: "latestMatch", label: uiText("reviewOwnerEventResults.eventSortOptions.label") },
  { value: "sessionStartedAt", label: uiText("reviewOwnerEventResults.eventSortOptions.label2") },
  { value: "matchCount", label: uiText("reviewOwnerEventResults.eventSortOptions.label3") },
]));

export function ReviewOwnerEventResultsToolbar({
  sort,
  direction,
  showBigEmote,
  onChangeSort,
  onChangeDirection,
  onChangeShowBigEmote,
}: {
  sort: ReviewOwnerEventQuery["sort"];
  direction: ArchiveSortDirection;
  showBigEmote: boolean;
  onChangeSort: (sort: ReviewOwnerEventQuery["sort"]) => void;
  onChangeDirection: (direction: ArchiveSortDirection) => void;
  onChangeShowBigEmote: (show: boolean) => void;
}) {
  useUiLanguage();
  return (
    <div aria-label={uiText("reviewOwnerEventResults.aria_label")} className="flex min-w-0 flex-wrap items-center gap-2 border-b border-line py-2">
      <span className="mr-auto ui-type-control text-t1">{uiText("reviewOwnerEventResults.ReviewOwnerEventResultsToolbar")}</span>
      <div className="flex items-center gap-1 ui-type-meta text-t2">
        <span>{uiText("reviewOwnerEventResults.ReviewOwnerEventResultsToolbar2")}</span>
        <UiSelect ariaLabel={uiText("reviewOwnerEventResults.ariaLabel")} options={eventSortOptions} value={sort} onValueChange={(value) => onChangeSort(value as ReviewOwnerEventQuery["sort"])} />
      </div>
      <UiSelect ariaLabel={uiText("reviewOwnerEventResults.ariaLabel2")} options={(["desc", "asc"] as const).map(value => ({ value, label: formatArchiveSortDirection(value, sort) }))} value={direction} onValueChange={(value) => onChangeDirection(value as ArchiveSortDirection)} />
      <Button variant="outline"
        type="button"
        aria-label={uiText("reviewOwnerEventResults.aria_label2")}
        aria-pressed={showBigEmote}
        className={`${toolbarButtonClass} ${showBigEmote ? "border-accent bg-accent-subtle text-accent-text" : "border-line bg-bg text-t2 hover:border-accent/50 hover:text-t1"}`}
        onClick={() => onChangeShowBigEmote(!showBigEmote)}
      >{uiText("reviewOwnerEventResults.ReviewOwnerEventResultsToolbar3")}</Button>
    </div>
  );
}

function fallbackTitle(startedAt: number): string {
  const formatted = formatArchiveDateTime(startedAt);
  return !Number.isFinite(new Date(startedAt ?? NaN).getTime()) ? uiText("reviewOwnerEventResults.fallbackTitle") : uiText("reviewOwnerEventResults.fallbackTitle2", { formatted: formatted });
}

function parseEvent(record: ArchiveEventRecord): DanmakuEvent | null {
  try {
    const value: unknown = JSON.parse(record.payloadJson);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const event = value as DanmakuEvent;
    return {
      ...event,
      id: typeof event.id === "string" && event.id ? event.id : record.eventKey,
      roomId: Number.isFinite(event.roomId) ? event.roomId : record.roomId,
      ts: Number.isFinite(event.ts) ? event.ts : record.eventTs,
    };
  } catch {
    return null;
  }
}

function EventMatchSummary({
  record,
  event,
  onOpen,
}: {
  record: ArchiveEventRecord;
  event: DanmakuEvent | null;
  onOpen: () => void;
}) {
  useUiLanguage();

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={uiText("reviewOwnerEventResults.aria_label3", { value: record.userName || uiText("reviewOwnerEventResults.aria_label.value"), value2: formatArchiveDateTime(record.eventTs) })}
      className="cursor-pointer rounded-md outline-none transition-colors hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent-ring"
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest("button, a, summary, input, select, textarea, [role=button]") !== event.currentTarget) return;
        onOpen();
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      {event ? (
        <EventRowSlot><EventRow
          ev={event}
          archiveLayout reviewLayout
          showTime


          animateOnMount={false}
        /></EventRowSlot>
      ) : (
        <div className="flex min-w-0 items-center gap-2 px-4 py-2 ui-type-review-event text-t2">
          <span className="min-w-0 flex-1 truncate">{record.userName || uiText("reviewOwnerEventResults.EventMatchSummary")}　{record.searchText || uiText("reviewOwnerEventResults.EventMatchSummary2")}</span>
          <time className="shrink-0 text-right font-mono ui-type-meta text-t3">{formatArchiveDateTime(record.eventTs)}</time>
        </div>
      )}
    </div>
  );
}

export function ReviewOwnerEventResults({
  page,
  loading,
  error,
  hasConditions,
  onOpenMatch,
  onLoadMore,
  onRetry,
  onClear,
}: {
  page: ArchiveOwnerEventGroupPage | null;
  loading: boolean;
  error: string | null;
  hasConditions: boolean;
  onOpenMatch: (roomId: number, sessionId: string, eventKey: string) => void;
  onLoadMore: () => void;
  onRetry: () => void;
  onClear: () => void;
}) {
  useUiLanguage();
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const display = useGeneralSettings(state => state.eventDisplayPreferences);
  const groups = page?.items ?? [];

  if (error && !page) {
    return (
      <div role="alert" className="review-owner-event-results rounded-md border border-danger/40 bg-danger/10 px-3 py-3 ui-type-control text-danger">
        <p>{uiText("reviewOwnerEventResults.ReviewOwnerEventResults")}{error}</p>
        <Button variant="outline" type="button" className={`${compactFilterActionButtonClass} mt-2 mr-2`} onClick={onRetry}>{uiText("common.retry")}</Button>
        <Button variant="outline" type="button" className={`${compactFilterActionButtonClass} mt-2`} onClick={onClear}>{uiText("reviewOwnerEventResults.ReviewOwnerEventResults2")}</Button>
      </div>
    );
  }

  if (loading && !page) {
    return <div role="status" aria-live="polite" className="review-owner-event-results rounded-md border border-line px-3 py-8 text-center ui-type-control text-t3">{uiText("reviewOwnerEventResults.ReviewOwnerEventResults3")}</div>;
  }

  if (!hasConditions && groups.length === 0) {
    return <div className="ui-empty-state ui-empty-fill rounded-md border border-dashed border-line">{uiText("reviewOwnerEventResults.ReviewOwnerEventResults4")}</div>;
  }

  if (!loading && groups.length === 0) {
    return (
      <div className="review-owner-event-results ui-empty-state ui-empty-fill rounded-md border border-dashed border-line">
        <p>{uiText("reviewOwnerEventResults.ReviewOwnerEventResults5")}</p>
        <Button variant="outline" type="button" className={`${compactFilterActionButtonClass} mt-2`} onClick={onClear}>{uiText("reviewOwnerEventResults.ReviewOwnerEventResults2")}</Button>
      </div>
    );
  }

  return (
    <section aria-label={uiText("reviewOwnerEventResults.aria_label4")} data-style-api="1"  className="event-area review review-owner-event-results flex min-w-0 flex-col gap-2">

      {loading && <div role="status" aria-live="polite" className="ui-type-meta text-t3">{uiText("reviewOwnerEventResults.ReviewOwnerEventResults3")}</div>}
      {error && page && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 ui-type-meta text-danger">
          <span>{uiText("reviewOwnerEventResults.ReviewOwnerEventResults6")}{error}</span>
          <Button variant="outline" type="button" className="rounded border border-danger/40 px-2 py-1 ui-type-meta hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring" onClick={onLoadMore}>{uiText("common.retry")}</Button>
        </div>
      )}
      {groups.map((group) => {
        const { session, matchCount } = group;
        const matches = group.matches.filter(match => {
          const event = parseEvent(match);
          return !event || (shouldShowAutoDanmaku(event, display.showAutoDanmaku)
            && shouldShowPhoneNotVerified(event, display.showPhoneNotVerified));
        });
        const collapsed = collapsedGroups[session.sessionId] === true;
        const firstMatch = matches[0];
        return (
          <article key={session.sessionId} className="min-w-0 border-b border-line pb-2 last:border-b-0">
            <header className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 py-1">
              <Button variant="ghost" size={null}
                type="button"
                aria-expanded={!collapsed}
                aria-controls={`review-owner-event-matches-${session.sessionId}`}
                className="h-auto min-w-0 flex-1 justify-start truncate border-0 bg-transparent p-0 text-left hover:bg-transparent ui-type-control text-t1 hover:text-accent-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
                onClick={() => setCollapsedGroups((current) => ({ ...current, [session.sessionId]: !collapsed }))}
              >{collapsed ? "▸" : "▾"} {session.title?.trim() || fallbackTitle(session.startedAt)}</Button>
              <time className="shrink-0 ui-type-meta text-t3">{formatArchiveDateTime(session.startedAt)}</time>
              <span className="shrink-0 rounded-full bg-raised px-1.5 py-0.5 ui-type-meta text-t2">{formatArchiveSessionStatus(session.status)}</span>
              <span className="ui-type-meta text-t3">{formatArchiveRecordingStatus(session.recordingStatus)}</span>
              <span title={getArchiveRecordNotices(session).map(notice => `${notice.label}：${notice.message}`).join(" ") || undefined} className="ui-type-meta text-t3">{formatArchiveQuality(session.quality)}</span>
              <span className="shrink-0 ui-type-meta text-t2">{uiText("reviewOwnerEventResults.ReviewOwnerEventResults7")}{matchCount} {uiText("reviewOwnerEventResults.ReviewOwnerEventResults8")}</span>
              <Button variant="outline"
                type="button"
                disabled={!firstMatch}
                className="shrink-0 rounded-md border border-line px-2 py-1 ui-type-meta text-t2 enabled:hover:border-accent/50 enabled:hover:text-accent-text disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
                onClick={() => firstMatch && onOpenMatch(session.roomId, session.sessionId, firstMatch.eventKey)}
              >{uiText("reviewOwnerEventResults.ReviewOwnerEventResults9")}</Button>
            </header>
            {!collapsed && (
              <div id={`review-owner-event-matches-${session.sessionId}`} className="event-list min-w-0">
                {matches.slice(0, 3).map((match) => (
                  <EventMatchSummary
                    key={match.eventKey}
                    record={match}
                    event={parseEvent(match)}
                    onOpen={() => onOpenMatch(session.roomId, session.sessionId, match.eventKey)}
                  />
                ))}
              </div>
            )}
          </article>
        );
      })}
      {page?.hasMore && (
        <Button variant="outline" type="button" disabled={loading} className="mx-auto rounded-md border border-line px-3 py-1.5 ui-type-control text-t2 enabled:hover:border-accent/50 enabled:hover:text-accent-text disabled:cursor-wait disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring" onClick={onLoadMore}>
          {loading ? uiText("reviewOwnerEventResults.ReviewOwnerEventResults10") : uiText("reviewOwnerEventResults.ReviewOwnerEventResults11")}
        </Button>
      )}
    </section>
  );
}
