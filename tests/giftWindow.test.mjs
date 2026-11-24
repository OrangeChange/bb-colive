import { readApplicationSources } from "./helpers/applicationSources.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  appendGiftWindowEvent,
  closeGiftWindowSession,
  createGiftWindowSession,
  isGiftWindowEventVisible,
  isGiftWindowEvent,
  markGiftWindowReady,
  openGiftWindowSession,
  queueGiftWindowEvent,
  switchGiftWindowRoom,
} from "../src/windows/giftWindowModel.ts";
import { MsgType } from "../src/protocol/types.ts";
import * as eventWindowLayout from "../src/windows/eventWindowLayout.ts";

const {
  EVENT_WINDOW_DEFAULT_SIZE,
  createDefaultWindowPair,
  shouldRestoreWindowGeometry,
} = eventWindowLayout;

const root = new URL("../", import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), "utf8");
const exists = (path) => fs.existsSync(new URL(path, root));

test("礼物窗模型覆盖双区右侧的全部业务事件", () => {
  assert.equal(exists("src/windows/giftWindowModel.ts"), true);
  const source = read("src/windows/giftWindowModel.ts");
  for (const type of [
    "MsgType.Gift",
    "MsgType.AnchorLotStart",
    "MsgType.AnchorLotAward",
    "MsgType.RedPocketStart",
    "MsgType.RedPocketWinner",
    "MsgType.SuperChat",
    "MsgType.GuardBuy",
    "MsgType.GuardHonor",
  ]) {
    assert.match(source, new RegExp(type.replace(".", "\\.")));
  }
  assert.doesNotMatch(source, /MsgType\.(Danmu|Interact|RoomBlock|Warning|CutOff)/);
});

const event = (id, msgType) => ({ id, msgType, roomId: 1, ts: 1 });

test("礼物窗模型只追加右区事件并限制实时缓存", () => {
  assert.equal(isGiftWindowEvent(event("gift", MsgType.Gift)), true);
  assert.equal(isGiftWindowEvent(event("sc", MsgType.SuperChat)), true);
  assert.equal(isGiftWindowEvent(event("guard", MsgType.GuardHonor)), true);
  assert.equal(isGiftWindowEvent(event("danmu", MsgType.Danmu)), false);
  assert.equal(isGiftWindowEvent(event("retired-pocket", MsgType.RedPocketGift)), false);
  assert.deepEqual(
    appendGiftWindowEvent([event("old", MsgType.Gift)], event("new", MsgType.SuperChat), 1).map((item) => item.id),
    ["new"],
  );
});

test("礼物窗按全局最低显示金额隐藏低价付费事件", () => {
  const cheap = {
    ...event("cheap", MsgType.Gift),
    gift: { name: "低价礼物", priceRmb: 0.1, isFree: false },
  };
  const kept = {
    ...event("kept", MsgType.Gift),
    gift: { name: "达标礼物", priceRmb: 1, isFree: false },
  };

  assert.equal(isGiftWindowEventVisible(cheap, 0.5, "unit"), false);
  assert.equal(isGiftWindowEventVisible(kept, 0.5, "unit"), true);
  assert.equal(isGiftWindowEventVisible({ ...event("sc", MsgType.SuperChat), sc: { price: 0.1 } }, 0.5, "unit"), false);
  assert.equal(isGiftWindowEventVisible({ ...event("guard", MsgType.GuardBuy), guard: { priceRmb: 0.1, count: 1 } }, 0.5, "unit"), false);
  assert.equal(isGiftWindowEventVisible(event("entry", MsgType.GuardHonor), 0.5, "unit"), true);
});

test("同一连击的更新事件在礼物窗内原位合并为一行", () => {
  const first = {
    ...event("gift-1", MsgType.Gift),
    reactKey: "combo-1",
    comboId: "combo-1",
    gift: { id: 100, name: "小礼物", count: 1, total: 100, totalRmb: 1 },
  };
  const update = {
    ...first,
    id: "gift-2",
    ts: 2,
    gift: { ...first.gift, count: 8, total: 800, totalRmb: 8 },
  };

  let events = appendGiftWindowEvent([], first);
  events = appendGiftWindowEvent(events, update);

  assert.equal(events.length, 1);
  assert.equal(events[0].reactKey, "combo-1");
  assert.equal(events[0].gift.count, 8);
  assert.equal(events[0].gift.totalRmb, 8);
});

test("重复事件即使被 React key 加后缀，礼物窗仍按业务身份合并", () => {
  const first = {
    ...event("gift-replay", MsgType.Gift),
    dedupe: "gift-replay",
    reactKey: "gift-replay",
    gift: { id: 101, name: "小礼物", count: 1, total: 100, totalRmb: 1 },
  };
  const replay = {
    ...first,
    reactKey: "gift-replay~1",
    gift: { ...first.gift, count: 2, total: 200, totalRmb: 2 },
  };

  let events = appendGiftWindowEvent([], first);
  events = appendGiftWindowEvent(events, replay);

  assert.equal(events.length, 1);
  assert.equal(events[0].gift.count, 2);
});

test("礼物窗同房重连保留缓存，换房清空待发队列", () => {
  const session = createGiftWindowSession();
  openGiftWindowSession(session, 100);
  assert.equal(queueGiftWindowEvent(session, event("pending", MsgType.Gift)), true);
  assert.equal(switchGiftWindowRoom(session, 100), false);
  assert.equal(switchGiftWindowRoom(session, 200), true);
  assert.deepEqual(markGiftWindowReady(session), []);
  closeGiftWindowSession(session);
  assert.equal(session.open, false);
});

test("礼物窗切换房间后撤销 ready，新房间事件重新排队等待副窗口确认", () => {
  const session = createGiftWindowSession();
  openGiftWindowSession(session, 100);
  markGiftWindowReady(session);

  assert.equal(switchGiftWindowRoom(session, 200), true);
  assert.equal(session.ready, false);
  assert.equal(queueGiftWindowEvent(session, event("new-room", MsgType.Gift)), true);
});

test("礼物窗有独立桥接和窗口入口，但不改变弹幕窗内部标识", () => {
  assert.equal(exists("src/windows/giftBridge.ts"), true);
  assert.equal(exists("src/windows/GiftWindow.tsx"), true);
  const bridge = read("src/windows/giftBridge.ts");
  const channels = read("src/windows/eventWindowChannels.ts");
  const entry = read("src/main.tsx");
  assert.match(channels, /GIFT_WINDOW_LABEL\s*=\s*["']gift["']/);
  assert.match(channels, /gift:(?:events|ready|lock|room-changed)/);
  assert.match(channels, /GIFT_READY_REQUEST_EVENT\s*=\s*["']gift:ready-request["']/);
  assert.match(channels, /GIFT_READY_ACK_EVENT\s*=\s*["']gift:ready-ack["']/);
  assert.match(bridge, /emitTo\(GIFT_WINDOW_LABEL, GIFT_EVENT_NAME/);
  assert.match(entry, /await import\(["']\.\/windows\/FloatingEventWindow["']\)/);
  assert.match(entry, /isEventWindowKind\(windowType\)/);
  assert.match(channels, /DISPLAY_WINDOW_LABEL\s*=\s*["']display["']/);
});

test("主窗口和侧栏提供收益窗的开关与锁定状态", () => {
  const app = readApplicationSources();
  const sidebar = read("src/components/Sidebar.tsx");
  assert.match(app, /startGiftBridge/);
  assert.match(app, /toggleGiftWindowLock/);
  assert.match(app, /giftOpen/);
  assert.match(sidebar, /onToggleGift/);
  assert.match(sidebar, /收益窗/);
  assert.doesNotMatch(sidebar, /特效窗（步骤 5）/);
});

test("主连接只把完成入列的右区事件投递给礼物窗", () => {
  const source = read("src/stores/connection.ts");
  const flushStart = source.indexOf("const flush = () =>");
  const onEventStart = source.indexOf("const onEvent", flushStart);
  const flushSource = source.slice(flushStart, onEventStart);
  assert.match(flushSource, /eventDelivery\.append\(patched\)/);
  assert.match(flushSource, /const mergedGift = mergeGiftInto\(next, ev\)/);
  assert.match(flushSource, /if \(mergedGift\.updated\) \{ const updated = mergedGift\.updated; deliveries\.push\(\(\) => eventDelivery\.updateGift\(updated\)\); \}/);
  assert.match(source, /eventDelivery\.switchRoom\(state\.roomId\)/);
  assert.match(read("src/runtime/liveEventDelivery.ts"), /switchGiftWindowRoom\(roomId\)/);
  assert.doesNotMatch(source.slice(onEventStart), /publishGiftEvent/);
});

test("礼物窗复用窗口时可以重新发起 ready 握手并清理投递失败窗口", () => {
  const bridge = read("src/windows/giftBridge.ts");
  const floating = read("src/windows/FloatingEventWindow.tsx");
  assert.match(bridge, /function requestGiftReady\(target: WebviewWindow\)/);
  assert.match(bridge, /if \(!session\.ready\) requestGiftReady\(giftWindow!\)/);
  assert.match(bridge, /emitTo\(GIFT_WINDOW_LABEL, GIFT_READY_REQUEST_EVENT, getGiftRoomState\(\)\)/);
  assert.match(bridge, /void closeGiftWindow\(\)\.catch/);
  assert.match(floating, /listen<EventWindowRoomStatePayload>\(config\.readyRequestEvent/);
  assert.match(floating, /applyRoomState\(event\.payload\)/);
  assert.match(bridge, /emitTo\(GIFT_WINDOW_LABEL, GIFT_READY_ACK_EVENT, expected\)/);
  assert.match(floating, /emitTo\("main", config\.readyEvent,/);
  assert.match(floating, /startReadyRetry\(\)/);
});

test("礼物窗复用弹幕窗的独立窗口行为与视觉契约", async () => {
  assert.equal(exists("src/windows/GiftWindow.tsx"), true);
  const gift = read("src/windows/GiftWindow.tsx");
  const eventWindow = read("src/windows/FloatingEventWindow.tsx");
  const bridge = read("src/windows/giftBridge.ts");
  const css = read("src/App.css");
  assert.match(gift, /FloatingEventWindow\s+kind=["']gift["']/);
  for (const pattern of [
    /setIgnoreCursorEvents\(nextLocked\)/,
    /startDragging\(\)/,
    /startResizeDragging\(/,
    /onMoved\(/,
    /onResized\(/,
    /setAlwaysOnTop\(/,
    /applyEventWindowMaterial\(/,
    /borderRadius: windowPreferences\.appearance\.material === 'transparent' \? 0 :/,
  ]) {
    assert.match(eventWindow, pattern);
  }
  const { applyEventWindowMaterial } = await import("../src/windows/eventWindowMaterial.ts");
  const calls = [];
  for (const material of ["glass", "solid", "transparent"]) {
    const radius = material === "transparent" ? 0 : 12;
    assert.deepEqual(await applyEventWindowMaterial(async (...args) => { calls.push(args); }, material, radius, "dark"), { backgroundBlur: material === "glass" ? "active" : "off" });
  }
  assert.deepEqual(calls, [["glass", 12, "dark", 0.18, null], ["solid", 12, "dark", 0.18, null], ["transparent", 0, "dark", 0.18, null]]);
  assert.match(bridge, /maximizable:\s*false/);
  assert.match(css, /\.gift-window/);
  assert.match(css, /\.sidebar-gift-controls/);
});

test("弹幕窗和礼物窗使用规整的统一默认尺寸", () => {
  assert.deepEqual(EVENT_WINDOW_DEFAULT_SIZE, { width: 360, height: 360 });
  const pair = createDefaultWindowPair({ x: 0, y: 0, width: 1920, height: 1080 });
  assert.deepEqual(pair, {
    display: { width: 360, height: 360, x: 1550, y: 10, center: false },
    gift: { width: 360, height: 360, x: 1550, y: 370, center: false },
  });
  assert.match(read("src/windows/eventWindowLayout.ts"), /EVENT_WINDOW_DEFAULT_SIZE/);
  assert.match(read("src/windows/displayBridge.ts"), /createDefaultWindowPair/);
  assert.match(read("src/windows/giftBridge.ts"), /createDefaultWindowPair/);
});

test("默认窗口布局将显示器物理工作区换算为逻辑窗口坐标", () => {
  assert.deepEqual(
    createDefaultWindowPair({ x: 0, y: 0, width: 2560, height: 1380, scaleFactor: 1.25 }),
    {
      display: { width: 360, height: 360, x: 1678, y: 10, center: false },
      gift: { width: 360, height: 360, x: 1678, y: 370, center: false },
    },
  );
  assert.doesNotMatch(read("src/windows/giftBridge.ts"), /DISPLAY_WINDOW_LABEL|readDisplayWindowSnapshot/);
  assert.doesNotMatch(read("src/windows/displayBridge.ts"), /center:\s*true/);
});

test("浮动窗口诊断记录跨屏缩放后的视口、窗口和事件列表状态", () => {
  const eventWindow = read("src/windows/FloatingEventWindow.tsx");
  const displayBridge = read("src/windows/displayBridge.ts");
  const giftBridge = read("src/windows/giftBridge.ts");
  assert.match(eventWindow, /onScaleChanged\(/);
  assert.match(eventWindow, /monitor-changed/);
  assert.match(eventWindow, /eventListScrollTop: list\?\.scrollTop/);
  assert.match(eventWindow, /devicePixelRatio/);
  assert.match(eventWindow, /eventListClientHeight/);
  assert.match(eventWindow, /eventListScrollHeight/);
  assert.match(eventWindow, /visibleEventRows/);
  assert.match(displayBridge, /toPhysicalWindowPlacement/);
  assert.match(giftBridge, /toPhysicalWindowPlacement/);
});

test("默认窗口位置可从逻辑像素转换回实际窗口使用的物理像素", () => {
  assert.equal(typeof eventWindowLayout.toPhysicalWindowPlacement, "function");
  assert.deepEqual(
    eventWindowLayout.toPhysicalWindowPlacement(
      { width: 360, height: 360, x: 1678, y: 8, center: false },
      1.25,
    ),
    { width: 450, height: 450, x: 2098, y: 10, center: false },
  );
});

test("没有显示器信息时仍生成不重叠的默认堆叠坐标", () => {
  assert.deepEqual(
    createDefaultWindowPair(null),
    {
      display: { width: 360, height: 360, x: 0, y: 0, center: false },
      gift: { width: 360, height: 360, x: 0, y: 360, center: false },
    },
  );
});

test("礼物窗恢复已有几何，包括没有自定义标记的旧几何", () => {
  assert.equal(shouldRestoreWindowGeometry("display", { x: 1, y: 2, width: 400, height: 488 }), true);
  assert.equal(shouldRestoreWindowGeometry("gift", { x: 1, y: 2, width: 400, height: 488 }), true);
  assert.equal(shouldRestoreWindowGeometry("gift", { x: 1, y: 2, width: 400, height: 488, custom: false }), true);
  assert.equal(shouldRestoreWindowGeometry("gift", { x: 1, y: 2, width: 400, height: 488, custom: true }), true);
});

test("两个副窗口先隐藏创建，几何恢复后由窗口自身显示，ready 负责桥接同步", () => {
  const bridge = read("src/windows/giftBridge.ts");
  const displayBridge = read("src/windows/displayBridge.ts");
  const eventWindow = read("src/windows/FloatingEventWindow.tsx");
  const displayWindow = read("src/windows/FloatingEventWindow.tsx");
  assert.match(bridge, /visible:\s*false/);
  assert.match(displayBridge, /visible:\s*false/);
  assert.match(bridge, /handleGiftReady[\s\S]*?\.show\(\)/);
  assert.match(displayBridge, /handleDisplayReady[\s\S]*?\.show\(\)/);
  assert.match(bridge, /WebviewWindow\.getByLabel\(GIFT_WINDOW_LABEL\)/);
  assert.match(displayBridge, /WebviewWindow\.getByLabel\(DISPLAY_WINDOW_LABEL\)/);
  assert.match(eventWindow, /geometryReadyRef/);
  assert.match(eventWindow, /await geometryReadyRef\.current/);
  assert.match(eventWindow, /currentWindow\.show\(\)/);
  assert.match(displayWindow, /currentWindow\.show\(\)/);
});
