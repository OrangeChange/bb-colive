import test from "node:test";
import assert from "node:assert/strict";
import { resolvePreviewBackground } from "../src/components/previewBackground.ts";

test("独立预览接受主题支持的颜色格式并拒绝非颜色内容", () => {
  assert.equal(resolvePreviewBackground("#11223380"), "#11223380");
  assert.equal(resolvePreviewBackground("rgba(1, 2, 3, 0.4)"), "rgba(1, 2, 3, 0.4)");
  assert.equal(resolvePreviewBackground("hsla(210, 40%, 50%, 0.6)"), "hsla(210, 40%, 50%, 0.6)");
  assert.equal(resolvePreviewBackground("transparent"), "transparent");
  assert.equal(resolvePreviewBackground("red; color: white"), "transparent");
});
