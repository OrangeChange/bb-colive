import test from "node:test";
import assert from "node:assert/strict";
import { MsgType } from "../src/protocol/types.ts";
import { appendDisplayEvent } from "../src/windows/displayWindowModel.ts";
import { appendGiftWindowEvent, applyGiftWindowControl, createGiftWindowControlState } from "../src/windows/giftWindowModel.ts";
import { normalizeEventWindowPreferences } from "../src/windows/eventWindowPreferences.ts";
import { normalizeStickyEventSettings, stickyCandidate } from "../src/windows/stickyEventModel.ts";

const danmu = id => ({ id: String(id), roomId: 1, ts: id, msgType: MsgType.Danmu, text: String(id) });
const gift = id => ({ id: String(id), roomId: 1, ts: id, msgType: MsgType.Gift, gift: { id, name: "礼物", count: 1, priceRmb: 1, paymentRmb: 1, coinType: "gold" } });

test("副窗口容量只保留合并后的最后N条且范围为1至100", () => {
  for (const capacity of [1, 50, 100]) {
    let display = [];
    let revenue = [];
    for (let index = 0; index <= capacity; index += 1) {
      display = appendDisplayEvent(display, danmu(index), capacity);
      revenue = appendGiftWindowEvent(revenue, gift(index), capacity);
    }
    assert.equal(display.length, capacity);
    assert.equal(revenue.length, capacity);
    assert.equal(display.at(-1).id, String(capacity));
  }
  assert.equal(normalizeEventWindowPreferences({ capacity: 0 }).capacity, 1);
  assert.equal(normalizeEventWindowPreferences({ capacity: 101 }).capacity, 100);
});
test("置顶默认20且上限100，礼物SC大航海共用大于等于金额门槛", () => {
  assert.equal(normalizeStickyEventSettings({}).maxCount, 20);
  assert.equal(normalizeStickyEventSettings({ maxCount: 101 }).maxCount, 100);
  const settings = normalizeStickyEventSettings({ enabled: true, giftThreshold: 30 });
  const base = { roomId: 1, ts: 1 };
  assert.ok(stickyCandidate({ ...base, id: "gift", msgType: MsgType.Gift, gift: { paymentRmb: 30, priceRmb: 30, count: 1, coinType: "gold" } }, settings));
  assert.ok(stickyCandidate({ ...base, id: "sc", msgType: MsgType.SuperChat, sc: { price: 30 } }, settings));
  assert.ok(stickyCandidate({ ...base, id: "guard", msgType: MsgType.GuardBuy, guard: { priceRmb: 30 } }, settings));
  assert.equal(stickyCandidate({ ...base, id: "sc-low", msgType: MsgType.SuperChat, sc: { price: 29.99 } }, settings), null);
});

test("当前房间会话保留SC删除和活动结束事实，重放不能复活", () => {
  const state = createGiftWindowControlState();
  const sc = { ...gift(1), id: "sc-1", msgType: MsgType.SuperChat, sc: { price: 30, message: "SC" } };
  const deletion = { ...gift(2), msgType: MsgType.ScDeleted, scDeleteIds: ["sc-1"] };
  assert.equal(applyGiftWindowControl(state, sc)?.id, "sc-1");
  assert.equal(applyGiftWindowControl(state, deletion)?.msgType, MsgType.ScDeleted);
  assert.equal(applyGiftWindowControl(state, sc), null);

  const start = { ...gift(3), id: "lot-start", msgType: MsgType.AnchorLotStart, lottery: { id: 7, maxTime: 30 } };
  const end = { ...gift(4), id: "lot-end", msgType: MsgType.AnchorLotAward, lottery: { id: 7 } };
  assert.equal(applyGiftWindowControl(state, start)?.msgType, MsgType.AnchorLotStart);
  assert.equal(applyGiftWindowControl(state, end)?.msgType, MsgType.AnchorLotAward);
  assert.equal(applyGiftWindowControl(state, start), null);

  state.clear();
  assert.equal(applyGiftWindowControl(state, sc)?.id, "sc-1");
  assert.equal(applyGiftWindowControl(state, start)?.msgType, MsgType.AnchorLotStart);
});
