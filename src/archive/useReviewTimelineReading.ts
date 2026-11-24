import { uiText } from "../i18n/index.ts";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ArchiveSortDirection } from "./archiveTypes.ts";
import type { ReviewReadingMemoryPosition } from "./reviewReadingMemory.ts";
import { createReviewTimelineNavigationState, updateReviewTimelineNavigationTarget, type ReviewTimelineScrollAnchorSnapshot } from "./reviewTimelineNavigation.ts";

export function useReviewTimelineReading({ sessionId, targetEventKey, onTargetEventConsumed }: {
  sessionId: string;
  targetEventKey?: string | null;
  onTargetEventConsumed?: (found: boolean) => void;
}) {
  const [navigationState, setNavigationState] = useState(() => (
    updateReviewTimelineNavigationTarget(createReviewTimelineNavigationState(), sessionId, targetEventKey)
  ));
  const readingReadyRef = useRef(true);
  const restorePendingRef = useRef(false);
  const locatingTargetKeyRef = useRef<string | null>(null);
  const locatingTargetFrameRef = useRef<number | null>(null);
  const locatingTargetOffsetRef = useRef<number | null>(null);
  const locatingTargetStableFramesRef = useRef(0);
  const searchLocatePendingRef = useRef(false);
  const skipNextReadingSaveRef = useRef(false);
  const readingRestorePositionRef = useRef<ReviewReadingMemoryPosition | null>(null);
  const readingSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const programmaticLatestScrollRef = useRef(false);
  const latestJumpFrameRef = useRef<number | null>(null);
  const latestJumpStableFramesRef = useRef(0);
  const [highlightedEventKey, setHighlightedEventKey] = useState<string | null>(null);
  const [readingAction, setReadingAction] = useState<"latest" | null>(null);
  const [readingActionRevision, setReadingActionRevision] = useState(0);
  const [locatingTargetKey, setLocatingTargetKey] = useState<string | null>(null);
  const [targetLocateMessage, setTargetLocateMessage] = useState<string | null>(null);
  const [followingLatest, setFollowingLatest] = useState(true);
  const [latestResumeRevision, setLatestResumeRevision] = useState(0);
  const followingLatestRef = useRef(true);
  const lockedTargetScrollAnchorRef = useRef<ReviewTimelineScrollAnchorSnapshot | null>(null);
  const [targetReloadRevision, setTargetReloadRevision] = useState(0);
  const latestJumpDirectionRef = useRef<ArchiveSortDirection | null>(null);

  const activeTargetEventKey = navigationState.sessionId === sessionId && navigationState.targetPending
    ? navigationState.targetEventKey
    : null;
  const pendingTargetEventKey = targetEventKey ?? activeTargetEventKey;

  const updateFollowingLatest = useCallback((value: boolean) => {
    followingLatestRef.current = value;
    setFollowingLatest(value);
  }, []);

  const completeTargetLocation = useCallback((found: boolean) => {
    if (found) updateFollowingLatest(false);
    setTargetLocateMessage(found ? null : uiText("useReviewTimelineReading.useReviewTimelineReading.completeTargetLocation"));
    onTargetEventConsumed?.(found);
  }, [onTargetEventConsumed, updateFollowingLatest]);

  useEffect(() => {
    setNavigationState((current) => updateReviewTimelineNavigationTarget(current, sessionId, targetEventKey));
  }, [sessionId, targetEventKey]);

  return {
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
  };
}
