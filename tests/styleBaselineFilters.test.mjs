import test from "node:test";
import assert from "node:assert/strict";
import { MsgType } from "../src/protocol/types.ts";
import { DEFAULT_AUDIENCE_FILTERS, isAllowedByAudienceFilters } from "../src/events/audienceFilters.ts";
import { createDefaultSceneSettings, loadSceneSettings } from "../src/components/sceneSettings.ts";
import { filterEventsForPane, updateEventProjection, DEFAULT_EVENT_FILTERS } from "../src/events/eventView.ts";

const base = { id: "e", roomId: 1, ts: 1, msgType: MsgType.Danmu, user: { uid: "u", uname: "用户", guardLevel: 0 } };

test("新增观众筛选默认不额外过滤，已知事实按阈值和当前房间判断", () => {
  assert.equal(isAllowedByAudienceFilters(base, DEFAULT_AUDIENCE_FILTERS, 1), true);
  assert.equal(isAllowedByAudienceFilters({ ...base, roomId: 2 }, { ...DEFAULT_AUDIENCE_FILTERS, showCrossRoomEvents: false }, 1), false);
  assert.equal(isAllowedByAudienceFilters({ ...base, user: { ...base.user, wealthLevel: 9 } }, { ...DEFAULT_AUDIENCE_FILTERS, minimumWealthLevel: 10 }, 1), false);
  assert.equal(isAllowedByAudienceFilters({ ...base, user: { ...base.user } }, { ...DEFAULT_AUDIENCE_FILTERS, minimumWealthLevel: 10 }, 1), true, "未知荣耀等级保留");
  assert.equal(isAllowedByAudienceFilters({ ...base, user: { ...base.user, medal: { name: "他房", level: 30, isCurrentRoom: false } } }, { ...DEFAULT_AUDIENCE_FILTERS, minimumCurrentRoomMedalLevel: 10 }, 1), false);
  assert.equal(isAllowedByAudienceFilters({ ...base, user: { ...base.user, medal: { name: "未知", level: 1 } } }, { ...DEFAULT_AUDIENCE_FILTERS, minimumCurrentRoomMedalLevel: 10 }, 1), true, "归属未知保留");
  assert.equal(isAllowedByAudienceFilters({ ...base, user: { ...base.user, medal: { name: "本房", level: 10, isCurrentRoom: true } } }, { ...DEFAULT_AUDIENCE_FILTERS, minimumCurrentRoomMedalLevel: 10 }, 1), true);
});
test("现场最低显示金额缺失时为0.1，用户明确保存0时保留", () => {
  assert.equal(createDefaultSceneSettings().giftThreshold, 0.1);
  const storage = value => ({ getItem: () => JSON.stringify(value), setItem() {} });
  assert.equal(loadSceneSettings(storage({})).giftThreshold, 0.1);
  assert.equal(loadSceneSettings(storage({ giftThreshold: 0 })).giftThreshold, 0);
});

test("SC和大航海分类与收益区使用同一金额门槛，门槛变化重建已有投影", () => {
  const sc = { ...base, id: "sc", msgType: MsgType.SuperChat, sc: { price: 30, message: "", duration: 30 } };
  const guard = { ...base, id: "guard", msgType: MsgType.GuardBuy, guard: { level: 1, count: 1, priceRmb: 30 } };
  assert.deepEqual(filterEventsForPane([sc], "superChat", DEFAULT_EVENT_FILTERS, 100), []);
  assert.deepEqual(filterEventsForPane([guard], "guard", DEFAULT_EVENT_FILTERS, 100), []);
  const visible = updateEventProjection(null, [sc], "superChat", DEFAULT_EVENT_FILTERS, 10, 1);
  assert.deepEqual(visible.indices, [0]);
  assert.deepEqual(updateEventProjection(visible, [sc], "superChat", DEFAULT_EVENT_FILTERS, 100, 1).indices, []);
});
