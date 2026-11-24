import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test from "node:test";
import assert from "node:assert/strict";
import { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { MsgType } from "../src/protocol/types.ts";
import { createCompatibleLiveBridge, stableCompatibleEventId } from "../src/compat/compatibleLiveBridge.ts";

let vite;
let CompatibleEventRenderer;
let compatibleActionFromElement;
let installCompatibleEventRenderResolver;
let resolveCompatibleEventRender;
let subscribeNativeObsRendererTarget;
let runEventFavoriteAction;
before(async () => {
  vite = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-compatibleLiveBridge.test.mjs", configFile: false, esbuild: { jsx: "automatic" }, optimizeDeps: {include:[], noDiscovery: true },
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, watch: null },
    appType: "custom",
    logLevel: "silent",
  });
  ({ CompatibleEventRenderer, compatibleActionFromElement, installCompatibleEventRenderResolver, resolveCompatibleEventRender } = await vite.ssrLoadModule("/src/compat/CompatibleEventRenderer.tsx"));
  ({ subscribeNativeObsRendererTarget } = await vite.ssrLoadModule("/src/obs/NativeObsRenderer.tsx"));
  ({ runEventFavoriteAction } = await vite.ssrLoadModule("/src/components/EventContextMenu.tsx"));
});
after(async () => { await vite?.close(); });

const user = (uid, uname = "同名用户") => ({ uid, uname, guardLevel: 0 });
const event = (id, uid, extra = {}) => ({
  id,
  reactKey: `row:${id}`,
  roomId: 1,
  ts: 1_000,
  msgType: MsgType.Danmu,
  user: user(uid),
  text: id,
  ...extra,
});

test("兼容动作以真实稳定 ID 回传同一个事件对象", () => {
  const original = event("a", "1");
  const received = [];
  const bridge = createCompatibleLiveBridge({
    onFavorite: (value) => received.push(value),
    onLocate: (value) => received.push(value),
    onCopy: (value) => received.push(value),
  });
  bridge.replace([original]);

  assert.equal(stableCompatibleEventId(original), "row:a");
  assert.equal(bridge.dispatch("row:a", "favorite"), true);
  assert.equal(bridge.dispatch("row:a", "locate"), true);
  assert.equal(bridge.dispatch("row:a", "copy"), true);
  assert.deepEqual(received, [original, original, original]);
  assert.equal(bridge.dispatch("missing", "favorite"), false);
});

test("同名用户按 UID 回传，不会串到另一个用户", () => {
  const first = event("a", "100");
  const second = event("b", "200");
  const filtered = [];
  const bridge = createCompatibleLiveBridge({ onFilterUser: (value) => filtered.push(value) });
  bridge.replace([first, second]);

  bridge.dispatch("row:b", "filter-user");
  assert.deepEqual(filtered.map((value) => value.uid), ["200"]);
  assert.strictEqual(filtered[0], second.user);
});

test("用户名、定位和礼物特效动作都由软件处理原事件", () => {
  const gift = event("gift", "300", { msgType: MsgType.Gift, gift: { id: 1, name: "礼物", count: 1 } });
  const calls = [];
  const bridge = createCompatibleLiveBridge({
    onLocate: (value) => calls.push(["locate", value]),
    onOpenUser: (value) => calls.push(["open", value]),
    onGiftEffect: (value) => calls.push(["effect", value]),
  });
  bridge.replace([gift]);

  assert.equal(bridge.dispatch("row:gift", "locate"), true);
  assert.equal(bridge.dispatch("row:gift", "context"), false);
  assert.equal(bridge.dispatch("row:gift", "open-user"), true);
  assert.equal(bridge.dispatch("row:gift", "gift-effect"), true);
  assert.strictEqual(calls[0][1], gift);
  assert.strictEqual(calls[1][1], gift.user);
  assert.strictEqual(calls[2][1], gift);
});

test("正文链接由软件动作桥打开，不交给兼容 DOM 自行持有", () => {
  const original = event("link", "301");
  const calls = [];
  const bridge = createCompatibleLiveBridge({ onOpenLink: (value, href) => calls.push([value, href]) });
  bridge.replace([original]);

  assert.equal(bridge.dispatch("row:link", { type: "open-link", href: "https://www.bilibili.com/video/BV1xx" }), true);
  assert.deepEqual(calls, [[original, "https://www.bilibili.com/video/BV1xx"]]);
});

test("兼容 DOM 的用户名与链接命中软件动作，不把整行误判为用户名", () => {
  const root = { parentElement: null, matches: () => false, getAttribute: () => null };
  const username = {
    parentElement: root,
    matches: (selector) => selector.includes("#author-name"),
    getAttribute: () => null,
  };
  const link = {
    parentElement: root,
    matches: (selector) => selector === "a[href]",
    getAttribute: (name) => name === "href" ? "https://www.bilibili.com/video/BV1xx" : null,
  };
  const plain = { parentElement: root, matches: () => false, getAttribute: () => null };

  assert.equal(compatibleActionFromElement(username, root), "filter-user");
  assert.deepEqual(compatibleActionFromElement(link, root), { type: "open-link", href: "https://www.bilibili.com/video/BV1xx" });
  assert.equal(compatibleActionFromElement(plain, root), null);
});

test("兼容事件宿主捕获真实点击路径并只阻止软件接管的链接默认跳转", () => {
  const OriginalElement = globalThis.Element;
  class FakeElement {
    constructor(parentElement, selectors, href = null) {
      this.parentElement = parentElement;
      this.selectors = selectors;
      this.href = href;
    }
    matches(selector) { return this.selectors.some(value => selector.includes(value)); }
    getAttribute(name) { return name === "href" ? this.href : null; }
  }
  globalThis.Element = FakeElement;
  try {
    const actions = [];
    const host = CompatibleEventRenderer({
      event: event("capture", "302"),
      render: () => React.createElement("span", null, "主题内容"),
      dispatch: (eventId, action) => { actions.push([eventId, action]); return true; },
      fallback: null,
    });
    const root = new FakeElement(null, []);
    const username = new FakeElement(root, ["#author-name"]);
    let prevented = false;
    host.props.onClickCapture({ target: username, currentTarget: root, preventDefault() { prevented = true; } });
    assert.deepEqual(actions, [["row:capture", "filter-user"]]);
    assert.equal(prevented, false);

    const link = new FakeElement(root, ["a[href]"], "https://www.bilibili.com/video/BV1xx411c7mD");
    host.props.onClickCapture({ target: link, currentTarget: root, preventDefault() { prevented = true; } });
    assert.deepEqual(actions[1], ["row:capture", { type: "open-link", href: "https://www.bilibili.com/video/BV1xx411c7mD" }]);
    assert.equal(prevented, true);
  } finally {
    if (OriginalElement === undefined) delete globalThis.Element;
    else globalThis.Element = OriginalElement;
  }
});

test("主题切换只替换渲染记录，不修改软件筛选对象", () => {
  const filters = { left: { danmu: true, interact: false, interactKinds: { entry: false } } };
  const before = structuredClone(filters);
  const bridge = createCompatibleLiveBridge({});
  bridge.replace([event("a", "1")]);
  bridge.replace([event("b", "2")]);

  assert.deepEqual(filters, before);
  assert.equal(bridge.has("row:a"), false);
  assert.equal(bridge.has("row:b"), true);
});

test("兼容渲染宿主以软件外层稳定承载动作，不改写主题根元素", () => {
  const original = event("renderer", "9");
  const actions = [];
  const html = renderToStaticMarkup(React.createElement(CompatibleEventRenderer, {
    event: original,
    render: (value, context) => React.createElement("article", {
      "data-rendered-id": context.eventId,
      onClick: () => context.dispatch("favorite"),
    }, value.text),
    dispatch: (eventId, action) => { actions.push([eventId, action]); return true; },
    fallback: React.createElement("span", null, "fallback"),
  }));

  assert.equal(html, '<div class="compatible-event-interaction-host event-row-with-menu relative" data-event-id="row:renderer"><article data-rendered-id="row:renderer">renderer</article></div>');
  assert.deepEqual(actions, []);
});

test("事件列表把兼容主题的根作用域与背景放到滚动面，而不是只放在单行", () => {
  const source = readFileSync(fileURLToPath(new URL("../src/components/EventList.tsx", import.meta.url)), "utf8");
  assert.match(source, /data-blivechat-scope=\{compatibleSurface\?\.scopeId\}/);
  assert.match(source, /style=\{compatibleSurface\?\.surfaceStyle\}/);
});

test("组件与 Fragment 不消费 props 时，软件宿主仍保留菜单与定位根", () => {
  const original = event("menu", "10");
  const Component = () => React.createElement(React.Fragment, null,
    React.createElement("span", { className: "first" }, "一"),
    React.createElement("span", { className: "second" }, "二"));
  const html = renderToStaticMarkup(React.createElement(CompatibleEventRenderer, {
    event: original,
    render: () => React.createElement(Component, null),
    menu: React.createElement("button", { className: "event-menu-trigger" }, "菜单"),
    fallback: React.createElement("span", null, "fallback"),
  }));
  assert.match(html, /^<div class="compatible-event-interaction-host event-row-with-menu relative" data-event-id="row:menu">/);
  assert.match(html, /<span class="first">一<\/span><span class="second">二<\/span>/);
  assert.match(html, /event-menu-trigger/);
});

test("兼容主题不支持当前事件时回退到软件原生事件行", () => {
  const original = event("unsupported", "11");
  const html = renderToStaticMarkup(React.createElement(CompatibleEventRenderer, {
    event: original,
    render: () => null,
    fallback: React.createElement("span", { className: "native-fallback" }, "原生事件"),
  }));

  assert.equal(html, '<span class="native-fallback">原生事件</span>');
});

test("兼容 renderer 启用时定位高亮由软件宿主显示且不改写主题 DOM", () => {
  const original = event("located", "12");
  const html = renderToStaticMarkup(React.createElement(CompatibleEventRenderer, {
    event: original,
    render: () => React.createElement("article", { className: "theme-event" }, "主题内容"),
    locatedHighlight: true,
    fallback: React.createElement("span", null, "fallback"),
  }));

  assert.match(html, /^<div class="compatible-event-interaction-host event-row-with-menu relative" data-event-id="row:located">/);
  assert.match(html, /<article class="theme-event">主题内容<\/article>/);
  assert.match(html, /<span class="event-row-located-indicator" aria-hidden="true"><\/span>/);
  assert.equal((html.match(/theme-event/g) ?? []).length, 1);
});

test("产品运行时按目标、区域和真实房间解析兼容渲染器", () => {
  const calls = [];
  const render = () => null;
  const uninstall = installCompatibleEventRenderResolver((context) => {
    calls.push(context);
    return render;
  });
  assert.strictEqual(resolveCompatibleEventRender({ target: "obs", targetId: "obs-7", roomId: 7788, placement: "sticky" }), render);
  assert.deepEqual(calls, [{ target: "obs", targetId: "obs-7", roomId: 7788, placement: "sticky" }]);
  uninstall();
});

test("兼容收藏复用软件入口并遵守新增收藏时编辑备注和标签", async () => {
  const original = event("favorite", "11");
  const calls = [];
  runEventFavoriteAction(original, {
    regionKey: "left",
    onSpeakEvent() {},
    isFavorite: () => false,
    onToggleFavorite: async () => { calls.push("favorite"); },
    onEditFavorite: async () => { calls.push("edit"); },
    favoriteEditOnAdd: true,
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(calls, ["favorite", "edit"]);
});

test("现场双区与分区都把同一个兼容渲染入口送到虚拟列表", () => {
  const app = readFileSync(fileURLToPath(new URL("../src/App.tsx", import.meta.url)), "utf8");
  const eventPane = readFileSync(fileURLToPath(new URL("../src/components/EventPane.tsx", import.meta.url)), "utf8");
  const partition = readFileSync(fileURLToPath(new URL("../src/components/PartitionColumn.tsx", import.meta.url)), "utf8");
  const sticky = readFileSync(fileURLToPath(new URL("../src/components/StickyEventCard.tsx", import.meta.url)), "utf8");
  assert.match(app, /useCompatibleEventRender\(\{\s*target:\s*"live"[\s\S]*?roomId[\s\S]*?placement:\s*"main"/);
  assert.ok((app.match(/compatibleEventRender=\{compatibleEventRender\}/g) ?? []).length >= 4);
  assert.match(eventPane, /compatibleEventRender\?: CompatibleEventRender/);
  assert.match(eventPane, /compatibleEventRender=\{compatibleEventRender\}/);
  assert.match(partition, /compatibleEventRender\?: CompatibleEventRender/);
  assert.match(partition, /compatibleEventRender=\{compatibleEventRender\}/);
  assert.match(sticky, /compatibleEventRender\?: CompatibleEventRender/);
  assert.match(sticky, /<CompatibleEventRenderer event=\{event\} render=\{compatibleEventRender\}/);
});

test("悬浮窗口主区与置顶共用真实房间上下文，OBS 使用目标房间", () => {
  const floating = readFileSync(fileURLToPath(new URL("../src/windows/FloatingEventWindow.tsx", import.meta.url)), "utf8");
  const obs = readFileSync(fileURLToPath(new URL("../src/obs/NativeObsRenderer.tsx", import.meta.url)), "utf8");
  const adapters = readFileSync(fileURLToPath(new URL("../src/themes/themeModeAdapters.ts", import.meta.url)), "utf8");
  assert.match(floating, /placement:\s*"main"[\s\S]*?roomId:\s*activeRoomId/);
  assert.match(floating, /placement:\s*"sticky"[\s\S]*?roomId:\s*activeRoomId/);
  assert.match(floating, /render=\{compatibleMainRender\}/);
  assert.match(floating, /compatibleEventRender=\{compatibleStickyRender\}/);
  assert.match(floating, /compatibleRendererSurface\(compatibleMainRender\)/);
  assert.match(floating, /data-blivechat-scope=\{compatibleSurface\?\.scopeId\}/);
  assert.match(floating, /style=\{compatibleSurface\?\.surfaceStyle\}/);
  assert.match(obs, /roomId:\s*snapshot\?\.roomId\s*\?\?\s*null/);
  assert.match(adapters, /publishNativeThemeTarget\(document, context\.targetId, context\.target, applyProjection, context\.roomId, undefined, context\.displayScale\)/);
});

test("OBS 目标切换后迟到的旧订阅不能回写当前快照", async () => {
  const subscriptions = new Map();
  const disposed = [];
  const received = [];
  const subscribe = (targetId, listener) => new Promise(resolve => {
    subscriptions.set(targetId, { listener, resolve: () => resolve(() => disposed.push(targetId)) });
  });

  const stopA = subscribeNativeObsRendererTarget("obs-a", snapshot => received.push(snapshot.targetId), subscribe);
  stopA();
  const stopB = subscribeNativeObsRendererTarget("obs-b", snapshot => received.push(snapshot.targetId), subscribe);
  subscriptions.get("obs-a").listener({ targetId: "obs-a" });
  subscriptions.get("obs-b").listener({ targetId: "obs-a" });
  subscriptions.get("obs-b").listener({ targetId: "obs-b" });
  subscriptions.get("obs-a").resolve();
  subscriptions.get("obs-b").resolve();
  await Promise.resolve();

  assert.deepEqual(received, ["obs-b"]);
  assert.deepEqual(disposed, ["obs-a"]);
  stopB();
  assert.deepEqual(disposed, ["obs-a", "obs-b"]);
});
