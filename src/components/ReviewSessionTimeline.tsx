import { uiText } from "../i18n/index.ts";
import { ChevronDown as LucideChevronDown } from "lucide-react";
import { useReviewTimelineRefresh } from "../archive/useReviewTimelineRefresh.ts";
import { createReviewTimelineEntries, type ReviewTimelineEntry } from "../archive/reviewTimelineEntries.ts";
import { useReviewTimelineReading } from "../archive/useReviewTimelineReading.ts";
import { useReviewTimelinePages } from "../archive/useReviewTimelinePages.ts";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type UIEvent, type WheelEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { createPortal } from "react-dom";
import type { DanmakuEvent, DanmakuUser } from "../protocol/types.ts";
import type { EventDisplayPreferences } from "../eventDisplaySettings.ts";
import { DEFAULT_EVENT_DISPLAY_PREFERENCES } from "../eventDisplaySettings.ts";
import type {
  ArchiveFilterState,
  ArchiveReadingState,
  ArchiveSessionSummary,
  ArchiveRepositoryContract,
  ArchiveSearchScope,
  ArchiveSortDirection,
} from "../archive/archiveTypes.ts";
import { hasArchiveKeywordConditions } from "../archive/archiveQuery.ts";
import {
  getReviewInitialQueryDirections,
  restoreReadingPosition,
} from "../archive/archiveState.ts";
import {
  canRestoreReviewTimelineScrollAnchor,
  getReviewTimelineLatestAlignment,
  isReviewTimelineAtLatest,
  isReviewTimelineItemVisible,
  releaseReviewTimelineReadingProtection,
  shouldCompleteReviewTimelineLocation,
  shouldPauseReviewTimelineAutomation,
} from "../archive/reviewTimelineNavigation.ts";
import {
  findProjectedEventBySourceKey,
  projectArchiveEvents,
  type ArchiveProjectedEvent,
} from "../archive/archiveProjection.ts";
import { EventRow } from "./EventRow.tsx";
import { EventRowSlot } from "./EventRowSlot.tsx";
import { getReviewVirtualMeasurementProps, measureLoadedReviewRow } from "./reviewVirtualMeasurement.ts";
import type { EventMenuHandlers } from "./EventContextMenu.tsx";
import { GiftEffectOverlay } from "./GiftEffectOverlay.tsx";
import type { GiftEffectNotice } from "../windows/giftEffectBus.ts";
import { getGiftEffect } from "../protocol/giftEffects.ts";
import { observeRenderedEventRows } from "../diagnostics/renderLogger.ts";
import {
  recordArchiveDiagnostic,
  recordArchiveProjection,
  recordArchiveRender,
  updateArchiveReviewState,
} from "../archive/archiveDiagnostics.ts";
import { getArchiveRecordNotices } from "../archive/archiveQuality.ts";
import { ArchiveCloudDetails } from './ArchiveCloudDetails';
import { formatArchiveDateTime, formatArchiveSessionStatus, formatArchiveRecordingStatus, formatArchiveQuality } from "../archive/archiveDisplay.ts";
import { dismissArchiveNotice, loadDismissedArchiveNotices } from "../archive/archiveNoticeState.ts";
import type { ReviewReadingMemoryPosition, ReviewReadingMemoryStore } from "../archive/reviewReadingMemory.ts";

const ARCHIVE_PENDING_INDICATOR_DELAY_MS = 400;
const REVIEW_FOLLOW_THRESHOLD = 1;
const EMPTY_ARCHIVE_FILTERS: ArchiveFilterState = {};

function boundaryNoticeLabel(entry: Extract<ReviewTimelineEntry, { kind: "boundary" }>): string {
  return getArchiveRecordNotices({ ...entry, startedAt: entry.startedAt ?? undefined, status: entry.status ?? undefined, quality: entry.quality ?? undefined })
    .map(notice => `${notice.label}：${notice.message}`).join(" ");
}

function ArchiveNotice({ notice, onDismiss }: {
  notice: ReturnType<typeof getArchiveRecordNotices>[number];
  onDismiss: (code: string) => void;
}) {
  const warning = notice.tone === "warning";
  return (
    <div className={`flex shrink-0 items-start gap-2 border-b px-3 py-1.5 ui-type-meta ${warning ? "border-warning/30 bg-warning/5 text-warning" : "border-line bg-raised text-t2"}`}>
      <span className="min-w-0 flex-1">{notice.label}：{notice.message}</span>
      <button
        type="button"
        className="-my-0.5 shrink-0 rounded px-1 text-lg leading-5 opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
        aria-label={uiText("reviewSessionTimeline.aria_label", { label: notice.label })}
        title={uiText("reviewSessionTimeline.title")}
        onClick={() => onDismiss(notice.code)}
      >×</button>
    </div>
  );
}

export interface ReviewSessionTimelineProps {
  repository: ArchiveRepositoryContract;
  readingMemory: ReviewReadingMemoryStore;
  sessionId: string;
  ownerId?: string;
  searchScope?: ArchiveSearchScope;
  active?: boolean;
  filters?: ArchiveFilterState;
  targetEventKey?: string | null;
  onTargetEventConsumed?: (found: boolean) => void;
  direction?: ArchiveSortDirection;
  refreshKey?: unknown;
  displayPreferences?: EventDisplayPreferences;
  onUserFilter?: (user: DanmakuUser) => void;
  isUserFiltered?: (user: DanmakuUser) => boolean;
  onClearUserFilter?: () => void;
  onViewContext?: (eventKey: string) => void;
  onSpeakEvent: (event: DanmakuEvent) => void;
  onSaveNickname?: (user: DanmakuUser, nickname: string) => void;
  onDeleteNickname?: (user: DanmakuUser) => void;
  onOpenUser?: (user: DanmakuUser) => void;
  onToggleFavorite: (row: ArchiveProjectedEvent, favorited: boolean) => Promise<void> | void;
  onEditFavorite?: (row: ArchiveProjectedEvent) => void | Promise<void>;
  favoriteEditOnAdd?: boolean;
  archiveWriterStatus?: "pending" | "failed";
  onScrollIntent?: (intent: "up" | "down", atTimelineTop: boolean) => void;
  onChangeSortDirection?: (direction: ArchiveSortDirection) => void;
  onToggleShowBigEmote?: (show: boolean) => void;
  session?: Pick<ArchiveSessionSummary, "status" | "recordingStatus" | "quality" | "qualityReason" | "qualityReasons" | "stopReason" | "titleSource" | "identityEvidence" | "cloudMetadata">;
}

export function ReviewSessionTimeline({
  repository,
  readingMemory,
  sessionId,
  ownerId,
  searchScope = "session",
  active = true,
  filters,
  targetEventKey,
  onTargetEventConsumed,
  direction = "desc",
  refreshKey,
  displayPreferences = DEFAULT_EVENT_DISPLAY_PREFERENCES,
  onUserFilter,
  isUserFiltered,
  onClearUserFilter,
  onViewContext,
  onSpeakEvent,
  onSaveNickname,
  onDeleteNickname,
  onOpenUser,
  onToggleFavorite,
  onEditFavorite,
  favoriteEditOnAdd,
  archiveWriterStatus,
  onScrollIntent,
  onChangeSortDirection,
  onToggleShowBigEmote,
  session,
}: ReviewSessionTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const {
    navigationState,
    setNavigationState,
    readingReadyRef,
    restorePendingRef,
    locatingTargetKeyRef,
    locatingTargetFrameRef,
    locatingTargetOffsetRef,
    locatingTargetStableFramesRef,
    searchLocatePendingRef,
    skipNextReadingSaveRef,
    readingRestorePositionRef,
    readingSaveTimerRef,
    highlightTimerRef,
    programmaticLatestScrollRef,
    latestJumpFrameRef,
    latestJumpStableFramesRef,
    highlightedEventKey,
    readingAction,
    readingActionRevision,
    locatingTargetKey,
    targetLocateMessage,
    followingLatest,
    latestResumeRevision,
    followingLatestRef,
    lockedTargetScrollAnchorRef,
    targetReloadRevision,
    latestJumpDirectionRef,
    setHighlightedEventKey,
    setReadingAction,
    setReadingActionRevision,
    setLocatingTargetKey,
    setTargetLocateMessage,
    setLatestResumeRevision,
    setTargetReloadRevision,
    activeTargetEventKey,
    pendingTargetEventKey,
    updateFollowingLatest,
    completeTargetLocation,
  } = useReviewTimelineReading({ sessionId, targetEventKey, onTargetEventConsumed });
  const startedQueryKeyRef = useRef<string | null>(null);
  const startedDataQueryKeyRef = useRef<string | null>(null);
  const startedDirectionRef = useRef<ArchiveSortDirection | null>(null);
  const loadedRef = useRef(false);
  const targetQueryKeyRef = useRef<string | null>(null);
  const [showArchivePending, setShowArchivePending] = useState(false);
  const [favoriteOverrides, setFavoriteOverrides] = useState<Record<string, boolean>>({});
  const [favoriteErrors, setFavoriteErrors] = useState<Record<string, string>>({});
  const [giftEffectNotices, setGiftEffectNotices] = useState<GiftEffectNotice[]>([]);
  const readingReady = true;
  const [displayMenuOpen, setDisplayMenuOpen] = useState(false);
  const displayMenuRef = useRef<HTMLDivElement>(null);
  const displayPanelRef = useRef<HTMLDivElement>(null);
  const displayTriggerRef = useRef<HTMLButtonElement>(null);
  const [displayMenuPosition, setDisplayMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [collapsedSessions, setCollapsedSessions] = useState<Set<string>>(() => new Set());
  const [dismissedNoticeState, setDismissedNoticeState] = useState(() => ({
    sessionId,
    codes: new Set(loadDismissedArchiveNotices(sessionId)),
  }));
  const lastRenderDiagnosticRef = useRef<string>("");
  useEffect(() => {
    if (archiveWriterStatus !== "pending") {
      setShowArchivePending(false);
      return;
    }
    setShowArchivePending(false);
    const timer = setTimeout(() => setShowArchivePending(true), ARCHIVE_PENDING_INDICATOR_DELAY_MS);
    return () => clearTimeout(timer);
  }, [archiveWriterStatus, sessionId]);

  const archiveFilters = filters ?? EMPTY_ARCHIVE_FILTERS;
  const ownerHistory = searchScope === "owner" && ownerId !== undefined;
  const keywordSearchActive = hasArchiveKeywordConditions(archiveFilters);
  const getReadingAnchorRef = useRef<() => ArchiveReadingState | null>(() => null);
  const {
    requestGenerationRef,
    loadingGenerationByDirectionRef,
    cursorByDirectionRef,
    pendingInitialDirectionsRef,
    recordsRef,
    reviewEventWatermarkRef,
    reviewAnimationKeysRef,
    records,
    totalCount,
    nextCursor,
    loaded,
    loading,
    error,
    setRecords,
    setTotalCount,
    setNextCursor,
    setError,
    loadDirectionPage,
    resetPages,
  } = useReviewTimelinePages({ repository, sessionId, ownerId, searchScope, archiveFilters, direction, active, readingReady, getReadingAnchorRef });
  loadedRef.current = loaded;
  useEffect(() => {
    if (!displayMenuOpen) {
      setDisplayMenuPosition(null);
      return;
    }
    const syncPosition = () => {
      const trigger = displayTriggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const width = 210;
      const margin = 8;
      setDisplayMenuPosition({
        top: Math.min(rect.bottom + 6, window.innerHeight - 120),
        left: Math.max(margin, Math.min(rect.right - width, window.innerWidth - width - margin)),
      });
    };
    syncPosition();
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !displayMenuRef.current?.contains(target) && !displayPanelRef.current?.contains(target)) setDisplayMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDisplayMenuOpen(false);
    };
    window.addEventListener("resize", syncPosition);
    window.addEventListener("scroll", syncPosition, true);
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", syncPosition);
      window.removeEventListener("scroll", syncPosition, true);
    };
  }, [displayMenuOpen]);

  useEffect(() => {
    setDismissedNoticeState({
      sessionId,
      codes: new Set(loadDismissedArchiveNotices(sessionId)),
    });
  }, [sessionId]);

  const dismissNotice = useCallback((code: string) => {
    dismissArchiveNotice(sessionId, code);
    setDismissedNoticeState((current) => {
      const codes = current.sessionId === sessionId ? new Set(current.codes) : new Set<string>();
      codes.add(code);
      return { sessionId, codes };
    });
  }, [sessionId]);

  const getReadingAnchor = useCallback((): ArchiveReadingState | null => {
    const targetAnchorEventKey = targetEventKey ?? activeTargetEventKey;
    if (targetAnchorEventKey) {
      return {
        sessionId,
        eventKey: targetAnchorEventKey,
        fallbackEventTs: null,
        sortDirection: direction,
        filters: archiveFilters,
        searchScope,
        updatedAt: Date.now(),
      };
    }
    if (keywordSearchActive) return null;
    const position = readingMemory.get(sessionId);
    if (!position) return null;
    return {
      sessionId,
      eventKey: position.eventKey,
      fallbackEventTs: position.eventTs,
      sortDirection: direction,
      filters: archiveFilters,
      searchScope,
      updatedAt: position.updatedAt,
    };
  }, [activeTargetEventKey, archiveFilters, direction, keywordSearchActive, readingMemory, searchScope, sessionId, targetEventKey]);
  getReadingAnchorRef.current = getReadingAnchor;

  const loadNextPage = useCallback((pageDirection: ArchiveSortDirection = direction) => {
    return loadDirectionPage(pageDirection);
  }, [direction, loadDirectionPage]);

  const dataQueryKey = useMemo(() => JSON.stringify({
    sessionId,
    ownerId: ownerHistory ? ownerId : null,
    searchScope,
    archiveFilters,
    readingReady,
    targetReloadRevision,
  }), [archiveFilters, ownerHistory, ownerId, readingReady, searchScope, sessionId, targetReloadRevision]);
  const queryKey = useMemo(() => JSON.stringify({ dataQueryKey, direction }), [dataQueryKey, direction]);
  useEffect(() => {
    if (active && readingReadyRef.current && startedQueryKeyRef.current === queryKey) return;
    const preserveLoadedWindowForDirectionChange = Boolean(
      active
      && readingReadyRef.current
      && loadedRef.current
      && recordsRef.current.length > 0
      && !pendingTargetEventKey
      && !keywordSearchActive
      && loadingGenerationByDirectionRef.current.size === 0
      && startedDataQueryKeyRef.current === dataQueryKey
      && startedDirectionRef.current !== null
      && startedDirectionRef.current !== direction,
    );
    if (!active) {
      startedQueryKeyRef.current = null;
      startedDataQueryKeyRef.current = null;
      startedDirectionRef.current = null;
    }
    if (active && readingReadyRef.current) {
      startedQueryKeyRef.current = queryKey;
      startedDataQueryKeyRef.current = dataQueryKey;
      startedDirectionRef.current = direction;
    }
    if (preserveLoadedWindowForDirectionChange) {
      setNextCursor(cursorByDirectionRef.current[direction]);
      setError(null);
      return;
    }
    targetQueryKeyRef.current = pendingTargetEventKey;
    resetPages([], Boolean(pendingTargetEventKey));
    lockedTargetScrollAnchorRef.current = null;
    readingRestorePositionRef.current = null;
    locatingTargetOffsetRef.current = null;
    locatingTargetStableFramesRef.current = 0;
    if (locatingTargetFrameRef.current !== null) cancelAnimationFrame(locatingTargetFrameRef.current);
    locatingTargetFrameRef.current = null;
    loadedRef.current = false;
    locatingTargetKeyRef.current = null;
    setLocatingTargetKey(null);
    setTargetLocateMessage(null);
    setError(null);
    setFavoriteOverrides({});
    setFavoriteErrors({});
    setHighlightedEventKey(null);
    latestJumpDirectionRef.current = null;
    setCollapsedSessions(new Set());
    if (highlightTimerRef.current !== null) clearTimeout(highlightTimerRef.current);
    if (!active || !readingReadyRef.current) return;
    restorePendingRef.current = true;
    searchLocatePendingRef.current = keywordSearchActive;
    const initialDirections = getReviewInitialQueryDirections(
      direction,
      getReadingAnchorRef.current() !== null,
      followingLatestRef.current,
    );
    pendingInitialDirectionsRef.current = new Set(initialDirections);
    for (const pageDirection of initialDirections) {
      void loadDirectionPage(pageDirection);
    }
  }, [active, dataQueryKey, direction, keywordSearchActive, loadDirectionPage, pendingTargetEventKey, queryKey]);

  useEffect(() => {
    if (!active || !readingReady || !pendingTargetEventKey || pendingTargetEventKey === targetQueryKeyRef.current) return;
    targetQueryKeyRef.current = pendingTargetEventKey;
    setTargetReloadRevision((revision) => revision + 1);
  }, [active, pendingTargetEventKey, readingReady]);

  useEffect(() => {
    if (!pendingTargetEventKey) targetQueryKeyRef.current = null;
  }, [pendingTargetEventKey]);

  useReviewTimelineRefresh({
    active,
    archiveFilters,
    direction,
    latestResumeRevision,
    loaded,
    locatingTargetKey,
    ownerId,
    pendingTargetEventKey,
    refreshKey,
    repository,
    searchScope,
    sessionId,
    readingReadyRef,
    restorePendingRef,
    locatingTargetKeyRef,
    followingLatestRef,
    programmaticLatestScrollRef,
    requestGenerationRef,
    recordsRef,
    setRecords,
    reviewEventWatermarkRef,
    reviewAnimationKeysRef,
    setTotalCount,
    setError,
  });

  useEffect(() => {
    setGiftEffectNotices([]);
  }, [queryKey]);

  const projectedBase = useMemo(() => projectArchiveEvents(records, {
    showAutoDanmaku: displayPreferences.showAutoDanmaku,
    showPhoneNotVerified: displayPreferences.showPhoneNotVerified,
    filters: archiveFilters,
    direction,
  }), [archiveFilters, direction, records, displayPreferences.showAutoDanmaku, displayPreferences.showPhoneNotVerified]);
  const projected = useMemo(() => projectedBase.map((row) => (
    Object.prototype.hasOwnProperty.call(favoriteOverrides, row.eventKey)
      ? { ...row, favorited: favoriteOverrides[row.eventKey] }
      : row
  )), [favoriteOverrides, projectedBase]);
  const displayProjected = projected;

  const timelineEntries = useMemo(() => createReviewTimelineEntries(displayProjected, ownerHistory, collapsedSessions), [collapsedSessions, displayProjected, ownerHistory]);

  const latestEventTimelineIndex = useMemo(() => {
    if (direction === "desc") return timelineEntries.findIndex((entry) => entry.kind === "event");
    for (let index = timelineEntries.length - 1; index >= 0; index -= 1) {
      if (timelineEntries[index]?.kind === "event") return index;
    }
    return -1;
  }, [direction, timelineEntries]);

  const virtualizer = useVirtualizer({
    count: timelineEntries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      return timelineEntries[index]?.kind === "event" ? 36 : 42;
    },
    overscan: 10,
    anchorTo: direction === "asc" ? "end" : "start",
    followOnAppend: direction === "asc" && followingLatest,
    scrollEndThreshold: REVIEW_FOLLOW_THRESHOLD,
    useAnimationFrameWithResizeObserver: true,
    getItemKey: (index) => timelineEntries[index]?.key ?? index,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const measureAfterContentLoad = useCallback((element: HTMLImageElement) => {
    measureLoadedReviewRow(element, virtualizer.measureElement);
  }, [virtualizer]);
  const scrollToLatestEdge = useCallback(() => {
    const latestIndex = latestEventTimelineIndex;
    if (latestIndex < 0) return false;
    programmaticLatestScrollRef.current = true;
    virtualizer.scrollToIndex(latestIndex, {
      align: getReviewTimelineLatestAlignment(direction),
      behavior: "auto",
    });
    return true;
  }, [direction, latestEventTimelineIndex, virtualizer]);

  const captureReadingPosition = useCallback(() => {
    if (!active || !loaded || !readingReady || restorePendingRef.current) return;
    if (keywordSearchActive || navigationState.preserveReadingPosition || pendingTargetEventKey || locatingTargetKeyRef.current) return;
    const root = scrollRef.current;
    if (!root) return;
    const rootBounds = root.getBoundingClientRect();
    const candidate = Array.from(root.querySelectorAll<HTMLElement>("[data-event-key]"))
      .map((element) => ({ element, bounds: element.getBoundingClientRect() }))
      .filter(({ bounds }) => bounds.bottom > rootBounds.top && bounds.top < rootBounds.bottom)
      .sort((left, right) => left.bounds.top - right.bounds.top)[0];
    const eventKey = candidate?.element.dataset.eventKey;
    if (!eventKey) return;
    const row = timelineEntries.find((entry) => entry.kind === "event" && entry.row.eventKey === eventKey);
    if (!row || row.kind !== "event") return;
    if (skipNextReadingSaveRef.current) {
      skipNextReadingSaveRef.current = false;
      return;
    }
    const position: ReviewReadingMemoryPosition = {
      eventKey,
      eventTs: row.row.eventTs,
      offset: candidate.bounds.top - rootBounds.top,
      updatedAt: Date.now(),
    };
    readingMemory.set(sessionId, position);
    updateArchiveReviewState({ readingEventKey: eventKey });
  }, [active, keywordSearchActive, loaded, navigationState.preserveReadingPosition, pendingTargetEventKey, readingMemory, readingReady, sessionId, timelineEntries]);

  const scheduleReadingPositionSave = useCallback(() => {
    if (readingSaveTimerRef.current !== null) clearTimeout(readingSaveTimerRef.current);
    readingSaveTimerRef.current = setTimeout(() => {
      readingSaveTimerRef.current = null;
      captureReadingPosition();
    }, 180);
  }, [captureReadingPosition]);

  useLayoutEffect(() => {
    const lockedAnchor = lockedTargetScrollAnchorRef.current;
    const anchor = lockedAnchor;
    const root = scrollRef.current;
    if (!anchor || !root) return;
    if (!canRestoreReviewTimelineScrollAnchor(anchor, requestGenerationRef.current, Boolean(pendingTargetEventKey))) {
      return;
    }
    const targetIndex = timelineEntries.findIndex((entry) => entry.kind === "event" && entry.row.eventKey === anchor.eventKey);
    if (targetIndex < 0) return;
    const targetOffsetInfo = virtualizer.getOffsetForIndex(targetIndex, "start");
    const targetStart = targetOffsetInfo?.[0];
    if (targetStart === undefined) return;
    const element = Array.from(root.querySelectorAll<HTMLElement>("[data-event-key]")).find((candidate) => candidate.dataset.eventKey === anchor.eventKey);
    const currentOffset = element
      ? element.getBoundingClientRect().top - root.getBoundingClientRect().top
      : targetStart - root.scrollTop;
    const adjustment = currentOffset - anchor.offset;
    if (Math.abs(adjustment) > 0.5) {
      virtualizer.scrollToOffset(root.scrollTop + adjustment, { behavior: "auto" });
    }
  }, [followingLatest, records, timelineEntries, virtualItems, virtualizer]);

  useLayoutEffect(() => {
    const position = readingRestorePositionRef.current;
    const root = scrollRef.current;
    if (!active || !loaded || !readingReady || restorePendingRef.current || pendingTargetEventKey || !position || !root) return;
    const element = Array.from(root.querySelectorAll<HTMLElement>("[data-event-key]"))
      .find((candidate) => candidate.dataset.eventKey === position.eventKey);
    if (!element) return;
    const currentOffset = element.getBoundingClientRect().top - root.getBoundingClientRect().top;
    const adjustment = currentOffset - position.offset;
    if (Math.abs(adjustment) > 0.5) {
      virtualizer.scrollToOffset(root.scrollTop + adjustment, { behavior: "auto" });
    }
    readingRestorePositionRef.current = null;
  }, [active, loaded, pendingTargetEventKey, readingReady, records, timelineEntries, virtualItems, virtualizer]);

  // 跟随最新时由回看自己负责把视口保持在正确边缘：倒序贴顶，顺序贴底。
  // 虚拟器的 followOnAppend 负责顺序追加，这里补上倒序前插和异步行高变化。
  useLayoutEffect(() => {
    const root = scrollRef.current;
    if (!active || !loaded || loading || !followingLatestRef.current || !root) return;
    if (pendingTargetEventKey || restorePendingRef.current || locatingTargetKeyRef.current || readingAction === "latest") return;
    if (isReviewTimelineAtLatest(direction, root.scrollTop, root.scrollHeight, root.clientHeight, REVIEW_FOLLOW_THRESHOLD)) return;
    scrollToLatestEdge();
  }, [active, direction, loaded, loading, pendingTargetEventKey, readingAction, records.length, scrollToLatestEdge, timelineEntries.length, virtualItems]);

  const notifyScrollIntent = useCallback((intent: "up" | "down", atTimelineTop: boolean) => {
    onScrollIntent?.(intent, atTimelineTop);
  }, [onScrollIntent]);

  const handleTimelineWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    if (event.deltaY === 0) return;
    programmaticLatestScrollRef.current = false;
    lockedTargetScrollAnchorRef.current = null;
    setNavigationState((current) => releaseReviewTimelineReadingProtection(current));
    updateFollowingLatest(false);
    notifyScrollIntent(event.deltaY < 0 ? "up" : "down", event.currentTarget.scrollTop <= 1);
  }, [notifyScrollIntent, updateFollowingLatest]);

  const handleTimelineScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const root = event.currentTarget;
    const atLatest = isReviewTimelineAtLatest(direction, root.scrollTop, root.scrollHeight, root.clientHeight, REVIEW_FOLLOW_THRESHOLD);
    if (programmaticLatestScrollRef.current && !atLatest) return;
    const wasFollowingLatest = followingLatestRef.current;
    if (atLatest && !pendingTargetEventKey && !navigationState.preserveReadingPosition) {
      programmaticLatestScrollRef.current = false;
      updateFollowingLatest(true);
      if (!wasFollowingLatest) setLatestResumeRevision((revision) => revision + 1);
    } else if (!atLatest) {
      updateFollowingLatest(false);
    }
    if (!programmaticLatestScrollRef.current) scheduleReadingPositionSave();
  }, [direction, navigationState.preserveReadingPosition, pendingTargetEventKey, scheduleReadingPositionSave, updateFollowingLatest]);

  useEffect(() => {
    if (!active) return;
    const sampleRefs = projected.slice(0, 8).map((row) => row.eventKey);
    const renderedRefs = virtualItems
      .map((item) => timelineEntries[item.index])
      .filter((entry): entry is Extract<ReviewTimelineEntry, { kind: "event" }> => entry?.kind === "event")
      .slice(0, 8)
      .map((entry) => entry.row.eventKey);
    const signature = `${projected.length}:${renderedRefs.join(",")}`;
    if (lastRenderDiagnosticRef.current === signature) return;
    lastRenderDiagnosticRef.current = signature;
    recordArchiveProjection(projected.length, sampleRefs);
    recordArchiveRender(renderedRefs.length, renderedRefs);
    recordArchiveDiagnostic("render", "archive-render", "rendered", {
      sessionId,
      stream: "render",
      eventId: renderedRefs[0],
      windowLabel: "main",
      data: {
        projectedCount: projected.length,
        renderedCount: renderedRefs.length,
        sampleRefs: renderedRefs.join(","),
      },
    });
  }, [active, projected, sessionId, timelineEntries, virtualItems]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!active || !root) return;
    return observeRenderedEventRows(root, { windowLabel: "main", region: `review:${sessionId}` });
  }, [active, sessionId]);

  useEffect(() => {
    if (!active || !loaded || !loadedRef.current || !readingReady || !restorePendingRef.current) return;
    if (pendingTargetEventKey && projected.length === 0 && !loading) {
      restorePendingRef.current = false;
      completeTargetLocation(false);
      return;
    }
    if (projected.length === 0) return;
    const targetRow = pendingTargetEventKey
      ? findProjectedEventBySourceKey(projected, pendingTargetEventKey)
      : undefined;
    if (pendingTargetEventKey && !targetRow) {
      if (loading) return;
      restorePendingRef.current = false;
      completeTargetLocation(false);
      return;
    }
    const searching = searchLocatePendingRef.current;
    const savedReadingPosition = !pendingTargetEventKey && !searching ? readingMemory.get(sessionId) : null;
    const savedReadingAnchor = !pendingTargetEventKey && !searching ? getReadingAnchor() : null;
    const resolution = pendingTargetEventKey
      ? { eventKey: targetRow?.eventKey ?? null }
      : searching
      ? restoreReadingPosition(projected, null)
      : restoreReadingPosition(projected, savedReadingAnchor);
    const targetKey = resolution.eventKey ?? (pendingTargetEventKey ? undefined : projected[0]?.eventKey);
    if (!targetKey) return;
    const targetIndex = timelineEntries.findIndex((entry) => entry.kind === "event" && entry.row.eventKey === targetKey);
    if (targetIndex < 0) {
      if (pendingTargetEventKey) {
        locatingTargetKeyRef.current = null;
        setLocatingTargetKey(null);
        restorePendingRef.current = false;
        completeTargetLocation(false);
      }
      return;
    }
    if (pendingTargetEventKey) {
      lockedTargetScrollAnchorRef.current = null;
      if (locatingTargetKeyRef.current === targetKey) return;
      locatingTargetKeyRef.current = targetKey;
      locatingTargetOffsetRef.current = null;
      locatingTargetStableFramesRef.current = 0;
      setLocatingTargetKey(targetKey);
      virtualizer.scrollToIndex(targetIndex, { align: "center" });
      return;
    }
    if (savedReadingPosition) readingRestorePositionRef.current = { ...savedReadingPosition, eventKey: targetKey };
    virtualizer.scrollToIndex(targetIndex, { align: "start" });
    if (searching || savedReadingAnchor) updateFollowingLatest(false);
    restorePendingRef.current = false;
    searchLocatePendingRef.current = false;
    if (savedReadingPosition) skipNextReadingSaveRef.current = true;
    if (searching) {
      setHighlightedEventKey(targetKey);
      highlightTimerRef.current = setTimeout(() => setHighlightedEventKey(null), 1600);
    }
  }, [active, activeTargetEventKey, completeTargetLocation, getReadingAnchor, loaded, loading, pendingTargetEventKey, projected, readingActionRevision, readingMemory, readingReady, sessionId, targetEventKey, timelineEntries, updateFollowingLatest, virtualizer]);

  useEffect(() => {
    if (!active || !readingReady || !locatingTargetKey) return;
    const targetKey = locatingTargetKey;
    let disposed = false;
    const inspectTargetPosition = () => {
      if (disposed || locatingTargetKeyRef.current !== targetKey) return;
      const targetRow = findProjectedEventBySourceKey(projected, targetKey);
      if (!targetRow) {
        locatingTargetKeyRef.current = null;
        setLocatingTargetKey(null);
        restorePendingRef.current = false;
        completeTargetLocation(false);
        return;
      }
      const targetIndex = timelineEntries.findIndex((entry) => entry.kind === "event" && entry.row.eventKey === targetRow.eventKey);
      if (targetIndex < 0) {
        locatingTargetFrameRef.current = requestAnimationFrame(inspectTargetPosition);
        return;
      }
      const root = scrollRef.current;
      const targetElement = root
        ? Array.from(root.querySelectorAll<HTMLElement>("[data-event-key]")).find((element) => element.dataset.eventKey === targetRow.eventKey)
        : null;
      if (!root || !targetElement) {
        virtualizer.scrollToIndex(targetIndex, { align: "center" });
        locatingTargetFrameRef.current = requestAnimationFrame(inspectTargetPosition);
        return;
      }
      const rootBounds = root.getBoundingClientRect();
      const targetBounds = targetElement.getBoundingClientRect();
      if (!isReviewTimelineItemVisible({
        viewportTop: rootBounds.top,
        viewportBottom: rootBounds.bottom,
        itemTop: targetBounds.top,
        itemBottom: targetBounds.bottom,
      })) {
        locatingTargetOffsetRef.current = null;
        locatingTargetStableFramesRef.current = 0;
        virtualizer.scrollToIndex(targetIndex, { align: "center" });
        locatingTargetFrameRef.current = requestAnimationFrame(inspectTargetPosition);
        return;
      }
      const currentOffset = targetBounds.top - rootBounds.top;
      const previousOffset = locatingTargetOffsetRef.current;
      const stableFrames = previousOffset !== null && Math.abs(currentOffset - previousOffset) <= 1
        ? locatingTargetStableFramesRef.current + 1
        : 1;
      locatingTargetOffsetRef.current = currentOffset;
      locatingTargetStableFramesRef.current = stableFrames;
      if (!shouldCompleteReviewTimelineLocation(previousOffset, currentOffset, stableFrames)) {
        locatingTargetFrameRef.current = requestAnimationFrame(inspectTargetPosition);
        return;
      }
      lockedTargetScrollAnchorRef.current = {
        eventKey: targetRow.eventKey,
        offset: currentOffset,
        generation: requestGenerationRef.current,
      };
      restorePendingRef.current = false;
      locatingTargetKeyRef.current = null;
      locatingTargetOffsetRef.current = null;
      locatingTargetStableFramesRef.current = 0;
      setLocatingTargetKey(null);
      searchLocatePendingRef.current = false;
      skipNextReadingSaveRef.current = true;
      setHighlightedEventKey(targetRow.eventKey);
      if (highlightTimerRef.current !== null) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(() => setHighlightedEventKey(null), 1600);
      completeTargetLocation(true);
    };
    locatingTargetFrameRef.current = requestAnimationFrame(inspectTargetPosition);
    return () => {
      disposed = true;
      if (locatingTargetFrameRef.current !== null) cancelAnimationFrame(locatingTargetFrameRef.current);
      locatingTargetFrameRef.current = null;
    };
  }, [active, completeTargetLocation, locatingTargetKey, projected, readingReady, timelineEntries, virtualItems, virtualizer]);

  useEffect(() => {
    if (!active || !loaded || !readingReady || restorePendingRef.current) return;
    if (shouldPauseReviewTimelineAutomation({
      targetPending: Boolean(pendingTargetEventKey),
      restorePending: restorePendingRef.current,
      locatingTarget: Boolean(locatingTargetKeyRef.current),
    })) return;
    scheduleReadingPositionSave();
    return () => {
      if (readingSaveTimerRef.current !== null) clearTimeout(readingSaveTimerRef.current);
    };
  }, [active, loaded, locatingTargetKey, pendingTargetEventKey, readingReady, scheduleReadingPositionSave, timelineEntries.length, virtualItems]);

  useEffect(() => () => {
    captureReadingPosition();
    if (readingSaveTimerRef.current !== null) clearTimeout(readingSaveTimerRef.current);
    if (highlightTimerRef.current !== null) clearTimeout(highlightTimerRef.current);
    if (latestJumpFrameRef.current !== null) cancelAnimationFrame(latestJumpFrameRef.current);
  }, [captureReadingPosition]);

  useEffect(() => {
    const first = virtualItems[0];
    const last = virtualItems[virtualItems.length - 1];
    const reverseDirection: ArchiveSortDirection = direction === "asc" ? "desc" : "asc";
    const nearStart = Boolean(first && first.index <= 12);
    const nearEnd = timelineEntries.length === 0 || Boolean(last && last.index >= timelineEntries.length - 12);
    const endCursor = cursorByDirectionRef.current[direction] ?? nextCursor;
    if (!active || !loaded || followingLatestRef.current || readingAction === "latest" || shouldPauseReviewTimelineAutomation({
      targetPending: Boolean(pendingTargetEventKey),
      restorePending: restorePendingRef.current,
      locatingTarget: Boolean(locatingTargetKeyRef.current),
    })) return;
    if (nearStart && cursorByDirectionRef.current[reverseDirection] !== null) {
      void loadNextPage(reverseDirection);
    }
    if (nearEnd && endCursor !== null) {
      void loadNextPage(direction);
    }
  }, [active, direction, loaded, followingLatest, loadNextPage, locatingTargetKey, nextCursor, pendingTargetEventKey, readingAction, timelineEntries.length, virtualItems]);

  const jumpToLatest = useCallback(async () => {
    if (!active || !readingReady) return;
    updateFollowingLatest(true);
    lockedTargetScrollAnchorRef.current = null;
    setNavigationState((current) => releaseReviewTimelineReadingProtection(current));
    const generation = resetPages(["desc"], true);
    setReadingAction("latest");
    latestJumpDirectionRef.current = direction;
    latestJumpStableFramesRef.current = 0;
    try {
      const firstPageLoaded = await loadDirectionPage("desc", { ignoreReadingAnchor: true, includeTotal: true });
      if (!firstPageLoaded) return;
      if (requestGenerationRef.current === generation) setReadingActionRevision((value) => value + 1);
    } catch {
      // loadDirectionPage 已负责记录并呈现读取错误；这里不再重复打断时间线。
    }
  }, [active, direction, loadDirectionPage, readingReady, updateFollowingLatest]);

  useEffect(() => {
    const pendingDirection = latestJumpDirectionRef.current;
    if (!pendingDirection || pendingDirection !== direction || !loaded || loading || timelineEntries.length === 0) return;
    latestJumpStableFramesRef.current = 0;
    const settle = () => {
      if (latestJumpDirectionRef.current !== pendingDirection) return;
      const root = scrollRef.current;
      if (!root) return;
      if (!isReviewTimelineAtLatest(direction, root.scrollTop, root.scrollHeight, root.clientHeight, REVIEW_FOLLOW_THRESHOLD)) {
        scrollToLatestEdge();
        latestJumpStableFramesRef.current = 0;
      } else {
        latestJumpStableFramesRef.current += 1;
      }
      if (latestJumpStableFramesRef.current >= 2) {
        latestJumpDirectionRef.current = null;
        programmaticLatestScrollRef.current = false;
        setReadingAction(null);
        return;
      }
      latestJumpFrameRef.current = requestAnimationFrame(settle);
    };
    latestJumpFrameRef.current = requestAnimationFrame(settle);
    return () => {
      if (latestJumpFrameRef.current !== null) cancelAnimationFrame(latestJumpFrameRef.current);
      latestJumpFrameRef.current = null;
    };
  }, [direction, loaded, loading, readingActionRevision, scrollToLatestEdge, timelineEntries.length]);

  const toggleFavorite = useCallback(async (row: ArchiveProjectedEvent) => {
    const favorited = !row.favorited;
    setFavoriteOverrides((current) => ({ ...current, [row.eventKey]: favorited }));
    setFavoriteErrors((current) => {
      const next = { ...current };
      delete next[row.eventKey];
      return next;
    });
    try {
      await onToggleFavorite(row, favorited);
    } catch (toggleError) {
      setFavoriteOverrides((current) => ({ ...current, [row.eventKey]: !favorited }));
      setFavoriteErrors((current) => ({
        ...current,
        [row.eventKey]: toggleError instanceof Error ? toggleError.message : String(toggleError),
      }));
      throw toggleError;
    }
  }, [onToggleFavorite]);

  const createEventMenu = useCallback((row: ArchiveProjectedEvent): EventMenuHandlers => ({
    regionKey: `review:${sessionId}`,
    onSpeakEvent,
    onUserFilter,
    isUserFiltered,
    onClearUserFilter,
    onSaveNickname,
    onDeleteNickname,
    onOpenUser,
    onViewContext: onViewContext ? () => onViewContext(row.eventKey) : undefined,
    isFavorite: () => row.favorited,
    onToggleFavorite: () => toggleFavorite(row),
    onEditFavorite: onEditFavorite ? () => onEditFavorite(row) : undefined,
    favoriteEditOnAdd,
    getFavoriteError: () => favoriteErrors[row.eventKey] ?? null,
  }), [favoriteEditOnAdd, favoriteErrors, isUserFiltered, onClearUserFilter, onDeleteNickname, onEditFavorite, onOpenUser, onSaveNickname, onSpeakEvent, onUserFilter, onViewContext, sessionId, toggleFavorite]);

  const resolveGiftEffect = useCallback((event: DanmakuEvent) => event.gift ? getGiftEffect(event.gift, event.roomId) : null, []);
  const recordNotices = useMemo(() => session && !ownerHistory ? getArchiveRecordNotices(session) : [], [ownerHistory, session]);
  const visibleNotices = dismissedNoticeState.sessionId === sessionId
    ? recordNotices.filter((notice) => !dismissedNoticeState.codes.has(notice.code))
    : recordNotices;

  const onPlayGiftEffect = useCallback((event: DanmakuEvent) => {
    const resource = resolveGiftEffect(event);
    if (!resource) return;
    const notice: GiftEffectNotice = { event, resource, manual: true };
    setGiftEffectNotices((current) => [...current, notice].slice(-64));
  }, [resolveGiftEffect]);

  return (
    <section aria-label={uiText("reviewSessionTimeline.aria_label2")} data-review-reading-reason={readingAction ?? undefined} className="review-timeline-shell relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-surface">
      <header className="review-timeline-header shrink-0 border-b border-line px-3 py-2">
        <div className="review-timeline-title-row">
          <div className="review-timeline-title-group">
            <h2 className="ui-type-section-title text-t1">{ownerHistory ? uiText("reviewSessionTimeline.ReviewSessionTimeline") : uiText("reviewSessionTimeline.ReviewSessionTimeline2")}</h2>
            <span className="review-timeline-count ui-type-meta text-t3">
              {uiText("reviewSessionTimeline.ReviewSessionTimeline3")}{displayProjected.length} {uiText("reviewSessionTimeline.ReviewSessionTimeline4")}{records.length}{totalCount === null ? "" : ` / ${totalCount}`} {uiText("reviewSessionTimeline.ReviewSessionTimeline5")}{loading ? uiText("reviewSessionTimeline.ReviewSessionTimeline6") : ""}
            </span>
            {(archiveWriterStatus === "failed" || showArchivePending) && (
              <span role="status" aria-live="polite" className={`review-timeline-save-status ui-type-meta ${archiveWriterStatus === "failed" ? "text-danger" : "text-t2"}`}>
                {archiveWriterStatus === "failed" ? uiText("reviewSessionTimeline.ReviewSessionTimeline7") : uiText("reviewSessionTimeline.ReviewSessionTimeline8")}
              </span>
            )}
          </div>
          <div className="review-timeline-actions" aria-label={uiText("reviewSessionTimeline.aria_label3")}>
            <div ref={displayMenuRef} className="review-timeline-display-wrap">
              <button
                ref={displayTriggerRef}
                type="button"
                aria-label={uiText("reviewSessionTimeline.aria_label4")}
                aria-expanded={displayMenuOpen}
                aria-controls="review-display-menu"
                className={`review-timeline-action rounded-md border px-2 py-1 ui-type-meta transition-colors ${displayMenuOpen ? "border-accent bg-accent-subtle text-accent-text" : "border-line bg-bg text-t2 hover:border-accent/60 hover:text-accent-text"}`}
                onClick={() => setDisplayMenuOpen((value) => !value)}
              >
                {uiText("common.show")}<LucideChevronDown aria-hidden="true" className="ml-1 inline-block h-3 w-3" />
              </button>
              {displayMenuOpen && displayMenuPosition && createPortal(
                <div ref={displayPanelRef} id="review-display-menu" role="menu" aria-label={uiText("reviewSessionTimeline.aria_label5")} className="ui-motion-enter review-timeline-display-menu" style={displayMenuPosition}>
                  <div className="review-timeline-menu-label ui-type-meta text-t3">{uiText("reviewSessionTimeline.ReviewSessionTimeline9")}</div>
                  <div role="group" aria-label={uiText("reviewSessionTimeline.aria_label6")} className="review-timeline-menu-group">
                    {(["asc", "desc"] as const).map((sortDirection) => (
                      <button
                        key={sortDirection}
                        type="button"
                        role="menuitemradio"
                        aria-label={sortDirection === "asc" ? uiText("reviewSessionTimeline.aria_label7") : uiText("reviewSessionTimeline.aria_label8")}
                        aria-checked={direction === sortDirection}
                        className={`review-timeline-menu-item ui-type-control ${direction === sortDirection ? "is-selected" : ""}`}
                        onClick={() => onChangeSortDirection?.(sortDirection)}
                      >{direction === sortDirection ? "✓ " : ""}{sortDirection === "asc" ? uiText("reviewSessionTimeline.ReviewSessionTimeline10") : uiText("reviewSessionTimeline.ReviewSessionTimeline11")}</button>
                    ))}
                  </div>
                  <div className="review-timeline-menu-divider" />
                  <div className="review-timeline-menu-label ui-type-meta text-t3">{uiText("reviewSessionTimeline.ReviewSessionTimeline12")}</div>
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-label={uiText("reviewSessionTimeline.aria_label9")}
                    aria-checked={archiveFilters.showBigEmote !== false}
                    className={`review-timeline-menu-item ui-type-control ${archiveFilters.showBigEmote !== false ? "is-selected" : ""}`}
                    onClick={() => { onToggleShowBigEmote?.(archiveFilters.showBigEmote === false); setDisplayMenuOpen(false); }}
                  >{archiveFilters.showBigEmote !== false ? "✓ " : ""}{uiText("reviewSessionTimeline.ReviewSessionTimeline13")}</button>
                </div>,
                document.body,
              )}
            </div>
            <button
              type="button"
              className="review-timeline-action rounded-md border border-line bg-bg px-2 py-1 ui-type-meta text-t2 enabled:hover:border-accent/60 enabled:hover:text-accent-text disabled:cursor-not-allowed disabled:opacity-50"
              disabled={loading || projected.length === 0}
              onClick={() => { void jumpToLatest(); }}
            >{uiText("reviewSessionTimeline.ReviewSessionTimeline14")}</button>
          </div>
        </div>
      </header>
      {visibleNotices.map((notice) => <ArchiveNotice key={notice.code} notice={notice} onDismiss={dismissNotice} />)}
      {!ownerHistory && session?.cloudMetadata && <ArchiveCloudDetails metadata={session.cloudMetadata} />}
      {error && <div role="alert" className="shrink-0 border-b border-danger/40 bg-danger/10 px-3 py-2 ui-type-control text-danger">{uiText("reviewSessionTimeline.ReviewSessionTimeline15")}{error}</div>}
      {targetLocateMessage && <div role="status" className="shrink-0 border-b border-warning/30 bg-warning/5 px-3 py-2 ui-type-meta text-warning">{targetLocateMessage}</div>}
      <div
        ref={scrollRef}
        data-review-timeline-scroll

        data-style-api="1"
        className="event-area review relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
        onScroll={handleTimelineScroll}
        onWheel={handleTimelineWheel}
      >

        <div className="event-list timeline" style={{ height: timelineEntries.length ? `${virtualizer.getTotalSize()}px` : undefined, width: "100%", position: "relative" }}>
        {timelineEntries.length > 0 ? (
          <>
            {virtualItems.map((virtualRow) => {
              const entry = timelineEntries[virtualRow.index];
              if (!entry) return null;
              if (entry.kind === "boundary") {
                return (
                  <div
                    key={virtualRow.key}
                    className="session-marker review-session-boundary flex flex-wrap items-center gap-2 border-b border-line bg-raised px-3 py-2 ui-type-meta text-t2"
                    data-review-session-boundary={entry.sessionId}
                    {...getReviewVirtualMeasurementProps(virtualRow.index, virtualizer.measureElement)}
                    style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${virtualRow.start}px)` }}
                  >
                    <span className="shrink-0">{formatArchiveDateTime(entry.startedAt)}</span>
                    <span className="min-w-0 flex-1 truncate text-t1">{entry.title ?? uiText("reviewSessionTimeline.ReviewSessionTimeline16")}</span>
                    <span>{formatArchiveSessionStatus(entry.status)} · {formatArchiveRecordingStatus(entry.recordingStatus)}</span>
                    <button
                      type="button"
                      className="shrink-0 text-accent-text hover:text-t1"
                      title={boundaryNoticeLabel(entry) || undefined}
                      aria-label={`${collapsedSessions.has(entry.sessionId) ? uiText("reviewSessionTimeline.aria_label10") : uiText("reviewSessionTimeline.aria_label11")} ${entry.title ?? uiText("reviewSessionTimeline.aria_label12")}`}
                      aria-expanded={!collapsedSessions.has(entry.sessionId)}
                      onClick={() => setCollapsedSessions((current) => {
                        const next = new Set(current);
                        if (next.has(entry.sessionId)) next.delete(entry.sessionId);
                        else next.add(entry.sessionId);
                        return next;
                      })}
                    >{formatArchiveQuality(entry.quality)} {uiText("reviewSessionTimeline.ReviewSessionTimeline17")}{entry.hitCount} {uiText("reviewSessionTimeline.ReviewSessionTimeline5")}</button>
                  </div>
                );
              }
              const row = entry.row;
              const animateOnMount = reviewAnimationKeysRef.current.has(row.eventKey);
              return (
                <EventRowSlot
                  key={virtualRow.key}
                  className={`event-row-slot ${highlightedEventKey === row.eventKey ? "review-event-search-hit" : ""}`}
                  data-event-key={row.eventKey}
                  data-event-id={row.eventKey}
                  data-event-session-id={row.sessionId}
                  data-event-room-id={row.record.roomId}
                  data-review-search-hit={highlightedEventKey === row.eventKey ? "true" : undefined}
                  data-event-primary-category={row.primaryCategory}
                  {...getReviewVirtualMeasurementProps(virtualRow.index, virtualizer.measureElement)}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  showEventSpacing={entry.kind === "event" && timelineEntries[virtualRow.index + 1]?.kind === "event"}
                >
                  <EventRow
                    allowWinnerExpansion
                    ev={row.event}
                    reviewLayout
                    showTime
                    onUserFilter={onUserFilter}
                    eventMenu={createEventMenu(row)}
                    eventMenuScope="review"
                    giftEffectResolver={resolveGiftEffect}
                    onPlayGiftEffect={onPlayGiftEffect}
                    onContentSizeChange={measureAfterContentLoad}
                    animateOnMount={animateOnMount}
                    onAnimationMount={animateOnMount ? () => reviewAnimationKeysRef.current.delete(row.eventKey) : undefined}
                  />
                </EventRowSlot>
              );
            })}
          </>
        ) : loaded && !loading ? (
          <div className="flex min-h-28 items-center justify-center px-4 ui-type-control text-t3">{uiText("reviewSessionTimeline.ReviewSessionTimeline18")}</div>
        ) : null}
        </div>
      </div>
      <GiftEffectOverlay enabled notices={giftEffectNotices} resetKey={queryKey} roomKey={sessionId} />
    </section>
  );
}
