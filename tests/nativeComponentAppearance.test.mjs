import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultNativeComponentAppearance, normalizeNativeComponentAppearance } from "../src/themes/nativeComponentAppearance.ts";
import { renderManagedNativeCss } from "../src/themes/nativeManagedCss.ts";
import { createBuiltinNativeTheme } from "../src/themes/nativeBuiltinThemes.ts";
import { projectNativeTheme } from "../src/themes/nativeThemeProjection.ts";

test("原生主题包含部件显示与外观默认值", () => {
  const theme = createBuiltinNativeTheme("native-default");
  assert.deepEqual(theme.settings.componentAppearance, createDefaultNativeComponentAppearance());
  assert.equal(normalizeNativeComponentAppearance({ message: { visible: false, fontSize: 30 } }).message.visible, false);
});

test("正式主题投影保留部件外观 CSS", () => {
  const theme = createBuiltinNativeTheme("native-default");
  theme.settings.componentAppearance.message = { visible: false };
  assert.match(projectNativeTheme(theme).css, /\.event \.message \{\n  display: none;/);
});

test("受管理 CSS 使用当前公共语义选择器并支持预览作用域", () => {
  const theme = createBuiltinNativeTheme("native-default");
  theme.settings.componentAppearance = {
    ...theme.settings.componentAppearance,
    medal: { visible: false },
    giftImage: { borderWidth: 2, borderColor: "#ff0000", borderRadius: 6 },
    sticky: { paddingX: 4, paddingY: 4, gap: 3 },
  };
  const css = renderManagedNativeCss(theme.settings, ".style-editor-preview-column");
  assert.match(css, /\.style-editor-preview-column \.event \.fan-medal/);
  assert.match(css, /\.style-editor-preview-column \.event \.gift-icon/);
  assert.match(css, /\.style-editor-preview-column \.sticky-area/);
  assert.match(css, /display: none/);
  assert.match(css, /border: 2px solid #ff0000/);
});
