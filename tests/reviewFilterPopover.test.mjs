import test from "node:test";
import assert from "node:assert/strict";

let positionReviewFilterPopover;
try {
  ({ positionReviewFilterPopover } = await import("../src/archive/reviewFilterPopover.ts"));
} catch {
  // RED 阶段：几何定位辅助函数尚未实现。
}

test("主播更多条件浮层在空间充足时锚定筛选框下沿，而不是翻到触发按钮上方", () => {
  assert.equal(typeof positionReviewFilterPopover, "function");
  assert.deepEqual(
    positionReviewFilterPopover(
      { top: 120, bottom: 380, left: 20, width: 780 },
      { width: 1000, height: 900 },
    ),
    { top: 388, left: 20, width: 780, maxHeight: 504 },
  );
});

test("主播更多条件浮层在窄视口内保持可见宽度和可滚动高度", () => {
  assert.equal(typeof positionReviewFilterPopover, "function");
  const position = positionReviewFilterPopover(
    { top: 180, bottom: 460, left: 250, width: 500 },
    { width: 400, height: 500 },
  );
  assert.equal(position.width, 384);
  assert.equal(position.left, 8);
  assert.ok(position.top >= 8);
  assert.ok(position.top + position.maxHeight <= 492);
  assert.ok(position.maxHeight > 0);
});

test("浮层在底部空间不足时仍位于视口内", () => {
  assert.deepEqual(positionReviewFilterPopover({ top: 430, bottom: 490, left: 20, width: 350 }, { width: 400, height: 500 }),
    { top: 332, left: 20, width: 350, maxHeight: 160 });
});

test("滚动及筛选框尺寸改变后按新的几何重新定位", () => {
  assert.deepEqual(positionReviewFilterPopover({ top: 100, bottom: 220, left: 20, width: 350 }, { width: 400, height: 500 }),
    { top: 228, left: 20, width: 350, maxHeight: 264 });
  assert.deepEqual(positionReviewFilterPopover({ top: 20, bottom: 140, left: 20, width: 350 }, { width: 400, height: 500 }),
    { top: 148, left: 20, width: 350, maxHeight: 344 });
  assert.deepEqual(positionReviewFilterPopover({ top: 20, bottom: 180, left: 20, width: 700 }, { width: 300, height: 240 }),
    { top: 72, left: 8, width: 284, maxHeight: 160 });
});
