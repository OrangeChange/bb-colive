import { useEffect, useRef } from "react";
import type { ArchiveFilterState, ArchiveRepositoryContract, ArchiveSearchScope, ArchiveSortDirection } from "./archiveTypes.ts";
import type { useReviewTimelinePages } from "./useReviewTimelinePages.ts";
import type { useReviewTimelineReading } from "./useReviewTimelineReading.ts";
import { collectFreshReviewEventKeys, shouldPauseReviewTimelineAutomation } from "./reviewTimelineNavigation.ts";
import { appendArchiveEventPage } from "./archiveProjection.ts";
import { createArchiveRequestId, recordArchiveDiagnostic } from "./archiveDiagnostics.ts";

const LIVE_REFRESH_PAGE_SIZE = 500;

type RefreshOptions = Pick<ReturnType<typeof useReviewTimelinePages>, "loaded" | "requestGenerationRef" | "recordsRef" | "setRecords" | "reviewEventWatermarkRef" | "reviewAnimationKeysRef" | "setTotalCount" | "setError">
  & Pick<ReturnType<typeof useReviewTimelineReading>, "latestResumeRevision" | "locatingTargetKey" | "pendingTargetEventKey" | "readingReadyRef" | "restorePendingRef" | "locatingTargetKeyRef" | "followingLatestRef" | "programmaticLatestScrollRef">
  & { active: boolean; archiveFilters: ArchiveFilterState; direction: ArchiveSortDirection; ownerId?: string; refreshKey?: unknown; repository: ArchiveRepositoryContract; searchScope: ArchiveSearchScope; sessionId: string };

export function useReviewTimelineRefresh({
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
}: RefreshOptions) {
  const ownerHistory = searchScope === "owner" && ownerId !== undefined;
  const lastRefreshKeyRef = useRef(refreshKey);
  const lastRefreshResumeRevisionRef = useRef(0);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (Object.is(lastRefreshKeyRef.current, refreshKey) && lastRefreshResumeRevisionRef.current === latestResumeRevision) return;
    if (!active || !loaded || !readingReadyRef.current || shouldPauseReviewTimelineAutomation({
      targetPending: Boolean(pendingTargetEventKey),
      restorePending: restorePendingRef.current,
      locatingTarget: Boolean(locatingTargetKeyRef.current),
    })) return;
    if (!followingLatestRef.current) {
      lastRefreshKeyRef.current = refreshKey;
      lastRefreshResumeRevisionRef.current = latestResumeRevision;
      return;
    }
    let disposed = false;
    const timer = setTimeout(() => {
      if (disposed || (Object.is(lastRefreshKeyRef.current, refreshKey) && lastRefreshResumeRevisionRef.current === latestResumeRevision)) return;
      lastRefreshKeyRef.current = refreshKey;
      lastRefreshResumeRevisionRef.current = latestResumeRevision;
      const generation = requestGenerationRef.current;
      const requestId = createArchiveRequestId("archive-refresh");
      recordArchiveDiagnostic("request", "archive-query", "started", {
        requestId,
        sessionId,
        stream: "source",
        data: { phase: "incremental-refresh", direction: "desc", searchScope },
      });
      void repository.queryEvents({
        ...(ownerHistory ? { ownerId } : { sessionId }),
        filters: archiveFilters,
        limit: LIVE_REFRESH_PAGE_SIZE,
        direction: "desc",
        includeTotal: true,
      }).then((page) => {
        if (disposed || requestGenerationRef.current !== generation) return;
        recordArchiveDiagnostic("success", "archive-query", "completed", {
          requestId,
          sessionId,
          stream: "source",
          count: page.items.length,
          sourceRef: `source:archive-query:${sessionId}:incremental`,
          renderRef: `render:archive-query:${sessionId}`,
          data: { phase: "incremental-refresh", itemCount: page.items.length },
        });
        const currentRecordKeys = new Set(recordsRef.current.map((item) => item.eventKey));
        const hasNewRecords = page.items.some((item) => !currentRecordKeys.has(item.eventKey));
        if (hasNewRecords && followingLatestRef.current) programmaticLatestScrollRef.current = true;
        setRecords((current) => {
          const fresh = collectFreshReviewEventKeys(
            current.map((item) => item.eventKey),
            page.items.map((item) => ({ eventKey: item.eventKey, eventTs: item.eventTs, ordinal: item.ordinal })),
            reviewEventWatermarkRef.current,
          );
          reviewEventWatermarkRef.current = fresh.watermark;
          for (const eventKey of fresh.keys) reviewAnimationKeysRef.current.add(eventKey);
          const known = new Set(current.map((item) => item.eventKey));
          if (page.items.every((item) => known.has(item.eventKey))) return current;
          const next = appendArchiveEventPage(current, page, direction);
          recordsRef.current = next;
          return next;
        });
        if (page.totalCount !== null) setTotalCount(page.totalCount);
      }).catch((refreshError) => {
        if (disposed || requestGenerationRef.current !== generation) return;
        recordArchiveDiagnostic("failure", "archive-query", "failed", {
          requestId,
          sessionId,
          stream: "source",
          data: {
            phase: "incremental-refresh",
            error: refreshError instanceof Error ? refreshError.message : String(refreshError),
          },
        });
        setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
      });
    }, 120);
    refreshTimerRef.current = timer;

    return () => {
      disposed = true;
      clearTimeout(timer);
      if (refreshTimerRef.current === timer) refreshTimerRef.current = null;
    };
  }, [active, archiveFilters, direction, latestResumeRevision, loaded, locatingTargetKey, ownerHistory, ownerId, pendingTargetEventKey, refreshKey, repository, searchScope, sessionId]);
}
