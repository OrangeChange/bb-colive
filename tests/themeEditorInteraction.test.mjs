import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("颜色入口统一支持透明、精确值、取色器和关闭浮层", () => {
  const source = fs.readFileSync("src/components/ThemeColorField.tsx", "utf8");
  assert.match(source, /RgbaColorPicker/);
  assert.match(source, /EyeDropper/);
  assert.match(source, /HEX/);
  assert.match(source, /RGBA/);
  assert.match(source, /HSLA/);
  assert.match(source, /透明/);
  assert.match(source, /aria-label="关闭颜色面板"/);
  assert.match(source, /createPortal/);
  assert.match(source, /focus\(\)/);
  assert.match(source, /event\.key === "Tab"/);
  assert.match(source, /addEventListener\("resize"/);
  assert.match(source, /addEventListener\("scroll"/);
  assert.match(source, /STYLE_PREVIEW_POINTER_DOWN_EVENT/);
  assert.match(source, /addEventListener\(STYLE_PREVIEW_POINTER_DOWN_EVENT/);
  assert.match(source, /target instanceof Node/);
});

test("颜色格式菜单自适应定位且透明状态不伪装成具体格式", () => {
  const field = fs.readFileSync("src/components/ThemeColorField.tsx", "utf8");
  const select = fs.readFileSync("src/components/ui/Select.tsx", "utf8");
  const css = fs.readFileSync("src/components/nativeThemeEditor.css", "utf8");
  assert.match(select, /contentClassName/);
  assert.match(field, /label:opaque\?'RGB':'RGBA'/);
  assert.match(field, /allowTransparent && !opaque/);
  assert.match(field, /contentClassName="theme-color-format-menu"/);
  assert.match(css, /\.theme-color-format-menu\s*\{[^}]*z-index:\s*1300/);
  assert.match(css, /\.theme-color-precise-row>\.ui-select-trigger[^}]*height:\s*30px/);
  assert.match(css, /\.theme-color-precise input[^}]*height:\s*30px/);
});

test("预览画布复用颜色入口并同步背景设置", () => {
  const source = fs.readFileSync("src/components/NativeThemeEditor.tsx", "utf8");
  const toolbar = fs.readFileSync("src/components/StylePreviewToolbar.tsx", "utf8");
  assert.match(source, /<StylePreviewToolbar/);
  assert.match(toolbar, /<ThemeColorField[^>]*label="画布背景"/);
  assert.doesNotMatch(toolbar, /type="checkbox"[\s\S]{0,120}透明画布/);
  assert.match(source, /previewBackground: previewTransparent \? "transparent" : previewBackground/);
});

test("可视化属性颜色复用统一颜色入口", () => {
  const source = fs.readFileSync("src/components/NativeThemeVisualEditor.tsx", "utf8");
  const field = fs.readFileSync("src/components/ThemeVisualPropertyField.tsx", "utf8");
  assert.match(source, /<ThemeVisualPropertyField/);
  assert.match(field, /<ThemeColorField/);
  assert.doesNotMatch(source + field, /input type="color"/);
});

test("高级编辑器把查找替换跳行交给 Monaco 并保留格式化入口", () => {
  const source = fs.readFileSync("src/components/NativeThemeAdvancedEditor.tsx", "utf8");
  assert.doesNotMatch(source, /placeholder="查找"/);
  assert.doesNotMatch(source, /替换为/);
  assert.doesNotMatch(source, /跳转行号/);
  assert.match(source, /"格式化"/);
});

test("Monaco 使用中文资源、CSS 语言服务、内置菜单和分层模型", () => {
  const source = fs.readFileSync("src/components/NativeCssCodeEditor.tsx", "utf8");
  const loader = fs.readFileSync("src/components/nativeMonacoLoader.ts", "utf8");
  assert.doesNotMatch(source, /native-css-context-menu/);
  assert.match(loader, /nls\.messages\.zh-cn/);
  assert.match(loader, /edcore\.main\.js/);
  assert.match(loader, /editor\.api/);
  assert.match(loader, /language\/css\/monaco\.contribution/);
  assert.match(source, /sharedModels/);
  assert.match(source, /sharedViewStates/);
  assert.match(source, /replaceDocument\(documentKey, nextValue\)/);
  assert.doesNotMatch(source, /for \(const model of models\.current\.values\(\)\) model\.dispose/);
});

test("Prettier 仅通过动态导入加载", () => {
  const source = fs.readFileSync("src/components/NativeThemeAdvancedEditor.tsx", "utf8");
  assert.match(source, /import\("prettier\/standalone"\)/);
  assert.match(source, /import\("prettier\/plugins\/postcss"\)/);
  assert.doesNotMatch(source, /^import .*prettier/m);
});

test("Monaco 深层入口在开发启动时完成依赖预优化", () => {
  const source = fs.readFileSync("vite.config.ts", "utf8");
  assert.match(source, /cacheDir:\s*`node_modules\/\.vite-\$\{devPort\}`/);
  for (const entry of [
    "monaco-editor/esm/nls.messages.zh-cn.js",
    "monaco-editor/esm/vs/editor/editor.all.js",
    "monaco-editor/esm/vs/editor/editor.api",
    "monaco-editor/esm/vs/language/css/monaco.contribution",
  ]) assert.match(source, new RegExp(entry.replaceAll(".", "\\.")));
});

test("预览页入口挂载在样式预览标题栏", () => {
  const editor = fs.readFileSync("src/components/NativeThemeEditor.tsx", "utf8");
  const workbench = fs.readFileSync("src/components/RightWorkbench.tsx", "utf8");
  assert.match(editor, /previewHeaderTarget/);
  const actions = fs.readFileSync("src/components/StylePreviewActions.tsx", "utf8");
  assert.match(editor, /createPortal\(<StylePreviewActions\s*\/>,\s*previewHeaderTarget\)/);
  assert.match(actions, /打开独立预览/);
  assert.match(actions, /openNativeStylePreviewWindow\(\)/);
  assert.match(workbench, /onStylePreviewHeaderTarget/);
  assert.match(workbench, /native-preview-header-actions/);
});

test("可视化字体下拉取消设置列表的自动左边距", () => {
  const css = fs.readFileSync("src/components/nativeThemeEditor.css", "utf8");
  assert.match(css, /\.native-property-field\s+\.settings-list-select-wrap\s*\{[^}]*margin-inline-start:\s*0/);
  assert.match(css, /\.native-property-field\s+\.settings-list-select-wrap\s*\{[^}]*width:\s*100%/);
});
