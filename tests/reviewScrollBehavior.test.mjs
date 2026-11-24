import test from "node:test";
import assert from "node:assert/strict";

let reduceReviewFilterVisibility;
try {
  ({ reduceReviewFilterVisibility } = await import("../src/archive/reviewScrollBehavior.ts"));
} catch {
  // RED 阶段：实现尚不存在时，让行为断言明确失败。
}

test("时间线向下滚动时自动收起筛选区", () => {
  assert.equal(typeof reduceReviewFilterVisibility, "function");
  assert.deepEqual(
    reduceReviewFilterVisibility({ collapsed: false, autoCollapsed: false }, "down", false),
    { collapsed: true, autoCollapsed: true },
  );
});

test("自动收起后在时间线顶部继续向上滚动会展开筛选区", () => {
  assert.equal(typeof reduceReviewFilterVisibility, "function");
  assert.deepEqual(
    reduceReviewFilterVisibility({ collapsed: true, autoCollapsed: true }, "up", true),
    { collapsed: false, autoCollapsed: false },
  );
});

test("手动收起不会被时间线顶部的向上滚动误展开", () => {
  assert.equal(typeof reduceReviewFilterVisibility, "function");
  assert.deepEqual(
    reduceReviewFilterVisibility({ collapsed: true, autoCollapsed: false }, "up", true),
    { collapsed: true, autoCollapsed: false },
  );
});
