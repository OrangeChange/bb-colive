import { readUiSource } from "./helpers/readUiSource.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createBuiltinNativeTheme } from "../src/themes/nativeBuiltinThemes.ts";
import { buildNativeThemeCssExport } from "../src/themes/themeCssExport.ts";

test("高级编辑只显示可视化 CSS 与自定义 CSS", () => {
  const source = readUiSource("src/components/NativeThemeAdvancedEditor.tsx", "utf8");
  assert.doesNotMatch(source, /\["base", ["']基础 CSS["']\]/);
  assert.match(source, /导出 CSS/);
  assert.match(source, /visualCss/);
  assert.match(source, /readOnly=\{showBase\}/);
  assert.match(source, /const changeText = layer === "visual" \? onVisualCssChange : onCustomCssChange/);
});

test("可视化 CSS 使用会话持有的草稿", () => {
  const editor = readUiSource("src/components/NativeThemeEditor.tsx", "utf8");
  assert.match(editor, /tryComposeNativePreviewCss/);
  assert.match(editor, /visualCss=\{visualCss\}/);
  assert.match(editor, /onVisualCssChange=\{onVisualCssChange\}/);
});

test("CSS 导出支持完整、基础与可视化、可视化、自定义四种范围", () => {
  const document = createBuiltinNativeTheme("native-default");
  document.styles.baseCss = ".event { color: red }";
  document.styles.visualCss = ".event { color: green }";
  document.styles.customCss = ".event{opacity:.9}";
  const complete = buildNativeThemeCssExport(document, "complete");
  assert.match(complete, /@layer default/);
  assert.match(complete, /@layer config/);
  assert.match(complete, /@layer custom/);
  assert.doesNotMatch(buildNativeThemeCssExport(document, "visual"), /自定义层/);
  assert.equal(buildNativeThemeCssExport(document, "custom").trim(), ".event{opacity:.9}");
});

test("CSS 编辑器使用 Monaco 原生命令并在内部滚动", () => {
  const editor = readUiSource("src/components/NativeCssCodeEditor.tsx", "utf8");
  const config = readUiSource("src/components/nativeMonacoEditorConfig.ts", "utf8");
  assert.doesNotMatch(editor, /onContextMenu/);
  assert.doesNotMatch(editor, /preventDefault\(\)/);
  assert.match(editor, /monaco\.editor\.create/);
  assert.match(config, /contextmenu:\s*true/);
  assert.match(editor, /theme:\s*"danmu-ui"/);
  const css = readUiSource("src/components/nativeThemeEditor.css", "utf8");
  assert.match(css, /\.native-css-code[^}]*overflow:hidden/);
});
