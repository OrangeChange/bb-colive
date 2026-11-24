import test from "node:test";
import assert from "node:assert/strict";
import { mergeGiftInto } from "../src/events/giftMerge.ts";
import {
  formatEventAge,
  getEventBookmarkKey,
  getArchiveEventKey,
  getRegionMark,
  isEventFavorited,
  setFavoriteEvent,
  setRegionMark,
  toggleFavoriteEvent,
  bindFavoriteEvent,
} from "../src/eventAnnotations.ts";

const event = (id, extra = {}) => ({
  id,
  msgType: 1,
  roomId: 123,
  ts: 1_700_000_000_000,
  user: { uid: "7", uname: "用户" },
  ...extra,
});

test("已知场次判断使用持久键，并精确兼容无映射旧收藏", () => {
  const source = event("rnd", { dedupe: "source", text: "相同正文" });
  const first = bindFavoriteEvent([], source, "first:archive-event:source", true, 37);
  assert.equal(isEventFavorited(first, source, "first:archive-event:source"), true);
  assert.equal(isEventFavorited(first, source, "second:archive-event:source"), false);
  const both = bindFavoriteEvent(first, source, "second:archive-event:source", true, 99);
  assert.equal(isEventFavorited(both, source, "second:archive-event:source"), true);
  const removed = bindFavoriteEvent(both, source, "second:archive-event:source", false);
  assert.equal(isEventFavorited(removed, source, "second:archive-event:source"), false);
  assert.equal(isEventFavorited(removed, source, "first:archive-event:source"), true);
  const old = setFavoriteEvent([], source, true, 37);
  assert.equal(isEventFavorited(old, source, "second:archive-event:source"), true);
  assert.equal(isEventFavorited(old, { ...source, dedupe: "another" }, "second:archive-event:another"), false);
});

test("晚到 combo 的已知场次收藏仍关联原持久键，不读取其他场次", () => {
  const first = event("gift-1", { reactKey: "row-1", dedupe: "source-1", ts: 1000,
    gift: { id: 1, name: "花", count: 1, price: 1000, total: 1000 } });
  const saved = bindFavoriteEvent([], first, "first:archive-event:source-1", true, 37);
  const rows = [first];
  mergeGiftInto(rows, { ...first, id: "gift-2", reactKey: "row-2", dedupe: "source-2", comboId: "combo", ts: 1100 });
  assert.equal(isEventFavorited(saved, rows[0], getArchiveEventKey(rows[0], "first")), true);
  assert.equal(isEventFavorited(saved, rows[0], getArchiveEventKey(rows[0], "second")), false);
});

test("晚到连击编号保留已收藏和标记的行身份", () => {
  const first = event("gift-1", { reactKey: "row-1", dedupe: "source-1", ts: 1000,
    gift: { id: 1, name: "小花", count: 1, price: 1000, total: 1000 } });
  const rows = [first];
  const saved = setFavoriteEvent([], first, true, 100);
  const marks = setRegionMark({}, "live", first);
  mergeGiftInto(rows, { ...first, id: "gift-2", reactKey: "row-2", dedupe: "source-2", comboId: "combo-1", ts: 1100 });
  assert.equal(rows[0].gift.count, 2);
  assert.equal(getEventBookmarkKey(rows[0]), "123:event:source-1");
  assert.equal(getRegionMark(setRegionMark({}, "live", rows[0]), "live"), marks.live);
  assert.equal(isEventFavorited(saved, rows[0]), true);
  assert.equal(isEventFavorited(saved, { ...first, dedupe: "unrelated", reactKey: "row-3", ts: 20000 }), false);
});

test("收藏键按房间和稳定事件身份生成，连击更新沿用 comboId", () => {
  assert.equal(getEventBookmarkKey(event("a")), "123:event:a");
  assert.equal(getEventBookmarkKey(event("different", { comboId: "combo-1" })), "123:combo:combo-1");
});

test("收藏支持添加、取消并能判断回看记录", () => {
  const source = [];
  const first = event("a");
  const added = toggleFavoriteEvent(source, first, 1_700_000_001_000);
  assert.equal(added.favorited, true);
  assert.equal(isEventFavorited(added.favorites, first), true);
  assert.equal(added.favorites[0].event.id, "a");
  const removed = toggleFavoriteEvent(added.favorites, first, 1_700_000_002_000);
  assert.equal(removed.favorited, false);
  assert.equal(removed.favorites.length, 0);
});

test("同用户同原始 ID 的弹幕可分别收藏和取消", () => {
  const first = event("rnd", { msgType: 0, dedupe: "message-one" });
  const second = event("rnd", { msgType: 0, dedupe: "message-two", reactKey: "rnd~1" });
  const added = toggleFavoriteEvent([], first, 100);
  assert.equal(isEventFavorited(added.favorites, first), true);
  assert.equal(isEventFavorited(added.favorites, second), false);
  const both = toggleFavoriteEvent(added.favorites, second, 200);
  assert.equal(both.favorited, true);
  assert.equal(both.favorites.length, 2);
  const removed = toggleFavoriteEvent(both.favorites, first, 300);
  assert.equal(removed.favorites.length, 1);
  assert.equal(isEventFavorited(removed.favorites, first), false);
  assert.equal(isEventFavorited(removed.favorites, second), true);
  assert.equal(isEventFavorited(removed.favorites, { ...second, reactKey: undefined }), true);
});

test("旧收藏按保存的事件快照识别，保留时间且不串联同 ID 消息", () => {
  const first = event("rnd", { msgType: 0, dedupe: "message-one" });
  const second = event("rnd", { msgType: 0, dedupe: "message-two", reactKey: "rnd~1" });
  const saved = [{ key: "123:event:rnd", roomId: 123, eventId: "rnd", event: first, favoritedAt: 100 }];
  assert.equal(isEventFavorited(saved, first), true);
  assert.equal(isEventFavorited(saved, second), false);
  const next = setFavoriteEvent(saved, second, true, 200);
  assert.equal(next.length, 2);
  assert.equal(next[0].favoritedAt, 100);
  const removed = setFavoriteEvent(next, first, false, 300);
  assert.equal(removed.length, 1);
  assert.equal(removed[0].event.dedupe, "message-two");
});

test("同一礼物连击更新保留收藏状态和首次收藏时间", () => {
  const first = event("gift", { comboId: "combo", dedupe: "gift-one" });
  const update = event("gift-next", { comboId: "combo", dedupe: "gift-two", reactKey: "gift-next~1" });
  const saved = setFavoriteEvent([], first, true, 100);
  assert.equal(isEventFavorited(saved, update), true);
  assert.equal(setFavoriteEvent(saved, update, true, 200)[0].favoritedAt, 100);
  assert.deepEqual(setFavoriteEvent(saved, update, false, 300), []);
});

test("收藏状态使用场次稳定键连接现场与回看关系，并保留原始事件快照", () => {
  const first = event("a");
  const added = setFavoriteEvent([], first, true, 1_700_000_001_000);

  assert.equal(getArchiveEventKey(first, "session-1"), "session-1:archive-event:a");
  assert.equal(added.length, 1);
  assert.equal(added[0].key, "123:event:a");
  assert.equal(added[0].event.user.uname, "用户");

  const renamed = { ...first, user: { ...first.user, uname: "后来改名" } };
  const stillFavorite = setFavoriteEvent(added, renamed, true, 1_700_000_002_000);
  assert.equal(stillFavorite.length, 1);
  assert.equal(stillFavorite[0].event.user.uname, "用户");
  assert.deepEqual(setFavoriteEvent(stillFavorite, renamed, false, 1_700_000_003_000), []);
});

test("每个事件区域只有一个阅读标记，新标记替代旧标记", () => {
  const first = event("a");
  const second = event("b");
  const marked = setRegionMark({}, "dual-left", first);
  assert.equal(getRegionMark(marked, "dual-left"), "123:event:a");
  assert.equal(getRegionMark(setRegionMark(marked, "dual-left", second), "dual-left"), "123:event:b");
});

test("事件年龄按秒、分钟和四舍五入小时显示", () => {
  const ts = 1_700_000_000_000;
  assert.equal(formatEventAge(ts, ts + 12_000), "12秒前");
  assert.equal(formatEventAge(ts, ts + 65_000), "1分钟前");
  assert.equal(formatEventAge(ts, ts + 90 * 60_000), "2小时前");
  assert.equal(formatEventAge(Number.NaN, ts), "时间未知");
});
