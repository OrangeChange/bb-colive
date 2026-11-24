import { UiSearchInput } from "./ui/SearchInput.tsx";
import { ReviewStyleSettings } from './ReviewStyleSettings.tsx';
import { ChevronLeft as LucideChevronLeft, Archive as LucideArchive, CloudDownload as LucideCloudDownload } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type UIEvent, type WheelEvent } from "react";
import type { Anchor } from "../protocol/anchors.ts";
import type { DanmakuEvent, DanmakuUser } from "../protocol/types.ts";
import type {
  ArchiveDeletePreview,
  ArchiveFavoriteItem,
  ArchiveFavoriteTag,
  ArchiveFilterState,
  ArchiveOwnerEventGroupPage,
  ArchiveOwnerEventGroupQuery,
  ArchiveOwnerSummary,
  ArchiveRepositoryContract,
  ArchiveSessionQuery,
  ArchiveSessionSort,
  ArchiveSessionSummary,
  ArchiveSortDirection,
  ReviewOwnerEventQuery,
  ReviewOwnerEventQueryPatch,
  ReviewOwnerSessionQuery,
} from "../archive/archiveTypes.ts";
import { ArchiveTransferService } from "../archive/archiveTransfer.ts";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import {
  createReviewHistoryState,
  createDefaultReviewOwnerState,
  applyReviewQueryPatch,
  createReadingStateRestoreGuard,
  normalizeReviewQueryPreferences,
  DEFAULT_REVIEW_QUERY_PREFERENCES,
  getReviewEntryRoute,
  getReviewLevelState,
  navigateBack,
  popReviewRoute,
  pushReviewRoute,
  reviewRouteKey,
  updateReviewLevelState,
  createCategoryOnlyArchiveFilters,
  type ReviewQueryPatchOptions,
  type ReviewHistoryState,
  type ReviewQueryState,
  type ReviewRoute,
} from "../archive/archiveState.ts";
import { hasArchiveKeywordConditions } from "../archive/archiveQuery.ts";
import { createOwnerEventQueryKey, mergeOwnerEventGroupPage } from "../archive/reviewOwnerEventQueryState.ts";
import { getOwnerEventDisplayPage, shouldShowOwnerEventSearchLoading, type OwnerEventResultsCache } from "../archive/reviewOwnerEventResultsState.ts";
import { resolveReviewScrollTop, reviewScrollContextKey } from "../archive/reviewScrollPosition.ts";
import { isReviewFilterInteractionTarget, reduceReviewFilterVisibility } from "../archive/reviewScrollBehavior.ts";
import { filterConditionCount } from "./ReviewSearchControls";
import { ReviewOwnerList } from "./ReviewOwnerList";
import { ReviewOwnerToolbar } from "./ReviewOwnerToolbar";
import { ReviewOwnerSessionFilters } from "./ReviewOwnerSessionFilters";
import { ReviewOwnerEventFilters } from "./ReviewOwnerEventFilters";
import { ReviewOwnerEventResults, ReviewOwnerEventResultsToolbar } from "./ReviewOwnerEventResults";
import { ReviewSessionTimeline } from "./ReviewSessionTimeline";
import { ReviewSearchControls } from "./ReviewSearchControls";
import { ReviewArchiveManagement } from "./ReviewArchiveManagement";
import { ReviewFavoritesPanel } from "./ReviewFavoritesPanel";
import { FavoriteOrganizationEditor } from "./FavoriteOrganizationEditor";
import { ArchiveCoverThumbnail } from "./ArchiveCoverThumbnail";
import { useConnection } from "../stores/connection";
import { useSession } from "../stores/session";
import { getRealRoomId, getMasterInfo } from "../protocol/api";
import { createArchiveFavoriteActions, flushArchiveWriter, runArchiveTransfer, useArchiveRuntime } from "../archive/archiveRuntime.ts";
import { useGeneralSettings } from "../generalSettings.ts";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useVoiceSettings } from "../voice/voiceSettings.ts";
import { removeUserNickname, upsertUserNickname } from "../userNicknames.ts";
import { voiceController } from "../voice/voiceRuntime.ts";
import { createArchiveRequestId, recordArchiveDiagnostic, updateArchiveReviewState } from "../archive/archiveDiagnostics.ts";
import { formatArchiveDateTime } from "../archive/archiveDisplay.ts";
import { isArchiveSessionRecording } from "../archive/archiveSessionState.ts";
import { bindFavoriteEvent, isEventFavorited, restoreFavoriteEvent, useEventAnnotations } from "../eventAnnotations.ts";
import type { ArchiveProjectedEvent } from "../archive/archiveProjection.ts";
import { ConnectBar } from "./ConnectBar";
import { ConfirmDialog } from "./ConfirmDialog";
import { createReviewReadingMemoryStore, type ReviewReadingMemoryStore } from "../archive/reviewReadingMemory.ts";
import { ReviewDataExportDialog, type ReviewDataExportScopeOption } from "./ReviewDataExportDialog";
import { cloudRecoveryTask } from "../cloudSync/cloudRecoveryRuntime.ts";
import { CloudRecoveryDialog } from "./CloudRecoveryDialog.tsx";
import type { CloudRecoverySelection } from "../cloudSync/recoveryContract.ts";

export interface ReviewPanelProps {
  repository: ArchiveRepositoryContract | null;
  anchors: readonly Anchor[];
  active: boolean;
  refreshKey: unknown;
  onOpenCloudRecoverySettings: () => void;
  onArchiveChanged?: () => void;
}

const REVIEW_QUERY_PREFERENCES_KEY = "danmu-review-query-preferences";
const REVIEW_OWNER_SORT_PREFERENCES_KEY = "danmu-review-owner-sort-preferences";
const DEFAULT_REVIEW_OWNER_STATE = createDefaultReviewOwnerState();

interface ReviewOwnerSortPreferences {
  session: { sort: ArchiveSessionSort; direction: ArchiveSortDirection };
  events: { sort: ReviewOwnerEventQuery["sort"]; direction: ArchiveSortDirection };
}

const DEFAULT_REVIEW_OWNER_SORT_PREFERENCES: ReviewOwnerSortPreferences = {
  session: { sort: "startedAt", direction: "desc" },
  events: { sort: "latestMatch", direction: "desc" },
};

function loadReviewOwnerSortPreferences(): ReviewOwnerSortPreferences {
  if (typeof window === "undefined") return DEFAULT_REVIEW_OWNER_SORT_PREFERENCES;
  try {
    const stored = window.localStorage.getItem(REVIEW_OWNER_SORT_PREFERENCES_KEY);
    if (!stored) return DEFAULT_REVIEW_OWNER_SORT_PREFERENCES;
    const input = JSON.parse(stored) as Partial<ReviewOwnerSortPreferences>;
    const sessionSort = input.session?.sort;
    const eventSort = input.events?.sort;
    return {
      session: {
        sort: ["startedAt", "duration", "eventCount", "paidTotal", "favoriteCount"].includes(sessionSort ?? "")
          ? sessionSort as ArchiveSessionSort
          : DEFAULT_REVIEW_OWNER_SORT_PREFERENCES.session.sort,
        direction: input.session?.direction === "asc" ? "asc" : "desc",
      },
      events: {
        sort: ["latestMatch", "sessionStartedAt", "matchCount"].includes(eventSort ?? "")
          ? eventSort as ReviewOwnerEventQuery["sort"]
          : DEFAULT_REVIEW_OWNER_SORT_PREFERENCES.events.sort,
        direction: input.events?.direction === "asc" ? "asc" : "desc",
      },
    };
  } catch {
    return DEFAULT_REVIEW_OWNER_SORT_PREFERENCES;
  }
}

function saveReviewOwnerSortPreferences(preferences: ReviewOwnerSortPreferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REVIEW_OWNER_SORT_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // 本地存储不可用时仍保留当前进程内的排序偏好。
  }
}

const OWNER_SESSION_PAGE_SIZE = 50;

function archiveSessionQueryFromOwnerQuery(ownerId: string, query: ReviewOwnerSessionQuery, offset = 0): ArchiveSessionQuery {
  return {
    ownerId,
    searchText: query.title.trim() || undefined,
    status: query.status,
    quality: query.quality,
    favoriteOnly: query.favoriteOnly,
    fromTs: query.startedFromTs,
    toTs: query.startedToTs,
    sort: query.sort,
    direction: query.direction,
    limit: OWNER_SESSION_PAGE_SIZE + 1,
    offset,
  };
}

function ownerEventQueryHasConditions(query: ReviewOwnerEventQuery): boolean {
  const keywordCount = query.filters.keywordConditions?.length ?? 0;
  return filterConditionCount(query.filters, keywordCount) > 0
    || Boolean(query.filters.searchText?.trim());
}

function activeArchiveFilterKeys(filters: ArchiveFilterState): string[] {
  return Object.entries(filters).flatMap(([key, value]) => {
    if (value === undefined || value === null || value === false || value === "") return [];
    if (key === "filterMode" && filters.primaryCategories === undefined && filters.secondaryCategories === undefined) return [];
    if (key === "giftPriceMode" && filters.giftPriceMinRmb === undefined && filters.giftPriceMaxRmb === undefined) return [];
    if (key === "favoriteOnly" && value !== true) return [];
    if (key === "showBigEmote" && value !== false) return [];
    if (Array.isArray(value)) return value.length > 0 || key === "primaryCategories" ? [key] : [];
    return [key];
  }).sort();
}

function loadReviewQueryPreferences(): ReviewQueryState {
  if (typeof window === "undefined") return normalizeReviewQueryPreferences(DEFAULT_REVIEW_QUERY_PREFERENCES);
  try {
    const stored = window.localStorage.getItem(REVIEW_QUERY_PREFERENCES_KEY);
    return normalizeReviewQueryPreferences(stored ? JSON.parse(stored) : DEFAULT_REVIEW_QUERY_PREFERENCES);
  } catch {
    return normalizeReviewQueryPreferences(DEFAULT_REVIEW_QUERY_PREFERENCES);
  }
}

function saveReviewQueryPreferences(query: ReviewQueryState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REVIEW_QUERY_PREFERENCES_KEY, JSON.stringify(query));
  } catch {
    // 本地存储不可用时仍保留当前进程内的回看偏好。
  }
}

function ownerIdForRoom(roomId: number): string {
  return `room:${roomId}`;
}

function formatAmount(amount: number): string {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 3 }).format(amount);
}

function ChevronLeftIcon() {
  return (
    <LucideChevronLeft aria-hidden="true" className="size-4 shrink-0" />
  );
}

function ArchiveManageIcon() {
  return (
    <LucideArchive aria-hidden="true" className="size-4 shrink-0" />
  );
}

function CloudRecoveryIcon() {
  return <LucideCloudDownload aria-hidden="true" className="size-4 shrink-0" />;
}

function OwnerSummary({
  owner,
  sessions,
}: {
  owner: ArchiveOwnerSummary | null;
  sessions: readonly ArchiveSessionSummary[];
}) {
  const sessionCount = owner?.sessionCount ?? sessions.length;
  const eventCount = owner?.eventCount ?? sessions.reduce((total, session) => total + (session.eventCount ?? 0), 0);
  const paidTotal = owner?.paidTotal ?? sessions.reduce((total, session) => total + (session.paidTotal ?? 0), 0);
  const favoriteCount = owner?.favoriteCount ?? sessions.reduce((total, session) => total + (session.favoriteCount ?? 0), 0);
  const latestSessionAt = owner?.latestSessionAt ?? sessions.reduce<number | null>((latest, session) => Math.max(latest ?? 0, session.startedAt), null);
  const incompleteCount = owner?.incompleteSessionCount ?? sessions.filter((session) => session.quality === "incomplete").length;

  return (
    <section aria-label="主播档案摘要" className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
      <div className="rounded-lg border border-line bg-surface px-3 py-2">
        <div className="ui-type-meta text-t3">场次</div>
        <div className="mt-1 ui-type-section-title text-t1">{sessionCount}</div>
      </div>
      <div className="rounded-lg border border-line bg-surface px-3 py-2">
        <div className="ui-type-meta text-t3">最近直播</div>
        <div className="mt-1 truncate ui-type-section-title text-t1" title={formatArchiveDateTime(latestSessionAt)}>{formatArchiveDateTime(latestSessionAt)}</div>
      </div>
      <div className="rounded-lg border border-line bg-surface px-3 py-2">
        <div className="ui-type-meta text-t3">累计事件</div>
        <div className="mt-1 ui-type-section-title text-t1">{formatAmount(eventCount)}</div>
      </div>
      <div className="rounded-lg border border-line bg-surface px-3 py-2">
        <div className="ui-type-meta text-t3">累计付费</div>
        <div className="mt-1 ui-type-section-title text-t1">{formatAmount(paidTotal)}</div>
      </div>
      <div className="rounded-lg border border-line bg-surface px-3 py-2">
        <div className="ui-type-meta text-t3">累计收藏</div>
        <div className="mt-1 ui-type-section-title text-t1">{formatAmount(favoriteCount)}</div>
      </div>
      <div className="rounded-lg border border-line bg-surface px-3 py-2">
        <div className="ui-type-meta text-t3">不完整场次</div>
        <div className="mt-1 ui-type-section-title text-t1">{incompleteCount}</div>
      </div>
    </section>
  );
}

export function ReviewPanel({ repository, anchors, active, refreshKey, onOpenCloudRecoverySettings, onArchiveChanged }: ReviewPanelProps) {
  const [route, setRoute] = useState<ReviewRoute>({ level: "home" });
  const [homeMode, setHomeMode] = useState<"owners" | "favorites">("owners");
  const [reviewQueryPreferences, setReviewQueryPreferences] = useState<ReviewQueryState>(() => loadReviewQueryPreferences());
  const [ownerSortPreferences, setOwnerSortPreferences] = useState<ReviewOwnerSortPreferences>(() => loadReviewOwnerSortPreferences());
  const [history, setHistory] = useState<ReviewHistoryState>(() => createReviewHistoryState(loadReviewQueryPreferences()));
  const historyRef = useRef(history);
  historyRef.current = history;
  const [owners, setOwners] = useState<ArchiveOwnerSummary[]>([]);
  const ownerProfileAttempts = useRef(new Set<number>());
  const [ownersLoading, setOwnersLoading] = useState(false);
  const [ownersRefreshRevision, setOwnersRefreshRevision] = useState(0);
  const [ownersError, setOwnersError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ArchiveSessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [ownerSessionRefreshRevision, setOwnerSessionRefreshRevision] = useState(0);
  const [sessionsLoadedRouteKey, setSessionsLoadedRouteKey] = useState<string | null>(null);
  const [sessionsLoadingMore, setSessionsLoadingMore] = useState(false);
  const [sessionsHasMore, setSessionsHasMore] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [ownerSearchText, setOwnerSearchText] = useState("");
  const [selectedSession, setSelectedSession] = useState<ArchiveSessionSummary | null>(null);
  const [showManagement, setShowManagement] = useState(false);
  const [managementRevision, setManagementRevision] = useState(0);
  const [reviewExportBusy, setReviewExportBusy] = useState(false);
  const [dataExportOpen, setDataExportOpen] = useState(false);
  const [cloudRecoveryOpen, setCloudRecoveryOpen] = useState(false);
  const [dataExportDefaultScopeId, setDataExportDefaultScopeId] = useState("");
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
  const [batchDeletePreview, setBatchDeletePreview] = useState<(ArchiveDeletePreview & { previewId: string }) | null>(null);
  const [batchDeleteRequestId, setBatchDeleteRequestId] = useState<string | null>(null);
  const [batchDeleteConfirmOpen, setBatchDeleteConfirmOpen] = useState(false);
  const [batchDeleteBusy, setBatchDeleteBusy] = useState(false);
  const [reviewFiltersCollapsed, setReviewFiltersCollapsed] = useState(false);
  const [reviewUserFilter, setReviewUserFilter] = useState<{ uid: string; name: string } | null>(null);
  const [ownerEventResults, setOwnerEventResults] = useState<OwnerEventResultsCache<ArchiveOwnerEventGroupPage> | null>(null);
  const [ownerEventSearchLoading, setOwnerEventSearchLoading] = useState(false);
  const [ownerEventSearchError, setOwnerEventSearchError] = useState<string | null>(null);
  const [ownerArchiveRevision, setOwnerArchiveRevision] = useState(0);
  const [ownerEventDataRevision, setOwnerEventDataRevision] = useState(0);
  const preSearchQueriesRef = useRef<Record<string, ReviewQueryState>>({});
  const preOwnerHistoryQueriesRef = useRef<Record<string, ReviewQueryState>>({});
  const reviewQueryRouteSyncRef = useRef<string | null>(null);
  const skipNextReviewQueryPrefsSyncRef = useRef<string | null>(null);
  const ownerEventQueryKeyRef = useRef("");
  const lastOwnerEventRefreshRef = useRef<{ queryKey: string; refreshKey: string; mutationKey: string } | null>(null);
  const ownerArchiveRevisionRef = useRef(0);
  const ownerEventRequestGenerationRef = useRef(0);
  const ownerEventFirstPageGenerationRef = useRef<number | null>(null);
  const ownerSessionRequestGenerationRef = useRef(0);
  const lastOwnersRefreshRef = useRef(refreshKey);
  const lastOwnerSessionRefreshRef = useRef(refreshKey);
  const lastOwnerArchiveRefreshRef = useRef(refreshKey);
  const archiveMutationRevision = useArchiveRuntime((state) => state.archiveMutationRevision);
  const lastOwnerMutationRevisionRef = useRef(archiveMutationRevision);
  const readingRestoreGuardRef = useRef(createReadingStateRestoreGuard());
  const readingMemoryRef = useRef<ReviewReadingMemoryStore | null>(null);
  if (readingMemoryRef.current === null) readingMemoryRef.current = createReviewReadingMemoryStore();
  const readingMemory = readingMemoryRef.current;
  const reviewEntryInitializedRef = useRef(false);
  const reviewFiltersAutoCollapsedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const reviewScrollContextRef = useRef<string | null>(null);
  const connectionState = useConnection((state) => state.state);
  const liveSessions = useConnection((state) => state.sessions);
  const archiveWriterStatus = useArchiveRuntime((state) => state.archiveWriterStatus);
  const currentRoomId = connectionState.roomId;
  const currentArchiveSessionId = currentRoomId == null ? null : liveSessions[String(currentRoomId)]?.archive?.sessionId ?? null;
  const eventDisplayPreferences = useGeneralSettings((state) => state.eventDisplayPreferences);
  const reviewOpenCurrentOwner = useGeneralSettings((state) => state.reviewOpenCurrentOwner);
  const favoriteEditOnAdd = useGeneralSettings((state) => state.favoriteEditOnAdd);
  const transferService = useMemo(() => repository ? new ArchiveTransferService({
    repository,
    flushArchiveWriter,
    runArchiveTransfer,
  }) : null, [repository]);
  const [reviewActionError, setReviewActionError] = useState<string | null>(null);
  const [favoriteEditor, setFavoriteEditor] = useState<{
    stableId: string;
    title: string;
    note: string;
    tags: string[];
    availableTags: ArchiveFavoriteTag[];
  } | null>(null);

  useEffect(() => {
    if (!active || reviewEntryInitializedRef.current) return;
    reviewEntryInitializedRef.current = true;
    const nextRoute = getReviewEntryRoute(currentRoomId, reviewOpenCurrentOwner);
    setHistory((current) => pushReviewRoute(current, nextRoute));
    setRoute(nextRoute);
    recordArchiveDiagnostic("open", "review-open", "opened", {
      stream: "render",
      windowLabel: "main",
      data: {
        level: nextRoute.level,
        route: reviewRouteKey(nextRoute),
        source: nextRoute.level === "owner" ? "current-owner" : "archive-home",
      },
    });
  }, [active, currentRoomId, reviewOpenCurrentOwner]);

  useEffect(() => {
    let disposed = false;
    let completed = false;
    if (!repository || !active) {
      setOwners([]);
      setOwnersLoading(false);
      setOwnersError(null);
      return () => { disposed = true; };
    }
    const requestId = createArchiveRequestId("review-owners");
    recordArchiveDiagnostic("request", "archive-query", "started", {
      requestId,
      stream: "source",
      data: { phase: "owners" },
    });
    setOwnersError(null);
    setOwnersLoading(true);
    void (async () => {
      try {
        const nextOwners = await repository.listOwners({ limit: 500 });
        if (disposed) return;
        completed = true;
        recordArchiveDiagnostic("success", "archive-query", "completed", {
          requestId,
          stream: "source",
          count: nextOwners.length,
          data: { phase: "owners", itemCount: nextOwners.length },
        });
        setOwners(nextOwners);
      } catch (error) {
        if (disposed) return;
        completed = true;
        recordArchiveDiagnostic("failure", "archive-query", "failed", {
          requestId,
          stream: "source",
          data: { phase: "owners", error: error instanceof Error ? error.message : String(error) },
        });
        setOwnersError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!disposed) setOwnersLoading(false);
      }
    })();
    return () => {
      disposed = true;
      if (!completed) {
        recordArchiveDiagnostic("cancel", "archive-query", "canceled", {
          requestId,
          stream: "source",
          data: { phase: "owners", reason: "superseded" },
        });
      }
    };
  }, [active, ownersRefreshRevision, repository]);

  useEffect(() => {
    if (Object.is(lastOwnersRefreshRef.current, refreshKey)) return;
    lastOwnersRefreshRef.current = refreshKey;
    if (!active || ownersLoading) return;
    setOwnersRefreshRevision((current) => current + 1);
  }, [active, ownersLoading, refreshKey]);

  useEffect(() => {
    if (!active || !repository) return;
    void (async () => {
      for (const item of owners) {
        if (item.name?.trim() || ownerProfileAttempts.current.has(item.roomId)) continue;
        ownerProfileAttempts.current.add(item.roomId);
        try {
          const local = anchors.find((anchor) => anchor.realRoomId === item.roomId && anchor.uname.trim());
          let name = local?.uname.trim();
          let avatarUrl = local?.face;
          let uid = item.uid;
          if (!name) {
            const cookie = useSession.getState().session?.cookie;
            const room = await getRealRoomId(item.roomId, cookie);
            if (room.room_id !== item.roomId) throw new Error("房间资料不匹配");
            const master = await getMasterInfo(room.uid, cookie);
            name = master.uname?.trim();
            avatarUrl = master.face;
            uid = String(room.uid);
          }
          if (!name) throw new Error("未获取到主播名称");
          await repository.fillOwnerProfile({ ownerId: item.ownerId, roomId: item.roomId, name, avatarUrl, uid });
          setOwners(await repository.listOwners({ limit: 500 }));
          recordArchiveDiagnostic("success", "archive-query", "completed", {
            stream: "source", data: { phase: "owner-profile", roomId: item.roomId },
          });
        } catch (error) {
          recordArchiveDiagnostic("failure", "archive-query", "failed", {
            stream: "source", data: { phase: "owner-profile", roomId: item.roomId, error: error instanceof Error ? error.message : String(error) },
          });
        }
      }
    })();
  }, [active, repository, owners, anchors]);

  const owner = useMemo(() => {
    if (route.level === "home") return null;
    return owners.find((item) => item.roomId === route.roomId) ?? null;
  }, [owners, route]);

  const ownerAnchor = useMemo(() => {
    if (route.level === "home") return null;
    return anchors.find((anchor) => anchor.realRoomId === route.roomId) ?? null;
  }, [anchors, route]);

  const activeLevelState = getReviewLevelState(history, route);
  const activeQuery = activeLevelState.query;
  const activeTimelineHasConditions = Boolean(activeQuery.searchText.trim())
    || hasArchiveKeywordConditions(activeQuery.filters)
    || filterConditionCount(activeQuery.filters, activeQuery.filters.keywordConditions?.length ?? 0) > 0;
  const ownerState = useMemo(() => {
    const stored = activeLevelState.ownerState ?? DEFAULT_REVIEW_OWNER_STATE;
    return {
      ...stored,
      sessionQuery: { ...stored.sessionQuery, ...ownerSortPreferences.session },
      eventQuery: { ...stored.eventQuery, ...ownerSortPreferences.events },
    };
  }, [activeLevelState.ownerState, ownerSortPreferences]);
  const ownerSessionQuery = ownerState.sessionQuery;
  const ownerEventQuery = ownerState.eventQuery;
  const ownerEventHasConditions = ownerEventQueryHasConditions(ownerEventQuery);
  const ownerEventOwnerId = owner?.ownerId ?? (route.level === "owner" ? ownerIdForRoom(route.roomId) : "");
  const ownerEventQueryKey = createOwnerEventQueryKey(ownerEventOwnerId, ownerEventQuery);
  const ownerEventRefreshKey = JSON.stringify({ ownerArchiveRevision, ownerEventDataRevision, managementRevision });
  const ownerEventMutationKey = JSON.stringify({ archiveMutationRevision, ownerEventDataRevision, managementRevision });
  const displayedOwnerEventPage = getOwnerEventDisplayPage(ownerEventResults, ownerEventOwnerId, ownerEventHasConditions);
  const routeKey = reviewRouteKey(route);
  const activeReviewUserFilter = activeQuery.filters.userUid
    ? {
        uid: activeQuery.filters.userUid,
        name: reviewUserFilter?.uid === activeQuery.filters.userUid ? reviewUserFilter.name : activeQuery.filters.userUid,
      }
    : null;

  useEffect(() => {
    setReviewUserFilter(null);
  }, [routeKey]);

  const dataExportScopeOptions = useMemo<ReviewDataExportScopeOption[]>(() => {
    if (route.level === "home") return [];
    const ownerId = owner?.ownerId ?? ownerIdForRoom(route.roomId);
    const options: ReviewDataExportScopeOption[] = [];
    if (route.level === "session") {
      const filters = {
        ...activeQuery.filters,
        ...(activeQuery.searchText.trim() ? { searchText: activeQuery.searchText.trim() } : {}),
      };
      const hasConditions = activeTimelineHasConditions;
      const scope = activeQuery.searchScope === "owner"
        ? { kind: "owner" as const, ownerId, filters }
        : { kind: "session" as const, sessionId: route.sessionId, filters };
      options.push({
        id: hasConditions ? "session-filtered" : "session-current",
        label: hasConditions ? "当前筛选结果" : "当前场次",
        description: hasConditions ? "只导出符合当前筛选条件的事件" : "导出当前打开场次的全部事件",
        scope,
      });
      if (hasConditions) {
        options.push({
          id: "session-all",
          label: "当前场次全部事件",
          description: "忽略当前筛选条件，导出这场直播的全部事件",
          scope: { kind: "session", sessionId: route.sessionId },
        });
      }
      return options;
    }

    options.push({
      id: "owner-all",
      label: "主播全部场次",
      description: "导出该主播档案中所有场次的事件",
      scope: { kind: "owner", ownerId },
    });
    if (ownerState.mode === "sessions") {
      options.push({
        id: "owner-filtered-sessions",
        label: "当前场次筛选结果",
        description: "按当前场次筛选条件导出符合条件的场次",
        scope: { kind: "owner", ownerId, sessionQuery: archiveSessionQueryFromOwnerQuery(ownerId, ownerSessionQuery) },
      });
      if (selectedSessionIds.length > 0) {
        options.push({
          id: "selected-sessions",
          label: `已选 ${selectedSessionIds.length} 场`,
          description: "只导出场次列表中勾选的场次",
          scope: { kind: "sessions", sessionIds: selectedSessionIds },
        });
      }
    } else if (ownerEventHasConditions) {
      options.unshift({
        id: "owner-event-results",
        label: "当前事件检索结果",
        description: "只导出符合当前事件检索条件的事件",
        scope: { kind: "owner", ownerId, filters: ownerEventQuery.filters },
      });
    }
    return options;
  }, [activeQuery.filters, activeQuery.searchScope, activeQuery.searchText, activeTimelineHasConditions, owner?.ownerId, ownerEventHasConditions, ownerEventQuery.filters, ownerSessionQuery, ownerState.mode, route, selectedSessionIds]);

  const openDataExport = useCallback((scopeId?: string) => {
    setDataExportDefaultScopeId(scopeId ?? dataExportScopeOptions[0]?.id ?? "");
    setDataExportOpen(true);
  }, [dataExportScopeOptions]);

  const clearBatchSelection = useCallback(() => {
    setSelectedSessionIds([]);
  }, []);

  const toggleSessionSelection = useCallback((sessionId: string, selected: boolean) => {
    if (selected && sessions.some(session => session.sessionId === sessionId && isArchiveSessionRecording(session))) return;
    setSelectedSessionIds((current) => {
      const next = new Set(current);
      if (selected) next.add(sessionId);
      else next.delete(sessionId);
      return [...next];
    });
  }, [sessions]);

  const toggleAllSessionSelection = useCallback((selected: boolean) => {
    if (selected) {
      setSelectedSessionIds(sessions.filter((session) => !isArchiveSessionRecording(session)).map((session) => session.sessionId));
      return;
    }
    clearBatchSelection();
  }, [clearBatchSelection, sessions]);

  const previewSelectedSessions = useCallback(async () => {
    if (!transferService || route.level !== "owner" || selectedSessionIds.length === 0) return;
    const requestId = createArchiveRequestId("review-batch-delete");
    setReviewActionError(null);
    try {
      recordArchiveDiagnostic("request", "archive-delete", "started", {
        requestId,
        stream: "source",
        data: { phase: "batch-preview", sessionCount: selectedSessionIds.length },
      });
      const preview = await transferService.previewDelete({
        ownerId: owner?.ownerId ?? ownerIdForRoom(route.roomId),
        sessionIds: selectedSessionIds,
      }, { requestId });
      recordArchiveDiagnostic("success", "archive-delete", "previewed", {
        requestId,
        stream: "source",
        count: preview.eventCount,
        data: { phase: "batch-preview", sessionCount: preview.sessionCount, blockedSessionCount: preview.blockedSessionCount },
      });
      setBatchDeletePreview(preview);
      setBatchDeleteRequestId(requestId);
      setBatchDeleteConfirmOpen(true);
    } catch (error) {
      recordArchiveDiagnostic("failure", "archive-delete", "failed", {
        requestId,
        stream: "source",
        data: { phase: "batch-preview", error: error instanceof Error ? error.message : String(error) },
      });
      setReviewActionError(error instanceof Error ? error.message : String(error));
    }
  }, [owner?.ownerId, route, selectedSessionIds, transferService]);

  const cancelBatchDelete = useCallback(() => {
    if (batchDeletePreview && transferService) {
      transferService.cancelDeletePreview(batchDeletePreview.previewId, batchDeleteRequestId ?? undefined);
      recordArchiveDiagnostic("cancel", "archive-delete", "canceled", {
        requestId: batchDeleteRequestId ?? undefined,
        stream: "source",
        data: { phase: "batch-preview-dismissed", previewId: batchDeletePreview.previewId },
      });
    }
    setBatchDeletePreview(null);
    setBatchDeleteRequestId(null);
    setBatchDeleteConfirmOpen(false);
  }, [batchDeletePreview, batchDeleteRequestId, transferService]);

  const confirmBatchDelete = useCallback(async () => {
    if (!batchDeletePreview || !transferService) return;
    const requestId = createArchiveRequestId("review-batch-delete-commit");
    setBatchDeleteBusy(true);
    setReviewActionError(null);
    try {
      recordArchiveDiagnostic("request", "archive-delete", "started", {
        requestId,
        stream: "source",
        data: { phase: "batch-commit", sessionCount: batchDeletePreview.sessionCount },
      });
      await transferService.deleteArchive(batchDeletePreview.previewId, batchDeletePreview.previewId, { requestId });
      recordArchiveDiagnostic("success", "archive-delete", "deleted", {
        requestId,
        stream: "source",
        count: batchDeletePreview.eventCount,
        data: { phase: "batch-commit", sessionCount: batchDeletePreview.sessionCount },
      });
      setBatchDeletePreview(null);
      setBatchDeleteRequestId(null);
      setBatchDeleteConfirmOpen(false);
      clearBatchSelection();
      setManagementRevision((value) => value + 1);
    } catch (error) {
      recordArchiveDiagnostic("failure", "archive-delete", "failed", {
        requestId,
        stream: "source",
        data: { phase: "batch-commit", error: error instanceof Error ? error.message : String(error) },
      });
      setReviewActionError(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      setBatchDeleteBusy(false);
    }
  }, [batchDeletePreview, clearBatchSelection, transferService]);

  useEffect(() => {
    setSelectedSessionIds((current) => {
      if (route.level !== "owner") return current.length === 0 ? current : [];
      const available = new Set(sessions.filter((session) => !isArchiveSessionRecording(session)).map((session) => session.sessionId));
      const next = current.filter((sessionId) => available.has(sessionId));
      return next.length === current.length ? current : next;
    });
  }, [route, sessions]);

  useEffect(() => {
    saveReviewOwnerSortPreferences(ownerSortPreferences);
  }, [ownerSortPreferences]);

  useEffect(() => {
    ownerEventQueryKeyRef.current = ownerEventQueryKey;
  }, [ownerEventQueryKey]);

  useEffect(() => {
    const mutationChanged = lastOwnerMutationRevisionRef.current !== archiveMutationRevision;
    if (Object.is(lastOwnerArchiveRefreshRef.current, refreshKey) && !mutationChanged) return;
    if (route.level !== "owner") return;
    lastOwnerArchiveRefreshRef.current = refreshKey;
    lastOwnerMutationRevisionRef.current = archiveMutationRevision;
    if (!mutationChanged && route.roomId !== currentRoomId) return;
    const nextRevision = ownerArchiveRevisionRef.current + 1;
    ownerArchiveRevisionRef.current = nextRevision;
    setOwnerArchiveRevision(nextRevision);
  }, [archiveMutationRevision, currentRoomId, refreshKey, route]);

  useEffect(() => {
    if (route.level !== "owner") return;
    setHistory((current) => {
      const currentOwnerState = getReviewLevelState(current, route).ownerState ?? createDefaultReviewOwnerState();
      if (
        currentOwnerState.sessionQuery.sort === ownerSortPreferences.session.sort
        && currentOwnerState.sessionQuery.direction === ownerSortPreferences.session.direction
        && currentOwnerState.eventQuery.sort === ownerSortPreferences.events.sort
        && currentOwnerState.eventQuery.direction === ownerSortPreferences.events.direction
      ) return current;
      return updateReviewLevelState(current, route, {
        ownerState: {
          sessionQuery: ownerSortPreferences.session,
          eventQuery: ownerSortPreferences.events,
        },
      });
    });
  }, [ownerSortPreferences, route]);

  useEffect(() => {
    if (route.level === "owner") return;
    if (skipNextReviewQueryPrefsSyncRef.current === routeKey) {
      skipNextReviewQueryPrefsSyncRef.current = null;
      reviewQueryRouteSyncRef.current = routeKey;
      return;
    }
    if (reviewQueryRouteSyncRef.current !== routeKey) {
      reviewQueryRouteSyncRef.current = routeKey;
      const preferredQuery = normalizeReviewQueryPreferences(reviewQueryPreferences);
      if (JSON.stringify(activeQuery) !== JSON.stringify(preferredQuery)) {
        setHistory((current) => updateReviewLevelState(current, route, { query: preferredQuery }));
      }
      return;
    }
    const nextPreferences = normalizeReviewQueryPreferences(activeQuery);
    if (JSON.stringify(nextPreferences) === JSON.stringify(reviewQueryPreferences)) return;
    setReviewQueryPreferences(nextPreferences);
    saveReviewQueryPreferences(nextPreferences);
  }, [activeQuery, reviewQueryPreferences, route, routeKey]);

  useEffect(() => {
    if (!active) return;
    const diagnosticsQuery = route.level === "owner"
      ? ownerState.mode === "events"
        ? { searchText: "", filters: ownerEventQuery.filters, searchScope: "owner" as const, sort: ownerEventQuery.sort, sortDirection: ownerEventQuery.direction }
        : { searchText: ownerSessionQuery.title, filters: {}, searchScope: "owner" as const, sort: ownerSessionQuery.sort, sortDirection: ownerSessionQuery.direction }
      : activeQuery;
    updateArchiveReviewState({
      route: routeKey,
      hasSearchText: Boolean(diagnosticsQuery.searchText.trim()),
      filterKeys: Object.keys(diagnosticsQuery.filters),
      searchScope: diagnosticsQuery.searchScope,
      sortField: diagnosticsQuery.sort,
      sortDirection: diagnosticsQuery.sortDirection,
      ...(route.level === "owner" ? {
        ownerMode: ownerState.mode,
        ownerSessionFilterKeys: [
          ...(ownerSessionQuery.title.trim() ? ["title"] : []),
          ...(ownerSessionQuery.startedFromTs !== undefined ? ["startedFromTs"] : []),
          ...(ownerSessionQuery.startedToTs !== undefined ? ["startedToTs"] : []),
          ...(ownerSessionQuery.status?.length ? ["status"] : []),
          ...(ownerSessionQuery.quality?.length ? ["quality"] : []),
          ...(ownerSessionQuery.favoriteOnly ? ["favoriteOnly"] : []),
        ],
        ownerEventFilterKeys: activeArchiveFilterKeys(ownerEventQuery.filters),
      } : {}),
    });
  }, [active, activeQuery, ownerEventQuery, ownerSessionQuery, ownerState.mode, route.level, routeKey]);

  useEffect(() => {
    let disposed = false;
    let completed = false;
    const generation = ++ownerSessionRequestGenerationRef.current;
    if (!repository || !active || route.level !== "owner") {
      setSessions([]);
      setSessionsLoading(false);
      setSessionsLoadingMore(false);
      setSessionsHasMore(false);
      setSessionsError(null);
      setSessionsLoadedRouteKey(null);
      return () => { disposed = true; };
    }
    if (ownerState.mode !== "sessions") {
      setSessionsLoading(false);
      setSessionsLoadingMore(false);
      return () => { disposed = true; };
    }
    const requestId = createArchiveRequestId("review-sessions");
    recordArchiveDiagnostic("request", "archive-query", "started", {
      requestId,
      stream: "source",
      data: { phase: "owner-sessions", route: reviewRouteKey(route) },
    });
    setSessionsHasMore(false);
    setSessionsLoadedRouteKey(null);
    if (sessions.length === 0) setSessionsLoading(true);
    setSessionsError(null);
    void (async () => {
      try {
        const nextSessions = await repository.listSessions(archiveSessionQueryFromOwnerQuery(
          owner?.ownerId ?? ownerIdForRoom(route.roomId),
          ownerSessionQuery,
        ));
        if (disposed || generation !== ownerSessionRequestGenerationRef.current) return;
        completed = true;
        const page = nextSessions.slice(0, OWNER_SESSION_PAGE_SIZE);
        recordArchiveDiagnostic("success", "archive-query", "completed", {
          requestId,
          stream: "source",
          count: page.length,
          data: { phase: "owner-sessions", itemCount: page.length, hasMore: nextSessions.length > OWNER_SESSION_PAGE_SIZE },
        });
        setSessions(page);
        setSessionsHasMore(nextSessions.length > OWNER_SESSION_PAGE_SIZE);
        setSessionsLoadedRouteKey(routeKey);
      } catch (error) {
        if (disposed || generation !== ownerSessionRequestGenerationRef.current) return;
        completed = true;
        recordArchiveDiagnostic("failure", "archive-query", "failed", {
          requestId,
          stream: "source",
          data: { phase: "owner-sessions", error: error instanceof Error ? error.message : String(error) },
        });
        setSessionsError(error instanceof Error ? error.message : String(error));
        setSessionsLoadedRouteKey(routeKey);
      } finally {
        if (!disposed && generation === ownerSessionRequestGenerationRef.current) setSessionsLoading(false);
      }
    })();
    return () => {
      disposed = true;
      if (!completed) {
        recordArchiveDiagnostic("cancel", "archive-query", "canceled", {
          requestId,
          stream: "source",
          data: { phase: "owner-sessions", reason: "superseded" },
        });
      }
    };
  }, [active, managementRevision, owner?.ownerId, ownerSessionQuery, ownerSessionRefreshRevision, ownerState.mode, repository, route]);

  useEffect(() => {
    if (Object.is(lastOwnerSessionRefreshRef.current, refreshKey)) return;
    lastOwnerSessionRefreshRef.current = refreshKey;
    if (!active || route.level !== "owner" || ownerState.mode !== "sessions" || sessionsLoadedRouteKey !== routeKey) return;
    setOwnerSessionRefreshRevision((current) => current + 1);
  }, [active, ownerState.mode, refreshKey, route, routeKey, sessionsLoadedRouteKey]);

  const loadMoreOwnerSessions = useCallback(async () => {
    if (!repository || route.level !== "owner" || ownerState.mode !== "sessions" || !sessionsHasMore || sessionsLoadingMore) return;
    const generation = ownerSessionRequestGenerationRef.current;
    const requestId = createArchiveRequestId("review-sessions-more");
    setSessionsLoadingMore(true);
    setSessionsError(null);
    recordArchiveDiagnostic("request", "archive-query", "started", {
      requestId,
      stream: "source",
      data: { phase: "owner-sessions-more", ownerId: owner?.ownerId ?? ownerIdForRoom(route.roomId), offset: sessions.length },
    });
    try {
      const nextSessions = await repository.listSessions(archiveSessionQueryFromOwnerQuery(
        owner?.ownerId ?? ownerIdForRoom(route.roomId),
        ownerSessionQuery,
        sessions.length,
      ));
      if (generation !== ownerSessionRequestGenerationRef.current) return;
      setSessions((current) => {
        const known = new Set(current.map((session) => session.sessionId));
        return [...current, ...nextSessions.slice(0, OWNER_SESSION_PAGE_SIZE).filter((session) => !known.has(session.sessionId))];
      });
      setSessionsHasMore(nextSessions.length > OWNER_SESSION_PAGE_SIZE);
      recordArchiveDiagnostic("success", "archive-query", "completed", {
        requestId,
        stream: "source",
        count: Math.min(nextSessions.length, OWNER_SESSION_PAGE_SIZE),
        data: { phase: "owner-sessions-more", hasMore: nextSessions.length > OWNER_SESSION_PAGE_SIZE },
      });
    } catch (error) {
      if (generation !== ownerSessionRequestGenerationRef.current) return;
      const message = error instanceof Error ? error.message : String(error);
      setSessionsError(message);
      recordArchiveDiagnostic("failure", "archive-query", "failed", {
        requestId,
        stream: "source",
        data: { phase: "owner-sessions-more", error: message },
      });
    } finally {
      if (generation === ownerSessionRequestGenerationRef.current) setSessionsLoadingMore(false);
    }
  }, [owner?.ownerId, ownerSessionQuery, ownerState.mode, repository, route, sessions.length, sessionsHasMore, sessionsLoadingMore]);

  useEffect(() => {
    let disposed = false;
    let completed = false;
    if (!repository || !active || route.level !== "owner" || ownerState.mode !== "events") {
      ownerEventRequestGenerationRef.current += 1;
      setOwnerEventSearchLoading(false);
      return () => { disposed = true; };
    }
    if (!ownerEventHasConditions) {
      ownerEventRequestGenerationRef.current += 1;
      setOwnerEventSearchError(null);
      setOwnerEventSearchLoading(false);
      updateArchiveReviewState({
        ownerEventFilterKeys: activeArchiveFilterKeys(ownerEventQuery.filters),
        ownerEventSearch: { groupCount: 0, matchCount: 0, durationMs: 0 },
      });
      return () => { disposed = true; };
    }
    const refreshingLoadedResults = !shouldShowOwnerEventSearchLoading(ownerEventResults, ownerEventOwnerId, ownerEventQueryKey);
    if (refreshingLoadedResults && lastOwnerEventRefreshRef.current?.queryKey === ownerEventQueryKey
      && lastOwnerEventRefreshRef.current.refreshKey === ownerEventRefreshKey) return () => { disposed = true; };

    const generation = ++ownerEventRequestGenerationRef.current;
    ownerEventFirstPageGenerationRef.current = generation;
    const retainLoadedResults = refreshingLoadedResults && lastOwnerEventRefreshRef.current?.mutationKey === ownerEventMutationKey;
    const ownerId = owner?.ownerId ?? ownerIdForRoom(route.roomId);
    const activeFilterKeys = activeArchiveFilterKeys(ownerEventQuery.filters);
    const startedAt = Date.now();
    const requestId = createArchiveRequestId("review-owner-event-search");
    const query: ArchiveOwnerEventGroupQuery = {
      ownerId,
      filters: ownerEventQuery.filters,
      sort: ownerEventQuery.sort,
      direction: ownerEventQuery.direction,
      offset: 0,
      groupLimit: 50,
      previewLimit: 3,
    };
    recordArchiveDiagnostic("request", "archive-query", "started", {
      requestId,
      stream: "source",
      data: { phase: "owner-event-search", ownerId, activeFilterKeys: activeFilterKeys.join(",") },
    });
    const showSearchLoading = shouldShowOwnerEventSearchLoading(ownerEventResults, ownerEventOwnerId, ownerEventQueryKey);
    setOwnerEventSearchLoading(true);
    setOwnerEventSearchError(null);
    if (showSearchLoading) {
      updateArchiveReviewState({
        ownerEventFilterKeys: activeFilterKeys,
        ownerEventSearch: { groupCount: 0, matchCount: 0, durationMs: 0 },
      });
    }
    void repository.queryOwnerEventGroups(query).then((page) => {
      if (disposed || generation !== ownerEventRequestGenerationRef.current) return;
      completed = true;
      const matchCount = page.items.reduce((total, group) => total + group.matchCount, 0);
      recordArchiveDiagnostic("success", "archive-query", "completed", {
        requestId,
        stream: "source",
        count: page.items.length,
        data: {
          phase: "owner-event-search",
          ownerId,
          activeFilterKeys: activeFilterKeys.join(","),
          groupCount: page.items.length,
          matchCount,
          durationMs: Math.max(0, Date.now() - startedAt),
        },
      });
      updateArchiveReviewState({
        ownerEventFilterKeys: activeFilterKeys,
        ownerEventSearch: { groupCount: page.items.length, matchCount, durationMs: Math.max(0, Date.now() - startedAt) },
      });
      lastOwnerEventRefreshRef.current = { queryKey: ownerEventQueryKey, refreshKey: ownerEventRefreshKey, mutationKey: ownerEventMutationKey };
      setOwnerEventResults((current) => ({
        ownerId,
        queryKey: ownerEventQueryKey,
        page: retainLoadedResults && current?.queryKey === ownerEventQueryKey
          ? mergeOwnerEventGroupPage(current.page, page, ownerEventQuery.sort, ownerEventQuery.direction)
          : page,
      }));
    }).catch((error: unknown) => {
      if (disposed || generation !== ownerEventRequestGenerationRef.current) return;
      completed = true;
      recordArchiveDiagnostic("failure", "archive-query", "failed", {
        requestId,
        stream: "source",
        data: {
          phase: "owner-event-search",
          ownerId,
          activeFilterKeys: activeFilterKeys.join(","),
          durationMs: Math.max(0, Date.now() - startedAt),
          error: error instanceof Error ? error.message : String(error),
        },
      });
      setOwnerEventSearchError(error instanceof Error ? error.message : String(error));
    }).finally(() => {
      if (ownerEventFirstPageGenerationRef.current === generation) ownerEventFirstPageGenerationRef.current = null;
      if (!disposed && generation === ownerEventRequestGenerationRef.current) setOwnerEventSearchLoading(false);
    });
    return () => {
      disposed = true;
      if (ownerEventFirstPageGenerationRef.current === generation) ownerEventFirstPageGenerationRef.current = null;
      if (!completed) {
        recordArchiveDiagnostic("cancel", "archive-query", "canceled", {
          requestId,
          stream: "source",
          data: { phase: "owner-event-search", ownerId, activeFilterKeys: activeFilterKeys.join(","), reason: "superseded" },
        });
      }
    };
  }, [active, owner?.ownerId, ownerArchiveRevision, ownerEventDataRevision, ownerEventHasConditions, ownerEventOwnerId, ownerEventQuery, ownerEventQueryKey, ownerEventRefreshKey, ownerEventResults?.queryKey, ownerState.mode, repository, route]);

  const loadMoreOwnerEventResults = useCallback(async () => {
    if (!repository || route.level !== "owner" || ownerState.mode !== "events" || !displayedOwnerEventPage?.hasMore || ownerEventFirstPageGenerationRef.current !== null || ownerEventSearchLoading) return;
    const ownerId = owner?.ownerId ?? ownerIdForRoom(route.roomId);
    const requestArchiveRevision = ownerArchiveRevisionRef.current;
    const generation = ++ownerEventRequestGenerationRef.current;
    const offset = displayedOwnerEventPage.nextOffset ?? 0;
    const activeFilterKeys = activeArchiveFilterKeys(ownerEventQuery.filters);
    const startedAt = Date.now();
    const requestId = createArchiveRequestId("review-owner-event-search-more");
    recordArchiveDiagnostic("request", "archive-query", "started", {
      requestId,
      stream: "source",
      data: { phase: "owner-event-search", ownerId, activeFilterKeys: activeFilterKeys.join(","), offset },
    });
    setOwnerEventSearchLoading(true);
    setOwnerEventSearchError(null);
    try {
      const page = await repository.queryOwnerEventGroups({
        ownerId,
        filters: ownerEventQuery.filters,
        sort: ownerEventQuery.sort,
        direction: ownerEventQuery.direction,
        offset,
        groupLimit: 50,
        previewLimit: 3,
      });
      if (generation !== ownerEventRequestGenerationRef.current || ownerEventQueryKeyRef.current !== ownerEventQueryKey || ownerArchiveRevisionRef.current !== requestArchiveRevision) {
        recordArchiveDiagnostic("cancel", "archive-query", "canceled", {
          requestId,
          stream: "source",
          data: { phase: "owner-event-search", ownerId, activeFilterKeys: activeFilterKeys.join(","), reason: "superseded" },
        });
        return;
      }
      const currentPage = ownerEventResults;
      if (!currentPage || currentPage.queryKey !== ownerEventQueryKey) return;
      const mergedPage = mergeOwnerEventGroupPage(currentPage.page, page, ownerEventQuery.sort, ownerEventQuery.direction);
      const matchCount = page.items.reduce((total, group) => total + group.matchCount, 0);
      recordArchiveDiagnostic("success", "archive-query", "completed", {
        requestId,
        stream: "source",
        count: page.items.length,
        data: {
          phase: "owner-event-search",
          ownerId,
          activeFilterKeys: activeFilterKeys.join(","),
          groupCount: page.items.length,
          matchCount,
          durationMs: Math.max(0, Date.now() - startedAt),
        },
      });
      updateArchiveReviewState({
        ownerEventFilterKeys: activeFilterKeys,
        ownerEventSearch: {
          groupCount: mergedPage.items.length,
          matchCount: mergedPage.items.reduce((total, group) => total + group.matchCount, 0),
          durationMs: Math.max(0, Date.now() - startedAt),
        },
      });
      setOwnerEventResults({
        ownerId,
        queryKey: ownerEventQueryKey,
        page: mergedPage,
      });
    } catch (error) {
      if (generation !== ownerEventRequestGenerationRef.current || ownerEventQueryKeyRef.current !== ownerEventQueryKey || ownerArchiveRevisionRef.current !== requestArchiveRevision) return;
      recordArchiveDiagnostic("failure", "archive-query", "failed", {
        requestId,
        stream: "source",
        data: {
          phase: "owner-event-search",
          ownerId,
          activeFilterKeys: activeFilterKeys.join(","),
          durationMs: Math.max(0, Date.now() - startedAt),
          error: error instanceof Error ? error.message : String(error),
        },
      });
      setOwnerEventSearchError(error instanceof Error ? error.message : String(error));
    } finally {
      if (generation === ownerEventRequestGenerationRef.current) {
        setOwnerEventSearchLoading(false);
      }
    }
  }, [displayedOwnerEventPage, owner?.ownerId, ownerEventQuery, ownerEventQueryKey, ownerEventSearchLoading, ownerEventResults, ownerState.mode, repository, route]);

  useEffect(() => {
    if (managementRevision === 0 || !repository || !active) return;
    let disposed = false;
    let completed = false;
    const requestId = createArchiveRequestId("review-refresh");
    recordArchiveDiagnostic("request", "archive-query", "started", {
      requestId,
      stream: "source",
      data: { phase: "management-refresh" },
    });
    void (async () => {
      try {
        const nextOwners = await repository.listOwners({ limit: 500 });
        if (disposed) return;
        setOwners(nextOwners);
        if (disposed) return;
        completed = true;
        recordArchiveDiagnostic("success", "archive-query", "completed", {
          requestId,
          stream: "source",
          count: nextOwners.length,
          data: { phase: "management-refresh", ownerCount: nextOwners.length },
        });
      } catch (error) {
        if (disposed) return;
        completed = true;
        recordArchiveDiagnostic("failure", "archive-query", "failed", {
          requestId,
          stream: "source",
          data: { phase: "management-refresh", error: error instanceof Error ? error.message : String(error) },
        });
        setOwnersError(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => {
      disposed = true;
      if (!completed) {
        recordArchiveDiagnostic("cancel", "archive-query", "canceled", {
          requestId,
          stream: "source",
          data: { phase: "management-refresh", reason: "superseded" },
        });
      }
    };
  }, [active, managementRevision, repository]);

  useEffect(() => {
    let disposed = false;
    if (!repository || !active || route.level !== "session") {
      setSelectedSession(null);
      return () => { disposed = true; };
    }
    let completed = false;
    const requestId = createArchiveRequestId("review-session");
    recordArchiveDiagnostic("request", "archive-query", "started", {
      requestId,
      stream: "source",
      sessionId: route.sessionId,
      data: { phase: "session" },
    });
    void (async () => {
      try {
        const nextSession = await repository.getSession(route.sessionId);
        if (disposed) return;
        completed = true;
        recordArchiveDiagnostic("success", "archive-query", "completed", {
          requestId,
          stream: "source",
          sessionId: route.sessionId,
          count: nextSession ? 1 : 0,
          data: { phase: "session", found: Boolean(nextSession) },
        });
        setSelectedSession(nextSession);
      } catch (error) {
        if (disposed) return;
        completed = true;
        recordArchiveDiagnostic("failure", "archive-query", "failed", {
          requestId,
          stream: "source",
          sessionId: route.sessionId,
          data: { phase: "session", error: error instanceof Error ? error.message : String(error) },
        });
        setSelectedSession(null);
      }
    })();
    return () => {
      disposed = true;
      if (!completed) {
        recordArchiveDiagnostic("cancel", "archive-query", "canceled", {
          requestId,
          stream: "source",
          sessionId: route.sessionId,
          data: { phase: "session", reason: "superseded" },
        });
      }
    };
  }, [active, refreshKey, repository, route, sessions]);

  useEffect(() => {
    const ready = !(route.level === "owner" && ownerState.mode === "sessions" && sessionsLoadedRouteKey !== routeKey);
    const contextKey = reviewScrollContextKey(routeKey, route.level, showManagement);
    const nextScrollTop = resolveReviewScrollTop({
      contextKey,
      lastContextKey: reviewScrollContextRef.current,
      routeLevel: route.level,
      showManagement,
      ready,
      savedScrollTop: getReviewLevelState(historyRef.current, route).scrollTop,
    });
    if (ready && route.level === "session") {
      reviewScrollContextRef.current = contextKey;
      return;
    }
    if (nextScrollTop === null || !scrollRef.current) return;
    scrollRef.current.scrollTop = nextScrollTop;
    reviewScrollContextRef.current = contextKey;
  }, [ownerState.mode, route, route.level, routeKey, sessionsLoadedRouteKey, showManagement]);

  useEffect(() => {
    if (route.level === "session") return;
    reviewFiltersAutoCollapsedRef.current = false;
    setReviewFiltersCollapsed(false);
  }, [routeKey]);

  const openRoute = useCallback((nextRoute: ReviewRoute) => {
    setShowManagement(false);
    setHistory((current) => pushReviewRoute(current, nextRoute));
    setRoute(nextRoute);
    recordArchiveDiagnostic("open", "review-open", "opened", {
      data: { level: nextRoute.level, route: reviewRouteKey(nextRoute) },
      stream: "render",
      windowLabel: "main",
    });
  }, []);

  const goHome = useCallback(() => {
    const home: ReviewRoute = { level: "home" };
    setShowManagement(false);
    setHistory((current) => ({ ...current, stack: [home] }));
    setRoute(home);
    recordArchiveDiagnostic("open", "review-open", "opened", {
      stream: "render",
      windowLabel: "main",
      data: { level: home.level, route: reviewRouteKey(home), source: "archive-breadcrumb" },
    });
  }, []);

  const goBack = useCallback(() => {
    setShowManagement(false);
    const previous = navigateBack(route, history);
    setHistory(popReviewRoute(history, route));
    setRoute(previous);
  }, [history, route]);

  const handleScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    if (route.level === "session") return;
    if (isReviewFilterInteractionTarget(document.activeElement)) return;
    const scrollTop = event.currentTarget.scrollTop;
    setHistory((current) => updateReviewLevelState(current, route, { scrollTop }));
  }, [route]);

  const setReviewFiltersCollapsedManually = useCallback((collapsed: boolean) => {
    reviewFiltersAutoCollapsedRef.current = false;
    setReviewFiltersCollapsed(collapsed);
  }, []);

  const handleReviewTimelineScrollIntent = useCallback((intent: "up" | "down", atTimelineTop: boolean) => {
    const next = reduceReviewFilterVisibility(
      {
        collapsed: reviewFiltersCollapsed,
        autoCollapsed: reviewFiltersAutoCollapsedRef.current,
      },
      intent,
      atTimelineTop,
    );
    reviewFiltersAutoCollapsedRef.current = next.autoCollapsed;
    if (next.collapsed !== reviewFiltersCollapsed) setReviewFiltersCollapsed(next.collapsed);
  }, [reviewFiltersCollapsed]);

  const handleReviewSessionWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    if (event.deltaY === 0) return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement || target instanceof HTMLOptionElement) return;
    if (isReviewFilterInteractionTarget(target)) return;
    const timeline = event.currentTarget.querySelector<HTMLElement>("[data-review-timeline-scroll]");
    if (!timeline || timeline.contains(target as Node)) return;
    event.preventDefault();
    const atTimelineTop = timeline.scrollTop <= 1;
    handleReviewTimelineScrollIntent(event.deltaY < 0 ? "up" : "down", atTimelineTop);
    timeline.scrollBy({ top: event.deltaY, left: 0, behavior: "auto" });
  }, [handleReviewTimelineScrollIntent]);

  const handleReviewOwnerWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    if (event.deltaY === 0) return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement || target instanceof HTMLOptionElement) return;
    if (isReviewFilterInteractionTarget(target)) return;
    const page = event.currentTarget;
    handleReviewTimelineScrollIntent(event.deltaY < 0 ? "up" : "down", page.scrollTop <= 1);
  }, [handleReviewTimelineScrollIntent]);

  const updateActiveQuery = useCallback((patch: Partial<ReviewQueryState>, options: ReviewQueryPatchOptions & { restorePreviousSearch?: boolean } = {}) => {
    const key = reviewRouteKey(route);
    if (route.level === "session") {
      readingRestoreGuardRef.current.markDirty(key);
    }
    setHistory((current) => {
      const level = getReviewLevelState(current, route);
      const nextQuery = applyReviewQueryPatch(level.query, patch, options);
      const wasOwnerHistory = route.level === "session" && level.query.searchScope === "owner";
      const isOwnerHistory = route.level === "session" && nextQuery.searchScope === "owner";
      let resolvedScopeQuery = nextQuery;
      if (!wasOwnerHistory && isOwnerHistory) {
        preOwnerHistoryQueriesRef.current[key] = { ...level.query, filters: { ...level.query.filters } };
      } else if (wasOwnerHistory && !isOwnerHistory) {
        const previous = preOwnerHistoryQueriesRef.current[key];
        if (previous) {
          resolvedScopeQuery = previous;
          delete preOwnerHistoryQueriesRef.current[key];
        }
      }
      const wasSearching = Boolean(level.query.searchText.trim()) || hasArchiveKeywordConditions(level.query.filters);
      const isSearching = Boolean(resolvedScopeQuery.searchText.trim()) || hasArchiveKeywordConditions(resolvedScopeQuery.filters);
      let resolvedQuery = resolvedScopeQuery;
      if (options.restorePreviousSearch === false) {
        delete preSearchQueriesRef.current[key];
        delete preOwnerHistoryQueriesRef.current[key];
      } else if (!wasSearching && isSearching) {
        preSearchQueriesRef.current[key] = { ...level.query, filters: { ...level.query.filters } };
      } else if (wasSearching && !isSearching) {
        const previous = preSearchQueriesRef.current[key];
        if (previous) {
          resolvedQuery = previous;
          delete preSearchQueriesRef.current[key];
        }
      }
      return updateReviewLevelState(current, route, { query: resolvedQuery });
    });
    recordArchiveDiagnostic("setting-change", "review-query-setting", "changed", {
      data: {
        route: reviewRouteKey(route),
        changedKeys: Object.keys(patch).sort().join(","),
      },
    });
  }, [route]);

  const updateOwnerSessionQuery = useCallback((patch: Partial<ReviewOwnerSessionQuery>) => {
    if (route.level !== "owner") return;
    setHistory((current) => updateReviewLevelState(current, route, { ownerState: { sessionQuery: patch } }));
    if (patch.sort !== undefined || patch.direction !== undefined) {
      setOwnerSortPreferences((current) => ({
        ...current,
        session: {
          sort: patch.sort ?? current.session.sort,
          direction: patch.direction ?? current.session.direction,
        },
      }));
    }
  }, [route]);

  const clearOwnerSessionQuery = useCallback(() => {
    updateOwnerSessionQuery({
      title: "",
      startedFromTs: undefined,
      startedToTs: undefined,
      status: undefined,
      quality: undefined,
      favoriteOnly: false,
    });
  }, [updateOwnerSessionQuery]);

  const updateOwnerEventQuery = useCallback((patch: ReviewOwnerEventQueryPatch) => {
    if (route.level !== "owner") return;
    setOwnerEventSearchError(null);
    setHistory((current) => updateReviewLevelState(current, route, { ownerState: { eventQuery: patch } }));
    if (patch.sort !== undefined || patch.direction !== undefined) {
      setOwnerSortPreferences((current) => ({
        ...current,
        events: {
          sort: patch.sort ?? current.events.sort,
          direction: patch.direction ?? current.events.direction,
        },
      }));
    }
  }, [route]);

  const replaceOwnerEventFilters = useCallback((filters: ArchiveFilterState) => {
    updateOwnerEventQuery({ replaceFilters: filters });
  }, [updateOwnerEventQuery]);

  const clearOwnerEventFilters = useCallback(() => {
    replaceOwnerEventFilters({});
  }, [replaceOwnerEventFilters]);

  const openOwnerEventMatch = useCallback((roomId: number, sessionId: string, eventKey: string) => {
    const nextRoute: ReviewRoute = { level: "session", roomId, sessionId };
    setShowManagement(false);
    skipNextReviewQueryPrefsSyncRef.current = reviewRouteKey(nextRoute);
    setHistory((current) => {
      const withRoute = pushReviewRoute(current, nextRoute);
      return updateReviewLevelState(withRoute, nextRoute, {
        query: {
          searchText: "",
          searchScope: "session",
          filters: ownerEventQuery.filters,
          sort: reviewQueryPreferences.sort,
          sortDirection: reviewQueryPreferences.sortDirection,
        },
        targetEventKey: eventKey,
      });
    });
    setRoute(nextRoute);
    recordArchiveDiagnostic("open", "review-open", "opened", {
      stream: "render",
      windowLabel: "main",
      data: { level: "session", route: reviewRouteKey(nextRoute), source: "owner-event-search" },
    });
  }, [ownerEventQuery.filters, reviewQueryPreferences.sort, reviewQueryPreferences.sortDirection]);

  const openFavorite = useCallback((item: ArchiveFavoriteItem) => {
    if (!item.canLocate || !item.sessionId || !item.eventKey) return;
    const nextRoute: ReviewRoute = { level: "session", roomId: item.roomId, sessionId: item.sessionId };
    setShowManagement(false);
    skipNextReviewQueryPrefsSyncRef.current = reviewRouteKey(nextRoute);
    setHistory((current) => {
      const withRoute = pushReviewRoute(current, nextRoute);
      return updateReviewLevelState(withRoute, nextRoute, {
        query: {
          searchText: "",
          searchScope: "session",
          filters: {},
          sort: reviewQueryPreferences.sort,
          sortDirection: reviewQueryPreferences.sortDirection,
        },
        targetEventKey: item.eventKey,
      });
    });
    setRoute(nextRoute);
    recordArchiveDiagnostic("open", "review-open", "opened", {
      stream: "render",
      windowLabel: "main",
      data: { level: "session", route: reviewRouteKey(nextRoute), source: "favorite-context", stableId: item.stableId },
    });
  }, [reviewQueryPreferences.sort, reviewQueryPreferences.sortDirection]);

  const consumeTargetEvent = useCallback((found: boolean) => {
    if (route.level !== "session" || !activeLevelState.targetEventKey) return;
    updateArchiveReviewState({ ownerEventResultFound: found });
    setHistory((current) => updateReviewLevelState(current, route, { targetEventKey: null }));
  }, [activeLevelState.targetEventKey, route]);

  const updateSessionFilters = useCallback((patch: ArchiveFilterState) => {
    if (route.level !== "session") return;
    updateActiveQuery({ filters: patch });
  }, [route, updateActiveQuery]);

  const onReviewUserFilter = useCallback((user: DanmakuUser) => {
    setReviewUserFilter({ uid: user.uid, name: user.uname || user.uid });
    updateSessionFilters({ userUid: user.uid });
  }, [updateSessionFilters]);

  const onClearReviewUserFilter = useCallback(() => {
    if (route.level !== "session") return;
    setReviewUserFilter(null);
    const { userUid: _userUid, ...filters } = activeQuery.filters;
    updateActiveQuery({ filters }, { filters: "replace", restorePreviousSearch: false });
  }, [activeQuery.filters, route, updateActiveQuery]);

  const onReviewViewContext = useCallback((eventKey: string) => {
    if (route.level !== "session") return;
    updateActiveQuery({
      searchText: "",
      filters: createCategoryOnlyArchiveFilters(activeQuery.filters),
    }, { filters: "replace", restorePreviousSearch: false });
    setHistory((current) => updateReviewLevelState(current, route, { targetEventKey: eventKey }));
  }, [activeQuery.filters, route, updateActiveQuery]);

  const isReviewUserFiltered = useCallback((user: DanmakuUser) => (
    route.level === "session" && activeQuery.filters.userUid === user.uid
  ), [activeQuery.filters.userUid, route]);

  const onReviewSpeakEvent = useCallback((event: DanmakuEvent) => {
    // 回看菜单只调用 TTS 控制器，不进入现场事件发布/个性播报链路。
    voiceController.speakEvent(event);
  }, []);

  const onReviewSaveNickname = useCallback((user: DanmakuUser, nickname: string) => {
    const value = nickname.trim();
    if (!value) return;
    const voiceStore = useVoiceSettings.getState();
    voiceStore.setVoiceSettings({ userNicknames: upsertUserNickname(voiceStore.userNicknames, user.uid, value) });
    if (!repository) return;
    const requestId = createArchiveRequestId("nickname");
    recordArchiveDiagnostic("request", "archive-nickname", "started", {
      requestId,
      eventId: user.uid,
      data: { operation: "set" },
    });
    void repository?.setNickname(user.uid, value).then(() => {
      setOwnerEventDataRevision((revision) => revision + 1);
      recordArchiveDiagnostic("success", "archive-nickname", "completed", {
        requestId,
        eventId: user.uid,
        data: { operation: "set" },
      });
    }).catch((error) => {
      recordArchiveDiagnostic("failure", "archive-nickname", "failed", {
        requestId,
        eventId: user.uid,
        data: { operation: "set", error: error instanceof Error ? error.message : String(error) },
      });
    });
  }, [repository]);

  const onReviewDeleteNickname = useCallback((user: DanmakuUser) => {
    const voiceStore = useVoiceSettings.getState();
    voiceStore.setVoiceSettings({ userNicknames: removeUserNickname(voiceStore.userNicknames, user.uid) });
    if (!repository) return;
    const requestId = createArchiveRequestId("nickname-remove");
    recordArchiveDiagnostic("request", "archive-nickname", "started", {
      requestId,
      eventId: user.uid,
      data: { operation: "remove" },
    });
    void repository?.setNickname(user.uid, null).then(() => {
      setOwnerEventDataRevision((revision) => revision + 1);
      recordArchiveDiagnostic("success", "archive-nickname", "completed", {
        requestId,
        eventId: user.uid,
        data: { operation: "remove" },
      });
    }).catch((error) => {
      recordArchiveDiagnostic("failure", "archive-nickname", "failed", {
        requestId,
        eventId: user.uid,
        data: { operation: "remove", error: error instanceof Error ? error.message : String(error) },
      });
    });
  }, [repository]);

  const onReviewOpenUser = useCallback((user: DanmakuUser) => {
    void openUrl(`https://space.bilibili.com/${encodeURIComponent(user.uid)}`).catch(() => {});
  }, []);

  const onReviewToggleFavorite = useCallback(async (row: ArchiveProjectedEvent, favorited: boolean) => {
    const previousFavorites = useEventAnnotations.getState().favorites;
    useEventAnnotations.setState((state) => ({ favorites: bindFavoriteEvent(state.favorites, row.event, row.eventKey, favorited) }));
    const requestId = createArchiveRequestId("favorite");
    recordArchiveDiagnostic("request", "archive-favorite", "started", {
      requestId,
      eventId: row.eventKey,
      data: { active: favorited },
    });
    try {
      if (!repository) throw new Error("回看档案暂不可用，请稍后再试");
      const result = await createArchiveFavoriteActions(repository).set(row.eventKey, favorited);
      setReviewActionError(result.refresh === "failed" ? "已保存，刷新失败" : null);
      recordArchiveDiagnostic("success", "archive-favorite", "completed", {
        requestId,
        eventId: row.eventKey,
        data: { active: favorited },
      });
    } catch (error) {
      useEventAnnotations.setState((state) => ({ favorites: restoreFavoriteEvent(state.favorites, row.event, previousFavorites, row.eventKey) }));
      recordArchiveDiagnostic("failure", "archive-favorite", "failed", {
        requestId,
        eventId: row.eventKey,
        data: { active: favorited, error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }, [repository]);

  const onReviewEditFavorite = useCallback(async (row: ArchiveProjectedEvent) => {
    if (!repository) return;
    try {
      if (!isEventFavorited(useEventAnnotations.getState().favorites, row.event, row.eventKey)) {
        await onReviewToggleFavorite(row, true);
      }
      const [organization, availableTags] = await Promise.all([
        repository.getFavoriteOrganization({ sourceKind: "archive", stableId: row.eventKey }),
        repository.listFavoriteTags(),
      ]);
      if (!organization) throw new Error("收藏关系尚未写入档案");
      setFavoriteEditor({
        stableId: row.eventKey,
        title: `编辑收藏 · ${row.event.user?.uname?.trim() || "未知用户"}`,
        ...organization,
        availableTags,
      });
      setReviewActionError(null);
    } catch (error) {
      setReviewActionError(error instanceof Error ? error.message : String(error));
    }
  }, [onReviewToggleFavorite, repository]);

  const clearActiveSearch = useCallback(() => {
    updateActiveQuery({
      searchText: "",
      filters: {
        ...activeQuery.filters,
        searchText: undefined,
        keywordConditions: undefined,
      },
    }, { filters: "replace" });
  }, [activeQuery.filters, updateActiveQuery]);

  const clearActiveFilters = useCallback(() => {
    updateActiveQuery(
      { searchText: "", filters: {} },
      { filters: "replace", restorePreviousSearch: false },
    );
  }, [updateActiveQuery]);

  const toggleReviewShowBigEmote = useCallback((show: boolean) => {
    updateActiveQuery({
      searchText: "",
      filters: {
        ...activeQuery.filters,
        showBigEmote: show ? undefined : false,
      },
    }, { filters: "replace" });
  }, [activeQuery.filters, updateActiveQuery]);

  const replaceActiveFilters = useCallback((filters: ArchiveFilterState) => {
    updateActiveQuery(
      { searchText: "", filters },
      { filters: "replace", restorePreviousSearch: false },
    );
  }, [updateActiveQuery]);

  const exportReviewResult = useCallback(async (favoritesOnly: boolean) => {
    if (!repository || !transferService || route.level !== "session") return;
    setReviewExportBusy(true);
    setReviewActionError(null);
    const requestId = createArchiveRequestId(favoritesOnly ? "review-export-favorites" : "review-export-result");
    try {
      const eventKeys: string[] = [];
      let cursor: string | null = null;
      const filters = { ...activeQuery.filters, ...(favoritesOnly ? { favoriteOnly: true } : {}) };
      do {
        const page = await repository.queryEvents({
          ...(activeQuery.searchScope === "owner"
            ? { ownerId: owner?.ownerId ?? ownerIdForRoom(route.roomId) }
            : { sessionId: route.sessionId }),
          filters,
          direction: activeQuery.sortDirection,
          cursor,
          limit: 500,
        });
        eventKeys.push(...page.items.map((item) => item.eventKey));
        cursor = page.nextCursor;
      } while (cursor !== null);
      if (eventKeys.length === 0) throw new Error(favoritesOnly ? "当前结果没有收藏事件" : "当前结果没有事件");
      const path = await save({
        defaultPath: `danmu-review-${favoritesOnly ? "favorites" : "result"}-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: "回看结果 JSON", extensions: ["json"] }],
      });
      if (!path) {
        recordArchiveDiagnostic("cancel", "archive-export", "canceled", { requestId, data: { phase: "path-select", scope: "result", favoritesOnly } });
        return;
      }
      const content = await transferService.exportArchiveText({
        kind: "result",
        ...(activeQuery.searchScope === "owner"
          ? { ownerId: owner?.ownerId ?? ownerIdForRoom(route.roomId) }
          : { sessionId: route.sessionId }),
        eventKeys,
      }, { requestId });
      await invoke("write_archive_transfer", { path, contents: content });
      recordArchiveDiagnostic("success", "archive-export", "written", { requestId, count: eventKeys.length, data: { phase: "write", scope: "result", favoritesOnly } });
    } catch (reason) {
      recordArchiveDiagnostic("failure", "archive-export", "failed", { requestId, data: { phase: "result", favoritesOnly, error: reason instanceof Error ? reason.message : String(reason) } });
      setReviewActionError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setReviewExportBusy(false);
    }
  }, [activeQuery.filters, activeQuery.searchScope, activeQuery.sortDirection, owner?.ownerId, repository, route, transferService]);

  const ownerName = owner?.name ?? ownerAnchor?.uname ?? (route.level === "home" ? "" : `房间 ${route.roomId}`);
  const startCloudRecovery = async (selection: CloudRecoverySelection) => {
    if (!repository || route.level === "home") return 'binding-required' as const;
    return cloudRecoveryTask.start({
      roomId: String(route.roomId),
      ownerName,
      repository,
      selection,
      onChanged: onArchiveChanged,
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <ConnectBar />
      <div aria-label="回看快捷入口" className="flex min-h-10 shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface px-5 py-1.5">
        <span className="mr-auto ui-type-meta text-t3">快捷入口</span>
        <ReviewStyleSettings />
        <button
          type="button"
          className="h-7 rounded-md border border-line bg-bg px-2.5 ui-type-control text-t2 transition-colors enabled:hover:border-accent/50 enabled:hover:bg-raised enabled:hover:text-t1 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={currentRoomId == null}
          title={currentRoomId == null ? "当前没有连接栏主播" : "打开连接栏当前主播的档案"}
          onClick={() => { if (currentRoomId != null) openRoute({ level: "owner", roomId: currentRoomId }); }}
        >
          查看当前主播
        </button>
        <button
          type="button"
          className="h-7 rounded-md border border-line bg-bg px-2.5 ui-type-control text-t2 transition-colors enabled:hover:border-accent/50 enabled:hover:bg-raised enabled:hover:text-t1 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={currentRoomId == null || currentArchiveSessionId == null}
          title={currentArchiveSessionId == null ? "当前没有可用场次" : "打开连接栏当前场次"}
          onClick={() => {
            if (currentRoomId != null && currentArchiveSessionId != null) {
              openRoute({ level: "session", roomId: currentRoomId, sessionId: currentArchiveSessionId });
            }
          }}
        >
          查看当前场次
        </button>
      </div>
      <section
        className="flex min-h-0 flex-1 flex-col bg-bg"
        aria-label="回看"
        data-review-route={routeKey}
        data-review-search-scope={activeQuery.searchScope}
        data-review-sort-direction={activeQuery.sortDirection}
      >
      {route.level === "owner" ? (
        <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-3 border-b border-line px-5 py-2">
          <nav aria-label="档案路径" className="flex min-w-0 flex-1 basis-80 items-center gap-2">
            <button type="button" aria-label="返回所有主播档案馆" className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-line bg-surface px-2.5 ui-type-control text-t2 transition-colors hover:border-accent/50 hover:bg-raised hover:text-accent-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring" onClick={goHome}>
              <ChevronLeftIcon />
              <span>全部主播</span>
            </button>
            <span className="text-t3" aria-hidden="true">/</span>
            <h1 className="min-w-0 truncate ui-type-page-title text-t1" title={ownerName}>{ownerName}</h1>
            <span className="shrink-0 ui-type-meta text-t3">{owner?.sessionCount ?? sessions.length} 场</span>
          </nav>
          <div className="flex max-w-full flex-wrap items-center gap-2">
          <button type="button" disabled={!repository} className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-line bg-surface px-2.5 ui-type-control text-t2 transition-colors enabled:hover:border-accent/50 enabled:hover:bg-raised enabled:hover:text-accent-text disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring" onClick={() => setCloudRecoveryOpen(true)}>
            <CloudRecoveryIcon />
            <span>从云端恢复</span>
          </button>
          <button type="button" aria-pressed={showManagement} className={`inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 ui-type-control transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring ${showManagement ? "border-accent bg-accent-subtle text-accent-text" : "border-line bg-surface text-t2 hover:border-accent/50 hover:bg-raised hover:text-accent-text"}`} onClick={() => setShowManagement((current) => !current)}>
            <ArchiveManageIcon />
            <span>{showManagement ? "关闭管理" : "管理档案"}</span>
          </button>
          {repository && <button type="button" className="inline-flex h-8 shrink-0 items-center rounded-md border border-line bg-surface px-2.5 ui-type-control text-t2 transition-colors hover:border-accent/50 hover:bg-raised hover:text-accent-text" onClick={() => openDataExport()}>导出数据</button>}
          </div>
        </header>
      ) : route.level === "session" ? (
        <header className="review-session-header flex min-h-14 shrink-0 items-center border-b border-line py-3">
          <nav aria-label="档案路径" className="flex min-w-0 flex-1 items-center">
            <button type="button" aria-label="返回所有主播档案馆" className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-line bg-surface px-2.5 ui-type-control text-t2 transition-colors hover:border-accent/50 hover:bg-raised hover:text-accent-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring" onClick={goHome}>
              <ChevronLeftIcon />
              <span>全部主播</span>
            </button>
            <span className="text-t3" aria-hidden="true">/</span>
            <button type="button" aria-label="返回当前主播档案" title={ownerName} className="min-w-0 max-w-40 truncate ui-type-control text-t2 hover:text-accent-text" onClick={() => openRoute({ level: "owner", roomId: route.roomId })}>{ownerName}</button>
            <span className="text-t3" aria-hidden="true">/</span>
            <span className="min-w-0 flex-1 truncate ui-type-page-title text-t1" title={selectedSession?.title ?? route.sessionId}>{selectedSession?.title ?? route.sessionId}</span>
          </nav>
          <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
          {selectedSession && (
            <ArchiveCoverThumbnail
              url={selectedSession?.coverUrl}
              alt={(selectedSession.title ?? route.sessionId) + "封面"}
              size="session-header"
            />
          )}
          <button type="button" aria-pressed={showManagement} className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 ui-type-control transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring ${showManagement ? "border-accent bg-accent-subtle text-accent-text" : "border-line bg-surface text-t2 hover:border-accent/50 hover:bg-raised hover:text-accent-text"}`} onClick={() => setShowManagement((current) => !current)}>
            <ArchiveManageIcon />
            <span>{showManagement ? "关闭管理" : "管理档案"}</span>
          </button>
          {repository && <button type="button" className="inline-flex h-8 shrink-0 items-center rounded-md border border-line bg-surface px-2.5 ui-type-control text-t2 transition-colors hover:border-accent/50 hover:bg-raised hover:text-accent-text" onClick={() => openDataExport()}>导出数据</button>}
          </div>
        </header>
      ) : null}

      <div
        ref={scrollRef}
        className={`min-h-0 flex-1 px-5 py-4 ${route.level === "session" ? "flex flex-col overflow-hidden" : "overflow-y-auto"}`}
        onScroll={route.level === "session" ? undefined : handleScroll}
        onWheel={route.level === "session" ? handleReviewSessionWheel : route.level === "owner" && !showManagement ? handleReviewOwnerWheel : undefined}
      >
        {route.level === "home" ? (
          <div className="mx-auto flex max-w-5xl flex-col gap-4">
            <div className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1" role="tablist" aria-label="档案馆首页视图">
              <button type="button" role="tab" aria-selected={homeMode === "owners"} className={`h-8 rounded-lg px-3 ui-type-control transition-colors ${homeMode === "owners" ? "bg-accent-subtle text-accent-text" : "text-t2 hover:bg-raised hover:text-t1"}`} onClick={() => setHomeMode("owners")}>主播档案</button>
              <button type="button" role="tab" aria-selected={homeMode === "favorites"} className={`h-8 rounded-lg px-3 ui-type-control transition-colors ${homeMode === "favorites" ? "bg-accent-subtle text-accent-text" : "text-t2 hover:bg-raised hover:text-t1"}`} onClick={() => setHomeMode("favorites")}>收藏</button>
            </div>
            {homeMode === "owners" ? <>
              <UiSearchInput aria-label="搜索主播档案" placeholder="搜索主播档案" value={ownerSearchText} onValueChange={setOwnerSearchText} />
              {ownersError && <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 ui-type-control text-danger">档案暂时不可用：{ownersError}</div>}
              <ReviewOwnerList
                level="home"
                anchors={anchors}
                owners={owners}
                sessions={[]}
                owner={null}
                ownersLoading={ownersLoading}
                onOpenOwner={(roomId) => openRoute({ level: "owner", roomId })}
                onOpenSession={() => undefined}
                ownerSearchText={ownerSearchText}
                onClearSearch={() => setOwnerSearchText("")}
              />
            </> : repository ? <ReviewFavoritesPanel repository={repository} owners={owners} active={active} refreshKey={refreshKey} onOpenFavorite={openFavorite} /> : <div role="alert" className="rounded-xl border border-dashed border-line px-4 py-12 text-center ui-type-control text-t3">回看档案暂不可用，请稍后再试</div>}
          </div>
        ) : route.level === "owner" ? (
          <div className="mx-auto flex max-w-5xl flex-col gap-4">
            {showManagement && repository ? (
              <ReviewArchiveManagement
                repository={repository}
                owner={owner}
                ownerId={owner?.ownerId ?? ownerIdForRoom(route.roomId)}
                ownerUid={owner?.uid}
                sessions={sessions}
                onChanged={() => setManagementRevision((value) => value + 1)}
              />
            ) : (
              <>
                <ReviewOwnerToolbar
                  mode={ownerState.mode}
                  onModeChange={(mode) => setHistory((current) => updateReviewLevelState(current, route, { ownerState: { mode } }))}
                />
                {ownerState.mode === "sessions" ? (
                  <>
                    <ReviewOwnerSessionFilters query={ownerSessionQuery} onChange={updateOwnerSessionQuery} onClear={clearOwnerSessionQuery} collapsed={reviewFiltersCollapsed} onCollapsedChange={setReviewFiltersCollapsedManually} />
                    <OwnerSummary owner={owner} sessions={sessions} />
                    {sessionsError && <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 ui-type-control text-danger">场次暂时不可用：{sessionsError}</div>}
                    <ReviewOwnerList
                      level="owner"
                      anchors={anchors}
                      owners={owners}
                      sessions={sessions}
                      owner={owner}
                      ownersLoading={ownersLoading}
                      sessionsLoading={sessionsLoading}
                      sessionsLoadingMore={sessionsLoadingMore}
                      hasMoreSessions={sessionsHasMore}
                      onLoadMoreSessions={() => { void loadMoreOwnerSessions(); }}
                      onOpenOwner={(roomId) => openRoute({ level: "owner", roomId })}
                      onOpenSession={(roomId, sessionId) => openRoute({ level: "session", roomId, sessionId })}
                      selectedSessionIds={selectedSessionIds}
                      onToggleSession={toggleSessionSelection}
                      onToggleAllSessions={toggleAllSessionSelection}
                      onExportSelected={() => openDataExport("selected-sessions")}
                      onDeleteSelected={() => { void previewSelectedSessions(); }}
                      onClearSelection={clearBatchSelection}
                    />
                  </>
                ) : (
                  <>
                    <ReviewOwnerEventFilters
                      query={ownerEventQuery}
                      onChange={updateOwnerEventQuery}
                      onReplaceFilters={replaceOwnerEventFilters}
                      onClear={clearOwnerEventFilters}
                      collapsed={reviewFiltersCollapsed}
                      onCollapsedChange={setReviewFiltersCollapsedManually}
                    />
                    <ReviewOwnerEventResultsToolbar
                      sort={ownerEventQuery.sort}
                      direction={ownerEventQuery.direction}
                      showBigEmote={ownerEventQuery.filters.showBigEmote !== false}
                      onChangeSort={(sort) => updateOwnerEventQuery({ sort })}
                      onChangeDirection={(direction) => updateOwnerEventQuery({ direction })}
                      onChangeShowBigEmote={(show) => replaceOwnerEventFilters({ ...ownerEventQuery.filters, showBigEmote: show ? undefined : false })}
                    />
                    <ReviewOwnerEventResults
                      page={displayedOwnerEventPage}
                      loading={ownerEventSearchLoading}
                      error={ownerEventSearchError}
                      hasConditions={ownerEventHasConditions}
                      onOpenMatch={openOwnerEventMatch}
                      onLoadMore={() => { void loadMoreOwnerEventResults(); }}
                      onClear={clearOwnerEventFilters}
                      onRetry={() => setOwnerEventDataRevision(value => value + 1)}
                    />
                  </>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-4">
            {showManagement && repository ? (
              <ReviewArchiveManagement
                repository={repository}
                owner={owner}
                ownerId={owner?.ownerId ?? ownerIdForRoom(route.roomId)}
                ownerUid={owner?.uid}
                sessions={selectedSession ? [selectedSession] : []}
                sessionOnly
                focusedSessionId={route.sessionId}
                onExportResult={(favoritesOnly) => { void exportReviewResult(favoritesOnly); }}
                resultExportBusy={reviewExportBusy}
                onChanged={() => {
                  setManagementRevision((value) => value + 1);
                  goBack();
                }}
              />
            ) : (
              <>
                <ReviewSearchControls level="session" query={activeQuery} onChange={updateActiveQuery} onReplaceFilters={replaceActiveFilters} onClearSearch={clearActiveSearch} onClearFilters={clearActiveFilters} collapsed={reviewFiltersCollapsed} onCollapsedChange={setReviewFiltersCollapsedManually} activeUserFilter={activeReviewUserFilter} onClearUserFilter={onClearReviewUserFilter} />
                {repository ? (
                  <ReviewSessionTimeline
                    repository={repository}
                    readingMemory={readingMemory}
                    sessionId={route.sessionId}
                    ownerId={activeQuery.searchScope === "owner" ? owner?.ownerId ?? ownerIdForRoom(route.roomId) : undefined}
                    searchScope={activeQuery.searchScope}
                    targetEventKey={activeLevelState.targetEventKey}
                    onTargetEventConsumed={consumeTargetEvent}
                    active={active}
                    filters={activeQuery.filters}
                    direction={activeQuery.sortDirection}
                    refreshKey={refreshKey}
                    displayPreferences={eventDisplayPreferences}
                    session={selectedSession ?? undefined}
                    onUserFilter={onReviewUserFilter}
                    isUserFiltered={isReviewUserFiltered}
                    onClearUserFilter={onClearReviewUserFilter}
                    onViewContext={activeTimelineHasConditions ? onReviewViewContext : undefined}
                    onSpeakEvent={onReviewSpeakEvent}
                    onSaveNickname={onReviewSaveNickname}
                    onDeleteNickname={onReviewDeleteNickname}
                    onOpenUser={onReviewOpenUser}
                    onToggleFavorite={onReviewToggleFavorite}
                    onEditFavorite={onReviewEditFavorite}
                    favoriteEditOnAdd={favoriteEditOnAdd}
                    archiveWriterStatus={archiveWriterStatus.failedSessionIds.includes(route.sessionId)
                      ? "failed"
                      : archiveWriterStatus.pendingSessionIds.includes(route.sessionId) ? "pending" : undefined}
                    onChangeSortDirection={(direction) => updateActiveQuery({ sortDirection: direction }, { restorePreviousSearch: false })}
                    onToggleShowBigEmote={toggleReviewShowBigEmote}
                    onScrollIntent={handleReviewTimelineScrollIntent}
                  />
                ) : (
                  <div role="alert" className="rounded-xl border border-dashed border-line px-4 py-12 text-center ui-type-control text-t3">回看档案暂不可用，请稍后再试</div>
                )}
              </>
            )}
          </div>
        )}
      </div>
      </section>
      {batchDeleteConfirmOpen && batchDeletePreview && (
        <ConfirmDialog
          title="确认删除所选场次"
          description={`将删除 ${batchDeletePreview.sessionCount} 场、${batchDeletePreview.eventCount} 个事件和 ${batchDeletePreview.favoriteCount} 个收藏。${batchDeletePreview.blockedSessionCount > 0 ? `另有 ${batchDeletePreview.blockedSessionCount} 场正在进行，不会删除。` : ""}删除后无法恢复。`}
          confirmLabel={batchDeleteBusy ? "删除中…" : "确认删除"}
          confirmTone="danger"
          errorMessage="批量删除失败，请重新预览后重试。"
          cancelAriaLabel="取消批量删除"
          onCancel={cancelBatchDelete}
          onConfirm={confirmBatchDelete}
        />
      )}
      {favoriteEditor && repository && (
        <FavoriteOrganizationEditor
          title={favoriteEditor.title}
          initialNote={favoriteEditor.note}
          initialTags={favoriteEditor.tags}
          tags={favoriteEditor.availableTags}
          onCreateTag={(name) => repository.createFavoriteTag(name)}
          onSave={async (note, tags) => {
            await repository.updateFavoriteOrganization({
              target: { sourceKind: "archive", stableId: favoriteEditor.stableId },
              note,
              tags,
            });
            setFavoriteEditor(null);
            setOwnerEventDataRevision((revision) => revision + 1);
          }}
          onCancel={() => setFavoriteEditor(null)}
        />
      )}
      {dataExportOpen && repository && dataExportScopeOptions.length > 0 && (
        <ReviewDataExportDialog
          repository={repository}
          scopeOptions={dataExportScopeOptions}
          defaultScopeId={dataExportDefaultScopeId || dataExportScopeOptions[0].id}
          ownerName={ownerName}
          sessionStartedAt={selectedSession?.startedAt}
          onClose={() => setDataExportOpen(false)}
        />
      )}
      {cloudRecoveryOpen && repository && route.level !== "home" && (
        <CloudRecoveryDialog
          roomId={String(route.roomId)}
          ownerName={ownerName}
          onClose={() => setCloudRecoveryOpen(false)}
          onOpenSettings={() => {
            setCloudRecoveryOpen(false);
            onOpenCloudRecoverySettings();
          }}
          onStart={startCloudRecovery}
        />
      )}
      {reviewActionError && <div role="alert" className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md border border-danger/40 bg-surface px-3 py-2 ui-type-control text-danger shadow-lg">操作失败：{reviewActionError}</div>}
    </div>
  );
}
