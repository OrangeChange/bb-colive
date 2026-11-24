import test from "node:test";
import assert from "node:assert/strict";
import { createCustomThemeDocument } from "../src/themes/themeTypes.ts";
import { exportThemeDocumentBytes, importThemeDocumentBytes, importThemePackageBytes, importThemePackageBytesAsync } from "../src/themes/themeTransfer.ts";

test("完整主题包往返保留设置、自定义 CSS 和资源清单", () => {
  const theme = createCustomThemeDocument({ themeId: "transfer-one", mode: "native", name: "导出主题" });
  theme.settings = { visible: true };
  theme.styles.customCss = "/* 说明 */\n.unknown { color: red; }";
  theme.assets = [{ id: "frame", name: "边框", path: "assets/frame.webp", mediaType: "image/webp" }];
  const restored = importThemeDocumentBytes(exportThemeDocumentBytes(theme, { "assets/frame.webp": new Uint8Array([1, 2, 3]) }));
  assert.deepEqual(restored, theme);
  assert.deepEqual(importThemePackageBytes(exportThemeDocumentBytes(theme, { "assets/frame.webp": new Uint8Array([1, 2, 3]) })).assets["assets/frame.webp"], new Uint8Array([1, 2, 3]));
});

test("导入拒绝不含主题文档的压缩包", () => {
  assert.throws(() => importThemeDocumentBytes(new Uint8Array()), /主题文件无效/);
});

test("后台导入接口在没有 Worker 时保持相同主题包结果", async () => {
  const theme = createCustomThemeDocument({ themeId: "transfer-async", mode: "native", name: "后台导入" });
  const bytes = exportThemeDocumentBytes(theme);
  assert.deepEqual(await importThemePackageBytesAsync(bytes), importThemePackageBytes(bytes));
});
