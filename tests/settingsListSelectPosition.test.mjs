import test from "node:test";
import assert from "node:assert/strict";
import { resolveSettingsMenuPosition } from "../src/components/settingsListSelectPosition.ts";

test("向上展开时按实际菜单高度贴近触发按钮", () => {
  const result = resolveSettingsMenuPosition({
    triggerTop: 450,
    triggerBottom: 486,
    triggerLeft: 100,
    triggerWidth: 280,
    viewportWidth: 900,
    viewportHeight: 560,
    contentHeight: 208,
  });
  assert.equal(result.placement, "above");
  assert.equal(result.maxHeight, 320);
  assert.equal(result.top, 234);
});

test("内容能放在下方时不因固定最大高度错误上移", () => {
  const result = resolveSettingsMenuPosition({
    triggerTop: 200,
    triggerBottom: 236,
    triggerLeft: 100,
    triggerWidth: 280,
    viewportWidth: 900,
    viewportHeight: 560,
    contentHeight: 208,
  });
  assert.equal(result.placement, "below");
  assert.equal(result.top, 244);
});

test("菜单内容超过可用空间时保留滚动上限", () => {
  const result = resolveSettingsMenuPosition({
    triggerTop: 450,
    triggerBottom: 486,
    triggerLeft: 100,
    triggerWidth: 280,
    viewportWidth: 900,
    viewportHeight: 560,
    contentHeight: 640,
  });
  assert.equal(result.placement, "above");
  assert.equal(result.maxHeight, 320);
  assert.equal(result.top, 122);
});
