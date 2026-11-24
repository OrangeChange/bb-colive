import { Pin as LucidePin, ChevronRight as LucideChevronRight } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Anchor } from "../protocol/anchors.ts";
import type {
  ArchiveOwnerSummary,
  ArchiveSessionSummary,
} from "../archive/archiveTypes.ts";
import { mergeReviewOwners, type ReviewOwnerCardData } from "../archive/archiveState.ts";
import { recordArchiveDiagnostic } from "../archive/archiveDiagnostics.ts";
import { getArchiveRecordNotices } from "../archive/archiveQuality.ts";
import { formatArchiveDateTime, formatArchiveSessionDuration, formatArchiveSessionStatus, formatArchiveRecordingStatus, formatArchiveQuality } from "../archive/archiveDisplay.ts";
import { isArchiveSessionRecording } from "../archive/archiveSessionState.ts";
import { useGeneralSettings } from "../generalSettings.ts";
import { ArchiveCoverThumbnail } from "./ArchiveCoverThumbnail";
import { compactDangerActionButtonClass, compactFilterActionButtonClass } from "./actionButtonStyles";

export interface ReviewOwnerListProps {
  level: "home" | "owner";
  anchors: readonly Anchor[];
  owners: readonly ArchiveOwnerSummary[];
  sessions: readonly ArchiveSessionSummary[];
  owner: ArchiveOwnerSummary | null;
  ownersLoading?: boolean;
  sessionsLoading?: boolean;
  sessionsLoadingMore?: boolean;
  hasMoreSessions?: boolean;
  onLoadMoreSessions?: () => void;
  onOpenOwner: (roomId: number) => void;
  onOpenSession: (roomId: number, sessionId: string) => void;
  ownerSearchText?: string;
  onClearSearch?: () => void;
  selectedSessionIds?: readonly string[];
  onToggleSession?: (sessionId: string, selected: boolean) => void;
  onToggleAllSessions?: (selected: boolean) => void;
  onDeleteSelected?: () => void;
  onExportSelected?: () => void;
  onClearSelection?: () => void;
}

function liveStatusLabel(liveStatus: Anchor["liveStatus"]): string {
  if (liveStatus === 1) return "直播中";
  if (liveStatus === 2) return "轮播中";
  if (liveStatus === 0) return "未开播";
  return "状态未知";
}

function OwnerAvatar({ anchor }: { anchor: Anchor }) {
  const isLive = anchor.liveStatus === 1;
  return (
    <span className={`review-owner-avatar relative flex size-12 shrink-0 items-center justify-center rounded-full ${isLive ? "review-live-pulse text-accent-text" : ""}`}>
      {anchor.face ? (
        <img
          src={anchor.face}
          alt=""
          referrerPolicy="no-referrer"
          className="relative z-1 size-12 rounded-full bg-raised object-cover"
        />
      ) : (
        <span className="relative z-1 flex size-12 items-center justify-center rounded-full bg-accent-subtle ui-type-section-title text-accent-text">
          {anchor.uname.slice(0, 1)}
        </span>
      )}
    </span>
  );
}

function OwnerCard({
  card,
  onOpen,
  pinned,
  onTogglePinned,
  ownersLoading,
}: {
  card: ReviewOwnerCardData;
  onOpen: (roomId: number) => void;
  pinned: boolean;
  onTogglePinned: (roomId: number, pinned: boolean) => void;
  ownersLoading: boolean;
}) {
  const sessionCount = card.owner?.sessionCount ?? 0;
  const isLive = card.anchor.liveStatus === 1;
  return (
    <article className="group relative flex w-full items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 transition-colors hover:border-accent/60 hover:bg-raised">
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-0.5 text-left after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
        aria-label={`打开${card.anchor.uname}的主播档案`}
        onClick={() => onOpen(card.roomId)}
      >
        <OwnerAvatar anchor={card.anchor} />
        <span className="min-w-0 flex-1">
          <span className="block truncate ui-type-section-title text-t1" title={card.anchor.uname}>{card.anchor.uname}</span>
          <span className="mt-1 flex min-w-0 items-center gap-2 ui-type-meta">
            <span className={`review-live-status inline-flex shrink-0 items-center gap-1 ${isLive ? "review-live-status--live text-accent-text" : "text-t3"}`}>
              <span className={`size-1.5 rounded-full ${isLive ? "bg-accent" : "bg-t3"}`} aria-hidden="true" />
              {liveStatusLabel(card.anchor.liveStatus)}
            </span>
            <span className="min-w-0 truncate text-t3" title={sessionCount > 0 ? `${sessionCount} 场 · 最近 ${formatArchiveDateTime(card.owner?.latestSessionAt)}` : undefined}>
              {sessionCount > 0 ? `${sessionCount} 场 · 最近 ${formatArchiveDateTime(card.owner?.latestSessionAt)}` : ownersLoading ? "正在加载…" : "暂无档案"}
            </span>
          </span>
        </span>
      </button>
      <button
        type="button"
        aria-label={pinned ? `取消置顶${card.anchor.uname}` : `置顶主播${card.anchor.uname}`}
        aria-pressed={pinned}
        title={pinned ? "取消置顶" : "置顶主播"}
        className={`relative z-10 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-accent-text transition-[opacity,background-color,color,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring ${pinned ? "bg-accent-subtle opacity-100" : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 hover:bg-accent-subtle"}`}
        onClick={() => onTogglePinned(card.roomId, !pinned)}
      >
        <LucidePin aria-hidden="true" className="size-4" fill={pinned ? "currentColor" : "none"} />
      </button>
      <LucideChevronRight aria-hidden="true" className="pointer-events-none size-4 shrink-0 text-t3 transition-transform group-hover:translate-x-0.5 group-hover:text-accent-text" />
    </article>
  );
}

function SessionRow({
  session,
  onOpen,
  selected,
  onToggle,
}: {
  session: ArchiveSessionSummary;
  onOpen: (roomId: number, sessionId: string) => void;
  selected: boolean;
  onToggle?: (sessionId: string, selected: boolean) => void;
}) {
  const notices = getArchiveRecordNotices(session);
  const qualityNotice = notices.find((notice) => notice.kind === "quality");
  const noticeLabel = notices.map((notice) => `${notice.label}：${notice.message}`).join(" ");
  const protectedSession = isArchiveSessionRecording(session);
  return (
    <div className="review-session-row flex w-full items-stretch gap-2 border-b border-line px-3 py-2.5 transition-colors last:border-b-0 hover:bg-raised">
      {onToggle && (
        <label className="flex shrink-0 items-start pt-1.5" title={protectedSession ? "记录中或重连中的场次不可删除" : undefined}>
          <input
            type="checkbox"
            checked={selected}
            disabled={protectedSession}
            aria-label={protectedSession ? `${session.title ?? "未命名场次"}，记录中或重连中的场次不可删除` : `选择${session.title ?? "未命名场次"}`}
            className="size-4 accent-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
            onChange={(event) => onToggle(session.sessionId, event.currentTarget.checked)}
          />
        </label>
      )}
      <ArchiveCoverThumbnail
        url={session.coverUrl}
        alt={(session.title ?? "未命名场次") + "封面"}
        size="session-list"
      />
      <button
        type="button"
        className="flex min-w-0 flex-1 flex-col gap-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
        aria-label={`打开直播场次 ${session.title ?? "未命名场次"}`}
        onClick={() => onOpen(session.roomId, session.sessionId)}
      >
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span data-review-session-status={session.status} className={`shrink-0 rounded-full px-1.5 py-0.5 ui-type-meta ${session.status === "active" ? "bg-success/10 text-success" : "bg-raised text-t2"}`}>{formatArchiveSessionStatus(session.status)}</span>
          <span title={session.title ?? "未命名场次"} className="min-w-24 flex-1 truncate ui-type-section-title text-t1">{session.title ?? "未命名场次"}</span>
          <span className="shrink-0 ui-type-meta text-t3">{formatArchiveDateTime(session.startedAt)}</span>
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-1 ui-type-meta text-t3">
          <span data-review-session-recording-status={session.recordingStatus}>{formatArchiveRecordingStatus(session.recordingStatus)}</span>
          <span data-review-session-quality={session.quality} title={noticeLabel || undefined} aria-label={qualityNotice ? `${formatArchiveQuality(session.quality)}：${qualityNotice.message}` : formatArchiveQuality(session.quality)} className={qualityNotice ? "text-warning" : "text-t3"}>{formatArchiveQuality(session.quality)}</span>
          <span>{formatArchiveSessionDuration(session.durationMs, session.status)}</span>
          <span>{session.eventCount ?? 0} 事件</span>
          <span>{session.paidTotal ?? 0} 付费</span>
          <span>{session.favoriteCount ?? 0} 收藏</span>
        </span>
      </button>
    </div>
  );
}

export function ReviewOwnerList({
  level,
  anchors,
  owners,
  sessions,
  owner,
  ownersLoading = false,
  sessionsLoading = false,
  sessionsLoadingMore = false,
  hasMoreSessions = false,
  onLoadMoreSessions,
  onOpenOwner,
  onOpenSession,
  ownerSearchText = "",
  onClearSearch,
  selectedSessionIds = [],
  onToggleSession,
  onToggleAllSessions,
  onDeleteSelected,
  onExportSelected,
  onClearSelection,
}: ReviewOwnerListProps) {
  const pinnedOwnerRoomIds = useGeneralSettings((state) => state.reviewPinnedOwnerRoomIds);
  const setReviewOwnerPinned = useGeneralSettings((state) => state.setReviewOwnerPinned);
  const togglePinned = (roomId: number, pinned: boolean) => {
    setReviewOwnerPinned(roomId, pinned);
    recordArchiveDiagnostic("setting-change", "review-owner-pin", "changed", {
      stream: "render",
      data: { roomId, pinned },
    });
  };
  const selectAllRef = useRef<HTMLInputElement>(null);
  const selectableSessions = sessions.filter((session) => !isArchiveSessionRecording(session));
  const selectedSessionIdSet = new Set(selectedSessionIds);
  const allSelectableSelected = selectableSessions.length > 0 && selectableSessions.every((session) => selectedSessionIdSet.has(session.sessionId));
  const someSelectableSelected = selectableSessions.some((session) => selectedSessionIdSet.has(session.sessionId));

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelectableSelected && !allSelectableSelected;
  }, [allSelectableSelected, someSelectableSelected]);

  if (level === "home") {
    const pinned = new Set(pinnedOwnerRoomIds);
    const cards = mergeReviewOwners(anchors, owners).sort((left, right) => Number(pinned.has(right.roomId)) - Number(pinned.has(left.roomId)));
    const normalizedSearch = ownerSearchText.trim().toLocaleLowerCase();
    const visibleCards = normalizedSearch
      ? cards.filter((card) => [card.anchor.uname, String(card.roomId), card.owner?.name, card.owner?.uid]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase().includes(normalizedSearch)))
      : cards;
    return (
      <section aria-label="主播档案列表" className="flex min-h-0 flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="ui-type-section-title text-t1">主播档案</h2>
          <span className="ui-type-meta text-t3">{visibleCards.length} 位主播</span>
        </div>
        {visibleCards.length === 0 ? (
          <div className="px-4 py-8 text-center ui-type-control text-t3">
            <p>{ownersLoading ? "正在加载主播档案…" : normalizedSearch ? "没有匹配的主播档案" : "暂无主播档案"}</p>
            {!ownersLoading && (normalizedSearch && onClearSearch
              ? <button type="button" className={`${compactFilterActionButtonClass} mt-3`} onClick={onClearSearch}>清除搜索</button>
              : !normalizedSearch && <p className="mt-2">连接直播间后会自动记录，也可在设置中导入已有档案。</p>)}
          </div>
        ) : (
          <div className="grid min-w-0 gap-2.5">
            {visibleCards.map((card) => (
              <OwnerCard
                key={card.roomId}
                card={card}
                onOpen={onOpenOwner}
                ownersLoading={ownersLoading}
                pinned={pinned.has(card.roomId)}
                onTogglePinned={togglePinned}
              />
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <section aria-label="直播场次" className="flex min-h-0 flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h2 className="ui-type-section-title text-t1">直播场次</h2>
        <span className="ui-type-meta text-t3">{owner?.sessionCount ?? sessions.length} 场</span>
      </div>
      {onToggleSession && sessions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2" aria-label="场次批量操作">
          <label className="inline-flex items-center gap-2 ui-type-control text-t2">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allSelectableSelected}
              disabled={selectableSessions.length === 0}
              aria-label="全选当前列表"
              className="size-4 accent-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
              onChange={(event) => onToggleAllSessions?.(event.currentTarget.checked)}
            />
            <span>全选当前列表</span>
          </label>
          <span className="ui-type-meta text-t3">已选 {selectedSessionIds.length} 场</span>
          {owner && owner.sessionCount > sessions.length && <span className="ui-type-meta text-warning">已显示 {sessions.length} / {owner.sessionCount} 场；全选只作用于当前列表</span>}
          <span className="mr-auto ui-type-meta text-t3">记录中或重连中的场次不可删除</span>
          <button type="button" disabled={selectedSessionIds.length === 0} className={compactFilterActionButtonClass} onClick={onExportSelected}>导出所选</button>
          <button type="button" disabled={selectedSessionIds.length === 0} className={compactDangerActionButtonClass} onClick={onDeleteSelected}>删除所选</button>
          <button type="button" disabled={selectedSessionIds.length === 0} className={compactFilterActionButtonClass} onClick={onClearSelection}>清除选择</button>
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        {sessionsLoading ? (
          <div className="px-3 py-8 text-center ui-type-control text-t3">正在加载场次…</div>
        ) : sessions.length === 0 ? (
          <div className="px-3 py-8 text-center ui-type-control text-t3">暂无场次</div>
        ) : (
          sessions.map((session) => (
            <SessionRow
              key={session.sessionId}
              session={session}
              onOpen={onOpenSession}
              selected={selectedSessionIdSet.has(session.sessionId)}
              onToggle={onToggleSession}
            />
          ))
        )}
      </div>
      {hasMoreSessions && (
        <button
          type="button"
          disabled={sessionsLoadingMore}
          className="self-center rounded-lg border border-line bg-surface px-3 py-1.5 ui-type-control text-t2 transition-colors enabled:hover:border-accent enabled:hover:text-accent-text disabled:cursor-wait disabled:opacity-60"
          onClick={onLoadMoreSessions}
        >{sessionsLoadingMore ? "正在加载…" : `加载更多场次（${sessions.length}/${owner?.sessionCount ?? "更多"}）`}</button>
      )}
    </section>
  );
}
