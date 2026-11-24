import test from "node:test";
import assert from "node:assert/strict";
import { MsgType } from "../src/protocol/types.ts";
import { mergeGiftInto } from "../src/events/giftMerge.ts";
import { getEventBookmarkKey, getEventMarkKey } from "../src/events/eventIdentity.ts";

const user = { uid: "6838639", uname: "一见钟情528", guardLevel: 1 };

test('普通连击累计金额补齐支付，盲盒不借开出价值补支付', () => {
  for (const blind of [false,true]) {
    const rows=[giftEvent({id:1,name:'礼物',count:1,priceRmb:30,total:30000,totalRmb:30,paymentRmb:30,coinType:'gold',...(blind?{blindGiftName:'盲盒'}:{})},{comboId:'c'})];
    mergeGiftInto(rows,giftEvent({id:1,name:'礼物',count:2,total:60000,totalRmb:60,coinType:'gold'},{comboId:'c',isComboUpdate:true,ts:1100}));
    assert.equal(rows[0].gift.paymentRmb,blind?undefined:60);
  }
});

function giftEvent(gift, extra = {}) {
  return {
    id: extra.id ?? "event-1",
    msgType: MsgType.Gift,
    ts: extra.ts ?? 1000,
    comboId: extra.comboId,
    isComboUpdate: extra.isComboUpdate,
    roomId: 101,
    reactKey: extra.reactKey,
    dedupe: extra.dedupe,
    annotationIdentity: extra.annotationIdentity,
    user,
    gift,
  };
}

for (const comboId of ["c1", undefined]) {
  test(`两笔各一元的礼物合并支付且保留行身份（${comboId ?? "窗口匹配"}）`, () => {
    const first = giftEvent({ id: 1, name: "小花", count: 1, price: 1000, total: 1000,
      priceRmb: 1, totalRmb: 1, paymentRmb: 1 },
    { comboId, reactKey: "row-1", dedupe: "gift-1" });
    const keys = [getEventMarkKey(first), getEventBookmarkKey(first)];
    const marks = new Set([keys[0]]);
    const bookmarks = new Set([keys[1]]);
    const rows = [first];
    const incoming = giftEvent({ ...first.gift }, { id: "event-2", comboId, ts: 1100 });
    const original = JSON.stringify([first, incoming]);
    assert.ok(mergeGiftInto(rows, incoming)?.updated);
    assert.equal(rows[0].gift.count, 2);
    assert.equal(rows[0].gift.totalRmb, 2);
    assert.equal(rows[0].gift.paymentRmb, 2);
    assert.equal(rows[0].id, first.id);
    assert.equal(rows[0].reactKey, first.reactKey);
    assert.equal(rows[0].dedupe, first.dedupe);
    assert.deepEqual([getEventMarkKey(rows[0]), getEventBookmarkKey(rows[0])], keys);
    assert.ok(marks.has(getEventMarkKey(rows[0])));
    assert.ok(bookmarks.has(getEventBookmarkKey(rows[0])));
    assert.equal(JSON.stringify([first, incoming]), original);
  });
}

for (const sample of [
  { name: "累计可信支付替换", count: 3, previous: 1, incoming: 2.5, cumulative: true, want: 2.5 },
  { name: "完整数量保留支付", count: 1, previous: 1, incoming: undefined, cumulative: true, want: 1 },
  { name: "数量扩大支付未知", count: 3, previous: 1, incoming: undefined, cumulative: true, want: undefined },
  { name: "未知增量使支付未知", count: 1, previous: 1, incoming: undefined, cumulative: false, want: undefined },
]) {
  test(`窗口合并金额并保留新增comboId前的收藏标记：${sample.name}`, () => {
    const first = giftEvent({ id: 1, name: "小花", count: 1, price: 1000, total: 1000,
      priceRmb: 1, totalRmb: 1, paymentRmb: sample.previous });
    const identity = { markKey: getEventMarkKey(first), bookmarkKey: getEventBookmarkKey(first) };
    const rows = [first];
    const incoming = giftEvent({ ...first.gift, count: sample.count, total: sample.count * 1000,
      totalRmb: sample.count, paymentRmb: sample.incoming },
    { id: "event-2", ts: 1100, comboId: "new-combo", isComboUpdate: sample.cumulative });
    assert.ok(mergeGiftInto(rows, incoming)?.updated);
    assert.equal(rows[0].gift.paymentRmb, sample.want);
    assert.equal(rows[0].gift.count, sample.cumulative ? sample.count : 1 + sample.count);
    assert.deepEqual(rows[0].annotationIdentity, identity);
    assert.equal(getEventMarkKey(rows[0]), identity.markKey);
    assert.equal(getEventBookmarkKey(rows[0]), identity.bookmarkKey);
  });
}

test("盲盒结果到达时，升级同一连击的普通占位行而不新增重复行", () => {
  const placeholder = giftEvent(
    { id: 32128, name: "爱心抱枕", count: 4, price: 16, total: 60, totalRmb: 60 },
    { id: "combo-1:4", comboId: "combo-1", isComboUpdate: true },
  );
  const blind = giftEvent(
    {
      id: 32128,
      name: "爱心抱枕",
      count: 4,
      price: 16,
      total: 60,
      totalRmb: 60,
      blindGiftName: "心动盲盒",
      blindPriceRmb: 15,
      blindHitPriceRmb: 16,
    },
    { id: "gift-v1-1", comboId: "combo-1", ts: 1100 },
  );
  const next = [placeholder];

  const result = mergeGiftInto(next, blind);

  assert.ok(result?.updated);
  assert.equal(next.length, 1);
  assert.equal(next[0], result.updated);
  assert.equal(next[0].gift.blindGiftName, "心动盲盒");
  assert.equal(next[0].gift.blindPriceRmb, 15);
});

test("普通连击更新不能覆盖已经识别的盲盒字段", () => {
  const blind = giftEvent(
    {
      id: 32128,
      name: "爱心抱枕",
      count: 1,
      price: 16,
      total: 15,
      totalRmb: 15,
      blindGiftName: "心动盲盒",
      blindPriceRmb: 15,
      blindHitPriceRmb: 16,
    },
    { id: "gift-v1-1", comboId: "combo-1", ts: 1000 },
  );
  const combo = giftEvent(
    { id: 32128, name: "爱心抱枕", count: 4, price: 16, total: 60, totalRmb: 60 },
    { id: "combo-1:4", comboId: "combo-1", isComboUpdate: true, ts: 1200 },
  );
  const next = [blind];

  const result = mergeGiftInto(next, combo);

  assert.ok(result?.updated);
  assert.equal(next.length, 1);
  assert.equal(next[0].gift.blindGiftName, "心动盲盒");
  assert.equal(next[0].gift.count, 4);
});

test("盲盒结果之间仍然各自成行，不互相合并", () => {
  const first = giftEvent(
    { id: 32128, name: "爱心抱枕", count: 4, blindGiftName: "心动盲盒" },
    { id: "gift-v1-1", comboId: "combo-1" },
  );
  const second = giftEvent(
    { id: 32128, name: "爱心抱枕", count: 4, blindGiftName: "心动盲盒" },
    { id: "gift-v1-2", comboId: "combo-1" },
  );

  assert.equal(mergeGiftInto([first], second), null);
});
