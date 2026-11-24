import test from "node:test";
import assert from "node:assert/strict";
import { MsgType } from "../src/protocol/types.ts";
import {
  updateEventProjection,
} from "../src/events/eventView.ts";

const filters = {
  danmu: true,
  interact: true,
  system: true,
};

const event = (msgType, extra = {}) => ({
  id: `${msgType}-${Math.random()}`,
  msgType,
  roomId: 1,
  ts: 1,
  ...extra,
});

test("首次建立投影时只记录当前筛选可见事件的原始索引", () => {
  const events = [
    event(MsgType.Danmu),
    event(MsgType.Gift),
    event(MsgType.Warning),
  ];

  const projection = updateEventProjection(null, events, "left", filters, 0, 1);

  assert.deepEqual(projection.indices, [0]);
  assert.equal(projection.sourceLength, 3);
});

test("投影同时汇总未显示事件的固定原因，并在追加事件时增量更新", () => {
  const first = [
    event(MsgType.Danmu),
    event(MsgType.Gift, { gift: { priceRmb: 1, isFree: false } }),
  ];
  const firstProjection = updateEventProjection(
    null,
    first,
    "gift",
    { ...filters, gift: true, giftKinds: { free: true, normal: true, blind: true, redPocket: true, anchorLot: true }, superChat: true, guard: true },
    10,
    1,
  );
  assert.deepEqual(firstProjection.indices, []);
  assert.deepEqual(firstProjection.filteredByReason, {
    "pane-mismatch": 1,
    "gift-threshold": 1,
  });

  const next = [...first, event(MsgType.Gift, { gift: { priceRmb: 20, isFree: false } })];
  const nextProjection = updateEventProjection(
    firstProjection,
    next,
    "gift",
    { ...filters, gift: true, giftKinds: { free: true, normal: true, blind: true, redPocket: true, anchorLot: true }, superChat: true, guard: true },
    10,
    1,
  );
  assert.deepEqual(nextProjection.indices, [2]);
  assert.deepEqual(nextProjection.filteredByReason, {
    "pane-mismatch": 1,
    "gift-threshold": 1,
  });
});

test("事件只追加到数组尾部时，投影只处理新增区间并保留原索引", () => {
  const first = [event(MsgType.Danmu), event(MsgType.Gift)];
  const previous = updateEventProjection(null, first, "left", filters, 0, 1);
  const next = [...first, event(MsgType.Interact), event(MsgType.Gift), event(MsgType.Danmu)];

  const projection = updateEventProjection(previous, next, "left", filters, 0, 1);

  assert.deepEqual(projection.indices, [0, 2, 4]);
  assert.notEqual(projection.indices, previous.indices);
});

test("筛选条件或房间变化时重建投影，避免沿用旧房间索引", () => {
  const events = [event(MsgType.Danmu), event(MsgType.Interact)];
  const previous = updateEventProjection(null, events, "left", filters, 0, 1);

  const filtered = updateEventProjection(
    previous,
    events,
    "left",
    { ...filters, danmu: false },
    0,
    1,
  );
  assert.deepEqual(filtered.indices, [1]);

  const otherRoom = updateEventProjection(
    filtered,
    [event(MsgType.Danmu)],
    "left",
    filters,
    0,
    2,
  );
  assert.deepEqual(otherRoom.indices, [0]);
  assert.equal(otherRoom.scopeKey.includes("|2|"), true);
});

test("同一投影范围内只有行内容更新时，复用索引数组", () => {
  const first = [event(MsgType.Danmu)];
  const previous = updateEventProjection(null, first, "left", filters, 0, 1);
  const updated = [{ ...first[0], text: "更新后的内容" }];

  const projection = updateEventProjection(previous, updated, "left", filters, 0, 1);

  assert.strictEqual(projection.indices, previous.indices);
});

test("用户或文字查询变化时重建投影", () => {
  const events = [
    event(MsgType.Danmu, { user: { uid: "1", uname: "甲", guardLevel: 0 }, text: "苹果" }),
    event(MsgType.Danmu, { user: { uid: "2", uname: "乙", guardLevel: 0 }, text: "香蕉" }),
  ];
  const previous = updateEventProjection(null, events, "danmu", filters, 0, 1, { userId: "1", text: "苹果" });
  const changed = updateEventProjection(previous, events, "danmu", filters, 0, 1, { userId: "2", text: "香蕉" });

  assert.deepEqual(previous.indices, [0]);
  assert.deepEqual(changed.indices, [1]);
  assert.notStrictEqual(changed.indices, previous.indices);
});

test("分区投影按具体业务区域拆分，系统由提醒模块独立承载", () => {
  const events = [
    event(MsgType.Danmu),
    event(MsgType.Interact),
    event(MsgType.Warning),
    event(MsgType.Gift, { gift: { priceRmb: 10, isFree: false } }),
    event(MsgType.SuperChat),
    event(MsgType.GuardBuy),
    event(MsgType.GuardHonor),
  ];

  const allFilters = {
    left: filters,
    right: { gift: true, superChat: true, guard: true },
  };
  const project = (pane) => updateEventProjection(null, events, pane, allFilters, 0, 1);
  assert.deepEqual(project("danmu").indices, [0]);
  assert.deepEqual(project("interact").indices, [1]);
  assert.deepEqual(project("gift").indices, [3]);
  assert.deepEqual(project("superChat").indices, [4]);
  assert.deepEqual(project("guard").indices, [5, 6]);
});
