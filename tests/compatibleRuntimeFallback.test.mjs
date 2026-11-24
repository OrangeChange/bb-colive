import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

let vite;
let modules;

before(async () => {
  vite = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-compatibleRuntimeFallback.test.mjs", configFile: false, esbuild: { jsx: "automatic" }, optimizeDeps: {include:[], noDiscovery: true }, server: { middlewareMode: true, watch: null }, appType: "custom", logLevel: "silent" });
  modules = {
    adapters: await vite.ssrLoadModule("/src/themes/themeModeAdapters.ts"),
    bindings: await vite.ssrLoadModule("/src/themes/themeBindings.ts"),
    renderer: await vite.ssrLoadModule("/src/compat/CompatibleEventRenderer.tsx"),
    blivechat: await vite.ssrLoadModule("/src/compat/blivechat/runtime.tsx"),
    openlive: await vite.ssrLoadModule("/src/compat/openlive/runtime.tsx"),
    laplace: await vite.ssrLoadModule("/src/compat/laplace/runtime.tsx"),
    eventTypes: await vite.ssrLoadModule("/src/protocol/eventTypeCodes.ts"),
  };
});

after(async () => vite?.close());

function bindingRegistry(initial) {
  let bindings = structuredClone(initial);
  return modules.bindings.createThemeBindingRegistry({
    async read() { return structuredClone(bindings); },
    async write(next) { bindings = structuredClone(next); },
  });
}

async function runningMode(mode, target = "live") {
  const document = {
    ...structuredClone(modules.adapters.getThemeModeAdapter(mode).createBuiltinTheme()),
    themeId: `${mode}-custom`,
    origin: "custom",
    revision: 2,
  };
  const context = { target, targetId: target, roomId: "42", displayScale: 1 };
  const snapshot = { document, context };
  const registry = bindingRegistry([{ targetId: target, targetKind: target, themeId: document.themeId, revision: 2, displayScale: 1 }]);
  const factory = mode === "blivechat" ? modules.blivechat.createBlivechatThemeRuntime
    : mode === "blivechat-open" ? modules.openlive.createOpenLiveThemeRuntime
      : modules.laplace.createLaplaceThemeRuntime;
  const runtime = factory(registry, {
    load: async () => [structuredClone(snapshot)],
    loadTarget: async () => structuredClone(snapshot),
    save: async () => {}, remove: async () => {}, publish: async () => {}, subscribe: async () => () => {},
  });
  const stop = await runtime.start();
  return { runtime, stop };
}

function output(runtime, target, event, roomId = 42, enableBilibiliVideoLinks = false) {
  const render = runtime.resolve({ target, targetId: target, roomId, placement: "main" });
  return renderToStaticMarkup(createElement(modules.renderer.CompatibleEventRenderer, {
    event,
    render,
    enableBilibiliVideoLinks,
    fallback: createElement("span", { "data-native-fallback": "true" }, "原生行"),
  }));
}

const event = (msgType, patch = {}) => ({ id: `event-${msgType}`, reactKey: `key-${msgType}`, msgType, roomId: 42, ts: 1_000, ...patch });

test('三种兼容渲染器的决策和来源配置按场景应用主题开关', () => {
  for (const mode of ['blivechat', 'blivechat-open', 'laplace']) {
    const document = structuredClone(modules.adapters.getThemeModeAdapter(mode).createBuiltinTheme());
    document.settings.eventVisibility = {categories:{danmaku:false,gift:false,interaction:false},children:{free:false,normal:true,like:true,enter:true}};
    const resolve = mode === 'blivechat' ? modules.blivechat.resolvePublishedBlivechatRender : mode === 'blivechat-open' ? modules.openlive.resolvePublishedOpenLiveRender : modules.laplace.resolvePublishedLaplaceRender;
    for (const target of ['live','windows','obs']) {
      const context={target,targetId:target,roomId:42,placement:'main'};
      const render=resolve({document,context:{target,targetId:target,roomId:'42',displayScale:1}},context);
      const chat=event(modules.eventTypes.MsgType.Danmu,{text:'场景准入',user:{uid:1,uname:'测试用户',guardLevel:0}});
      assert.equal(render.eventDecision(chat),target==='obs'?'omit':'render',mode+':'+target);
      const config=render.listSurface.config;
      if (mode==='laplace') assert.equal(config.showDanmaku,target!=='obs');
      else assert.equal(config.showDanmaku,target!=='obs');
      const free=event(modules.eventTypes.MsgType.Gift,{user:{uid:1,uname:'礼物用户',guardLevel:0},gift:{id:1,name:'免费礼物',count:1,price:0,total:0,priceRmb:0,totalRmb:0,coinType:'silver',isFree:true}});
      assert.equal(render.eventDecision(free),target==='live'?'render':'omit',mode+':'+target+':free');
    }
  }
});

test("兼容主题投影不把来源 CSS 安装到软件容器", async () => {
  for (const mode of ["blivechat", "blivechat-open", "laplace"]) {
    const { runtime, stop } = await runningMode(mode, "live");
    const document = structuredClone(modules.adapters.getThemeModeAdapter(mode).createBuiltinTheme());
    document.styles.customCss = ".source-isolation-probe { color: magenta; }";
    const projections = [];
    await runtime.publish(document, { target: "live", targetId: "live", roomId: "42", displayScale: 1 }, value => projections.push(value));
    assert.doesNotMatch(projections.at(-1).css, /source-isolation-probe|yt-live-chat|data-blc-kind|data-openlive-kind|laplace-event/, mode);
    assert.ok(runtime.resolve({ target: "live", targetId: "live", roomId: 42, placement: "main" }).listSurface, mode);
    stop();
  }
});

test("live 的三种兼容主题对真正不支持的事件回退软件原生行", async () => {
  const unsupported = event(modules.eventTypes.MsgType.GuardHonor, { text: "大航海贺报" });
  for (const mode of ["blivechat", "blivechat-open", "laplace"]) {
    const { runtime, stop } = await runningMode(mode, "live");
    assert.match(output(runtime, "live", unsupported), /data-native-fallback="true"/, mode);
    stop();
  }
});

test("刻意过滤的兼容事件在 live 保持省略", async () => {
  const cases = [
    ["blivechat", event(modules.eventTypes.MsgType.Gift, { isComboUpdate: true, gift: { id: 1, name: "礼物", count: 2, price: 1000, total: 2000, coinType: "gold" } })],
    ["blivechat-open", event(modules.eventTypes.MsgType.Interact, { interactKind: "like", likeCount: -1 })],
    ["laplace", event(modules.eventTypes.MsgType.ScDeleted, { scDeleteIds: ["sc-1"] })],
  ];
  for (const [mode, filtered] of cases) {
    const { runtime, stop } = await runningMode(mode, "live");
    assert.equal(output(runtime, "live", filtered), "", mode);
    stop();
  }
});

test("房间不匹配在 live 省略，兼容副窗口回退不支持事件而 OBS 省略", async () => {
  const unsupported = event(modules.eventTypes.MsgType.GuardHonor, { text: "大航海贺报" });
  for (const mode of ["blivechat", "blivechat-open", "laplace"]) {
    const live = await runningMode(mode, "live");
    assert.doesNotMatch(output(live.runtime, "live", unsupported, 99), /data-native-fallback/, `${mode}:room`);
    assert.equal(output(live.runtime, "live", { ...unsupported, roomId: 99 }), "", `${mode}:event-room`);
    live.stop();
    for (const target of ["windows", "obs"]) {
      const auxiliary = await runningMode(mode, target);
      if (target === "windows") assert.match(output(auxiliary.runtime, target, unsupported), /data-native-fallback/, `${mode}:${target}`);
      else assert.doesNotMatch(output(auxiliary.runtime, target, unsupported), /data-native-fallback/, `${mode}:${target}`);
      auxiliary.stop();
    }
  }
});

test("BLC 开放版视频链接由正式来源文档动作桥接管", async () => {
  const danmu = event(modules.eventTypes.MsgType.Danmu, {
    user: { uid: "7", uname: "用户", guardLevel: 0 },
    text: "查看 BV1xx411c7mD",
  });
  const live = await runningMode("blivechat-open", "live");
  const render = live.runtime.resolve({ target: "live", targetId: "live", roomId: 42, placement: "main" });
  assert.equal(render(danmu, { eventId: danmu.reactKey, enableBilibiliVideoLinks: true, dispatch() { return true; } }), null);
  assert.equal(render.rootProps.rendererMode, "openlive-source-document");
  assert.equal(render.listSurface.protocol, "bb-openlive");
  assert.equal(render.listSurface.project(danmu, 1).payload.content, "查看 BV1xx411c7mD");
  live.stop();
});

test("BLC 原版与开放版在同一目标使用不同 CSS 作用域", async () => {
  const original = await runningMode("blivechat", "live");
  const open = await runningMode("blivechat-open", "live");
  const originalRender = original.runtime.resolve({ target: "live", targetId: "live", roomId: 42, placement: "main" });
  const openRender = open.runtime.resolve({ target: "live", targetId: "live", roomId: 42, placement: "main" });

  assert.equal(originalRender.rootProps.scopeId, "blivechat:live:live");
  assert.equal(openRender.rootProps.scopeId, "blivechat-open:live:live");
  assert.notEqual(originalRender.rootProps.scopeId, openRender.rootProps.scopeId);

  original.stop();
  open.stop();
});
