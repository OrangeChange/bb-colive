import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";
import { resolveWindowSurfaceColor, resolveWindowSurfaceOpacity, resolveWindowScheme } from '../windowAppearance';
import { applyEventWindowMaterial } from './eventWindowMaterial';
import { EventWindowPositionHint } from './EventWindowPositionHint';
import { createWindowPositionHint, shouldShowWindowPositionHint, EVENT_WINDOW_NAMES } from './windowPositionHint';
import { scrollSticky } from "../events/feedScroll.ts";
import { resolveWindowThemeTarget, useWindowThemeSettings } from "../themes/windowThemeSettings.ts";
import { createNativeEventVisibilityPredicate, resolveOutputEventNeeds } from "../events/outputEventPolicy.ts";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence } from 'motion/react';
import { publicWindowAreaClass } from "../events/publicEventStyle";
import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";
import { load, type Store } from "../appData.ts";
import { openUrl } from "@tauri-apps/plugin-opener";
import { MsgType, type DanmakuEvent } from "../protocol/types";
import { activityStore, ACTIVITY_UPDATE_EVENT } from '../events/activityStore';
import type { ActivityFacts } from '../events/activityLifecycle';
import { applyRoomGuardProfileToEvents } from '../protocol/roomGuardProfile';
import type { GiftEffectNotice } from "./giftEffectBus";
import type { GiftEffectResource } from "../protocol/giftEffects";
import { EventRow } from "../components/EventRow";
import { StickyEventCard } from '../components/StickyEventCard';
import { selectStickyEvents, stickyCandidate, updateStickyEvents, STICKY_SNAPSHOT_EVENT, stickyEventKey } from './stickyEventModel';
import { EventRowSlot } from "../components/EventRowSlot";
import { useEventAreaStyle } from "../components/EventAreaStyle";
import { GiftEffectOverlay } from "../components/GiftEffectOverlay";
import { observeRenderedEventRows } from "../diagnostics/renderLogger";
import { recordFeatureDiagnostic } from "../diagnostics/featureDiagnostics.ts";
import type { EventWindowEvent } from "./eventWindowDiagnostics";
import { isAllowedByOnlyGuardEntry } from "../events/eventView";
import { isAllowedByAudienceFilters } from "../events/audienceFilters.ts";
import { isDisplayWindowEventVisible } from "../eventFilterSettings";
import { getEventStyleType, rgbaToCss } from "../eventStyleSettings";
import { subscribeNativeThemeTarget } from "../themes/nativeThemeRuntime.ts";
import {
  DEFAULT_EVENT_WINDOW_PREFERENCES,
  EVENT_WINDOW_PREFERENCES_EVENT,
  applyEventWindowPreferences,
  type EventWindowPreferences,
  applyNativeThemeProjectionToWindowPreferences,
} from "./eventWindowPreferences";
import {
  DISPLAY_EVENT_NAME,
  DISPLAY_LOCK_EVENT,
  DISPLAY_LOCK_STATE_EVENT,
  DISPLAY_ROOM_CHANGED_EVENT,
  DISPLAY_READY_EVENT,
  DISPLAY_READY_REQUEST_EVENT,
  DISPLAY_READY_ACK_EVENT,
  GIFT_EVENT_NAME,
  GIFT_EFFECT_MANUAL_EVENT,
  GIFT_LOCK_EVENT,
  GIFT_LOCK_STATE_EVENT,
  GIFT_READY_EVENT,
  GIFT_READY_REQUEST_EVENT,
  GIFT_READY_ACK_EVENT,
  GIFT_ROOM_CHANGED_EVENT,
  GIFT_RESET_GEOMETRY_EVENT,
  DISPLAY_RESET_GEOMETRY_EVENT,
  isEventWindowEventForRoom,
  isEventWindowRoomStatePayload,
  acceptsEventWindowRoomState,
  type EventWindowRoomStatePayload,
  revenueWindowChannels, type EventWindowKind, type RevenueWindowLabel,
} from "./eventWindowChannels";
import { appendDisplayEvent, projectDisplayEvents } from "./displayWindowModel";
import { appendGiftWindowEvent, isGiftWindowEvent, isGiftWindowEventVisible, revenueEventKind } from "./giftWindowModel";
import { pruneExpiredEvents } from "./windowEventExpiry";
import { getDiagnosticContext } from "../diagnostics/diagnosticLogger";
import { getFeedStackAlignment } from "../events/feedScroll";
import { useCompatibleFeedNode, useLocalFeedReading, type LocalFeedReadingState } from "../events/useLocalFeedReading.ts";
import { getEventAnimationDuration, getEventAnimationExitDuration } from "../eventDisplaySettings";
import {
  shouldRestoreWindowGeometry,
  getEventWindowMinSize,
  type PersistedWindowGeometry,
  type WindowPlacement,
  type WindowResizeDirection,
} from "./eventWindowLayout";
import { recordWindowDiagnostic } from "./windowDiagnostics";
import { drainWindowDiagnosticSubmissions } from "../diagnostics/windowDiagnosticBridge.ts";
import { CompatibleEventRenderer, compatibleExternalHtmlOf, compatibleRendererSurface, planCompatibleListPresentation, compatibleEventDecisionOf, resolveCompatibleEventRender, subscribeCompatibleEventRenderChange, type CompatibleEventRender, type CompatibleEventSurfaceContext } from "../compat/CompatibleEventRenderer.tsx";
import { CompatibleListSurface as BlivechatSourceSurface } from "../compat/CompatibleListSurface.tsx";
import { BlivechatExternalHtmlTarget } from "../compat/blivechat/BlivechatExternalHtmlTarget.tsx";
import { blivechatThemeRuntime } from "../compat/blivechat/runtime.tsx";
import { dispatchCompatibleLiveAction } from "../compat/compatibleLiveBridge.ts";

function useWindowCompatibleEventRender(context: CompatibleEventSurfaceContext): CompatibleEventRender | undefined {
  const [render, setRender] = useState(() => resolveCompatibleEventRender(context));
  useEffect(() => {
    const update = () => setRender(() => resolveCompatibleEventRender(context));
    update();
    return subscribeCompatibleEventRenderChange(update);
  }, [context.target, context.targetId, context.roomId, context.placement]);
  return render;
}

function giftEffectEventKey(event: Pick<DanmakuEvent, "id" | "reactKey">): string {
  return event.reactKey ?? event.id;
}

type WindowGeometry = PersistedWindowGeometry;

type EventWindowConfig = {
  kind: EventWindowKind;
  windowClass: "display-window" | "gift-window";
  dragClass: "display-window-drag-layer" | "gift-window-drag-layer";
  logClass: "display-window-log" | "gift-window-log";
  eventListClass: "display-window-event-list" | "gift-window-event-list";
  resizeClass: "display-window-resize-handle" | "gift-window-resize-handle";
  resizeHandles: readonly { className: string; direction: WindowResizeDirection }[];
  eventName: string;
  readyEvent: string;
  readyRequestEvent: string;
  readyAckEvent: string;
  lockEvent: string;
  lockStateEvent: string;
  roomChangedEvent: string;
  resetGeometryEvent: string;
  geometryStoreFile: string;
  appendEvent: (events: EventWindowEvent[], event: EventWindowEvent, preferences: EventWindowPreferences) => EventWindowEvent[];
  label: string;
};

const RESIZE_DIRECTIONS = [
  { direction: "North", suffix: "north" },
  { direction: "NorthEast", suffix: "northeast" },
  { direction: "NorthWest", suffix: "northwest" },
  { direction: "East", suffix: "east" },
  { direction: "West", suffix: "west" },
  { direction: "SouthWest", suffix: "southwest" },
  { direction: "SouthEast", suffix: "southeast" },
  { direction: "South", suffix: "south" },
] as const;

const WINDOW_CONFIGS: Record<"display" | "gift", EventWindowConfig> = {
  display: {
    kind: "display",
    windowClass: "display-window",
    dragClass: "display-window-drag-layer",
    logClass: "display-window-log",
    eventListClass: "display-window-event-list",
    resizeClass: "display-window-resize-handle",
    resizeHandles: RESIZE_DIRECTIONS.map(({ direction, suffix }) => ({
      className: `display-window-resize-${suffix}`,
      direction,
    })),
    eventName: DISPLAY_EVENT_NAME,
    readyEvent: DISPLAY_READY_EVENT,
    readyRequestEvent: DISPLAY_READY_REQUEST_EVENT,
    readyAckEvent: DISPLAY_READY_ACK_EVENT,
    lockEvent: DISPLAY_LOCK_EVENT,
    lockStateEvent: DISPLAY_LOCK_STATE_EVENT,
    roomChangedEvent: DISPLAY_ROOM_CHANGED_EVENT,
    resetGeometryEvent: DISPLAY_RESET_GEOMETRY_EVENT,
    geometryStoreFile: "display-window.local.json",
    appendEvent: (events, event, preferences) => appendDisplayEvent(events, event, preferences.capacity, preferences),
    get label() { return uiText("uiControls.chatWindow"); },
  },
  gift: {
    kind: "gift",
    windowClass: "gift-window",
    dragClass: "gift-window-drag-layer",
    logClass: "gift-window-log",
    eventListClass: "gift-window-event-list",
    resizeClass: "gift-window-resize-handle",
    resizeHandles: RESIZE_DIRECTIONS.map(({ direction, suffix }) => ({
      className: `gift-window-resize-${suffix}`,
      direction,
    })),
    eventName: GIFT_EVENT_NAME,
    readyEvent: GIFT_READY_EVENT,
    readyRequestEvent: GIFT_READY_REQUEST_EVENT,
    readyAckEvent: GIFT_READY_ACK_EVENT,
    lockEvent: GIFT_LOCK_EVENT,
    lockStateEvent: GIFT_LOCK_STATE_EVENT,
    roomChangedEvent: GIFT_ROOM_CHANGED_EVENT,
    resetGeometryEvent: GIFT_RESET_GEOMETRY_EVENT,
    geometryStoreFile: "gift-window.local.json",
    appendEvent: (events, event, preferences) => appendGiftWindowEvent(events, event, preferences.capacity),
    get label() { return uiText("uiControls.paidWindow"); },
  },
};

function isWindowGeometry(value: unknown, kind: EventWindowKind): value is WindowGeometry {
  if (typeof value !== "object" || value === null) return false;
  const { x, y, width, height } = value as Partial<WindowGeometry>;
  const minimum = getEventWindowMinSize(kind);
  return (
    typeof x === "number" &&
    typeof y === "number" &&
    typeof width === "number" &&
    typeof height === "number" &&
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width >= minimum.width &&
    height >= minimum.height
  );
}

async function readWindowGeometry(store: Store, kind: EventWindowKind): Promise<WindowGeometry | null> {
  try {
    const value = await store.get<WindowGeometry>("geometry");
    if (!isWindowGeometry(value, kind)) return null;
    return {
      x: value.x,
      y: value.y,
      width: value.width,
      height: value.height,
      ...(typeof value.custom === "boolean" ? { custom: value.custom } : {}),
    };
  } catch {
    return null;
  }
}

async function writeWindowGeometry(store: Store, geometry: WindowGeometry | null): Promise<void> {
  if (!geometry) return;
  try {
    await store.set("geometry", geometry);
    await store.save();
  } catch {
    // 插件存储不可用时不影响窗口本身。
  }
}

const SPLIT_WINDOW_CONFIGS = Object.fromEntries((['gift-only', 'superchat', 'guard'] as const).map(kind => [kind, {
  ...WINDOW_CONFIGS.gift, ...revenueWindowChannels(kind), kind,
  appendEvent: (events: EventWindowEvent[], event: EventWindowEvent, preferences: EventWindowPreferences) => revenueEventKind(event) === (kind === 'gift-only' ? 'gift' : kind)
    ? appendGiftWindowEvent(events,event,preferences.capacity) : events,
  get label() { return uiText(kind === 'gift-only' ? 'uiControls.giftWindow' : kind === 'superchat' ? 'uiControls.scWindow' : 'uiControls.membershipWindow'); },
}])) as unknown as Record<Exclude<RevenueWindowLabel,'gift'>, EventWindowConfig>;

export function FloatingEventWindow({ kind }: { kind: EventWindowKind }) {
  useUiLanguage();
  const config = kind === 'display' || kind === 'gift' ? WINDOW_CONFIGS[kind] : SPLIT_WINDOW_CONFIGS[kind];
  const isRevenue = kind !== 'display';
  const hasGiftEffects = kind === 'gift' || kind === 'gift-only' || kind === 'guard';
  const acceptsCategory = (event: DanmakuEvent) => kind === 'display' || kind === 'gift'
    || revenueEventKind(event) === (kind === 'gift-only' ? 'gift' : kind);
  const [events, setEvents] = useState<EventWindowEvent[]>([]);
  const [stickyEvents, setStickyEvents] = useState<DanmakuEvent[]>([]);
  const [stickyRoomKey, setStickyRoomKey] = useState(0);
  const [roomGuardProfile, setRoomGuardProfile] = useState<import("../protocol/types.ts").RoomGuardProfile>();
  const [activeRoomId, setActiveRoomId] = useState<number | null>(null);
  const windowThemes = useWindowThemeSettings();
  const themeTargetId = resolveWindowThemeTarget(windowThemes.mode, kind, windowThemes.bindings);
  const compatibleMainRender = useWindowCompatibleEventRender({ target: "windows", targetId: themeTargetId, placement: "main", roomId: activeRoomId });
  const compatibleStickyRender = useWindowCompatibleEventRender({ target: "windows", targetId: themeTargetId, placement: "sticky", roomId: activeRoomId });
  const mainRenderRef = useRef(compatibleMainRender);
  useEffect(() => {
    let stopped = false;
    let dispose: (() => void) | undefined;
    void listen<ActivityFacts>(ACTIVITY_UPDATE_EVENT, ({payload}) => {
      if (payload.roomId === activeRoomId) activityStore.accept(payload);
    }).then(stop => { if (stopped) stop(); else dispose = stop; });
    return () => { stopped = true; dispose?.(); activityStore.clear(); };
  }, [activeRoomId]);
  mainRenderRef.current = compatibleMainRender;
  const [stickyNow, setStickyNow] = useState(Date.now);
  const [windowPreferences, setWindowPreferences] = useState<EventWindowPreferences>(DEFAULT_EVENT_WINDOW_PREFERENCES);
  const windowPreferencesRef = useRef(windowPreferences);
  const [preferencesReceived, setPreferencesReceived] = useState(false);
  const [softwareScheme, setSoftwareScheme] = useState<'light' | 'dark'>(() => document.documentElement.dataset.softwareScheme === 'dark' ? 'dark' : 'light');
  const [surfaceRevision, setSurfaceRevision] = useState(0);
  const scheme = resolveWindowScheme(windowPreferences.appearance.scheme, softwareScheme);
  const [actualLocked, setActualLocked] = useState<boolean | null>(null);
  const [locating, setLocating] = useState(false);
  const [positionHint] = useState(() => createWindowPositionHint(setLocating));
  const lockQueue = useRef(Promise.resolve());
  const materialQueue = useRef(Promise.resolve());
  const appliedMaterial = useRef('');
  const [nativeScale, setNativeScale] = useState(() => window.devicePixelRatio);
  const [firstMaterial] = useState(() => {
    let resolve!: () => void;
    const promise = new Promise<void>(done => { resolve = done; });
    return { promise, resolve };
  });
  useEffect(() => {
    const observer = new MutationObserver(() => { setSoftwareScheme(document.documentElement.dataset.softwareScheme === 'dark' ? 'dark' : 'light'); setSurfaceRevision(value => value + 1); });
    observer.observe(document.documentElement, {attributes:true, attributeFilter:['data-software-scheme','data-theme','data-custom-color']});
    return () => { observer.disconnect(); positionHint.dispose(); };
  }, [positionHint]);
  useEffect(() => {
    if (!preferencesReceived) return;
    let disposed = false;
    materialQueue.current = materialQueue.current.then(async () => {
      if (disposed) return;
      const radius = windowPreferences.appearance.material === 'transparent' ? 0 : windowPreferences.appearance.radius;
      const materialKey = `${windowPreferences.appearance.material}:${radius}:${scheme}:${nativeScale}:${windowPreferences.appearance.glassTint}:${JSON.stringify(windowPreferences.appearance.surfaceColor)}:${surfaceRevision}`;
      const result = appliedMaterial.current === materialKey ? null : await applyEventWindowMaterial(
        (material, radius, scheme, glassTint) => { const color = resolveWindowSurfaceColor(windowPreferences.appearance, scheme); return invoke('set_floating_window_material', {material, radius, scheme, glassTint, surfaceColor: [color.r / 255, color.g / 255, color.b / 255, color.a]}); }, windowPreferences.appearance.material, radius, scheme, windowPreferences.appearance.glassTint, windowPreferences.appearance.surfaceColor);
      appliedMaterial.current = materialKey;
      if (disposed) return;
      if (result?.backgroundBlur === 'failed') {
        const message = windowPreferences.appearance.material === 'glass'
          ? '玻璃效果未能启用，可切换纯色或透明。'
          : '玻璃效果未能关闭，请重新打开窗口后重试。';
        void emitTo('main', 'event-window:material-error', {message: `${EVENT_WINDOW_NAMES[kind]}：${message}`}).catch(() => {});
      }
      if (!disposed) firstMaterial.resolve();
    });
    return () => { disposed = true; };
  }, [preferencesReceived, windowPreferences.appearance.material, windowPreferences.appearance.radius, windowPreferences.appearance.glassTint, windowPreferences.appearance.surfaceColor, scheme, nativeScale, kind, surfaceRevision]);
  useEffect(() => {
    let disposed = false;
    let stop: (() => void) | undefined;
    void listen(`${kind}:locate`, () => { if (!disposed) positionHint.locate(); }).then(value => { if(disposed) value(); else stop = value; });
    return () => { disposed = true; stop?.(); };
  }, [kind, positionHint]);

  const applyThemeProjection = useCallback((projection: Parameters<typeof applyNativeThemeProjectionToWindowPreferences>[1]) => {
    setWindowPreferences(current => {
      const next = applyNativeThemeProjectionToWindowPreferences(current, projection);
      windowPreferencesRef.current = next;
      return next;
    });
  }, []);
  useEffect(() => {
    if (!windowThemes.ready) return;
    let disposed = false;
    let stop: (() => void) | undefined;
    void subscribeNativeThemeTarget(themeTargetId, "windows", applyThemeProjection).then(value => {
      if (disposed) value(); else stop = value;
    });
    return () => { disposed = true; stop?.(); };
  }, [themeTargetId, windowThemes.ready, applyThemeProjection]);
  const allowsMainEvent = (event: DanmakuEvent) => mainRenderRef.current
    ? compatibleEventDecisionOf(mainRenderRef.current, event) !== 'omit'
    : createNativeEventVisibilityPredicate(windowPreferencesRef.current.eventVisibility)(event);
  useEffect(() => {
    setEvents(current => {
      const next = current.filter(event => resolveOutputEventNeeds(event, { preferences: windowPreferencesRef.current, roomId: event.roomId, allowsMain: allowsMainEvent }).main);
      if (next.length === current.length) return current;
      eventsRef.current = next; return next;
    });
  }, [compatibleMainRender, windowPreferences]);
  const areaStyle = useEventAreaStyle({
    settings: windowPreferences.eventStyleSettings,
    layout: "window",
    fontSize: windowPreferences.fontSize,
    padding: windowPreferences.display.eventPadding,
    spacing: windowPreferences.display.eventSpacing,
  });
  const [giftEffectNotices, setGiftEffectNotices] = useState<GiftEffectNotice[]>([]);
  const [giftEffectRoomKey, setGiftEffectRoomKey] = useState(0);
  const readyRecordedRef = useRef(false);
  useEffect(() => {
    if (readyRecordedRef.current) return;
    readyRecordedRef.current = true;
    recordWindowDiagnostic({ windowLabel: kind, action: "open", outcome: "ready" });
    recordFeatureDiagnostic({ featureId: "floating-windows", stage: "success", action: `${kind}-ready`, outcome: "ready" });
  }, [kind]);
  const giftEffectResourcesRef = useRef<Map<string, GiftEffectResource>>(new Map());
  const [giftEffectResourceRevision, setGiftEffectResourceRevision] = useState(0);
  const receivedAtRef = useRef<WeakMap<EventWindowEvent, number>>(new WeakMap());
  const eventsRef = useRef<EventWindowEvent[]>([]);
  const [removingEvents, setRemovingEvents] = useState<Set<EventWindowEvent>>(() => new Set());
  const removingEventsRef = useRef<Set<EventWindowEvent>>(new Set());
  const removalTimersRef = useRef<Map<EventWindowEvent, ReturnType<typeof setTimeout>>>(new Map());
  const logRef = useRef<HTMLDivElement>(null);
  const [logNode, setLogNode] = useState<HTMLDivElement | null>(null);
  const reading = useRef<LocalFeedReadingState | null>(null);
  const attachLogNode = useCallback((node: HTMLDivElement | null) => { logRef.current = node; setLogNode(node); }, []);
  const geometryRef = useRef<WindowGeometry | null>(null);
  const geometryStoreRef = useRef<Store | null>(null);
  const geometrySaveQueueRef = useRef(Promise.resolve());
  const geometryReadyRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    windowPreferencesRef.current = windowPreferences;
  }, [windowPreferences]);

  const clearPendingRemovals = () => {
    removalTimersRef.current.forEach((timer) => clearTimeout(timer));
    removalTimersRef.current.clear();
    removingEventsRef.current.clear();
    setRemovingEvents(new Set());
  };

  const scheduleEventRemoval = (event: EventWindowEvent) => {
    if (removingEventsRef.current.has(event)) return;
    removingEventsRef.current.add(event);
    setRemovingEvents(new Set(removingEventsRef.current));
    const timer = setTimeout(() => {
      removalTimersRef.current.delete(event);
      removingEventsRef.current.delete(event);
      receivedAtRef.current.delete(event);
      setEvents(current => {
        const retained = current.filter(row => row !== event);
        eventsRef.current = retained;
        return retained;
      });
      setRemovingEvents(new Set(removingEventsRef.current));
    }, getEventAnimationExitDuration(
      windowPreferencesRef.current.display.eventAnimationPreset,
      windowPreferencesRef.current.display.eventAnimationDurationMs,
    ));
    removalTimersRef.current.set(event, timer);
  };

  const enqueueGeometrySave = (geometry: WindowGeometry | null): Promise<void> => {
    const store = geometryStoreRef.current;
    if (!store || !geometry) return Promise.resolve();
    const snapshot = { ...geometry };
    const next = geometrySaveQueueRef.current.then(() => writeWindowGeometry(store, snapshot));
    geometrySaveQueueRef.current = next.catch(() => {});
    return next;
  };

  const applyLock = useCallback((nextLocked: boolean) => {
    if (nextLocked) positionHint.clear();
    lockQueue.current = lockQueue.current.then(async () => {
      const currentWindow = getCurrentWindow();
      try {
        await currentWindow.setIgnoreCursorEvents(nextLocked);
        await currentWindow.setResizable(!nextLocked);
        setActualLocked(nextLocked);
        await emitTo("main", config.lockStateEvent, nextLocked);
        recordWindowDiagnostic({ windowLabel: kind, action: "lock", outcome: "applied" });
      } catch {
        const restored = await Promise.allSettled([currentWindow.setIgnoreCursorEvents(false), currentWindow.setResizable(true)]);
        const unlocked = restored.every(result => result.status === 'fulfilled');
        setActualLocked(unlocked ? false : null);
        void emitTo("main", config.lockStateEvent, false).catch(() => {});
        void emitTo('main', 'event-window:material-error', {message: `${EVENT_WINDOW_NAMES[kind]}：锁定状态未能更新，请重新打开窗口后重试。`}).catch(() => {});
        recordWindowDiagnostic({ windowLabel: kind, action: "lock", outcome: "failure" });
      }
    });
    return lockQueue.current;
  }, [config.lockStateEvent, kind, positionHint]);

  useEffect(() => {
    const currentWindow = getCurrentWindow();
    let disposed = false;
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    let closePromise: Promise<void> | undefined;
    let unlistenMoved: (() => void) | undefined;
    let unlistenResized: (() => void) | undefined;
    let unlistenScaleChanged: (() => void) | undefined;
    let unlistenClose: (() => void) | undefined;
    let monitorCheckTimer: ReturnType<typeof setTimeout> | undefined;
    let lastMonitorLayoutKey: string | null = null;

    const getMonitorLayoutKey = (monitor: Awaited<ReturnType<typeof currentMonitor>>): string | null => {
      if (!monitor) return null;
      const { position, size } = monitor.workArea;
      return `${position.x},${position.y},${size.width},${size.height},${monitor.scaleFactor}`;
    };

    const recordLayoutSnapshot = (
      changeReason: "scale-changed" | "monitor-changed",
      scaleEvent?: { scaleFactor: number; size: { width: number; height: number } },
    ) => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (disposed) return;
        void Promise.all([
          currentMonitor().catch(() => null),
          currentWindow.outerPosition().catch(() => null),
          currentWindow.innerSize().catch(() => null),
        ]).then(([monitor, position, size]) => {
          if (disposed) return;
          const list = logRef.current;
          const listRect = list?.getBoundingClientRect();
          const rows = list ? Array.from(list.querySelectorAll(".event-row")) : [];
          const visibleEventRows = listRect
            ? rows.filter((row) => {
                const rowRect = row.getBoundingClientRect();
                return rowRect.width > 0 && rowRect.height > 0
                  && rowRect.bottom > listRect.top && rowRect.top < listRect.bottom;
              }).length
            : 0;
          lastMonitorLayoutKey = getMonitorLayoutKey(monitor);
          try {
            getDiagnosticContext().record({
              subsystem: "window",
              action: "layout-changed",
              outcome: monitor && position && size ? "success" : "partial",
              windowLabel: kind,
              data: {
                changeReason,
                scaleFactor: scaleEvent?.scaleFactor ?? monitor?.scaleFactor ?? null,
                scaleEventWidth: scaleEvent?.size.width ?? null,
                scaleEventHeight: scaleEvent?.size.height ?? null,
                monitorScaleFactor: monitor?.scaleFactor ?? null,
                monitorWorkAreaX: monitor?.workArea.position.x ?? null,
                monitorWorkAreaY: monitor?.workArea.position.y ?? null,
                monitorWorkAreaWidth: monitor?.workArea.size.width ?? null,
                monitorWorkAreaHeight: monitor?.workArea.size.height ?? null,
                windowX: position?.x ?? null,
                windowY: position?.y ?? null,
                windowWidth: size?.width ?? null,
                windowHeight: size?.height ?? null,
                devicePixelRatio: window.devicePixelRatio,
                viewportWidth: window.innerWidth,
                viewportHeight: window.innerHeight,
                eventListPresent: Boolean(list),
                eventListClientHeight: list?.clientHeight ?? null,
                eventListScrollHeight: list?.scrollHeight ?? null,
                eventListScrollTop: list?.scrollTop ?? null,
                eventRows: rows.length,
                visibleEventRows,
                scrollDirection: windowPreferencesRef.current.scrollDirection,
              },
            });
          } catch {
            // 诊断记录失败不影响副窗口显示。
          }
        });
      }));
    };

    const scheduleSave = () => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        void enqueueGeometrySave(geometryRef.current);
      }, 180);
    };

    const restoreAndListen = async () => {
      recordWindowDiagnostic({ windowLabel: kind, action: "restore", outcome: "started" });
      let store: Store | null = null;
      try {
        store = await load(config.geometryStoreFile, { autoSave: false });
        geometryStoreRef.current = store;
      } catch {
        // 存储加载失败时仍允许窗口打开，但不保存几何。
        recordWindowDiagnostic({ windowLabel: kind, action: "restore", outcome: "failure", data: { reason: "storage-load" } });
      }
      const saved = store ? await readWindowGeometry(store, kind) : null;
      const restoreSaved = shouldRestoreWindowGeometry(kind, saved);
      geometryRef.current = restoreSaved ? saved : null;
      if (restoreSaved && saved) {
        await currentWindow.setSize(new PhysicalSize(saved.width, saved.height)).catch(() => {});
        await currentWindow.setPosition(new PhysicalPosition(saved.x, saved.y)).catch(() => {});
      }
      if (disposed) return;

      try {
        const [position, size] = await Promise.all([currentWindow.outerPosition(), currentWindow.innerSize()]);
        if (!disposed) {
          geometryRef.current = {
            x: position.x,
            y: position.y,
            width: size.width,
            height: size.height,
            ...(kind === "gift" ? { custom: saved?.custom === true } : {}),
          };
        }
      } catch {
        // 后续原生移动/缩放事件仍可建立记录。
      }
      if (disposed) return;
      try {
        lastMonitorLayoutKey = getMonitorLayoutKey(await currentMonitor());
      } catch {
        // 显示器信息不可用时仍正常监听窗口位置。
      }

      try {
        const stop = await currentWindow.onMoved(({ payload: position }) => {
          const current = geometryRef.current;
          if (!current) return;
          geometryRef.current = {
            ...current,
            x: position.x,
            y: position.y,
            ...(kind === "gift" ? { custom: true } : {}),
          };
          scheduleSave();
          recordWindowDiagnostic({ windowLabel: kind, action: "layout", outcome: "moved", data: { x: position.x, y: position.y } });
          if (monitorCheckTimer) clearTimeout(monitorCheckTimer);
          monitorCheckTimer = setTimeout(() => {
            void currentMonitor().then((monitor) => {
              const nextMonitorLayoutKey = getMonitorLayoutKey(monitor);
              if (!nextMonitorLayoutKey) return;
              const changed = lastMonitorLayoutKey !== null
                && lastMonitorLayoutKey !== nextMonitorLayoutKey;
              lastMonitorLayoutKey = nextMonitorLayoutKey;
              if (changed) recordLayoutSnapshot("monitor-changed");
            }).catch(() => {});
          }, 240);
        });
        if (disposed) stop();
        else unlistenMoved = stop;
      } catch {
        // 移动事件不可用时仍保留缩放保存能力。
      }
      try {
        const stop = await currentWindow.onResized(({ payload: size }) => {
          const current = geometryRef.current;
          if (!current) return;
          geometryRef.current = {
            ...current,
            width: size.width,
            height: size.height,
            ...(kind === "gift" ? { custom: true } : {}),
          };
          scheduleSave();
          recordWindowDiagnostic({ windowLabel: kind, action: "layout", outcome: "resized", data: { width: size.width, height: size.height } });
        });
        if (disposed) stop();
        else unlistenResized = stop;
      } catch {
        // 缩放事件不可用时不影响窗口本身。
      }
      try {
        const stop = await currentWindow.onScaleChanged(({ payload }) => {
          setNativeScale(payload.scaleFactor);
          recordLayoutSnapshot("scale-changed", payload);
        });
        if (disposed) stop();
        else unlistenScaleChanged = stop;
      } catch {
        // 缩放诊断不可用时不影响窗口本身。
      }
      try {
        const stop = await currentWindow.onCloseRequested(async (event) => {
          event.preventDefault();
          closePromise ??= (async () => {
            if (saveTimer) clearTimeout(saveTimer);
            const save = enqueueGeometrySave(geometryRef.current);
            await save
              .then(() => recordWindowDiagnostic({ windowLabel: kind, action: "close", outcome: "saved" }))
              .catch(() => recordWindowDiagnostic({ windowLabel: kind, action: "close", outcome: "failure" }));
            await drainWindowDiagnosticSubmissions();
            await currentWindow.destroy();
          })().catch((error) => { closePromise = undefined; throw error; });
          await closePromise;
        });
        if (disposed) stop();
        else unlistenClose = stop;
      } catch {
        // 卸载阶段仍会保存最后已知几何。
      }

    };

    geometryReadyRef.current = Promise.all([
      currentWindow.setAlwaysOnTop(true).catch(() => {}),
      currentWindow.setMaximizable(false).catch(() => {}),
      invoke("install_floating_window_snap").catch(() => {}),
    ]).then(restoreAndListen).catch((error) => {
      recordWindowDiagnostic({ windowLabel: kind, action: "open", outcome: "failure", data: { reason: 'restore', error: String(error) } });
    });

    return () => {
      disposed = true;
      if (saveTimer) clearTimeout(saveTimer);
      unlistenMoved?.();
      unlistenResized?.();
      unlistenScaleChanged?.();
      unlistenClose?.();
      if (monitorCheckTimer) clearTimeout(monitorCheckTimer);
      void enqueueGeometrySave(geometryRef.current);
    };
  }, [config.geometryStoreFile]);

  useEffect(() => {
    const currentWindow = getCurrentWindow();
    let cancelled = false;
    let unlistenEvents: (() => void) | undefined;
    let unlistenRoomChanged: (() => void) | undefined;
    let unlistenReadyRequest: (() => void) | undefined;
    let unlistenReadyAck: (() => void) | undefined;
    let unlistenLock: (() => void) | undefined;
    let unlistenPreferences: (() => void) | undefined;
    let unlistenResetGeometry: (() => void) | undefined;
    let unlistenGiftEffect: (() => void) | undefined;
    let unlistenSticky: (() => void) | undefined;
    let readyRetryTimer: ReturnType<typeof setInterval> | undefined;
    let handshakeReady = false;
    let readyAcknowledged = false;
    let activeRoomState: EventWindowRoomStatePayload = { roomId: null, generation: 0 };

    const applyRoomState = (next: EventWindowRoomStatePayload): void => {
      const changed = activeRoomState.roomId !== next.roomId || activeRoomState.generation !== next.generation;
      activeRoomState = next;
      setActiveRoomId(next.roomId);
      setRoomGuardProfile(next.roomGuardProfile?.roomId === next.roomId ? next.roomGuardProfile : undefined);
      if (!changed) {
        if (next.roomGuardProfile && next.roomId !== null && next.roomGuardProfile.roomId === next.roomId) {
          setStickyEvents(current => applyRoomGuardProfileToEvents(current, next.roomId!, next.roomGuardProfile!));
          setEvents((current) => {
            const updated = applyRoomGuardProfileToEvents(current, next.roomId!, next.roomGuardProfile!);
            const result = updated.map((event, index) => {
              const previous = current[index];
              if (removingEventsRef.current.has(previous)) return previous;
              const receivedAt = receivedAtRef.current.get(previous);
              if (receivedAt !== undefined) receivedAtRef.current.set(event, receivedAt);
              return event;
            });
            eventsRef.current = result;
            return result;
          });
        }
        return;
      }
      clearPendingRemovals();
      setStickyRoomKey(current => current + 1);
      setStickyEvents([]);
      receivedAtRef.current = new WeakMap();
      eventsRef.current = [];
      setEvents([]);
      if (hasGiftEffects) {
        giftEffectResourcesRef.current.clear();
        setGiftEffectNotices([]);
        setGiftEffectRoomKey((current) => current + 1);
      }
      recordWindowDiagnostic({ windowLabel: kind, action: "reload", outcome: "room-changed", data: { roomId: next.roomId, generation: next.generation } });
    };

    const sendReady = (force = false) => {
      if (cancelled || !handshakeReady) return;
      if (force) readyAcknowledged = false;
      if (readyAcknowledged) return;
      void emitTo("main", config.readyEvent, activeRoomState).catch(() => {});
    };

    const startReadyRetry = () => {
      if (cancelled || !handshakeReady || readyRetryTimer) return;
      readyRetryTimer = setInterval(() => sendReady(), 500);
    };

    const receiveEvent = (event: { payload: EventWindowEvent }) => {
      if (cancelled) return;
      if (!isEventWindowEventForRoom(event.payload, activeRoomState.roomId, activeRoomState.generation)) return;
      if (!acceptsCategory(event.payload)) return;
      const receivedAt = Date.now();
      const profile = activeRoomState.roomGuardProfile;
      const payload = profile && profile.roomId === activeRoomState.roomId
        ? applyRoomGuardProfileToEvents([event.payload], activeRoomState.roomId!, profile)[0]
        : event.payload;
      setStickyNow(receivedAt);
      setStickyEvents(current => updateStickyEvents(current, payload, windowPreferencesRef.current.stickyEvents, receivedAt));
      setEvents((current) => {
        const preferences = windowPreferencesRef.current;
        const needs = resolveOutputEventNeeds(payload, { preferences, roomId: payload.roomId, allowsMain: allowsMainEvent });
        if (!needs.main && payload.msgType !== MsgType.ScDeleted && payload.msgType !== MsgType.AnchorLotAward && payload.msgType !== MsgType.RedPocketWinner) return current;
        const active = current.filter(row => !removingEventsRef.current.has(row));
        const appended = !mainRenderRef.current && isGiftWindowEvent(payload)
          ? appendGiftWindowEvent(active, payload, Number.MAX_SAFE_INTEGER, true)
          : config.appendEvent(active, payload, { ...preferences, capacity: Number.MAX_SAFE_INTEGER });
        const next = appended.filter(row => resolveOutputEventNeeds(row, { preferences, roomId: row.roomId, allowsMain: allowsMainEvent }).main);
        const retained = next.slice(-preferences.capacity);
        next.slice(0, Math.max(0, next.length - preferences.capacity)).forEach(scheduleEventRemoval);
        const retainedKeys = new Set(retained.map(row => row.reactKey ?? row.id));
        const exiting = current.filter(row => removingEventsRef.current.has(row) && !retainedKeys.has(row.reactKey ?? row.id)
          && resolveOutputEventNeeds(row, { preferences, roomId: row.roomId, allowsMain: allowsMainEvent }).main);
        const bounded = [...exiting, ...retained];
        if (bounded !== current) {
          eventsRef.current = bounded;
          const previousTimes = new Map(current.map(row => [row.dedupe ?? row.comboId ?? row.id, receivedAtRef.current.get(row)]));
          bounded.forEach(row => {
            const previousTime = previousTimes.get(row.dedupe ?? row.comboId ?? row.id);
            if (previousTime !== undefined) receivedAtRef.current.set(row, previousTime);
          });
          receivedAtRef.current.set(payload, receivedAt);
        }
        return bounded;
      });

    };

    const setupBridge = async () => {
      try {
        const [stopEvents, stopRoomChanged, stopReadyRequest, stopReadyAck, stopLock, stopPreferences, stopResetGeometry, stopGiftEffect] = await Promise.all([
          listen<EventWindowEvent | EventWindowEvent[]>(config.eventName, (batch) => {
            for (const payload of Array.isArray(batch.payload) ? batch.payload : [batch.payload]) {
              receiveEvent({ payload });
            }
          }),
          listen<EventWindowRoomStatePayload>(config.roomChangedEvent, (event) => {
            if (cancelled) return;
            if (!isEventWindowRoomStatePayload(event.payload)) return;
            if (!acceptsEventWindowRoomState(activeRoomState, event.payload)) return;
            applyRoomState(event.payload);
            sendReady(true);
            startReadyRetry();
          }),
          listen<EventWindowRoomStatePayload>(config.readyRequestEvent, (event) => {
            if (cancelled) return;
            if (!isEventWindowRoomStatePayload(event.payload)) return;
            if (!acceptsEventWindowRoomState(activeRoomState, event.payload)) return;
            applyRoomState(event.payload);
            // 主窗口在副窗口重载、桥接失败或握手竞态后可以重复请求 ready。
            sendReady(true);
            startReadyRetry();
          }),
          listen<EventWindowRoomStatePayload | undefined>(config.readyAckEvent, async (event) => {
            if (isRevenue && (!isEventWindowRoomStatePayload(event.payload)
              || event.payload.generation !== activeRoomState.generation
              || event.payload.roomId !== activeRoomState.roomId)) return;
            await firstMaterial.promise;
            await materialQueue.current;
            await lockQueue.current;
            if (cancelled) return;
            await currentWindow.show().catch(() => {});
            readyAcknowledged = true;
            if (readyRetryTimer) {
              clearInterval(readyRetryTimer);
              readyRetryTimer = undefined;
            }
          }),
          listen<boolean>(config.lockEvent, (event) => {
            if (cancelled) return;
            void applyLock(Boolean(event.payload));
          }),
          listen<EventWindowPreferences>(EVENT_WINDOW_PREFERENCES_EVENT, (event) => {
            if (cancelled) return;
            setWindowPreferences(applyEventWindowPreferences(windowPreferencesRef, event.payload));
            setPreferencesReceived(true);
            setEvents(current => {
              const eligible = current.filter(row => resolveOutputEventNeeds(row, { preferences: windowPreferencesRef.current, roomId: row.roomId, allowsMain: allowsMainEvent }).main);
              const active = eligible.filter(row => !removingEventsRef.current.has(row));
              active.slice(0, Math.max(0, active.length - windowPreferencesRef.current.capacity)).forEach(scheduleEventRemoval);
              const bounded = [...eligible.filter(row => removingEventsRef.current.has(row)), ...active.slice(-windowPreferencesRef.current.capacity)];
              eventsRef.current = bounded;
              return bounded;
            });
            if (!windowPreferencesRef.current.stickyEvents.enabled) setStickyEvents([]);
            recordWindowDiagnostic({ windowLabel: kind, action: 'sticky', outcome: windowPreferencesRef.current.stickyEvents.enabled ? 'enabled' : 'disabled' });
          }),
          listen<WindowPlacement>(config.resetGeometryEvent, async (event) => {
            await geometryReadyRef.current;
            if (cancelled) return;
            const placement = event.payload;
            geometryRef.current = {
              x: placement.x,
              y: placement.y,
              width: placement.width,
              height: placement.height,
              ...(kind === "gift" ? { custom: false } : {}),
            };
            try {
              await currentWindow.setSize(new PhysicalSize(placement.width, placement.height));
              await currentWindow.setPosition(new PhysicalPosition(placement.x, placement.y));
            } catch (error) {
              recordWindowDiagnostic({ windowLabel: kind, action: 'layout', outcome: 'failure', data: { reason: 'reset', error: String(error) } });
            }
            const [position,size] = await Promise.all([currentWindow.outerPosition(),currentWindow.innerSize()]);
            geometryRef.current = { ...position,...size,...(kind === 'gift' ? {custom:false} : {}) };
            recordWindowDiagnostic({ windowLabel: kind, action: 'layout', outcome: 'measured', data: { ...geometryRef.current } });
            await enqueueGeometrySave(geometryRef.current);
          }),
          hasGiftEffects
            ? listen<GiftEffectNotice>(revenueWindowChannels(kind as RevenueWindowLabel).effectEvent, (event) => {
              if (cancelled) return;
              if (!isEventWindowEventForRoom(event.payload.event, activeRoomState.roomId, activeRoomState.generation)) return;
              giftEffectResourcesRef.current.set(giftEffectEventKey(event.payload.event), event.payload.resource);
              setGiftEffectResourceRevision(current => current + 1);
              setGiftEffectNotices((current) => [...current, event.payload].slice(-64));
            })
            : Promise.resolve<() => void>(() => {}),
        ]);
        const stopSticky = await listen<EventWindowRoomStatePayload & { events: DanmakuEvent[] }>(STICKY_SNAPSHOT_EVENT, ({ payload }) => {
          if (cancelled || payload.roomId !== activeRoomState.roomId || payload.generation !== activeRoomState.generation) return;
          const now = Date.now();
          const profile = activeRoomState.roomGuardProfile;
          const incoming = profile && profile.roomId === payload.roomId ? applyRoomGuardProfileToEvents(payload.events,payload.roomId!,profile) : payload.events;
          setStickyEvents(windowPreferencesRef.current.stickyEvents.enabled ? incoming.filter(acceptsCategory) : []);
          setStickyNow(now);
          recordWindowDiagnostic({ windowLabel: kind, action: 'sticky', outcome: 'restored', data: { candidates: incoming.length } });
        });
        await geometryReadyRef.current;
        if (cancelled) {
          stopEvents();
          stopRoomChanged();
          stopReadyRequest();
          stopReadyAck();
          stopLock();
          stopPreferences();
          stopResetGeometry();
          stopGiftEffect();
          stopSticky();
          return;
        }
        unlistenEvents = stopEvents;
        unlistenRoomChanged = stopRoomChanged;
        unlistenReadyRequest = stopReadyRequest;
        unlistenReadyAck = stopReadyAck;
        unlistenLock = stopLock;
        unlistenPreferences = stopPreferences;
        unlistenResetGeometry = stopResetGeometry;
        unlistenGiftEffect = stopGiftEffect;
        unlistenSticky = stopSticky;
        handshakeReady = true;
        startReadyRetry();
        sendReady();
      } catch (error) {
        recordWindowDiagnostic({ windowLabel: kind, action: "bridge", outcome: "failure" });
        try {
          getDiagnosticContext().record({
            subsystem: "window",
            action: "bridge-setup",
            outcome: "failure",
            windowLabel: kind,
            data: { reason: error instanceof Error ? error.message : "listen-failed" },
          });
        } catch {
          // 诊断失败不能改变副窗口生命周期。
        }
        // 桥接监听失败时由主窗口生命周期清理原生窗口。
      }
    };
    void setupBridge();

    return () => {
      cancelled = true;
      unlistenEvents?.();
      unlistenRoomChanged?.();
      unlistenReadyRequest?.();
      unlistenReadyAck?.();
      unlistenLock?.();
      unlistenPreferences?.();
      unlistenResetGeometry?.();
      unlistenGiftEffect?.();
      unlistenSticky?.();
      if (readyRetryTimer) clearInterval(readyRetryTimer);
      clearPendingRemovals();
      receivedAtRef.current = new WeakMap();
      eventsRef.current = [];
      giftEffectResourcesRef.current.clear();
      setEvents([]);
      setStickyEvents([]);
      setGiftEffectNotices([]);
      recordWindowDiagnostic({ windowLabel: kind, action: "destroy", outcome: "unmounted" });
    };
  }, [applyLock, config.appendEvent, config.eventName, config.lockEvent, config.readyAckEvent, config.readyEvent, config.readyRequestEvent, config.resetGeometryEvent, config.roomChangedEvent, kind]);

  useEffect(() => () => clearPendingRemovals(), []);

  useEffect(() => {
    if (!windowPreferences.stickyEvents.enabled || stickyEvents.length === 0) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setStickyNow(now);
      setStickyEvents(current => {
        const retained = current.filter(event => {
          const card = stickyCandidate(event, windowPreferences.stickyEvents);
          return card !== null && card.expiresAt > now;
        });
        if (retained.length < current.length) recordWindowDiagnostic({ windowLabel: kind, action: 'sticky', outcome: 'expired', data: { removed: current.length-retained.length } });
        return retained.length === current.length ? current : retained;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [windowPreferences.stickyEvents, stickyEvents.length, kind]);

  useEffect(() => {
    if (!windowPreferences.eventExpiry.enabled) return;
    const prune = () => {
      const now = Date.now();
      const current = eventsRef.current;
      const timed = current.map((event) => ({
        event,
        receivedAt: receivedAtRef.current.get(event) ?? now,
      }));
      const retained = pruneExpiredEvents(timed, now, windowPreferences.eventExpiry);
      if (retained.length === current.length) return;
      const retainedEvents = new Set(retained.map(({ event }) => event));
      current.forEach((event) => {
        if (!retainedEvents.has(event)) scheduleEventRemoval(event);
      });
    };
    prune();
    const timer = setInterval(prune, 500);
    return () => clearInterval(timer);
  }, [windowPreferences.eventExpiry]);

  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    return observeRenderedEventRows(log, { windowLabel: kind, region: kind });
  }, [kind]);

  const audienceEvents = useMemo(() => events.filter(event => isAllowedByAudienceFilters(event, windowPreferences.audienceFilters, activeRoomId)), [events, windowPreferences.audienceFilters, activeRoomId]);
  const displayEvents = useMemo(() => isRevenue ? audienceEvents : projectDisplayEvents(audienceEvents, {
    capacity: windowPreferences.capacity + removingEvents.size,
    mergeSameDanmu: false,
    sameDanmuWindowSeconds: windowPreferences.sameDanmuWindowSeconds,
    showAutoDanmaku: windowPreferences.display.showAutoDanmaku,
    showPhoneNotVerified: windowPreferences.display.showPhoneNotVerified,
  }), [audienceEvents, removingEvents.size, isRevenue, windowPreferences.capacity, windowPreferences.mergeSameDanmu, windowPreferences.sameDanmuWindowSeconds, windowPreferences.display.showAutoDanmaku, windowPreferences.display.showPhoneNotVerified]);
  const visibleEvents = displayEvents.filter((event) => (isRevenue
      ? isGiftWindowEventVisible(event, windowPreferences.giftThreshold, windowPreferences.giftThresholdMode, windowPreferences.display.onlyGuardEntry)
      : isDisplayWindowEventVisible(event, windowPreferences.displayFilters, windowPreferences.display.showPhoneNotVerified)
        && isAllowedByOnlyGuardEntry(event, windowPreferences.display.onlyGuardEntry)));
  const orderedVisibleEvents = windowPreferences.scrollDirection === "top" ? [...visibleEvents].reverse() : visibleEvents;
  const eventListAlignment = getFeedStackAlignment(windowPreferences.scrollDirection, windowPreferences.contentAlignment);
  const stickyCards = selectStickyEvents(stickyEvents.filter(event => isAllowedByAudienceFilters(event, windowPreferences.audienceFilters, activeRoomId)), windowPreferences.stickyEvents, stickyNow);
  const sourcePlan = planCompatibleListPresentation(compatibleMainRender, orderedVisibleEvents, windowPreferences.stickyEvents.enabled);
  const sourceListSurface = sourcePlan.surface;
  const stickyArea = sourcePlan.renderSoftwareSticky ? <div className={publicWindowAreaClass(kind)} data-style-api="1">
    <div className="sticky-area" onWheel={scrollSticky} data-event-style-scope={areaStyle.scope} data-position={windowPreferences.stickyEvents.position} aria-label={uiText("uiControls.sticky")}>
      <AnimatePresence key={stickyRoomKey}>
        {stickyCards.map(card => <StickyEventCard key={stickyEventKey(card.event)} card={card} now={stickyNow} position={windowPreferences.stickyEvents.position} display={windowPreferences.display} eventStyleSettings={windowPreferences.eventStyleSettings} compatibleEventRender={compatibleStickyRender} />)}
      </AnimatePresence>
    </div>
  </div> : null;
  const resolveGiftEffect = useCallback((event: DanmakuEvent) => {
    if (!hasGiftEffects) return null;
    return giftEffectResourcesRef.current.get(giftEffectEventKey(event)) ?? null;
  }, [kind, giftEffectResourceRevision]);
  const onPlayGiftEffect = useCallback((event: DanmakuEvent) => {
    if (!hasGiftEffects) return;
    const resource = giftEffectResourcesRef.current.get(giftEffectEventKey(event));
    if (!resource) return;
    const notice: GiftEffectNotice = { event, resource, manual: true };
    setGiftEffectNotices((current) => [...current, notice].slice(-64));
    void emitTo("main", GIFT_EFFECT_MANUAL_EVENT, notice).catch(() => {});
  }, [kind]);
  const pendingExternalHtml = blivechatThemeRuntime.resolvePendingExternal({ target: "windows", targetId: windowThemes.mode === "separate" ? `windows:${kind}` : "windows", placement: "main", roomId: activeRoomId });
  const activeExternalHtml = compatibleExternalHtmlOf(compatibleMainRender);
  const sourceScrollNode = useCompatibleFeedNode(logNode, Boolean(sourceListSurface) && !activeExternalHtml);
  useLocalFeedReading(logNode, windowPreferences.scrollDirection, !sourceListSurface && !activeExternalHtml, stickyRoomKey, undefined, reading);
  useLocalFeedReading(sourceScrollNode, windowPreferences.scrollDirection, Boolean(sourceListSurface) && !activeExternalHtml, stickyRoomKey, orderedVisibleEvents.map(event => event.reactKey ?? event.id), reading);
  const compatibleSurface = compatibleRendererSurface(compatibleMainRender);
  const sourceFallback = (event: DanmakuEvent) => <EventRowSlot className="event-row-slot"><EventRow animateOnMount={false} ev={event} liveLayout userNicknames={windowPreferences.userNicknames} showTime={windowPreferences.display.showTimestamp === true} maskUsername={windowPreferences.display.maskUsername === true} displayPreferences={windowPreferences.display} eventStyleSettings={windowPreferences.eventStyleSettings} eventFontSize={windowPreferences.fontSize} giftEffectResolver={hasGiftEffects ? resolveGiftEffect : undefined} onPlayGiftEffect={hasGiftEffects ? onPlayGiftEffect : undefined} /></EventRowSlot>;
  const eventRows = sourceListSurface ? <BlivechatSourceSurface roomGuardProfile={roomGuardProfile} userNicknames={windowPreferences.userNicknames} descriptor={sourceListSurface} initialScrollState={reading.current?.direction === windowPreferences.scrollDirection && reading.current.resetKey === stickyRoomKey ? { followingLatest: reading.current.following, scrollTop: reading.current.scrollTop, anchorId: reading.current.anchorId, anchorOffset: reading.current.offset } : undefined} events={orderedVisibleEvents} scale={windowPreferences.displayScale} tickerEnabled={sourcePlan.sourceTickerEnabled} stickyItems={stickyCards.map(card => ({ event: card.event, startedAt: card.startedAt, expiresAt: card.expiresAt }))} tickerPosition={windowPreferences.stickyEvents.position} direction={windowPreferences.scrollDirection} contentAlignment={windowPreferences.contentAlignment} removingEventIds={new Set([...removingEvents].map(event => event.reactKey ?? event.id))} animation={{ preset: windowPreferences.display.eventAnimationPreset, durationMs: getEventAnimationExitDuration(windowPreferences.display.eventAnimationPreset, windowPreferences.display.eventAnimationDurationMs) }} fallbackRenderer={sourceFallback} fallbackStyle={{ scope: areaStyle.scope, css: areaStyle.css }} dispatch={(eventId, action) => {
    const event = orderedVisibleEvents.find(value => (value.reactKey ?? value.id) === eventId);
    return event ? dispatchCompatibleLiveAction(event, action, { onGiftEffect: hasGiftEffects ? onPlayGiftEffect : undefined, onOpenLink: (_value, href) => { void openUrl(href).catch(() => {}); } }) : false;
  }} /> : orderedVisibleEvents.map((event, index) => (
    <EventRowSlot key={event.reactKey ?? event.id} data-event-id={event.reactKey ?? event.id} data-event-msg-type={event.msgType} data-event-session-id={event.__renderDiagnostic?.sessionId} data-event-connection-id={event.__renderDiagnostic?.connectionId} data-event-room-id={event.roomId} data-event-style-type={getEventStyleType(event.msgType, event.guard?.level ?? event.user?.guardLevel)} data-event-animation-preset={windowPreferences.display.eventAnimationPreset} data-event-animation-duration={getEventAnimationDuration(windowPreferences.display.eventAnimationPreset, windowPreferences.display.eventAnimationDurationMs)} data-event-animation-exit-duration={getEventAnimationExitDuration(windowPreferences.display.eventAnimationPreset, windowPreferences.display.eventAnimationDurationMs)} data-event-padding={windowPreferences.display.eventPadding} data-event-font-family={windowPreferences.eventStyleSettings.fontFamily} className={`event-row-slot ${removingEvents.has(event) ? "display-window-event-removing" : ""}`} showEventSpacing={index < orderedVisibleEvents.length - 1}>
      <CompatibleEventRenderer event={event} render={compatibleMainRender} dispatch={(eventId, action) => (event.reactKey ?? event.id) === eventId && dispatchCompatibleLiveAction(event, action, { onGiftEffect: hasGiftEffects ? onPlayGiftEffect : undefined, onOpenLink: (_value, href) => { void openUrl(href).catch(() => {}); } })} fallback={<EventRow ev={event} liveLayout userNicknames={windowPreferences.userNicknames} showTime={windowPreferences.display.showTimestamp === true} maskUsername={windowPreferences.display.maskUsername === true} displayPreferences={windowPreferences.display} eventStyleSettings={windowPreferences.eventStyleSettings} eventFontSize={windowPreferences.fontSize} giftEffectResolver={hasGiftEffects ? resolveGiftEffect : undefined} onPlayGiftEffect={hasGiftEffects ? onPlayGiftEffect : undefined} />} />
    </EventRowSlot>
  ));

  return (
    <main
      data-native-runtime-target={themeTargetId}
      data-material={windowPreferences.appearance.material}
      data-surface-scheme={scheme}
      data-lock-state={actualLocked === null ? 'pending' : actualLocked ? 'locked' : 'unlocked'}
      className={`${config.windowClass} relative isolate flex h-full min-h-0 flex-col overflow-hidden font-ui text-t1`}
      style={{
        "--display-window-opacity": `${Math.round(resolveWindowSurfaceOpacity(windowPreferences.appearance) * 100)}%`,
        "--display-window-surface": rgbaToCss(resolveWindowSurfaceColor(windowPreferences.appearance, scheme)),
        "--display-window-radius": `${windowPreferences.appearance.radius}px`,
        borderRadius: windowPreferences.appearance.material === 'transparent' ? 0 : `${windowPreferences.appearance.radius}px`,
      } as CSSProperties}
    >
      <EventWindowPositionHint name={EVENT_WINDOW_NAMES[kind]} visible={shouldShowWindowPositionHint(windowPreferences.appearance.material, actualLocked, locating)} adjustable={actualLocked === false} />
      <div
        className={config.dragClass}
        data-tauri-drag-region
        aria-hidden="true"
        onMouseDown={(event) => {
          if (event.button !== 0) return;
          void getCurrentWindow().startDragging().catch(() => {});
        }}
      />
      {config.resizeHandles.map(({ className, direction }) => (
        <div
          key={direction}
          className={`${config.resizeClass} ${className}`}
          aria-hidden="true"
          onMouseDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            void getCurrentWindow().startResizeDragging(direction).catch(() => {});
          }}
        />
      ))}
      {windowPreferences.stickyEvents.position === 'top' && stickyArea}
      <div
        role="log"
        data-sticky-position={windowPreferences.stickyEvents.position}
        aria-label={config.label}
        aria-live="polite"
        ref={attachLogNode}
        tabIndex={0}
        onMouseDown={event => { if (event.button === 0) void getCurrentWindow().startDragging().catch(() => {}); }}
        data-event-style-scope={areaStyle.scope}
        data-style-api="1"
        data-blivechat-scope={compatibleSurface?.scopeId}
        style={compatibleSurface?.surfaceStyle}
        className={`${publicWindowAreaClass(kind)} ${config.logClass} min-h-0 flex-1 cursor-default select-none overflow-y-auto overscroll-contain`}
      >
        {areaStyle.style}
        <div className={`event-list ${config.eventListClass} feed-event-list-align-${eventListAlignment}${sourceListSurface && !activeExternalHtml && !pendingExternalHtml ? " compatible-event-list" : ""}`}>
          {activeExternalHtml || pendingExternalHtml ? <BlivechatExternalHtmlTarget active={activeExternalHtml} candidate={pendingExternalHtml} events={orderedVisibleEvents} fallback={eventRows} onCandidateReady={() => { void blivechatThemeRuntime.markPendingExternalReady(windowThemes.mode === "separate" ? `windows:${kind}` : "windows"); }} /> : eventRows}
        </div>
      </div>
      {windowPreferences.stickyEvents.position === 'bottom' && stickyArea}
      {hasGiftEffects && (
        <GiftEffectOverlay
          enabled={windowPreferences.showGiftEffect}
          guardEnabled={windowPreferences.showGuardEffect ?? false}
          notices={giftEffectNotices}
          roomKey={giftEffectRoomKey}
        />
      )}
    </main>
  );
}
