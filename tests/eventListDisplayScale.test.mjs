import test from "node:test";
import assert from "node:assert/strict";
import { Virtualizer } from "@tanstack/virtual-core";
import { estimateScaledEventRow, measureScaledEventRow } from "../src/events/feedDisplayScale.ts";

function createLongList(scale) {
  const count = 720;
  const virtualizer = new Virtualizer({
    count,
    getItemKey: index => `event:${index}`,
    getScrollElement: () => null,
    estimateSize: index => estimateScaledEventRow({ baseSize: 58, spacing: index < count - 1 ? 4 : 0, scale }),
    scrollToFn: () => {}, observeElementRect: () => {}, observeElementOffset: () => {},
    initialRect: { width: 760, height: 420 },
  });
  virtualizer.getTotalSize();
  return virtualizer;
}

for (const scale of [1, 1.25, 1.5]) test(`长列表 ${scale * 100}% 缩放保持连续测量和定位`, () => {
  const list = createLongList(scale);
  const expectedRow = (58 + 4) * scale;
  assert.equal(list.getMeasurements()[400].start, expectedRow * 400);
  assert.equal(list.getMeasurements()[400].end, expectedRow * 401);
  assert.equal(list.getMeasurements()[401].start, list.getMeasurements()[400].end);
  assert.equal(list.getTotalSize(), expectedRow * 719 + 58 * scale);
  list.scrollElement = { scrollHeight: list.getTotalSize(), clientHeight: 420 };
  assert.equal(list.getOffsetForIndex(600, "start")[0], expectedRow * 600);
});

test("实测行高使用浏览器缩放后的边界而不是未缩放 borderBox", () => {
  const element = {
    getBoundingClientRect: () => ({ height: 93 }),
  };
  assert.equal(measureScaledEventRow(element), 93);
});
