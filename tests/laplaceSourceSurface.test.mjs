import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import postcss from "postcss";

let vite;
let modules;
let ReactAct;
let createRoot;
let previousStorage;
let previousWindow;

before(async () => {
  previousWindow = globalThis.window;
  previousStorage = globalThis.localStorage;
  globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  globalThis.window = { localStorage: globalThis.localStorage, location: { origin: "https://bb.invalid" }, matchMedia: () => ({ matches: false }) };
  vite = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-laplaceSourceSurface.test.mjs",optimizeDeps:{noDiscovery:true,include:[]}, configFile: false, server: { middlewareMode: true, watch: null }, appType: "custom", logLevel: "silent" });
  modules = {
    adapters: await vite.ssrLoadModule("/src/themes/themeModeAdapters.ts"),
    register: await vite.ssrLoadModule("/src/compat/laplace/register.tsx"),
    runtime: await vite.ssrLoadModule("/src/compat/laplace/runtime.tsx"),
    cascade: await vite.ssrLoadModule("/src/compat/laplace/cssCascade.ts"),
    surface: await vite.ssrLoadModule("/src/compat/laplace/LaplaceProductSurface.tsx"),
    list: await vite.ssrLoadModule("/src/compat/CompatibleListSurface.tsx"),
    bridge: await vite.ssrLoadModule("/src/compat/laplace/renderer/bridge.ts"),
    host: await vite.ssrLoadModule("/src/compat/laplace/RendererHost.tsx"),
    samples: await vite.ssrLoadModule("/src/compat/laplace/renderer/samples.ts"),
    theme: await vite.ssrLoadModule("/src/compat/laplace/theme.ts"),
    managed: await vite.ssrLoadModule("/src/themes/compatManagedCss.ts"),
  };
  ({ act: ReactAct } = await import("react"));
  ({ createRoot } = await import("react-dom/client"));
});

test("LAPLACE 编辑宿主把真实 selector 送入发布 iframe 并接收部件点选", async () => {
  const { dom, restore } = installDom(); const root=createRoot(dom.window.document.getElementById("root")); let inspection=null;
  try {
    const message = modules.samples.getOriginalSamples("design").find(value => value.type === "message");
    const focusSelector=modules.managed.compatibleSelectorFor(modules.theme.LAPLACE_CAPABILITY,"danmaku|all|main|message","common");
    const selectors=Object.fromEntries(Object.entries(modules.theme.LAPLACE_CAPABILITY.parts).map(([part,definition])=>[part,[definition.selector]]));
    const scopeSelectors={eventsByPlacement:modules.theme.LAPLACE_CAPABILITY.eventSelectorsByPlacement,identities:modules.theme.LAPLACE_CAPABILITY.identitySelectors,placements:Object.fromEntries(Object.entries(modules.theme.LAPLACE_CAPABILITY.eventSelectorsByPlacement).map(([key,value])=>[key,Object.values(value).join(',')]))};
    await ReactAct(async()=>root.render(React.createElement(modules.host.RendererHost,{variant:"product",settings:{},css:{cloud:"",remote:"",custom:""},events:[message],stickyEvents:[],preview:true,scrollable:true,rate:0,productElements:{classicScope:false},editorSelection:{part:"message",inspectionRevision:0,scope:{part:"message",eventType:"danmaku",identity:"all",placement:"main"},reveal:true,selectors,focusSelectors:[focusSelector],strictScope:true,scheme:"dark",properties:{message:['fontSize','color']},scopeSelectors},onEditorInspection:value=>{if(!value.refresh)inspection=value;}})));
    const frame=dom.window.document.querySelector("iframe"), child=frame.contentWindow, sent=[];
    child.document.open(); child.document.write('<!doctype html><html><body><div id="root"></div></body></html>'); child.document.close();
    child.Element.prototype.getAnimations=()=>[];
    child.history.replaceState({}, "", `${frame.src}&qa=1`);
    child.ResizeObserver=class{observe(){} disconnect(){}}; child.TextEncoder=globalThis.TextEncoder;
    child.requestAnimationFrame=callback=>{callback(0);return 1;}; child.cancelAnimationFrame=()=>{};
    child.HTMLElement.prototype.scrollTo=function(){}; child.HTMLElement.prototype.scrollIntoView=function(){};
    child.CSS??={}; child.CSS.escape=value=>String(value).replaceAll('"','\\"');
    child.postMessage=data=>{const cloned=child.JSON.parse(child.JSON.stringify(data));sent.push(JSON.parse(JSON.stringify(cloned)));child.queueMicrotask(()=>child.dispatchEvent(new child.MessageEvent("message",{source:child.parent,origin:dom.window.location.origin,data:cloned})));};
    dom.window.postMessage=data=>{const cloned=JSON.parse(JSON.stringify(data));dom.window.queueMicrotask(()=>dom.window.dispatchEvent(new dom.window.MessageEvent("message",{source:child,origin:dom.window.location.origin,data:cloned})));};
    await ReactAct(async()=>{child.eval(readFileSync("public/laplace/product/renderer.js","utf8"));await new Promise(resolve=>setTimeout(resolve,150));});
    await ReactAct(async()=>dom.window.dispatchEvent(new dom.window.MessageEvent("message",{source:child,origin:dom.window.location.origin,data:{channel:"bb-laplace",version:1,type:"ready",generation:Number(new URL(frame.src).searchParams.get("generation")),sequence:0,mode:"candidate"}})));
    await ReactAct(async()=>{await new Promise(resolve=>setTimeout(resolve,50));});
    const render=sent.find(value=>value.type==="render");
    assert.ok(render, JSON.stringify(sent));
    assert.deepEqual(render.editorSelection.focusSelectors,[focusSelector]);
    const target=focusSelector.split(",").map(selector=>selector.trim()).map(selector=>child.document.querySelector(selector)).find(Boolean);
    assert.ok(target, child.document.body.innerHTML);
    target.getBoundingClientRect=()=>({left:0,top:0,right:200,bottom:24,width:200,height:24});
    assert.equal(child.document.documentElement.dataset.theme,"dark");
    assert.equal(target.hasAttribute("data-compatible-editor-selected"),true);
    assert.equal(target.hasAttribute("data-compatible-editor-reveal"),false);
    for (const selector of selectors.message) for (const node of child.document.querySelectorAll(selector)) node.style.fontSize="23px";
    await ReactAct(async()=>{target.dispatchEvent(new child.MouseEvent("click",{bubbles:true,cancelable:true,clientX:20,clientY:12}));await new Promise(resolve=>setTimeout(resolve,0));});
    assert.equal(inspection.scope.part,"message");
    assert.equal(inspection.scope.eventType,"danmaku");
    assert.equal(inspection.computed.fontSize.value,"23px");
  } finally { await ReactAct(async()=>root.unmount()); restore(); }
});

const sourceEvent = (id, index = Number(id.replace(/\D/g, "")) || 1) => ({
  id, reactKey: id, roomId: 1, ts: index + 1, msgType: 0, text: `正文${id}`, user: { uid: String(index + 1), uname: `用户${id}` },
});
const descriptor = {
  renderer: "laplace", url: "/laplace/product/index.html", protocol: "bb-laplace", title: "LAPLACE", css: "", config: {},
  project(event, sequence) { const sample = modules.samples.getOriginalSamples("design").find(value => value.type === "message"); return { ...sample, id: event.reactKey, origin: sequence, originIdx: sequence, timestampNormalized: event.ts, username: event.user.uname, message: event.text }; },
};
function installDom() {
  const require = createRequire(import.meta.url);
  const { JSDOM } = require("../vendor/blivechat/node_modules/jsdom");
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "https://bb.invalid/", runScripts: "dangerously" });
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const previous = { window: globalThis.window, document: globalThis.document, Element: globalThis.Element, HTMLElement: globalThis.HTMLElement, Node: globalThis.Node, MutationObserver: globalThis.MutationObserver, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true });
  return { dom, restore() { Object.assign(globalThis, previous); dom.window.close(); } };
}

async function flushUntil(predicate) {
  const until = Date.now() + 2000;
  while (!predicate() && Date.now() < until) await ReactAct(async () => new Promise(resolve => setTimeout(resolve, 10)));
  assert.ok(predicate(), "渲染消息链路应完成");
}

test("Stable238 origin-index 类根按首次来源身份绑定主区和 sticky，重排不改离场节点", () => {
  const { dom, restore } = installDom();
  try {
    const root = dom.window.document.createElement("div");
    root.innerHTML = '<div class="event-list"><div id="main-old" class="event origin-index--7"></div></div><div class="gift-sticky-bar"><div id="sticky-old" class="event origin-index--3"></div></div>';
    modules.surface.bindLaplaceStableEventRoots(root, [{ id: "main-A", originIdx: 7 }], [{ id: "sticky-A", originIdx: 3 }]);
    assert.equal(root.querySelector("#main-old").dataset.eventId, "main-A");
    assert.equal(root.querySelector("#sticky-old").dataset.eventId, "sticky-A");
    root.querySelector(".event-list").insertAdjacentHTML("afterbegin", '<div id="main-new" class="event origin-index--7"></div>');
    modules.surface.bindLaplaceStableEventRoots(root, [{ id: "main-B", originIdx: 7 }], [{ id: "sticky-B", originIdx: 3 }]);
    assert.equal(root.querySelector("#main-old").dataset.eventId, "main-A");
    assert.equal(root.querySelector("#main-new").dataset.eventId, "main-B");
  } finally { restore(); }
});

test("正式 React 宿主握手后立即定位当前窗口，并把 mode、ticker、rate 与交互选项送入 product iframe", async () => {
  const { dom, restore } = installDom();
  const root = createRoot(dom.window.document.getElementById("root"));
  const control = React.createRef();
  let pointerDown = 0;
  try {
    await ReactAct(async () => root.render(React.createElement(modules.surface.LaplaceProductSurface, { ref: control, descriptor, events: [sourceEvent("e1")], tickerPosition: "bottom", rate: 9, renderMode: "dashboard", enableBilibiliVideoLinks: true, initialScrollState: { followingLatest: true, scrollTop: 0 }, onPointerDown: () => pointerDown++ })));
    const frame = dom.window.document.querySelector("iframe"), sent = [];
    frame.contentWindow.postMessage = message => sent.push(message);
    const generation = Number(new URL(frame.src).searchParams.get("generation"));
    await ReactAct(async () => dom.window.dispatchEvent(new dom.window.MessageEvent("message", { source: frame.contentWindow, origin: dom.window.location.origin, data: { channel: "bb-laplace", version: 1, type: "ready", generation, sequence: 0 } })));
    const render = sent.find(message => message.type === "render");
    assert.equal(render.tickerPosition, "bottom");
    assert.equal(render.rate, 9);
    assert.equal(render.renderMode, "dashboard");
    assert.equal(render.enableBilibiliVideoLinks, true);
    await ReactAct(async () => dom.window.dispatchEvent(new dom.window.MessageEvent("message", { source: frame.contentWindow, origin: dom.window.location.origin, data: { channel: "bb-laplace", version: 1, type: "rendered", generation, sequence: render.sequence, mode: "candidate" } })));
    assert.equal(sent.find(message => message.action === "restore-scroll")?.followingLatest, true);
    await ReactAct(async () => control.current.locate("e1"));
    assert.equal(sent.some(message => message.action === "locate" && message.eventId === "e1"), true);
    await ReactAct(async () => dom.window.dispatchEvent(new dom.window.MessageEvent("message", { source: frame.contentWindow, origin: dom.window.location.origin, data: { channel: "bb-laplace", version: 1, type: "pointer-down", generation, sequence: render.sequence } })));
    assert.equal(pointerDown, 1);
    assert.match(frame.getAttribute("style") ?? "", /width:\s*100%/);
    assert.match(frame.getAttribute("style") ?? "", /height:\s*100%/);
  } finally { await ReactAct(async () => root.unmount()); restore(); }
});

test("完整历史窗口相邻移动、局部底部与全历史 latest 分离，并保留锚点恢复", () => {
  assert.equal(modules.surface.advanceLaplaceProductWindow({ start: 0, end: 80, total: 240, direction: "forward" }), 40);
  assert.equal(modules.surface.advanceLaplaceProductWindow({ start: 40, end: 120, total: 240, direction: "forward" }), 80);
  assert.equal(modules.surface.advanceLaplaceProductWindow({ start: 80, end: 160, total: 240, direction: "backward" }), 40);
  assert.equal(modules.surface.isLaplaceGlobalLatest({ direction: "bottom", start: 80, end: 160, total: 240, sourceFollowing: true }), false);
  assert.equal(modules.surface.isLaplaceGlobalLatest({ direction: "bottom", start: 160, end: 240, total: 240, sourceFollowing: true }), true);
});

test("渲染完成通知不重复提交相同事件批次", async () => {
  const {dom,restore}=installDom(),root=createRoot(dom.window.document.getElementById("root")),sent=[];
  try {
    await ReactAct(async()=>root.render(React.createElement(modules.surface.LaplaceProductSurface,{descriptor,events:[sourceEvent("e1")]})));
    const frame=dom.window.document.querySelector("iframe"),generation=Number(new URL(frame.src).searchParams.get("generation"));frame.contentWindow.postMessage=message=>sent.push(message);
    const receive=data=>ReactAct(async()=>dom.window.dispatchEvent(new dom.window.MessageEvent("message",{source:frame.contentWindow,origin:dom.window.location.origin,data:{channel:"bb-laplace",version:1,generation,...data}})));
    await receive({type:"ready",sequence:0});const render=sent.find(m=>m.type==="render");
    await receive({type:"rendered",sequence:render.sequence});
    assert.equal(sent.filter(m=>m.type==="render").length,1);
  }finally{await ReactAct(async()=>root.unmount());restore();}
});

test("退出筛选的恢复等待当前事件批次完成，不消费旧批次确认", async () => {
  const { dom, restore } = installDom();
  const root = createRoot(dom.window.document.getElementById("root")), control = React.createRef(), sent = [];
  try {
    const events = Array.from({ length: 100 }, (_, i) => sourceEvent(`e${i}`));
    const render = input => ReactAct(async () => root.render(React.createElement(modules.surface.LaplaceProductSurface,
      { ref: control, descriptor, events: input })));
    await render(events);
    const frame = dom.window.document.querySelector("iframe");
    frame.contentWindow.postMessage = message => sent.push(message);
    const generation = Number(new URL(frame.src).searchParams.get("generation"));
    const receive = data => ReactAct(async () => dom.window.dispatchEvent(new dom.window.MessageEvent("message",
      { source: frame.contentWindow, origin: dom.window.location.origin, data: { channel: "bb-laplace", version: 1, generation, ...data } })));
    await receive({ type: "ready", sequence: 0 });
    const initial = sent.filter(message => message.type === "render").at(-1);
    await receive({ type: "rendered", sequence: initial.sequence });
    await render([events[99]]);
    const filtered = sent.filter(message => message.type === "render").at(-1);
    await render(events);
    await ReactAct(async () => control.current.restoreScroll({ followingLatest: false, scrollTop: 420, anchorId: "e75", anchorOffset: 17 }));
    const current = sent.filter(message => message.type === "render").at(-1);
    sent.length = 0;
    await receive({ type: "rendered", sequence: filtered.sequence });
    assert.equal(sent.some(message => message.action === "restore-scroll"), false);
    await receive({ type: "rendered", sequence: current.sequence });
    const restored = sent.find(message => message.action === "restore-scroll");
    assert.equal(restored.eventId, "e75");
    assert.equal(restored.anchorOffset, 17);
    assert.equal(restored.followingLatest, false);
  } finally { await ReactAct(async () => root.unmount()); restore(); }
});

test("followingLatest 当前窗口定位关闭跟随后仍保留最新窗口与目标", async () => {
  const { dom, restore } = installDom();
  const root = createRoot(dom.window.document.getElementById("root")), control = React.createRef(), sent = [];
  try {
    const events = Array.from({ length: 240 }, (_, index) => sourceEvent(`e${index}`));
    await ReactAct(async () => root.render(React.createElement(modules.surface.LaplaceProductSurface, { ref: control, descriptor, events })));
    const frame = dom.window.document.querySelector("iframe"); frame.contentWindow.postMessage = message => sent.push(message);
    const generation = Number(new URL(frame.src).searchParams.get("generation"));
    await ReactAct(async () => dom.window.dispatchEvent(new dom.window.MessageEvent("message", { source: frame.contentWindow, origin: dom.window.location.origin, data: { channel: "bb-laplace", version: 1, type: "ready", generation, sequence: 0 } })));
    sent.length = 0;
    await ReactAct(async () => control.current.locate("e200"));
    const rerender = sent.find(message => message.type === "render");
    assert.ok(rerender.events.some(event => event.id === "e200"));
    assert.ok(rerender.events.some(event => event.id === "e239"));
    await ReactAct(async () => dom.window.dispatchEvent(new dom.window.MessageEvent("message", { source: frame.contentWindow, origin: dom.window.location.origin, data: { channel: "bb-laplace", version: 1, type: "rendered", generation, sequence: rerender.sequence } })));
    assert.equal(sent.some(message => message.action === "locate" && message.eventId === "e200"), true);
  } finally { await ReactAct(async () => root.unmount()); restore(); }
});

test("正式宿主跨窗后由发布 frame 恢复同一事件和像素偏移", async () => {
  const { dom, restore } = installDom();
  const root = createRoot(dom.window.document.getElementById("root")), sent = [];
  try {
    const events = Array.from({ length: 240 }, (_, index) => sourceEvent(`e${index}`));
    await ReactAct(async () => root.render(React.createElement(modules.surface.LaplaceProductSurface, { descriptor, events })));
    const frame = dom.window.document.querySelector("iframe"); frame.contentWindow.postMessage = message => sent.push(message);
    const generation = Number(new URL(frame.src).searchParams.get("generation"));
    const receive = data => ReactAct(async () => dom.window.dispatchEvent(new dom.window.MessageEvent("message", { source: frame.contentWindow, origin: dom.window.location.origin, data })));
    await receive({ channel: "bb-laplace", version: 1, type: "ready", generation, sequence: 0 });
    const first = sent.find(message => message.type === "render");
    await receive({ channel: "bb-laplace", version: 1, type: "rendered", generation, sequence: first.sequence, mode: "candidate" });
    sent.length = 0;
    await receive({ channel: "bb-laplace", version: 1, type: "scroll-state", generation, sequence: first.sequence, following: false, scrollTop: 420, scrollHeight: 2000, clientHeight: 500, nearStart: true, nearEnd: false, userInitiated: true, anchorId: "e180", anchorOffset: 17, mode: "candidate" });
    const moved = sent.find(message => message.type === "render");
    assert.ok(moved.events.some(event => event.id === "e180"));
    assert.ok(moved.events.some(event => event.id === "e120"));
    await receive({ channel: "bb-laplace", version: 1, type: "rendered", generation, sequence: moved.sequence, mode: "candidate" });
    const restored = sent.find(message => message.action === "restore-scroll");
    assert.equal(restored.eventId, "e180");
    assert.equal(restored.anchorOffset, 17);
    assert.equal(restored.scrollTop, 420);
    assert.equal(restored.followingLatest, false);
  } finally { await ReactAct(async () => root.unmount()); restore(); }
});

test("回到最新在目标窗口完成后再次滚动，不被旧批次状态取消", async () => {
  const {dom,restore}=installDom(),root=createRoot(dom.window.document.getElementById("root")),control=React.createRef(),sent=[];
  try {
    const events=Array.from({length:240},(_,i)=>sourceEvent(`e${i}`));
    await ReactAct(async()=>root.render(React.createElement(modules.surface.LaplaceProductSurface,{ref:control,descriptor,events,initialScrollState:{followingLatest:false,scrollTop:0,anchorId:"e10"}})));
    const frame=dom.window.document.querySelector("iframe"),generation=Number(new URL(frame.src).searchParams.get("generation"));frame.contentWindow.postMessage=message=>sent.push(message);
    const receive=data=>ReactAct(async()=>dom.window.dispatchEvent(new dom.window.MessageEvent("message",{source:frame.contentWindow,origin:dom.window.location.origin,data:{channel:"bb-laplace",version:1,generation,...data}})));
    await receive({type:"ready",sequence:0});const first=sent.filter(m=>m.type==="render").at(-1);await receive({type:"rendered",sequence:first.sequence});sent.length=0;
    await ReactAct(async()=>control.current.scrollToLatest());const current=sent.filter(m=>m.type==="render").at(-1);assert.ok(current.events.some(e=>e.id==="e239"));sent.length=0;
    await receive({type:"scroll-state",sequence:first.sequence,following:false,scrollTop:200,scrollHeight:2000,clientHeight:500,userInitiated:false});
    await receive({type:"rendered",sequence:current.sequence});
    assert.ok(sent.some(m=>m.action==="scroll-latest"));
  }finally{await ReactAct(async()=>root.unmount());restore();}
});

test("正式 rate 使用一秒滑动窗口并按新稳定 ID 计数", () => {
  let state = { seen: new Set(["a"]), arrivals: [] };
  state = modules.list.advanceCompatibleRateWindow(state, ["a", "b"], 0);
  state = modules.list.advanceCompatibleRateWindow(state, ["a", "b", "c"], 500);
  assert.equal(state.arrivals.length, 2);
  state = modules.list.advanceCompatibleRateWindow(state, ["b", "c", "d"], 1000);
  assert.equal(state.arrivals.length, 2);
  state = modules.list.advanceCompatibleRateWindow(state, ["c", "d", "e"], 1500);
  assert.equal(state.arrivals.length, 2);
  assert.deepEqual([...state.seen].sort(), ["c", "d", "e"]);
});

test("正式 CompatibleListSurface 把滑动窗口 rate 送入 frame，等长替换仍计数", async () => {
  const { dom, restore } = installDom();
  const root = createRoot(dom.window.document.getElementById("root")), sent = [];
  const originalNow = Date.now;
  try {
    let now = 0; Date.now = () => now;
    const render = async events => ReactAct(async () => root.render(React.createElement(modules.list.CompatibleListSurface, { descriptor, events })));
    await render([sourceEvent("a")]);
    const frame = dom.window.document.querySelector("iframe"); frame.contentWindow.postMessage = message => sent.push(message);
    const generation = Number(new URL(frame.src).searchParams.get("generation"));
    await ReactAct(async () => dom.window.dispatchEvent(new dom.window.MessageEvent("message", { source: frame.contentWindow, origin: dom.window.location.origin, data: { channel: "bb-laplace", version: 1, type: "ready", generation, sequence: 0 } })));
    now = 1; await render([sourceEvent("a"), sourceEvent("b")]);
    assert.equal(sent.filter(message => message.type === "render").at(-1).rate, 1);
    now = 501; await render([sourceEvent("a"), sourceEvent("b"), sourceEvent("c")]);
    assert.equal(sent.filter(message => message.type === "render").at(-1).rate, 2);
    now = 1001; await render([sourceEvent("b"), sourceEvent("c"), sourceEvent("d")]);
    assert.equal(sent.filter(message => message.type === "render").at(-1).rate, 2);
  } finally { Date.now = originalNow; await ReactAct(async () => root.unmount()); restore(); }
});

test("统一工作台正式提供 static、design、simulation 紧凑模式并使用来源 simulation", () => {
  const document = modules.adapters.createCompatibleThemeModeAdapter("laplace").createBuiltinTheme();
  const simulation = renderToStaticMarkup(React.createElement(modules.register.LaplacePreview, { document, thumbnail: false, previewMode: "simulation" }));
  assert.match(simulation, /data-laplace-preview-mode="simulation"/);
  assert.match(simulation, /data-laplace-simulation="source"/);
  assert.ok(modules.samples.generateOriginalSimulationEvent({ enabledTypes: new Set(["message"]) }, { random: () => 0, now: () => 1234 }));
});

test("LAPLACE 来源 CSS 重复组合和导出只解析一次，换源重新解析", (t) => {
  const parse = t.mock.method(postcss, "parse");
  const source = '@import "cache-source.css" layer(theme);\n.cache-source{color:red}';
  const base = ".cache-base{color:blue}";
  const calls = css => parse.mock.calls.filter(call => call.arguments[0] === css).length;
  const first = modules.cascade.composeLaplaceCssLayers(source, base, "", "");
  assert.match(first.cloud, /layer\(default\.theme\)/);
  assert.match(first.cloud, /\.cache-source\{color:red\}/);
  assert.deepEqual(modules.cascade.composeLaplaceCssLayers(source, base, "", ""), first);
  const exported = modules.cascade.composeLaplaceExportCss(source, base, "", "");
  assert.match(exported, /layer\(default\.theme\)/);
  assert.match(exported, /\.cache-base\{color:blue\}/);
  assert.equal(calls(source), 1);
  assert.equal(calls(base), 1);
  const changed = source.replace("color:red", "color:green");
  const result = modules.cascade.composeLaplaceCssLayers(changed, base, "", "");
  assert.match(result.cloud, /\.cache-source\{color:green\}/);
  assert.doesNotMatch(result.cloud, /color:red/);
  assert.equal(calls(changed), 1);
  assert.equal(calls(base), 1);
});

test("LAPLACE 来源 CSS 缓存最多四项并复用解析失败的原文回退", (t) => {
  const parse = t.mock.method(postcss, "parse");
  const values = Array.from({ length: 5 }, (_, i) => `.cache-bound-${i}{color:red}`);
  const compose = css => modules.cascade.composeLaplaceCssLayers(css, css, "", "");
  const calls = css => parse.mock.calls.filter(call => call.arguments[0] === css).length;
  for (const css of values.slice(0, 4)) compose(css);
  for (const css of values.slice(0, 4)) { compose(css); assert.equal(calls(css), 1); }
  compose(values[4]);
  for (const css of values.slice(1)) { compose(css); assert.equal(calls(css), 1); }
  compose(values[0]);
  assert.equal(calls(values[0]), 2);
  const invalid = ".cache-recoverable{color:red";
  const first = compose(invalid);
  assert.equal(first.cloud, `@layer default, config, custom;\n\n@layer default {\n${invalid}\n\n${invalid}\n}`);
  assert.deepEqual(compose(invalid), first);
  assert.equal(calls(invalid), 1);
});

test("预览与正式 resolver 复用同一 LAPLACE CSS 三层组合", async () => {
  const document = modules.adapters.createCompatibleThemeModeAdapter("laplace").createBuiltinTheme();
  document.styles = { baseCss: "/* base-shared */", visualCss: "/* visual-shared */", customCss: "/* custom-shared */" };
  document.settings.showTimestamp = true;
  document.settings.showMedalLightenedOnly = false;
  const sources = modules.runtime.composeLaplaceRendererCssSources(document);
  assert.match(sources.cloud, /base-shared/);
  assert.match(sources.custom, /visual-shared/);
  assert.match(sources.custom, /custom-shared/);
  assert.match(sources.custom, /timestamp/);
  const { dom, restore } = installDom();
  const root = createRoot(dom.window.document.getElementById("root"));
  try {
    await ReactAct(async () => root.render(React.createElement(modules.register.LaplacePreview, { document, thumbnail: false, previewMode: "design" })));
    const frame = dom.window.document.querySelector("iframe"), sent = [];
    frame.contentWindow.postMessage = message => sent.push(message);
    const generation = Number(new URL(frame.src).searchParams.get("generation"));
    await ReactAct(async () => dom.window.dispatchEvent(new dom.window.MessageEvent("message", { source: frame.contentWindow, origin: dom.window.location.origin, data: { channel: "bb-laplace", version: 1, type: "ready", generation, sequence: 0 } })));
    const rendered = sent.find(message => message.type === "render");
    assert.ok(JSON.stringify(rendered.css) === JSON.stringify(sources), '预览与正式输出应复用相同的 CSS 分层');
  } finally { await ReactAct(async () => root.unmount()); restore(); }
});

test("LAPLACE 自有控制协议支持定位和回到最新，不借用 BLC 命令", () => {
  const base = { channel: "bb-laplace", version: 1, type: "control", generation: 2 };
  assert.equal(modules.bridge.isLaplaceControlMessage({ ...base, action: "locate", eventId: "evt-1" }), true);
  assert.equal(modules.bridge.isLaplaceControlMessage({ ...base, action: "scroll-latest" }), true);
  assert.equal(modules.bridge.isLaplaceControlMessage({ ...base, action: "restore-scroll", scrollTop: 0, followingLatest: true }), true);
  assert.equal(modules.bridge.isLaplaceControlMessage({ ...base, action: "locate" }), false);
  assert.equal(modules.bridge.isLaplaceControlMessage({ ...base, action: "hydrate" }), false);
});

test("LAPLACE render envelope 接受软件阅读方向但拒绝未知布局值", () => {
  const message = {
    channel: "bb-laplace", version: 1, type: "render", generation: 1, sequence: 1,
    events: [], stickyEvents: [], settings: {}, css: { cloud: "", remote: "", custom: "" },
    preview: false, scrollable: true, rate: 0, direction: "top",
  };
  assert.equal(modules.bridge.isLaplaceRenderMessage(message), true);
  assert.equal(modules.bridge.isLaplaceRenderMessage({ ...message, layout: [{ kind: "source", eventId: "one" }, { kind: "fallback", eventId: "two" }] }), true);
  assert.equal(modules.bridge.isLaplaceRenderMessage({ ...message, layout: [{ kind: "foreign", eventId: "one" }] }), false);
  assert.equal(modules.bridge.isLaplaceRenderMessage({ ...message, direction: "sideways" }), false);
  assert.equal(modules.bridge.isLaplaceRenderMessage({ ...message, events: [{ id: "repeat", type: "message", origin: 1, originIdx: 1, timestampNormalized: 1, hostRepeatCount: 3 }] }), true);
});

test("LAPLACE 历史窗口保留完整事实并按稳定目标换窗", () => {
  const events = Array.from({ length: 210 }, (_, index) => ({ id: `e-${index}`, reactKey: `k-${index}` }));
  const latest = modules.surface.planLaplaceProductWindow(events, { direction: "bottom", followingLatest: true });
  assert.equal(latest.start, 130);
  assert.equal(latest.events.length, 80);
  const located = modules.surface.planLaplaceProductWindow(events, { direction: "bottom", followingLatest: false, targetId: "k-20" });
  assert.ok(located.events.some(event => event.reactKey === "k-20"));
  assert.equal(events.length, 210);
});

after(async () => { await vite?.close(); globalThis.window = previousWindow; globalThis.localStorage = previousStorage; });

test("缩略图取顶部 6 条事件，编辑预览运行批准的 65 条样例", () => {
  const document = modules.adapters.createCompatibleThemeModeAdapter("laplace").createBuiltinTheme();
  assert.equal(document.settings.colorScheme, "light");
  assert.equal(document.settings.sceneName, "");
  assert.equal(document.settings.showGiftHighlightAbove, 30);
  const thumbnail = renderToStaticMarkup(React.createElement(modules.register.LaplacePreview, { document, thumbnail: true }));
  const editor = renderToStaticMarkup(React.createElement(modules.register.LaplacePreview, { document, thumbnail: false }));
  assert.match(thumbnail, /\/laplace\/product\/index\.html/);
  assert.match(editor, /\/laplace\/product\/index\.html/);
  assert.match(thumbnail, /data-laplace-sample-count="6"/);
  assert.match(editor, /data-laplace-sample-count="65"/);
  assert.equal(modules.samples.getOriginalSamples("static").length, 63);
  assert.equal(modules.samples.getOriginalSamples("design").length, 65);
});

test("正式目标解析为 LAPLACE product 列表 surface，而不是逐事件 renderer", async () => {
  const bindingState = new Map();
  const published = new Map();
  const bindings = {
    async load() { return [...bindingState.values()]; },
    async bind(value) { bindingState.set(value.targetId, value); },
    async setDisplayScale(targetId, displayScale) { bindingState.set(targetId, { ...bindingState.get(targetId), displayScale }); },
    async remove(targetId) { bindingState.delete(targetId); },
    subscribe() { return () => {}; },
  };
  const ports = {
    async load() { return [...published.values()]; },
    async loadTarget(targetId) { return published.get(targetId); },
    async save(value) { published.set(value.context.targetId, structuredClone(value)); },
    async remove(targetId) { published.delete(targetId); },
    async publish() {},
    subscribe() { return () => {}; },
    async loadBindings() { return [...bindingState.values()]; },
    subscribeBindings() { return () => {}; },
  };
  const runtime = modules.runtime.createLaplaceThemeRuntime(bindings, ports);
  await runtime.start();
  const document = modules.adapters.createCompatibleThemeModeAdapter("laplace").createBuiltinTheme();
  await runtime.publish(document, { target: "live", targetId: "live", roomId: "1", displayScale: 1 });
  const render = runtime.resolve({ target: "live", targetId: "live", roomId: 1, placement: "main" });
  assert.equal(render.rootProps.rendererMode, "laplace-product");
  assert.equal(render.listSurface.protocol, "bb-laplace");
  assert.equal(render.listSurface.url, "/laplace/product/index.html");
  assert.equal(render.listSurface.renderer, "laplace");
  const projected = render.listSurface.project({ id: "m", roomId: 1, ts: 1, msgType: 0, text: "正文", user: { uid: "1", uname: "用户" } }, 7);
  assert.equal(projected.id, "m");
  assert.equal(projected.originIdx, 7);

  document.settings.maskUsername = true;
  document.revision += 1;
  await runtime.publish(document, { target: "windows", targetId: "windows", roomId: "1", displayScale: 1 });
  const windowRender = runtime.resolve({ target: "windows", targetId: "windows", roomId: 1, placement: "main" });
  const masked = windowRender.listSurface.project({ id: "masked", roomId: 1, ts: 1, msgType: 0, text: "正文", user: { uid: "1", uname: "真实用户名" } }, 1);
  assert.equal(masked.username, "真***");
});

test("正式宿主只生成一个来源列表 frame，缩放由宿主容器承担", () => {
  const descriptor = {
    renderer: "laplace",
    url: "/laplace/product/index.html",
    protocol: "bb-laplace",
    title: "LAPLACE 事件列表",
    css: "",
    config: {},
    project: () => null,
  };
  const html = renderToStaticMarkup(React.createElement(modules.surface.LaplaceProductSurface, {
    descriptor,
    events: [],
    scale: 1.25,
  }));
  assert.equal((html.match(/<iframe/g) ?? []).length, 1);
  assert.match(html, /\/laplace\/product\/index\.html/);
  assert.match(html, /transform:scale\(1\.25\)/);
  const css = readFileSync("src/components/nativeThemeEditor.css", "utf8");
  assert.match(css, /\.laplace-theme-root\{display:flex;width:100%;height:100%;min-width:0;min-height:0/);
  const eventList = readFileSync("src/components/EventList.tsx", "utf8");
  assert.match(eventList, /anchorId:\s*feedSession\.anchorId/);
  assert.match(eventList, /feedSession\.anchorOffset\s*=\s*state\.anchorOffset/);
});

test("发布 product bundle 包含单一来源列表和软件动作桥", () => {
  const bundle = readFileSync("public/laplace/product/renderer.js", "utf8");
  assert.match(bundle, /events-list-wrap/);
  assert.match(bundle, /gift-sticky-bar/);
  assert.match(bundle, /context-menu/);
  assert.match(bundle, /scroll-latest/);
  assert.match(bundle, /data-compatible-fallback-id/);
  assert.doesNotMatch(bundle, /pinnedMessage|展开置顶/);
});

test("正式 React 宿主与发布 product iframe 完成握手、渲染、稳定 ID 和动作闭环", async () => {
  const { dom, restore } = installDom();
  const root = createRoot(dom.window.document.getElementById("root"));
  const actions = [], menus = [], scrollReplies = [];
  try {
    await ReactAct(async () => root.render(React.createElement(modules.surface.LaplaceProductSurface, {
      descriptor, events: [{ ...sourceEvent("e1"), text: "查看 BV1xx411c7mD" }], stickyItems: [{ event: sourceEvent("e2") }],
      tickerPosition: "bottom", rate: 8, renderMode: "dashboard", enableBilibiliVideoLinks: true,
      dispatch: (eventId, action) => { actions.push([eventId, action]); return true; },
      onContextMenu: request => menus.push(request),
    })));
    const frame = dom.window.document.querySelector("iframe");
    const child = frame.contentWindow;
    child.document.open(); child.document.write('<!doctype html><html><body><div id="root"></div></body></html>'); child.document.close();
    child.history.replaceState({}, "", `${frame.src}&qa=1`);
    child.Element.prototype.getAnimations=()=>[];
    child.ResizeObserver = class { observe() {} disconnect() {} };
    child.TextEncoder = globalThis.TextEncoder;
    child.requestAnimationFrame = callback => { callback(0); return 1; };
    child.cancelAnimationFrame = () => {};
    const scrollCalls = [];
    let locatedEventId;
    child.HTMLElement.prototype.scrollTo = function (options) { scrollCalls.push(options); if (typeof options === "object" && Number.isFinite(options.top)) this.scrollTop = options.top; };
    child.HTMLElement.prototype.scrollIntoView = function () { locatedEventId = this.dataset.eventId; };
    child.CSS ??= {}; child.CSS.escape = value => String(value).replaceAll('"', '\\"');
    dom.window.postMessage = data => { if (data.type === "scroll-state") scrollReplies.push(data); dom.window.dispatchEvent(new dom.window.MessageEvent("message", { source: child, origin: dom.window.location.origin, data: JSON.parse(JSON.stringify(data)) })); };
    const hostMessages = [];
    child.postMessage = data => hostMessages.push(data);
    child.eval(readFileSync("public/laplace/product/renderer.js", "utf8"));
    const generation = Number(new URL(frame.src).searchParams.get("generation"));
    dom.window.dispatchEvent(new dom.window.MessageEvent("message", { source: child, origin: dom.window.location.origin, data: { channel: "bb-laplace", version: 1, type: "ready", generation, sequence: 0 } }));
    await ReactAct(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    const hostRender = hostMessages.find(message => message.type === "render");
    assert.equal(modules.bridge.isLaplaceRenderMessage(hostRender), true);
    assert.equal(hostRender.generation, child.__laplaceQA.snapshot().generation);
    assert.equal(child.__laplaceQA.snapshot().sequence, -1);
    assert.equal(child.__laplaceQA.renderSerialized(JSON.stringify(hostRender)), true);
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(child.__laplaceQA.snapshot().sequence, hostRender.sequence);
    const viewport = child.document.querySelector(".event-list .scroll-area");
    const target = child.document.querySelector('.event-list [data-event-id="e1"]');
    viewport.dispatchEvent(new child.MouseEvent("pointerdown", { bubbles: true }));
    child.dispatchEvent(new child.MouseEvent("pointerup", { bubbles: true }));
    viewport.dispatchEvent(new child.Event("scroll", { bubbles: true }));
    await ReactAct(async () => new Promise(resolve => setTimeout(resolve, 0)));
    assert.equal(scrollReplies.at(-1)?.userInitiated, false);
    viewport.dispatchEvent(new child.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    viewport.dispatchEvent(new child.Event("scroll", { bubbles: true }));
    await ReactAct(async () => new Promise(resolve => setTimeout(resolve, 0)));
    assert.equal(scrollReplies.at(-1)?.userInitiated, true);
    viewport.scrollTop = 50;
    viewport.getBoundingClientRect = () => ({ top: 20, bottom: 220, left: 0, right: 300, width: 300, height: 200, x: 0, y: 20, toJSON() {} });
    target.getBoundingClientRect = () => ({ top: 120, bottom: 160, left: 0, right: 300, width: 300, height: 40, x: 0, y: 120, toJSON() {} });
    child.__laplaceQA.dispatchControlSerialized(JSON.stringify({ channel: "bb-laplace", version: 1, type: "control", generation, action: "restore-scroll", eventId: "e1", scrollTop: 12, anchorOffset: 3, followingLatest: false }));
    assert.equal(viewport.scrollTop, 147);
    child.__laplaceQA.dispatchControlSerialized(JSON.stringify({ channel: "bb-laplace", version: 1, type: "control", generation, action: "locate", eventId: "e1" }));
    assert.equal(locatedEventId, "e1");
    assert.deepEqual(JSON.parse(JSON.stringify(child.__laplaceQA.snapshot().controlState)), { followingLatest: false, locatedEventId: "e1", restoredEventId: "e1", restoredAnchorOffset: 3 });
    const wrap = child.document.querySelectorAll(".events-list-wrap");
    assert.equal(wrap.length, 1);
    assert.equal(wrap[0].querySelectorAll(":scope > .event-list").length, 1);
    assert.equal(wrap[0].querySelectorAll(":scope > .gift-sticky-bar").length, 1);
    assert.equal(wrap[0].lastElementChild.classList.contains("gift-sticky-bar"), true);
    assert.equal(wrap[0].classList.contains("reduced-motion"), true);
    assert.equal(child.document.querySelector("main").dataset.page, "dashboard");
    assert.equal(child.document.querySelector(".event-list [data-event-id]").dataset.eventId, "e1");
    const video = child.document.querySelector('a[data-laplace-video-link]');
    assert.equal(video?.href, "https://www.bilibili.com/video/BV1xx411c7mD");
    video.addEventListener("click", event => event.preventDefault());
    video.dispatchEvent(new child.MouseEvent("click", { bubbles: true, cancelable: true }));
    const username = child.document.querySelector(".event-list .username,.event-list .username-text");
    username?.dispatchEvent(new child.MouseEvent("click", { bubbles: true }));
    const row = child.document.querySelector(".event-list [data-event-id]");
    row.dispatchEvent(new child.MouseEvent("contextmenu", { bubbles: true, clientX: 12, clientY: 18 }));
    await ReactAct(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    assert.equal(actions.some(([eventId, action]) => eventId === "e1" && action?.type === "open-link" && action.href.endsWith("/BV1xx411c7mD")), true);
    if (username) assert.equal(actions.some(([eventId, action]) => eventId === "e1" && action === "filter-user"), true);
    assert.equal(menus[0].eventId, "e1");
    child.__laplaceQA.dispatchControlSerialized(JSON.stringify({ channel: "bb-laplace", version: 1, type: "control", generation, action: "restore-scroll", eventId: "e1", scrollTop: 12, anchorOffset: 3, followingLatest: false }));
    const repliesBeforeProjection = scrollReplies.length;
    const plainRender = { ...hostRender, sequence: hostRender.sequence + 1, events: [{ ...hostRender.events[0], message: "普通正文" }] };
    assert.equal(child.__laplaceQA.renderSerialized(JSON.stringify(plainRender)), true);
    await flushUntil(() => scrollReplies.length > repliesBeforeProjection);
    assert.equal(child.document.querySelector('a[data-laplace-video-link]'), null);
    assert.match(child.document.querySelector(".event-list").textContent, /普通正文/);
    assert.ok(scrollReplies.length > repliesBeforeProjection);
    assert.doesNotMatch(child.document.querySelector(".event-list").textContent, /BV1xx411c7mD/);

    const linkedAgain = { ...hostRender, sequence: hostRender.sequence + 2 };
    assert.equal(child.__laplaceQA.renderSerialized(JSON.stringify(linkedAgain)), true);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.ok(child.document.querySelector('a[data-laplace-video-link]'));
    assert.equal(child.__laplaceQA.renderSerialized(JSON.stringify({ ...linkedAgain, sequence: hostRender.sequence + 3, enableBilibiliVideoLinks: false })), true);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(child.document.querySelector('a[data-laplace-video-link]'), null);
    assert.match(child.document.querySelector(".event-list").textContent, /BV1xx411c7mD/);

    const beforeAppend = scrollCalls.length;
    child.__laplaceQA.dispatchControlSerialized(JSON.stringify({ channel: "bb-laplace", version: 1, type: "control", generation, action: "restore-scroll", eventId: "e1", scrollTop: 12, anchorOffset: 3, followingLatest: true }));
    assert.equal(child.__laplaceQA.renderSerialized(JSON.stringify({ ...hostRender, sequence: hostRender.sequence + 4, events: [...hostRender.events, { ...hostRender.events[0], id: "e3", message: "新增正文" }], layout: [...hostRender.layout, { kind: "source", eventId: "e3" }] })), true);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.ok(scrollCalls.length > beforeAppend);
    assert.equal(child.__laplaceQA.snapshot().controlState.followingLatest, true);

    assert.equal(child.__laplaceQA.renderSerialized(JSON.stringify({ ...hostRender, sequence: hostRender.sequence + 5, events: [], stickyEvents: [], layout: [] })), true);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(child.document.querySelector('a[data-laplace-video-link]'), null);
    assert.equal(child.document.querySelector(".event-list [data-event-id]"), null);
  } finally { await ReactAct(async () => root.unmount()); restore(); }
});

test("正式宿主与发布 iframe 通过真实消息通道跨窗恢复锚点并恢复后续跟随", async () => {
  const { dom, restore } = installDom();
  const root = createRoot(dom.window.document.getElementById("root"));
  const events = Array.from({ length: 240 }, (_, index) => sourceEvent(`e${index}`));
  const parentToChild = [], childToParent = [], scrollCalls = [], hostScrollStates = [];
  const flush = () => ReactAct(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  try {
    const surface = nextEvents => React.createElement(modules.surface.LaplaceProductSurface, { descriptor, events: nextEvents, onScrollState: state => hostScrollStates.push(state) });
    await ReactAct(async () => root.render(surface(events)));
    const frame = dom.window.document.querySelector("iframe");
    const child = frame.contentWindow;
    child.document.open(); child.document.write('<!doctype html><html><body><div id="root"></div></body></html>'); child.document.close();
    child.history.replaceState({}, "", `${frame.src}&qa=1`);
    child.Element.prototype.getAnimations=()=>[];
    child.ResizeObserver = class { observe() {} disconnect() {} };
    child.TextEncoder = globalThis.TextEncoder;
    child.requestAnimationFrame = callback => { callback(0); return 1; };
    child.cancelAnimationFrame = () => {};
    child.HTMLElement.prototype.scrollTo = function (options) { scrollCalls.push(options); if (typeof options === "object" && Number.isFinite(options.top)) this.scrollTop = options.top; };
    child.HTMLElement.prototype.scrollIntoView = function () {};
    child.CSS ??= {}; child.CSS.escape = value => String(value).replaceAll('"', '\\"');
    child.postMessage = data => {
      const cloned = child.JSON.parse(child.JSON.stringify(data)); parentToChild.push(JSON.parse(JSON.stringify(cloned)));
      child.queueMicrotask(() => child.dispatchEvent(new child.MessageEvent("message", { source: child.parent, origin: dom.window.location.origin, data: cloned })));
    };
    dom.window.postMessage = data => {
      const cloned = JSON.parse(JSON.stringify(data)); childToParent.push(cloned);
      dom.window.queueMicrotask(() => dom.window.dispatchEvent(new dom.window.MessageEvent("message", { source: child, origin: dom.window.location.origin, data: cloned })));
    };
    await ReactAct(async () => { child.eval(readFileSync("public/laplace/product/renderer.js", "utf8")); await new Promise(resolve => setTimeout(resolve, 100)); });
    await ReactAct(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });

    assert.ok(parentToChild.some(message => message.type === "render" && message.events.some(event => event.id === "e239")));
    assert.ok(childToParent.some(message => message.type === "rendered"));
    const viewport = child.document.querySelector(".event-list .scroll-area");
    Object.defineProperties(viewport, { scrollHeight: { configurable: true, value: 2000 }, clientHeight: { configurable: true, value: 500 }, offsetHeight: { configurable: true, value: 500 } });
    viewport.getBoundingClientRect = () => ({ top: 20, bottom: 520, left: 0, right: 300, width: 300, height: 500, x: 0, y: 20, toJSON() {} });
    for (const row of child.document.querySelectorAll('.event-list [data-event-id]')) {
      const index = Number(row.dataset.eventId.slice(1));
      row.getBoundingClientRect = () => index < 180
        ? ({ top: 0, bottom: 10, left: 0, right: 300, width: 300, height: 10, x: 0, y: 0, toJSON() {} })
        : ({ top: 37 + (index - 180) * 40, bottom: 77 + (index - 180) * 40, left: 0, right: 300, width: 300, height: 40, x: 0, y: 37, toJSON() {} });
    }
    viewport.scrollTop = 10;
    await ReactAct(async () => { viewport.dispatchEvent(new child.WheelEvent("wheel", { bubbles: true })); viewport.dispatchEvent(new child.Event("scroll", { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 60)); });

    const crossWindowRender = parentToChild.filter(message => message.type === "render").at(-1);
    assert.ok(crossWindowRender.events.some(event => event.id === "e120"));
    await flushUntil(() => parentToChild.some(message => message.action === "restore-scroll" && message.eventId === "e180"));
    const crossWindowRestore = parentToChild.filter(message => message.action === "restore-scroll").at(-1);
    assert.equal(crossWindowRestore.eventId, "e180");
    assert.equal(crossWindowRestore.anchorOffset, 17);
    assert.equal(crossWindowRestore.followingLatest, false);
    const restoredState = JSON.parse(JSON.stringify(child.__laplaceQA.snapshot().controlState));
    assert.equal(restoredState.restoredEventId, "e180");
    assert.equal(restoredState.restoredAnchorOffset, 17);

    const currentViewport = child.document.querySelector(".event-list .scroll-area");
    Object.defineProperties(currentViewport, { scrollHeight: { configurable: true, value: 2000 }, clientHeight: { configurable: true, value: 500 }, offsetHeight: { configurable: true, value: 500 } });
    currentViewport.scrollTop = 1500;
    await ReactAct(async () => { currentViewport.dispatchEvent(new child.WheelEvent("wheel", { bubbles: true })); currentViewport.dispatchEvent(new child.Event("scroll", { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 60)); });
    const latestViewport = child.document.querySelector(".event-list .scroll-area");
    Object.defineProperties(latestViewport, { scrollHeight: { configurable: true, value: 2000 }, clientHeight: { configurable: true, value: 500 }, offsetHeight: { configurable: true, value: 500 } });
    latestViewport.scrollTop = 1500;
    await ReactAct(async () => { latestViewport.dispatchEvent(new child.WheelEvent("wheel", { bubbles: true })); latestViewport.dispatchEvent(new child.Event("scroll", { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 30)); });
    assert.equal(hostScrollStates.at(-1).followingLatest, true);

    await ReactAct(async () => root.render(surface([...events, sourceEvent("e240")])));
    await flush();
    assert.ok(parentToChild.filter(message => message.type === "render").at(-1).events.some(event => event.id === "e240"));
    assert.ok(child.document.querySelector('[data-event-id="e240"]'));
    assert.equal(child.document.querySelector(".event-list .scroll-area").scrollTop, 1500);
  } finally { await ReactAct(async () => root.unmount()); restore(); }
});

test("只读LAPLACE等待源帧，不补生成静态样例", () => {
  const document = modules.adapters.createCompatibleThemeModeAdapter("laplace").createBuiltinTheme();
  const html = renderToStaticMarkup(React.createElement(modules.register.LaplacePreview, { document, thumbnail: false, previewMode: "static", previewFrame: { epoch: 0 } }));
  assert.match(html, /data-laplace-sample-count="0"/);
});


test("三种预览不提供进场特效，普通进房互动保留",()=>{
  for(const mode of ["static","design"]){
    const samples=modules.samples.getOriginalSamples(mode);
    assert(!samples.some(event=>event.type==="entry-effect"));
    assert(samples.some(event=>event.type==="interaction"));
  }
  const enabledTypes=new Set(["entry-effect","message","interaction"]);
  assert(!modules.samples.originalSimulationCandidates(enabledTypes).some(event=>event.type==="entry-effect"));
  assert.equal(modules.samples.generateOriginalSimulationEvent({enabledTypes:new Set(["entry-effect"])}),null);
});
