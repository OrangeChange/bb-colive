import test from "node:test";
import assert from "node:assert/strict";

let getReviewVirtualMeasurementProps;
let measureLoadedReviewRow;
try {
  ({
    getReviewVirtualMeasurementProps,
    measureLoadedReviewRow,
  } = await import("../src/components/reviewVirtualMeasurement.ts"));
} catch {
  // RED 阶段：实现文件尚不存在时，让行为断言明确失败。
}

test("大表情加载后只重新测量所属的回看事件槽位", () => {
  assert.equal(typeof measureLoadedReviewRow, "function");

  const slot = { kind: "event-row-slot" };
  const selectors = [];
  const measured = [];
  const image = {
    closest(selector) {
      selectors.push(selector);
      return slot;
    },
  };

  const measuredCurrentRow = measureLoadedReviewRow(image, (element) => measured.push(element));

  assert.equal(measuredCurrentRow, true);
  assert.deepEqual(selectors, [".event-row-slot"]);
  assert.deepEqual(measured, [slot]);
});

test("回看虚拟行把索引和测量引用同时交给实际 DOM 节点", () => {
  assert.equal(typeof getReviewVirtualMeasurementProps, "function");

  const measureElement = () => {};
  const props = getReviewVirtualMeasurementProps(7, measureElement);

  assert.equal(props["data-index"], 7);
  assert.equal(props.ref, measureElement);
});

test("图片不属于回看事件槽位时不触发测量", () => {
  assert.equal(typeof measureLoadedReviewRow, "function");

  let calls = 0;
  const image = { closest: () => null };

  const measuredCurrentRow = measureLoadedReviewRow(image, () => { calls += 1; });

  assert.equal(measuredCurrentRow, false);
  assert.equal(calls, 0);
});
