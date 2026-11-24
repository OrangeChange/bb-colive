import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { after, before } from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { MsgType } from "../src/protocol/eventTypeCodes.ts";

const rootPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { JSDOM } = require("../vendor/blivechat/node_modules/jsdom");
const { buildSync } = require("esbuild");
const entryBundle = buildSync({ entryPoints: [path.join(rootPath, "public/openlive/entry.mjs")], bundle: true, write: false, format: "iife", platform: "browser", logLevel: "silent" }).outputFiles[0].text;
const readSource = name => fs.readFileSync(path.join(rootPath, "public/openlive", name), "utf8");

let vite;
let React;
let act;
let createRoot;
let BlivechatSourceSurface;
let createOpenLiveSourceConfig;
let projectOpenLiveCallback;
let CompatibleThemePreview;
let getCompatibleThemeEditingSurface;
let createCompatibleThemeModeAdapter;
let createOpenLiveThemeRuntime;
let compatibleSelectorFor;
let renderToStaticMarkup;
let prepareOpenLivePreviewRecords;
let filterOpenLivePreviewRecords;
let OpenLiveSourcePreview;

before(async () => {
  vite = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-openliveSourceSurface.test.mjs",optimizeDeps:{noDiscovery:true,include:[]}, root: rootPath, configFile: false, esbuild: { jsx: "automatic" }, server: { middlewareMode: true, watch: null }, appType: "custom", logLevel: "silent" });
  ({ BlivechatSourceSurface } = await vite.ssrLoadModule("/src/compat/blivechat/BlivechatSourceSurface.tsx"));
  ({ createOpenLiveSourceConfig, projectOpenLiveCallback, createOpenLiveThemeRuntime } = await vite.ssrLoadModule("/src/compat/openlive/index.tsx"));
  ({ CompatibleThemePreview, getCompatibleThemeEditingSurface } = await vite.ssrLoadModule("/src/components/CompatibleThemePreview.tsx"));
  ({ createCompatibleThemeModeAdapter } = await vite.ssrLoadModule("/src/themes/themeModeAdapters.ts"));
  ({ compatibleSelectorFor } = await vite.ssrLoadModule("/src/themes/compatManagedCss.ts"));
  ({ prepareOpenLivePreviewRecords, filterOpenLivePreviewRecords, OpenLiveSourcePreview } = await vite.ssrLoadModule("/src/compat/openlive/OpenLiveSourceSurface.tsx"));
  await vite.ssrLoadModule("/src/compat/openlive/register.tsx");
  React = (await import("react")).default;
  ({ act } = await import("react"));
  ({ createRoot } = await import("react-dom/client"));
  ({ renderToStaticMarkup } = await import("react-dom/server"));
});

test("正式开放版预览包装直接挂载可执行来源文档并闭合 ready 握手", async () => {
  const parent = new JSDOM('<!doctype html><div id="root"></div>', { url: "https://bb.invalid/", pretendToBeVisual: true });
  const previous = { location: globalThis.location, window: globalThis.window, document: globalThis.document, Element: globalThis.Element, Node: globalThis.Node, MutationObserver: globalThis.MutationObserver, fetch: globalThis.fetch, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  const batch=JSON.parse(fs.readFileSync(path.join(rootPath,'tests/fixtures/compat/blc-open/original-fixed-batch.json'),'utf8'));
  const likes=JSON.parse(fs.readFileSync(path.join(rootPath,'tests/fixtures/compat/blc-open/constructed-like-batch.json'),'utf8'));
  Object.assign(globalThis, { location: parent.window.location, window: parent.window, document: parent.window.document, Element: parent.window.Element, Node: parent.window.Node, MutationObserver: parent.window.MutationObserver, fetch: async url=>({ok:true,json:async()=>structuredClone(String(url).includes('constructed-like')?likes:batch)}), IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(parent.window.document.getElementById("root"));
  const surface = getCompatibleThemeEditingSurface("blivechat-open");
  const document = createCompatibleThemeModeAdapter("blivechat-open").createBuiltinTheme();
  const { DEFAULT_STYLE_PREVIEW_POLICY } = await vite.ssrLoadModule("/src/preview/stylePreviewPolicy.ts");
  let child; let inspection = null;
  try {
    await act(async () => root.render(React.createElement(CompatibleThemePreview, { document, capability: surface.capability, renderer: surface.renderer, composeCss: surface.composeCss, previewPolicy: { ...DEFAULT_STYLE_PREVIEW_POLICY, giftThreshold: 0 }, previewMode: "design", selection: { event: "all", identity: "all", placement: "main", part: "message" }, revealPart: "message", onEditorInspection: value => { inspection = value; } })));
    assert.equal(surface.ownsPreviewDocument,true);
    const frames=parent.window.document.querySelectorAll('iframe');assert.equal(frames.length,1);assert.equal(frames[0].getAttribute('src'),'/openlive/renderer.html');
    const frame=frames[0],sent=[],replies=[];
    child=new JSDOM(readSource('renderer.html'),{url:'https://bb.invalid/openlive/renderer.html?qa=1',runScripts:'outside-only',pretendToBeVisual:true});
    const proxy={postMessage:message=>{replies.push(message);parent.window.dispatchEvent(new parent.window.MessageEvent('message',{source:frame.contentWindow,origin:parent.window.location.origin,data:message}));}};
    Object.defineProperty(child.window,'parent',{value:proxy});child.window.TextEncoder=global.TextEncoder;child.window.TextDecoder=global.TextDecoder;child.window.setInterval=()=>1;child.window.clearInterval=()=>{};
    frame.contentWindow.postMessage=message=>{sent.push(message);child.window.dispatchEvent(new child.window.MessageEvent('message',{source:proxy,origin:child.window.location.origin,data:message}));};
    await act(async()=>{child.window.eval(readSource('renderer.js'));child.window.eval(entryBundle);for(let index=0;index<12;index+=1)await new Promise(resolve=>setTimeout(resolve,0));});
    assert.ok(sent.some(message=>message.command==='config'));
    assert.ok(sent.find(message=>message.command==='config').data.maxNumber >= 33);
    const appearanceCss = sent.find(message=>message.command==='css').data.appearanceCss;
    assert.match(appearanceCss, /#item-scroller[^}]*overflow-y:\s*auto\s*!important/);
    assert.match(appearanceCss, /overflow-y:auto/);
    assert.match(appearanceCss, /#item-scroller\.animated\.yt-live-chat-item-list-renderer #items\.yt-live-chat-item-list-renderer\{position:relative!important/);
    const fixedPreview=(await import('../src/compat/blivechat/previewRecords.mjs')).createBlivechatFixedPreviewRecords('blivechat-open','design');
    assert.ok(sent.some(message=>message.command==='preview-window'&&message.data.records.length===fixedPreview.length));
    assert.ok(sent.some(message=>message.command==='preview-window'&&message.data.records.filter(record=>record.method==='onAddLike').length===fixedPreview.filter(record=>record.method==='onAddLike').length));
    assert.ok(sent.some(message=>message.command==='editor-select'&&message.data.part==='message'));
    assert.ok(sent.find(message=>message.command==='editor-select').data.selectors.message.includes('#message'));
    const mainMessageSelector=compatibleSelectorFor(surface.capability,'danmaku|all|main|message','common');
    for(let attempt=0;attempt<200;attempt++){
      await act(async()=>new Promise(resolve=>setTimeout(resolve,10)));
      if(inspection&&replies.filter(message=>message.command==='hydrated').length>=sent.filter(message=>message.command==='hydrate').length)break;
    }
    assert.ok(mainMessageSelector&&child.window.document.querySelector(mainMessageSelector),'正式能力表必须命中开放版主区正文');
    const message=child.window.document.querySelector('#message[data-compatible-editor-selected]');assert.ok(message);for(const node of child.window.document.querySelectorAll(mainMessageSelector))node.style.fontSize='23px';for(let node=message;node;node=node.parentElement)node.getBoundingClientRect=()=>({left:0,top:0,right:100,bottom:24,width:100,height:24});message.dispatchEvent(new child.window.MouseEvent('click',{bubbles:true,clientX:50,clientY:12}));await act(async()=>{const until=Date.now()+3000;while(inspection?.computed.fontSize.value!=='23px'&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,10));});assert.equal(inspection.scope.part,'message');assert.equal(inspection.scope.placement,'main');assert.equal(inspection.computed.fontSize.value,'23px');
  }finally{await act(async()=>root.unmount());child?.window.dispatchEvent(new child.window.PageTransitionEvent('pagehide',{persisted:false}));child?.window.close();Object.assign(globalThis,previous);parent.window.close();}
});

test("BLC 开放版静态、点选和动态预览使用各自的数据来源", () => {
  const surface = getCompatibleThemeEditingSurface("blivechat-open");
  const document = createCompatibleThemeModeAdapter("blivechat-open").createBuiltinTheme();
  const staticPreview = renderToStaticMarkup(React.createElement(surface.renderer, { document, thumbnail: false, previewMode: "static" }));
  const designPreview = renderToStaticMarkup(React.createElement(surface.renderer, { document, thumbnail: false, previewMode: "design" }));
  const dynamicPreview = renderToStaticMarkup(React.createElement(surface.renderer, { document, thumbnail: false, previewMode: "simulation" }));
  assert.match(staticPreview, /data-source-sample="static-fixed"/);
  assert.match(designPreview, /data-source-sample="design-fixed"/);
  assert.doesNotMatch(designPreview, /data-supplemental-sample/);
  assert.match(dynamicPreview, /data-source-sample="source-simulation"/);
});

test("BLC 开放版缩略图在载入样例前把来源列表固定到顶部", async () => {
  const parent = new JSDOM('<!doctype html><div id="root"></div>', { url: "https://bb.invalid/", pretendToBeVisual: true });
  const previous = { location: globalThis.location, window: globalThis.window, document: globalThis.document, Element: globalThis.Element, Node: globalThis.Node, MutationObserver: globalThis.MutationObserver, fetch: globalThis.fetch, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { location: parent.window.location, window: parent.window, document: parent.window.document, Element: parent.window.Element, Node: parent.window.Node, MutationObserver: parent.window.MutationObserver, fetch: async () => ({ ok: true, json: async () => ({ events: [] }) }), IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(parent.window.document.getElementById("root"));
  try {
    await act(async () => root.render(React.createElement(OpenLiveSourcePreview, { css: "", appearanceCss: "", config: {}, thumbnail: true })));
    const frame = parent.window.document.querySelector("iframe"), sent = [];
    frame.contentWindow.postMessage = message => sent.push(message);
    await act(async () => parent.window.dispatchEvent(new parent.window.MessageEvent("message", { source: frame.contentWindow, origin: parent.window.location.origin, data: { type: "bb-openlive", command: "ready" } })));
    assert.deepEqual(sent.find(message => message.command === "host")?.data, { scale: 1, tickerEnabled: false, enableBilibiliVideoLinks: false, direction: "top", contentAlignment: "top", managed: true, renderMode: "output" });
    assert.ok(sent.findIndex(message => message.command === "host") < sent.findIndex(message => message.command === "hydrate"));
  } finally { await act(async () => root.unmount()); Object.assign(globalThis, previous); parent.window.close(); }
});

test("BLC 开放版动态预览由软件公共策略裁剪容量", async () => {
  const parent = new JSDOM('<!doctype html><div id="root"></div>', { url: "https://bb.invalid/" });
  const previous = { location: globalThis.location, window: globalThis.window, document: globalThis.document, Element: globalThis.Element, Node: globalThis.Node, MutationObserver: globalThis.MutationObserver, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { location: parent.window.location, window: parent.window, document: parent.window.document, Element: parent.window.Element, Node: parent.window.Node, MutationObserver: parent.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(parent.window.document.getElementById("root"));
  const surface = getCompatibleThemeEditingSurface("blivechat-open");
  const document = createCompatibleThemeModeAdapter("blivechat-open").createBuiltinTheme();
  try {
    const { DEFAULT_STYLE_PREVIEW_POLICY: policy } = await vite.ssrLoadModule("/src/preview/stylePreviewPolicy.ts");
    await act(async () => root.render(React.createElement(surface.renderer, { document, thumbnail: false, previewMode: "simulation", previewPolicy: { ...policy, capacity: 1 } })));
    const frame = parent.window.document.querySelector("iframe");
    const sent = [];
    frame.contentWindow.postMessage = message => sent.push(message);
    await act(async () => parent.window.dispatchEvent(new parent.window.MessageEvent("message", { source: frame.contentWindow, origin: parent.window.location.origin, data: { type: "bb-openlive", command: "ready" } })));
    const now = Date.now();
    const records = ["a", "b"].map((id, index) => ({ method: "onAddText", receivedAt: now, sequence: index + 1, payload: { id, timestamp: now / 1000 } }));
    await act(async () => parent.window.dispatchEvent(new parent.window.MessageEvent("message", { source: frame.contentWindow, origin: parent.window.location.origin, data: { type: "bb-openlive", command: "preview-frame", data: { epoch: 1, records, presentation: { messages: [{id:"a"}, {id:"b"}], paidMessages: [] } } } })));
    assert.deepEqual(sent.filter(message => message.command === "presentation").at(-1).data.layout.map(row => row.eventId), ["b"]);
  } finally {
    await act(async () => root.unmount());
    Object.assign(globalThis, previous);
    parent.window.close();
  }
});

test("开放版固定预览把来源时间平移到当前时刻以保留主区和置顶栏", () => {
  const records = prepareOpenLivePreviewRecords([
    { method: "onAddText", payload: { id: "a", timestamp: 100, time: 100000 }, receivedAt: 100000 },
    { method: "onAddSuperChat", data: { id: "b", timestamp: 102, time: 102000 }, receivedAt: 102000 },
  ], 200000);
  assert.deepEqual(records, [
    { method: "onAddText", payload: { id: "a", timestamp: 198, time: 198000 }, receivedAt: 198000 },
    { method: "onAddSuperChat", data: { id: "b", timestamp: 200, time: 200000 }, receivedAt: 200000 },
  ]);
});

test("开放版关闭显示全部部件后只保留当前事件类型", () => {
  const records = [{ method: "onAddText", payload: { id: "text" } }, { method: "onAddLike", payload: { id: "like" } }, { method: "onAddGift", payload: { id: "gift" } }, { method: "onAddGift", payload: { id: "blind", blindGiftName: "盲盒" } }, { method: "onAddSuperChat", payload: { id: "sc" } }];
  assert.deepEqual(filterOpenLivePreviewRecords(records, false, "like", 1).map(record => record.payload.id), ["like"]);
  assert.deepEqual(filterOpenLivePreviewRecords(records, false, "gift-normal", 1).map(record => record.payload.id), ["gift", "blind"]);
  assert(filterOpenLivePreviewRecords(records, true, "gift", 1).some(record=>record.payload.id==="blind"));
  assert.equal(filterOpenLivePreviewRecords(records, true, "like", 1).length, 5);
});

test("开放版预览仅修改 CSS 时不重发等值 config", async () => {
  const parent=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://bb.invalid/'});const previous={location:globalThis.location,window:globalThis.window,document:globalThis.document,Element:globalThis.Element,Node:globalThis.Node,MutationObserver:globalThis.MutationObserver,IS_REACT_ACT_ENVIRONMENT:globalThis.IS_REACT_ACT_ENVIRONMENT};Object.assign(globalThis,{location:parent.window.location,window:parent.window,document:parent.window.document,Element:parent.window.Element,Node:parent.window.Node,MutationObserver:parent.window.MutationObserver,IS_REACT_ACT_ENVIRONMENT:true});
  const root=createRoot(parent.window.document.getElementById('root')),config=()=>createOpenLiveSourceConfig({skin:'none',emoticonSize:80,showGiftInfo:true});
  const render=css=>{const document=createCompatibleThemeModeAdapter('blivechat-open').createBuiltinTheme();return React.createElement((getCompatibleThemeEditingSurface('blivechat-open').renderer),{document:{...document,styles:{...document.styles,customCss:css}},thumbnail:false});};
  try{await act(async()=>root.render(render('/* one */')));const frame=parent.window.document.querySelector('iframe'),sent=[];frame.contentWindow.postMessage=message=>sent.push(message);await act(async()=>parent.window.dispatchEvent(new parent.window.MessageEvent('message',{source:frame.contentWindow,origin:parent.window.location.origin,data:{type:'bb-openlive',command:'ready'}})));const count=sent.filter(message=>message.command==='config').length;await act(async()=>root.render(render('/* two */')));assert.equal(sent.filter(message=>message.command==='config').length,count);assert.ok(sent.some(message=>message.command==='css'&&message.data.css.includes('two')));assert.deepEqual(config(),createOpenLiveSourceConfig({skin:'none',emoticonSize:80,showGiftInfo:true}));}
  finally{await act(async()=>root.unmount());Object.assign(globalThis,previous);parent.window.close();}
});

test("公共宿主严格执行 render fallback omit 三态并使用开放版标题", async () => {
  const parent=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://bb.invalid/'});const previous={location:globalThis.location,window:globalThis.window,document:globalThis.document,Element:globalThis.Element,Node:globalThis.Node,MutationObserver:globalThis.MutationObserver,IS_REACT_ACT_ENVIRONMENT:globalThis.IS_REACT_ACT_ENVIRONMENT};Object.assign(globalThis,{location:parent.window.location,window:parent.window,document:parent.window.document,Element:parent.window.Element,Node:parent.window.Node,MutationObserver:parent.window.MutationObserver,IS_REACT_ACT_ENVIRONMENT:true});
  const root=createRoot(parent.window.document.getElementById('root'));const fallback={...danmu,id:'fallback',reactKey:'fallback:1',msgType:MsgType.Interact,interactKind:'follow'};const omitted={...danmu,id:'omit',reactKey:'omit:1',msgType:MsgType.Interact,interactKind:'like',likeCount:-1};const wrongRoom={...danmu,id:'wrong-room',reactKey:'wrong-room:1',roomId:99};
  const bindingState=new Map(),records=new Map();const bindings={async load(){return[...bindingState.values()]},async bind(value){bindingState.set(value.targetId,value)},async setDisplayScale(){},async remove(){},subscribe(){return()=>{}}};const runtime=createOpenLiveThemeRuntime(bindings,{async load(){return[]},async loadTarget(id){return records.get(id)},async save(value){records.set(value.context.targetId,structuredClone(value))},async remove(){},async publish(){},subscribe(){return()=>{}}});const theme={...createCompatibleThemeModeAdapter('blivechat-open').createBuiltinTheme(),themeId:'formal-open',origin:'custom',revision:1};await runtime.publish(theme,{target:'live',targetId:'live',roomId:'42',displayScale:1});const render=runtime.resolve({target:'live',targetId:'live',roomId:42,placement:'main'}),descriptor=render.listSurface;
  try{await act(async()=>root.render(React.createElement(BlivechatSourceSurface,{descriptor,events:[danmu,omitted,fallback,wrongRoom],fallbackRenderer:event=>React.createElement('span',null,event.id)})));const frame=parent.window.document.querySelector('iframe'),sent=[];assert.equal(frame.title,'BLC 开放版事件列表');frame.contentWindow.postMessage=message=>sent.push(message);await act(async()=>parent.window.dispatchEvent(new parent.window.MessageEvent('message',{source:frame.contentWindow,origin:parent.window.location.origin,data:{type:'bb-openlive',command:'ready'}})));assert.deepEqual(sent.find(message=>message.command==='hydrate').data.records.map(record=>record.payload.id),[danmu.reactKey]);await act(async()=>parent.window.dispatchEvent(new parent.window.MessageEvent('message',{source:frame.contentWindow,origin:parent.window.location.origin,data:{type:'bb-openlive',command:'hydrated'}})));assert.deepEqual(sent.find(message=>message.command==='hydrate').data.presentation.layout.map(item=>[item.eventId,item.kind]),[[danmu.reactKey,'source'],[fallback.reactKey,'fallback']]);}
  finally{await act(async()=>root.unmount());Object.assign(globalThis,previous);parent.window.close();}
});

after(async () => vite?.close());

const danmu = {
  id: "openlive-row",
  reactKey: "openlive-row:1",
  msgType: MsgType.Danmu,
  roomId: 42,
  ts: Date.now(),
  text: "公共宿主与冻结来源文档",
  user: { uid: "7", uname: "来源用户", avatar: "", guardLevel: 0, isAdmin: false },
};

test("公共列表宿主与 compiled OpenLive 文档闭环同步配置、事件、呈现和热更新", async () => {
  const parent = new JSDOM('<!doctype html><div id="root"></div>', { url: "https://bb.invalid/", pretendToBeVisual: true });
  const previous = { location: globalThis.location, window: globalThis.window, document: globalThis.document, Element: globalThis.Element, Node: globalThis.Node, MutationObserver: globalThis.MutationObserver, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { location: parent.window.location, window: parent.window, document: parent.window.document, Element: parent.window.Element, Node: parent.window.Node, MutationObserver: parent.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(parent.window.document.getElementById("root"));
  const descriptor = css => ({
    url: "/openlive/renderer.html",
    protocol: "bb-openlive",
    css,
    appearanceCss: "#message { font-size: 22px; }",
    config: createOpenLiveSourceConfig({ skin: "none", emoticonSize: 80, showGiftInfo: true }),
    project: projectOpenLiveCallback,
  });
  let child;
  try {
    await act(async () => root.render(React.createElement(BlivechatSourceSurface, { descriptor: descriptor("/* first */"), events: [danmu], scale: 1.1 })));
    const frame = parent.window.document.querySelector("iframe"), sent = [], received = [];
    child = new JSDOM(readSource("renderer.html"), { url: "https://bb.invalid/openlive/renderer.html?qa=1", runScripts: "outside-only", pretendToBeVisual: true });
    const proxy = { postMessage: message => { received.push(message); parent.window.dispatchEvent(new parent.window.MessageEvent("message", { source: frame.contentWindow, origin: parent.window.location.origin, data: message })); } };
    Object.defineProperty(child.window, "parent", { value: proxy });
    child.window.TextEncoder = global.TextEncoder;
    child.window.TextDecoder = global.TextDecoder;
    child.window.setInterval = () => 1;
    child.window.clearInterval = () => {};
    frame.contentWindow.postMessage = message => { sent.push(message); child.window.dispatchEvent(new child.window.MessageEvent("message", { source: proxy, origin: child.window.location.origin, data: message })); };

    await act(async () => {
      child.window.eval(readSource("renderer.js"));
      child.window.eval(entryBundle);
      for (let index = 0; index < 12; index += 1) await new Promise(resolve => setTimeout(resolve, 0));
    });

    assert.ok(sent.some(message => message.command === "config" && message.data.skin === "none"));
    assert.ok(sent.some(message => message.command === "host" && message.data.scale === 1.1 && message.data.managed === true));
    assert.ok(sent.some(message => message.command === "hydrate" && message.data.records[0].payload.id === danmu.reactKey));
    assert.ok(sent.some(message => message.command === "hydrate" && message.data.presentation.layout[0].eventId === danmu.reactKey));
    assert.equal([...child.window.document.querySelectorAll('[data-compatible-event-id="openlive-row:1"] #message')].find(node => node.textContent.includes(danmu.text)).textContent, danmu.text);

    const configCount = sent.filter(message => message.command === "config").length;
    await act(async () => root.render(React.createElement(BlivechatSourceSurface, { descriptor: descriptor("/* second */"), events: [danmu, { ...danmu, id: "next", reactKey: "next:1", text: "追加" }], scale: 1.1 })));
    for (let index = 0; index < 8; index += 1) await act(async () => new Promise(resolve => setTimeout(resolve, 0)));
    assert.equal(sent.filter(message => message.command === "config").length, configCount, "普通事件与 CSS 热更新不能重发等值来源配置");
    assert.ok(sent.some(message => message.command === "event-batch" && message.data.records.length === 1 && message.data.records[0].payload.id === "next:1" && message.data.presentation.layout.at(-1).eventId === "next:1"));
    assert.match(child.window.document.querySelector("#bb-openlive-custom-css").textContent, /\/\* second \*\//);
    assert.doesNotMatch(child.window.document.querySelector("#bb-openlive-custom-css").textContent, /\/\* first \*\//);
    assert.ok(received.some(message => message.command === "presented"));
  } finally {
    await act(async () => root.unmount());
    child?.window.dispatchEvent(new child.window.PageTransitionEvent("pagehide", { persisted: false }));
    child?.window.close();
    Object.assign(globalThis, previous);
    parent.window.close();
  }
});

test("开放版固定预览保留来源头像并统一使用本地默认头像", () => {
  const records = prepareOpenLivePreviewRecords([
    { method: "onAddText", payload: { id: "a", avatarUrl: "//static.hdslb.com/images/member/noface.gif" } },
    { method: "onAddText", payload: { id: "b", avatarUrl: "https://example.invalid/custom.png" } },
  ], 1);
  assert.equal(records[0].payload.avatarUrl, "/media/noface.gif");
  assert.equal(records[1].payload.avatarUrl, "https://example.invalid/custom.png");
});

test("开放版置顶栏透明、可滚动且隐藏滚动条", () => {
  const source = fs.readFileSync(path.join(rootPath, "src/compat/openlive/css.ts"), "utf8");
  assert.match(source, /yt-live-chat-ticker-renderer[^}]*background:\s*transparent\s*;/);
  assert.match(source, /yt-live-chat-ticker-renderer > #container[^}]*overflow-x:\s*auto\s*!important/);
  assert.match(source, /yt-live-chat-ticker-renderer #items[^}]*width:\s*max-content\s*!important/);
  assert.doesNotMatch(source, /yt-live-chat-ticker-renderer #container\s*\{[^}]*background:\s*transparent\s*!important/);
  assert.match(source, /scrollbar-width:\s*none/);
});

test("开放版来源根与主列表保持透明", () => {
  const css = fs.readFileSync(path.join(rootPath, "src/compat/openlive/css.ts"), "utf8");
  assert.match(css, /html, body, #app\s*\{[^}]*background:\s*transparent\s*;/);
  assert.match(css, /--yt-live-chat-background-color:\s*transparent/);
  assert.match(css, /yt-live-chat-renderer\s*\{[\s\S]*#item-scroller[\s\S]*background:\s*transparent\s*;/);
  assert.match(css, /#item-scroller[^}]*scrollbar-width:\s*thin/);
  assert.match(css, /#item-scroller::\-webkit-scrollbar[^}]*width:\s*6px/);
  assert.match(css, /yt-live-chat-ticker-renderer[^}]*width:\s*var\(--bb-list-content-width,\s*100%\)/);
  const runtime = fs.readFileSync(path.join(rootPath, "src/compat/openlive/runtime/entry.mjs"), "utf8");
  assert.match(runtime, /--bb-list-content-width/);
  assert.match(runtime, /ResizeObserver/);
});


test("固定预览父层更新不重新装载置顶样例，重播才重置", async () => {
 const parent=new JSDOM('<!doctype html><div id="root"></div>',{url:"https://bb.invalid/"});
 const keys=['location','window','document','Element','Node','MutationObserver','IS_REACT_ACT_ENVIRONMENT'];
 const previous=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
 Object.assign(globalThis,{location:parent.window.location,window:parent.window,document:parent.window.document,Element:parent.window.Element,Node:parent.window.Node,MutationObserver:parent.window.MutationObserver,IS_REACT_ACT_ENVIRONMENT:true});
 const root=createRoot(parent.window.document.getElementById('root'));
 try {
  const props={css:'',appearanceCss:'',config:{},thumbnail:false,previewMode:'static'};
  await act(async()=>root.render(React.createElement(OpenLiveSourcePreview,props)));
  const frame=parent.window.document.querySelector('iframe'),sent=[];frame.contentWindow.postMessage=message=>sent.push(message);
  await act(async()=>parent.window.dispatchEvent(new parent.window.MessageEvent('message',{source:frame.contentWindow,origin:parent.window.location.origin,data:{type:'bb-openlive',command:'ready'}})));
  const count=()=>sent.filter(message=>message.command==='preview-window').length;
  assert.equal(count(),1);
  await new Promise(resolve=>setTimeout(resolve,20));
  await act(async()=>root.render(React.createElement(OpenLiveSourcePreview,{...props,onPreviewFrame:()=>{}})));
  assert.equal(count(),1,'父层收到呈现状态不应重置置顶动画');
  await act(async()=>root.render(React.createElement(OpenLiveSourcePreview,{...props,previewRestartKey:1})));
  assert.equal(count(),2);
 } finally {await act(async()=>root.unmount());Object.assign(globalThis,previous);parent.window.close();}
});
