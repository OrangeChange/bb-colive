import test from "node:test";
import assert from "node:assert/strict";
import { placeThemeColorPopover } from "../src/components/themeColorPopover.ts";

test("颜色浮层随锚点变化重新计算可见位置", () => {
  assert.deepEqual(placeThemeColorPopover({ left: 920, bottom: 700 }, { width: 1000, height: 760 }), { left: 724, top: 324 });
  assert.deepEqual(placeThemeColorPopover({ left: 120, bottom: 160 }, { width: 1000, height: 760 }), { left: 120, top: 166 });
  assert.deepEqual(placeThemeColorPopover({ left: 920, bottom: 700 }, { width: 1000, height: 760 }, { width: 292, height: 390 }), { left: 702, top: 364 });
});
