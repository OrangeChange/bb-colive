import test from "node:test";
import assert from "node:assert/strict";
test("固定预览地址不包含主题、房间或模式，正式输出地址不变", async () => {
  const { stylePreviewUrl } =
    await import("../src/preview/stylePreviewActions.ts");
  assert.equal(stylePreviewUrl(17922), "http://127.0.0.1:17922/preview");
  assert.equal(new URL(stylePreviewUrl(17922)).search, "");
});
