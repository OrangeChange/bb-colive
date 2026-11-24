import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { MsgType } from "../src/protocol/eventTypeCodes.ts";

let vite;
let createBlivechatThemeRuntime;
let createCompatibleThemeModeAdapter;
let projectBlivechatCallback;
let planBlivechatSourceSync;
let getCompatibleThemeEditingSurface;
let renderToStaticMarkup;
let React;
let act;
let createRoot;
let CompatibleThemePreview;
let createBlivechatSourceConfig;
let BlivechatSourceSurface;
let planCompatibleListPresentation;
let EventContextMenu;
let clampRemoteMenuPosition;
let planBlivechatEventWindow;
let advanceBlivechatEventWindow;
let mountBlivechatFallbackRoot;
let readBlivechatFallbackPresentation;
let prepareBlivechatPreviewRecord;
let prepareBlivechatPreviewRecords;
let filterBlivechatPreviewRecords;
let BlivechatSourcePreview;

before(async () => {
  vite = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-blivechatSourceSurface.test.mjs",optimizeDeps:{noDiscovery:true,include:[]}, root: fileURLToPath(new URL("..", import.meta.url)), configFile: false, server: { middlewareMode: true, watch: null }, appType: "custom", logLevel: "silent" });
  ({ createBlivechatThemeRuntime, projectBlivechatCallback, createBlivechatSourceConfig } = await vite.ssrLoadModule("/src/compat/blivechat/index.tsx"));
  ({ planBlivechatSourceSync, planBlivechatEventWindow, advanceBlivechatEventWindow, prepareBlivechatPreviewRecord, prepareBlivechatPreviewRecords, filterBlivechatPreviewRecords, BlivechatSourceSurface, BlivechatSourcePreview } = await vite.ssrLoadModule("/src/compat/blivechat/BlivechatSourceSurface.tsx"));
  ({ mountBlivechatFallbackRoot, readBlivechatFallbackPresentation } = await vite.ssrLoadModule("/src/compat/blivechat/blivechatFallbackSurface.ts"));
  ({ createCompatibleThemeModeAdapter } = await vite.ssrLoadModule("/src/themes/themeModeAdapters.ts"));
  await vite.ssrLoadModule("/src/compat/blivechat/register.tsx");
  ({ getCompatibleThemeEditingSurface } = await vite.ssrLoadModule("/src/components/CompatibleThemePreview.tsx"));
  ({ CompatibleThemePreview } = await vite.ssrLoadModule("/src/components/CompatibleThemePreview.tsx"));
  ({ planCompatibleListPresentation } = await vite.ssrLoadModule("/src/compat/CompatibleEventRenderer.tsx"));
  ({ EventContextMenu, clampRemoteMenuPosition } = await vite.ssrLoadModule("/src/components/EventContextMenu.tsx"));
  React = (await import("react")).default;
  ({ act } = await import("react"));
  ({ renderToStaticMarkup } = await import("react-dom/server"));
  ({ createRoot } = await import("react-dom/client"));
});

test("BLC 原版静态、点选和动态预览使用各自的数据来源", () => {
  const surface = getCompatibleThemeEditingSurface("blivechat");
  const document = createCompatibleThemeModeAdapter("blivechat").createBuiltinTheme();
  const thumbnail = renderToStaticMarkup(React.createElement(surface.renderer, { document, thumbnail: true }));
  const staticPreview = renderToStaticMarkup(React.createElement(surface.renderer, { document, thumbnail: false, previewMode: "static" }));
  const designPreview = renderToStaticMarkup(React.createElement(surface.renderer, { document, thumbnail: false, previewMode: "design" }));
  const dynamicPreview = renderToStaticMarkup(React.createElement(surface.renderer, { document, thumbnail: false, previewMode: "simulation" }));
  assert.match(thumbnail, /iframe[^>]+src="\/blivechat\/renderer\.html"/);
  assert.match(thumbnail, /data-source-sample="fixed-8294"/);
  assert.match(staticPreview, /data-source-sample="static-fixed"/);
  assert.match(designPreview, /data-source-sample="design-fixed"/);
  assert.match(dynamicPreview, /data-source-sample="source-simulation"/);
  assert.doesNotMatch(thumbnail + staticPreview + designPreview + dynamicPreview, /data-blivechat-preview/);
});

test("BLC 原版缩略图取顶部样例，静态预览保留有限部件样例", async () => {
  const { JSDOM } = await import("../vendor/blivechat/node_modules/jsdom/lib/api.js");
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "https://bb.invalid/", pretendToBeVisual: true });
  const previous = { location: globalThis.location, window: globalThis.window, document: globalThis.document, Element: globalThis.Element, Node: globalThis.Node, MutationObserver: globalThis.MutationObserver, fetch: globalThis.fetch, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  const batch = JSON.parse(fs.readFileSync(new URL("../tests/fixtures/compat/blc-original/original-fixed-batch.json", import.meta.url), "utf8"));
  Object.assign(globalThis, { location: dom.window.location, window: dom.window, document: dom.window.document, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, fetch: async () => ({ json: async () => batch }), IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(dom.window.document.getElementById("root"));
  try {
    await act(async () => root.render(React.createElement(BlivechatSourcePreview, { css: "", config: {}, thumbnail: true })));
    const frame = dom.window.document.querySelector("iframe"), sent = [];
    frame.contentWindow.postMessage = message => sent.push(message);
    await act(async () => dom.window.dispatchEvent(new dom.window.MessageEvent("message", { source: frame.contentWindow, origin: dom.window.location.origin, data: { type: "bb-blivechat", command: "ready" } })));
    assert.deepEqual(sent.find(message => message.command === "host")?.data, { scale: 1, tickerEnabled: false, enableBilibiliVideoLinks: false, direction: "top", contentAlignment: "top", managed: true, renderMode: "output" });
    assert.ok(sent.findIndex(message => message.command === "host") < sent.findIndex(message => message.command === "hydrate"));
    const thumbnailRecords = sent.find(message => message.command === "hydrate").data.records;
    await act(async () => root.render(React.createElement(BlivechatSourcePreview, { key: "static", css: "", config: {}, thumbnail: false, previewMode: "static" })));
    const previewFrame = dom.window.document.querySelector("iframe"), previewSent = [];
    previewFrame.contentWindow.postMessage = message => previewSent.push(message);
    await act(async () => dom.window.dispatchEvent(new dom.window.MessageEvent("message", { source: previewFrame.contentWindow, origin: dom.window.location.origin, data: { type: "bb-blivechat", command: "ready" } })));
    const previewRecords = previewSent.find(message => message.command === "preview-window").data.records;
    assert.equal(thumbnailRecords.length, 6);
    const { DEFAULT_STYLE_PREVIEW_POLICY, admitsStylePreviewEvent, projectSourcePreviewFact } = await import('../src/preview/stylePreviewPolicy.ts');
    const expectedRecords = (await import('../src/compat/blivechat/previewRecords.mjs')).createBlivechatFixedPreviewRecords('blivechat').filter(record => admitsStylePreviewEvent(projectSourcePreviewFact(record, 'blivechat'), DEFAULT_STYLE_PREVIEW_POLICY, { target: 'windows', mode: 'static', displayAll: true, now: 0 }));
    assert.deepEqual(previewRecords, expectedRecords);
    assert.deepEqual(thumbnailRecords, previewRecords.slice(0, 6));
  } finally { await act(async () => root.unmount()); Object.assign(globalThis, previous); dom.window.close(); }
});

test("BLC 固定预览不显示未接入的翻译结果", () => {
  const records = prepareBlivechatPreviewRecords([
    { method: "onAddText", payload: { id: "text", content: "正文", translation: "奇怪翻译" } },
    { method: "onUpdateTranslation", data: { id: "text", translation: "后续翻译" } },
    { method: "onAddText", data: { id: "legacy", content: "旧格式正文", translation: "旧格式翻译" } },
    { method: "onAddGift", payload: { id: "gift", giftName: "礼物" } },
  ]);
  assert.deepEqual(records, [
    { method: "onAddText", payload: { id: "text", content: "正文" } },
    { method: "onAddText", data: { id: "legacy", content: "旧格式正文" } },
    { method: "onAddGift", payload: { id: "gift", giftName: "礼物" } },
  ]);
});

test("BLC 固定预览保留来源头像并统一使用本地默认头像", () => {
  const records = prepareBlivechatPreviewRecords([
    { method: "onAddText", payload: { id: "a", avatarUrl: "//static.hdslb.com/images/member/noface.gif" } },
    { method: "onAddText", payload: { id: "b", avatarUrl: "https://example.invalid/custom.png" } },
  ]);
  assert.equal(records[0].payload.avatarUrl, "/media/noface.gif");
  assert.equal(records[1].payload.avatarUrl, "https://example.invalid/custom.png");
});

test("BLC 关闭显示全部部件后只保留当前事件类型", () => {
  const records = [{ method: "onAddText", payload: { id: "text" } }, { method: "onAddGift", payload: { id: "gift" } }, { method: "onAddGift", payload: { id: "blind", blindGiftName: "盲盒" } }, { method: "onAddMember", payload: { id: "guard" } }];
  assert.deepEqual(filterBlivechatPreviewRecords(records, false, "gift").map(record => record.payload.id), ["gift"]);
  assert.deepEqual(filterBlivechatPreviewRecords(records, false, "gift-normal").map(record => record.payload.id), ["gift"]);
  assert(!filterBlivechatPreviewRecords(records, true, "gift").some(record=>record.payload.id==="blind"));
  assert.equal(filterBlivechatPreviewRecords(records, true, "gift").length, 3);
});

test("BLC 动态单条样例与固定预览执行相同清理", () => {
  assert.equal(prepareBlivechatPreviewRecord({ method: "onUpdateTranslation", payload: { id: "a", translation: "译文" } }), null);
  assert.deepEqual(prepareBlivechatPreviewRecord({ method: "onAddText", payload: { id: "a", content: "正文", translation: "译文", avatarUrl: "//static.hdslb.com/images/member/noface.gif" } }), {
    method: "onAddText",
    payload: { id: "a", content: "正文", avatarUrl: "/media/noface.gif" },
  });
  const host = fs.readFileSync(fileURLToPath(new URL("../vendor/blivechat/host/entry.js", import.meta.url)), "utf8");
  assert.match(host, /const prepared = prepareBlivechatPreviewRecord\(record\)/);
});

test("BLC 原版缩略图使用顶部流布局且不会在水合后跳到最新事件", () => {
  const source = fs.readFileSync(fileURLToPath(new URL("../src/compat/blivechat/BlivechatSourceSurface.tsx", import.meta.url)), "utf8");
  assert.doesNotMatch(source, /event\.data\.command === "hydrated" && thumbnail[\s\S]{0,500}command: "scroll-latest"/);
  const register = fs.readFileSync(fileURLToPath(new URL("../src/compat/blivechat/register.tsx", import.meta.url)), "utf8");
  assert.match(register, /#item-scroller\.yt-live-chat-item-list-renderer\{[^}]*overflow-y:auto;/);
  assert.match(register, /#item-scroller\.animated\.yt-live-chat-item-list-renderer #items\.yt-live-chat-item-list-renderer\{position:relative!important;inset:auto!important;transform:none!important;flex:none!important\}/);
  const host = fs.readFileSync(fileURLToPath(new URL("../vendor/blivechat/host/entry.js", import.meta.url)), "utf8");
  assert.match(host, /await Vue\.nextTick\(\)[\s\S]*hostOptions\.direction === 'top'[\s\S]*scroller\.scrollTop = 0[\s\S]*post\('hydrated'/);
});

test("兼容预览直接运行来源脚本并在同一父窗口闭合握手与热更新", async () => {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const { JSDOM } = require("../vendor/blivechat/node_modules/jsdom");
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "https://bb.invalid/" });
  const previous = { location: globalThis.location, window: globalThis.window, document: globalThis.document, Element: globalThis.Element, Node: globalThis.Node, MutationObserver: globalThis.MutationObserver, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { location: dom.window.location, window: dom.window, document: dom.window.document, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true });
  const surface = getCompatibleThemeEditingSurface("blivechat");
  const original = createCompatibleThemeModeAdapter("blivechat").createBuiltinTheme();
  const root = createRoot(dom.window.document.getElementById("root"));
  const render = document => root.render(React.createElement(CompatibleThemePreview, { document, capability: surface.capability, renderer: surface.renderer, composeCss: surface.composeCss }));
  try {
    await act(async () => { render(original); });
    const frames = dom.window.document.querySelectorAll("iframe");
    assert.equal(frames.length, 1, "来源文档不能再嵌套在禁止脚本的预览 iframe 中");
    const frame = frames[0];
    assert.match(frame.getAttribute("sandbox") ?? "", /allow-scripts/);
    const sent = [];
    frame.contentWindow.postMessage = message => sent.push(message);
    await act(async () => { dom.window.dispatchEvent(new dom.window.MessageEvent("message", { source: frame.contentWindow, origin: dom.window.location.origin, data: { type: "bb-blivechat", command: "ready" } })); });
    assert.ok(sent.some(message => message.command === "config"));
    await act(async () => { frame.dispatchEvent(new dom.window.Event("load")); });
    const changed = { ...original, styles: { ...original.styles, customCss: "/* hot-preview */" } };
    await act(async () => { render(changed); });
    assert.ok(sent.some(message => message.command === "css" && message.data.css.includes("hot-preview")), "ready 后修改主题必须原位发送 CSS");
  } finally {
    await act(async () => { root.unmount(); });
    Object.assign(globalThis, previous);
    dom.window.close();
  }
});

test("来源 config 只携带来源设置与宿主事件准入，不重复执行金额和合并规则", () => {
  const config = createBlivechatSourceConfig({ showGiftName: true });
  assert.deepEqual(Object.keys(config).sort(), [
    "blockGiftDanmaku", "blockLevel", "blockMedalLevel", "blockMirrorMessages", "blockNewbie", "blockNotMobileVerified",
    "hostEventFilter", "hostShowFreeGift", "hostShowGuard", "hostShowNormalGift", "hostShowSuperChat",
    "importPresetCss", "maxNumber", "mergeGift", "mergeSimilarDanmaku", "minGiftPrice", "showDanmaku", "showDebugMessages", "showGift", "showGiftName", "templateUrl",
  ].sort());
  assert.equal(config.minGiftPrice, 0);
  assert.equal(config.mergeGift, false);
  assert.equal(config.mergeSimilarDanmaku, false);
  assert.equal(config.maxNumber, 60);
  assert.equal(config.blockGiftDanmaku, false);
  assert.equal(config.blockMirrorMessages, false);
});

test("列表宿主在一次握手后同步显示设置、滚动、定位和菜单请求", async () => {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const { JSDOM } = require("../vendor/blivechat/node_modules/jsdom");
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "https://bb.invalid/" });
  const previous = { location: globalThis.location, window: globalThis.window, document: globalThis.document, Element: globalThis.Element, Node: globalThis.Node, MutationObserver: globalThis.MutationObserver, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { location: dom.window.location, window: dom.window, document: dom.window.document, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(dom.window.document.getElementById("root"));
  const control = React.createRef();
  const scrollStates = [], menus = [];
  const descriptor = { url: "/blivechat/renderer.html", protocol: "bb-blivechat", css: "/* first */", config: createBlivechatSourceConfig({ showGiftName: false }), project: projectBlivechatCallback };
  try {
    await act(async () => { root.render(React.createElement(BlivechatSourceSurface, { ref: control, descriptor, events: [danmu], scale: 1.25, tickerEnabled: false, enableBilibiliVideoLinks: true, onScrollState: value => scrollStates.push(value), onContextMenu: value => menus.push(value) })); });
    const frame = dom.window.document.querySelector("iframe"), sent = [];
    frame.contentWindow.postMessage = message => sent.push(message);
    await act(async () => { dom.window.dispatchEvent(new dom.window.MessageEvent("message", { source: frame.contentWindow, origin: dom.window.location.origin, data: { type: "bb-blivechat", command: "ready" } })); });
    assert.ok(sent.some(message => message.command === "hydrate"));
    assert.ok(sent.some(message => message.command === "host" && message.data.scale === 1.25 && message.data.tickerEnabled === false && message.data.enableBilibiliVideoLinks === true));
    const configCount = sent.filter(message => message.command === "config").length;
    const second = { ...danmu, id: "second", reactKey: "second:1", text: "第二条" };
    await act(async () => { root.render(React.createElement(BlivechatSourceSurface, { ref: control, descriptor, events: [danmu, second], scale: 1.25, tickerEnabled: false, enableBilibiliVideoLinks: true, onScrollState: value => scrollStates.push(value), onContextMenu: value => menus.push(value) })); });
    assert.equal(sent.filter(message => message.command === "config").length, configCount, "新增事件不能重复 config 并触发来源 rebuild");
    assert.ok(sent.some(message => message.command === "event-batch" && message.data.records.some(record => record.payload.id === second.reactKey)));
    await act(async () => { dom.window.dispatchEvent(new dom.window.MessageEvent("message", { source: frame.contentWindow, origin: dom.window.location.origin, data: { type: "bb-blivechat", command: "scroll-state", data: { followingLatest: false, userInitiated: true, scrollTop: 20, scrollHeight: 200, clientHeight: 80 } } })); });
    await act(async () => { dom.window.dispatchEvent(new dom.window.MessageEvent("message", { source: frame.contentWindow, origin: dom.window.location.origin, data: { type: "bb-blivechat", command: "context-menu", data: { eventId: danmu.reactKey, x: 3, y: 4 } } })); });
    assert.equal(scrollStates.at(-1).followingLatest, false);
    assert.equal(menus.at(-1).eventId, danmu.reactKey);
    await act(async () => { dom.window.dispatchEvent(new dom.window.MessageEvent("message", { source: frame.contentWindow, origin: dom.window.location.origin, data: { type: "bb-blivechat", command: "hydrated" } })); });
    await act(async () => { dom.window.dispatchEvent(new dom.window.MessageEvent("message", { source: frame.contentWindow, origin: dom.window.location.origin, data: { type: "bb-blivechat", command: "presented" } })); });
    control.current.locate(danmu.reactKey); control.current.scrollToLatest();
    assert.deepEqual(sent.slice(-2).map(message => message.command), ["locate", "scroll-latest"]);
  } finally {
    await act(async () => { root.unmount(); });
    Object.assign(globalThis, previous);
    dom.window.close();
  }
});

test("历史页清空后重填时先充满可阅读区域，再恢复增量投递", async () => {
  const { createRequire } = await import("node:module");
  const { JSDOM } = createRequire(import.meta.url)("../vendor/blivechat/node_modules/jsdom");
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "https://bb.invalid/" });
  const previous = { location: globalThis.location, window: globalThis.window, document: globalThis.document, Element: globalThis.Element, Node: globalThis.Node, MutationObserver: globalThis.MutationObserver, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { location: dom.window.location, window: dom.window, document: dom.window.document, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(dom.window.document.getElementById("root"));
  const descriptor = { url: "/blivechat/renderer.html", protocol: "bb-blivechat", css: "", config: createBlivechatSourceConfig({ showGiftName: false }), project: projectBlivechatCallback };
  const first = { ...danmu, id: "new-1", reactKey: "new-1" }, second = { ...danmu, id: "new-2", reactKey: "new-2" }, third = { ...danmu, id: "new-3", reactKey: "new-3" };
  try {
    const render = events => root.render(React.createElement(BlivechatSourceSurface, { descriptor, events, initialScrollState: { followingLatest: false, scrollTop: 0, anchorId: "expired" } }));
    await act(async () => render([]));
    const frame = dom.window.document.querySelector("iframe"), sent = [];
    frame.contentDocument.open(); frame.contentDocument.write('<!doctype html><html><body></body></html>'); frame.contentDocument.close();
    const scroller = frame.contentDocument.createElement("div");
    scroller.id = "item-scroller"; frame.contentDocument.body.append(scroller);
    let height = 200; Object.defineProperties(scroller, { scrollHeight: { get: () => height }, clientHeight: { value: 100 } });
    frame.contentWindow.postMessage = message => sent.push(message);
    const emit = command => dom.window.dispatchEvent(new dom.window.MessageEvent("message", { source: frame.contentWindow, origin: dom.window.location.origin, data: { type: "bb-blivechat", command } }));
    await act(async () => emit("ready"));
    await act(async () => render([first])); height = 100; await act(async () => emit("hydrated")); await act(async () => emit("presented"));
    sent.length = 0;
    await act(async () => render([first, second]));
    assert.deepEqual(sent.find(message => message.command === "hydrate")?.data.records.map(record => record.payload.id), ["new-1", "new-2"]);
    await act(async () => emit("hydrated")); await act(async () => emit("presented"));
    height = 200; sent.length = 0;
    await act(async () => render([first, second, third]));
    assert.ok(sent.some(message => message.command === "event-batch" && message.data.records.some(record => record.payload.id === "new-3")));
  } finally { await act(async () => root.unmount()); Object.assign(globalThis, previous); dom.window.close(); }
});

test("跨批次回到最新不会被旧位置回报覆盖", async () => {
  const { createRequire } = await import("node:module");
  const { JSDOM } = createRequire(import.meta.url)("../vendor/blivechat/node_modules/jsdom");
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "https://bb.invalid/" });
  const previous = { location: globalThis.location, window: globalThis.window, document: globalThis.document, Element: globalThis.Element, Node: globalThis.Node, MutationObserver: globalThis.MutationObserver, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { location: dom.window.location, window: dom.window, document: dom.window.document, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(dom.window.document.getElementById("root")), control = React.createRef(), sent = [];
  const descriptor = { url: "/blivechat/renderer.html", protocol: "bb-blivechat", css: "", config: createBlivechatSourceConfig({ showGiftName: false }), project: projectBlivechatCallback };
  const events = Array.from({length: 120}, (_, i) => ({...danmu, id: `e${i}`, reactKey: `e${i}`}));
  try {
    await act(async () => root.render(React.createElement(BlivechatSourceSurface, {ref: control, descriptor, events, initialScrollState: {followingLatest:false, scrollTop:0}})));
    const frame = dom.window.document.querySelector("iframe");
    frame.contentWindow.postMessage = message => sent.push(message);
    const receive = data => dom.window.dispatchEvent(new dom.window.MessageEvent("message", {source:frame.contentWindow, origin:dom.window.location.origin, data:{type:"bb-blivechat", ...data}}));
    await act(async () => receive({command:"ready"}));
    await act(async () => control.current.locate("e1"));
    await act(async () => control.current.scrollToLatest());
    await act(async () => receive({command:"scroll-state", data:{followingLatest:false, scrollTop:20, scrollHeight:200, clientHeight:80, userInitiated:false}}));
    sent.length = 0;
    await act(async () => receive({command:"presented"}));
    assert.ok(sent.some(message => message.command === "scroll-latest"));
  } finally { await act(async () => root.unmount()); Object.assign(globalThis, previous); dom.window.close(); }
});

test("空列表在事件与排列原子提交完成后恢复阅读位置", async () => {
  const { createRequire } = await import("node:module"); const require = createRequire(import.meta.url); const { JSDOM } = require("../vendor/blivechat/node_modules/jsdom");
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "https://bb.invalid/" });
  const previous = { location: globalThis.location, window: globalThis.window, document: globalThis.document, Element: globalThis.Element, Node: globalThis.Node, MutationObserver: globalThis.MutationObserver, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { location: dom.window.location, window: dom.window, document: dom.window.document, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(dom.window.document.getElementById("root")); const descriptor = { url: "/blivechat/renderer.html", protocol: "bb-blivechat", css: "", config: createBlivechatSourceConfig({ showGiftName: false }), project: projectBlivechatCallback };
  try {
    await act(async () => root.render(React.createElement(BlivechatSourceSurface, { descriptor, events: [], initialScrollState: { followingLatest: false, scrollTop: 42 } })));
    const frame = dom.window.document.querySelector("iframe"), sent = []; frame.contentWindow.postMessage = message => sent.push(message);
    const emit = command => dom.window.dispatchEvent(new dom.window.MessageEvent("message", { source: frame.contentWindow, origin: dom.window.location.origin, data: { type: "bb-blivechat", command } }));
    await act(async () => emit("ready")); assert.equal(sent.some(message => message.command === "restore-scroll"), false);
    await act(async () => emit("hydrated")); assert.equal(sent.some(message => message.command === "presentation" || message.command === "hydrate" && message.data.presentation), true); assert.equal(sent.some(message => message.command === "restore-scroll"), true);
    await act(async () => emit("presented")); assert.equal(sent.filter(message => message.command === "restore-scroll").length, 1);
  } finally { await act(async () => root.unmount()); Object.assign(globalThis, previous); dom.window.close(); }
});

test("定位后不再恢复尚未完成的旧阅读锚点", async () => {
  const { createRequire } = await import("node:module"); const { JSDOM } = createRequire(import.meta.url)("../vendor/blivechat/node_modules/jsdom");
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "https://bb.invalid/" });
  const previous = { location: globalThis.location, window: globalThis.window, document: globalThis.document, Element: globalThis.Element, Node: globalThis.Node, MutationObserver: globalThis.MutationObserver, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { location: dom.window.location, window: dom.window, document: dom.window.document, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(dom.window.document.getElementById("root")); const control = React.createRef();
  const descriptor = { url: "/blivechat/renderer.html", protocol: "bb-blivechat", css: "", config: createBlivechatSourceConfig({ showGiftName: false }), project: projectBlivechatCallback };
  try {
    await act(async () => root.render(React.createElement(BlivechatSourceSurface, { ref: control, descriptor, events: [danmu], initialScrollState: { followingLatest: false, scrollTop: 42, anchorId: "old" } })));
    const frame = dom.window.document.querySelector("iframe"), sent = []; frame.contentWindow.postMessage = message => sent.push(message);
    const emit = command => dom.window.dispatchEvent(new dom.window.MessageEvent("message", { source: frame.contentWindow, origin: dom.window.location.origin, data: { type: "bb-blivechat", command } }));
    await act(async () => emit("ready"));
    await act(async () => control.current.locate(danmu.reactKey));
    assert.equal(sent.some(message => message.command === "locate"), false);
    await act(async () => emit("hydrated"));
    assert.equal(sent.some(message => message.command === "locate"), true);
    await act(async () => emit("presented"));
    assert.equal(sent.filter(message => message.command === "restore-scroll").length, 0);
    assert.ok(sent.some(message => message.command === "locate" && message.data.eventId === danmu.reactKey));
  } finally { await act(async () => root.unmount()); Object.assign(globalThis, previous); dom.window.close(); }
});

test("筛选视图退出时即使记录为前缀也整批同步，不进入暂停的消息队列", async () => {
  const { createRequire } = await import("node:module");
  const { JSDOM } = createRequire(import.meta.url)("../vendor/blivechat/node_modules/jsdom");
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "https://bb.invalid/" });
  const previous = { location: globalThis.location, window: globalThis.window, document: globalThis.document, Element: globalThis.Element, Node: globalThis.Node, MutationObserver: globalThis.MutationObserver, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { location: dom.window.location, window: dom.window, document: dom.window.document, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(dom.window.document.getElementById("root"));
  const descriptor = { url: "/blivechat/renderer.html", protocol: "bb-blivechat", css: "", config: createBlivechatSourceConfig({ showGiftName: false }), project: projectBlivechatCallback };
  const events = Array.from({length: 8}, (_, i) => ({...danmu, id:`e${i}`, reactKey:`e${i}`}));
  const render = (viewKey, events) => act(async () => root.render(React.createElement(BlivechatSourceSurface, { descriptor, viewKey, events })));
  try {
    await render("filtered", events.slice(0, 1));
    const frame = dom.window.document.querySelector("iframe"), sent = [];
    frame.contentWindow.postMessage = message => sent.push(message);
    await act(async () => dom.window.dispatchEvent(new dom.window.MessageEvent("message", { source: frame.contentWindow, origin: dom.window.location.origin, data: { type: "bb-blivechat", command: "ready" } })));
    sent.length = 0;
    await render("all", events);
    assert.equal(sent.some(message => message.command === "event"), false);
    assert.equal(sent.find(message => message.command === "hydrate")?.data.records.length, 8);
    assert.equal(dom.window.document.querySelector("iframe"), frame);
  } finally { await act(async () => root.unmount()); Object.assign(globalThis, previous); dom.window.close(); }
});

test("换批次定位不被同步完成前的旧呈现确认消耗", async () => {
  const { createRequire } = await import("node:module");
  const { JSDOM } = createRequire(import.meta.url)("../vendor/blivechat/node_modules/jsdom");
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "https://bb.invalid/" });
  const previous = { location: globalThis.location, window: globalThis.window, document: globalThis.document, Element: globalThis.Element, Node: globalThis.Node, MutationObserver: globalThis.MutationObserver, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { location: dom.window.location, window: dom.window, document: dom.window.document, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(dom.window.document.getElementById("root")), control = React.createRef(), sent = [];
  const descriptor = { url: "/blivechat/renderer.html", protocol: "bb-blivechat", css: "", config: createBlivechatSourceConfig({ showGiftName: false }), project: projectBlivechatCallback };
  try {
    const events = Array.from({length:120}, (_,i) => ({...danmu,id:`e${i}`,reactKey:`e${i}`}));
    await act(async () => root.render(React.createElement(BlivechatSourceSurface, { ref:control, descriptor, events })));
    const frame=dom.window.document.querySelector("iframe");frame.contentWindow.postMessage=message=>sent.push(message);
    const receive=command=>act(async()=>dom.window.dispatchEvent(new dom.window.MessageEvent("message",{source:frame.contentWindow,origin:dom.window.location.origin,data:{type:"bb-blivechat",command}})));
    await receive("ready");await act(async()=>control.current.locate("e1"));sent.length=0;
    await receive("presented");assert.equal(sent.some(message=>message.command==="locate"),false);
    await receive("hydrated");await receive("presented");assert.ok(sent.some(message=>message.command==="locate"&&message.data.eventId==="e1"));
  } finally { await act(async()=>root.unmount());Object.assign(globalThis,previous);dom.window.close(); }
});

test("正式 resolver 即使返回新的等值 config 对象，普通事件追加也不重发配置", async () => {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const { JSDOM } = require("../vendor/blivechat/node_modules/jsdom");
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "https://bb.invalid/" });
  const previous = { location: globalThis.location, window: globalThis.window, document: globalThis.document, Element: globalThis.Element, Node: globalThis.Node, MutationObserver: globalThis.MutationObserver, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { location: dom.window.location, window: dom.window, document: dom.window.document, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(dom.window.document.getElementById("root"));
  const descriptor = () => ({ url: "/blivechat/renderer.html", protocol: "bb-blivechat", css: "same", config: { ...createBlivechatSourceConfig({ showGiftName: false }) }, project: projectBlivechatCallback });
  try {
    await act(async () => root.render(React.createElement(BlivechatSourceSurface, { descriptor: descriptor(), events: [danmu] })));
    const frame = dom.window.document.querySelector("iframe"), sent = [];
    frame.contentWindow.postMessage = message => sent.push(message);
    await act(async () => dom.window.dispatchEvent(new dom.window.MessageEvent("message", { source: frame.contentWindow, origin: dom.window.location.origin, data: { type: "bb-blivechat", command: "ready" } })));
    const before = sent.filter(message => message.command === "config").length;
    await act(async () => root.render(React.createElement(BlivechatSourceSurface, { descriptor: descriptor(), events: [danmu, { ...danmu, id: "next", reactKey: "next:1" }] })));
    assert.equal(sent.filter(message => message.command === "config").length, before);
  } finally { await act(async () => root.unmount()); Object.assign(globalThis, previous); dom.window.close(); }
});

test("长场次由软件持有完整历史，来源只取得有界窗口且定位能装载目标", () => {
  const events = Array.from({ length: 2000 }, (_, index) => ({ ...danmu, id: String(index), reactKey: `${index}:1` }));
  const latestBottom = planBlivechatEventWindow(events, { direction: "bottom", followingLatest: true, size: 120 });
  assert.equal(latestBottom.events.length, 120);
  assert.equal(latestBottom.events.at(-1).id, "1999");
  const latestTop = planBlivechatEventWindow([...events].reverse(), { direction: "top", followingLatest: true, size: 120 });
  assert.equal(latestTop.events[0].id, "1999");
  const located = planBlivechatEventWindow(events, { direction: "bottom", followingLatest: false, targetId: "845:1", size: 120 });
  assert.ok(located.events.some(event => event.reactKey === "845:1"));
  assert.ok(located.start > 0 && located.end < events.length);
});

test("历史窗口按相邻半窗连续移动，只有完整历史最新边界才算 followingLatest", () => {
  assert.equal(advanceBlivechatEventWindow({ start: 0, end: 60, total: 200, direction: "forward", size: 60 }), 30);
  assert.equal(advanceBlivechatEventWindow({ start: 30, end: 90, total: 200, direction: "forward", size: 60 }), 60);
  assert.equal(advanceBlivechatEventWindow({ start: 60, end: 120, total: 200, direction: "backward", size: 60 }), 30);
  assert.equal(advanceBlivechatEventWindow({ start: 140, end: 200, total: 200, direction: "forward", size: 60 }), 140);
  assert.equal(advanceBlivechatEventWindow({ start: 0, end: 60, total: 200, direction: "forward", size: 60, anchorIndex: 29 }), 29);
  assert.equal(advanceBlivechatEventWindow({ start: 140, end: 200, total: 200, direction: "backward", size: 60, anchorIndex: 171 }), 112);
});

test("滚轮抵达局部最新边界时逐窗前进并保留锚点", async () => {
  const { createRequire } = await import("node:module"); const require = createRequire(import.meta.url); const { JSDOM } = require("../vendor/blivechat/node_modules/jsdom");
  for (const direction of ["bottom", "top"]) {
    const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "https://bb.invalid/" });
    const previous = { location: globalThis.location, window: globalThis.window, document: globalThis.document, Element: globalThis.Element, Node: globalThis.Node, MutationObserver: globalThis.MutationObserver, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
    Object.assign(globalThis, { location: dom.window.location, window: dom.window, document: dom.window.document, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true });
    const root = createRoot(dom.window.document.getElementById("root"));
    const events = Array.from({ length: 200 }, (_, index) => ({ ...danmu, id: String(index), reactKey: `${index}:1` }));
    const descriptor = { url: "/blivechat/renderer.html", protocol: "bb-blivechat", css: "", config: createBlivechatSourceConfig({ showGiftName: false }), project: projectBlivechatCallback };
    try {
      const control = React.createRef(); await act(async () => root.render(React.createElement(BlivechatSourceSurface, { ref: control, descriptor, events, direction })));
      const frame = dom.window.document.querySelector("iframe"), sent = [], doc = frame.contentDocument; doc.open(); doc.write('<!doctype html><html><body></body></html>'); doc.close(); frame.contentWindow.postMessage = message => sent.push(message);
      const emit = command => dom.window.dispatchEvent(new dom.window.MessageEvent("message", { source: frame.contentWindow, origin: dom.window.location.origin, data: { type: "bb-blivechat", command } }));
      await act(async () => emit("ready")); await act(async () => emit("hydrated")); await act(async () => emit("presented"));
      await act(async () => control.current.locate(direction === "bottom" ? "20:1" : "179:1"));
      await act(async () => emit("hydrated")); await act(async () => emit("presented"));
      const scroller = doc.createElement("div"), row = doc.createElement("div"); scroller.id = "item-scroller"; row.dataset.eventId = direction === "bottom" ? "45:1" : "154:1"; scroller.append(row); doc.body.append(scroller);
      Object.defineProperties(scroller, { scrollHeight: { value: 600 }, clientHeight: { value: 100 } }); scroller.scrollTop = direction === "bottom" ? 500 : 0;
      scroller.getBoundingClientRect = () => ({ top: 0 }); row.getBoundingClientRect = () => ({ top: 10, bottom: 30 });
      await act(async () => scroller.dispatchEvent(new frame.contentWindow.WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: direction === "bottom" ? 100 : -100 })));
      const ids = sent.filter(message => ["hydrate", "event-batch"].includes(message.command)).at(-1).data.presentation.layout.map(item => item.eventId);
      assert.equal(ids[0], direction === "bottom" ? "30:1" : "110:1");
      await act(async () => emit("hydrated")); await act(async () => emit("presented"));
      const restored = sent.filter(message => message.command === "restore-scroll").at(-1)?.data;
      assert.equal(restored?.anchorId, row.dataset.eventId);
    } finally { await act(async () => root.unmount()); Object.assign(globalThis, previous); dom.window.close(); }
  }
});

test("不足一屏时历史阅读可用滚轮恢复跟随", async () => {
  const { createRequire } = await import("node:module");
  const { JSDOM } = createRequire(import.meta.url)("../vendor/blivechat/node_modules/jsdom");
  for (const direction of ["bottom", "top"]) {
    const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "https://bb.invalid/" });
    const previous = { location: globalThis.location, window: globalThis.window, document: globalThis.document, Element: globalThis.Element, Node: globalThis.Node, MutationObserver: globalThis.MutationObserver, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
    Object.assign(globalThis, { location: dom.window.location, window: dom.window, document: dom.window.document, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true });
    const root = createRoot(dom.window.document.getElementById("root"));
    const descriptor = { url: "/blivechat/renderer.html", protocol: "bb-blivechat", css: "", config: createBlivechatSourceConfig({ showGiftName: false }), project: projectBlivechatCallback };
    try {
      await act(async () => root.render(React.createElement(BlivechatSourceSurface, { descriptor, events: [danmu], direction, initialScrollState: { followingLatest: false, scrollTop: 0 } })));
      const frame = dom.window.document.querySelector("iframe"), doc = frame.contentDocument, sent = [];
      doc.open(); doc.write('<!doctype html><html><body></body></html>'); doc.close();
      frame.contentWindow.postMessage = message => sent.push(message);
      const scroller = doc.createElement("div"); scroller.id = "item-scroller"; doc.body.append(scroller);
      Object.defineProperties(scroller, { scrollHeight: { value: 100 }, clientHeight: { value: 100 } });
      await act(async () => dom.window.dispatchEvent(new dom.window.MessageEvent("message", { source: frame.contentWindow, origin: dom.window.location.origin, data: { type: "bb-blivechat", command: "ready" } })));
      sent.length = 0;
      const event = () => new frame.contentWindow.WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: direction === "top" ? -100 : 100 });
      let propagated = 0; scroller.addEventListener("wheel", () => { propagated += 1; });
      await act(async () => scroller.dispatchEvent(event()));
      assert.equal(sent.filter(message => message.command === "scroll-latest").length, 1, `${direction}方向恢复跟随`);
      assert.equal(propagated, 1, "本地阅读状态能收到恢复操作");
      await act(async () => scroller.dispatchEvent(event()));
      assert.equal(sent.filter(message => message.command === "scroll-latest").length, 1, "已跟随时不重复请求");
      assert.equal(propagated, 1, "已跟随时不留下用户滚动标记");
    } finally { await act(async () => root.unmount()); Object.assign(globalThis, previous); dom.window.close(); }
  }
});

test("已在全局最新端的滚轮不会留下用户滚动标记", async () => {
  const { createRequire } = await import("node:module"); const require = createRequire(import.meta.url); const { JSDOM } = require("../vendor/blivechat/node_modules/jsdom");
  for (const direction of ["bottom", "top"]) {
    const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "https://bb.invalid/" });
    const previous = { location: globalThis.location, window: globalThis.window, document: globalThis.document, Element: globalThis.Element, Node: globalThis.Node, MutationObserver: globalThis.MutationObserver, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
    Object.assign(globalThis, { location: dom.window.location, window: dom.window, document: dom.window.document, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true });
    const root = createRoot(dom.window.document.getElementById("root"));
    const events = Array.from({ length: 80 }, (_, index) => ({ ...danmu, id: String(index), reactKey: `${index}:1` }));
    const descriptor = { url: "/blivechat/renderer.html", protocol: "bb-blivechat", css: "", config: createBlivechatSourceConfig({ showGiftName: false }), project: projectBlivechatCallback };
    try {
      await act(async () => root.render(React.createElement(BlivechatSourceSurface, { descriptor, events, direction })));
      const frame = dom.window.document.querySelector("iframe"), doc = frame.contentDocument; doc.open(); doc.write('<!doctype html><html><body></body></html>'); doc.close(); frame.contentWindow.postMessage = () => {};
      await act(async () => dom.window.dispatchEvent(new dom.window.MessageEvent("message", { source: frame.contentWindow, origin: dom.window.location.origin, data: { type: "bb-blivechat", command: "ready" } })));
      const scroller = doc.createElement("div"); scroller.id = "item-scroller"; doc.body.append(scroller); Object.defineProperties(scroller, { scrollHeight: { value: 600 }, clientHeight: { value: 100 } }); scroller.scrollTop = direction === "bottom" ? 500 : 0;
      let bubbled = false; scroller.addEventListener("wheel", () => { bubbled = true; });
      const event = new frame.contentWindow.WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: direction === "bottom" ? 100 : -100 });
      await act(async () => scroller.dispatchEvent(event));
      assert.equal(event.defaultPrevented, true);
      assert.equal(bubbled, false);
    } finally { await act(async () => root.unmount()); Object.assign(globalThis, previous); dom.window.close(); }
  }
});

test("已淘汰的旧锚点不会把新内容的历史窗口拉回最新", async () => {
  const { createRequire } = await import("node:module"); const require = createRequire(import.meta.url); const { JSDOM } = require("../vendor/blivechat/node_modules/jsdom");
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "https://bb.invalid/" });
  const previous = { location: globalThis.location, window: globalThis.window, document: globalThis.document, Element: globalThis.Element, Node: globalThis.Node, MutationObserver: globalThis.MutationObserver, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { location: dom.window.location, window: dom.window, document: dom.window.document, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(dom.window.document.getElementById("root"));
  const events = Array.from({ length: 200 }, (_, index) => ({ ...danmu, id: String(index), reactKey: `${index}:1` }));
  const descriptor = { url: "/blivechat/renderer.html", protocol: "bb-blivechat", css: "", config: createBlivechatSourceConfig({ showGiftName: false }), project: projectBlivechatCallback };
  try {
    const control = React.createRef(); await act(async () => root.render(React.createElement(BlivechatSourceSurface, { ref: control, descriptor, events, initialScrollState: { followingLatest: false, scrollTop: 0, anchorId: "removed", anchorOffset: 0 } })));
    const frame = dom.window.document.querySelector("iframe"), sent = []; frame.contentWindow.postMessage = message => sent.push(message);
    const emit = command => dom.window.dispatchEvent(new dom.window.MessageEvent("message", { source: frame.contentWindow, origin: dom.window.location.origin, data: { type: "bb-blivechat", command } }));
    await act(async () => emit("ready")); await act(async () => emit("hydrated")); await act(async () => emit("presented"));
    await act(async () => control.current.locate("20:1"));
    const ids = sent.filter(message => ["hydrate", "event-batch"].includes(message.command)).at(-1).data.presentation.layout.map(item => item.eventId);
    assert.equal(ids[0], "0:1");
  } finally { await act(async () => root.unmount()); Object.assign(globalThis, previous); dom.window.close(); }
});

test("主动定位后的滚动反馈更新本地阅读位置", async () => {
  const { createRequire } = await import("node:module"); const require = createRequire(import.meta.url); const { JSDOM } = require("../vendor/blivechat/node_modules/jsdom");
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "https://bb.invalid/" });
  const previous = { location: globalThis.location, window: globalThis.window, document: globalThis.document, Element: globalThis.Element, Node: globalThis.Node, MutationObserver: globalThis.MutationObserver, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { location: dom.window.location, window: dom.window, document: dom.window.document, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(dom.window.document.getElementById("root")), states = [];
  const events = Array.from({ length: 200 }, (_, index) => ({ ...danmu, id: String(index), reactKey: `${index}:1` }));
  const descriptor = { url: "/blivechat/renderer.html", protocol: "bb-blivechat", css: "", config: createBlivechatSourceConfig({ showGiftName: false }), project: projectBlivechatCallback };
  try {
    const control = React.createRef(); await act(async () => root.render(React.createElement(BlivechatSourceSurface, { ref: control, descriptor, events, onScrollState: value => states.push(value) })));
    const frame = dom.window.document.querySelector("iframe"); frame.contentWindow.postMessage = () => {};
    const emit = (command, data) => dom.window.dispatchEvent(new dom.window.MessageEvent("message", { source: frame.contentWindow, origin: dom.window.location.origin, data: { type: "bb-blivechat", command, data } }));
    await act(async () => emit("ready")); await act(async () => emit("hydrated")); await act(async () => emit("presented"));
    await act(async () => control.current.locate("20:1")); await act(async () => emit("hydrated")); await act(async () => emit("presented"));
    await act(async () => emit("scroll-state", { userInitiated: false, followingLatest: false, scrollTop: 200, scrollHeight: 2000, clientHeight: 500, anchorId: "20:1", anchorOffset: 12 }));
    assert.equal(states.at(-1)?.anchorId, "20:1");
  } finally { await act(async () => root.unmount()); Object.assign(globalThis, previous); dom.window.close(); }
});

test("父宿主从旧定位窗口连续翻页到完整历史 latest，不把局部底部误报为 latest", async () => {
  const { createRequire } = await import("node:module"); const require = createRequire(import.meta.url); const { JSDOM } = require("../vendor/blivechat/node_modules/jsdom");
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "https://bb.invalid/" });
  const previous = { location: globalThis.location, window: globalThis.window, document: globalThis.document, Element: globalThis.Element, Node: globalThis.Node, MutationObserver: globalThis.MutationObserver, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { location: dom.window.location, window: dom.window, document: dom.window.document, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(dom.window.document.getElementById("root")); const states = [];
  const events = Array.from({ length: 200 }, (_, index) => ({ ...danmu, id: String(index), reactKey: `${index}:1` }));
  const descriptor = { url: "/blivechat/renderer.html", protocol: "bb-blivechat", css: "", config: createBlivechatSourceConfig({ showGiftName: false }), project: projectBlivechatCallback };
  try {
    const control = React.createRef(); await act(async () => root.render(React.createElement(BlivechatSourceSurface, { ref: control, descriptor, events, onScrollState: value => states.push(value) })));
    const frame = dom.window.document.querySelector("iframe"), sent = []; frame.contentWindow.postMessage = message => sent.push(message);
    const emit = (command, data) => dom.window.dispatchEvent(new dom.window.MessageEvent("message", { source: frame.contentWindow, origin: dom.window.location.origin, data: { type: "bb-blivechat", command, data } }));
    await act(async () => emit("ready")); await act(async () => emit("hydrated")); await act(async () => emit("presented"));
    const presentationBeforeLocate = sent.filter(message => message.command === "presentation").length;
    await act(async () => control.current.locate("20:1"));
    assert.deepEqual(sent.filter(message => message.command === "hydrate").at(-1).data.records.map(record => record.payload.id).slice(0, 2), ["0:1", "1:1"]);
    assert.equal(sent.filter(message => message.command === "presentation").length, presentationBeforeLocate, "换窗必须等待新窗口 hydrate 完成后再呈现");
    await act(async () => emit("hydrated")); await act(async () => emit("presented"));
    for (const expectedStart of [30, 60, 90, 120, 140]) {
      await act(async () => emit("scroll-state", { userInitiated: true, followingLatest: true, scrollTop: 500, scrollHeight: 600, clientHeight: 100, anchorId: `${Math.min(expectedStart + 20, 199)}:1`, anchorOffset: 0, nearStart: false, nearEnd: true }));
      const ids = sent.filter(message => ["hydrate", "event-batch"].includes(message.command)).at(-1).data.presentation.layout.map(item => item.eventId);
      assert.equal(ids[0], `${expectedStart}:1`);
      await act(async () => emit("hydrated")); await act(async () => emit("presented"));
      assert.equal(states.at(-1).followingLatest, expectedStart === 140);
    }
    await act(async () => emit("scroll-state", { userInitiated: true, followingLatest: true, scrollTop: 500, scrollHeight: 600, clientHeight: 100, anchorId: "180:1", anchorOffset: 0, nearStart: false, nearEnd: true }));
    assert.equal(states.at(-1).followingLatest, true);
    for (const expectedStart of [110, 80, 50]) {
      await act(async () => emit("scroll-state", { userInitiated: true, followingLatest: false, scrollTop: 0, scrollHeight: 600, clientHeight: 100, anchorId: `${expectedStart + 20}:1`, anchorOffset: 0, nearStart: true, nearEnd: false }));
      const ids = sent.filter(message => ["hydrate", "event-batch"].includes(message.command)).at(-1).data.presentation.layout.map(item => item.eventId);
      assert.equal(ids[0], `${expectedStart}:1`);
      await act(async () => emit("hydrated")); await act(async () => emit("presented"));
      assert.equal(states.at(-1).followingLatest, false);
    }
  } finally { await act(async () => root.unmount()); Object.assign(globalThis, previous); dom.window.close(); }
});

test("append source、fallback 与软件置顶变化都增量发送 presentation", async () => {
  const { createRequire } = await import("node:module"); const require = createRequire(import.meta.url); const { JSDOM } = require("../vendor/blivechat/node_modules/jsdom");
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "https://bb.invalid/" });
  const previous = { location: globalThis.location, window: globalThis.window, document: globalThis.document, Element: globalThis.Element, Node: globalThis.Node, MutationObserver: globalThis.MutationObserver, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { location: dom.window.location, window: dom.window, document: dom.window.document, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(dom.window.document.getElementById("root")); const fallback = { ...danmu, id: "fallback", reactKey: "fallback:1", msgType: MsgType.Interact };
  const descriptor = { url: "/blivechat/renderer.html", protocol: "bb-blivechat", css: "", config: createBlivechatSourceConfig({ showGiftName: false }), project: event => event.msgType === MsgType.Interact ? null : projectBlivechatCallback(event, 1) };
  try {
    await act(async () => root.render(React.createElement(BlivechatSourceSurface, { descriptor, events: [danmu] })));
    const frame = dom.window.document.querySelector("iframe"), sent = []; frame.contentWindow.postMessage = message => sent.push(message);
    const emit = command => dom.window.dispatchEvent(new dom.window.MessageEvent("message", { source: frame.contentWindow, origin: dom.window.location.origin, data: { type: "bb-blivechat", command } }));
    await act(async () => emit("ready")); await act(async () => emit("hydrated")); await act(async () => emit("presented")); const hydrateCount = sent.filter(message => message.command === "hydrate").length;
    const next = { ...danmu, id: "next", reactKey: "next:1" };
    await act(async () => root.render(React.createElement(BlivechatSourceSurface, { descriptor: { ...descriptor, config: { ...descriptor.config } }, events: [danmu, next] })));
    assert.equal(sent.filter(message => message.command === "hydrate").length, hydrateCount); assert.deepEqual(sent.filter(message => message.command === "presentation" || message.command === "event-batch" || message.command === "hydrate" && message.data.presentation).map(message => ({...message, data: message.data.presentation ?? message.data})).at(-1).data.layout.map(item => item.eventId), [danmu.reactKey, next.reactKey]);
    await act(async () => root.render(React.createElement(BlivechatSourceSurface, { descriptor, events: [danmu, next, fallback] })));
    assert.equal(sent.filter(message => message.command === "hydrate").length, hydrateCount); assert.deepEqual(sent.filter(message => message.command === "presentation" || message.command === "event-batch" || message.command === "hydrate" && message.data.presentation).map(message => ({...message, data: message.data.presentation ?? message.data})).at(-1).data.layout.map(item => item.kind), ["source", "source", "fallback"]);
    await act(async () => root.render(React.createElement(BlivechatSourceSurface, { descriptor, events: [danmu, next, fallback], stickyItems: [{ event: { ...danmu, id: "sc", reactKey: "sc:1", msgType: MsgType.SuperChat, sc: { price: 30, message: "SC", duration: 60 } }, startedAt: 1000, expiresAt: 61000 }] })));
    const latest = sent.filter(message => message.command === "presentation" || message.command === "event-batch" || message.command === "hydrate" && message.data.presentation).map(message => ({...message, data: message.data.presentation ?? message.data})).at(-1).data; assert.equal(latest.stickyRecords[0].record.payload.price, 30); assert.equal(sent.filter(message => message.command === "hydrate").length, hydrateCount);
  } finally { await act(async () => root.unmount()); Object.assign(globalThis, previous); dom.window.close(); }
});

test("定位窗口忽略 hydrate、presentation、restore 和 locate 引发的程序滚动", async () => {
  const { createRequire } = await import("node:module"); const require = createRequire(import.meta.url); const { JSDOM } = require("../vendor/blivechat/node_modules/jsdom");
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "https://bb.invalid/" });
  const previous = { location: globalThis.location, window: globalThis.window, document: globalThis.document, Element: globalThis.Element, Node: globalThis.Node, MutationObserver: globalThis.MutationObserver, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { location: dom.window.location, window: dom.window, document: dom.window.document, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(dom.window.document.getElementById("root")); const events = Array.from({ length: 200 }, (_, index) => ({ ...danmu, id: String(index), reactKey: `${index}:1` }));
  const descriptor = { url: "/blivechat/renderer.html", protocol: "bb-blivechat", css: "", config: createBlivechatSourceConfig({ showGiftName: false }), project: projectBlivechatCallback };
  try {
    const control = React.createRef(); await act(async () => root.render(React.createElement(BlivechatSourceSurface, { ref: control, descriptor, events })));
    const frame = dom.window.document.querySelector("iframe"), sent = []; frame.contentWindow.postMessage = message => sent.push(message);
    const emit = (command, data) => dom.window.dispatchEvent(new dom.window.MessageEvent("message", { source: frame.contentWindow, origin: dom.window.location.origin, data: { type: "bb-blivechat", command, data } }));
    await act(async () => emit("ready")); await act(async () => emit("hydrated")); await act(async () => emit("presented"));
    await act(async () => control.current.locate("80:1"));
    assert.equal(sent.filter(message => message.command === "hydrate").at(-1).data.records[0].payload.id, "50:1");
    for (const command of ["hydrate", "presentation", "restore", "locate"]) {
      await act(async () => emit("scroll-state", { userInitiated: false, cause: command, followingLatest: false, scrollTop: 0, scrollHeight: 600, clientHeight: 100, anchorId: "50:1", anchorOffset: 0, nearStart: true, nearEnd: false }));
    }
    assert.equal(sent.filter(message => message.command === "hydrate").at(-1).data.records[0].payload.id, "50:1");
  } finally { await act(async () => root.unmount()); Object.assign(globalThis, previous); dom.window.close(); }
});

test("React 宿主连接 compiled Vue 后定位窗口不被程序滚动连续翻走", async () => {
  const { createRequire } = await import("node:module"); const require = createRequire(import.meta.url); const { JSDOM } = require("../vendor/blivechat/node_modules/jsdom");
  const parent = new JSDOM('<!doctype html><div id="root"></div>', { url: "https://bb.invalid/", pretendToBeVisual: true });
  const previous = { location: globalThis.location, window: globalThis.window, document: globalThis.document, Element: globalThis.Element, Node: globalThis.Node, MutationObserver: globalThis.MutationObserver, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { location: parent.window.location, window: parent.window, document: parent.window.document, Element: parent.window.Element, Node: parent.window.Node, MutationObserver: parent.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(parent.window.document.getElementById("root")); const now = Date.now(); const events = Array.from({ length: 200 }, (_, index) => ({ ...danmu, id: String(index), reactKey: `${index}:1`, ts: now + index }));
  const descriptor = { url: "/blivechat/renderer.html", protocol: "bb-blivechat", css: "", config: createBlivechatSourceConfig({ showGiftName: false }), project: projectBlivechatCallback };
  let child;
  try {
    const control = React.createRef(); await act(async () => root.render(React.createElement(BlivechatSourceSurface, { ref: control, descriptor, events })));
    const frame = parent.window.document.querySelector("iframe"), sent = [], received = [];
    child = new JSDOM('<!doctype html><html><head></head><body><div id="app"></div></body></html>', { url: "https://bb.invalid/blivechat/renderer.html", runScripts: "outside-only", pretendToBeVisual: true });
    const proxy = { postMessage: message => { received.push(message); parent.window.dispatchEvent(new parent.window.MessageEvent("message", { source: frame.contentWindow, origin: parent.window.location.origin, data: message })); } };
    Object.defineProperty(child.window, "parent", { value: proxy }); child.window.TextEncoder = global.TextEncoder; child.window.fetch = async () => ({ ok: true, text: async () => "" }); child.window.Image = class { set src(_value) { queueMicrotask(() => this.onload?.()); } };
    frame.contentWindow.postMessage = message => { sent.push(message); child.window.dispatchEvent(new child.window.MessageEvent("message", { source: proxy, origin: child.window.location.origin, data: message })); };
    await act(async () => { child.window.eval(fs.readFileSync(new URL("../public/blivechat/renderer.js", import.meta.url), "utf8")); for (let index = 0; index < 6; index += 1) await new Promise(resolve => setTimeout(resolve, 0)); });
    await act(async () => control.current.locate("80:1"));
    for (let index = 0; index < 8; index += 1) await act(async () => new Promise(resolve => setTimeout(resolve, 0)));
    const hydrateStarts = sent.filter(message => message.command === "hydrate").map(message => message.data.records[0]?.payload.id);
    assert.equal(hydrateStarts.at(-1), "50:1"); assert.equal(hydrateStarts.includes("20:1"), false); assert.equal(hydrateStarts.includes("0:1"), false);
    frame.contentWindow.postMessage({ type: "bb-blivechat", command: "inspect" }, parent.window.location.origin); await act(async () => new Promise(resolve => setTimeout(resolve, 0)));
    const snapshot = received.filter(message => message.command === "snapshot").at(-1)?.data;
    assert.ok(snapshot.messages.some(message => message.id === "80:1"), `snapshot ids: ${snapshot.messages.map(message => message.id).join(",")}`);
  } finally { await act(async () => root.unmount()); child?.window.close(); Object.assign(globalThis, previous); parent.window.close(); }
});

test("fallback 使用隔离样式根并热更新事件级配置 CSS，不在 portal 内重复缩放", async () => {
  const { createRequire } = await import("node:module"); const require = createRequire(import.meta.url); const { JSDOM } = require("../vendor/blivechat/node_modules/jsdom");
  const parent = new JSDOM('<!doctype html><style>.event{color:red}</style><div id="surface" style="--event-font-size:18px"></div>');
  const child = new JSDOM('<!doctype html><div id="slot"></div>');
  const slot = child.window.document.getElementById("slot"), surface = parent.window.document.getElementById("surface");
  const root = mountBlivechatFallbackRoot(slot, parent.window.document, surface, { scope: "live-a", css: '[data-event-style-scope="live-a"] .event{--resolved-message-color:red}' });
  assert.ok(root instanceof child.window.ShadowRoot); assert.match(root.querySelector("style").textContent, /\.event/); assert.match(root.querySelector("[data-blivechat-fallback-event-css]").textContent, /message-color:red/); assert.equal(slot.style.getPropertyValue("--event-font-size"), "18px"); assert.equal(slot.style.getPropertyValue("zoom"), "");
  mountBlivechatFallbackRoot(slot, parent.window.document, surface, { scope: "live-a", css: '[data-event-style-scope="live-a"] .event{--resolved-message-color:blue}' });
  assert.match(root.querySelector("[data-blivechat-fallback-event-css]").textContent, /message-color:blue/); assert.doesNotMatch(root.querySelector("[data-blivechat-fallback-event-css]").textContent, /message-color:red/);
  parent.window.close(); child.window.close();
});

test("React fallback portal 在同一 iframe 插槽热更新区域配置样式", async () => {
  const { createRequire } = await import("node:module"); const require = createRequire(import.meta.url); const { JSDOM } = require("../vendor/blivechat/node_modules/jsdom");
  const dom = new JSDOM('<!doctype html><div id="root" class="event-area"></div>', { url: "https://bb.invalid/" });
  const previous = { location: globalThis.location, window: globalThis.window, document: globalThis.document, Element: globalThis.Element, Node: globalThis.Node, MutationObserver: globalThis.MutationObserver, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { location: dom.window.location, window: dom.window, document: dom.window.document, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(dom.window.document.getElementById("root")); const fallback = { ...danmu, id: "fallback", reactKey: "fallback:1", msgType: MsgType.Interact };
  const descriptor = { url: "/blivechat/renderer.html", protocol: "bb-blivechat", css: "", config: createBlivechatSourceConfig({ showGiftName: false }), project: () => null };
  const render = css => React.createElement(BlivechatSourceSurface, { descriptor, events: [fallback], fallbackRenderer: () => React.createElement("div", { className: "event" }, "fallback"), fallbackStyle: { scope: "live-a", css } });
  try {
    await act(async () => root.render(render('[data-event-style-scope="live-a"] .event{--resolved-message-color:red}')));
    const frame = dom.window.document.querySelector("iframe");
    frame.contentDocument.open(); frame.contentDocument.write("<!doctype html><html><body></body></html>"); frame.contentDocument.close();
    const slot = frame.contentDocument.createElement("div"); slot.dataset.compatibleFallbackId = "fallback:1"; frame.contentDocument.body.appendChild(slot);
    await act(async () => dom.window.dispatchEvent(new dom.window.MessageEvent("message", { source: frame.contentWindow, origin: dom.window.location.origin, data: { type: "bb-blivechat", command: "fallback-slots-ready" } })));
    assert.match(slot.shadowRoot.querySelector("[data-blivechat-fallback-event-css]").textContent, /message-color:red/); assert.equal(slot.shadowRoot.querySelector("[data-event-style-scope='live-a'] .event").textContent, "fallback");
    await act(async () => root.render(render('[data-event-style-scope="live-a"] .event{--resolved-message-color:blue}')));
    assert.match(slot.shadowRoot.querySelector("[data-blivechat-fallback-event-css]").textContent, /message-color:blue/);
  } finally { await act(async () => root.unmount()); Object.assign(globalThis, previous); dom.window.close(); }
});

test("列表计划只保留一套来源 ticker，并把不支持事件交还原生行", () => {
  const supported = danmu;
  const fallback = { ...danmu, id: "unsupported", reactKey: "unsupported:1", msgType: MsgType.Interact };
  const render = Object.assign(() => null, {
    listSurface: { url: "/blivechat/renderer.html", protocol: "bb-blivechat", css: "", config: {}, project: projectBlivechatCallback },
    eventDecision: event => event.msgType === MsgType.Interact ? "fallback" : "render",
  });
  const enabled = planCompatibleListPresentation(render, [supported, fallback], true);
  assert.deepEqual(enabled.sourceEvents, [supported]);
  assert.deepEqual(enabled.fallbackEvents, [fallback]);
  assert.deepEqual(enabled.ordered.map(item => [item.kind, item.event.id]), [["source", supported.id], ["fallback", fallback.id]]);
  assert.equal(enabled.sourceTickerEnabled, true);
  assert.equal(enabled.renderSoftwareSticky, false);
  const disabled = planCompatibleListPresentation(render, [supported], false);
  assert.equal(disabled.sourceTickerEnabled, false);
  assert.equal(disabled.renderSoftwareSticky, false);
});

test("列表计划在现场、副窗口与 OBS 共用 render fallback omit 三态", () => {
  const rendered = danmu;
  const fallback = { ...danmu, id: "fallback", reactKey: "fallback:1", msgType: MsgType.Interact };
  const omitted = { ...danmu, id: "omit", reactKey: "omit:1", msgType: MsgType.ScDeleted };
  const render = Object.assign(() => null, {
    listSurface: { url: "/openlive/renderer.html", protocol: "bb-openlive", title: "BLC 开放版事件列表", css: "", config: {}, project: projectBlivechatCallback },
    eventDecision: event => event === omitted ? "omit" : event === fallback ? "fallback" : "render",
  });
  for (const target of ["live", "windows", "obs"]) {
    const plan = planCompatibleListPresentation(render, [rendered, omitted, fallback], true);
    assert.deepEqual(plan.ordered.map(item => [item.kind, item.event.reactKey]), [["source", rendered.reactKey], ["fallback", fallback.reactKey]], target);
    assert.deepEqual(plan.sourceEvents, [rendered], target);
    assert.deepEqual(plan.fallbackEvents, [fallback], target);
  }
});

test("来源右键请求打开软件菜单，并按宿主能力执行复制和礼物特效", async () => {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const { JSDOM } = require("../vendor/blivechat/node_modules/jsdom");
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "https://bb.invalid/" });
  const previous = { location: globalThis.location, window: globalThis.window, document: globalThis.document, navigator: Object.getOwnPropertyDescriptor(globalThis, "navigator"), Element: globalThis.Element, Node: globalThis.Node, MutationObserver: globalThis.MutationObserver, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  const copied = [], effects = [];
  Object.defineProperty(dom.window.navigator, "clipboard", { configurable: true, value: { writeText: async value => { copied.push(value); } } });
  Object.assign(globalThis, { location: dom.window.location, window: dom.window, document: dom.window.document, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
  const root = createRoot(dom.window.document.getElementById("root"));
  const gift = { ...danmu, msgType: MsgType.Gift, text: undefined, gift: { id: 1, name: "小花", count: 2, total: 0, coinType: "silver" } };
  const handlers = { regionKey: "live", onSpeakEvent() {}, isFavorite() { return false; }, onToggleFavorite() {}, onPlayGiftEffect: value => effects.push(value) };
  try {
    await act(async () => { root.render(React.createElement(EventContextMenu, { event: gift, shortcutActions: [], handlers, remoteOpenRequest: { revision: 1, left: 30, top: 40 } })); });
    const labels = [...dom.window.document.querySelectorAll('[role="menu"] button')].map(button => button.textContent);
    assert.ok(labels.includes("复制内容"));
    assert.ok(labels.includes("播放礼物特效"));
    await act(async () => { [...dom.window.document.querySelectorAll('[role="menu"] button')].find(button => button.textContent === "复制内容").click(); });
    assert.equal(copied.length, 1);
    await act(async () => { root.render(React.createElement(EventContextMenu, { event: gift, shortcutActions: [], handlers, remoteOpenRequest: { revision: 1, left: 30, top: 40 } })); });
    assert.equal(dom.window.document.querySelector('[role="menu"]'), null, "同一远程请求关闭后不能因普通重渲染再次打开");
    await act(async () => { root.render(React.createElement(EventContextMenu, { event: gift, shortcutActions: [], handlers, remoteOpenRequest: { revision: 2, left: 30, top: 40 } })); });
    await act(async () => { [...dom.window.document.querySelectorAll('[role="menu"] button')].find(button => button.textContent === "播放礼物特效").click(); });
    assert.deepEqual(effects, [gift]);
  } finally {
    await act(async () => { root.unmount(); });
    const { navigator: navigatorDescriptor, ...restored } = previous;
    Object.assign(globalThis, restored);
    if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor); else delete globalThis.navigator;
    dom.window.close();
  }
});

test("iframe 菜单坐标仍受事件区域和窗口边界约束", () => {
  const previousWindow = globalThis.window;
  globalThis.window = { innerWidth: 300, innerHeight: 200 };
  try { assert.deepEqual(clampRemoteMenuPosition(999, 999, 120, 80, { left: 20, top: 10, right: 260, bottom: 180 }), { left: 140, top: 100, ready: true }); }
  finally { globalThis.window = previousWindow; }
});
after(async () => vite?.close());

const danmu = {
  id: "source-message", reactKey: "source-message:2", msgType: MsgType.Danmu, roomId: 42, ts: 1234,
  text: "原版正文", user: { uid: "100", uname: "来源用户", avatar: "https://example.test/avatar.png", guardLevel: 3, isAdmin: true, medal: { name: "牌子", level: 12, isCurrentRoom: true } },
};

function ports() {
  const bindings = new Map();
  const records = new Map();
  return {
    bindings: {
      async load() { return [...bindings.values()]; },
      async bind(value) { bindings.set(value.targetId, structuredClone(value)); },
      async setDisplayScale() {}, async remove() {}, subscribe() { return () => {}; },
    },
    runtime: {
      async load() { return []; }, async loadTarget(id) { return records.get(id); },
      async save(value) { records.set(value.context.targetId, structuredClone(value)); }, async remove() {}, async publish() {}, subscribe() { return () => {}; },
    },
  };
}

test("产品事件在来源边界投影为原版 callback 并保留稳定动作 ID", () => {
  const callback = projectBlivechatCallback(danmu, 7);
  assert.equal(callback.method, "onAddText");
  assert.equal(callback.payload.id, "source-message:2");
  assert.equal(callback.payload.authorName, "来源用户");
  assert.equal(callback.payload.authorType, 2);
  assert.equal(callback.payload.privilegeType, 1);
  assert.equal(callback.payload.content, "原版正文");
  assert.equal(callback.payload.medalName, "牌子");
  assert.equal(callback.payload.medalLevel, 12);
});

test("BLC 正式运行时只选择列表级 Vue 独立文档，不再选择逐事件 React renderer", async () => {
  const state = ports();
  const runtime = createBlivechatThemeRuntime(state.bindings, state.runtime);
  const document = { ...createCompatibleThemeModeAdapter("blivechat").createBuiltinTheme(), themeId: "source-list", origin: "custom", revision: 3 };
  await runtime.publish(document, { target: "live", targetId: "live", roomId: "42", displayScale: 1 });
  const renderer = runtime.resolve({ target: "live", targetId: "live", roomId: 42, placement: "main" });
  assert.equal(renderer({ ...danmu }, { eventId: danmu.reactKey, enableBilibiliVideoLinks: true, dispatch() { return true; } }), null);
  assert.equal(renderer.rootProps.rendererMode, "blivechat-source-document");
  assert.equal(renderer.listSurface.url, "/blivechat/renderer.html");
  assert.equal(renderer.listSurface.protocol, "bb-blivechat");
  assert.equal(renderer.listSurface.config.maxNumber, 60);
  assert.equal(renderer.listSurface.project(danmu, 7).payload.id, danmu.reactKey);
});

test("BLC 来源列表仍遵守正式目标的房间准入", async () => {
  const state = ports();
  const runtime = createBlivechatThemeRuntime(state.bindings, state.runtime);
  const document = { ...createCompatibleThemeModeAdapter("blivechat").createBuiltinTheme(), themeId: "room-bound", origin: "custom", revision: 1 };
  await runtime.publish(document, { target: "live", targetId: "live", roomId: "42", displayScale: 1 });
  const renderer = runtime.resolve({ target: "live", targetId: "live", roomId: 42, placement: "main" });
  assert.ok(renderer.listSurface.project(danmu, 1));
  assert.equal(renderer.listSurface.project({ ...danmu, roomId: 43 }, 2), null);
  const unsupported = { ...danmu, id: "interact", reactKey: "interact:1", msgType: MsgType.Interact };
  assert.equal(renderer.eventDecision(unsupported), "fallback");
  assert.equal(renderer.listSurface.project(unsupported, 3), null);
});

test("来源列表追加与纯删头保持增量，初次载入使用 hydrate", () => {
  const a = { method: "onAddText", payload: { id: "a" } };
  const b = { method: "onAddText", payload: { id: "b" } };
  assert.deepEqual(planBlivechatSourceSync([], [a]), { command: "hydrate", records: [a] });
  assert.deepEqual(planBlivechatSourceSync([a], [a, b]), { command: "append", records: [b] });
  assert.deepEqual(planBlivechatSourceSync([a, b], [b]), { command: "append", records: [] });
  const c = { method: "onAddText", payload: { id: "c" } };
  assert.deepEqual(planBlivechatSourceSync([a, b, c], [c]), { command: "append", records: [] });
  assert.deepEqual(planBlivechatSourceSync([a, b, c], [a, c]), { command: "hydrate", records: [a, c] });
  assert.deepEqual(planBlivechatSourceSync([a, b], []), { command: "hydrate", records: [] });
});

test("来源列表把单条翻译变化投影为 onUpdateTranslation", () => {
  const before = { method: "onAddSuperChat", payload: { id: "sc", content: "正文", translation: "" } };
  const after = { method: "onAddSuperChat", payload: { id: "sc", content: "正文", translation: "译文" } };
  assert.deepEqual(planBlivechatSourceSync([before], [after]), {
    command: "append",
    records: [{ method: "onUpdateTranslation", payload: { id: "sc", translation: "译文" } }],
  });
});

test("来源窗口向前滑动只追加重叠尾部之后的新记录", () => {
  const row = id => ({ method: "onAddText", payload: { id, content: id } });
  const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(row);
  assert.deepEqual(planBlivechatSourceSync([a, b, c], [b, c, d]), { command: "append", records: [d] });
  assert.equal(planBlivechatSourceSync([a, b, c], [b, { ...c, payload: { ...c.payload, content: 'changed' } }, d]).command, 'hydrate');
  assert.equal(planBlivechatSourceSync([b, c, d], [a, b, c]).command, 'hydrate');
});

test("SC 删除 callback 使用同批事件的稳定来源 ID", async () => {
  const { projectBlivechatCallbackBatch } = await vite.ssrLoadModule("/src/compat/blivechat/BlivechatSourceSurface.tsx");
  const sc = { ...danmu, id: "raw-sc", reactKey: "raw-sc:3", msgType: MsgType.SuperChat, sc: { price: 30, message: "SC", duration: 60 } };
  const deleted = { id: "delete", msgType: MsgType.ScDeleted, roomId: 42, ts: 1300, scDeleteIds: ["raw-sc"] };
  const records = projectBlivechatCallbackBatch([sc, deleted], projectBlivechatCallback);
  assert.deepEqual(records.at(-1).payload.ids, ["raw-sc:3"]);
});



test("fallback 更新保留已加载的样式节点并同步样式内容", async () => {
 const {createRequire}=await import('node:module');const {JSDOM}=createRequire(import.meta.url)('../vendor/blivechat/node_modules/jsdom');
 const parent=new JSDOM('<style>.event{color:red}</style><link rel="stylesheet" href="/app.css"><div id="surface"></div>');
 const child=new JSDOM('<div id="slot"></div>');try{
  const slot=child.window.document.querySelector('#slot'),surface=parent.window.document.querySelector('#surface');
  const root=mountBlivechatFallbackRoot(slot,parent.window.document,surface);
  const link=root.querySelector('link'),sheet=root.querySelector('[data-blivechat-fallback-styles]');
  mountBlivechatFallbackRoot(slot,parent.window.document,surface);
  assert.equal(root.querySelector('link'),link);assert.equal(root.querySelector('[data-blivechat-fallback-styles]'),sheet);
  parent.window.document.querySelector('style').textContent='.event{color:blue}';
  mountBlivechatFallbackRoot(slot,parent.window.document,surface);
  assert.equal(root.querySelector('link'),link);assert.match(root.querySelector('style').textContent,/color:blue/);
 }finally{parent.window.close();child.window.close();}
});

test('原版预览的全部宿主更新保持托管输出模式',async()=>{
 const{createRequire}=await import('node:module');const{JSDOM}=createRequire(import.meta.url)('../vendor/blivechat/node_modules/jsdom');const parent=new JSDOM('<div id="root"></div>',{url:'https://bb.invalid/',pretendToBeVisual:true});const previous={window:globalThis.window,document:globalThis.document,location:globalThis.location,Element:globalThis.Element,Node:globalThis.Node,MutationObserver:globalThis.MutationObserver,fetch:globalThis.fetch,IS_REACT_ACT_ENVIRONMENT:globalThis.IS_REACT_ACT_ENVIRONMENT};Object.assign(globalThis,{window:parent.window,document:parent.window.document,location:parent.window.location,Element:parent.window.Element,Node:parent.window.Node,MutationObserver:parent.window.MutationObserver,fetch:async()=>({json:async()=>({events:[]})}),IS_REACT_ACT_ENVIRONMENT:true});const root=createRoot(parent.window.document.querySelector('#root')),sent=[];try{
 await act(async()=>root.render(React.createElement(BlivechatSourcePreview,{css:'',config:{},thumbnail:false,previewMode:'static'})));const frame=parent.window.document.querySelector('iframe');frame.contentWindow.postMessage=m=>sent.push(m);await act(async()=>parent.window.dispatchEvent(new parent.window.MessageEvent('message',{source:frame.contentWindow,origin:parent.window.location.origin,data:{type:'bb-blivechat',command:'ready'}})));const hosts=sent.filter(m=>m.command==='host');assert.ok(hosts.length>0);assert.ok(hosts.every(m=>m.data.managed===true&&m.data.renderMode==='output'),JSON.stringify(hosts));
 }finally{await act(async()=>root.unmount());Object.assign(globalThis,previous);parent.window.close();}
});

test('固定预览保持清单顺序，不按历史采集时间重排',async()=>{
 const{createRequire}=await import('node:module');const{JSDOM}=createRequire(import.meta.url)('../vendor/blivechat/node_modules/jsdom');
 const dom=new JSDOM('<div id="root"></div>',{url:'https://bb.invalid/',pretendToBeVisual:true});
 const previous={window:globalThis.window,document:globalThis.document,location:globalThis.location,Element:globalThis.Element,Node:globalThis.Node,MutationObserver:globalThis.MutationObserver,IS_REACT_ACT_ENVIRONMENT:globalThis.IS_REACT_ACT_ENVIRONMENT};Object.assign(globalThis,{window:dom.window,document:dom.window.document,location:dom.window.location,Element:dom.window.Element,Node:dom.window.Node,MutationObserver:dom.window.MutationObserver,IS_REACT_ACT_ENVIRONMENT:true});
 const root=createRoot(dom.window.document.querySelector('#root')),sent=[];
 try{
  await act(async()=>root.render(React.createElement(BlivechatSourcePreview,{css:'',config:{},thumbnail:false,previewMode:'design'})));
  const frame=dom.window.document.querySelector('iframe');frame.contentWindow.postMessage=m=>sent.push(m);
  const dispatch=(command,data)=>dom.window.dispatchEvent(new dom.window.MessageEvent('message',{source:frame.contentWindow,origin:dom.window.location.origin,data:{type:'bb-blivechat',command,data}}));
  await act(async()=>dispatch('ready'));
  const records=[{method:'onAddText',payload:{id:'first',timestamp:200,content:'第一条'}},{method:'onAddText',payload:{id:'last',timestamp:100,content:'末条'}}];
  await act(async()=>dispatch('preview-frame',{epoch:1,records,windowed:true,presentation:{messages:records.map(record=>({id:record.payload.id,type:0})),paidMessages:[]}}));
  assert.deepEqual(sent.filter(m=>m.command==='presentation').at(-1).data.layout.map(item=>item.eventId),['first','last']);
 }finally{await act(async()=>root.unmount());Object.assign(globalThis,previous);dom.window.close()}
});

test("fallback 同轮只读一次公共变量，未变值不重复写入",async()=>{
  const {createRequire}=await import('node:module');const{JSDOM}=createRequire(import.meta.url)('../vendor/blivechat/node_modules/jsdom');
  assert.equal(typeof readBlivechatFallbackPresentation,'function');
  const parent=new JSDOM('<!doctype html><style>.event{color:red}</style><div id="surface" style="--event-font-size:18px"></div>');
  const child=new JSDOM('<!doctype html><div id="a"></div><div id="b"></div>');
  let reads=0,writes=0;const original=parent.window.getComputedStyle.bind(parent.window);parent.window.getComputedStyle=(...args)=>{reads++;return original(...args)};
  const source=parent.window.document.getElementById('surface');const batch=readBlivechatFallbackPresentation(parent.window.document,source);
  for(const id of ['a','b']){const slot=child.window.document.getElementById(id);const set=slot.style.setProperty.bind(slot.style);slot.style.setProperty=(...args)=>{writes++;return set(...args)};mountBlivechatFallbackRoot(slot,parent.window.document,source,undefined,batch);}
  const before=writes;
  for(const id of ['a','b'])mountBlivechatFallbackRoot(child.window.document.getElementById(id),parent.window.document,source,undefined,batch);
  assert.equal(reads,1);assert.equal(writes,before);assert.equal(child.window.document.getElementById('b').style.getPropertyValue('--event-font-size'),'18px');
  parent.window.close();child.window.close();
});
test('开放版窗口前移的相对序号变化不重载保留事件', async () => {
 const { projectOpenLiveCallback } = await vite.ssrLoadModule('/src/compat/openlive/projection.ts');
 const facts = ['a','b','c','d'].map((id,index)=>({id,roomId:1,ts:1700000000000+index,msgType:0,text:id,user:{uid:'1',uname:'名字'}}));
 const before=facts.slice(0,3).map((e,i)=>projectOpenLiveCallback(e,i+1));
 const after=facts.slice(1).map((e,i)=>projectOpenLiveCallback(e,i+1));
 assert.deepEqual(planBlivechatSourceSync(before,after),{command:'append',records:[after[2]]});
 assert.equal(planBlivechatSourceSync(before,[after[0],{...after[1],payload:{...after[1].payload,content:'修改'}},after[2]]).command,'hydrate');
});
