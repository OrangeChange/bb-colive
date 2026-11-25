import test from "node:test";
import assert from "node:assert/strict";
import { MsgType } from "../src/protocol/types.ts";
import { formatGiftSummary, summarizeGiftEvents } from "../src/components/eventSummary.ts";

const gift = (id, extra = {}) => ({ id, msgType: MsgType.Gift, gift: { count: 1, ...extra } });

test("礼物区域按当前可见事件累计金额，红包和天选不计入收益", () => {
  const events = [
    gift("paid", { totalRmb: 12.5 }),
    gift("free", { totalRmb: 0, isFree: true }),
    { id: "pocket", msgType: MsgType.RedPocketGift, gift: { totalRmb: 99 } },
    { id: "lot", msgType: MsgType.AnchorLotAward, lottery: { totalPrice: 88 } },
  ];
  assert.deepEqual(summarizeGiftEvents(events, [0, 1, 2, 3]), { totalRmb: 12.5, blindProfitRmb: 0, blindCount: 0 });
  assert.deepEqual(summarizeGiftEvents(events, [1]), { totalRmb: 0, blindProfitRmb: 0, blindCount: 0 });
});

test("盲盒总收益使用爆出批量价值，并额外计算爆出价值减投喂价值", () => {
  const events = [gift("blind", {
    count: 2, totalRmb: 4, blindPriceRmb: 2, blindHitPriceRmb: 3,
    blindGiftName: "心动盲盒",
  })];
  assert.deepEqual(summarizeGiftEvents(events, [0]), { totalRmb: 6, blindProfitRmb: 2, blindCount: 1 });
  assert.equal(formatGiftSummary({ totalRmb: 6, blindProfitRmb: 2, blindCount: 1 }), "总收益 ¥6 · 盲盒盈亏 ▲+2");
  assert.equal(formatGiftSummary({ totalRmb: 4, blindProfitRmb: -2, blindCount: 1 }), "总收益 ¥4 · 盲盒盈亏 ▼-2");
  assert.equal(formatGiftSummary({ totalRmb: 12.5, blindProfitRmb: 0, blindCount: 0 }), "总收益 ¥12.50");
  assert.equal(formatGiftSummary({ totalRmb: 0, blindProfitRmb: 0, blindCount: 1 }), "总收益 ¥0 · 盲盒盈亏 0");
});
test("收益汇总包含当前可见的 SC 和大航海，开通金额不重复乘月数", () => {
  const events = [
    { msgType: MsgType.Gift, gift: { count: 1, totalRmb: 2 } },
    { msgType: MsgType.SuperChat, sc: { price: 30 } },
    { msgType: MsgType.GuardBuy, guard: { count: 3, priceRmb: 414 } },
    { msgType: MsgType.GuardBuy, guard: {} },
  ];
  assert.equal(summarizeGiftEvents(events, [0, 1, 2, 3]).totalRmb, 446);
  assert.equal(summarizeGiftEvents(events, [1]).totalRmb, 30);
  assert.equal(summarizeGiftEvents(events, [2]).totalRmb, 414);
});
