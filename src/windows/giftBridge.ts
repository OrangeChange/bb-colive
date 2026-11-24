import { createAppWindow } from "../appData.ts";
import { resolveOutputEventNeeds } from "../events/outputEventPolicy.ts";
import { emitTo, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { MsgType } from '../protocol/types';
import { createStickyProjection, stickyCandidate, STICKY_SNAPSHOT_EVENT } from './stickyEventModel';
import { type ActivityFacts } from '../events/activityLifecycle';
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { load } from "../appData.ts";
import { readCurrentMonitorWorkArea } from "./windowMonitor";
import { recordWindowDiagnostic } from "./windowDiagnostics";
import { getEventId } from "../protocol/adapter";
import type { DanmakuEvent, RoomGuardProfile } from "../protocol/types";
import { applyRoomGuardProfileToEvents } from '../protocol/roomGuardProfile';
import type { GiftEffectNotice } from "./giftEffectBus";
import { observeWindowEventDelivery, withEventWindowDiagnosticContext, type EventWindowEvent } from "./eventWindowDiagnostics";
import { createBatchedWindowDelivery, createOrderedWindowDelivery } from "./orderedWindowDelivery";
import {
  createDefaultWindowPair,
  createRevenueWindowLayout,
  getEventWindowMinSize,
  toPhysicalWindowPlacement,
  type MonitorWorkArea, type PersistedWindowGeometry,
} from "./eventWindowLayout";
import {
  closeGiftWindowSession,
  createGiftWindowSession,
  isGiftWindowEvent,
  markGiftWindowReady,
  openGiftWindowSession,
  queueGiftWindowEvent,
  switchGiftWindowRoom as switchGiftWindowRoomSession,
  createRevenueWindowSelection, changeRevenueWindowSelection, revenueEventKind,
  applyGiftWindowControl, createGiftWindowControlState,
  type RevenueWindowKind, type RevenueWindowMode, type RevenueWindowSelection,
} from "./giftWindowModel";
import {
  DEFAULT_EVENT_WINDOW_PREFERENCES,
  EVENT_WINDOW_PREFERENCES_EVENT,
  type EventWindowPreferences,
} from "./eventWindowPreferences";
import {
  getEventWindowPublishResult,
  isEventWindowRoomStatePayload,
  type EventWindowRoomStatePayload,
  type EventWindowPublishResult,
  revenueWindowChannels, REVENUE_WINDOW_LABELS, type RevenueWindowLabel,
} from "./eventWindowChannels";
export {
  GIFT_EVENT_NAME,
  GIFT_EFFECT_EVENT,
  GIFT_LOCK_EVENT,
  GIFT_LOCK_STATE_EVENT,
  GIFT_READY_ACK_EVENT,
  GIFT_READY_EVENT,
  GIFT_READY_REQUEST_EVENT,
  GIFT_ROOM_CHANGED_EVENT,
  GIFT_RESET_GEOMETRY_EVENT,
  GIFT_WINDOW_LABEL,
} from "./eventWindowChannels";

const GIFT_LOCK_STORAGE_KEY = "bb-colive:gift-window-locked";

function isGeometry(value: unknown): value is PersistedWindowGeometry {
  if (!value || typeof value !== 'object') return false;
  const g = value as PersistedWindowGeometry;
  return [g.x,g.y,g.width,g.height].every(Number.isFinite) && g.width > 0 && g.height > 0;
}

async function readDisplayGeometry(): Promise<PersistedWindowGeometry | null> {
  try {
    const window = await WebviewWindow.getByLabel('display');
    if (window) {
      const [position,size] = await Promise.all([window.outerPosition(),window.innerSize()]);
      return { ...position, ...size };
    }
  } catch { /* 窗口已关闭时读取保存位置。 */ }
  try {
    const geometry = await (await load('display-window.local.json',{autoSave:false})).get('geometry');
    return isGeometry(geometry) ? geometry : null;
  } catch { return null; }
}

async function revenuePlacements(area: MonitorWorkArea | null, updateOldDefaults = false, displayOverride?: PersistedWindowGeometry) {
  const placements = createRevenueWindowLayout(area, displayOverride ?? await readDisplayGeometry());
  if (!updateOldDefaults || !area) return placements;
  const labels = ['gift-only','superchat','guard'] as const;
  try {
    const stores = await Promise.all(labels.map(label => load(revenueWindowChannels(label).geometryStoreFile,{autoSave:false})));
    const saved = await Promise.all(stores.map(store => store.get('geometry')));
    const old = toPhysicalWindowPlacement(createDefaultWindowPair(area).display,area.scaleFactor);
    const oldGroup = saved.every((value,index) => isGeometry(value) && value.custom !== true
      && value.x === old.x && value.y === old.y + old.height*index && value.width === old.width && value.height === old.height);
    if (oldGroup) {
      for (const [index,kind] of (['gift','superchat','guard'] as const).entries()) {
        const { center: _, ...geometry } = toPhysicalWindowPlacement(placements[kind],area.scaleFactor);
        await stores[index].set('geometry',geometry);
        await stores[index].save();
      }
    }
  } catch (error) {
    recordWindowDiagnostic({ windowLabel: 'gift', action: 'layout', outcome: 'failure', data: { reason: 'old-defaults', error: String(error) } });
  }
  return placements;
}

function readGiftWindowLocked(): boolean {
  try {
    return localStorage.getItem(GIFT_LOCK_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function persistGiftWindowLocked(locked: boolean): void {
  try {
    localStorage.setItem(GIFT_LOCK_STORAGE_KEY, String(locked));
  } catch {
    // 本地存储不可用时仅失去跨重载记忆，不影响本次窗口控制。
  }
}

let outputPolicy: { allowsMain?: (event: DanmakuEvent) => boolean; allowsSticky?: (event: DanmakuEvent) => boolean; nativeMain?: boolean } = {};
export function setGiftOutputPolicy(policy: typeof outputPolicy) { outputPolicy = policy; stickyProjection.retain(event => resolveOutputEventNeeds(event, { preferences: sharedPreferences, roomId: currentRoomId ?? event.roomId, ...outputPolicy }).sticky); }
const stickyProjection = createStickyProjection();
let sharedPreferences = DEFAULT_EVENT_WINDOW_PREFERENCES;
let currentRoomId: number | null = null;
let currentRoomGuardProfile: RoomGuardProfile | undefined;

function createRevenueBridge(label: RevenueWindowLabel) {
const channels = revenueWindowChannels(label);
const GIFT_WINDOW_LABEL = label;
const GIFT_EVENT_REGION = label;
const GIFT_EVENT_NAME = channels.eventName;
const GIFT_READY_EVENT = channels.readyEvent;
const GIFT_READY_REQUEST_EVENT = channels.readyRequestEvent;
const GIFT_READY_ACK_EVENT = channels.readyAckEvent;
const GIFT_LOCK_EVENT = channels.lockEvent;
const GIFT_LOCK_STATE_EVENT = channels.lockStateEvent;
const GIFT_ROOM_CHANGED_EVENT = channels.roomChangedEvent;
const GIFT_RESET_GEOMETRY_EVENT = channels.resetGeometryEvent;
const GIFT_EFFECT_EVENT = channels.effectEvent;
const GIFT_URL = `index.html?window=${label}`;
const accepts = (event: DanmakuEvent) => label === 'gift' || revenueEventKind(event) === (label === 'gift-only' ? 'gift' : label);
const session = createGiftWindowSession();
const deliverGiftEvent = createOrderedWindowDelivery();
const deliverGiftBatch = createBatchedWindowDelivery<{ event: EventWindowEvent; target: WebviewWindow | null; generation: number }>(deliverGiftEvent, async entries => {
  const events = entries.filter(({ event, target, generation }) => target && giftWindow === target && session.open && session.roomGeneration === generation && needsGiftDelivery(event))
    .map(({ event, generation }) => ({ ...event, __roomGeneration: generation }));
  if (events.length) await emitTo(GIFT_WINDOW_LABEL, GIFT_EVENT_NAME, events);
});
const controlState = createGiftWindowControlState();
let giftWindow: WebviewWindow | null = null;
let giftWindowDestroyed: Promise<void> | null = null;
let destroyedUnlisten: UnlistenFn | null = null;
let closingPromise: Promise<void> | null = null;
let readyUnlisten: UnlistenFn | null = null;
let lockStateUnlisten: UnlistenFn | null = null;
let bridgeStartPromise: Promise<void> | null = null;
let bridgeConsumers = 0;
let bridgeCloseRequested = false;
let giftWindowOpen = false;
let giftWindowLocked = readGiftWindowLocked();
let giftWindowPreferences: EventWindowPreferences = DEFAULT_EVENT_WINDOW_PREFERENCES;
const pendingGiftEffectNotices: GiftEffectNotice[] = [];
const GIFT_EFFECT_PENDING_LIMIT = 32;
/** 主连接当前已确认的真实房间；断开时保留，便于同房重连继续追加。 */
let readyRetryTimer: ReturnType<typeof setInterval> | null = null;
let readyRequestCount = 0;

function stopReadyRetry(): void {
  if (readyRetryTimer !== null) clearInterval(readyRetryTimer);
  readyRetryTimer = null;
}

async function waitForNativeWindow(present: boolean, notification: Promise<void>): Promise<void> {
  const deadline = Date.now() + 10000;
  let notified = false;
  notification.then(() => { notified = true; }, () => {});
  while (true) {
    const existing = await WebviewWindow.getByLabel(GIFT_WINDOW_LABEL);
    if (Boolean(existing) === present) return;
    if (Date.now() >= deadline) throw new Error(present ? '窗口创建未完成' : '窗口关闭未完成');
    const pause = new Promise<void>(resolve => setTimeout(resolve, 100));
    await (notified ? pause : Promise.race([notification, pause]));
  }
}
const giftWindowStateListeners = new Set<(open: boolean) => void>();
const giftWindowLockListeners = new Set<(locked: boolean) => void>();

function setGiftWindow(window: WebviewWindow | null): void {
  giftWindow = window;
  const nextOpen = window !== null;
  if (giftWindowOpen !== nextOpen) {
    giftWindowOpen = nextOpen;
    for (const listener of giftWindowStateListeners) listener(nextOpen);
  }
}

async function trackGiftWindow(window: WebviewWindow): Promise<void> {
  if (giftWindow) return;
  let resolveDestroyed!: () => void;
  giftWindowDestroyed = new Promise(resolve => { resolveDestroyed = resolve; });
  destroyedUnlisten = await window.once("tauri://destroyed", () => {
    if (giftWindow === window) {
      stopReadyRetry();
      setGiftWindow(null);
      closeGiftWindowSession(session);
      pendingGiftEffectNotices.length = 0;
      giftWindowDestroyed = null;
      destroyedUnlisten = null;
    }
    resolveDestroyed();
  });
  setGiftWindow(window);
}

function stopSessionFor(window: WebviewWindow): void {
  if (giftWindow !== window) return;
  stopReadyRetry();
  closeGiftWindowSession(session);
  pendingGiftEffectNotices.length = 0;
  // 投递失败通常意味着子窗口已经重载或失去事件监听；不能留下一个
  // 原生“僵尸窗口”，否则下次打开只会复用它而永远等不到 ready。
  void closeGiftWindow().catch(error => recordWindowDiagnostic({ windowLabel: label, action: 'close', outcome: 'failed',
    data: { error: error instanceof Error ? error.message : String(error) } }));
}

function needsGiftDelivery(event: DanmakuEvent) {
  if (event.msgType === MsgType.ScDeleted || event.msgType === MsgType.AnchorLotAward || event.msgType === MsgType.RedPocketWinner) return true;
  const needs = resolveOutputEventNeeds(event, { preferences: giftWindowPreferences, roomId: currentRoomId ?? event.roomId, ...outputPolicy });
  return needs.main || (needs.sticky && giftWindowPreferences.stickyEvents.enabled && !!stickyCandidate(event, giftWindowPreferences.stickyEvents));
}

function sendGiftEvent(event: EventWindowEvent): void {
  const target = giftWindow;
  const generation = session.roomGeneration;
  observeWindowEventDelivery(
    deliverGiftBatch({ event, target, generation }),
    {
      eventId: getEventId(event),
      roomId: event.roomId,
      msgType: event.msgType,
      region: GIFT_EVENT_REGION,
      windowLabel: GIFT_WINDOW_LABEL,
      phase: "gift-window",
    },
    () => {
      // 礼物窗是可选副屏；投递失败时清理它的临时状态，不影响主连接。
      if (target && giftWindow === target && session.roomGeneration === generation) stopSessionFor(target);
    },
  );
}

function sendGiftEffect(notice: GiftEffectNotice): void {
  const target = giftWindow;
  const generation = session.roomGeneration;
  observeWindowEventDelivery(
    emitTo(GIFT_WINDOW_LABEL, GIFT_EFFECT_EVENT, { ...notice, event: { ...notice.event, __roomGeneration: generation } }),
    {
      eventId: getEventId(notice.event),
      roomId: notice.event.roomId,
      msgType: notice.event.msgType,
      region: GIFT_EVENT_REGION,
      windowLabel: GIFT_WINDOW_LABEL,
      phase: "gift-effect-window",
    },
    () => {
      if (target && giftWindow === target && session.roomGeneration === generation) stopSessionFor(target);
    },
  );
}

function sendGiftLockState(): void {
  if (!giftWindow) return;
  void emitTo(GIFT_WINDOW_LABEL, GIFT_LOCK_EVENT, giftWindowLocked).catch(() => {});
}

async function sendGiftWindowPreferences(): Promise<void> {
  if (!giftWindow) return;
  deliverGiftBatch.seal();
  await deliverGiftEvent(() => emitTo(GIFT_WINDOW_LABEL, EVENT_WINDOW_PREFERENCES_EVENT, giftWindowPreferences)).catch(() => {});
}

function getGiftRoomState(): EventWindowRoomStatePayload {
  return { roomId: session.roomId, generation: session.roomGeneration, ...(currentRoomGuardProfile ? { roomGuardProfile: currentRoomGuardProfile } : {}) };
}

function sendGiftRoomChanged(): void {
  if (!giftWindow) return;
  void emitTo(GIFT_WINDOW_LABEL, GIFT_ROOM_CHANGED_EVENT, getGiftRoomState()).catch(() => {
    if (giftWindow) stopSessionFor(giftWindow);
  });
}

function updateGiftWindowLockState(locked: boolean): void {
  if (giftWindowLocked === locked) return;
  giftWindowLocked = locked;
  persistGiftWindowLocked(locked);
  for (const listener of giftWindowLockListeners) listener(locked);
}

function setGiftWindowLocked(locked: boolean): void {
  updateGiftWindowLockState(locked);
  sendGiftLockState();
}

function handleGiftLockState(event: { payload: unknown }): void {
  const locked = Boolean(event.payload);
  if (giftWindowLocked === locked) return;
  for (const bridge of Object.values(bridges)) bridge.setGiftWindowLocked(locked);
}

async function getGiftWindowForReady(): Promise<WebviewWindow | null> {
  if (giftWindow) return giftWindow;
  const current = await WebviewWindow.getByLabel(GIFT_WINDOW_LABEL);
  if (current) await trackGiftWindow(current);
  return current;
}

async function handleGiftReady(event: { payload: unknown }): Promise<void> {
  const target = await getGiftWindowForReady();
  if (!target) return;
  const payload = isEventWindowRoomStatePayload(event.payload) ? event.payload : null;
  const expected = getGiftRoomState();
  const matches = payload?.roomId === expected.roomId && payload?.generation === expected.generation;
  if (!matches) {
    sendGiftRoomChanged();
    requestGiftReady(target);
    return;
  }
  const wasReady = session.ready;
  stopReadyRetry();
  if (!wasReady) recordWindowDiagnostic({ windowLabel: GIFT_WINDOW_LABEL, action: "bridge", outcome: "room-confirmed", data: { roomId: expected.roomId, generation: expected.generation, requests: readyRequestCount } });
  const pending = markGiftWindowReady(session);
  await sendGiftWindowPreferences();
  await emitTo(GIFT_WINDOW_LABEL, STICKY_SNAPSHOT_EVENT, { ...expected, events: stickyProjection.snapshot(Date.now()).filter(accepts) }).catch(() => {});
  sendGiftLockState();
  for (const event of pending) sendGiftEvent(event);
  const pendingEffects = pendingGiftEffectNotices.splice(0, pendingGiftEffectNotices.length);
  for (const notice of pendingEffects) sendGiftEffect(notice);
  void emitTo(GIFT_WINDOW_LABEL, GIFT_READY_ACK_EVENT, expected).catch(() => {});
}

function requestGiftReady(target: WebviewWindow): void {
  const send = () => {
    if (giftWindow !== target || !session.open || session.ready) {
      stopReadyRetry();
      return;
    }
    readyRequestCount += 1;
    void emitTo(GIFT_WINDOW_LABEL, GIFT_READY_REQUEST_EVENT, getGiftRoomState()).catch(() => {
      if (giftWindow === target) stopSessionFor(target);
    });
  };
  if (readyRetryTimer === null) {
    readyRequestCount = 0;
    const state = getGiftRoomState();
    recordWindowDiagnostic({ windowLabel: GIFT_WINDOW_LABEL, action: "bridge", outcome: "room-requested", data: { roomId: state.roomId, generation: state.generation } });
    readyRetryTimer = setInterval(send, 500);
  }
  send();
}

/** 新主窗口生命周期启动时关闭上一个页面遗留的原生礼物窗。 */
async function closeStaleGiftWindow(): Promise<void> {
  stopReadyRetry();
  const stale = await WebviewWindow.getByLabel(GIFT_WINDOW_LABEL);
  if (!stale) return;
  setGiftWindow(null);
  closeGiftWindowSession(session);
  pendingGiftEffectNotices.length = 0;
  await stale.close().catch(() => {});
}

/** 主窗口启动时调用一次，监听礼物窗 ready 握手。 */
async function startGiftBridge(): Promise<() => void> {
  const firstConsumer = bridgeConsumers === 0;
  bridgeConsumers += 1;
  bridgeCloseRequested = false;
  try {
    if (!readyUnlisten || !lockStateUnlisten) {
      bridgeStartPromise ??= Promise.all([
        listen(GIFT_READY_EVENT, handleGiftReady),
        listen(GIFT_LOCK_STATE_EVENT, handleGiftLockState),
      ]).then(([readyStop, lockStateStop]) => {
        readyUnlisten = readyStop;
        lockStateUnlisten = lockStateStop;
      }).finally(() => {
        bridgeStartPromise = null;
      });
      await bridgeStartPromise;
    }
    // 先注册 ready，再清理遗留窗口，避免新窗口启动瞬间发出的单次握手丢失。
    if (firstConsumer) await closeStaleGiftWindow();
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
    if (bridgeCloseRequested) void closeGiftWindow().catch(() => {});
  };
}

/** 打开或聚焦礼物窗；重复点击不会创建第二个窗口。 */
async function openGiftWindow(): Promise<void> {
  if (closingPromise) await closingPromise;
  const existing = await WebviewWindow.getByLabel(GIFT_WINDOW_LABEL);
  if (existing) {
    if (!session.open) openGiftWindowSession(session, currentRoomId);
    if (!giftWindow) await trackGiftWindow(existing);
    if (session.ready) await existing.show();
    await existing.setFocus();
    sendGiftLockState();
    sendGiftWindowPreferences();
    if (!session.ready) requestGiftReady(giftWindow!);
    return;
  }

  openGiftWindowSession(session, currentRoomId);
  pendingGiftEffectNotices.length = 0;
  try {
    const area = await readCurrentMonitorWorkArea();
    const placement = label === 'gift' ? createDefaultWindowPair(area).gift
      : (await revenuePlacements(area,true))[label === 'gift-only' ? 'gift' : label];
    const minimum = getEventWindowMinSize(label);
    const created = await createAppWindow(GIFT_WINDOW_LABEL, {
      url: GIFT_URL,
      title: `${label === 'superchat' ? '醒目留言窗' : label === 'guard' ? '大航海窗' : label === 'gift' ? '收益窗' : '礼物窗'} · BB CoLive`,
      visible: false,
      width: placement.width,
      height: placement.height,
      minWidth: minimum.width,
      minHeight: minimum.height,
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
    await trackGiftWindow(created);
    requestGiftReady(created);
  } catch (error) {
    destroyedUnlisten?.();
    destroyedUnlisten = null;
    giftWindowDestroyed = null;
    setGiftWindow(null);
    closeGiftWindowSession(session);
    throw error;
  }
}

/** 关闭礼物窗并清空它的临时事件缓存；不影响主窗口现场。 */
async function closeGiftWindow(): Promise<void> {
  if (closingPromise) return closingPromise;
  closingPromise = (async () => {
    const target = giftWindow ?? await WebviewWindow.getByLabel(GIFT_WINDOW_LABEL);
    if (!target) {
      stopReadyRetry();
      setGiftWindow(null);
      closeGiftWindowSession(session);
      pendingGiftEffectNotices.length = 0;
      return;
    }
    if (!giftWindow) await trackGiftWindow(target);
    const destroyed = giftWindowDestroyed;
    await target.close();
    await waitForNativeWindow(false, destroyed!);
    if (giftWindow === target) {
      destroyedUnlisten?.();
      destroyedUnlisten = null;
      giftWindowDestroyed = null;
      stopReadyRetry();
      setGiftWindow(null);
      closeGiftWindowSession(session);
      pendingGiftEffectNotices.length = 0;
    }
  })();
  try { await closingPromise; } finally { closingPromise = null; }
}

/** 恢复组合窗默认布局或避让弹幕窗的紧凑收益列。 */
async function resetGiftWindowGeometry(workAreaOverride?: MonitorWorkArea | null, displayOverride?: PersistedWindowGeometry): Promise<void> {
  const workArea = workAreaOverride === undefined ? await readCurrentMonitorWorkArea() : workAreaOverride;
  const placement = toPhysicalWindowPlacement(
    label === 'gift' ? createDefaultWindowPair(workArea).gift : (await revenuePlacements(workArea,false,displayOverride))[label === 'gift-only' ? 'gift' : label],
    workArea?.scaleFactor,
  );
  try {
    const store = await load(channels.geometryStoreFile, { autoSave: false });
    await store.set("geometry", { x: placement.x, y: placement.y, width: placement.width, height: placement.height, custom: false });
    await store.save();
  } catch {
    // 存储不可用时仍尝试立即调整已打开的窗口。
  }
  if (giftWindow) await emitTo(GIFT_WINDOW_LABEL, GIFT_RESET_GEOMETRY_EVENT, placement);
}

/** 主窗口侧的锁定控制：礼物窗本身在锁定后完全鼠标穿透。 */
function toggleGiftWindowLock(): void {
  if (!giftWindowOpen) return;
  setGiftWindowLocked(!giftWindowLocked);
}

function isGiftWindowLocked(): boolean {
  return giftWindowLocked;
}

function subscribeGiftWindowLockState(listener: (locked: boolean) => void): () => void {
  giftWindowLockListeners.add(listener);
  listener(giftWindowLocked);
  return () => giftWindowLockListeners.delete(listener);
}

function isGiftWindowOpen(): boolean {
  return giftWindowOpen;
}

function subscribeGiftWindowState(listener: (open: boolean) => void): () => void {
  giftWindowStateListeners.add(listener);
  listener(giftWindowOpen);
  return () => giftWindowStateListeners.delete(listener);
}

/** 更新礼物窗的事件视觉偏好；窗口未打开时缓存，ready 握手时补发。 */
function setGiftWindowPreferences(preferences: EventWindowPreferences): void {
  giftWindowPreferences = {
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
  sendGiftWindowPreferences();
}

/** 同步主连接确认的真实房间。不同房间会清空礼物窗缓存；同房重连不变更缓存。 */
function switchGiftWindowRoom(roomId: number | null): void {
  if (!switchGiftWindowRoomSession(session, roomId)) return;
  controlState.clear();
  stopReadyRetry();
  pendingGiftEffectNotices.length = 0;
  if (session.open) {
    sendGiftRoomChanged();
    if (giftWindow) requestGiftReady(giftWindow);
  }
}

function updateGiftRoomGuardProfile(profile: RoomGuardProfile): void {
  if (profile.roomId == null || profile.roomId !== currentRoomId) return;
  currentRoomGuardProfile = profile;
  session.pending = applyRoomGuardProfileToEvents(session.pending, profile.roomId, profile);
  sendGiftRoomChanged();
}

/** 主窗口卸载或重新初始化时清理桥接监听和窗口侧临时状态。 */
function closeGiftBridge(): void {
  bridgeCloseRequested = true;
  if (bridgeConsumers > 0) return;
  readyUnlisten?.();
  readyUnlisten = null;
  lockStateUnlisten?.();
  lockStateUnlisten = null;
  void closeGiftWindow().catch(() => {});
}

/** 只从主连接 flush 后调用；事件已去重并真正进入现场会话。 */
function publishGiftEvent(event: DanmakuEvent): EventWindowPublishResult {
  if (!isGiftWindowEvent(event) && event.msgType !== MsgType.ScDeleted) return "not-applicable";
  if (event.roomId !== currentRoomId) return "not-applicable";
  const controlled = applyGiftWindowControl(controlState, event, outputPolicy.nativeMain === true);
  if (!controlled || !accepts(controlled)) return 'not-applicable';
  event = controlled;
  const now = Date.now();
  if (giftWindowPreferences.stickyEvents.enabled) {
    const card = stickyCandidate(event, giftWindowPreferences.stickyEvents);
    recordWindowDiagnostic({ windowLabel: GIFT_WINDOW_LABEL, action: 'sticky',
      outcome: event.msgType === MsgType.ScDeleted ? 'recalled' : event.msgType === MsgType.AnchorLotAward || event.msgType === MsgType.RedPocketWinner ? 'awarded' : card && card.expiresAt > now ? 'candidate' : 'ineligible',
      eventId: event.id, roomId: event.roomId,
      data: { payment: event.gift?.paymentRmb ?? event.guard?.priceRmb ?? event.sc?.price ?? null,
        displayAmount: card?.amount ?? null, occurredAt: card?.occurredAt ?? null, expiresAt: card?.expiresAt ?? null,
        candidates: stickyProjection.snapshot(now).length },
    });
  }
  const needs = resolveOutputEventNeeds(event, { preferences: giftWindowPreferences, roomId: currentRoomId!, ...outputPolicy });
  const control = event.msgType === MsgType.ScDeleted || event.msgType === MsgType.AnchorLotAward || event.msgType === MsgType.RedPocketWinner;
  if (!control && !needs.main && !(needs.sticky && giftWindowPreferences.stickyEvents.enabled && stickyCandidate(event, giftWindowPreferences.stickyEvents))) return "not-applicable";
  const payload = withEventWindowDiagnosticContext(event);
  const result = getEventWindowPublishResult(session.open, session.ready);
  if (result === "window-not-ready") {
    queueGiftWindowEvent(session, payload);
  }
  if (result !== "delivered") return result;
  sendGiftEvent(payload);
  return "delivered";
}

/** 只从连接 flush 后调用；与礼物行同时进入礼物窗，但不参与普通礼物缓存。 */
function publishGiftEffectEvent(notice: GiftEffectNotice): void {
  if (!accepts(notice.event) || notice.event.roomId !== currentRoomId) return;
  const needs = resolveOutputEventNeeds(notice.event, { preferences: giftWindowPreferences, roomId: currentRoomId!, ...outputPolicy });
  if (!needs.main && !needs.effect) return;
  if (!session.open) return;
  if (!session.ready) {
    if (pendingGiftEffectNotices.length >= GIFT_EFFECT_PENDING_LIMIT) pendingGiftEffectNotices.shift();
    pendingGiftEffectNotices.push(notice);
    return;
  }
  sendGiftEffect(notice);
}

return { startGiftBridge, closeGiftBridge, openGiftWindow, closeGiftWindow, resetGiftWindowGeometry,
  async locate() {
    if (!giftWindow || !session.open) return;
    if (!session.ready) throw new Error('窗口正在打开，请稍后重试。');
    if (await giftWindow.isMinimized()) await giftWindow.unminimize();
    await giftWindow.show();
    await emitTo(label, `${label}:locate`);
  },
  refreshSticky() {
    if (session.open && session.ready) void emitTo(GIFT_WINDOW_LABEL, STICKY_SNAPSHOT_EVENT, { ...getGiftRoomState(), events: stickyProjection.snapshot(Date.now()).filter(accepts) }).catch(() => {});
  },
  isGiftWindowOpen, isGiftWindowLocked, subscribeGiftWindowState, subscribeGiftWindowLockState,
  setGiftWindowLocked, toggleGiftWindowLock, setGiftWindowPreferences, switchGiftWindowRoom,
  updateGiftRoomGuardProfile, publishGiftEvent, publishGiftEffectEvent,
  snapshot: () => ({ label, open: giftWindowOpen, locked: giftWindowLocked, roomId: session.roomId,
    generation: session.roomGeneration, ready: session.ready, pending: session.pending.length,
    stickyCandidates: stickyProjection.snapshot(Date.now()).filter(accepts).length }),
};
}

const bridges = Object.fromEntries(REVENUE_WINDOW_LABELS.map(label => [label, createRevenueBridge(label)])) as Record<RevenueWindowLabel, ReturnType<typeof createRevenueBridge>>;
const SELECTION_KEY = 'bb-colive:revenue-window-selection';
let selection = createRevenueWindowSelection();
try {
  const saved = JSON.parse(localStorage.getItem(SELECTION_KEY) ?? 'null');
  const remembered = ['gift','superchat','guard'].filter(kind => saved?.remembered?.includes(kind)) as RevenueWindowKind[];
  selection = { ...selection, mode: saved?.mode === 'split' ? 'split' : 'combined', remembered: remembered.length ? remembered : selection.remembered };
} catch { /* 本机存储不可用时使用默认组合。 */ }
const selectionListeners = new Set<(state: RevenueWindowSelection) => void>();
let applyingSelection = false;
let selectionQueue = Promise.resolve();
function notifySelection() {
  recordWindowDiagnostic({ windowLabel: 'gift', action: 'selection', outcome: selection.open ? 'open' : 'closed',
    data: { mode: selection.mode, selected: selection.selected.join(','), remembered: selection.remembered.join(',') } });
  try { localStorage.setItem(SELECTION_KEY, JSON.stringify({ mode: selection.mode, remembered: selection.remembered })); } catch { /* 本次选择继续有效。 */ }
  for (const listener of selectionListeners) listener(selection);
}
for (const label of REVENUE_WINDOW_LABELS) bridges[label].subscribeGiftWindowState(open => {
  if (open || applyingSelection || !selection.open) return;
  if (label === 'gift' && selection.mode === 'combined') selection = changeRevenueWindowSelection(selection, { type: 'toggle' });
  else if (selection.mode === 'split') {
    const kind = label === 'gift-only' ? 'gift' : label;
    if (kind !== 'gift' || label === 'gift-only') {
      if (selection.selected.includes(kind as RevenueWindowKind)) selection = changeRevenueWindowSelection(selection, { type: 'child', kind: kind as RevenueWindowKind });
    }
  }
  notifySelection();
});
type RevenueSelectionAction = Parameters<typeof changeRevenueWindowSelection>[1];
export class RevenueWindowOperationError extends Error {
  constructor(message: string, readonly retry: () => Promise<void>, readonly cause: unknown) {
    super(message);
    this.name = 'RevenueWindowOperationError';
  }
}
async function applySelection(action: RevenueSelectionAction | (() => RevenueSelectionAction | null), retrySelection?: RevenueWindowSelection) {
  const operation = selectionQueue.then(async () => {
    const resolved = typeof action === 'function' ? action() : action;
    if (!resolved) return;
    const previous = selection;
    const desired = retrySelection ?? changeRevenueWindowSelection(previous, resolved);
    applyingSelection = true;
    let activeLabel: RevenueWindowLabel = 'gift';
    let operationName = '关闭';
    try {
      const labels: RevenueWindowLabel[] = !desired.open ? [] : desired.mode === 'combined' ? ['gift']
        : desired.selected.map(kind => kind === 'gift' ? 'gift-only' : kind);
      for (const label of REVENUE_WINDOW_LABELS.filter(label => !labels.includes(label))) {
        activeLabel = label;
        operationName = '关闭';
        await bridges[label].closeGiftWindow();
      }
      for (const label of labels) {
        activeLabel = label;
        operationName = '打开';
        if (!bridges[label].isGiftWindowOpen()) await bridges[label].openGiftWindow();
      }
      selection = desired;
    } catch (error) {
      const combinedOpen = bridges.gift.isGiftWindowOpen();
      const selected = (['gift', 'superchat', 'guard'] as const).filter(kind => bridges[kind === 'gift' ? 'gift-only' : kind].isGiftWindowOpen());
      const mode = combinedOpen ? 'combined' : selected.length ? 'split' : desired.mode;
      const actualSelected = combinedOpen ? previous.selected : selected;
      selection = { mode, open: combinedOpen || selected.length > 0, selected: actualSelected,
        remembered: actualSelected.length ? [...actualSelected] : previous.remembered };
      recordWindowDiagnostic({ windowLabel: activeLabel, action: operationName === '打开' ? 'open' : 'close', outcome: 'failed',
        data: { error: error instanceof Error ? error.message : String(error) } });
      const name = activeLabel === 'superchat' ? '醒目留言窗' : activeLabel === 'guard' ? '大航海窗' : activeLabel === 'gift' ? '收益窗' : '礼物窗';
      throw new RevenueWindowOperationError(`${name}未能${operationName}，请重试。`, () => applySelection(resolved, desired), error);
    } finally { applyingSelection = false; notifySelection(); }
  });
  selectionQueue = operation.catch(() => {});
  return operation;
}
export function getRevenueWindowSelection() { return selection; }
export function getRevenueWindowDiagnostics() { return Object.values(bridges).map(bridge => bridge.snapshot()); }
export function subscribeRevenueWindowSelection(listener: (state: RevenueWindowSelection) => void) {
  selectionListeners.add(listener); listener(selection); return () => { selectionListeners.delete(listener); };
}
export function setRevenueWindowMode(mode: RevenueWindowMode) { return applySelection({ type:'mode', mode }); }
export function toggleRevenueChild(kind: RevenueWindowKind) { return applySelection({ type:'child', kind }); }
export function openGiftWindow() { return applySelection(() => selection.open ? null : { type:'toggle' }); }
export async function closeGiftWindow() {
  await applySelection(() => selection.open ? { type:'toggle' } : null);
  for (const bridge of Object.values(bridges)) await bridge.closeGiftWindow();
}
export function isGiftWindowOpen() { return selection.open; }
export function subscribeGiftWindowState(listener: (open: boolean) => void) { return subscribeRevenueWindowSelection(state => listener(state.open)); }
export function isGiftWindowLocked() { return bridges.gift.isGiftWindowLocked(); }
export function subscribeGiftWindowLockState(listener: (locked: boolean) => void) { return bridges.gift.subscribeGiftWindowLockState(listener); }
export function toggleGiftWindowLock() {
  if (!selection.open) return;
  const locked = !isGiftWindowLocked();
  for (const bridge of Object.values(bridges)) bridge.setGiftWindowLocked(locked);
}
export async function startGiftBridge() {
  const stops: Array<() => void> = [];
  try {
    for (const bridge of Object.values(bridges)) stops.push(await bridge.startGiftBridge());
  } catch (error) {
    stops.forEach(stop => stop());
    closeGiftBridge();
    throw error;
  }
  return () => stops.forEach(stop => stop());
}
export function closeGiftBridge() { for (const bridge of Object.values(bridges)) bridge.closeGiftBridge(); }
export async function resetGiftWindowGeometry(workAreaOverride?: MonitorWorkArea | null, displayOverride?: PersistedWindowGeometry) {
  const area = workAreaOverride === undefined ? await readCurrentMonitorWorkArea() : workAreaOverride;
  const display = displayOverride ?? await readDisplayGeometry() ?? toPhysicalWindowPlacement(createDefaultWindowPair(area).display,area?.scaleFactor);
  for (const bridge of Object.values(bridges)) await bridge.resetGiftWindowGeometry(area,display);
}
export function setGiftWindowPreferences(preferences: EventWindowPreferences) {
  sharedPreferences = preferences;
  stickyProjection.configure(preferences.stickyEvents, Date.now());
  stickyProjection.retain(event => resolveOutputEventNeeds(event, { preferences, roomId: currentRoomId ?? event.roomId, ...outputPolicy }).sticky);
  for (const bridge of Object.values(bridges)) bridge.setGiftWindowPreferences(preferences);
}
export function switchGiftWindowRoom(roomId: number | null) {
  if (currentRoomId !== roomId) { stickyProjection.clear(); currentRoomGuardProfile = undefined; }
  currentRoomId = roomId;
  for (const bridge of Object.values(bridges)) bridge.switchGiftWindowRoom(roomId);
}
export function updateGiftRoomGuardProfile(profile: RoomGuardProfile) {
  if (profile.roomId !== currentRoomId) return;
  currentRoomGuardProfile = profile;
  for (const bridge of Object.values(bridges)) bridge.updateGiftRoomGuardProfile(profile);
}
export function publishGiftEvent(event: DanmakuEvent): EventWindowPublishResult {
  if (event.roomId !== currentRoomId || (!isGiftWindowEvent(event) && event.msgType !== MsgType.ScDeleted)) return 'not-applicable';
  const control = event.msgType === MsgType.ScDeleted || event.msgType === MsgType.AnchorLotAward || event.msgType === MsgType.RedPocketWinner;
  const projectedEvent = control || resolveOutputEventNeeds(event, { preferences: sharedPreferences, roomId: currentRoomId!, ...outputPolicy }).sticky
    ? stickyProjection.accept(event, Date.now()) : event;
  const results = Object.values(bridges).map(bridge => bridge.publishGiftEvent(projectedEvent));
  return results.includes('delivered') ? 'delivered' : results.includes('window-not-ready') ? 'window-not-ready' : 'not-applicable';
}
export function publishGiftActivity(fact: ActivityFacts): void {
  if (fact.roomId !== currentRoomId) return;
  stickyProjection.updateActivity(fact);
  for (const bridge of Object.values(bridges)) bridge.refreshSticky();
}
export function publishGiftEffectEvent(notice: GiftEffectNotice) { for (const bridge of Object.values(bridges)) bridge.publishGiftEffectEvent(notice); }

const hot = import.meta.hot;
const closeForHotUpdate = () => {
  closeGiftBridge();
};
if (hot) hot.on("vite:beforeUpdate", closeForHotUpdate);
import.meta.hot?.dispose(() => {
  hot?.off("vite:beforeUpdate", closeForHotUpdate);
  closeForHotUpdate();
});

export async function locateGiftWindows(): Promise<void> {
  const targets = Object.values(bridges).filter(bridge => bridge.isGiftWindowOpen());
  const results = await Promise.allSettled(targets.map(bridge => bridge.locate()));
  const failed = results.flatMap((result,index) => result.status === 'rejected' ? [targets[index].snapshot().label] : []);
  if (failed.length) {
    const names = {gift:'收益窗','gift-only':'礼物窗',superchat:'醒目留言窗',guard:'大航海窗'};
    throw new Error(`${failed.map(label => names[label]).join('、')}未能定位，窗口正在打开时请稍后重试。`);
  }
}
