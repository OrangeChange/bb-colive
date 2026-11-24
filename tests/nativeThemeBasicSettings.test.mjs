import { readUiSource } from "./helpers/readUiSource.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createDefaultNativeEventVisibility, normalizeNativeEventVisibility } from "../src/themes/nativeComponentAppearance.ts";

test("原生事件显示默认开启且子类状态独立保存", () => {
  const defaults = createDefaultNativeEventVisibility();
  assert.equal(defaults.categories.gift, true);
  assert.equal(defaults.children.blind, true);
  const normalized = normalizeNativeEventVisibility({ categories: { gift: false }, children: { blind: false, normal: true } });
  assert.equal(normalized.categories.gift, false);
  assert.equal(normalized.children.blind, false);
  assert.equal(normalized.children.normal, true);
  assert.equal(normalized.children.free, true);
});

test("新主题时间默认关闭，明确保存值继续保留", async () => {
  const { createDefaultNativeThemeDisplaySettings, normalizeNativeThemeDisplaySettings } = await import("../src/themes/nativeComponentAppearance.ts");
  assert.equal(createDefaultNativeThemeDisplaySettings().showTimestamp, false);
  assert.equal(normalizeNativeThemeDisplaySettings({ showTimestamp: true }).showTimestamp, true);
  assert.equal(normalizeNativeThemeDisplaySettings({}).showTimestamp, false);
});

test("可视化字号与字重使用共享精确控件，回看预览不生成13px", () => {
  const visual = readUiSource("src/components/ThemeVisualPropertyField.tsx", "utf8");
  const preview = readUiSource("src/components/stylePreviewContext.ts", "utf8");
  assert.match(visual, /fontSize:\s*\[["']字号["'],\s*0,\s*640,\s*0.5\]/);
  assert.doesNotMatch(preview, /review\s*\?\s*13/);
});

test("基础设置不把软件行为筛选混入主题", () => {
  const source = readUiSource("src/components/NativeThemeBasicSettings.tsx", "utf8");
  assert.match(source, /事件显示/);
  assert.match(source, /信息元素/);
  assert.doesNotMatch(source, /自动弹幕|未验证手机号|合并相同弹幕|信息流方向|固定展示时间/);
});

test("基础设置按语义分组排列并让分组内部响应式分栏", () => {
  const source = readUiSource("src/components/NativeThemeBasicSettings.tsx", "utf8");
  const css = readUiSource("src/components/nativeThemeEditor.css", "utf8");
  assert.match(css, /\.native-theme-basic\{[^}]*display:flex[^}]*flex-direction:column/);
  assert.match(source, /事件类型/);
  assert.match(source, /互动细项/);
  assert.match(source, /礼物细项/);
  assert.match(source, /系统细项/);
  assert.match(source, /信息元素/);
  assert.match(css, /\.native-theme-toggle-grid\{[^}]*grid-template-columns:repeat\(auto-fit,minmax\(/);
  assert.doesNotMatch(css, /\.native-theme-basic\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.native-editor-content\{[^}]*scrollbar-gutter:stable/);
});

test("编辑器应用不再选择输出位置", () => {
  const source = readUiSource("src/components/ThemeEditorChrome.tsx", "utf8");
  assert.doesNotMatch(source, /ariaLabel=["']应用到["']/);
  assert.match(source, /onClick=\{onApply\}/);
});

test("基础设置的开关紧邻并位于对应文字之前", () => {
  const source = readUiSource("src/components/NativeThemeBasicSettings.tsx", "utf8");
  assert.match(source, /<div className="native-theme-setting-row"[^>]*><PanelSwitch[\s\S]*?<span>\{label\}<\/span><\/div>/);
  const css = readUiSource("src/components/nativeThemeEditor.css", "utf8");
  assert.match(css, /\.native-theme-setting-row\{[^}]*justify-content:flex-start/);
});

test("基础设置只保留事件和元素显示，不承载排版与身份优先级", () => {
  const source = readUiSource("src/components/NativeThemeBasicSettings.tsx", "utf8");
  for (const label of ["用户名", "时间", "用户名打码"]) assert.match(source, new RegExp(label));
  assert.doesNotMatch(source, /全局排版|事件间距|事件内边距|现场字号|副窗口字号|身份样式优先级/);
});

test("信息元素的形式选择器紧邻对应标签", () => {
  const css = readUiSource("src/components/nativeThemeEditor.css", "utf8");
  assert.match(css, /\.native-theme-mode-grid label\{[^}]*justify-content:flex-start/);
  assert.match(css, /\.native-theme-mode-grid \.ui-select-trigger\{[^}]*margin-left:0/);
});

test("身份优先级尺寸作用于共享选择器触发器", () => {
  const css = readUiSource("src/components/nativeThemeEditor.css", "utf8");
  const source = readUiSource("src/components/NativeThemeVisualEditor.tsx", "utf8");
  assert.doesNotMatch(css, /\.native-identity-priority \.ui-select\{/);
  assert.match(css, /\.native-identity-priority \.ui-select-trigger\{[^}]*width:/);
  assert.doesNotMatch(css, /\.native-scope-strip span\{/);
  assert.match(css, /\.native-scope-strip>div>span\{/);
  assert.match(source, /className="native-identity-priority-label"/);
  assert.match(source, /className="native-identity-priority-select"/);
  assert.match(css, /\.native-identity-priority-label\{[^}]*font-size:12px[^}]*line-height:16px/);
  assert.match(css, /\.native-identity-priority-select\{[^}]*font-size:14px[^}]*line-height:20px/);
});

test("样式编辑器只使用既定字号层级", () => {
  const css = readUiSource("src/components/nativeThemeEditor.css", "utf8");
  assert.doesNotMatch(css, /font(?:-size)?:\s*(?:11|13|15|18)px/);
  assert.match(css, /\.native-css-code\{[^}]*font:14px\/20px/);
});

test("主题资源操作使用编辑器次级按钮样式", () => {
  const source = readUiSource("src/components/NativeThemeAdvancedEditor.tsx", "utf8");
  const css = readUiSource("src/components/nativeThemeEditor.css", "utf8");
  assert.match(source, /className="native-theme-asset-action"[^>]*>[\s\S]*?添加图片或字体</);
  assert.match(css, /\.native-theme-asset-action\{[^}]*font-family:inherit[^}]*font-size:12px[^}]*line-height:16px/);
  assert.match(css, /\.native-theme-asset-action:disabled\{/);
});

test("可视化编辑通过语义部件承载排版并保留146限定的身份优先级", () => {
  const source = readUiSource("src/components/NativeThemeVisualEditor.tsx", "utf8");
  assert.doesNotMatch(source, /布局与尺寸|事件间距|事件内边距|现场字号|副窗口字号|现场大表情|副窗口大表情/);
  const fields=readUiSource("src/components/ThemeVisualPropertyField.tsx","utf8");
  for (const label of ["字号", "字重", "水平内边距", "垂直内边距", "水平外边距", "垂直外边距", "宽度", "高度"]) assert.match(fields, new RegExp(label));
  assert.match(source, /身份样式优先级/);
  assert.match(source, /大航海优先/);
  assert.match(source, /房管／主播优先/);
  assert.doesNotMatch(source, /上移|下移/);
});


test("原生默认关闭互动并开启头像框和事件图标，保存选择继续保留", async () => {
  const { createDefaultNativeThemeDisplaySettings, normalizeNativeThemeDisplaySettings } = await import("../src/themes/nativeComponentAppearance.ts");
  const visibility = createDefaultNativeEventVisibility();
  assert.equal(visibility.categories.interaction, false);
  for (const key of ["enter", "follow", "share", "specialFollow", "mutualFollow", "like"]) assert.equal(visibility.children[key], true);
  assert.equal(createDefaultNativeThemeDisplaySettings().showAvatarFrame, true);
  assert.equal(createDefaultNativeThemeDisplaySettings().showEventIcon, true);
  assert.equal(normalizeNativeThemeDisplaySettings({showEventIcon:false}).showEventIcon, false);
  assert.equal(normalizeNativeEventVisibility({categories:{interaction:true}}).categories.interaction, true);
});


test("全部预览开启互动但不改变新主题默认配置", async () => {
  const { createAllNativeEventVisibility } = await import("../src/themes/nativeComponentAppearance.ts");
  assert.equal(createAllNativeEventVisibility().categories.interaction,true);
  assert.equal(createDefaultNativeEventVisibility().categories.interaction,false);
});
