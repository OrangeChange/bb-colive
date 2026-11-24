import test from "node:test";
import assert from "node:assert/strict";
import { Virtualizer } from "@tanstack/virtual-core";
import * as feed from "../src/events/feedScroll.ts";

function createList(keys, estimate = 50) {
  const virtualizer = new Virtualizer({ count: keys.length, getItemKey: index => keys[index],
    getScrollElement: () => null, estimateSize: () => estimate, scrollToFn: () => {},
    observeElementRect: () => {}, observeElementOffset: () => {}, initialRect: { width: 760, height: 420 } });
  virtualizer.getTotalSize();
  return virtualizer;
}

test("top 前插后同一锚点继续消费实测高度，不把旧行重测算作新增高度", () => {
  let keys = Array.from({ length: 720 }, (_, index) => `event:${720 - index}`);
  const list = createList(keys);
  list.resizeItem(10, 125);
  const anchor = { eventKey: "event:361", offset: 183.2 };
  const start = () => feed.getFeedMeasurementStart(list, keys.indexOf(anchor.eventKey));
  const restore = () => feed.getFeedAnchorScrollTop?.({ anchorStart: start(),
    anchorOffset: anchor.offset, paddingTop: 8, scrollHeight: list.getTotalSize() + 16, clientHeight: 420 });
  keys = [...Array.from({ length: 10 }, (_, index) => `event:${730 - index}`), ...keys];
  list.setOptions({ ...list.options, count: keys.length, getItemKey: index => keys[index] });
  assert.equal(restore(), 18349.8);
  list.resizeItem(0, 80);
  list.resizeItem(20, 50);
  assert.equal(restore(), 18304.8);
  assert.ok(Math.abs(start() + 8 - restore() - 183.2) < 0.001);
});

test("top 清空测量缓存并改变间距后仍恢复稳定键，而非旧像素位置", () => {
  const keys = Array.from({ length: 720 }, (_, index) => `event:${720 - index}`);
  const list = createList(keys);
  list.resizeItem(10, 125);
  list.setOptions({ ...list.options, estimateSize: () => 58 });
  list.measure();
  const index = keys.indexOf("event:361");
  const start = () => feed.getFeedMeasurementStart(list, index);
  const restore = () => feed.getFeedAnchorScrollTop?.({ anchorStart: start(),
    anchorOffset: 183.2, paddingTop: 8, scrollHeight: list.getTotalSize() + 16, clientHeight: 420 });
  assert.equal(restore(), 20646.8);
  list.resizeItem(index - 1, 98);
  assert.equal(restore(), 20686.8);
  assert.ok(Math.abs(start() + 8 - restore() - 183.2) < 0.001);
});

test("top 同数量的实测变化仍需锚点保护；普通定位不被误判为前插", () => {
  assert.equal(feed.shouldAdjustTopAppendAnchor({ visibleCount: 742, anchorVisibleCount: 742,
    scrollHeightChanged: true, prependSettling: false, measurementChanged: true }), true);
  assert.equal(feed.shouldAdjustTopAppendAnchor({ visibleCount: 742, anchorVisibleCount: 742,
    scrollHeightChanged: false, prependSettling: false, measurementChanged: false }), false);
});

test("bottom 尺寸重排恢复稳定事件偏移，普通追加和跟随仍消费原路径", () => {
  let keys = Array.from({ length: 720 }, (_, index) => `event:${index + 1}`);
  const list = createList(keys);
  const snapshot = feed.captureFeedLayoutSnapshot({ scrollTop: 17849.8, followingLatest: false,
    readingAnchor: { eventKey: "event:360", offset: 183.2 } });
  list.setOptions({ ...list.options, estimateSize: () => 58 });
  list.measure();
  list.getTotalSize();
  const restore = () => feed.restoreFeedLayoutSnapshot(snapshot, list.getTotalSize() + 16, 420, "bottom",
    { start: feed.getFeedMeasurementStart(list, keys.indexOf("event:360")), paddingTop: 8 });
  assert.deepEqual(restore(), { scrollTop: 20646.8, followingLatest: false });
  list.resizeItem(358, 98);
  list.getTotalSize();
  assert.deepEqual(restore(), { scrollTop: 20686.8, followingLatest: false });
  keys = [...keys, "event:721"];
  list.setOptions({ ...list.options, count: keys.length, getItemKey: index => keys[index] });
  assert.deepEqual(feed.restoreFeedLayoutSnapshot({ scrollTop: 20686.8, followingLatest: false }, list.getTotalSize() + 16, 420, "bottom"),
    { scrollTop: 20686.8, followingLatest: false });
  assert.deepEqual(feed.restoreFeedLayoutSnapshot({ scrollTop: 20686.8, followingLatest: true }, list.getTotalSize() + 16, 420, "bottom"),
    { scrollTop: 41454, followingLatest: true });
});

test("末端阅读锚点读取未裁剪的最新测量坐标，只限制最终滚动位置", () => {
  const keys = Array.from({ length: 104 }, (_, index) => `event:${index}`);
  const list = createList(keys, 100);
  list.resizeItem(0, 60);
  list.resizeItem(103, 160);
  list.getTotalSize();
  // 仅提供原生几何边界；键、缓存、测量和坐标读取均由实际 Virtualizer 执行。
  list.scrollElement = { scrollHeight: 10420, clientHeight: 420 };
  assert.equal(list.getOffsetForIndex(101, "start")[0], 10000);
  const read = () => feed.getFeedMeasurementStart?.(list, 101);
  assert.equal(read(), 10060);
  for (const direction of ["top", "bottom"]) {
    const restored = feed.restoreFeedLayoutSnapshot({ scrollTop: 9880, followingLatest: false,
      readingAnchor: { eventKey: "event:101", offset: 188 } }, 10420, 420, direction,
      { start: read(), paddingTop: 8 });
    assert.deepEqual(restored, { scrollTop: 9880, followingLatest: false });
  }
  list.resizeItem(0, 160);
  assert.equal(read(), 10160);
  assert.equal(feed.getFeedAnchorScrollTop({ anchorStart: read(), anchorOffset: 188,
    paddingTop: 8, scrollHeight: 10520, clientHeight: 420 }), 9980);
  assert.equal(feed.getFeedAnchorScrollTop({ anchorStart: read(), anchorOffset: 0,
    paddingTop: 8, scrollHeight: 10520, clientHeight: 420 }), 10100);
});
