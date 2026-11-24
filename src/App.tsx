/**
 * 主窗口（ui-design §四布局骨架）：
 * 侧边栏 + [连接条 / 事件列表（或空态） / 状态栏]；未登录时整区为扫码登录页
 */
import { invoke } from "@tauri-apps/api/core";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { readCurrentMonitorWorkArea } from './windows/windowMonitor';
import { createDefaultWindowPair, toPhysicalWindowPlacement } from './windows/eventWindowLayout';
import { disable,enable } from "@tauri-apps/plugin-autostart";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback,useEffect,useMemo,useRef,useState,type Dispatch,type SetStateAction } from "react";
import "./App.css";
import { REVIEW_PRICE_GRADIENT_CSS } from "./reviewStyleSettings.ts";
import { createArchiveFavoriteActions,flushArchiveWriter,notifyArchiveRevision,useArchiveRuntime } from "./archive/archiveRuntime.ts";
import { bindFavoriteEvent, restoreFavoriteEvent, setFavoriteEvent } from "./eventAnnotations.ts";
import type { ArchiveFavoriteTag,ArchiveRepositoryContract } from "./archive/archiveTypes.ts";
import { useArchiveInitialization } from "./archive/useArchiveInitialization.ts";
import { ConnectBar } from "./components/ConnectBar";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { EmptyState } from "./components/EmptyState";
import type { EventMenuHandlers } from "./components/EventContextMenu";
import { EventPane } from "./components/EventPane";
import { formatGiftSummary,summarizeGiftEvents } from "./components/eventSummary";
import { FavoriteOrganizationEditor } from "./components/FavoriteOrganizationEditor";
import { LiveFilterBar } from "./components/LiveFilterBar";
import { LoginScreen } from "./components/LoginCard";
import type { MainView } from "./components/mainView";
import { PartitionColumn } from "./components/PartitionColumn";
import { PersonalBroadcastPanel } from "./components/PersonalBroadcastPanel";
import { ReviewPanel } from "./components/ReviewPanel";
import { RightWorkbench } from "./components/RightWorkbench";
import { loadWorkbenchWindowState } from "./components/rightWorkbenchWindow";
import { clampBoundary,getPartitionColumns,type SceneLayoutMode,type SceneRegionId } from "./components/sceneLayout";
import { loadSceneSettings,saveSceneSettings,type SceneSettings } from "./components/sceneSettings";
import type { SettingsAnchorId,SettingsOpenRequest } from "./components/settingsNavigation";
import { CloudRecoveryProgress } from "./components/CloudRecoveryProgress";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { StylePanel } from "./components/StylePanel";
import type { NativePreviewGeometry } from "./components/nativePreviewGeometry";
import { getLatestUrgentSystemEvent } from "./components/systemReminder";
import { TitleBar } from "./components/TitleBar";
import { UrgentSystemNotice } from "./components/UrgentSystemNotice";
import { VoicePanel } from "./components/VoicePanel";
import { collectApplicationDiagnosticSnapshot } from "./diagnostics/applicationSnapshot.ts";
import { createDiagnosticBridge,type DiagnosticStatusSnapshot } from "./diagnostics/diagnosticBridge";
import { flushWindowDiagnosticLogs } from "./diagnostics/windowDiagnosticBridge.ts";
import type { DiagnosticContext } from "./diagnostics/diagnosticLogger";
import {
flushAllDiagnosticLogs,
getDiagnosticConnectionId,
getDiagnosticContext,
getDiagnosticHealthSnapshot
} from "./diagnostics/diagnosticLogger";
import type { DiagnosticFlushResult,IssueMarker } from "./diagnostics/diagnosticTypes";
import {
collectFeatureActivity,
collectFeatureManifest,
collectFeatureSettingHistory,
collectFeatureSnapshots,
getChangedSettingPaths,
recordFeatureDiagnostic,
recordFeatureSettingChange,
} from "./diagnostics/featureDiagnostics";
import { createIssueMarker } from "./diagnostics/issueMarkers";
import { IssueMarkerLogger } from "./diagnostics/markerLogger";
import {
getArchiveEventKey,
getEventBookmarkKey,
getEventMarkKey,
getRegionMark,
isEventFavorited,
useEventAnnotations
} from "./eventAnnotations";
import {
updateEventProjection,
type EventFilterState,
type EventProjection,
type EventQuery,
type Pane,
} from "./events/eventView";
import { createFeedScrollSession,type FeedScrollSession } from "./events/feedScroll";
import { useGeneralSettings } from "./generalSettings";
import type { GiftThresholdMode } from "./giftThreshold";
import type { AudienceFilterSettings } from "./events/audienceFilters.ts";
import { RoomInsightsProvider } from "./hooks/useRoomInsights";
import { getMostRecentAnchor } from "./protocol/anchors";
import { getEventEffect } from "./protocol/giftEffects";
import type { RankUser } from "./protocol/roomInsights";
import type { DanmakuEvent,DanmakuUser } from "./protocol/types";
import { diagnosticErrorMessage,readDiagnosticSessionMarker,useApplicationLifecycle } from "./runtime/useApplicationLifecycle.ts";
import { useConnection } from "./stores/connection";
import { useSession } from "./stores/session";
import { initTheme } from "./theme";
import { reconcileNativeThemeTarget, subscribeNativeThemeTarget } from "./themes/nativeThemeRuntime.ts";
import { createBuiltinNativeTheme } from "./themes/nativeBuiltinThemes.ts";
import { setLiveNativeThemeProjection, useNativeThemeRuntimeState } from "./themes/nativeThemeRuntimeState.ts";
import { resolveLiveNativeThemePresentation } from "./themes/nativeThemeTargetPresentation.ts";
import { removeUserNickname,upsertUserNickname } from "./userNicknames";
import { setVoiceGiftThreshold } from "./voice/giftThresholdRuntime";
import { shutdownVoiceRuntime,voiceController } from "./voice/voiceRuntime.ts";
import { useVoiceSettings } from "./voice/voiceSettings";
import {
closeDisplayWindow,
isDisplayWindowOpen,
openDisplayWindow,
resetDisplayWindowGeometry,
locateDisplayWindow,
toggleDisplayWindowLock
} from "./windows/displayBridge";
import { GIFT_EFFECT_MANUAL_EVENT } from "./windows/eventWindowChannels";
import {
closeGiftWindow,
isGiftWindowOpen,
openGiftWindow,
publishGiftEffectEvent,
resetGiftWindowGeometry,
locateGiftWindows,
getRevenueWindowDiagnostics,
RevenueWindowOperationError,
setRevenueWindowMode,
toggleRevenueChild,
toggleGiftWindowLock
} from "./windows/giftBridge";
import type { GiftEffectNotice } from "./windows/giftEffectBus";
import { emitGiftEffect,subscribeGiftEffect } from "./windows/giftEffectBus";
import { useAuxiliaryWindows } from "./windows/useAuxiliaryWindows.ts";
import { useCompatibleEventRender } from "./compat/CompatibleEventRenderer.tsx";



function useEventProjection(
  events: ReturnType<typeof useConnection.getState>["events"],
  pane: Pane,
  filters: EventFilterState,
  giftThreshold: number,
  roomId: number | null | undefined,
  query: EventQuery,
  giftThresholdMode: GiftThresholdMode,
  onlyGuardEntry: boolean,
  showAutoDanmaku: boolean,
  showPhoneNotVerified: boolean,
  audienceFilters: AudienceFilterSettings,
): EventProjection {
  const previousRef = useRef<EventProjection | null>(null);
  const projection = updateEventProjection(previousRef.current, events, pane, filters, giftThreshold, roomId, query, giftThresholdMode, onlyGuardEntry, showAutoDanmaku, showPhoneNotVerified, audienceFilters);
  useEffect(() => {
    previousRef.current = projection;
  }, [projection]);
  return projection;
}

function resolveState<T>(value: SetStateAction<T>, current: T): T {
  return typeof value === "function" ? (value as (previous: T) => T)(current) : value;
}



function MainArea({
  sceneSettings,
  setSceneSettings,
  onSaveNickname,
  onDeleteNickname,
  archiveRepository,
}: {
  sceneSettings: SceneSettings;
  setSceneSettings: Dispatch<SetStateAction<SceneSettings>>;
  onSaveNickname?: (user: DanmakuUser, nickname: string) => void;
  onDeleteNickname?: (user: DanmakuUser) => void;
  archiveRepository?: ArchiveRepositoryContract | null;
}) {
  const events = useConnection((s) => s.events);
  const status = useConnection((s) => s.state.status);
  const roomId = useConnection((s) => s.state.roomId);
  const roomGuardProfile = useConnection((s) => s.state.roomGuardProfile);
  const compatibleEventRender = useCompatibleEventRender({ target: "live", targetId: "live", roomId: roomId ?? null, placement: "main" });
  const archiveSessionId = useConnection((s) => roomId == null ? null : s.sessions[String(roomId)]?.archive?.sessionId ?? null);
  const defaultEventFontSize = useGeneralSettings((state) => state.eventFontSize);
  const defaultEventDisplayPreferences = useGeneralSettings((state) => state.eventDisplayPreferences);
  const favoriteEditOnAdd = useGeneralSettings((state) => state.favoriteEditOnAdd);
  const liveScrollDirection = useGeneralSettings((state) => state.liveScrollDirection);
  const liveContentAlignment = useGeneralSettings((state) => state.liveContentAlignment);
  const defaultEventStyleSettings = useGeneralSettings((state) => state.eventStyleSettings);
  const liveThemeProjection = useNativeThemeRuntimeState((state) => state.live);
  const {
    eventFontSize,
    displayPreferences: eventDisplayPreferences,
    eventStyleSettings,
    displayScale,
  } = useMemo(() => resolveLiveNativeThemePresentation({
    eventFontSize: defaultEventFontSize,
    displayPreferences: defaultEventDisplayPreferences,
    eventStyleSettings: defaultEventStyleSettings,
  }, liveThemeProjection), [defaultEventFontSize, defaultEventDisplayPreferences, defaultEventStyleSettings, liveThemeProjection]);
  const showLiveGiftEffect = useGeneralSettings((state) => state.showLiveGiftEffect);
  const showLiveGuardEffect = useGeneralSettings((state) => state.showLiveGuardEffect);
  const favorites = useEventAnnotations((state) => state.favorites);
  const regionMarks = useEventAnnotations((state) => state.regionMarks);
  const markRegionEvent = useEventAnnotations((state) => state.markRegionEvent);
  const clearRegionMark = useEventAnnotations((state) => state.clearRegionMark);
  const [giftEffectNotices, setGiftEffectNotices] = useState<GiftEffectNotice[]>([]);
  const { filters, giftThreshold, giftThresholdMode, audienceFilters, layoutMode, leftRatio, leftBoundaries, rightBoundaries } = sceneSettings;
  const setFilters: Dispatch<SetStateAction<EventFilterState>> = (value) => {
    setSceneSettings((current) => ({ ...current, filters: resolveState(value, current.filters) }));
  };
  const setGiftThreshold: Dispatch<SetStateAction<number>> = (value) => {
    setSceneSettings((current) => ({ ...current, giftThreshold: resolveState(value, current.giftThreshold) }));
  };
  const setLayoutMode: Dispatch<SetStateAction<SceneLayoutMode>> = (value) => {
    setSceneSettings((current) => ({ ...current, layoutMode: resolveState(value, current.layoutMode) }));
  };
  const setLeftRatio: Dispatch<SetStateAction<number>> = (value) => {
    setSceneSettings((current) => ({ ...current, leftRatio: resolveState(value, current.leftRatio) }));
  };
  const setLeftBoundaries: Dispatch<SetStateAction<number[]>> = (value) => {
    setSceneSettings((current) => ({ ...current, leftBoundaries: resolveState(value, current.leftBoundaries) }));
  };
  const setRightBoundaries: Dispatch<SetStateAction<number[]>> = (value) => {
    setSceneSettings((current) => ({ ...current, rightBoundaries: resolveState(value, current.rightBoundaries) }));
  };
  const [query, setQuery] = useState<EventQuery>({});
  const [contextTarget, setContextTarget] = useState<{ regionKey: string; eventKey: string } | null>(null);
  const splitRef = useRef<HTMLDivElement>(null);
  const eventAreaRef = useRef<HTMLElement>(null);
  const [dismissedUrgentId, setDismissedUrgentId] = useState<string | null>(null);
  const [favoriteFailureKey, setFavoriteFailureKey] = useState<string | null>(null);
  const [favoriteFailureMessage, setFavoriteFailureMessage] = useState("收藏同步失败，请重试");
  const [favoriteEditor, setFavoriteEditor] = useState<{
    event: DanmakuEvent;
    stableId: string;
    note: string;
    tags: string[];
    availableTags: ArchiveFavoriteTag[];
  } | null>(null);
  const favoriteOperationRef = useRef(new Map<string, number>());
  const feedSessionsRef = useRef(new Map<string, FeedScrollSession>());

  useEffect(() => subscribeGiftEffect((notice) => {
    setGiftEffectNotices((current) => [...current, notice].slice(-64));
  }), []);
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void listen<GiftEffectNotice>(GIFT_EFFECT_MANUAL_EVENT, (event) => {
      if (!cancelled) setGiftEffectNotices((current) => [...current, event.payload].slice(-64));
    }).then((stop) => {
      if (cancelled) stop();
      else unlisten = stop;
    }).catch(() => {});
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
  useEffect(() => {
    setGiftEffectNotices([]);
  }, [roomId]);

  const getFeedSession = useCallback((scope: string, visibleCount: number) => {
    const feedKey = `${roomId ?? "none"}|${scope}`;
    let feedSession = feedSessionsRef.current.get(feedKey);
    if (!feedSession) {
      feedSession = createFeedScrollSession(visibleCount);
      feedSessionsRef.current.set(feedKey, feedSession);
    }
    return { feedKey, feedSession };
  }, [roomId]);

  const leftProjection = useEventProjection(events, "left", filters, 0, roomId, query, giftThresholdMode, eventDisplayPreferences.onlyGuardEntry, eventDisplayPreferences.showAutoDanmaku, eventDisplayPreferences.showPhoneNotVerified, audienceFilters);
  const rightProjection = useEventProjection(events, "right", filters, giftThreshold, roomId, query, giftThresholdMode, eventDisplayPreferences.onlyGuardEntry, eventDisplayPreferences.showAutoDanmaku, eventDisplayPreferences.showPhoneNotVerified, audienceFilters);
  const danmuProjection = useEventProjection(events, "danmu", filters, 0, roomId, query, giftThresholdMode, eventDisplayPreferences.onlyGuardEntry, eventDisplayPreferences.showAutoDanmaku, eventDisplayPreferences.showPhoneNotVerified, audienceFilters);
  const interactProjection = useEventProjection(events, "interact", filters, 0, roomId, query, giftThresholdMode, eventDisplayPreferences.onlyGuardEntry, eventDisplayPreferences.showAutoDanmaku, eventDisplayPreferences.showPhoneNotVerified, audienceFilters);
  const giftProjection = useEventProjection(events, "gift", filters, giftThreshold, roomId, query, giftThresholdMode, eventDisplayPreferences.onlyGuardEntry, eventDisplayPreferences.showAutoDanmaku, eventDisplayPreferences.showPhoneNotVerified, audienceFilters);
  const superChatProjection = useEventProjection(events, "superChat", filters, giftThreshold, roomId, query, giftThresholdMode, eventDisplayPreferences.onlyGuardEntry, eventDisplayPreferences.showAutoDanmaku, eventDisplayPreferences.showPhoneNotVerified, audienceFilters);
  const guardProjection = useEventProjection(events, "guard", filters, giftThreshold, roomId, query, giftThresholdMode, eventDisplayPreferences.onlyGuardEntry, eventDisplayPreferences.showAutoDanmaku, eventDisplayPreferences.showPhoneNotVerified, audienceFilters);
  const projectionDiagnosticKeysRef = useRef(new Map<string, string>());

  useEffect(() => {
    const context = getDiagnosticContext();
    const projections: Array<[string, EventProjection]> = [
      ["left", leftProjection],
      ["right", rightProjection],
      ["danmu", danmuProjection],
      ["interact", interactProjection],
      ["gift", giftProjection],
      ["superChat", superChatProjection],
      ["guard", guardProjection],
    ];
    for (const [pane, projection] of projections) {
      const key = `${projection.scopeKey}|${projection.sourceLength === 0 ? "empty" : "populated"}`;
      if (projectionDiagnosticKeysRef.current.get(pane) === key) continue;
      projectionDiagnosticKeysRef.current.set(pane, key);
      const filteredEntries = Object.entries(projection.filteredByReason);
      if (filteredEntries.length === 0) continue;
      context.record({
        level: "debug",
        subsystem: "event",
        action: "filter",
        outcome: "filtered",
        roomId: roomId ?? undefined,
        data: {
          pane,
          sourceLength: projection.sourceLength,
          visibleCount: projection.indices.length,
          ...Object.fromEntries(filteredEntries.map(([reason, count]) => [`filtered_${reason}`, count])),
        },
      });
    }
  }, [danmuProjection, giftProjection, guardProjection, interactProjection, leftProjection, rightProjection, roomId, superChatProjection]);

  useEffect(() => {
    setQuery({});
    setContextTarget(null);
  }, [roomId]);

  const onUserFilter = useCallback((user: DanmakuUser) => {
    setQuery((current) => ({ ...current, userId: user.uid, userName: user.uname }));
  }, []);
  const onRankUserFilter = useCallback((user: Pick<RankUser, "uid" | "name">) => {
    setQuery((current) => ({ ...current, userId: user.uid, userName: user.name }));
  }, []);
  const isUserFiltered = useCallback((user: DanmakuUser) => query.userId === user.uid, [query.userId]);
  const onClearUserFilter = useCallback(() => {
    setQuery((current) => {
      const { userId: _userId, userName: _userName, ...rest } = current;
      return rest;
    });
  }, []);
  const onViewContext = useCallback((event: import("./protocol/types").DanmakuEvent, regionKey: string) => {
    setContextTarget({ regionKey, eventKey: event.reactKey ?? event.id });
    setQuery({});
  }, []);
  const onContextTargetConsumed = useCallback((regionKey: string, eventKey: string) => {
    setContextTarget((current) => current?.regionKey === regionKey && current.eventKey === eventKey ? null : current);
  }, []);

  const onSpeakEvent = useCallback((event: import("./protocol/types").DanmakuEvent) => {
    voiceController.speakEvent(event);
  }, []);
  const resolveGiftEffect = useCallback((event: import("./protocol/types").DanmakuEvent) => {
    return getEventEffect(event);
  }, []);
  const onPlayGiftEffect = useCallback((event: import("./protocol/types").DanmakuEvent) => {
    const resource = resolveGiftEffect(event);
    if (!resource) return;
    const notice: GiftEffectNotice = { event, resource, manual: true };
    emitGiftEffect(notice);
    publishGiftEffectEvent(notice);
  }, [resolveGiftEffect]);
  const onOpenUser = useCallback((user: DanmakuUser) => {
    void openUrl(`https://space.bilibili.com/${encodeURIComponent(user.uid)}`).catch(() => {});
  }, []);
  const onToggleMark = useCallback((regionKey: string, event: import("./protocol/types").DanmakuEvent) => {
    const marked = getRegionMark(regionMarks, regionKey) === getEventMarkKey(event);
    if (marked) clearRegionMark(regionKey);
    else markRegionEvent(regionKey, event);
    recordFeatureDiagnostic({
      featureId: "event-interaction",
      stage: "success",
      action: "toggle-mark",
      outcome: marked ? "cleared" : "marked",
      eventId: event.reactKey ?? event.id,
      data: { active: !marked },
    });
  }, [clearRegionMark, markRegionEvent, regionMarks]);
  const onToggleFavorite = useCallback(async (event: import("./protocol/types").DanmakuEvent) => {
    const previousFavorites = useEventAnnotations.getState().favorites;
    const localKey = getEventBookmarkKey(event);
    const operationKey = archiveSessionId ? getArchiveEventKey(event, archiveSessionId) : localKey;
    const favorited = isEventFavorited(previousFavorites, event, archiveSessionId ? operationKey : undefined);
    const nextFavorited = !favorited;
    const operationId = (favoriteOperationRef.current.get(operationKey) ?? 0) + 1;
    favoriteOperationRef.current.set(operationKey, operationId);
    useEventAnnotations.setState((state) => ({ favorites: archiveSessionId
      ? bindFavoriteEvent(state.favorites, event, operationKey, nextFavorited)
      : setFavoriteEvent(state.favorites, event, nextFavorited, Date.now()) }));
    setFavoriteFailureKey(null);
    try {
      if (!archiveRepository || !archiveSessionId) throw new Error("回看场次暂不可用，请稍后再试");
      const archiveFlush = await flushArchiveWriter();
      if (archiveFlush.pending > 0 || archiveFlush.failed > 0) {
        throw new Error("档案事件尚未写入，无法同步收藏");
      }
      const result = await createArchiveFavoriteActions(archiveRepository).set(getArchiveEventKey(event, archiveSessionId), nextFavorited);
      if (favoriteOperationRef.current.get(operationKey) === operationId) {
        favoriteOperationRef.current.delete(operationKey);
        setFavoriteFailureMessage("已保存，刷新失败");
        setFavoriteFailureKey(result.refresh === "failed" ? localKey : null);
      }
      recordFeatureDiagnostic({
        featureId: "event-interaction",
        stage: "success",
        action: "toggle-favorite",
        outcome: nextFavorited ? "favorited" : "cleared",
        eventId: event.reactKey ?? event.id,
        data: { active: nextFavorited },
      });
    } catch (error) {
      if (favoriteOperationRef.current.get(operationKey) === operationId) {
        favoriteOperationRef.current.delete(operationKey);
        useEventAnnotations.setState((state) => ({ favorites: restoreFavoriteEvent(state.favorites, event, previousFavorites, operationKey) }));
        setFavoriteFailureMessage("收藏同步失败，请重试");
        setFavoriteFailureKey(localKey);
      }
      recordFeatureDiagnostic({
        featureId: "event-interaction",
        stage: "failure",
        action: "toggle-favorite",
        outcome: "repository-write-failed",
        eventId: event.reactKey ?? event.id,
        data: { active: nextFavorited, error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }, [archiveRepository, archiveSessionId]);
  const onEditFavorite = useCallback(async (event: DanmakuEvent) => {
    if (!archiveRepository || !archiveSessionId) return;
    const stableId = getArchiveEventKey(event, archiveSessionId);
    try {
      if (!isEventFavorited(useEventAnnotations.getState().favorites, event, stableId)) {
        await onToggleFavorite(event);
      }
      const [organization, availableTags] = await Promise.all([
        archiveRepository.getFavoriteOrganization({ sourceKind: "archive", stableId }),
        archiveRepository.listFavoriteTags(),
      ]);
      if (!organization) throw new Error("收藏关系尚未写入档案");
      setFavoriteEditor({ event, stableId, ...organization, availableTags });
      setFavoriteFailureKey(null);
    } catch (error) {
      setFavoriteFailureKey(getEventBookmarkKey(event));
      recordFeatureDiagnostic({
        featureId: "event-interaction",
        stage: "failure",
        action: "edit-favorite",
        outcome: "repository-read-failed",
        eventId: event.reactKey ?? event.id,
        data: { error: error instanceof Error ? error.message : String(error) },
      });
    }
  }, [archiveRepository, archiveSessionId, onToggleFavorite]);
  const queryActive = Boolean(query.userId || query.userName || query.text?.trim());
  const eventMenuHandlers = useMemo<Omit<EventMenuHandlers, "regionKey">>(() => ({
    onSpeakEvent,
    onUserFilter,
    isUserFiltered,
    onClearUserFilter,
    onViewContext: queryActive ? onViewContext : undefined,
    contextTargetRegionKey: contextTarget?.regionKey,
    contextTargetKey: contextTarget?.eventKey,
    onContextTargetConsumed,
    onSaveNickname,
    onDeleteNickname,
    onOpenUser,
    isFavorite: (event) => isEventFavorited(favorites, event, archiveSessionId ? getArchiveEventKey(event, archiveSessionId) : undefined),
    onToggleFavorite,
    onEditFavorite,
    favoriteEditOnAdd,
    getFavoriteError: (event) => favoriteFailureKey === getEventBookmarkKey(event) ? favoriteFailureMessage : null,
    isMarked: (regionKey, event) => getRegionMark(regionMarks, regionKey) === getEventMarkKey(event),
    onToggleMark,
  }), [onSpeakEvent, onUserFilter, isUserFiltered, onClearUserFilter, queryActive, onViewContext,
    contextTarget, onContextTargetConsumed, onSaveNickname, onDeleteNickname, onOpenUser, favorites,
    archiveSessionId, onToggleFavorite, onEditFavorite, favoriteEditOnAdd, favoriteFailureKey,
    favoriteFailureMessage, regionMarks, onToggleMark]);

  const showEmpty = status === "idle";
  const activeRegions: SceneRegionId[] = [];
  if (filters.left.danmu) activeRegions.push("danmu");
  if (filters.left.interact) activeRegions.push("interact");
  if (filters.right.gift) activeRegions.push("gift");
  if (filters.right.superChat) activeRegions.push("superChat");
  if (filters.right.guard) activeRegions.push("guard");
  const partitionColumns = getPartitionColumns(activeRegions);
  const projections = {
    danmu: danmuProjection,
    interact: interactProjection,
    gift: giftProjection,
    superChat: superChatProjection,
    guard: guardProjection,
  };
  const latestUrgent = getLatestUrgentSystemEvent(events);
  const visibleUrgent = latestUrgent && latestUrgent.id !== dismissedUrgentId ? latestUrgent : null;

  const updateSplit = (clientX: number) => {
    const rect = splitRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    // 预留两侧最低可读宽度；比例限制只防止拖到不可用，不改变两区常驻设计。
    const ratio = (clientX - rect.left) / rect.width;
    setLeftRatio(Math.min(0.72, Math.max(0.28, ratio)));
  };

  const nudgeSplit = (delta: number) => {
    setLeftRatio((ratio) => Math.min(0.72, Math.max(0.28, ratio + delta)));
  };

  const updateBoundary = (
    setter: import("react").Dispatch<import("react").SetStateAction<number[]>>,
    index: number,
    value: number,
  ) => {
    setter((current) => {
      const next = [...current];
      const previous = next[index - 1] ?? 0;
      const following = next[index + 1] ?? 1;
      next[index] = clampBoundary(value, 0.18, previous, following);
      return next;
    });
  };

  return (
    <>
      <ConnectBar onUserFilter={onRankUserFilter} />
      {!showEmpty && (
        <LiveFilterBar
          filters={filters}
          setFilters={setFilters}
          giftThreshold={giftThreshold}
          giftThresholdMode={giftThresholdMode}
          setGiftThreshold={setGiftThreshold}
          query={query}
          onSearchTextChange={(text) => setQuery((current) => ({ ...current, text }))}
          layoutMode={layoutMode}
          onLayoutChange={setLayoutMode}
          onClearQuery={() => setQuery({})}
        />
      )}
      {!showEmpty && <UrgentSystemNotice event={visibleUrgent} onDismiss={() => setDismissedUrgentId(visibleUrgent?.id ?? null)} />}
      <main ref={eventAreaRef} className="relative min-h-0 flex-1 bg-bg">
        <div className="absolute inset-0 min-h-0">
        {showEmpty ? (
          <EmptyState />
        ) : layoutMode === "partition" ? (
          <div
            ref={splitRef}
            className="absolute inset-0 grid min-w-0"
            style={{ gridTemplateColumns: partitionColumns.left.length && partitionColumns.right.length ? `minmax(0, ${leftRatio}fr) 4px minmax(0, ${1 - leftRatio}fr)` : "minmax(0, 1fr)" }}
          >
            <PartitionColumn
              regions={partitionColumns.left}
              queryActive={queryActive}
              roomGuardProfile={roomGuardProfile}
              events={events}
              projections={projections}
              boundaries={leftBoundaries}
              onBoundaryChange={(index, value) => updateBoundary(setLeftBoundaries, index, value)}
              sideLabel="弹幕与互动分区"
              getFeedSession={getFeedSession}
              liveLayout
              eventAreaRef={eventAreaRef}
              onUserFilter={onUserFilter}
              eventMenuHandlers={eventMenuHandlers}
              displayPreferences={eventDisplayPreferences}
              eventStyleSettings={eventStyleSettings}
              eventFontSize={eventFontSize}
              displayScale={displayScale}
              scrollDirection={liveScrollDirection}
              contentAlignment={liveContentAlignment}
              enableBilibiliVideoLinks
              compatibleEventRender={compatibleEventRender}
            />
            {partitionColumns.left.length > 0 && partitionColumns.right.length > 0 && (
            <div
              role="separator"
              aria-label="调整左右区域宽度"
              aria-orientation="vertical"
              aria-valuemin={28}
              aria-valuemax={72}
              aria-valuenow={Math.round(leftRatio * 100)}
              tabIndex={0}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                updateSplit(event.clientX);
              }}
              onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) updateSplit(event.clientX);
              }}
              onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  nudgeSplit(-0.02);
                } else if (event.key === "ArrowRight") {
                  event.preventDefault();
                  nudgeSplit(0.02);
                } else if (event.key === "Home") {
                  event.preventDefault();
                  setLeftRatio(0.28);
                } else if (event.key === "End") {
                  event.preventDefault();
                  setLeftRatio(0.72);
                }
              }}
              className="cursor-col-resize bg-line/40 transition-colors hover:bg-accent/60 focus-visible:bg-accent focus-visible:outline-none"
            />
            )}
            <PartitionColumn
              regions={partitionColumns.right}
              queryActive={queryActive}
              roomGuardProfile={roomGuardProfile}
              events={events}
              projections={projections}
              boundaries={rightBoundaries}
              onBoundaryChange={(index, value) => updateBoundary(setRightBoundaries, index, value)}
              sideLabel="礼物、醒目留言与大航海分区"
              getFeedSession={getFeedSession}
              liveLayout
              eventAreaRef={eventAreaRef}
              onUserFilter={onUserFilter}
              eventMenuHandlers={eventMenuHandlers}
              displayPreferences={eventDisplayPreferences}
              eventStyleSettings={eventStyleSettings}
              eventFontSize={eventFontSize}
              displayScale={displayScale}
              scrollDirection={liveScrollDirection}
              contentAlignment={liveContentAlignment}
              enableBilibiliVideoLinks
              compatibleEventRender={compatibleEventRender}
              giftEffectEnabled={showLiveGiftEffect}
              guardEffectEnabled={showLiveGuardEffect}
              giftEffectNotices={giftEffectNotices}
              giftEffectRoomKey={roomId}
              giftEffectResolver={resolveGiftEffect}
              onPlayGiftEffect={onPlayGiftEffect}
            />
          </div>
        ) : (
          <div
            ref={splitRef}
            className="absolute inset-0 grid min-w-0"
            style={{ gridTemplateColumns: `minmax(0, ${leftRatio}fr) 4px minmax(0, ${1 - leftRatio}fr)` }}
          >
            {(() => {
              const leftFeed = getFeedSession("dual|left", leftProjection.indices.length);
              const rightFeed = getFeedSession("dual|right", rightProjection.indices.length);
              return (
                <>
            <EventPane
              key={leftFeed.feedKey}
              title="弹幕与互动"
              count={leftProjection.indices.length}
              roomGuardProfile={roomGuardProfile}
              events={events}
              visibleIndices={leftProjection.indices}
              viewKey={leftProjection.scopeKey}
              queryActive={queryActive}
              feedKey={leftFeed.feedKey}
              feedSession={leftFeed.feedSession}
              emptyLabel="左区已被筛选为空"
              liveLayout
              eventAreaRef={eventAreaRef}
              onUserFilter={onUserFilter}
              eventMenuHandlers={eventMenuHandlers}
              displayPreferences={eventDisplayPreferences}
              eventStyleSettings={eventStyleSettings}
              eventFontSize={eventFontSize}
              displayScale={displayScale}
              scrollDirection={liveScrollDirection}
              contentAlignment={liveContentAlignment}
              enableBilibiliVideoLinks
              compatibleEventRender={compatibleEventRender}
            />
            <div
              role="separator"
              aria-label="调整左右区域宽度"
              aria-orientation="vertical"
              aria-valuemin={28}
              aria-valuemax={72}
              aria-valuenow={Math.round(leftRatio * 100)}
              tabIndex={0}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                updateSplit(event.clientX);
              }}
              onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) updateSplit(event.clientX);
              }}
              onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  nudgeSplit(-0.02);
                } else if (event.key === "ArrowRight") {
                  event.preventDefault();
                  nudgeSplit(0.02);
                } else if (event.key === "Home") {
                  event.preventDefault();
                  setLeftRatio(0.28);
                } else if (event.key === "End") {
                  event.preventDefault();
                  setLeftRatio(0.72);
                }
              }}
              className="cursor-col-resize bg-line/40 transition-colors hover:bg-accent/60 focus-visible:bg-accent focus-visible:outline-none"
            />
            <EventPane
              key={rightFeed.feedKey}
              title="付费事件"
              count={rightProjection.indices.length}
              summary={formatGiftSummary(summarizeGiftEvents(events, giftProjection.indices))}
              roomGuardProfile={roomGuardProfile}
              events={events}
              visibleIndices={rightProjection.indices}
              viewKey={rightProjection.scopeKey}
              queryActive={queryActive}
              feedKey={rightFeed.feedKey}
              feedSession={rightFeed.feedSession}
              emptyLabel="右区已被筛选为空"
              liveLayout
              eventAreaRef={eventAreaRef}
              onUserFilter={onUserFilter}
              eventMenuHandlers={eventMenuHandlers}
              displayPreferences={eventDisplayPreferences}
              eventStyleSettings={eventStyleSettings}
              eventFontSize={eventFontSize}
              displayScale={displayScale}
              scrollDirection={liveScrollDirection}
              contentAlignment={liveContentAlignment}
              enableBilibiliVideoLinks
              compatibleEventRender={compatibleEventRender}
              giftEffectEnabled={showLiveGiftEffect}
              guardEffectEnabled={showLiveGuardEffect}
              giftEffectNotices={giftEffectNotices}
              giftEffectRoomKey={roomId}
              giftEffectResolver={resolveGiftEffect}
              onPlayGiftEffect={onPlayGiftEffect}
            />
                </>
              );
            })()}
          </div>
        )}
        </div>
      </main>
      {favoriteEditor && archiveRepository && (
        <FavoriteOrganizationEditor
          title={`编辑收藏 · ${favoriteEditor.event.user?.uname?.trim() || "未知用户"}`}
          initialNote={favoriteEditor.note}
          initialTags={favoriteEditor.tags}
          tags={favoriteEditor.availableTags}
          onCreateTag={(name) => archiveRepository.createFavoriteTag(name)}
          onSave={async (note, tags) => {
            await archiveRepository.updateFavoriteOrganization({
              target: { sourceKind: "archive", stableId: favoriteEditor.stableId },
              note,
              tags,
            });
            setFavoriteEditor(null);
            notifyArchiveRevision();
          }}
          onCancel={() => setFavoriteEditor(null)}
        />
      )}
    </>
  );
}

function App() {
  useEffect(() => {
    let stop: (() => void) | undefined;
    let disposed = false;
    void (async () => {
      const fallback = createBuiltinNativeTheme("native-default");
      await reconcileNativeThemeTarget("live", "live", fallback, setLiveNativeThemeProjection);
      await reconcileNativeThemeTarget("windows", "windows", fallback);
      if (!disposed) stop = await subscribeNativeThemeTarget("live", "live", setLiveNativeThemeProjection);
    })();
    return () => { disposed = true; stop?.(); };
  }, []);
  const phase = useSession((s) => s.phase);
  const restore = useSession((s) => s.restore);
  const initAnchors = useConnection((s) => s.initAnchors);
  const anchors = useConnection((state) => state.anchors);
  const archiveRevision = useArchiveRuntime((state) => state.archiveRevision);
  const connectionStatus = useConnection((s) => s.state.status);
  const uiScale = useGeneralSettings((state) => state.uiScale);
  const eventFontSize = useGeneralSettings((state) => state.eventFontSize);
  const windowEventFontSize = useGeneralSettings((state) => state.windowEventFontSize);
  const eventDisplayPreferences = useGeneralSettings((state) => state.eventDisplayPreferences);
  const liveScrollDirection = useGeneralSettings((state) => state.liveScrollDirection);
  const mergeSameDanmu = useGeneralSettings((state) => state.mergeSameDanmu);
  const sameDanmuWindowSeconds = useGeneralSettings((state) => state.sameDanmuWindowSeconds);
  const showGiftWindowEffect = useGeneralSettings((state) => state.showGiftWindowEffect);
  const showGuardWindowEffect = useGeneralSettings((state) => state.showGuardWindowEffect);
  const displayWindowFilters = useGeneralSettings((state) => state.displayWindowFilters);
  const windowAppearance = useGeneralSettings((state) => state.windowAppearance);
  const eventExpiry = useGeneralSettings((state) => state.eventExpiry);
  const eventStyleSettings = useGeneralSettings((state) => state.eventStyleSettings);
  const [workbenchExpanded, setWorkbenchExpanded] = useState(() => loadWorkbenchWindowState().expanded);
  const [stylePreviewTarget, setStylePreviewTarget] = useState<HTMLDivElement | null>(null);
  const [stylePreviewHeaderTarget, setStylePreviewHeaderTarget] = useState<HTMLDivElement | null>(null);
  const [stylePreviewGeometry, setStylePreviewGeometry] = useState<NativePreviewGeometry | null>(null);
  const [styleEditorActive, setStyleEditorActive] = useState(false);
  const [stylePreviewTitle, setStylePreviewTitle] = useState("样式预览");
  const archiveRepository = useArchiveInitialization();
  const [mainView, setMainView] = useState<MainView>("scene");
  const [sceneSettings, setSceneSettings] = useState<SceneSettings>(() => loadSceneSettings());
  const { displayOpen, displayLocked, giftOpen, giftLocked, revenueSelection } = useAuxiliaryWindows(sceneSettings);
  const [windowMaterialNotice, setWindowMaterialNotice] = useState('');
  useEffect(() => {
    let disposed = false;
    let stop: (() => void) | undefined;
    void listen<{message:string}>('event-window:material-error', ({payload}) => setWindowMaterialNotice(payload.message)).then(value => { if(disposed) value(); else stop = value; });
    return () => { disposed = true; stop?.(); };
  }, []);
  const [revenueWindowFailure, setRevenueWindowFailure] = useState<{ message: string; retry: () => Promise<void> } | null>(null);
  const [settingsRequest, setSettingsRequest] = useState<SettingsOpenRequest | null>(null);
  const settingsRequestId = useRef(0);
  const startupAutoConnectAttempted = useRef(false);
  const sceneColumnRef = useRef<HTMLDivElement>(null);
  const closeBehavior = useGeneralSettings((state) => state.closeBehavior);
  const startOnBoot = useGeneralSettings((state) => state.startOnBoot);
  const autoConnectOnStartup = useGeneralSettings((state) => state.autoConnectOnStartup);
  const reviewOpenCurrentOwner = useGeneralSettings((state) => state.reviewOpenCurrentOwner);
  const reviewArchiveRetentionDays = useGeneralSettings((state) => state.reviewArchiveRetentionDays);
  const reviewOwnerRetentionDays = useGeneralSettings((state) => state.reviewOwnerRetentionDays);
  const reviewPinnedOwnerRoomIds = useGeneralSettings((state) => state.reviewPinnedOwnerRoomIds);
  const [diagnosticFlushResult, setDiagnosticFlushResult] = useState<DiagnosticFlushResult | null>(null);
  const diagnosticContextRef = useRef<DiagnosticContext | null>(null);
  const diagnosticContext = diagnosticContextRef.current ?? (diagnosticContextRef.current = getDiagnosticContext());
  const diagnosticBridgeRef = useRef<ReturnType<typeof createDiagnosticBridge> | null>(null);
  const diagnosticBridge = diagnosticBridgeRef.current ?? (diagnosticBridgeRef.current = createDiagnosticBridge({
    flush: flushWindowDiagnosticLogs,
    invoke: (command, args) => invoke(command, args),
  }));
  const diagnosticExportInProgressRef = useRef(false);
  const diagnosticExportCompletionRef = useRef<Promise<void> | null>(null);
  const diagnosticExportResolveRef = useRef<(() => void) | null>(null);
  const onDiagnosticExportStateChange = useCallback((busy: boolean) => {
    if (busy) {
      if (diagnosticExportInProgressRef.current) return;
      diagnosticExportInProgressRef.current = true;
      diagnosticExportCompletionRef.current = new Promise<void>((resolve) => {
        diagnosticExportResolveRef.current = resolve;
      });
      return;
    }
    diagnosticExportInProgressRef.current = false;
    diagnosticExportResolveRef.current?.();
    diagnosticExportResolveRef.current = null;
    diagnosticExportCompletionRef.current = null;
  }, []);
  const markerLoggerRef = useRef<IssueMarkerLogger | null>(null);
  const markerLogger = markerLoggerRef.current ?? (markerLoggerRef.current = new IssueMarkerLogger({
    context: diagnosticContext,
    invoke: (command, args) => invoke(command, args),
  }));
  const [diagnosticStatus, setDiagnosticStatus] = useState<DiagnosticStatusSnapshot | null>(null);
  const [diagnosticMarkers, setDiagnosticMarkers] = useState<IssueMarker[]>([]);
  const previousSessionUncleanRef = useRef(readDiagnosticSessionMarker() === "active");

  const startupAutoConnectRequestRef = useRef<string | null>(null);
  const startupAutoConnectOutcomeRef = useRef(false);
  const previousStartupSettingsRef = useRef({ startOnBoot, autoConnectOnStartup });
  const previousEventPersonalizationRef = useRef({
    display: eventDisplayPreferences,
    style: eventStyleSettings,
  });


  const refreshDiagnosticStatus = useCallback(async () => {
    const frontend = getDiagnosticHealthSnapshot();
    try {
      const backend = await diagnosticBridge.getDiagnosticStatus();
      const status = frontend.status === "full" || backend.status === "full"
        ? "full"
        : frontend.status === "degraded" || backend.status === "degraded"
          ? "degraded"
          : "healthy";
      setDiagnosticStatus({
        ...backend,
        status,
        queueFull: frontend.status === "full" && frontend.droppedRecords === 0,
        pending: frontend.pending,
        droppedRecords: backend.droppedRecords + frontend.droppedRecords,
        discarded: backend.discarded + frontend.droppedRecords,
        writeFailures: backend.writeFailures + frontend.writeFailures,
      });
    } catch {
      setDiagnosticStatus({
        status: frontend.status,
        queueFull: frontend.status === "full" && frontend.droppedRecords === 0,
        totalBytes: 0,
        normalBytes: 0,
        detailedBytes: 0,
        writeFailures: frontend.writeFailures,
        discarded: frontend.droppedRecords,
        truncated: 0,
        pending: frontend.pending,
        droppedRecords: frontend.droppedRecords,
      });
    }
  }, [diagnosticBridge]);

  useEffect(() => {
    void refreshDiagnosticStatus();
  }, [refreshDiagnosticStatus]);

  useEffect(() => {
    const previous = previousStartupSettingsRef.current;
    const changedKeys: string[] = [];
    if (previous.startOnBoot !== startOnBoot) changedKeys.push("startOnBoot");
    if (previous.autoConnectOnStartup !== autoConnectOnStartup) changedKeys.push("autoConnectOnStartup");
    previousStartupSettingsRef.current = { startOnBoot, autoConnectOnStartup };
    recordFeatureSettingChange({
      featureId: "startup-behavior",
      changedKeys,
      previousValues: previous,
      currentValues: { startOnBoot, autoConnectOnStartup },
    });
  }, [autoConnectOnStartup, startOnBoot]);

  useEffect(() => {
    const previous = previousEventPersonalizationRef.current;
    const changedKeys = [
      ...getChangedSettingPaths(previous.display, eventDisplayPreferences, "eventDisplayPreferences"),
      ...getChangedSettingPaths(previous.style, eventStyleSettings, "eventStyleSettings"),
    ];
    previousEventPersonalizationRef.current = { display: eventDisplayPreferences, style: eventStyleSettings };
    recordFeatureSettingChange({
      featureId: "event-personalization",
      changedKeys,
      previousValues: { eventDisplayPreferences: previous.display, eventStyleSettings: previous.style },
      currentValues: { eventDisplayPreferences, eventStyleSettings },
    });
  }, [eventDisplayPreferences, eventStyleSettings]);

  useEffect(() => {
    const requestId = startupAutoConnectRequestRef.current;
    if (!requestId || startupAutoConnectOutcomeRef.current) return;
    if (connectionStatus === "connected") {
      startupAutoConnectOutcomeRef.current = true;
      recordFeatureDiagnostic({
        featureId: "startup-behavior",
        stage: "success",
        action: "startup-auto-connect",
        outcome: "connected",
        requestId,
      });
      startupAutoConnectRequestRef.current = null;
    } else if (connectionStatus === "error" || connectionStatus === "closed") {
      startupAutoConnectOutcomeRef.current = true;
      recordFeatureDiagnostic({
        featureId: "startup-behavior",
        stage: "failure",
        action: "startup-auto-connect",
        outcome: connectionStatus,
        requestId,
      });
      startupAutoConnectRequestRef.current = null;
    }
  }, [connectionStatus]);

  useApplicationLifecycle({
    closeBehavior, diagnosticContext, diagnosticExportInProgressRef, diagnosticExportCompletionRef, setDiagnosticFlushResult,
  });

  useEffect(() => {
    saveSceneSettings(sceneSettings);
  }, [sceneSettings]);

  useEffect(() => {
    setVoiceGiftThreshold(sceneSettings.giftThreshold, sceneSettings.giftThresholdMode);
  }, [sceneSettings.giftThreshold, sceneSettings.giftThresholdMode]);



  useEffect(() => {
    void getCurrentWebview().setZoom(uiScale).catch(() => {});
  }, [uiScale]);

  useEffect(() => {
    initTheme();
    let active = true;
    void Promise.all([restore(), initAnchors()]).then(() => {
      if (!active || startupAutoConnectAttempted.current) return;
      startupAutoConnectAttempted.current = true;
      if (!useGeneralSettings.getState().autoConnectOnStartup) return;
      const session = useSession.getState().session;
      // getMostRecentAnchor 按主播记录的 lastConnectedAt 选择最近连接者。
      const anchor = getMostRecentAnchor(useConnection.getState().anchors);
      if (!session) {
        recordFeatureDiagnostic({
          featureId: "startup-behavior",
          stage: "cancel",
          action: "startup-auto-connect",
          outcome: "skipped-no-session",
        });
        return;
      }
      if (!anchor) {
        recordFeatureDiagnostic({
          featureId: "startup-behavior",
          stage: "cancel",
          action: "startup-auto-connect",
          outcome: "skipped-no-anchor",
        });
        return;
      }
      const requestId = `startup-connect-${Date.now()}`;
      startupAutoConnectRequestRef.current = requestId;
      startupAutoConnectOutcomeRef.current = false;
      recordFeatureDiagnostic({
        featureId: "startup-behavior",
        stage: "request",
        action: "startup-auto-connect",
        outcome: "requested",
        requestId,
        data: { roomId: anchor.realRoomId ?? anchor.roomIdInput },
      });
      try {
        useConnection.getState().connect(anchor.roomIdInput, session.cookie, session.mid);
      } catch (error) {
        startupAutoConnectOutcomeRef.current = true;
        startupAutoConnectRequestRef.current = null;
        recordFeatureDiagnostic({
          featureId: "startup-behavior",
          stage: "failure",
          action: "startup-auto-connect",
          outcome: "connect-threw",
          requestId,
          data: { message: diagnosticErrorMessage(error) },
        });
      }
    }).catch((error) => {
      recordFeatureDiagnostic({
        featureId: "startup-behavior",
        stage: "failure",
        action: "startup-initialization",
        outcome: "restore-failed",
        data: { message: diagnosticErrorMessage(error) },
      });
    });
    // 诊断日志按普通流 7 天/64MB、原始数据/界面渲染流 3 天/512MB 安全清理。
    void invoke("cleanup_diagnostic_logs").catch(() => {});
    return () => {
      active = false;
    };
  }, [restore, initAnchors]);

  useEffect(() => {
    const action = startOnBoot ? "enable-autostart" : "disable-autostart";
    const requestId = `autostart-${Date.now()}`;
    recordFeatureDiagnostic({
      featureId: "startup-behavior",
      stage: "request",
      action,
      outcome: "requested",
      requestId,
      data: { enabled: startOnBoot },
    });
    void (startOnBoot ? enable() : disable())
      .then(() => {
        recordFeatureDiagnostic({
          featureId: "startup-behavior",
          stage: "success",
          action,
          outcome: "applied",
          requestId,
          data: { enabled: startOnBoot },
        });
      })
      .catch((error) => {
        recordFeatureDiagnostic({
          featureId: "startup-behavior",
          stage: "failure",
          action,
          outcome: "apply-failed",
          requestId,
          data: { enabled: startOnBoot, message: diagnosticErrorMessage(error) },
        });
      });
  }, [startOnBoot]);

  useEffect(() => {
    const cleanup = () => {
      void invoke("cleanup_diagnostic_logs")
        .then(() => refreshDiagnosticStatus())
        .catch(() => {});
    };
    const timer = window.setInterval(cleanup, 60 * 1000);
    return () => window.clearInterval(timer);
  }, [refreshDiagnosticStatus]);

  useEffect(() => {
    // 根组件持有全局控制器生命周期；页面切换不会触发清理。
    void voiceController;
    const shutdownVoice = () => shutdownVoiceRuntime();
    window.addEventListener("beforeunload", shutdownVoice);
    return () => window.removeEventListener("beforeunload", shutdownVoice);
  }, []);



  const toggleDisplayWindow = useCallback(() => {
    const task = isDisplayWindowOpen() ? closeDisplayWindow() : openDisplayWindow();
    void task.catch(() => {});
  }, []);

  const toggleDisplayLock = useCallback(() => {
    toggleDisplayWindowLock();
  }, []);

  const runRevenueWindowOperation = useCallback(async (operation: () => Promise<void>) => {
    setRevenueWindowFailure(null);
    try { await operation(); } catch (error) {
      setRevenueWindowFailure({
        message: error instanceof Error ? error.message : "窗口操作未完成，请重试。",
        retry: error instanceof RevenueWindowOperationError ? error.retry : operation,
      });
    }
  }, []);

  const toggleGiftWindow = useCallback(() => {
    return runRevenueWindowOperation(isGiftWindowOpen() ? closeGiftWindow : openGiftWindow);
  }, [runRevenueWindowOperation]);

  const toggleRevenueChildWithFeedback = useCallback((kind: Parameters<typeof toggleRevenueChild>[0]) => {
    return runRevenueWindowOperation(() => toggleRevenueChild(kind));
  }, [runRevenueWindowOperation]);

  const setRevenueWindowModeWithFeedback = useCallback((mode: Parameters<typeof setRevenueWindowMode>[0]) => {
    return runRevenueWindowOperation(() => setRevenueWindowMode(mode));
  }, [runRevenueWindowOperation]);

  const toggleGiftLock = useCallback(() => {
    toggleGiftWindowLock();
  }, []);

  const resetWindowLayout = useCallback(async () => {
    const mainWindow = getCurrentWindow();
    if (await mainWindow.isMaximized().catch(() => false)) {
      await mainWindow.toggleMaximize().catch(() => {});
    }
    await mainWindow.setSize(new LogicalSize(960, 720)).catch(() => {});
    await mainWindow.center().catch(() => {});
  }, []);

  const resetDisplayWindowLayout = useCallback(() => resetDisplayWindowGeometry(), []);
  const resetGiftWindowLayout = useCallback(() => resetGiftWindowGeometry(), []);
  const resetAllWindowLayout = useCallback(async () => {
    await resetWindowLayout();
    const area = await readCurrentMonitorWorkArea();
    const display = toPhysicalWindowPlacement(createDefaultWindowPair(area).display,area?.scaleFactor);
    await Promise.all([resetDisplayWindowGeometry(area), resetGiftWindowGeometry(area,display)]);
  }, [resetWindowLayout]);

  const openWindowSettings = useCallback((anchorId: SettingsAnchorId) => {
    settingsRequestId.current += 1;
    setSettingsRequest({ requestId: settingsRequestId.current, sectionId: "windows", anchorId });
  }, []);

  const openSettings = useCallback(() => {
    settingsRequestId.current += 1;
    setSettingsRequest({ requestId: settingsRequestId.current, sectionId: "general" });
  }, []);

  const openCloudRecoverySettings = useCallback(() => {
    settingsRequestId.current += 1;
    setSettingsRequest({ requestId: settingsRequestId.current, sectionId: "review", anchorId: "cloud-recovery", action: "connect-cloud-recovery" });
  }, []);

  const openDiagnosticMarker = useCallback(() => {
    settingsRequestId.current += 1;
    setSettingsRequest({
      requestId: settingsRequestId.current,
      sectionId: "other",
      anchorId: "diagnostics",
      action: "mark-issue",
    });
  }, []);

  const saveUserNickname = useCallback((userOrUid: DanmakuUser | string, nickname: string) => {
    const value = nickname.trim();
    if (!value) return;
    const uid = typeof userOrUid === "string" ? userOrUid : userOrUid.uid;
    const voiceStore = useVoiceSettings.getState();
    voiceStore.setVoiceSettings({
      userNicknames: upsertUserNickname(voiceStore.userNicknames, uid, value),
    });
    void archiveRepository?.setNickname(uid, value).catch((error) => {
      recordFeatureDiagnostic({
        featureId: "review-archive",
        stage: "failure",
        action: "set-nickname",
        outcome: "repository-write-failed",
        data: { error: error instanceof Error ? error.message : String(error) },
      });
    });
  }, [archiveRepository]);

  const deleteUserNickname = useCallback((userOrUid: DanmakuUser | string) => {
    const uid = typeof userOrUid === "string" ? userOrUid : userOrUid.uid;
    const voiceStore = useVoiceSettings.getState();
    voiceStore.setVoiceSettings({
      userNicknames: removeUserNickname(voiceStore.userNicknames, uid),
    });
    void archiveRepository?.setNickname(uid, null).catch((error) => {
      recordFeatureDiagnostic({
        featureId: "review-archive",
        stage: "failure",
        action: "remove-nickname",
        outcome: "repository-write-failed",
        data: { error: error instanceof Error ? error.message : String(error) },
      });
    });
  }, [archiveRepository]);

  const markDiagnosticIssue = useCallback((note?: string, markedAt = Date.now()) => {
    const connection = useConnection.getState();
    const marker = createIssueMarker({
      id: `issue-${markedAt}-${Math.random().toString(36).slice(2, 8)}`,
      markedAt,
      note,
      sessionId: diagnosticContext.sessionId,
      connectionId: getDiagnosticConnectionId(diagnosticContext),
      roomId: connection.state.roomId,
    });
    setDiagnosticMarkers((current) => [...current, marker]);
    markerLogger.record(marker);
    recordFeatureDiagnostic({
      featureId: "diagnostics",
      stage: "request",
      action: "mark-issue",
      outcome: "collecting",
      eventId: marker.id,
      data: { hasNote: Boolean(note) },
    });
    void flushAllDiagnosticLogs().then(() => refreshDiagnosticStatus()).catch(() => {});
  }, [diagnosticContext, markerLogger, refreshDiagnosticStatus]);

  useEffect(() => {
    let disposed = false;
    let unlisteners: Array<() => void> = [];
    const register = async () => {
      const stops = await Promise.all([
        listen("tray:toggle-display-window", () => {
          if (!disposed) toggleDisplayWindow();
        }),
        listen("tray:toggle-gift-window", () => {
          if (!disposed) toggleGiftWindow();
        }),
        listen("tray:open-settings", () => {
          if (!disposed) openSettings();
        }),
        listen("tray:mark-issue", () => {
          if (!disposed) openDiagnosticMarker();
        }),
      ]);
      if (disposed) {
        stops.forEach((stop) => stop());
      } else {
        unlisteners = stops;
      }
    };
    void register();
    return () => {
      disposed = true;
      unlisteners.forEach((stop) => stop());
      unlisteners = [];
    };
  }, [openDiagnosticMarker, openSettings, toggleDisplayWindow, toggleGiftWindow]);

  const exportDiagnosticBundle = useCallback(async (mode: "24h" | "full", outputPath: string) => {
    const snapshot = await collectApplicationDiagnosticSnapshot({
      archiveRepository, sceneSettings, abnormalExit: previousSessionUncleanRef.current,
      windows: { displayOpen, displayLocked, giftOpen, giftLocked, revenueSelection, revenueWindows: getRevenueWindowDiagnostics(), workbenchExpanded },
    });
    recordFeatureDiagnostic({
      featureId: "diagnostics",
      stage: "request",
      action: "export-bundle",
      outcome: "requested",
      data: { mode, phase: "start", pathProvided: outputPath.trim().length > 0 },
    });
    const featureSnapshots = collectFeatureSnapshots(snapshot);
    const exportSnapshot = {
      ...snapshot,
      featureManifest: {
        version: 1,
        features: collectFeatureManifest(),
        snapshots: featureSnapshots.snapshots,
        missingSnapshots: featureSnapshots.missing,
        activity: collectFeatureActivity(),
        settingHistory: collectFeatureSettingHistory(),
      },
    };
    try {
      const result = await diagnosticBridge.exportBundle(mode, outputPath, exportSnapshot);
      const missingSnapshots = result.missingSnapshots ?? [];
      if (result.flush && (result.flush.failed > 0 || result.flush.writeFailures > 0 || result.flush.pending > 0 || result.flush.droppedRecords > 0)) {
        recordFeatureDiagnostic({
          featureId: "diagnostics",
          stage: "failure",
          action: "export-preflight",
          outcome: "degraded",
          data: {
            mode,
            failed: result.flush.failed,
            writeFailures: result.flush.writeFailures,
            pending: result.flush.pending,
            droppedRecords: result.flush.droppedRecords,
          },
        });
      }
      if (missingSnapshots.length > 0) {
        recordFeatureDiagnostic({
          featureId: "diagnostics",
          stage: "failure",
          action: "snapshot-collection",
          outcome: "missing",
          data: {
            count: missingSnapshots.length,
            phase: "snapshot",
            keys: missingSnapshots.join(","),
          },
        });
      }
      recordFeatureDiagnostic({
        featureId: "diagnostics",
        stage: "success",
        action: "export-bundle",
        outcome: "exported",
        data: { mode, phase: "complete", fileCount: result.files.length, bytes: result.bytes, pathProvided: outputPath.trim().length > 0 },
      });
      await refreshDiagnosticStatus();
      return result;
    } catch (error) {
      recordFeatureDiagnostic({
        featureId: "diagnostics",
        stage: "failure",
        action: "export-bundle",
        outcome: error instanceof Error ? error.message : "export-failed",
        data: { mode, phase: "failure", pathProvided: outputPath.trim().length > 0 },
      });
      throw error;
    }
  }, [archiveRepository, autoConnectOnStartup, diagnosticBridge, displayLocked, displayOpen, displayWindowFilters, eventDisplayPreferences, eventExpiry, eventFontSize, eventStyleSettings, giftLocked, giftOpen, revenueSelection, liveScrollDirection, mergeSameDanmu, refreshDiagnosticStatus, reviewArchiveRetentionDays, reviewOpenCurrentOwner, reviewOwnerRetentionDays, reviewPinnedOwnerRoomIds, sceneSettings, showGiftWindowEffect, showGuardWindowEffect, sameDanmuWindowSeconds, startOnBoot, uiScale, windowAppearance, windowEventFontSize, workbenchExpanded]);

  const openDiagnosticDirectory = useCallback(async (): Promise<void> => {
    recordFeatureDiagnostic({
      featureId: "diagnostics",
      stage: "request",
      action: "open-log-directory",
      outcome: "requested",
    });
    try {
      await diagnosticBridge.openLogDirectory();
      recordFeatureDiagnostic({
        featureId: "diagnostics",
        stage: "success",
        action: "open-log-directory",
        outcome: "opened",
      });
    } catch (error) {
      recordFeatureDiagnostic({
        featureId: "diagnostics",
        stage: "failure",
        action: "open-log-directory",
        outcome: error instanceof Error ? error.message : "open-failed",
      });
      throw error;
    }
  }, [diagnosticBridge]);

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden bg-bg font-ui text-t1"
      data-diagnostic-write-failures={diagnosticFlushResult?.writeFailures ?? 0}
      data-diagnostic-dropped-records={diagnosticFlushResult?.droppedRecords ?? 0}
    >
      <TitleBar />
      {windowMaterialNotice && <div role="alert" className="window-material-notice"><span>{windowMaterialNotice}</span><button type="button" onClick={() => openWindowSettings('display')}>副窗口设置</button><button type="button" onClick={() => setWindowMaterialNotice('')} aria-label="关闭窗口提示">关闭</button></div>}
      <style>{REVIEW_PRICE_GRADIENT_CSS}</style>
      {revenueWindowFailure && <ConfirmDialog
        title="窗口操作未完成"
        description={revenueWindowFailure.message}
        confirmLabel="重试"
        errorMessage={revenueWindowFailure.message}
        onCancel={() => setRevenueWindowFailure(null)}
        onConfirm={async () => {
          try { await revenueWindowFailure.retry(); } catch (error) {
            setRevenueWindowFailure({
              message: error instanceof Error ? error.message : "窗口操作未完成，请重试。",
              retry: error instanceof RevenueWindowOperationError ? error.retry : revenueWindowFailure.retry,
            });
            throw error;
          }
        }}
      />}
      <div className="flex min-h-0 flex-1">
        <Sidebar
          activeMainView={mainView}
          onSelectMainView={setMainView}
          displayOpen={displayOpen}
          displayLocked={displayLocked}
          onToggleDisplay={toggleDisplayWindow}
          onToggleDisplayLock={toggleDisplayLock}
          giftOpen={giftOpen}
          giftLocked={giftLocked}
          onToggleGift={toggleGiftWindow}
          onToggleGiftLock={toggleGiftLock}
          onOpenDisplaySettings={() => openWindowSettings("display")}
          onOpenGiftSettings={() => openWindowSettings("gift")}
          revenueSelection={revenueSelection}
          onToggleRevenueChild={toggleRevenueChildWithFeedback}
        />
        <div className="flex min-w-0 flex-1">
          <div ref={sceneColumnRef} className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            {phase === "loggedIn" ? (
              <RoomInsightsProvider>
                <div className="relative min-h-0 flex-1">
                  <div hidden={mainView !== "scene"} className="absolute inset-0 flex min-w-0 flex-col">
                    <MainArea
                      sceneSettings={sceneSettings}
                      setSceneSettings={setSceneSettings}
                      onSaveNickname={saveUserNickname}
                      onDeleteNickname={deleteUserNickname}
                      archiveRepository={archiveRepository}
                    />
                  </div>
                  <div hidden={mainView !== "voice"} className="absolute inset-0 flex min-w-0 flex-col">
                    <VoicePanel />
                  </div>
                  <div hidden={mainView !== "personal"} className="absolute inset-0 flex min-w-0 flex-col">
                    <PersonalBroadcastPanel />
                  </div>
                  <div hidden={mainView !== "review"} className="absolute inset-0 flex min-w-0 flex-col">
                    <ReviewPanel repository={archiveRepository} anchors={anchors} active={mainView === "review"} refreshKey={archiveRevision}
                      onOpenCloudRecoverySettings={openCloudRecoverySettings} onArchiveChanged={notifyArchiveRevision} />
                  </div>
                  <div hidden={mainView !== "style"} className="absolute inset-0 flex min-w-0 flex-col">
                    <StylePanel active={mainView === "style"} previewTarget={stylePreviewTarget} previewHeaderTarget={stylePreviewHeaderTarget} previewGeometry={stylePreviewGeometry} onEditingChange={setStyleEditorActive} onPreviewTitleChange={setStylePreviewTitle} />
                  </div>
                </div>
                <StatusBar onOpenUpdate={() => {settingsRequestId.current += 1;setSettingsRequest({requestId:settingsRequestId.current,sectionId:"about"});}} />
                <CloudRecoveryProgress />
              </RoomInsightsProvider>
            ) : (
              <>
                {phase === "loggingIn" || phase === "loggedOut" || phase === "restoreUnavailable" ? (
                  <LoginScreen />
                ) : (
                  // restoring：恢复登录态的过渡
                  <div className="flex flex-1 items-center justify-center ui-type-control text-t3">
                    正在恢复登录态…
                  </div>
                )}
              </>
            )}
          </div>
          <RightWorkbench
            active={phase === "loggedIn"}
            stylePreviewActive={mainView === "style" && styleEditorActive}
            stylePreviewTitle={stylePreviewTitle}
            onStylePreviewTarget={setStylePreviewTarget}
            onStylePreviewHeaderTarget={setStylePreviewHeaderTarget}
            onStylePreviewGeometry={setStylePreviewGeometry}
            expanded={workbenchExpanded}
            onToggle={() => setWorkbenchExpanded((value) => !value)}
            sceneColumnRef={sceneColumnRef}
            sceneSettings={sceneSettings}
            setSceneSettings={setSceneSettings}
            displayOpen={displayOpen}
            displayLocked={displayLocked}
            onToggleDisplay={toggleDisplayWindow}
            onToggleDisplayLock={toggleDisplayLock}
            onLocateDisplay={() => void runRevenueWindowOperation(locateDisplayWindow)}
            giftOpen={giftOpen}
            giftLocked={giftLocked}
            onToggleGift={toggleGiftWindow}
            onToggleGiftLock={toggleGiftLock}
            onLocateGift={() => void runRevenueWindowOperation(locateGiftWindows)}
            revenueSelection={revenueSelection}
            onRevenueWindowMode={setRevenueWindowModeWithFeedback}
            onToggleRevenueChild={toggleRevenueChildWithFeedback}
            onResetWindowLayout={resetWindowLayout}
            onResetDisplayWindowLayout={resetDisplayWindowLayout}
            onResetGiftWindowLayout={resetGiftWindowLayout}
            onResetAllWindowLayout={resetAllWindowLayout}
            diagnosticStatus={diagnosticStatus}
            diagnosticMarkers={diagnosticMarkers}
            onMarkDiagnosticIssue={markDiagnosticIssue}
            onExportDiagnosticBundle={exportDiagnosticBundle}
            onDiagnosticExportStateChange={onDiagnosticExportStateChange}
            onOpenDiagnosticDirectory={openDiagnosticDirectory}
            onSaveNickname={saveUserNickname}
            onDeleteNickname={deleteUserNickname}
            archiveRepository={archiveRepository}
            onArchiveChanged={notifyArchiveRevision}
            settingsRequest={settingsRequest}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
