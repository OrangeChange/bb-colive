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

const eventSortOptions: readonly { value: ReviewOwnerEventQuery["sort"]; label: string }[] = [
  { value: "latestMatch", label: "最新事件" },
  { value: "sessionStartedAt", label: "开播时间" },
  { value: "matchCount", label: "符合条件数量" },
];

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
  return (
    <div aria-label="符合条件的事件显示和排序" className="flex min-w-0 flex-wrap items-center gap-2 border-b border-line py-2">
      <span className="mr-auto ui-type-control text-t1">符合条件的事件</span>
      <div className="flex items-center gap-1 ui-type-meta text-t2">
        <span>排序</span>
        <UiSelect ariaLabel="事件排序字段" options={eventSortOptions} value={sort} onValueChange={(value) => onChangeSort(value as ReviewOwnerEventQuery["sort"])} />
      </div>
      <UiSelect ariaLabel="事件排序方向" options={(["desc", "asc"] as const).map(value => ({ value, label: formatArchiveSortDirection(value, sort) }))} value={direction} onValueChange={(value) => onChangeDirection(value as ArchiveSortDirection)} />
      <button
        type="button"
        aria-label="显示大表情"
        aria-pressed={showBigEmote}
        className={`${toolbarButtonClass} ${showBigEmote ? "border-accent bg-accent-subtle text-accent-text" : "border-line bg-bg text-t2 hover:border-accent/50 hover:text-t1"}`}
        onClick={() => onChangeShowBigEmote(!showBigEmote)}
      >显示大表情</button>
    </div>
  );
}

function fallbackTitle(startedAt: number): string {
  const formatted = formatArchiveDateTime(startedAt);
  return formatted === "时间未知" ? "开播时间未知" : `${formatted} 直播`;
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

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`打开 ${record.userName || "未知用户"} 的符合条件事件，${formatArchiveDateTime(record.eventTs)}`}
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
          <span className="min-w-0 flex-1 truncate">{record.userName || "未知用户"}　{record.searchText || "暂时无法显示事件内容"}</span>
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
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const display = useGeneralSettings(state => state.eventDisplayPreferences);
  const groups = page?.items ?? [];

  if (error && !page) {
    return (
      <div role="alert" className="review-owner-event-results rounded-md border border-danger/40 bg-danger/10 px-3 py-3 ui-type-control text-danger">
        <p>历史事件检索失败：{error}</p>
        <button type="button" className={`${compactFilterActionButtonClass} mt-2 mr-2`} onClick={onRetry}>重试</button>
        <button type="button" className={`${compactFilterActionButtonClass} mt-2`} onClick={onClear}>清除条件</button>
      </div>
    );
  }

  if (loading && !page) {
    return <div role="status" aria-live="polite" className="review-owner-event-results rounded-md border border-line px-3 py-8 text-center ui-type-control text-t3">正在检索历史事件…</div>;
  }

  if (!hasConditions && groups.length === 0) {
    return <div className="rounded-md border border-dashed border-line px-3 py-8 text-center ui-type-control text-t3">输入关键词或选择事件条件后开始检索</div>;
  }

  if (!loading && groups.length === 0) {
    return (
      <div className="review-owner-event-results rounded-md border border-dashed border-line px-3 py-8 text-center ui-type-control text-t3">
        <p>没有找到符合条件的事件</p>
        <button type="button" className={`${compactFilterActionButtonClass} mt-2`} onClick={onClear}>清除条件</button>
      </div>
    );
  }

  return (
    <section aria-label="按直播场次分组的符合条件事件" data-style-api="1"  className="event-area review review-owner-event-results flex min-w-0 flex-col gap-2">

      {loading && <div role="status" aria-live="polite" className="ui-type-meta text-t3">正在检索历史事件…</div>}
      {error && page && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 ui-type-meta text-danger">
          <span>加载更多场次失败：{error}</span>
          <button type="button" className="rounded border border-danger/40 px-2 py-1 ui-type-meta hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring" onClick={onLoadMore}>重试</button>
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
              <button
                type="button"
                aria-expanded={!collapsed}
                aria-controls={`review-owner-event-matches-${session.sessionId}`}
                className="min-w-0 flex-1 truncate text-left ui-type-control text-t1 hover:text-accent-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
                onClick={() => setCollapsedGroups((current) => ({ ...current, [session.sessionId]: !collapsed }))}
              >{collapsed ? "▸" : "▾"} {session.title?.trim() || fallbackTitle(session.startedAt)}</button>
              <time className="shrink-0 ui-type-meta text-t3">{formatArchiveDateTime(session.startedAt)}</time>
              <span className="shrink-0 rounded-full bg-raised px-1.5 py-0.5 ui-type-meta text-t2">{formatArchiveSessionStatus(session.status)}</span>
              <span className="ui-type-meta text-t3">{formatArchiveRecordingStatus(session.recordingStatus)}</span>
              <span title={getArchiveRecordNotices(session).map(notice => `${notice.label}：${notice.message}`).join(" ") || undefined} className="ui-type-meta text-t3">{formatArchiveQuality(session.quality)}</span>
              <span className="shrink-0 ui-type-meta text-t2">符合条件 {matchCount} 条</span>
              <button
                type="button"
                disabled={!firstMatch}
                className="shrink-0 rounded-md border border-line px-2 py-1 ui-type-meta text-t2 enabled:hover:border-accent/50 enabled:hover:text-accent-text disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
                onClick={() => firstMatch && onOpenMatch(session.roomId, session.sessionId, firstMatch.eventKey)}
              >查看本场结果</button>
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
        <button type="button" disabled={loading} className="mx-auto rounded-md border border-line px-3 py-1.5 ui-type-control text-t2 enabled:hover:border-accent/50 enabled:hover:text-accent-text disabled:cursor-wait disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring" onClick={onLoadMore}>
          {loading ? "正在加载…" : "加载更多场次"}
        </button>
      )}
    </section>
  );
}
