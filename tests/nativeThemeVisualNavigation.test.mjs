import { readUiSource } from "./helpers/readUiSource.mjs";
import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test from "node:test";
import assert from "node:assert/strict";
import * as capabilities from "../src/themes/nativeThemeCapabilities.ts";
import { normalizeNativeNavigationSelection } from "../src/themes/nativeVisualNavigation.ts";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "./helpers/vite.mjs";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

let vite;
test.after(async () => { await vite?.close(); });

test("整体部件可独立选择，别名沿用同一入口", () => {
  for (const [part, expected] of [["user","user"],["content","content"],["identity","user"],["canvas","whole"],["giftValue","giftPrice"]]) {
    assert.equal(normalizeNativeNavigationSelection({event:part === "giftValue" ? "normal" : "all",identity:"all",part}).part, expected);
  }
});

test("可视化导航按确认顺序组织默认展开分类与价格子项", () => {
  const navigation = capabilities.NATIVE_VISUAL_NAVIGATION;
  assert.ok(Array.isArray(navigation));
  assert.deepEqual(
    navigation.filter((group) => group.defaultExpanded).map((group) => group.id),
    ["display", "identity", "content", "emote"],
  );
  const content = navigation.find((group) => group.id === "content");
  assert.deepEqual(content.items.map((item) => item.id), [
    "content", "message", "action", "timestamp", "eventIcon", "activityStatus", "systemTitle", "systemDetail", "systemExpiry", "quantity", "price",
  ]);
  assert.deepEqual(content.items.find((item) => item.id === "price").children.map((item) => item.id), [
    "price", "priceUnit", "priceValue",
  ]);
});

test("左侧导航严格保留确认的完整父子层级", () => {
  const navigation = capabilities.NATIVE_VISUAL_NAVIGATION;
  const display = navigation.find((group) => group.id === "display");
  const identity = navigation.find((group) => group.id === "identity");
  const content = navigation.find((group) => group.id === "content");
  const gift = navigation.find((group) => group.id === "gift");
  const superchat = navigation.find((group) => group.id === "superchat");
  const guard = navigation.find((group) => group.id === "guard");
  const lotteryRedpocket = navigation.find((group) => group.id === "lotteryRedpocket");
  const shape = (items) => items.map((item) => [item.label ?? capabilities.NATIVE_SEMANTIC_PARTS.find((part) => part.id === item.id)?.label, item.children ? shape(item.children) : null]);

  assert.deepEqual(shape(display.items), [
    ["事件区", null], ["事件", [["所有事件", null], ["普通事件", [["事件卡片", null], ["信息组", null]]], ["置顶事件", null]]], ["事件列表", null], ["置顶栏", null],
  ]);
  assert.deepEqual(shape(identity.items), [
    ["用户信息整体", null], ["头像区域", [["头像占位", null], ["头像框", null], ["头像", null]]], ["用户名", null], ["粉丝牌", [["粉丝牌名称", null], ["粉丝牌等级", null]]], ["身份徽章", [["大航海身份", null], ["主播身份", null], ["房管身份", null]]], ["荣耀勋章", null], ["当前排行", null],
  ]);
  assert.deepEqual(shape(content.items), [["内容区域", null], ["正文", null], ["动作文字", null], ["时间", null], ["事件图标", null], ["活动状态", null], ["系统标题", null], ["系统详情", null], ["解禁时间", null], ["数量", [["数量符号", null], ["数量数值", null], ["数量单位", null]]], ["价格", [["价格整体", null], ["货币符号", null], ["金额数值", null]]]]);
  assert.deepEqual(shape(gift.items), [["礼物图片", null], ["礼物信息", [["礼物名称", null], ["礼物数量", null]]], ["礼物金额", null], ["盲盒图片", null], ["盲盒信息", [ ["盲盒名称", null], ["盲盒数量", null], ["盲盒盈亏", [["盲盒盈利", null], ["盲盒亏损", null]]], ["盲盒原价", null]]]]);
  assert.deepEqual(shape(superchat.items), [["正文", null], ["价格", [["价格整体", null], ["货币符号", null], ["金额数值", null]]], ["平台译文", null], ["删除状态", null]]);
  assert.deepEqual(shape(guard.items), [["大航海内容", [["大航海名称", null], ["大航海时长", [["时长前缀", null], ["时长数值", null], ["时长单位", null]]]]], ["陪伴天数", [["陪伴前缀", null], ["陪伴数值", null], ["陪伴单位", null]]], ["大航海高亮", null], ["成就标题", null], ["成就说明", null], ["成就里程碑", null], ["成就水印", null], ["价格整体", null]]);
  assert.deepEqual(shape(lotteryRedpocket.items), [
    ["红包", [["红包名称", null], ["红包奖励", [["奖励前缀", null], ["红包奖励数量", null]]], ["红包口令", [["口令前缀", null], ["口令正文", null]]], ["开奖时间", null], ["活动状态", null]]],
    ["天选", [["天选奖品", null], ["天选名额", null], ["天选口令", [["口令前缀", null], ["口令正文", null]]], ["参与礼物", [["礼物前缀", null], ["参与礼物名称", null]]], ["开奖时间", null], ["活动状态", null], ["参与条件", [["条件前缀", null], ["条件正文", null]]]]],
    ["中奖", [["开奖摘要", null], ["中奖人数", null], ["名单接收提示", null], ["中奖内容", [["中奖项", null], ["中奖头像", null], ["中奖用户", null]]], ["名单展开", null]]],
  ]);
  assert.equal(lotteryRedpocket.items[0].event, "redpocket");
  assert.equal(lotteryRedpocket.items[1].event, "lottery");
  assert.equal(lotteryRedpocket.items[2].event, "all");
});

test("纯分类与可编辑父部件使用不同的选择入口", async () => {
  vite ??= await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-nativeThemeVisualNavigation.test.mjs", root: fileURLToPath(new URL("..", import.meta.url)), configFile: false, esbuild: { jsx: "automatic" }, server: { middlewareMode: true, watch: null }, optimizeDeps: {noDiscovery:true,include:[]}, logLevel: "silent" });
  const { NativeThemeVisualEditor } = await vite.ssrLoadModule("/src/components/NativeThemeVisualEditor.tsx");
  const { createBuiltinNativeTheme } = await vite.ssrLoadModule("/src/themes/nativeBuiltinThemes.ts");
  const settings = createBuiltinNativeTheme("native-default").settings;
  const html = renderToStaticMarkup(React.createElement(NativeThemeVisualEditor, {
    settings, selection: { event: "all", identity: "all", part: "avatarWrap" }, cssControlled: [], fontFamilyOptions: [settings.fontFamily],
    onOpenFonts() {}, onSelectionChange() {}, onChange() {}, onDisplayChange() {},
  }));
  assert.match(html, /<summary class="native-part-summary is-editable"><button[^>]*data-native-part-id="avatarWrap"[^>]*>头像区域<\/button><\/summary>/);
  assert.match(html, /<summary class="native-part-summary is-category">事件<\/summary>/);
  assert.doesNotMatch(html, /data-native-part-id="events"/);
  assert.doesNotMatch(html, /<details class="native-part-tree" data-native-nav-level="2" open=""><summary class="native-part-summary is-editable"><button[^>]*data-native-part-id="avatarWrap"/);
});

test("事件专属部件只出现在适用的事件分类", () => {
  const navigation = capabilities.NATIVE_VISUAL_NAVIGATION;
  const contentIds = navigation.find((group) => group.id === "content").items.map((item) => item.id);
  const danmakuIds = navigation.find((group) => group.id === "danmaku").items.map((item) => item.id);
  const superchatIds = navigation.find((group) => group.id === "superchat").items.map((item) => item.id);
  for (const id of ["reply", "repeatCount", "translation", "deletedStatus"]) assert.equal(contentIds.includes(id), false);
  assert.deepEqual(danmakuIds, ["deletedStatus", "reply", "repeatCount"]);
  assert.ok(superchatIds.includes("translation"));
  assert.ok(superchatIds.includes("deletedStatus"));
});

test("醒目留言与大航海导航保留事件范围且大航海包含价格", () => {
  const navigation = capabilities.NATIVE_VISUAL_NAVIGATION;
  const superchat = navigation.find((group) => group.id === "superchat");
  const guard = navigation.find((group) => group.id === "guard");
  assert.equal(superchat.event, "superchat");
  assert.ok(superchat.items.some((item) => item.id === "message"));
  assert.ok(superchat.items.some((item) => item.id === "price"));
  assert.equal(guard.event, "guard");
  assert.ok(guard.items.some((item) => item.id === "price"));
  assert.ok(guard.items.some((item) => item.id === "guardContent"));
});

test("属性分组直接复用部件能力且按高低频设置折叠状态", () => {
  const text = capabilities.nativeVisualPropertySectionsForPart("username");
  assert.deepEqual(text.filter((group) => group.defaultExpanded).map((group) => group.id), ["display", "typography", "surface"]);
  assert.deepEqual(text.find((group) => group.id === "typography").properties, ["fontFamily", "fontSize", "fontWeight", "lineHeight"]);
  assert.deepEqual(text.find((group) => group.id === "surface").properties, ["color", "background"]);
  assert.equal(text.some((group) => group.id === "media"), false);

  const image = capabilities.nativeVisualPropertySectionsForPart("giftImage");
  assert.equal(image.some((group) => group.id === "typography"), false);
  assert.deepEqual(image.find((group) => group.id === "media").properties, ["width", "height"]);

  const container = capabilities.nativeVisualPropertySectionsForPart("user");
  assert.deepEqual(container.find((group) => group.id === "layout").properties, ["gap"]);
  assert.equal(container.some((group) => group.id === "media"), false);
  assert.equal(container.flatMap(group => group.properties).includes("color"), false);
  const icon = capabilities.nativeVisualPropertySectionsForPart("anchorBadge", "image");
  assert.deepEqual(icon.find(group => group.id === "surface").properties, ["color"]);
  assert.equal(icon.some(group => group.id === "typography"), false);
});

test("切换形态的部件只显示当前文字或图片属性", () => {
  const text = capabilities.nativeVisualPropertySectionsForPart("guardBadge", "text").flatMap((group) => group.properties);
  const image = capabilities.nativeVisualPropertySectionsForPart("guardBadge", "image").flatMap((group) => group.properties);
  assert.ok(text.includes("fontSize"));
  assert.equal(text.includes("width"), false);
  assert.ok(image.includes("height"));
  assert.equal(image.includes("width"), false);
  assert.equal(image.includes("fontSize"), false);
});

test("属性面板显示完整编辑上下文、分组和简化继承状态", async () => {
  vite ??= await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-nativeThemeVisualNavigation.test.mjs", root: fileURLToPath(new URL("..", import.meta.url)), configFile: false, esbuild: { jsx: "automatic" }, server: { middlewareMode: true, watch: null }, optimizeDeps: {noDiscovery:true,include:[]}, logLevel: "silent" });
  const { NativeThemeVisualEditor } = await vite.ssrLoadModule("/src/components/NativeThemeVisualEditor.tsx");
  const { createBuiltinNativeTheme } = await vite.ssrLoadModule("/src/themes/nativeBuiltinThemes.ts");
  const settings = createBuiltinNativeTheme("native-default").settings;
  const html = renderToStaticMarkup(React.createElement(NativeThemeVisualEditor, {
    settings,
    selection: { event: "superchat", identity: "captain", part: "message" },
    cssControlled: [],
    fontFamilyOptions: [settings.fontFamily],
    onOpenFonts() {}, onSelectionChange() {}, onChange() {}, onDisplayChange() {},
  }));
  assert.match(html, /class="native-edit-context"/);
  assert.match(html, /<span>事件<\/span><strong>醒目留言<\/strong>/);
  assert.match(html, /<span>身份<\/span><strong>舰长<\/strong>/);
  assert.match(html, /<span>部件<\/span><strong title=["']醒目留言 \/ 正文["']>醒目留言 \/ 正文<\/strong>/);
  assert.match(html, /<span>配色<\/span><strong>通用<\/strong>/);
  for (const label of ["显示", "文字", "颜色与背景", "间距", "边框"]) assert.match(html, new RegExp(label));
  assert.match(html, /继承自通用|继承主题/);
  assert.doesNotMatch(html, /来源/);
});

test("全局部件隐藏不可用范围按钮并明确显示全局范围", async () => {
  vite ??= await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-nativeThemeVisualNavigation.test.mjs", root: fileURLToPath(new URL("..", import.meta.url)), configFile: false, esbuild: { jsx: "automatic" }, server: { middlewareMode: true, watch: null }, optimizeDeps: {noDiscovery:true,include:[]}, logLevel: "silent" });
  const { NativeThemeVisualEditor } = await vite.ssrLoadModule("/src/components/NativeThemeVisualEditor.tsx");
  const { createBuiltinNativeTheme } = await vite.ssrLoadModule("/src/themes/nativeBuiltinThemes.ts");
  const settings = createBuiltinNativeTheme("native-default").settings;
  const html = renderToStaticMarkup(React.createElement(NativeThemeVisualEditor, {
    settings, selection: { event: "all", identity: "all", part: "whole" }, cssControlled: [], fontFamilyOptions: [settings.fontFamily],
    onOpenFonts() {}, onSelectionChange() {}, onChange() {}, onDisplayChange() {},
  }));
  assert.match(html, /class="native-global-scope"/);
  assert.match(html, /适用范围/);
  assert.match(html, /全部事件与所有用户/);
  assert.doesNotMatch(html, /class="native-event-scope-primary"/);
  assert.doesNotMatch(html, /class="native-identity-scope"/);
  assert.match(html, /<span>范围<\/span><strong>全局<\/strong>/);
  assert.match(html, /<span>部件<\/span><strong title=["']显示区域 \/ 事件区["']>显示区域 \/ 事件区<\/strong>/);
});

test("价格导航渲染为默认折叠子树且不重复价格整体", async () => {
  vite ??= await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-nativeThemeVisualNavigation.test.mjs", root: fileURLToPath(new URL("..", import.meta.url)), configFile: false, esbuild: { jsx: "automatic" }, server: { middlewareMode: true, watch: null }, optimizeDeps: {noDiscovery:true,include:[]}, logLevel: "silent" });
  const { NativeThemeVisualEditor } = await vite.ssrLoadModule("/src/components/NativeThemeVisualEditor.tsx");
  const { createBuiltinNativeTheme } = await vite.ssrLoadModule("/src/themes/nativeBuiltinThemes.ts");
  const settings = createBuiltinNativeTheme("native-default").settings;
  const html = renderToStaticMarkup(React.createElement(NativeThemeVisualEditor, {
    settings, selection: { event: "all", identity: "all", part: "message" }, cssControlled: [], fontFamilyOptions: [settings.fontFamily],
    onOpenFonts() {}, onSelectionChange() {}, onChange() {}, onDisplayChange() {},
  }));
  const priceTree = html.match(/<details class="native-part-tree"[^>]*><summary class="native-part-summary is-editable"><button[^>]*>价格<\/button><\/summary>([\s\S]*?)<\/details>/)?.[0] ?? "";
  assert.ok(priceTree);
  assert.doesNotMatch(priceTree, /<details[^>]* open/);
  assert.equal((priceTree.match(/>价格整体<\/button>/g) ?? []).length, 1);
  assert.match(priceTree, /货币符号/);
  assert.match(priceTree, /金额数值/);
});

test("浏览器验收页提供编辑器挂载节点", () => {
  const source = readUiSource("tests/nativeThemeVisualEditor.browser.html", "utf8");
  assert.match(source, /<div id="root"><\/div>/);
});

test("导航折叠状态只使用事件发生时捕获的展开值", async () => {
  vite ??= await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-nativeThemeVisualNavigation.test.mjs", root: fileURLToPath(new URL("..", import.meta.url)), configFile: false, esbuild: { jsx: "automatic" }, server: { middlewareMode: true, watch: null }, optimizeDeps: {noDiscovery:true,include:[]}, logLevel: "silent" });
  const visualEditor = await vite.ssrLoadModule("/src/components/NativeThemeVisualEditor.tsx");
  assert.equal(typeof visualEditor.updateNativeNavigationGroup, "function");
  const opened = visualEditor.updateNativeNavigationGroup(new Set(["display"]), "gift", true);
  const closed = visualEditor.updateNativeNavigationGroup(opened, "display", false);
  assert.deepEqual([...opened], ["display", "gift"]);
  assert.deepEqual([...closed], ["gift"]);
});

test("画布工具栏左侧显示背景并在右侧显示内嵌单位的宽度", async () => {
  vite ??= await createServer({configFile:false,esbuild:{jsx:"automatic"},cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-nativeThemeVisualNavigation.test.mjs",optimizeDeps:{noDiscovery:true,include:[]},
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: {watch:null, middlewareMode: true },
    appType: "custom",
    logLevel: "silent",
  });
  await vite.ssrLoadModule("/src/components/StylePreviewToolbar.tsx");
  const html = readUiSource("src/components/StylePreviewToolbar.tsx", "utf8");
  assert.match(html, /native-preview-canvas-color[\s\S]*native-preview-width/);
  assert.match(html, /ThemeColorField[^>]*label=["']画布背景["']/);
  assert.match(html, /aria-label=["']窗口宽度["']/);
  assert.match(html, /title=["']窗口宽度["']/);
  assert.match(html, /<span className="native-preview-width-unit">px<\/span>/);
  assert.doesNotMatch(html, /<span>画布宽度<\/span>|<span>背景<\/span>/);
  assert.doesNotMatch(html, /native-preview-canvas-popover/);
});

test("可视化导航为四级结构提供明确层级标记", async () => {
  vite ??= await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-nativeThemeVisualNavigation.test.mjs", root: fileURLToPath(new URL("..", import.meta.url)), configFile: false, esbuild: { jsx: "automatic" }, server: { middlewareMode: true, watch: null }, optimizeDeps: {noDiscovery:true,include:[]}, logLevel: "silent" });
  const { NativeThemeVisualEditor } = await vite.ssrLoadModule("/src/components/NativeThemeVisualEditor.tsx");
  const { createBuiltinNativeTheme } = await vite.ssrLoadModule("/src/themes/nativeBuiltinThemes.ts");
  const settings = createBuiltinNativeTheme("native-default").settings;
  const html = renderToStaticMarkup(React.createElement(NativeThemeVisualEditor, {
    settings, selection: { event: "all", identity: "all", part: "event" }, cssControlled: [], fontFamilyOptions: [settings.fontFamily],
    onOpenFonts() {}, onSelectionChange() {}, onChange() {}, onDisplayChange() {},
  }));
  assert.match(html, /data-native-nav-level="1"/);
  assert.match(html, /data-native-nav-level="2"/);
  assert.match(html, /data-native-nav-level="3"/);
  assert.match(html, /data-native-nav-level="4"/);
});

test("点选子部件时自动展开其全部导航祖先", async () => {
  vite ??= await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-nativeThemeVisualNavigation.test.mjs", root: fileURLToPath(new URL("..", import.meta.url)), configFile: false, esbuild: { jsx: "automatic" }, server: { middlewareMode: true, watch: null }, optimizeDeps: {noDiscovery:true,include:[]}, logLevel: "silent" });
  const { NativeThemeVisualEditor } = await vite.ssrLoadModule("/src/components/NativeThemeVisualEditor.tsx");
  const { createBuiltinNativeTheme } = await vite.ssrLoadModule("/src/themes/nativeBuiltinThemes.ts");
  const settings = createBuiltinNativeTheme("native-default").settings;
  const html = renderToStaticMarkup(React.createElement(NativeThemeVisualEditor, {
    settings, selection: { event: "all", identity: "all", part: "avatarFrame" }, cssControlled: [], fontFamilyOptions: [settings.fontFamily],
    onOpenFonts() {}, onSelectionChange() {}, onChange() {}, onDisplayChange() {},
  }));
  assert.match(html, /<details class="native-part-tree" data-native-nav-level="2" open=""><summary class="native-part-summary is-editable"><button[^>]*data-native-part-id="avatarWrap"[^>]*>头像区域<\/button><\/summary>/);
});
