import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

let vite;
let bridge;
let surface;

test.before(async () => {
  vite = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-blivechatExternalHtml.test.mjs", configFile: false, esbuild: { jsx: "automatic" }, optimizeDeps: {include:[], noDiscovery: true }, server: { middlewareMode: true, watch: null }, appType: "custom" });
  bridge = await vite.ssrLoadModule("/src/compat/blivechat/externalHtmlBridge.ts");
  surface = await vite.ssrLoadModule("/src/compat/blivechat/BlivechatExternalHtmlSurface.tsx");
});

test.after(async () => vite?.close());

test("外部 HTML 只接受不含用户名密码的绝对 HTTP(S) 地址", () => {
  assert.equal(bridge.normalizeBlivechatExternalHtmlUrl("https://example.test/theme/index.html"), "https://example.test/theme/index.html");
  assert.equal(bridge.normalizeBlivechatExternalHtmlUrl("http://127.0.0.1:8080/index.html"), "http://127.0.0.1:8080/index.html");
  for (const value of ["/local/index.html", "file:///tmp/index.html", "C:\\theme", "https://user:pass@example.test/a", "javascript:alert(1)"]) {
    assert.throws(() => bridge.normalizeBlivechatExternalHtmlUrl(value));
  }
});

test("真实 SDK 握手前不发送事件，握手后发送初始化并重放快照", () => {
  const sent = [];
  const child = { postMessage: message => sent.push(message) };
  const host = bridge.createBlivechatExternalHtmlBridge({
    url: "https://example.test/theme/index.html",
    childWindow: child,
    config: { showGiftName: false, mergeSimilarDanmaku: false, mergeGift: false, maxNumber: 50 },
    snapshot: [{ id: "old", type: 0 }],
  });
  host.add({ id: "before", type: 0 });
  assert.deepEqual(sent, []);
  assert.equal(host.receive({ source: {}, data: { type: "blcTemplateConnect" } }), false);
  assert.equal(host.receive({ source: child, data: { type: "unknown" } }), false);
  assert.equal(host.receive({ source: child, data: { type: "blcTemplateConnect" } }), true);
  assert.equal(sent[0].type, "blcInit");
  assert.equal(sent[0].data.sdkVersion, "1.0.1");
  assert.deepEqual(sent[1], { type: "blcAddMsg", data: { id: "old", type: 0 } });
});

test("握手后桥接增删改、主题 CSS，并在重连时重放当前快照", () => {
  const sent = [];
  const child = { postMessage: message => sent.push(message) };
  const host = bridge.createBlivechatExternalHtmlBridge({ url: "https://example.test/index.html", childWindow: child, config: { showGiftName: true, mergeSimilarDanmaku: false, mergeGift: false, maxNumber: 20 }, snapshot: [] });
  host.receive({ source: child, data: { type: "blcTemplateConnect" } });
  host.add({ id: "a", type: 0 });
  host.update("a", { translation: "译文" });
  host.remove(["a"]);
  host.injectCss(".x{color:red}");
  assert.deepEqual(sent.slice(1), [
    { type: "blcAddMsg", data: { id: "a", type: 0 } },
    { type: "blcUpdateMsg", data: { id: "a", newValuesObj: { translation: "译文" } } },
    { type: "blcDelMsgs", data: { ids: ["a"] } },
    { type: "blcInjectCss", data: { injectCssUrls: [], injectCss: ".x{color:red}" } },
  ]);
  sent.length = 0;
  host.disconnect();
  host.replaceSnapshot([{ id: "b", type: 1 }]);
  host.receive({ source: child, data: { type: "blcTemplateConnect" } });
  assert.deepEqual(sent.map(item => item.type), ["blcInit", "blcAddMsg"]);
  assert.equal(sent[1].data.id, "b");
});

test("已连接宿主热注入 CSS，配置留到真实重连的 init 使用且不主动销毁握手", () => {
  const sent = [];
  const child = { postMessage: message => sent.push(message) };
  const host = bridge.createBlivechatExternalHtmlBridge({ url: "https://example.test/index.html", childWindow: child, config: { showGiftName: false, mergeSimilarDanmaku: false, mergeGift: false, maxNumber: 20 }, snapshot: [{ id: "a", type: 0 }] });
  host.receive({ source: child, data: { type: "blcTemplateConnect" } });
  sent.length = 0;
  host.injectCss(".next{}");
  host.updateConfig({ showGiftName: true, mergeSimilarDanmaku: false, mergeGift: false, maxNumber: 30 });
  assert.equal(host.connected, true);
  assert.deepEqual(sent.map(item => item.type), ["blcInjectCss"]);
  host.disconnect(); host.receive({ source: child, data: { type: "blcTemplateConnect" } });
  assert.equal(sent[1].type, "blcInit"); assert.equal(sent[1].data.config.maxNumber, 30);
});

test("预览未完成握手时不能另存或应用，成功顺序为预览、另存、应用", async () => {
  const actions = [];
  const flow = bridge.createBlivechatExternalHtmlFlow({
    save: async document => actions.push(`save:${document.themeId}`),
    apply: async document => actions.push(`apply:${document.themeId}`),
  });
  flow.beginPreview("https://example.test/index.html");
  await assert.rejects(() => flow.saveAndApply({ themeId: "external" }), /握手/);
  flow.markHandshakeSucceeded();
  await flow.saveAndApply({ themeId: "external" });
  assert.deepEqual(actions, ["save:external", "apply:external"]);
});

test("每个 target/targetId 只有一个宿主，目标之间不共享快照", () => {
  assert.equal(bridge.blivechatExternalTargetKey("live", "live"), bridge.blivechatExternalTargetKey("live", "live"));
  assert.notEqual(bridge.blivechatExternalTargetKey("live", "live"), bridge.blivechatExternalTargetKey("windows", "windows"));
  const live = bridge.createBlivechatExternalSnapshotSync({ add() {}, update() {}, remove() {}, replaceSnapshot() {} });
  const windows = bridge.createBlivechatExternalSnapshotSync({ add() {}, update() {}, remove() {}, replaceSnapshot() {} });
  live.replace([{ id: "live-1", type: 0 }]); windows.replace([{ id: "window-1", type: 0 }]);
  assert.deepEqual(live.snapshot().map(item => item.id), ["live-1"]);
  assert.deepEqual(windows.snapshot().map(item => item.id), ["window-1"]);
});

test("快照同步只发送稳定 ID 的增删改，初始握手前不发布", () => {
  const calls = [];
  let replaySnapshot = [];
  const sync = bridge.createBlivechatExternalSnapshotSync({
    add: value => calls.push(["add", value.id]),
    update: (id, value) => calls.push(["update", id, value.content]),
    remove: ids => calls.push(["remove", ...ids]),
    replaceSnapshot: values => { replaySnapshot = values; },
  });
  sync.setConnected(false);
  sync.replace([{ id: "a", type: 0, content: "一" }]);
  assert.deepEqual(calls, []);
  assert.deepEqual(replaySnapshot.map(item => item.id), ["a"]);
  calls.length = 0;
  sync.setConnected(true);
  sync.replace([{ id: "a", type: 0, content: "二" }, { id: "b", type: 1 }]);
  sync.replace([{ id: "b", type: 1 }]);
  assert.deepEqual(calls, [["update", "a", "二"], ["add", "b"], ["remove", "a"]]);
});

test("现场快照完全采用现场消费者输入，不读取副窗口 N 或到期状态", () => {
  const live = bridge.createBlivechatExternalSnapshotSync({ add() {}, update() {}, remove() {}, replaceSnapshot() {} });
  const allLiveEvents = Array.from({ length: 8 }, (_, index) => ({ id: `live-${index}`, type: 0 }));
  live.replace(allLiveEvents);
  assert.equal(live.snapshot().length, 8);
});

test("只有经过 SDK 预览标记的文档才进入外部 HTML 路径", () => {
  assert.equal(bridge.blivechatExternalHtmlUrlOf({ metadata: { externalHtml: { url: "https://example.test/theme", sdk: "blivechat-1.0.1", verified: true } } }), "https://example.test/theme");
  assert.equal(bridge.blivechatExternalHtmlUrlOf({ metadata: { externalHtml: { url: "https://example.test/theme", sdk: "blivechat-1.0.1", verified: false } } }), null);
  assert.equal(bridge.blivechatExternalHtmlUrlOf({ metadata: { sourceUrl: "https://example.test/theme" } }), null);
});

test("SDK 快照保留翻译及大航海数量、单位、价格真实字段", () => {
  const base = { id: "e", reactKey: "stable", roomId: 1, ts: 1000, user: { uid: 2, uname: "用户" } };
  const messages = surface.projectBlivechatExternalSnapshot([
    { ...base, msgType: 2, sc: { price: 30, message: "正文", trans: "translation" } },
    { ...base, id: "g", reactKey: "guard", msgType: 3, guard: { level: 1, count: 3, unit: "月", price: 198000, priceRmb: 198, action: "续费" } },
  ]);
  assert.deepEqual(messages[0], { id: "stable", type: 3, avatarUrl: "", time: 1000, authorName: "用户", authorNamePronunciation: "", authorType: 0, privilegeType: 0, uid: 2, medalLevel: 0, medalName: "", price: 30, content: "正文", translation: "translation" });
  assert.equal(messages[1].num, 3); assert.equal(messages[1].unit, "月"); assert.equal(messages[1].price, 198); assert.equal(messages[1].title, "续费3月舰长");
});

test("fixture 的真实 connect-before-load 顺序会为新 document 重新 init 并重放", () => {
  const sent = [];
  const childWindow = { postMessage(message) { sent.push(message); } };
  const host = bridge.createBlivechatExternalHtmlBridge({ url: "https://example.test/theme", childWindow, config: { showGiftName: false, mergeSimilarDanmaku: false, mergeGift: false, maxNumber: 50 }, snapshot: [{ id: "a", type: 0 }] });
  const cycle = surface.createBlivechatExternalLoadCycle(host);
  cycle.connect({ source: childWindow, data: { type: "blcTemplateConnect" } }); cycle.load();
  cycle.connect({ source: childWindow, data: { type: "blcTemplateConnect" } }); cycle.load();
  assert.equal(sent.filter(item => item.type === "blcInit").length, 2);
  assert.equal(sent.filter(item => item.type === "blcAddMsg").length, 2);
});

test("外部 HTML target 宿主保留 active 并以 request revision 单独挂载候选", async () => {
  const fs = await import("node:fs");
  const source = fs.readFileSync("src/compat/blivechat/BlivechatExternalHtmlTarget.tsx", "utf8");
  assert.match(source, /active.*candidate|candidate.*active/s);
  assert.match(source, /activeKey[\s\S]*candidateKey/);
  assert.match(source, /holdUntilCommit/);
});

test("SDK 1.0.1 CSS 不叠加，样式变化由新候选 iframe 替换", async () => {
  const fs = await import("node:fs");
  const surfaceSource = fs.readFileSync("src/compat/blivechat/BlivechatExternalHtmlSurface.tsx", "utf8");
  assert.doesNotMatch(surfaceSource, /hostRef\.current\?\.injectCss\(descriptor\.css\)/);
  const fixture = fs.readFileSync("tests/fixtures/compat/blc-original/sdk-document.html", "utf8");
  assert.match(fixture, /id=['"]blivechat-theme-css['"]/);
  assert.match(fixture, /getElementById\(['"]blivechat-theme-css['"]\)/);
});

test('无关窗口消息不能断开已连接的外部 HTML',()=>{const childWindow={postMessage(){}};const host=bridge.createBlivechatExternalHtmlBridge({url:'https://example.test/a',childWindow,config:{},snapshot:[]});const cycle=surface.createBlivechatExternalLoadCycle(host);cycle.connect({source:childWindow,data:{type:'blcTemplateConnect'}});cycle.load();assert.equal(cycle.connect({source:{},data:{type:'ready'}}),false);assert.equal(host.connected,true);});

test('同版本 BLC OBS 再发布使用新的外部页面身份',async()=>{const{buildBlivechatObsSnapshot}=await vite.ssrLoadModule('/src/compat/blivechat/obs.ts');const{resolveObsRenders}=await vite.ssrLoadModule('/src/obs/obsRenders.ts');const{getThemeModeAdapter}=await vite.ssrLoadModule('/src/themes/themeModeAdapters.ts');const doc=getThemeModeAdapter('blivechat').createBuiltinTheme();doc.metadata.externalHtml={url:'https://example.test/theme',sdk:'blivechat-1.0.1',verified:true};const ctx={target:'obs',targetId:'one',roomId:'1',displayScale:1};const a=buildBlivechatObsSnapshot(doc,ctx),b=buildBlivechatObsSnapshot(doc,ctx);assert.equal(a.document.revision,b.document.revision);assert.notEqual(resolveObsRenders(a).main.externalHtml.instanceId,resolveObsRenders(b).main.externalHtml.instanceId);});

test('OBS 样例帧复用已发布外部页面身份',async()=>{const{buildBlivechatObsSnapshot}=await vite.ssrLoadModule('/src/compat/blivechat/obs.ts');const{obsSampleDisplay}=await vite.ssrLoadModule('/src/obs/obsSamples.ts');const{DEFAULT_EVENT_WINDOW_PREFERENCES:preferences}=await vite.ssrLoadModule('/src/windows/eventWindowPreferences.ts');const{getThemeModeAdapter}=await vite.ssrLoadModule('/src/themes/themeModeAdapters.ts');const doc=getThemeModeAdapter('blivechat').createBuiltinTheme();const snapshot=buildBlivechatObsSnapshot(doc,{target:'obs',targetId:'one',roomId:'1',displayScale:1});const state={snapshot,preferences,events:[],sticky:[]};assert.equal(obsSampleDisplay(state,true).snapshot.publicationId,snapshot.publicationId);assert.equal(obsSampleDisplay({...state,events:[{}]},true).snapshot.publicationId,snapshot.publicationId);});
