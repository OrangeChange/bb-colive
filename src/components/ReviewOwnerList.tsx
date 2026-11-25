import { Checkbox } from "./shadcn/checkbox";
import { Button } from "./shadcn/button";
import { formatUiCurrency } from "../i18n/format.ts";
import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";
import { Pin as LucidePin, ChevronRight as LucideChevronRight } from "lucide-react";
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
  if (liveStatus === 1) return uiText("reviewOwnerList.liveStatusLabel");
  if (liveStatus === 2) return uiText("reviewOwnerList.liveStatusLabel2");
  if (liveStatus === 0) return uiText("reviewOwnerList.liveStatusLabel3");
  return uiText("reviewOwnerList.liveStatusLabel4");
}

function OwnerAvatar({ anchor }: { anchor: Anchor }) {
  useUiLanguage();
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
  useUiLanguage();
  const sessionCount = card.owner?.sessionCount ?? 0;
  const isLive = card.anchor.liveStatus === 1;
  return (
    <article className="group relative flex w-full items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 transition-colors hover:border-accent/60 hover:bg-raised">
      <Button variant="ghost" size={null}
        type="button"
        className="flex h-auto min-w-0 flex-1 justify-start border-0 bg-transparent hover:bg-transparent items-center gap-3 rounded-lg px-1 py-0.5 text-left after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
        aria-label={uiText("reviewOwnerList.aria_label", { uname: card.anchor.uname })}
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
            <span className="min-w-0 truncate text-t3" title={sessionCount > 0 ? uiText("reviewOwnerList.title", { sessionCount: sessionCount, value: formatArchiveDateTime(card.owner?.latestSessionAt) }) : undefined}>
              {sessionCount > 0 ? uiText("reviewOwnerList.OwnerCard", { sessionCount: sessionCount, value: formatArchiveDateTime(card.owner?.latestSessionAt) }) : ownersLoading ? uiText("reviewOwnerList.OwnerCard2") : uiText("reviewOwnerList.OwnerCard3")}
            </span>
          </span>
        </span>
      </Button>
      <Button variant="ghost" size="icon"
        type="button"
        aria-label={pinned ? uiText("reviewOwnerList.aria_label2", { uname: card.anchor.uname }) : uiText("reviewOwnerList.aria_label3", { uname: card.anchor.uname })}
        aria-pressed={pinned}
        title={pinned ? uiText("reviewOwnerList.title2") : uiText("reviewOwnerList.title3")}
        className={`relative z-10 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-accent-text transition-[opacity,background-color,color,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring ${pinned ? "bg-accent-subtle opacity-100" : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 hover:bg-accent-subtle"}`}
        onClick={() => onTogglePinned(card.roomId, !pinned)}
      >
        <LucidePin aria-hidden="true" className="size-4" fill={pinned ? "currentColor" : "none"} />
      </Button>
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
  useUiLanguage();
  const notices = getArchiveRecordNotices(session);
  const qualityNotice = notices.find((notice) => notice.kind === "quality");
  const noticeLabel = notices.map((notice) => `${notice.label}：${notice.message}`).join(" ");
  const protectedSession = isArchiveSessionRecording(session);
  return (
    <div className="review-session-row flex w-full items-stretch gap-2 border-b border-line px-3 py-2.5 transition-colors last:border-b-0 hover:bg-raised">
      {onToggle && (
        <label className="flex shrink-0 items-start pt-1.5" title={protectedSession ? uiText("reviewOwnerList.title4") : undefined}>
          <Checkbox

            checked={selected}
            disabled={protectedSession}
            aria-label={protectedSession ? uiText("reviewOwnerList.aria_label4", { value: session.title ?? uiText("reviewOwnerList.aria_label.value") }) : uiText("reviewOwnerList.aria_label5", { value: session.title ?? uiText("reviewOwnerList.aria_label.value") })}
            className="size-4 accent-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
            onCheckedChange={(event) => onToggle(session.sessionId, (event === true))}
          />
        </label>
      )}
      <ArchiveCoverThumbnail
        url={session.coverUrl}
        alt={(session.title ?? uiText("reviewOwnerList.alt")) + uiText("reviewOwnerList.alt2")}
        size="session-list"
      />
      <Button variant="ghost" size={null}
        type="button"
        className="flex h-auto min-w-0 flex-1 flex-col items-stretch justify-start gap-1 whitespace-normal border-0 bg-transparent p-0 hover:bg-transparent rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
        aria-label={uiText("reviewOwnerList.aria_label6", { value: session.title ?? uiText("reviewOwnerList.aria_label.value") })}
        onClick={() => onOpen(session.roomId, session.sessionId)}
      >
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span data-review-session-status={session.status} className={`shrink-0 rounded-full px-1.5 py-0.5 ui-type-meta ${session.status === "active" ? "bg-success/10 text-success" : "bg-raised text-t2"}`}>{formatArchiveSessionStatus(session.status)}</span>
          <span title={session.title ?? uiText("reviewOwnerList.title5")} className="min-w-24 flex-1 truncate ui-type-section-title text-t1">{session.title ?? uiText("reviewOwnerList.SessionRow")}</span>
          <span className="shrink-0 ui-type-meta text-t3">{formatArchiveDateTime(session.startedAt)}</span>
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-1 ui-type-meta text-t3">
          <span data-review-session-recording-status={session.recordingStatus}>{formatArchiveRecordingStatus(session.recordingStatus)}</span>
          <span data-review-session-quality={session.quality} title={noticeLabel || undefined} aria-label={qualityNotice ? `${formatArchiveQuality(session.quality)}：${qualityNotice.message}` : formatArchiveQuality(session.quality)} className={qualityNotice ? "text-warning" : "text-t3"}>{formatArchiveQuality(session.quality)}</span>
          <span>{formatArchiveSessionDuration(session.durationMs, session.status)}</span>
          <span>{session.eventCount ?? 0} {uiText("reviewOwnerList.SessionRow2")}</span>
          <span>{formatUiCurrency(session.paidTotal ?? 0)} {uiText("reviewOwnerList.SessionRow3")}</span>
          <span>{session.favoriteCount ?? 0} {uiText("reviewOwnerList.SessionRow4")}</span>
        </span>
      </Button>
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
  useUiLanguage();
  const pinnedOwnerRoomIds = useGeneralSettings((state) => state.reviewPinnedOwnerRoomIds);
  const setReviewOwnerPinned = useGeneralSettings((state) => state.setReviewOwnerPinned);
  const togglePinned = (roomId: number, pinned: boolean) => {
    setReviewOwnerPinned(roomId, pinned);
    recordArchiveDiagnostic("setting-change", "review-owner-pin", "changed", {
      stream: "render",
      data: { roomId, pinned },
    });
  };
  const selectableSessions = sessions.filter((session) => !isArchiveSessionRecording(session));
  const selectedSessionIdSet = new Set(selectedSessionIds);
  const allSelectableSelected = selectableSessions.length > 0 && selectableSessions.every((session) => selectedSessionIdSet.has(session.sessionId));
  const someSelectableSelected = selectableSessions.some((session) => selectedSessionIdSet.has(session.sessionId));



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
      <section aria-label={uiText("reviewOwnerList.aria_label7")} className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="ui-type-section-title text-t1">{uiText("reviewOwnerList.ReviewOwnerList")}</h2>
          <span className="ui-type-meta text-t3">{visibleCards.length} {uiText("reviewOwnerList.ReviewOwnerList2")}</span>
        </div>
        {visibleCards.length === 0 ? (
          <div className="ui-empty-state ui-empty-fill">
            <p>{ownersLoading ? uiText("reviewOwnerList.ReviewOwnerList3") : normalizedSearch ? uiText("reviewOwnerList.ReviewOwnerList4") : uiText("reviewOwnerList.ReviewOwnerList5")}</p>
            {!ownersLoading && (normalizedSearch && onClearSearch
              ? <Button variant="outline" type="button" className={compactFilterActionButtonClass} onClick={onClearSearch}>{uiText("reviewOwnerList.ReviewOwnerList6")}</Button>
              : !normalizedSearch && <p>{uiText("reviewOwnerList.ReviewOwnerList7")}</p>)}
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
    <section aria-label={uiText("reviewOwnerList.aria_label8")} className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h2 className="ui-type-section-title text-t1">{uiText("reviewOwnerList.ReviewOwnerList8")}</h2>
        <span className="ui-type-meta text-t3">{owner?.sessionCount ?? sessions.length} {uiText("reviewOwnerList.ReviewOwnerList9")}</span>
      </div>
      {onToggleSession && sessions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2" aria-label={uiText("reviewOwnerList.aria_label9")}>
          <label className="inline-flex items-center gap-2 ui-type-control text-t2">
            <Checkbox


              checked={someSelectableSelected && !allSelectableSelected ? "indeterminate" : allSelectableSelected}
              disabled={selectableSessions.length === 0}
              aria-label={uiText("reviewOwnerList.aria_label10")}
              className="size-4 accent-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
              onCheckedChange={(event) => onToggleAllSessions?.((event === true))}
            />
            <span>{uiText("reviewOwnerList.ReviewOwnerList10")}</span>
          </label>
          <span className="ui-type-meta text-t3">{uiText("reviewOwnerList.ReviewOwnerList11")}{selectedSessionIds.length} {uiText("reviewOwnerList.ReviewOwnerList9")}</span>
          {owner && owner.sessionCount > sessions.length && <span className="ui-type-meta text-warning">{uiText("reviewOwnerList.ReviewOwnerList12")}{sessions.length} / {owner.sessionCount} {uiText("reviewOwnerList.ReviewOwnerList13")}</span>}
          <span className="mr-auto ui-type-meta text-t3">{uiText("reviewOwnerList.ReviewOwnerList14")}</span>
          <Button variant="outline" type="button" disabled={selectedSessionIds.length === 0} className={compactFilterActionButtonClass} onClick={onExportSelected}>{uiText("reviewOwnerList.ReviewOwnerList15")}</Button>
          <Button variant="outline" type="button" disabled={selectedSessionIds.length === 0} className={compactDangerActionButtonClass} onClick={onDeleteSelected}>{uiText("reviewOwnerList.ReviewOwnerList16")}</Button>
          <Button variant="outline" type="button" disabled={selectedSessionIds.length === 0} className={compactFilterActionButtonClass} onClick={onClearSelection}>{uiText("reviewOwnerList.ReviewOwnerList17")}</Button>
        </div>
      )}
      <div data-empty={sessions.length === 0 || undefined} className="review-session-list overflow-hidden rounded-xl border border-line bg-surface">
        {sessionsLoading ? (
          <div className="ui-empty-state ui-empty-fill">{uiText("reviewOwnerList.ReviewOwnerList18")}</div>
        ) : sessions.length === 0 ? (
          <div className="ui-empty-state ui-empty-fill">{uiText("reviewOwnerList.ReviewOwnerList19")}</div>
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
        <Button variant="outline"
          type="button"
          disabled={sessionsLoadingMore}
          className="self-center rounded-lg border border-line bg-surface px-3 py-1.5 ui-type-control text-t2 transition-colors enabled:hover:border-accent enabled:hover:text-accent-text disabled:cursor-wait disabled:opacity-60"
          onClick={onLoadMoreSessions}
        >{sessionsLoadingMore ? uiText("reviewOwnerList.ReviewOwnerList20") : uiText("reviewOwnerList.ReviewOwnerList21", { length: sessions.length, value: owner?.sessionCount ?? uiText("reviewOwnerList.ReviewOwnerList.value") })}</Button>
      )}
    </section>
  );
}
