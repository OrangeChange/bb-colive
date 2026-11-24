import test from "node:test";
import assert from "node:assert/strict";
import { MsgType } from "../src/protocol/types.ts";
import { appendDisplayEvent } from "../src/windows/displayWindowModel.ts";
import { appendGiftWindowEvent } from "../src/windows/giftWindowModel.ts";
import { DEFAULT_EVENT_WINDOW_PREFERENCES, normalizeEventWindowPreferences } from "../src/windows/eventWindowPreferences.ts";
import { DEFAULT_STICKY_EVENT_SETTINGS, createStickyProjection, selectStickyEvents, stickyGiftDuration } from "../src/windows/stickyEventModel.ts";
import { isEventWindowEventForRoom } from "../src/windows/eventWindowChannels.ts";
import { isPaidEventVisibleAtThreshold } from "../src/giftThreshold.ts";
import { createStylePreviewPartEvents } from "../src/components/stylePreviewEvents.ts";
import { COMBO_WINDOW_MS, mergeGiftInto } from "../src/events/giftMerge.ts";

const event = (id, msgType = MsgType.Danmu, extra = {}) => ({
  id,
  reactKey: `row:${id}`,
  roomId: 1,
  ts: 1_000,
  msgType,
  ...extra,
});

test("副窗口严格 N=1，兼容投影不会再保留额外退场行", () => {
  const first = { ...event("a"), receivedAt: 1_000 };
  const second = { ...event("b"), receivedAt: 2_000 };
  const admitted = appendDisplayEvent(appendDisplayEvent([], first, 1), second, 1);
  assert.deepEqual(admitted.map((row) => row.reactKey), ["row:b"]);
});

test("付费门槛沿用软件的两位小数、单件／累计和未知保留口径", () => {
  const gift = (priceRmb, count = 1) => event("gift", MsgType.Gift, {
    gift: { id: 1, name: "礼物", count, priceRmb, isFree: false },
  });

  assert.equal(isPaidEventVisibleAtThreshold(gift(0.099), 0.1, "unit"), false);
  assert.equal(isPaidEventVisibleAtThreshold(gift(0.1), 0.1, "unit"), true);
  assert.equal(isPaidEventVisibleAtThreshold(gift(0.101), 0.1, "unit"), true);
  assert.equal(isPaidEventVisibleAtThreshold(gift(0.06, 2), 0.1, "unit"), false);
  assert.equal(isPaidEventVisibleAtThreshold(gift(0.06, 2), 0.1, "cumulative"), true);
  assert.equal(isPaidEventVisibleAtThreshold(gift(undefined), 0.1, "unit"), true);
});

test("收益窗口先处理 SC 删除，再按严格上限输出", () => {
  const sc = event("sc-2", MsgType.SuperChat, { sc: { price: 30, duration: 60, message: "正文" } });
  const deleted = appendGiftWindowEvent([sc], event("delete", MsgType.ScDeleted, { scDeleteIds: ["sc-2"] }), 1);
  assert.equal(deleted.length, 1);
  assert.equal(deleted[0].scDeleted, true);
});

test("副窗口容量、定时与弹幕合并沿用软件默认值和边界", () => {
  assert.equal(DEFAULT_EVENT_WINDOW_PREFERENCES.capacity, 50);
  assert.deepEqual(DEFAULT_EVENT_WINDOW_PREFERENCES.eventExpiry, { enabled: false, seconds: 10 });
  assert.equal(DEFAULT_EVENT_WINDOW_PREFERENCES.mergeSameDanmu, false);
  assert.equal(DEFAULT_EVENT_WINDOW_PREFERENCES.sameDanmuWindowSeconds, 8);

  assert.equal(normalizeEventWindowPreferences({ capacity: 0 }).capacity, 1);
  assert.equal(normalizeEventWindowPreferences({ capacity: 101 }).capacity, 100);
  assert.equal(normalizeEventWindowPreferences({ eventExpiry: { enabled: true, seconds: 0 } }).eventExpiry.seconds, 1);
  assert.equal(normalizeEventWindowPreferences({ eventExpiry: { enabled: true, seconds: 3601 } }).eventExpiry.seconds, 3600);
  assert.equal(normalizeEventWindowPreferences({ sameDanmuWindowSeconds: 0 }).sameDanmuWindowSeconds, 1);
  assert.equal(normalizeEventWindowPreferences({ sameDanmuWindowSeconds: 61 }).sameDanmuWindowSeconds, 60);
});

test("置顶沿用共享默认值、14 档寿命、入队计时和真实结束", () => {
  assert.deepEqual(DEFAULT_STICKY_EVENT_SETTINGS, {
    enabled: false,
    obsEnabled: true,
    position: "top",
    giftThreshold: 30,
    maxCount: 20,
    sort: "amount",
  });
  assert.deepEqual([0.99, 4, 9, 14, 29, 49, 99, 499, 999, 1999, 4999, 9999, 19999, 20000].map(stickyGiftDuration), [4, 6, 10, 20, 30, 60, 120, 300, 1800, 3600, 7200, 10800, 14400, 18000]);

  const settings = { ...DEFAULT_STICKY_EVENT_SETTINGS, enabled: true };
  const projection = createStickyProjection();
  projection.configure(settings, 10_000);
  const gift = event("paid", MsgType.Gift, { gift: { id: 1, name: "礼物", count: 1, paymentRmb: 30, priceRmb: 30, isFree: false } });
  projection.accept(gift, 10_000);
  projection.accept({ ...gift, ts: 20_000 }, 20_000);
  assert.equal(selectStickyEvents(projection.snapshot(20_000), settings, 20_000)[0].expiresAt, 70_000);

  projection.accept(event("lot", MsgType.AnchorLotStart, { lottery: { id: 9, maxTime: 120 } }), 20_000);
  projection.accept(event("lot-end", MsgType.AnchorLotAward, { lottery: { id: 9 } }), 21_000);
  assert.equal(projection.snapshot(21_000).some((item) => item.msgType === MsgType.AnchorLotStart), false);
});

test("OBS 和副窗口连接状态只接受目标房间", () => {
  assert.equal(isEventWindowEventForRoom({ roomId: 100 }, 100), true);
  assert.equal(isEventWindowEventForRoom({ roomId: 101 }, 100), false);
  assert.equal(isEventWindowEventForRoom({ roomId: 100 }, null), false);
});

test("原生预览不展示封面状态控制事件或未识别通知", () => {
  const types = createStylePreviewPartEvents("混合流").map((item) => item.msgType);
  assert.equal(types.includes(MsgType.CoverAudit), false);
  assert.equal(types.includes(MsgType.Unknown), false);
});

test("礼物复用软件八秒合并，盲盒结果之间不误合并", () => {
  assert.equal(COMBO_WINDOW_MS, 8_000);
  const gift = (id, ts, extra = {}) => event(id, MsgType.Gift, {
    ts,
    user: { uid: "gift-user", uname: "用户", guardLevel: 0 },
    gift: { id: 1, name: "礼物", count: 1, priceRmb: 1, totalRmb: 1, ...extra },
  });
  const rows = [gift("first", 1_000)];
  assert.ok(mergeGiftInto(rows, gift("second", 9_000))?.updated);
  assert.equal(rows[0].gift.count, 2);
  assert.equal(mergeGiftInto(rows, gift("blind", 9_001, { blindGiftName: "盲盒" })), null);
});
