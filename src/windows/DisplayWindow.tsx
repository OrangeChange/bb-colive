import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";
import { useCallback, useEffect, useRef, useState } from "react";
import { emitTo, listen } from "@tauri-apps/api/event";
import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { load, type Store } from "../appData.ts";
import { EventRow } from "../components/EventRow";
import { EventRowSlot } from "../components/EventRowSlot";
import {
  DEFAULT_EVENT_WINDOW_PREFERENCES,
  EVENT_WINDOW_PREFERENCES_EVENT,
  applyNativeThemeProjectionToWindowPreferences,
  applyEventWindowBehaviorPreferences,
  type EventWindowPreferences,
} from "./eventWindowPreferences";
import {
  DISPLAY_EVENT_NAME,
  DISPLAY_LOCK_EVENT,
  DISPLAY_LOCK_STATE_EVENT,
  DISPLAY_ROOM_CHANGED_EVENT,
  DISPLAY_READY_EVENT,
} from "./eventWindowChannels";
import { appendDisplayEvent } from "./displayWindowModel";
import { observeRenderedEventRows } from "../diagnostics/renderLogger";
import { recordFeatureDiagnostic } from "../diagnostics/featureDiagnostics.ts";
import type { EventWindowEvent } from "./eventWindowDiagnostics";
import { getEventStyleType } from "../eventStyleSettings";
import { getEventAnimationDuration, getEventAnimationExitDuration } from "../eventDisplaySettings";
import { recordWindowDiagnostic } from "./windowDiagnostics";
import { subscribeNativeThemeTarget } from "../themes/nativeThemeRuntime.ts";

// 使用插件存储保存内容区尺寸，避免独立 WebView 的 localStorage 不共享。
// innerSize 与 setSize 的口径一致，避免把 outerSize（包含窗口边框）再次作为内容区尺寸。
const DISPLAY_GEOMETRY_STORE_FILE = "display-window.local.json";
const DISPLAY_GEOMETRY_KEY = "geometry";
const DISPLAY_MIN_WIDTH = 320;
const DISPLAY_MIN_HEIGHT = 320;

type DisplayGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const RESIZE_HANDLES = [
  { className: "display-window-resize-northwest", direction: "NorthWest" },
  { className: "display-window-resize-northeast", direction: "NorthEast" },
  { className: "display-window-resize-southwest", direction: "SouthWest" },
  { className: "display-window-resize-southeast", direction: "SouthEast" },
] as const;

function isDisplayGeometry(value: unknown): value is DisplayGeometry {
  if (typeof value !== "object" || value === null) return false;
  const { x, y, width, height } = value as Partial<DisplayGeometry>;
  return (
    typeof x === "number" &&
    typeof y === "number" &&
    typeof width === "number" &&
    typeof height === "number" &&
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width >= DISPLAY_MIN_WIDTH &&
    height >= DISPLAY_MIN_HEIGHT
  );
}

async function readDisplayGeometry(store: Store): Promise<DisplayGeometry | null> {
  try {
    const value = await store.get<DisplayGeometry>(DISPLAY_GEOMETRY_KEY);
    if (!isDisplayGeometry(value)) return null;
    const { x, y, width, height } = value;
    return {
      x,
      y,
      width,
      height,
    };
  } catch {
    return null;
  }
}

async function writeDisplayGeometry(store: Store, geometry: DisplayGeometry | null): Promise<void> {
  if (!geometry) return;
  try {
    await store.set(DISPLAY_GEOMETRY_KEY, geometry);
    await store.save();
  } catch {
    // 插件存储不可用时不影响弹幕窗本身。
  }
}

export function DisplayWindow() {
  useUiLanguage();
  const [events, setEvents] = useState<EventWindowEvent[]>([]);
  const [windowPreferences, setWindowPreferences] = useState<EventWindowPreferences>(DEFAULT_EVENT_WINDOW_PREFERENCES);
  const applyThemeProjection = useCallback((projection: Parameters<typeof applyNativeThemeProjectionToWindowPreferences>[1]) => {
    setWindowPreferences(current => applyNativeThemeProjectionToWindowPreferences(current, projection));
  }, []);
  useEffect(() => { let stop: (() => void) | undefined; void subscribeNativeThemeTarget("windows", "windows", applyThemeProjection).then(value => { stop = value; }); return () => stop?.(); }, [applyThemeProjection]);
  const logRef = useRef<HTMLDivElement>(null);
  const geometryRef = useRef<DisplayGeometry | null>(null);
  const geometryStoreRef = useRef<Store | null>(null);
  const geometrySaveQueueRef = useRef(Promise.resolve());
  useEffect(() => {
    recordWindowDiagnostic({ windowLabel: "display", action: "open", outcome: "ready" });
    recordFeatureDiagnostic({ featureId: "floating-windows", stage: "success", action: "display-ready", outcome: "ready" });
  }, []);

  const enqueueGeometrySave = (geometry: DisplayGeometry | null): Promise<void> => {
    const store = geometryStoreRef.current;
    if (!store || !geometry) return Promise.resolve();
    const snapshot = { ...geometry };
    const next = geometrySaveQueueRef.current.then(() => writeDisplayGeometry(store, snapshot));
    geometrySaveQueueRef.current = next.catch(() => {});
    return next;
  };

  const applyLock = useCallback(async (nextLocked: boolean) => {
    const currentWindow = getCurrentWindow();
    try {
      await currentWindow.setIgnoreCursorEvents(nextLocked);
      try {
        await currentWindow.setResizable(!nextLocked);
      } catch (error) {
        await currentWindow.setIgnoreCursorEvents(false).catch(() => {});
        throw error;
      }
      void emitTo("main", DISPLAY_LOCK_STATE_EVENT, nextLocked).catch(() => {});
      recordWindowDiagnostic({ windowLabel: "display", action: "lock", outcome: "applied" });
    } catch {
      // 原生能力失败时回滚到可操作状态，避免窗口意外永久穿透。
      await currentWindow.setIgnoreCursorEvents(false).catch(() => {});
      await currentWindow.setResizable(true).catch(() => {});
      void emitTo("main", DISPLAY_LOCK_STATE_EVENT, false).catch(() => {});
      recordWindowDiagnostic({ windowLabel: "display", action: "lock", outcome: "failure" });
    }
  }, []);

  useEffect(() => {
    const currentWindow = getCurrentWindow();
    let disposed = false;
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    let unlistenMoved: (() => void) | undefined;
    let unlistenResized: (() => void) | undefined;
    let unlistenClose: (() => void) | undefined;

    const scheduleSave = () => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        void enqueueGeometrySave(geometryRef.current);
      }, 180);
    };

    const restoreAndListen = async () => {
      recordWindowDiagnostic({ windowLabel: "display", action: "restore", outcome: "started" });
      let store: Store | null = null;
      try {
        store = await load(DISPLAY_GEOMETRY_STORE_FILE, { autoSave: false });
        geometryStoreRef.current = store;
      } catch {
        // 插件存储加载失败时仍允许弹幕窗正常打开，但不保存几何。
        recordWindowDiagnostic({ windowLabel: "display", action: "restore", outcome: "failure", data: { reason: "storage-load" } });
      }
      const saved = store ? await readDisplayGeometry(store) : null;
      geometryRef.current = saved;
      if (saved) {
        await currentWindow
          .setSize(new PhysicalSize(saved.width, saved.height))
          .catch(() => {});
        await currentWindow
          .setPosition(new PhysicalPosition(saved.x, saved.y))
          .catch(() => {});
      }
      if (disposed) return;

      try {
        const [position, size] = await Promise.all([
          currentWindow.outerPosition(),
          currentWindow.innerSize(),
        ]);
        if (!disposed) {
          geometryRef.current = {
            x: position.x,
            y: position.y,
            width: size.width,
            height: size.height,
          };
        }
      } catch {
        // 无法读取初始几何时，后续原生移动/缩放事件仍可建立完整记录。
      }
      if (disposed) return;

      try {
        const stop = await currentWindow.onMoved(({ payload: position }) => {
          const current = geometryRef.current;
          if (!current) return;
          geometryRef.current = { ...current, x: position.x, y: position.y };
          scheduleSave();
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
          geometryRef.current = { ...current, width: size.width, height: size.height };
          scheduleSave();
        });
        if (disposed) stop();
        else unlistenResized = stop;
      } catch {
        // 缩放事件不可用时不影响弹幕窗本身。
      }
      try {
        const stop = await currentWindow.onCloseRequested(() => {
          if (saveTimer) clearTimeout(saveTimer);
          const save = enqueueGeometrySave(geometryRef.current);
          void save
            .then(() => recordWindowDiagnostic({ windowLabel: "display", action: "close", outcome: "saved" }))
            .catch(() => recordWindowDiagnostic({ windowLabel: "display", action: "close", outcome: "failure" }));
          return save;
        });
        if (disposed) stop();
        else unlistenClose = stop;
      } catch {
        // 关闭事件不可用时仍会在组件卸载阶段保存最后已知几何。
      }
      // 子窗口自身在几何恢复后显示，避免完全依赖主窗口 bridge 的 ready 握手。
      await currentWindow.show()
        .then(() => recordWindowDiagnostic({ windowLabel: "display", action: "open", outcome: "shown" }))
        .catch(() => recordWindowDiagnostic({ windowLabel: "display", action: "open", outcome: "failure" }));
    };

    void Promise.all([
      currentWindow.setAlwaysOnTop(true).catch(() => {}),
      currentWindow.setMaximizable(false).catch(() => {}),
    ]).then(restoreAndListen).catch(() => {
      recordWindowDiagnostic({ windowLabel: "display", action: "open", outcome: "failure" });
    });

    return () => {
      disposed = true;
      if (saveTimer) clearTimeout(saveTimer);
      unlistenMoved?.();
      unlistenResized?.();
      unlistenClose?.();
      void enqueueGeometrySave(geometryRef.current);
      recordWindowDiagnostic({ windowLabel: "display", action: "destroy", outcome: "unmounted" });
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unlistenEvents: (() => void) | undefined;
    let unlistenRoomChanged: (() => void) | undefined;
    let unlistenLock: (() => void) | undefined;
    let unlistenPreferences: (() => void) | undefined;

    void Promise.all([
      listen<EventWindowEvent>(DISPLAY_EVENT_NAME, (event) => {
        if (cancelled) return;
        setEvents((current) => appendDisplayEvent(current, event.payload));
      }),
      listen<void>(DISPLAY_ROOM_CHANGED_EVENT, () => {
        if (cancelled) return;
        setEvents([]);
      }),
      listen<boolean>(DISPLAY_LOCK_EVENT, (event) => {
        if (cancelled) return;
        void applyLock(Boolean(event.payload));
      }),
      listen<EventWindowPreferences>(EVENT_WINDOW_PREFERENCES_EVENT, (event) => {
        if (cancelled) return;
        setWindowPreferences(current => applyEventWindowBehaviorPreferences(current, event.payload));
      }),
    ])
      .then(([stopEvents, stopRoomChanged, stopLock, stopPreferences]) => {
        if (cancelled) {
          stopEvents();
          stopRoomChanged();
          stopLock();
          stopPreferences();
          return;
        }
        unlistenEvents = stopEvents;
        unlistenRoomChanged = stopRoomChanged;
        unlistenLock = stopLock;
        unlistenPreferences = stopPreferences;
        // 三类监听都完成后再握手，确保切换清空和锁定状态不会丢失。
        void emitTo("main", DISPLAY_READY_EVENT).catch(() => {});
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      unlistenEvents?.();
      unlistenRoomChanged?.();
      unlistenLock?.();
      unlistenPreferences?.();
      setEvents([]);
    };
  }, [applyLock]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const log = logRef.current;
      if (log) log.scrollTop = log.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [events]);

  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    return observeRenderedEventRows(log, { windowLabel: "display", region: "display" });
  }, []);

  return (
    <main data-native-runtime-target="windows" className="display-window relative isolate flex h-full min-h-0 flex-col overflow-hidden rounded-xl font-ui text-t1 backdrop-blur-lg backdrop-saturate-[115%]">
      <div
        className="display-window-drag-layer"
        data-tauri-drag-region
        aria-hidden="true"
        onMouseDown={(event) => {
          if (event.button !== 0) return;
          void getCurrentWindow().startDragging().catch(() => {});
        }}
      />
      {RESIZE_HANDLES.map(({ className, direction }) => (
        <div
          key={direction}
          className={`display-window-resize-handle ${className}`}
          aria-hidden="true"
          onMouseDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            void getCurrentWindow().startResizeDragging(direction).catch(() => {});
          }}
        />
      ))}
      <div
        role="log"
        aria-label={uiText("uiControls.chatWindow")}
        aria-live="polite"
        ref={logRef}
        className="display-window-log pointer-events-none min-h-0 flex-1 cursor-default select-none overflow-y-auto overscroll-contain"
      >
        <div className="display-window-event-list">
          {events.map((event, index, visibleEvents) => (
            <EventRowSlot
              key={event.reactKey ?? event.id}
              className="event-row-slot"
              data-event-id={event.reactKey ?? event.id}
              data-event-msg-type={event.msgType}
              data-event-session-id={event.__renderDiagnostic?.sessionId}
              data-event-connection-id={event.__renderDiagnostic?.connectionId}
              data-event-room-id={event.roomId}
              data-event-style-type={getEventStyleType(event.msgType, event.guard?.level ?? event.user?.guardLevel)}
              data-event-animation-preset={windowPreferences.display.eventAnimationPreset}
              data-event-animation-duration={getEventAnimationDuration(windowPreferences.display.eventAnimationPreset, windowPreferences.display.eventAnimationDurationMs)}
              data-event-animation-exit-duration={getEventAnimationExitDuration(windowPreferences.display.eventAnimationPreset, windowPreferences.display.eventAnimationDurationMs)}
              data-event-padding={windowPreferences.display.eventPadding}
              data-event-font-family={windowPreferences.eventStyleSettings.fontFamily}
              showEventSpacing={index < visibleEvents.length - 1}
            >
              <EventRow
                ev={event}
                liveLayout
                showTime={false}
                displayPreferences={windowPreferences.display}
                eventStyleSettings={windowPreferences.eventStyleSettings}
                eventFontSize={windowPreferences.fontSize}
              />
            </EventRowSlot>
          ))}
        </div>
      </div>
    </main>
  );
}
