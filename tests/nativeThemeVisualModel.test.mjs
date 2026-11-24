import test from "node:test";
import assert from "node:assert/strict";
import {
  baseRelativeNativeLength,
  createDefaultNativeVisualModel,
  fixedNativeLength,
  normalizeNativeVisualModel,
  readNativeVisualProperty,
  setNativeVisualProperty,
  resolveNativeLength,
  toBaseRelativeNativeLength,
} from "../src/themes/nativeComponentAppearance.ts";
import { renderManagedNativeCss } from "../src/themes/nativeManagedCss.ts";
import { reverseSyncNativeVisualCss } from "../src/themes/nativeCssReverseSync.ts";
import { createBuiltinNativeTheme } from "../src/themes/nativeBuiltinThemes.ts";
import { nativeVisualPropertiesForPart } from "../src/themes/nativeThemeCapabilities.ts";
import { nativeVisualCodeDefault } from "../src/themes/nativeThemeDefaults.ts";
import fs from "node:fs";

test("回复颜色使用独立变量并支持可视化反向同步", () => {
  const document = createBuiltinNativeTheme("native-default");
  const target = { event: "danmaku", identity: "all", part: "reply" };
  document.settings.visualModel = setNativeVisualProperty(createDefaultNativeVisualModel(), target, "color", { source: "custom", value: "#fb7299" });
  const css = renderManagedNativeCss(document.settings);
  assert.match(css, /--reply-color:\s*#fb7299/);
  const synced = reverseSyncNativeVisualCss('/* visual:common|all|all|reply */\n.event .reply { --reply-color: #f080a0; }');
  assert.equal(readNativeVisualProperty(synced.model, { event: "all", identity: "all", part: "reply" }, "color").value, "#f080a0");
});

test("原生可视化属性按事件身份和部件保存来源", () => {
  const model = createDefaultNativeVisualModel();
  const next = setNativeVisualProperty(model, { event: "gift", identity: "captain", part: "giftPrice" }, "color", { source: "custom", value: "#ff3355" });
  assert.deepEqual(readNativeVisualProperty(next, { event: "gift", identity: "captain", part: "giftPrice" }, "color"), { source: "custom", value: "#ff3355" });
  assert.deepEqual(readNativeVisualProperty(next, { event: "gift", identity: "captain", part: "giftPrice" }, "fontSize"), { source: "inherit" });
});

test("清除局部属性恢复继承且不影响其他作用域", () => {
  let model = createDefaultNativeVisualModel();
  model = setNativeVisualProperty(model, { event: "danmaku", identity: "ordinary", part: "message" }, "fontSize", { source: "custom", value: 30 });
  model = setNativeVisualProperty(model, { event: "gift", identity: "ordinary", part: "message" }, "fontSize", { source: "theme", value: 18 });
  model = setNativeVisualProperty(model, { event: "danmaku", identity: "ordinary", part: "message" }, "fontSize", { source: "inherit" });
  assert.deepEqual(readNativeVisualProperty(model, { event: "danmaku", identity: "ordinary", part: "message" }, "fontSize"), { source: "inherit" });
  assert.deepEqual(readNativeVisualProperty(model, { event: "gift", identity: "ordinary", part: "message" }, "fontSize"), { source: "theme", value: 18 });
});

test("受管理 CSS 组合事件身份和语义部件且位于自定义 CSS 之前", () => {
  const document = createBuiltinNativeTheme("native-default");
  document.settings.visualModel = setNativeVisualProperty(createDefaultNativeVisualModel(), { event: "gift", identity: "captain", part: "giftPrice" }, "color", { source: "custom", value: "#ff3355" });
  const css = renderManagedNativeCss(document.settings);
  assert.match(css, /\.event\.type-gift\.guard-level-3/);
  assert.match(css, /\.gift-price/);
  assert.match(css, /color: #ff3355/);
});

test("默认原生主题只生成缺省可见性规则", () => {
  const document = createBuiltinNativeTheme("native-default");
  assert.match(renderManagedNativeCss(document.settings), /\.event \.badges:not\(:has/);
  assert.doesNotMatch(renderManagedNativeCss(document.settings), /visual:|\[hidden\]/);
});

test("关闭事件分类只隐藏该分类并保留子类选择", () => {
  const document = createBuiltinNativeTheme("native-default");
  document.settings.eventVisibility.categories.gift = false;
  document.settings.eventVisibility.children.blind = true;
  const css = renderManagedNativeCss(document.settings);
  assert.match(css, /\.theme-target-obs \.event\.type-gift, \.theme-target-obs \.event\.type-redpocket, \.theme-target-obs \.event\.type-lottery \{\n  display: none;/);
  assert.equal(document.settings.eventVisibility.children.blind, true);
});

test("可视化编辑将一级事件范围与二级范围分行固定显示", () => {
  const editor = fs.readFileSync("src/components/ThemeEditorChrome.tsx", "utf8");
  const source = fs.readFileSync("src/components/NativeThemeVisualEditor.tsx", "utf8");
  const capabilities = fs.readFileSync("src/themes/nativeThemeCapabilities.ts", "utf8");
  assert.match(source, /native-event-scope-primary/);
  assert.match(source, /native-event-scope-children/);
  const css = fs.readFileSync("src/components/nativeThemeEditor.css", "utf8");
  assert.doesNotMatch(css, /\.native-scope-strip\{[^}]*position:sticky/);
  assert.match(capabilities, /所有用户/);
  assert.doesNotMatch(css, /\.native-event-scope-children\{[^}]*border-top/);
  assert.match(css, /\.native-visual-body\{[^}]*min-height:0[^}]*flex:1 1 auto/);
  assert.match(css, /\.native-visual-body nav\{[^}]*overflow:auto/);
  assert.match(css, /\.native-property-panel\{[^}]*overflow:auto/);
  assert.match(editor, /native-editor-content\$\{section === "visual" \? " is-visual" : section === "advanced" \? " is-advanced" : ""\}/);
  assert.match(css, /\.native-editor-content\.is-visual\{[^}]*overflow:hidden/);
});

test("仅在当前部件存在局部覆盖时显示恢复继承", () => {
  const source = fs.readFileSync("src/components/NativeThemeVisualEditor.tsx", "utf8");
  assert.match(source, /hasLocalOverrides/);
  assert.match(source, /canRestore=\{!activeBand&&hasLocalOverrides\}/);
  assert.match(source, /clearNativeVisualTarget/);
});

test("直接操作属性控件会切换到自定义而无需预先选择来源", () => {
  const source = fs.readFileSync("src/components/NativeThemeVisualEditor.tsx", "utf8");
  assert.match(source, /const editDirect/);
  assert.doesNotMatch(source, /type="color" disabled=/);
  assert.doesNotMatch(source, /type="number"[^>]*disabled=/);
  const field = fs.readFileSync("src/components/ThemeVisualPropertyField.tsx", "utf8");
  assert.match(field, /label=\{`\$\{label\}精确值`\}/);
});

test("整体范围和全部用户生成可命中预览的选择器", () => {
  const document = createBuiltinNativeTheme("native-default");
  document.settings.visualModel = setNativeVisualProperty(createDefaultNativeVisualModel(), { event: "all", identity: "all", part: "whole" }, "fontSize", { source: "custom", value: 30 });
  const css = renderManagedNativeCss(document.settings);
  assert.match(css, /\.event-area/);
  assert.match(css, /--event-font-size: 30px/);
});

test("部件只公开在实际布局中有效的可视化属性", () => {
  assert.deepEqual(nativeVisualPropertiesForPart("username").filter(value => !["imageBackground", "imageDecorations", "borderImage"].includes(value)), ["visible", "fontFamily", "color", "background", "fontSize", "fontWeight", "lineHeight", "paddingX", "paddingY", "marginX", "marginY", "borderWidth", "borderColor", "borderRadius"]);
  assert.equal(nativeVisualPropertiesForPart("username").includes("gap"), false);
  assert.equal(nativeVisualPropertiesForPart("username").includes("width"), false);
  assert.equal(nativeVisualPropertiesForPart("giftImage").includes("fontSize"), false);
  assert.equal(nativeVisualPropertiesForPart("giftImage").includes("width"), true);
  assert.equal(nativeVisualPropertiesForPart("user").includes("gap"), true);
});

test("不存在真实 DOM 的事件文案不进入可选语义部件", () => {
  const capabilities = fs.readFileSync("src/themes/nativeThemeCapabilities.ts", "utf8");
  assert.doesNotMatch(capabilities, /part\("eventText"/);
  assert.doesNotMatch(capabilities, /id: "connection"/);
  assert.match(capabilities, /id: "roomChange"/);
});

test("旧版平面视觉模型归入通用层，深浅层只保存稀疏覆盖", () => {
  const target = { event: "gift", identity: "captain", part: "message" };
  const legacy = { "gift|captain|message": { color: { source: "custom", value: "#112233" } } };
  const normalized = normalizeNativeVisualModel(legacy);
  assert.deepEqual(readNativeVisualProperty(normalized, target, "color", "common"), { source: "custom", value: "#112233" });
  assert.deepEqual(readNativeVisualProperty(normalized, target, "color", "dark"), { source: "inherit" });
  const dark = setNativeVisualProperty(normalized, target, "color", { source: "custom", value: "#ddeeff" }, "dark");
  assert.deepEqual(readNativeVisualProperty(dark, target, "color", "common"), { source: "custom", value: "#112233" });
  assert.deepEqual(readNativeVisualProperty(dark, target, "color", "dark"), { source: "custom", value: "#ddeeff" });
  assert.deepEqual(dark.light, {});
});

test("长度明确区分手写固定值和结构化基准比例", () => {
  assert.deepEqual(fixedNativeLength(14), { mode: "fixed", value: 14 });
  assert.deepEqual(baseRelativeNativeLength(14 / 16), { mode: "base-relative", ratio: 0.875 });
});

test("可视化控件把尺寸输入保存为相对当前基准的比例", () => {
  assert.deepEqual(toBaseRelativeNativeLength(14, 16), { mode: "base-relative", ratio: 0.875 });
  assert.equal(resolveNativeLength(toBaseRelativeNativeLength(14, 16), 20), 17.5);
});

test("未编辑部件的控件默认值与原生渲染比例一致", () => {
  const settings = createBuiltinNativeTheme("native-default").settings;
  const target = part => ({ event: "all", identity: "all", part });
  assert.deepEqual(nativeVisualCodeDefault(target("avatar"), "width", settings), baseRelativeNativeLength(1.5));
  assert.deepEqual(nativeVisualCodeDefault(target("inlineEmote"), "height", settings), baseRelativeNativeLength(1.25));
  assert.deepEqual(nativeVisualCodeDefault(target("medal"), "fontSize", settings), baseRelativeNativeLength(.75));
  assert.deepEqual(nativeVisualCodeDefault(target("giftPrice"), "fontSize", settings), baseRelativeNativeLength(1));
  assert.deepEqual(nativeVisualCodeDefault(target("row"), "gap", settings), baseRelativeNativeLength(.5));
  assert.deepEqual(nativeVisualCodeDefault(target("bigEmote"), "width", settings), baseRelativeNativeLength(2.5));
  assert.deepEqual(nativeVisualPropertiesForPart("bigEmote").filter(property => property === "width" || property === "height"), ["width"]);
});

for (const themeId of ["native-default", "native-card", "native-bubble"]) {
  test(`${themeId} 无预览时的醒目留言译文字号为基准的 0.875 倍`, () => {
    const { settings, styles } = createBuiltinNativeTheme(themeId);
    const target = { event: "superchat", identity: "all", part: "translation" };
    const value = nativeVisualCodeDefault(target, "fontSize", settings, styles.baseCss);
    assert.equal(resolveNativeLength(value, 16), 14);
    assert.equal(resolveNativeLength(value, 24), 21);
  });
}

test("轻语气泡无预览时区分普通事件与开播下播时间字号", () => {
  const { settings, styles } = createBuiltinNativeTheme("native-bubble");
  const target = { identity: "all", part: "timestamp" };
  for (const event of ["all", "danmaku", "gift", "interaction"]) {
    const value = nativeVisualCodeDefault({ ...target, event }, "fontSize", settings, styles.baseCss);
    assert.equal(resolveNativeLength(value, 16), 12, event);
    assert.equal(resolveNativeLength(value, 24), 18, event);
  }
  const lifecycleTime = nativeVisualCodeDefault({ ...target, event: "liveStatus" }, "fontSize", settings, styles.baseCss);
  assert.equal(resolveNativeLength(lifecycleTime, 16), 14);
});

test("浅映卡片无预览时提供开播下播时间的字号和行高", () => {
  const { settings, styles } = createBuiltinNativeTheme("native-card");
  for (const event of ["liveStatus", "liveStart", "liveEnd"]) {
    const target = { event, identity: "all", part: "timestamp" };
    const value = nativeVisualCodeDefault(target, "fontSize", settings, styles.baseCss);
    assert.equal(resolveNativeLength(value, 16), 12, event);
    assert.equal(resolveNativeLength(value, 24), 18, event);
    assert.equal(nativeVisualCodeDefault(target, "lineHeight", settings, styles.baseCss), 1.4, event);
  }
  const chatTime = nativeVisualCodeDefault({ event: "danmaku", identity: "all", part: "timestamp" }, "fontSize", settings, styles.baseCss);
  assert.equal(resolveNativeLength(chatTime, 16), 14);
});

test("大表情可视化只显示一个尺寸控件", () => {
  const source = fs.readFileSync("src/components/NativeThemeVisualEditor.tsx", "utf8");
  assert.match(source, /selection\.part\s*===\s*"bigEmote"\s*&&\s*property\s*===\s*"width"\s*\?\s*"尺寸"/);
});

test("主题显示设置不再保存现场和副窗口大表情尺寸", () => {
  const settings = createBuiltinNativeTheme("native-default").settings;
  assert.equal("bigEmoteWidth" in settings.display, false);
  assert.equal("windowBigEmoteWidth" in settings.display, false);
});

test("通用与深浅稀疏覆盖分别生成且相对尺寸直接引用主题基准", () => {
  const document = createBuiltinNativeTheme("native-default");
  document.settings.visualModel = {
    common: { "all|all|message": { fontSize: { source: "custom", value: baseRelativeNativeLength(0.875) } } },
    light: {},
    dark: { "all|all|message": { color: { source: "custom", value: "#eeeeee" } } },
  };
  const css = renderManagedNativeCss(document.settings);
  assert.match(css, /font-size: calc\(var\(--event-font-size, 16px\) \* 0\.875\)/);
  assert.match(css, /visual:dark\|all\|all\|message/);
  assert.match(css, /\.dark \.event \.message/);
  assert.doesNotMatch(css, /\bem\b/);
});

test("深色 CSS 同步后可按深色层读取修改和恢复", () => {
  const target = { event: "all", identity: "all", part: "message" };
  const synced = reverseSyncNativeVisualCss(
    `/* visual:dark|all|all|message */\n.dark .event .message { color: #eeeeee; }`,
    {},
  ).model;
  assert.deepEqual(readNativeVisualProperty(synced, target, "color", "dark"), { source: "custom", value: "#eeeeee" });
  const changed = setNativeVisualProperty(synced, target, "color", { source: "custom", value: "#dddddd" }, "dark");
  assert.deepEqual(readNativeVisualProperty(changed, target, "color", "dark"), { source: "custom", value: "#dddddd" });
  assert.deepEqual(readNativeVisualProperty(changed, target, "color", "common"), { source: "inherit" });
  const inherited = setNativeVisualProperty(changed, target, "color", { source: "inherit" }, "dark");
  assert.deepEqual(readNativeVisualProperty(inherited, target, "color", "dark"), { source: "inherit" });
});

test("可视化面板的读取写入恢复和 CSS 控制状态使用当前编辑配色", () => {
  const source = fs.readFileSync("src/components/NativeThemeVisualEditor.tsx", "utf8");
  assert.match(source, /编辑配色/);
  assert.match(source, /readNativeVisualProperty\(model, selection, property, editScheme\)/);
  assert.match(source, /setNativeVisualProperty\(model, selection, property, setting, editScheme\)/);
  assert.match(source, /clearNativeVisualTarget\(model, selection, editScheme\)/);
  assert.match(source, /field\.scheme === editScheme/);
});

test("预览 iframe 内部提供画布语义节点", () => {
  const editor = fs.readFileSync("src/components/NativeThemeEditor.tsx", "utf8");
  assert.match(editor, /className="native-theme-preview"\s+data-native-canvas/);
});

test("可视化草稿只保存结构化模型且预览消费独立 CSS 层", () => {
  const workspace = fs.readFileSync("src/components/ThemeWorkspace.tsx", "utf8");
  const editor = fs.readFileSync("src/components/NativeThemeEditor.tsx", "utf8");
  const updateStart = workspace.indexOf("const updateSettings");
  const updateEnd = workspace.indexOf("\n  };", updateStart) + "\n  };".length;
  assert.doesNotMatch(workspace.slice(updateStart, updateEnd), /visualCss:/);
  assert.match(editor, /tryComposeNativePreviewCss/);
  assert.match(editor, /"\.native-theme-preview"/);
});
