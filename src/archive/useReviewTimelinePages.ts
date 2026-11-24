import { useCallback, useRef, useState, type RefObject } from "react";
import type { ArchiveEventRecord, ArchiveCursorPage, ArchiveFilterState, ArchiveReadingState, ArchiveRepositoryContract, ArchiveSearchScope, ArchiveSortDirection } from "./archiveTypes.ts";
import { appendArchiveEventPage } from "./archiveProjection.ts";
import { advanceReviewTimelineEventWatermark, type ReviewTimelineEventWatermark } from "./reviewTimelineNavigation.ts";
import { createArchiveRequestId, recordArchiveDiagnostic } from "./archiveDiagnostics.ts";

const REVIEW_PAGE_SIZE = 320;

export function useReviewTimelinePages({ repository, sessionId, ownerId, searchScope, archiveFilters, direction, active, readingReady, getReadingAnchorRef }: {
  repository: ArchiveRepositoryContract;
  sessionId: string;
  ownerId?: string;
  searchScope: ArchiveSearchScope;
  archiveFilters: ArchiveFilterState;
  direction: ArchiveSortDirection;
  active: boolean;
  readingReady: boolean;
  getReadingAnchorRef: RefObject<() => ArchiveReadingState | null>;
}) {
  const ownerHistory = searchScope === "owner" && ownerId !== undefined;
  const requestGenerationRef = useRef(0);
  const loadingGenerationByDirectionRef = useRef(new Map<ArchiveSortDirection, number>());
  const cursorByDirectionRef = useRef<Record<ArchiveSortDirection, string | null>>({ asc: null, desc: null });
  const exhaustedByDirectionRef = useRef<Record<ArchiveSortDirection, boolean>>({ asc: false, desc: false });
  const pendingInitialDirectionsRef = useRef(new Set<ArchiveSortDirection>());
  const initialPagesRef = useRef(new Map<ArchiveSortDirection, ArchiveCursorPage<ArchiveEventRecord>>());
  const recordsRef = useRef<ArchiveEventRecord[]>([]);
  const reviewEventWatermarkRef = useRef<ReviewTimelineEventWatermark | null>(null);
  const reviewAnimationKeysRef = useRef(new Set<string>());
  const replaceRecordsOnNextPageRef = useRef(false);
  const [records, setRecords] = useState<ArchiveEventRecord[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const advanceEventWatermark = useCallback((items: readonly ArchiveEventRecord[]) => {
    reviewEventWatermarkRef.current = advanceReviewTimelineEventWatermark(
      reviewEventWatermarkRef.current,
      items.map((item) => ({ eventKey: item.eventKey, eventTs: item.eventTs, ordinal: item.ordinal })),
    );
  }, []);

  const commitInitialPages = useCallback(() => {
    if (pendingInitialDirectionsRef.current.size > 0) return;
    const replaceRecords = replaceRecordsOnNextPageRef.current;
    if (replaceRecords) replaceRecordsOnNextPageRef.current = false;
    let next = replaceRecords ? [] : recordsRef.current;
    for (const page of initialPagesRef.current.values()) {
      next = appendArchiveEventPage(next, page, direction);
    }
    initialPagesRef.current.clear();
    advanceEventWatermark(next);
    recordsRef.current = next;
    setRecords(next);
    setLoaded(true);
  }, [advanceEventWatermark, direction]);

  const loadDirectionPage = useCallback(async (
    pageDirection: ArchiveSortDirection,
    options: { ignoreReadingAnchor?: boolean; includeTotal?: boolean } = {},
  ) => {
    if (!active || !readingReady || exhaustedByDirectionRef.current[pageDirection]) return false;
    if (loadingGenerationByDirectionRef.current.has(pageDirection)) return false;
    const generation = requestGenerationRef.current;
    const isInitial = pendingInitialDirectionsRef.current.has(pageDirection);
    const cursor = cursorByDirectionRef.current[pageDirection];
    const anchorState = cursor === null && !options.ignoreReadingAnchor ? getReadingAnchorRef.current() : null;
    const requestId = createArchiveRequestId("archive-query");
    loadingGenerationByDirectionRef.current.set(pageDirection, generation);
    setLoading(true);
    setError(null);
    recordArchiveDiagnostic("request", "archive-query", "started", {
      requestId,
      sessionId,
      stream: "source",
      data: { phase: "page", direction: pageDirection, searchScope },
    });
    try {
      const page = await repository.queryEvents({
        ...(ownerHistory ? { ownerId } : { sessionId }),
        filters: archiveFilters,
        cursor,
        limit: REVIEW_PAGE_SIZE,
        direction: pageDirection,
        includeTotal: cursor === null && (pageDirection === direction || options.includeTotal === true),
        anchor: anchorState
          ? {
            eventKey: anchorState.eventKey,
            fallbackEventTs: anchorState.fallbackEventTs,
          }
          : undefined,
      });
      if (requestGenerationRef.current !== generation) {
        recordArchiveDiagnostic("cancel", "archive-query", "canceled", {
          requestId,
          sessionId,
          stream: "source",
          data: { phase: "page", direction: pageDirection, reason: "superseded" },
        });
        return false;
      }
      recordArchiveDiagnostic("success", "archive-query", "completed", {
        requestId,
        sessionId,
        stream: "source",
        count: page.items.length,
        sourceRef: `source:archive-query:${sessionId}:${pageDirection}`,
        renderRef: `render:archive-query:${sessionId}`,
        data: { phase: "page", itemCount: page.items.length, hasNext: page.nextCursor !== null },
      });
      if (isInitial) {
        initialPagesRef.current.set(pageDirection, page);
      } else {
        const replaceRecords = replaceRecordsOnNextPageRef.current && cursor === null;
        if (replaceRecords) replaceRecordsOnNextPageRef.current = false;
        advanceEventWatermark(page.items);
        setRecords((current) => {
          const base = replaceRecords ? [] : current;
          const known = new Set(base.map((item) => item.eventKey));
          if (!replaceRecords && page.items.every((item) => known.has(item.eventKey))) return current;
          const next = appendArchiveEventPage(base, page, direction);
          recordsRef.current = next;
          return next;
        });
      }
      if (page.totalCount !== null) setTotalCount(page.totalCount);
      cursorByDirectionRef.current[pageDirection] = page.nextCursor;
      exhaustedByDirectionRef.current[pageDirection] = page.nextCursor === null;
      setNextCursor(cursorByDirectionRef.current[direction]);
      if (isInitial) {
        pendingInitialDirectionsRef.current.delete(pageDirection);
        commitInitialPages();
      }
      return true;
    } catch (loadError) {
      if (requestGenerationRef.current !== generation) {
        recordArchiveDiagnostic("cancel", "archive-query", "canceled", {
          requestId,
          sessionId,
          stream: "source",
          data: { phase: "page", direction: pageDirection, reason: "superseded" },
        });
        return false;
      }
      recordArchiveDiagnostic("failure", "archive-query", "failed", {
        requestId,
        sessionId,
        stream: "source",
        sourceRef: `source:archive-query:${sessionId}:${pageDirection}`,
        renderRef: `render:archive-query:${sessionId}`,
        data: { phase: "page", error: loadError instanceof Error ? loadError.message : String(loadError) },
      });
      setError(loadError instanceof Error ? loadError.message : String(loadError));
      if (isInitial) {
        pendingInitialDirectionsRef.current.delete(pageDirection);
        commitInitialPages();
      }
      return false;
    } finally {
      if (loadingGenerationByDirectionRef.current.get(pageDirection) === generation) {
        loadingGenerationByDirectionRef.current.delete(pageDirection);
      }
      if (requestGenerationRef.current === generation) {
        setLoading(loadingGenerationByDirectionRef.current.size > 0);
      }
    }
  }, [active, advanceEventWatermark, archiveFilters, commitInitialPages, direction, ownerHistory, ownerId, readingReady, repository, searchScope, sessionId]);


  const resetPages = useCallback((initialDirections: readonly ArchiveSortDirection[], preserveRenderedRows = false) => {
    requestGenerationRef.current += 1;
    cursorByDirectionRef.current = { asc: null, desc: null };
    exhaustedByDirectionRef.current = { asc: false, desc: false };
    loadingGenerationByDirectionRef.current.clear();
    pendingInitialDirectionsRef.current = new Set(initialDirections);
    initialPagesRef.current.clear();
    reviewEventWatermarkRef.current = null;
    reviewAnimationKeysRef.current.clear();
    recordsRef.current = [];
    replaceRecordsOnNextPageRef.current = true;
    if (!preserveRenderedRows) setRecords([]);
    setTotalCount(null);
    setNextCursor(null);
    setLoaded(false);
    setLoading(false);
    setError(null);
    return requestGenerationRef.current;
  }, []);

  return {
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
    getReadingAnchorRef,
  };
}
