import test from "node:test";
import assert from "node:assert/strict";
import { MsgType } from "../src/protocol/types.ts";
import {
  isPaidEventVisibleAtThreshold,
  paidEventAmount,
} from "../src/giftThreshold.ts";

const event = (msgType, extra = {}) => ({ id: String(msgType), msgType, roomId: 1, ts: 1, ...extra });

test("最低显示金额统一覆盖礼物、醒目留言和大航海购买", () => {
  const gift = event(MsgType.Gift, { gift: { priceRmb: 0.09, count: 1 } });
  const sc = event(MsgType.SuperChat, { sc: { price: 0.09 } });
  const guard = event(MsgType.GuardBuy, { guard: { priceRmb: 0.09, count: 1 } });

  assert.equal(isPaidEventVisibleAtThreshold(gift, 0.1), false);
  assert.equal(isPaidEventVisibleAtThreshold(sc, 0.1), false);
  assert.equal(isPaidEventVisibleAtThreshold(guard, 0.1), false);
});

test("累计金额使用事件总额且保留浮点边界", () => {
  const gift = event(MsgType.Gift, { gift: { priceRmb: 0.29, count: 3 } });
  const guard = event(MsgType.GuardBuy, { guard: { priceRmb: 0.29, count: 3 } });

  assert.ok(Math.abs(paidEventAmount(gift, "cumulative") - 0.87) < Number.EPSILON);
  assert.ok(Math.abs(paidEventAmount(guard, "cumulative") - 0.87) < Number.EPSILON);
  assert.equal(isPaidEventVisibleAtThreshold(gift, 0.87, "cumulative"), true);
  assert.equal(isPaidEventVisibleAtThreshold(guard, 0.87, "cumulative"), true);
});

test("未知金额和非付费事件不因门槛消失", () => {
  assert.equal(isPaidEventVisibleAtThreshold(event(MsgType.SuperChat), 10), true);
  assert.equal(isPaidEventVisibleAtThreshold(event(MsgType.GuardHonor), 10), true);
  assert.equal(isPaidEventVisibleAtThreshold(event(MsgType.RedPocketStart), 10), true);
});
