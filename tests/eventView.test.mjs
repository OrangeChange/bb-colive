import test from "node:test";
import assert from "node:assert/strict";
import { MsgType } from "../src/protocol/types.ts";
import {
  getGiftKind,
  filterEventsForPane,
  getEventSearchText,
  getEventVisibilityReason,
  isEventVisibleInPane,
  isGiftVisibleAtThreshold,
} from "../src/events/eventView.ts";

const user = { uid: "1", uname: "测试用户", guardLevel: 0 };
const allInteractKinds = {
  entry: true,
  follow: true,
  share: true,
  specialFollow: true,
  mutualFollow: true,
  like: true,
};
const allGiftKinds = {
  free: true,
  normal: true,
  blind: true,
  redPocket: true,
  anchorLot: true,
};
const event = (msgType, extra = {}) => ({
  id: String(msgType),
  msgType,
  roomId: 1,
  ts: 1,
  user,
  ...extra,
});

test("现场按正文缺失的结构化回复目标搜索且保留发送者范围", () => {
  const reply = event(MsgType.Danmu, { text: "这期神了", replyTo: { uid: "2", uname: "目标用户" } });
  assert.match(getEventSearchText(reply), /@目标用户/);
  assert.equal(filterEventsForPane([reply], "left", { danmu: true, interact: true }, 0, { text: "目标用户" }).length, 1);
  assert.match(getEventSearchText(reply), /测试用户/);
  assert.equal(reply.text, "这期神了");
});

test("左区只显示弹幕和互动，系统事件由提醒模块承载", () => {
  const events = [
    event(MsgType.Danmu),
    event(MsgType.Interact),
    event(MsgType.Warning),
    event(MsgType.Gift),
  ];

  const result = filterEventsForPane(events, "left", {
    danmu: true,
    interact: false,
    system: true,
  });

  assert.deepEqual(result.map((item) => item.msgType), [MsgType.Danmu]);
});

test("右区按具体收益类型筛选，红包和天选仍归入礼物", () => {
  const events = [
    event(MsgType.Gift),
    event(MsgType.RedPocketStart),
    event(MsgType.AnchorLotAward),
    event(MsgType.SuperChat),
    event(MsgType.GuardBuy),
  ];

  const result = filterEventsForPane(events, "right", {
    gift: true,
    superChat: false,
    guard: false,
  });

  assert.deepEqual(result.map((item) => item.msgType), [
    MsgType.Gift,
    MsgType.RedPocketStart,
    MsgType.AnchorLotAward,
  ]);
});

test("双区右区按最低显示金额过滤低价付费事件", () => {
  const events = [
    event(MsgType.Gift, { id: "cheap", gift: { name: "低价礼物", priceRmb: 0.1, isFree: false } }),
    event(MsgType.Gift, { id: "kept", gift: { name: "达标礼物", priceRmb: 1, isFree: false } }),
    event(MsgType.SuperChat, { id: "cheap-sc", sc: { price: 0.1 } }),
    event(MsgType.SuperChat, { id: "sc", sc: { price: 1 } }),
    event(MsgType.GuardBuy, { id: "cheap-guard", guard: { priceRmb: 0.1, count: 1 } }),
    event(MsgType.GuardHonor, { id: "guard-entry" }),
  ];
  const filters = {
    left: { danmu: true, interact: true, interactKinds: { ...allInteractKinds } },
    right: { gift: true, giftKinds: { ...allGiftKinds }, superChat: true, guard: true },
  };

  assert.deepEqual(
    filterEventsForPane(events, "right", filters, 0.5).map((item) => item.id),
    ["kept", "sc", "guard-entry"],
  );
});

test("礼物阈值按单件价格判断，免费礼物可被阈值过滤", () => {
  assert.equal(isGiftVisibleAtThreshold({ priceRmb: 10, isFree: false }, 10), true);
  assert.equal(isGiftVisibleAtThreshold({ priceRmb: 9.99, isFree: false }, 10), false);
  assert.equal(isGiftVisibleAtThreshold({ priceRmb: 0, isFree: true }, 1), false);
  assert.equal(isGiftVisibleAtThreshold({ priceRmb: 0, isFree: true }, 0), true);
});

test("礼物阈值按累计金额判断时使用事件内单价乘数量", () => {
  assert.equal(isGiftVisibleAtThreshold({ priceRmb: 2, count: 3, isFree: false }, 6, "cumulative"), true);
  assert.equal(isGiftVisibleAtThreshold({ priceRmb: 2, count: 2, isFree: false }, 6, "cumulative"), false);
});

test("仅显示大航海进房时只过滤普通进房互动", () => {
  const filters = {
    left: { danmu: true, interact: true, interactKinds: { ...allInteractKinds } },
    right: { gift: true, giftKinds: { ...allGiftKinds }, superChat: true, guard: true },
  };
  const normalEntry = event(MsgType.Interact, { interactKind: "entry" });
  const follow = event(MsgType.Interact, { interactKind: "follow" });
  const guardBuy = event(MsgType.GuardBuy, { guard: { action: "开通舰长" } });

  assert.equal(isEventVisibleInPane(normalEntry, "left", filters, 0, {}, "unit", true), false);
  assert.equal(isEventVisibleInPane(follow, "left", filters, 0, {}, "unit", true), true);
  assert.equal(isEventVisibleInPane(guardBuy, "right", filters, 0, {}, "unit", true), true);
});

test("未知价格保留显示，盲盒按实际投喂单价参与阈值筛选", () => {
  assert.equal(isGiftVisibleAtThreshold({}, 10), true);
  assert.equal(isGiftVisibleAtThreshold({ blindGiftName: "盲盒", blindPriceRmb: 1, priceRmb: 10 }, 2), false);
  assert.equal(isGiftVisibleAtThreshold({ blindGiftName: "盲盒", blindPriceRmb: 2, priceRmb: 1 }, 2), true);
  assert.equal(isGiftVisibleAtThreshold({ blindGiftName: "盲盒", priceRmb: 10 }, 2), true);
});

test("二级筛选按互动六类和礼物子类型生效，关闭一级不清空选择", () => {
  const events = [
    event(MsgType.Interact, { interactKind: "entry" }),
    event(MsgType.Interact, { interactKind: "follow" }),
    event(MsgType.Interact, { interactKind: "like" }),
    event(MsgType.Gift, { gift: { priceRmb: 10, blindGiftName: undefined } }),
    event(MsgType.Gift, { gift: { priceRmb: 10, blindGiftName: "盲盒" } }),
    event(MsgType.RedPocketStart),
    event(MsgType.AnchorLotStart),
  ];
  const filterState = {
    left: {
      danmu: true,
      interact: true,
      interactKinds: { ...allInteractKinds, entry: false, like: false },
    },
    right: {
      gift: true,
      giftKinds: { ...allGiftKinds, normal: false, anchorLot: false },
      superChat: true,
      guard: true,
    },
  };

  assert.deepEqual(filterEventsForPane(events, "interact", filterState).map((item) => item.interactKind), ["follow"]);
  assert.deepEqual(filterEventsForPane(events, "gift", filterState).map((item) => item.msgType), [MsgType.Gift, MsgType.RedPocketStart]);

  const primaryOff = {
    ...filterState,
    left: { ...filterState.left, interact: false },
    right: { ...filterState.right, gift: false },
  };
  assert.deepEqual(filterEventsForPane(events, "interact", primaryOff), []);
  assert.deepEqual(filterState.left.interactKinds, { ...allInteractKinds, entry: false, like: false });
  assert.deepEqual(filterState.right.giftKinds, { ...allGiftKinds, normal: false, anchorLot: false });
});

test("免费礼物位于普通礼物之前，并与付费普通礼物分开筛选", async () => {
  const view = await import("../src/events/eventView.ts");
  assert.deepEqual(view.GIFT_KIND_OPTIONS.map(({ key, label }) => [key, label]), [
    ["free", "免费礼物"], ["normal", "普通礼物"], ["blind", "盲盒礼物"], ["redPocket", "红包"], ["anchorLot", "天选"],
  ]);
  const events = [
    event(MsgType.Gift, { id: "free", gift: { priceRmb: 0, isFree: true } }),
    event(MsgType.Gift, { id: "paid", gift: { priceRmb: 1, isFree: false } }),
  ];
  const base = { gift: true, giftKinds: { ...allGiftKinds }, superChat: true, guard: true };
  assert.deepEqual(view.filterEventsForPane(events, "gift", { ...base, giftKinds: { ...base.giftKinds, free: false } }).map((item) => item.id), ["paid"]);
  assert.deepEqual(view.filterEventsForPane(events, "gift", { ...base, giftKinds: { ...base.giftKinds, normal: false } }).map((item) => item.id), ["free"]);
});

test("现场分类支持一次性全选和取消全选", async () => {
  const view = await import("../src/events/eventView.ts");

  assert.equal(view.areAllEventCategoriesEnabled(view.DEFAULT_EVENT_FILTERS), true);

  const cleared = view.setAllEventCategories(view.DEFAULT_EVENT_FILTERS, false);
  assert.equal(view.areAllEventCategoriesEnabled(cleared), false);
  assert.equal(cleared.left.danmu, false);
  assert.equal(cleared.left.interactKinds.entry, false);
  assert.equal(cleared.right.giftKinds.normal, false);
  assert.equal(cleared.right.guard, false);

  const restored = view.setAllEventCategories(cleared, true);
  assert.equal(view.areAllEventCategoriesEnabled(restored), true);
  assert.deepEqual(restored, view.DEFAULT_EVENT_FILTERS);
});

test("用户名筛选覆盖所有面板，文字搜索匹配事件可见文字", async () => {
  const view = await import("../src/events/eventView.ts");
  const other = { uid: "2", uname: "另一用户", guardLevel: 0 };
  const events = [
    event(MsgType.Danmu, { id: "danmu", text: "晚安" }),
    event(MsgType.Interact, { id: "interact", text: "进入直播间" }),
    event(MsgType.Gift, { id: "gift", gift: { name: "棉花糖", priceRmb: 1, totalRmb: 1 } }),
    event(MsgType.SuperChat, { id: "sc", sc: { message: "醒目留言" } }),
    event(MsgType.GuardBuy, { id: "guard", text: "开通舰长" }),
    event(MsgType.Danmu, { id: "other", user: other, text: "晚安" }),
  ];
  const filters = {
    left: { danmu: true, interact: true, interactKinds: { entry: true, follow: true, share: true, specialFollow: true, mutualFollow: true, like: true } },
    right: { gift: true, giftKinds: { free: true, normal: true, blind: true, redPocket: true, anchorLot: true }, superChat: true, guard: true },
  };
  const userQuery = { userId: "1", userName: "测试用户" };
  assert.deepEqual(view.filterEventsForPane(events, "left", filters, 0, userQuery).map((item) => item.id), ["danmu", "interact"]);
  assert.deepEqual(view.filterEventsForPane(events, "right", filters, 0, userQuery).map((item) => item.id), ["gift", "sc", "guard"]);
  assert.deepEqual(view.filterEventsForPane(events, "gift", filters, 0, { text: "棉花糖" }).map((item) => item.id), ["gift"]);
  assert.deepEqual(view.filterEventsForPane(events, "superChat", filters, 0, { text: "醒目留言" }).map((item) => item.id), ["sc"]);
});

test("事件投影能解释事件未显示的固定原因", () => {
  const base = {
    left: { danmu: true, interact: true, interactKinds: { ...allInteractKinds } },
    right: { gift: true, giftKinds: { ...allGiftKinds }, superChat: true, guard: true },
  };
  assert.equal(
    getEventVisibilityReason(event(MsgType.Gift), "gift", { ...base, right: { ...base.right, gift: false } }),
    "category-disabled",
  );
  assert.equal(
    getEventVisibilityReason(event(MsgType.Gift, { gift: { priceRmb: 1 } }), "gift", base, 10),
    "gift-threshold",
  );
  assert.equal(
    getEventVisibilityReason(event(MsgType.Danmu, { text: "苹果" }), "danmu", base, 0, { text: "香蕉" }),
    "query-mismatch",
  );
});

test('明确付费且只有总价的礼物不会误归为免费', () => {
  const gift = { msgType: MsgType.Gift, gift: { name: '粉丝团灯牌', count: 2, isFree: false, coinType: 'gold', priceRmb: 0, totalRmb: 0.2 } };
  assert.equal(getGiftKind(gift), 'normal');
  assert.equal(getGiftKind({ ...gift, gift: { ...gift.gift, isFree: undefined } }), 'normal');
  assert.equal(getGiftKind({ ...gift, gift: { isFree: true, priceRmb: 0, totalRmb: 0 } }), 'free');
  assert.equal(getGiftKind({ ...gift, gift: { coinType: 'silver', priceRmb: 0 } }), 'free');
});
