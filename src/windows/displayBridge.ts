import { createAppWindow } from "../appData.ts";
import { resolveOutputEventNeeds } from "../events/outputEventPolicy.ts";
import { emitTo, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { load } from "../appData.ts";
import { readCurrentMonitorWorkArea } from "./windowMonitor";
import { getEventId } from "../protocol/adapter";
import type { DanmakuEvent, RoomGuardProfile } from "../protocol/types";
import { applyRoomGuardProfileToEvents } from '../protocol/roomGuardProfile';
import { observeWindowEventDelivery, withEventWindowDiagnosticContext, type EventWindowEvent } from "./eventWindowDiagnostics";
import { createBatchedWindowDelivery, createOrderedWindowDelivery } from "./orderedWindowDelivery";
import {
  closeDisplaySession,
  createDisplaySession,
  isDisplayEvent,
  markDisplayReady,
  openDisplaySession,
  queueDisplayEvent,
  switchDisplayRoom as switchDisplayRoomSession,
} from "./displayWindowModel";
import { createDefaultWindowPair, toPhysicalWindowPlacement, type MonitorWorkArea } from "./eventWindowLayout";
import {
  DEFAULT_EVENT_WINDOW_PREFERENCES,
  EVENT_WINDOW_PREFERENCES_EVENT,
  type EventWindowPreferences,
} from "./eventWindowPreferences";
import {
  DISPLAY_EVENT_NAME,
  DISPLAY_EVENT_REGION,
  DISPLAY_LOCK_EVENT,
  DISPLAY_LOCK_STATE_EVENT,
  DISPLAY_READY_ACK_EVENT,
  DISPLAY_READY_EVENT,
  DISPLAY_READY_REQUEST_EVENT,
  DISPLAY_ROOM_CHANGED_EVENT,
  DISPLAY_RESET_GEOMETRY_EVENT,
  DISPLAY_WINDOW_LABEL,
  getEventWindowPublishResult,
  isEventWindowRoomStatePayload,
  type EventWindowRoomStatePayload,
  type EventWindowPublishResult,
} from "./eventWindowChannels";
export {
  DISPLAY_EVENT_NAME,
  DISPLAY_LOCK_EVENT,
  DISPLAY_LOCK_STATE_EVENT,
  DISPLAY_READY_ACK_EVENT,
  DISPLAY_READY_EVENT,
  DISPLAY_READY_REQUEST_EVENT,
  DISPLAY_ROOM_CHANGED_EVENT,
  DISPLAY_RESET_GEOMETRY_EVENT,
  DISPLAY_WINDOW_LABEL,
} from "./eventWindowChannels";

const DISPLAY_URL = "index.html?window=display";
const DISPLAY_LOCK_STORAGE_KEY = "bb-colive:display-window-locked";

function readDisplayWindowLocked(): boolean {
  try {
    return localStorage.getItem(DISPLAY_LOCK_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function persistDisplayWindowLocked(locked: boolean): void {
  try {
    localStorage.setItem(DISPLAY_LOCK_STORAGE_KEY, String(locked));
  } catch {
    // 本地存储不可用时仅失去跨重载记忆，不影响本次窗口控制。
  }
}

let session = createDisplaySession();
let displayWindow: WebviewWindow | null = null;
let readyUnlisten: UnlistenFn | null = null;
let lockStateUnlisten: UnlistenFn | null = null;
let bridgeStartPromise: Promise<void> | null = null;
let bridgeConsumers = 0;
let bridgeCloseRequested = false;
let displayWindowOpen = false;
let displayWindowLocked = readDisplayWindowLocked();
let allowsMain: (event: DanmakuEvent) => boolean = () => true;
export function setDisplayOutputPolicy(allow: typeof allowsMain) { allowsMain = allow; }
let displayWindowPreferences: EventWindowPreferences = DEFAULT_EVENT_WINDOW_PREFERENCES;
/** 主连接当前已确认的真实房间；断开时保留，便于同房重连继续追加。 */
let currentRoomId: number | null = null;
let currentRoomGuardProfile: RoomGuardProfile | undefined;
const deliverDisplayEvent = createOrderedWindowDelivery();
const deliverDisplayBatch = createBatchedWindowDelivery<{ event: EventWindowEvent; target: WebviewWindow | null; generation: number }>(deliverDisplayEvent, async entries => {
  const events = entries.filter(({ event, target, generation }) => target && displayWindow === target && session.open && session.roomGeneration === generation && resolveOutputEventNeeds(event, { preferences: displayWindowPreferences, roomId: event.roomId, allowsMain }).main)
    .map(({ event, generation }) => ({ ...event, __roomGeneration: generation }));
  if (events.length) await emitTo(DISPLAY_WINDOW_LABEL, DISPLAY_EVENT_NAME, events);
});
const displayWindowStateListeners = new Set<(open: boolean) => void>();
const displayWindowLockListeners = new Set<(locked: boolean) => void>();

function setDisplayWindow(window: WebviewWindow | null): void {
  displayWindow = window;
  const nextOpen = window !== null;
  if (displayWindowOpen !== nextOpen) {
    displayWindowOpen = nextOpen;
    for (const listener of displayWindowStateListeners) listener(nextOpen);
  }
}

function stopSessionFor(window: WebviewWindow): void {
  if (displayWindow !== window) return;
  setDisplayWindow(null);
  closeDisplaySession(session);
  // 投递失败通常意味着子窗口已经重载或失去事件监听；不能留下一个
  // 原生“僵尸窗口”，否则下次打开只会复用它而永远等不到 ready。
  void window.close().catch(() => {});
}

function sendDisplayEvent(event: EventWindowEvent): void {
  const target = displayWindow;
  const generation = session.roomGeneration;
  observeWindowEventDelivery(
    deliverDisplayBatch({ event, target, generation }),
    {
      eventId: getEventId(event),
      roomId: event.roomId,
      msgType: event.msgType,
      region: DISPLAY_EVENT_REGION,
      windowLabel: DISPLAY_WINDOW_LABEL,
      phase: "display-window",
    },
    () => {
      // 弹幕窗是可选副屏；投递失败时清理它的临时状态，不影响主连接。
      if (target && displayWindow === target && session.roomGeneration === generation) stopSessionFor(target);
    },
  );
}

function sendDisplayLockState(): void {
  if (!displayWindow) return;
  void emitTo(DISPLAY_WINDOW_LABEL, DISPLAY_LOCK_EVENT, displayWindowLocked).catch(() => {});
}

async function sendDisplayWindowPreferences(): Promise<void> {
  if (!displayWindow) return;
  deliverDisplayBatch.seal();
  await deliverDisplayEvent(() => emitTo(DISPLAY_WINDOW_LABEL, EVENT_WINDOW_PREFERENCES_EVENT, displayWindowPreferences)).catch(() => {});
}

function getDisplayRoomState(): EventWindowRoomStatePayload {
  return { roomId: session.roomId, generation: session.roomGeneration, ...(currentRoomGuardProfile ? { roomGuardProfile: currentRoomGuardProfile } : {}) };
}

function sendDisplayRoomChanged(): void {
  if (!displayWindow) return;
  void emitTo(DISPLAY_WINDOW_LABEL, DISPLAY_ROOM_CHANGED_EVENT, getDisplayRoomState()).catch(() => {
    if (displayWindow) stopSessionFor(displayWindow);
  });
}

function updateDisplayWindowLockState(locked: boolean): void {
  if (displayWindowLocked === locked) return;
  displayWindowLocked = locked;
  persistDisplayWindowLocked(locked);
  for (const listener of displayWindowLockListeners) listener(locked);
}

function setDisplayWindowLocked(locked: boolean): void {
  updateDisplayWindowLockState(locked);
  sendDisplayLockState();
}

function handleDisplayLockState(event: { payload: unknown }): void {
  updateDisplayWindowLockState(Boolean(event.payload));
}

async function getDisplayWindowForReady(): Promise<WebviewWindow | null> {
  if (displayWindow) return displayWindow;
  const current = await WebviewWindow.getByLabel(DISPLAY_WINDOW_LABEL);
  if (current) setDisplayWindow(current);
  return current;
}

async function handleDisplayReady(event: { payload: unknown }): Promise<void> {
  const target = await getDisplayWindowForReady();
  if (!target) return;
  const payload = isEventWindowRoomStatePayload(event.payload) ? event.payload : null;
  const expected = getDisplayRoomState();
  const matches = payload?.roomId === expected.roomId && payload?.generation === expected.generation;
  if (!matches) {
    sendDisplayRoomChanged();
    requestDisplayReady(target);
    return;
  }
  await sendDisplayWindowPreferences();
  const pending = markDisplayReady(session);
  sendDisplayLockState();
  for (const event of pending) sendDisplayEvent(event);
  void emitTo(DISPLAY_WINDOW_LABEL, DISPLAY_READY_ACK_EVENT).catch(() => {});
}

function requestDisplayReady(target: WebviewWindow): void {
  void emitTo(DISPLAY_WINDOW_LABEL, DISPLAY_READY_REQUEST_EVENT, getDisplayRoomState()).catch(() => {
    if (displayWindow === target) stopSessionFor(target);
  });
}

/** 新主窗口生命周期启动时关闭上一个页面遗留的原生弹幕窗。 */
async function closeStaleDisplayWindow(): Promise<void> {
  const stale = await WebviewWindow.getByLabel(DISPLAY_WINDOW_LABEL);
  if (!stale) return;
  setDisplayWindow(null);
  closeDisplaySession(session);
  await stale.close().catch(() => {});
}

/** 主窗口启动时调用一次，监听弹幕窗 ready 握手。 */
export async function startDisplayBridge(): Promise<() => void> {
  const firstConsumer = bridgeConsumers === 0;
  bridgeConsumers += 1;
  bridgeCloseRequested = false;
  try {
    if (!readyUnlisten || !lockStateUnlisten) {
      bridgeStartPromise ??= Promise.all([
        listen(DISPLAY_READY_EVENT, handleDisplayReady),
        listen(DISPLAY_LOCK_STATE_EVENT, handleDisplayLockState),
      ]).then(([readyStop, lockStateStop]) => {
        readyUnlisten = readyStop;
        lockStateUnlisten = lockStateStop;
      }).finally(() => {
        bridgeStartPromise = null;
      });
      await bridgeStartPromise;
    }
    // 先注册 ready，再清理遗留窗口，避免新窗口启动瞬间发出的单次握手丢失。
    if (firstConsumer) await closeStaleDisplayWindow();
  } catch (error) {
    bridgeConsumers -= 1;
    throw error;
  }
  const unlisten = readyUnlisten;
  const lockUnlisten = lockStateUnlisten;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    bridgeConsumers = Math.max(0, bridgeConsumers - 1);
    if (bridgeConsumers > 0) return;
    if (readyUnlisten === unlisten && unlisten) {
      unlisten();
      readyUnlisten = null;
    }
    if (lockStateUnlisten === lockUnlisten && lockUnlisten) {
      lockUnlisten();
      lockStateUnlisten = null;
    }
    if (bridgeCloseRequested) void closeDisplayWindow().catch(() => {});
  };
}

/** 打开或聚焦弹幕窗；重复点击不会创建第二个窗口。 */
export async function openDisplayWindow(): Promise<void> {
  const existing = await WebviewWindow.getByLabel(DISPLAY_WINDOW_LABEL);
  if (existing) {
    if (!session.open) openDisplaySession(session, currentRoomId);
    setDisplayWindow(existing);
    if (session.ready) await existing.show();
    await existing.setFocus();
    sendDisplayLockState();
    sendDisplayWindowPreferences();
    if (!session.ready) requestDisplayReady(existing);
    return;
  }

  openDisplaySession(session, currentRoomId);
  try {
    const placement = createDefaultWindowPair(await readCurrentMonitorWorkArea()).display;
    const created = await createAppWindow(DISPLAY_WINDOW_LABEL, {
      url: DISPLAY_URL,
      title: "弹幕窗 · BB CoLive",
      visible: false,
      width: placement.width,
      height: placement.height,
      minWidth: 320,
      minHeight: 320,
      resizable: true,
      decorations: false,
      transparent: true,
      shadow: false,
      alwaysOnTop: true,
      maximizable: false,
      x: placement.x,
      y: placement.y,
      center: false,
    });
    setDisplayWindow(created);
    void created.once("tauri://destroyed", () => stopSessionFor(created));
    void created.once("tauri://error", () => stopSessionFor(created));
  } catch (error) {
    closeDisplaySession(session);
    throw error;
  }
}

/** 关闭弹幕窗并清空它的临时事件缓存；不影响主窗口现场。 */
export async function closeDisplayWindow(): Promise<void> {
  const target = displayWindow ?? await WebviewWindow.getByLabel(DISPLAY_WINDOW_LABEL);
  closeDisplaySession(session);
  if (!target) {
    setDisplayWindow(null);
    return;
  }
  setDisplayWindow(null);
  await target.close();
}

/** 将弹幕窗布局恢复为当前显示器右上角的默认 360×360 位置。 */
export async function resetDisplayWindowGeometry(workAreaOverride?: MonitorWorkArea | null): Promise<void> {
  const workArea = workAreaOverride === undefined ? await readCurrentMonitorWorkArea() : workAreaOverride;
  const placement = toPhysicalWindowPlacement(
    createDefaultWindowPair(workArea).display,
    workArea?.scaleFactor,
  );
  try {
    const store = await load("display-window.local.json", { autoSave: false });
    await store.set("geometry", { x: placement.x, y: placement.y, width: placement.width, height: placement.height });
    await store.save();
  } catch {
    // 存储不可用时仍尝试立即调整已打开的窗口。
  }
  if (displayWindow) void emitTo(DISPLAY_WINDOW_LABEL, DISPLAY_RESET_GEOMETRY_EVENT, placement).catch(() => {});
}

/** 主窗口侧的锁定控制：弹幕窗本身在锁定后完全鼠标穿透。 */
export function toggleDisplayWindowLock(): void {
  if (!displayWindowOpen) return;
  setDisplayWindowLocked(!displayWindowLocked);
}

export function isDisplayWindowLocked(): boolean {
  return displayWindowLocked;
}

export function subscribeDisplayWindowLockState(listener: (locked: boolean) => void): () => void {
  displayWindowLockListeners.add(listener);
  listener(displayWindowLocked);
  return () => displayWindowLockListeners.delete(listener);
}

export function isDisplayWindowOpen(): boolean {
  return displayWindowOpen;
}

export function subscribeDisplayWindowState(listener: (open: boolean) => void): () => void {
  displayWindowStateListeners.add(listener);
  listener(displayWindowOpen);
  return () => displayWindowStateListeners.delete(listener);
}

/** 更新弹幕窗的事件视觉偏好；窗口未打开时缓存，ready 握手时补发。 */
export function setDisplayWindowPreferences(preferences: EventWindowPreferences): void {
  displayWindowPreferences = {
    sceneFilters: preferences.sceneFilters,
    userNicknames: preferences.userNicknames,
    displayScale: preferences.displayScale,
    fontSize: preferences.fontSize,
    giftThreshold: preferences.giftThreshold,
    giftThresholdMode: preferences.giftThresholdMode,
    audienceFilters: { ...preferences.audienceFilters },
    scrollDirection: preferences.scrollDirection,
    contentAlignment: preferences.contentAlignment,
    appearance: { ...preferences.appearance, surfaceColor: preferences.appearance.surfaceColor ? { ...preferences.appearance.surfaceColor } : null },
    eventExpiry: { ...preferences.eventExpiry },
    stickyEvents: { ...preferences.stickyEvents },
    capacity: preferences.capacity,
    mergeSameDanmu: preferences.mergeSameDanmu,
    sameDanmuWindowSeconds: preferences.sameDanmuWindowSeconds,
    showGiftEffect: preferences.showGiftEffect,
    showGuardEffect: preferences.showGuardEffect,
    displayFilters: {
      ...preferences.displayFilters,
      interactKinds: { ...preferences.displayFilters.interactKinds },
    },
    display: { ...preferences.display },
    eventStyleSettings: preferences.eventStyleSettings,
  };
  sendDisplayWindowPreferences();
}

/**
 * 同步主连接确认的真实房间。不同房间会清空弹幕窗缓存；同房重连不变更缓存。
 * 该状态只供桥接生命周期使用，不会显示房间号。
 */
export function switchDisplayRoom(roomId: number | null): void {
  if (currentRoomId !== roomId) currentRoomGuardProfile = undefined;
  currentRoomId = roomId;
  if (!switchDisplayRoomSession(session, roomId)) return;
  if (session.open) {
    sendDisplayRoomChanged();
    if (displayWindow) requestDisplayReady(displayWindow);
  }
}

export function updateDisplayRoomGuardProfile(profile: RoomGuardProfile): void {
  if (profile.roomId == null || profile.roomId !== currentRoomId) return;
  currentRoomGuardProfile = profile;
  session.pending = applyRoomGuardProfileToEvents(session.pending, profile.roomId, profile);
  sendDisplayRoomChanged();
}

/** 主窗口卸载或重新初始化时清理桥接监听和窗口侧临时状态。 */
export function closeDisplayBridge(): void {
  bridgeCloseRequested = true;
  if (bridgeConsumers > 0) return;
  readyUnlisten?.();
  readyUnlisten = null;
  lockStateUnlisten?.();
  lockStateUnlisten = null;
  void closeDisplayWindow().catch(() => {});
}

/** 只从主连接 flush 后调用；事件已去重并真正进入现场会话。 */
export function publishDisplayEvent(event: DanmakuEvent): EventWindowPublishResult {
  if (!isDisplayEvent(event) || !resolveOutputEventNeeds(event, { preferences: displayWindowPreferences, roomId: currentRoomId ?? event.roomId, allowsMain }).main) return "not-applicable";
  const payload = withEventWindowDiagnosticContext(event);
  const result = getEventWindowPublishResult(session.open, session.ready);
  if (result === "window-not-ready") {
    queueDisplayEvent(session, payload);
  }
  if (result !== "delivered") return result;
  sendDisplayEvent(payload);
  return "delivered";
}

// Vite 热替换不会稳定触发 React 根组件卸载，因此更新开始时直接收回原生子窗口。
const hot = import.meta.hot;
const closeForHotUpdate = () => {
  bridgeCloseRequested = true;
  void closeDisplayWindow().catch(() => {});
};
if (hot) hot.on("vite:beforeUpdate", closeForHotUpdate);
import.meta.hot?.dispose(() => {
  hot?.off("vite:beforeUpdate", closeForHotUpdate);
  closeForHotUpdate();
});

export async function locateDisplayWindow(): Promise<void> {
  if (!displayWindow || !session.open) return;
  if (!session.ready) throw new Error('弹幕窗正在打开，请稍后重试。');
  if (await displayWindow.isMinimized()) await displayWindow.unminimize();
  await displayWindow.show();
  await emitTo(DISPLAY_WINDOW_LABEL, 'display:locate');
}
