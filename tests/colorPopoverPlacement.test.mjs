import test from "node:test";
import assert from "node:assert/strict";

test("调色器在下方空间足够时向下展开，否则向上展开", async () => {
  const placement = await import("../src/components/colorPopoverPlacement.ts").catch(() => null);
  assert.ok(placement, "调色器定位模块应存在");
  assert.equal(placement.getColorPopoverPlacement({ top: 20, bottom: 52 }, 200, 120), "below");
  assert.equal(placement.getColorPopoverPlacement({ top: 160, bottom: 192 }, 200, 120), "above");
});

test("调色器在上下空间都不足时选择空间更大的一侧", async () => {
  const placement = await import("../src/components/colorPopoverPlacement.ts").catch(() => null);
  assert.ok(placement, "调色器定位模块应存在");
  const { getColorPopoverPlacement } = placement;
  assert.equal(getColorPopoverPlacement({ top: 80, bottom: 112 }, 200, 120), "below");
  assert.equal(getColorPopoverPlacement({ top: 108, bottom: 140 }, 200, 120), "above");
});

test("主题调色器按紧凑面板尺寸限制在视口内", async () => {
  const { placeThemeColorPopover } = await import("../src/components/themeColorPopover.ts");
  assert.deepEqual(placeThemeColorPopover({ left: 390, bottom: 250 }, { width: 480, height: 420 }), { left: 204, top: 6 });
});
