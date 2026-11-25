import { readUiSource } from "./helpers/readUiSource.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const previewSources = () => ["src/components/NativeThemeEditor.tsx", "src/components/NativeStylePreviewSurface.tsx", "src/components/StylePreviewToolbar.tsx", "src/preview/EditorSamplePreview.tsx", "src/preview/useNativePreviewEvents.ts"].map(file=>readUiSource(file,"utf8")).join("\n");


test("主题预览使用真实置顶栏组件并提供透明棋盘背景", () => {
  const area = readUiSource("src/components/StylePreviewArea.tsx", "utf8");
  assert.match(area, /StickyEventCard/);
  assert.match(area, /sticky-area/);
  const editor = previewSources();
  assert.match(editor, /showStickyPreview/);
  const css = readUiSource("src/components/nativeThemeEditor.css", "utf8");
  assert.match(css, /checkerboard/);
  assert.match(css, /is-checkerboard\.is-dark/);
  assert.match(css, /\.dark \.native-preview-stage\.is-checkerboard\.is-system/);
});

test("主题预览使用隔离 iframe，正式置顶模型与无可见滚动条的滚动视口", () => {
  const editor = previewSources();
  const area = readUiSource("src/components/StylePreviewArea.tsx", "utf8");
  const frame = readUiSource("src/components/IsolatedPreviewFrame.tsx", "utf8");
  const css = readUiSource("src/components/nativeThemeEditor.css", "utf8");
  assert.match(editor, /IsolatedPreviewFrame/);
  assert.match(editor, /previewBackground:\s*previewTransparent \? "transparent" : previewBackground/);
  assert.match(area, /selectStylePreviewEvents/);
  assert.match(area, /stickySettings/);
  assert.doesNotMatch(area, /expiresAt: now \+ 60_000/);
  assert.match(frame, /<iframe/);
  assert.match(frame, /background:\s*transparent/);
  assert.match(css, /\.native-preview-sticky-scroll\{[^}]*overflow-x:auto[^}]*scrollbar-width:none/);
  assert.match(css, /\.native-preview-sticky-scroll::\-webkit-scrollbar\{[^}]*display:none/);
  const eventCss = readUiSource("src/eventStyle.css", "utf8");
  assert.match(eventCss, /\.sticky-area\s*\{[^}]*overflow-x:\s*auto[^}]*scrollbar-width:\s*none/);
  assert.match(eventCss, /\.sticky-area::\-webkit-scrollbar\s*\{[^}]*display:\s*none/);
});

test("用户可见名称统一为置顶栏并保留公共 sticky 选择器", () => {
  const settings = readUiSource("src/components/SettingsPanel.tsx", "utf8");
  assert.match(settings, /置顶栏/);
  assert.doesNotMatch(settings, /固定展示/);
  const contract = readUiSource("docs/development/native-event-style-contract.md", "utf8");
  assert.match(contract, /\.sticky-area/);
  assert.match(contract, /\.event\.event-sticky/);
});

test("置顶栏归属事件显示而不是副窗口", () => {
  const settings = readUiSource("src/components/SettingsPanel.tsx", "utf8");
  assert.match(settings, /sectionId: "display["'][^\n]*置顶|id: ["']sticky-events"[^\n]*sectionId: "display"/);
  const displaySection = settings.slice(settings.indexOf('data-settings-section="display"'), settings.indexOf('data-settings-section="filters"'));
  const windowSection = settings.slice(settings.indexOf('data-settings-section="windows"'), settings.indexOf('data-settings-section="tts"'));
  assert.match(displaySection, /title=["']置顶栏["']/);
  assert.doesNotMatch(windowSection, /title=["']置顶栏["']/);
});

test("隔离预览内部占满 iframe 并保留事件列表高度", () => {
  const frame = readUiSource("src/components/IsolatedPreviewFrame.tsx", "utf8");
  assert.match(frame, /html,body,#root\{height:100%/);
  assert.match(frame, /body\{display:flex/);
  assert.match(frame, /frameDocument\.documentElement\.dataset\.theme\s*=\s*previewPalette \?\? source\.documentElement\.dataset\.theme/);
  const css = readUiSource("src/components/nativeThemeEditor.css", "utf8");
  assert.match(css, /\.isolated-preview-root\{[^}]*height:100%/);
  assert.match(css, /\.native-preview-regions\{[^}]*width:100%/);
});

test("编辑状态变化不会重建预览目标且 iframe 基础样式原位同步", () => {
  const workspace = readUiSource("src/components/ThemeWorkspace.tsx", "utf8");
  const frame = readUiSource("src/components/IsolatedPreviewFrame.tsx", "utf8");
  assert.match(workspace, /const previewSessionAvailable = session !== null/);
  assert.match(workspace, /\[active, view, previewSessionAvailable, selectedObsId, onEditingChange, onPreviewTitleChange\]/);
  assert.doesNotMatch(frame, /querySelectorAll\("\[data-preview-base-style\]"\)\.forEach\(node => node\.remove\(\)\)/);
  assert.match(frame, /sourceStyleCopies/);
  assert.match(frame, /syncPreviewStyles/);
});

test("隔离预览将指针按下传回父窗口用于关闭浮层", () => {
  const frame = readUiSource("src/components/IsolatedPreviewFrame.tsx", "utf8");
  const editor = previewSources();
  assert.match(frame, /onContentPointerDown/);
  assert.match(editor, /STYLE_PREVIEW_POINTER_DOWN_EVENT/);
  assert.match(editor, /onContentPointerDown=/);
});

test("置顶栏结构透明且普通滚轮可转换为横向滚动", () => {
  const area = readUiSource("src/components/StylePreviewArea.tsx", "utf8");
  assert.doesNotMatch(area, /className=\{`\$\{resolved\.areaClass\} sticky-area`\}/);
  assert.match(area, /onWheel=\{handleStickyWheel\}/);
  const css = readUiSource("src/components/nativeThemeEditor.css", "utf8");
  assert.match(css, /\.native-preview-sticky-scroll[^}]*background:transparent/);
  assert.doesNotMatch(area, /className="sticky-area"/);
});

test("独立预览使用 Tauri 子窗口并同步当前预览状态", () => {
  const editor = previewSources();
  const bridge = readUiSource("src/windows/nativeStylePreviewBridge.ts", "utf8");
  assert.doesNotMatch(editor, /window\.open\(/);
  assert.match(editor, /StylePreviewActions/);
  assert.match(editor, /useStylePreviewPublisher/);
  assert.match(bridge, /createAppWindow/);
  assert.match(bridge, /emitTo/);
  assert.match(bridge, /native-style-preview:ready/);
});

test("独立预览复用稳定设置对象，避免无关重渲染重复同步", () => {
  const editor = previewSources();
  assert.match(editor, /const display = useMemo\([\s\S]*normalizeNativeThemeDisplaySettings\(settings\.display\)/);
  assert.match(editor, /const previewPreferences = useMemo\([\s\S]*\.\.\.displayPreferences,[\s\S]*\.\.\.display/);
});

test("棋盘和纯色只作用于编辑器内预览画布", () => {
  const editor = previewSources();
  const previewWindow = readUiSource("src/components/NativeStylePreviewWindow.tsx", "utf8");
  const bridge = readUiSource("src/windows/nativeStylePreviewBridge.ts", "utf8");
  assert.match(editor, /style=\{\{[\s\S]*backgroundColor:\s*previewTransparent \? undefined : previewBackground[\s\S]*\}\}/);
  assert.match(editor, /previewBackground:\s*previewTransparent \? "transparent" : previewBackground/);
  assert.doesNotMatch(previewWindow, /is-checkerboard|payload\.previewBackground/);
  assert.doesNotMatch(bridge, /previewBackground/);
});

test("预览 iframe 与事件区域不附加旧版背景和顶部间距", () => {
  const css = readUiSource("src/components/nativeThemeEditor.css", "utf8");
  assert.match(css, /\.native-preview-stage\{[^}]*padding:0/);
  assert.match(css, /\.native-preview-canvas\{[^}]*border:0/);
  assert.match(css, /\.native-theme-preview\.style-editor-preview-list\{[^}]*border:revert-layer[^}]*background:revert-layer[^}]*padding:revert-layer/);
});

test("预览工具栏常显高频控制并提供多类筛选", () => {
  const toolbar = readUiSource("src/components/StylePreviewToolbar.tsx", "utf8");
  assert.match(toolbar, /aria-label=["']事件筛选["']/);
  assert.match(toolbar, /<Checkbox/);
  assert.match(toolbar, /onEventsChange/);
  assert.match(toolbar, /aria-label=\{props.scheme === "dark" \? ["']切换为浅色["'] : ["']切换为深色["']\}/);
  assert.match(toolbar, /ThemeColorField[^>]*label=["']画布背景["']/);
  assert.match(toolbar, /aria-label=["']窗口宽度["']/);
  assert.doesNotMatch(toolbar, /预览目标|显示全部部件|跟随软件|<details/);
});

test("动态预览提供播放暂停和重新开始", () => {
  const editor = previewSources();
  assert.match(editor, /previewPlaying/);
  assert.match(editor, /暂停|播放/);
  assert.match(editor, /重新开始/);
  assert.match(editor, /ariaLabel=["']动态速度["']/);
  assert.doesNotMatch(editor, /type="range"[\s\S]{0,160}previewSpeed/);
  assert.doesNotMatch(editor, /native-preview-toolbar[^>]*onPointerDownCapture/);
  assert.match(editor, /enabled: previewActive && previewMotion === "dynamic"/);
  assert.match(editor, /playing: previewPlaying/);
});

test("基础设置的事件分组提供全选清空且不改变预览样例", () => {
  const basic = readUiSource("src/components/NativeThemeBasicSettings.tsx", "utf8");
  const editor = previewSources();
  assert.match(basic, /全选/);
  assert.match(basic, /清空/);
  assert.doesNotMatch(basic, /onPreviewKindChange|previewScope|PREVIEW_KIND_BY_SCOPE/);
  assert.doesNotMatch(editor, /onPreviewKindChange=\{setPreviewKind\}/);
});

test("独立预览按软件配色和预览深浅模式设置根环境", () => {
  const previewWindow = readUiSource("src/components/NativeStylePreviewWindow.tsx", "utf8");
  assert.match(previewWindow, /applyThemeToDocument\(state.palette, state.scheme, state.customColor\)/);
  assert.match(previewWindow, /StylePreviewContent state=\{state\}/);
});

test("预览选择在编辑器重新挂载时保留", () => {
  const editor = previewSources();
  assert.match(editor, /nativePreviewSessionState/);
  assert.match(editor, /nativePreviewSessionState = \{/);
});

test("预览按目标决定置顶栏并仅显示 CSS 错误状态", () => {
  const editor = previewSources();
  const area = readUiSource("src/components/StylePreviewArea.tsx", "utf8");
  assert.match(editor, /showStickyPreview=\{\s*payload.context !== "live"/);
  assert.match(editor, /样式存在错误/);
  assert.doesNotMatch(editor, /样式有效/);
  assert.match(area, /stickySettings\?\.position === "bottom"/);
  assert.match(area, /data-position=\{stickyPosition\}/);
});
