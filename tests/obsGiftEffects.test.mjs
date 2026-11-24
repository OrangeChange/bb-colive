import test from "node:test";
import assert from "node:assert/strict";
import { createObsOutputState } from "../src/obs/obsOutputState.ts";
import * as browser from "../src/obs/obsBrowserState.ts";
const { createObsGiftEffectGate, obsGiftEffectResource } = browser;
import { DEFAULT_EVENT_WINDOW_PREFERENCES as defaults } from "../src/windows/eventWindowPreferences.ts";
import { rebaseThemeResourceOrigin } from "../src/themes/themeResourceOrigin.ts";
import { resolveOutputScheme } from "../src/obs/obsConfigurationIdentity.ts";
import { MsgType } from "../src/protocol/types.ts";
import { createDefaultDisplayWindowFilters } from '../src/eventFilterSettings.ts';
const gift = (id, extra = {}) => ({
  id,
  roomId: 2,
  ts: 1000,
  msgType: MsgType.Gift,
  user: { uid: 1, uname: "u" },
  gift: {
    id: 1,
    name: "g",
    count: 1,
    priceRmb: 1,
    totalRmb: 1,
    paymentRmb: 1,
    coinType: "gold",
  },
  ...extra,
});
test("隐藏主流、容量和主题不裁掉独立特效；重复与连击更新不重播", () => {
  const notices = [];
  const settings = {
    ...defaults,
    showGiftEffect: true,
    capacity: 1,
    giftThreshold: 100,
  };
  const model = createObsOutputState(
    2,
    settings,
    { allowsMain: () => false },
    (e) => notices.push(e),
  );
  model.accept(gift("a", { comboId: "combo" }), 1000);
  model.accept(gift("a", { comboId: "combo" }), 1001);
  model.accept(
    gift("summary", { comboId: "combo", isComboUpdate: true }),
    1002,
  );
  model.configure(settings, 1003, { allowsMain: () => true });
  model.accept(gift("b", { ts: 10000, comboId: "new" }), 10000);
  model.accept(gift("wrong", { roomId: 1 }), 10001);
  assert.deepEqual(
    notices.map((e) => e.id),
    ["a", "b"],
  );
  assert.equal(model.snapshot(10002).events.length, 0);
});
test("关闭期间消费事件，重新开启不补播", () => {
  const notices = [];
  const s = { ...defaults, showGiftEffect: false };
  const model = createObsOutputState(2, s, {}, (e) => notices.push(e));
  model.accept(gift("off"), 1000);
  model.configure({ ...s, showGiftEffect: true }, 1001);
  model.accept(gift("off"), 1002);
  model.accept(gift("on", { ts: 10000 }), 10000);
  assert.deepEqual(
    notices.map((e) => e.id),
    ["on"],
  );
});
test("独立序列拒绝重复与历史，多个网页分别消费", () => {
  const a = createObsGiftEffectGate(),
    b = createObsGiftEffectGate();
  for (const gate of [a, b]) {
    gate.baseline("room-session", 5);
    assert.equal(gate.accept("room-session", 5), false);
    assert.equal(gate.accept("room-session", 6), true);
    assert.equal(gate.accept("room-session", 6), false);
  }
  a.reset();
  assert.equal(a.accept("room-session", 7), false);
  a.baseline("room-session", 7);
  assert.equal(a.accept("room-session", 8), true);
  a.baseline("other-room", 0);
  assert.equal(a.accept("room-session", 9), false);
});
test("代理资源为绝对URL，配置以.json结束，同资源地址稳定", () => {
  const resource = {
    id: 1,
    giftIds: [1],
    planPlatforms: [2],
    webMp4: "https://example.com/a.mp4",
    webMp4Json: "https://example.com/a.json",
  };
  const value = obsGiftEffectResource(resource, "http://localhost:17920");
  assert.match(
    value.webMp4,
    /^http:\/\/localhost:17920\/gift-effects\/.+\/video\.mp4$/,
  );
  assert.match(
    value.webMp4Json,
    /^http:\/\/localhost:17920\/gift-effects\/.+\/config\.json$/,
  );
  assert.deepEqual(
    value,
    obsGiftEffectResource(resource, "http://localhost:17920"),
  );
});

test("同一快照不能前移通知基准；换主题保留增量序列", () => {
  const gate = createObsGiftEffectGate();
  gate.baseline("room", 1);
  assert.equal(gate.accept("room", 2), true);
  gate.baseline("room", 10);
  assert.equal(gate.accept("room", 3), true);
});

test("隐藏主流的同连击迟到逐条事件不因过期重播", () => {
  const notices = [];
  const model = createObsOutputState(
    2,
    { ...defaults, showGiftEffect: true },
    { allowsMain: () => false },
    (e) => notices.push(e),
  );
  model.accept(gift("first", { comboId: "combo" }), 1000);
  model.accept(gift("late", { comboId: "combo", ts: 20000 }), 20000);
  assert.deepEqual(
    notices.map((e) => e.id),
    ["first"],
  );
});

test("同连击的盲盒独立结果各自触发", () => {
  const notices = [];
  const model = createObsOutputState(
    2,
    { ...defaults, showGiftEffect: true },
    { allowsMain: () => false },
    (e) => notices.push(e),
  );
  const a = gift("a", { comboId: "blind" });
  a.gift.blindGiftName = "box";
  model.accept(a, 1000);
  model.accept({ ...a, id: "b" }, 1001);
  assert.deepEqual(
    notices.map((e) => e.id),
    ["a", "b"],
  );
});

for (const blind of [false, true]) {
  test(`摘要先到不占用${blind ? "盲盒结果" : "真实礼物"}的特效连击`, () => {
    const notices = [];
    const model = createObsOutputState(
      2,
      { ...defaults, showGiftEffect: true },
      { allowsMain: () => false },
      (event) => { if (event.gift?.effect === 2 && event.gift.effectId === 2071) notices.push(event); },
    );
    const actual = gift("actual", { comboId: "summary-first" });
    actual.gift.effect = 2;
    actual.gift.effectId = 2071;
    if (blind) actual.gift.blindGiftName = "box";
    model.accept(gift("summary", { comboId: actual.comboId, isComboUpdate: true }), 1000);
    assert.deepEqual(notices, []);
    model.accept(actual, 1001);
    model.accept(actual, 1002);
    assert.deepEqual(notices.map(event => event.id), ["actual"]);
    if (blind) {
      model.accept({ ...actual, id: "second-result" }, 1003);
      assert.deepEqual(notices.map(event => event.id), ["actual", "second-result"]);
    }
  });
}
import { componentRuntime, findElement } from "./helpers/componentRuntime.mjs";
import { createNativeEventVisibilityPredicate } from "../src/events/outputEventPolicy.ts";

test("host只消费自己的lease，主流隐藏仍独立发送；新网页只得到基准", async () => {
  const sent = [],
    lookups = [];
  let receive;
  const settings = { showObsGiftEffect: true, showGiftWindowEffect: false };
  const originalMatch = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ matches: false });
  const app = componentRuntime(
    "src/obs/obsHost.ts",
    {
      "./obsConfigurationIdentity.ts": { resolveOutputScheme },
      "../protocol/giftEffects.ts": {
        getEventEffect: (event) => {
          lookups.push(event.roomId);
          return {
            id: 1,
            webMp4: "https://example.com/a.mp4",
            webMp4Json: "https://example.com/a.json",
          };
        },
      },
      "../events/outputEventPolicy.ts": {
        createNativeEventVisibilityPredicate,
      },
      "../compat/CompatibleEventRenderer.tsx": {
        compatibleEventDecisionOf: () => "omit",
      },
      "./obsRenders.ts": {
        resolveObsRenders: () => ({ main: {}, sticky: {} }),
      },
      "@tauri-apps/api/core": {
        invoke: async (command, args) => {
          sent.push({ command, ...args });
        },
      },
      "@tauri-apps/api/event": { emit: async () => {} },
      "./nativeObsConfigurations.ts": {
        nativeObsConfigurationStore: {
          load: async () => [{ id: "config", themeId: "theme" }],
        },
      },
      "./nativeObsTheme.ts": {
        loadObsThemeSnapshot: async () => ({ targetId: "config" }),
      },
      "./sharedRoomConnection.ts": {
        roomSessions: {
          acquire: async (_, callbacks) => {
            receive ??= callbacks;
            return { roomId: 2, release() {}, replay() {} };
          },
        },
      },
      "./obsOutputState.ts": { createObsOutputState },
      "../stores/session.ts": {
        useSession: {
          getState: () => ({
            phase: "loggedIn",
            session: { cookie: "", mid: 1 },
          }),
        },
      },
      "../generalSettings.ts": {
        useGeneralSettings: { getState: () => settings },
      },
      "../theme.ts": {
        useTheme: { getState: () => ({ mode: "light", palette: "pine" }) },
      },
      "../voice/voiceSettings.ts": {
        useVoiceSettings: { getState: () => ({ userNicknames: {} }) },
      },
      "../windows/eventWindowPreferences.ts": {
        createEventWindowPreferences: () => ({
          ...defaults,
          showGiftEffect: false,
        }),
      },
      "../components/sceneSettings.ts": { loadSceneSettings: () => ({}) },
      "../eventFilterSettings.ts": { createDefaultDisplayWindowFilters },
    },
    ["attach", "detach"],
  );
  try {
    const query = { config: "config", theme: "theme", room: "2" };
    await app.exports.attach("one", query);
    receive.onEvent(gift("first"));
    const effects = () => sent.filter((x) => x.payload?.type === "gift-effect");
    assert.equal(effects().length, 1);
    assert.deepEqual(lookups, [2]);
    receive.onEvent(gift("wrong", { roomId: 1 }));
    receive.onEvent(gift("first"));
    assert.equal(effects().length, 1);
    await app.exports.attach("two", query);
    assert.equal(effects().length, 1);
    const baseline = sent.filter((x) => x.clientId === "two" && x.payload?.type === "state").at(-1).payload;
    assert.equal(baseline.giftEffectSequence, 1);
    assert.equal(baseline.preferences.showGiftEffect, true);
    receive.onEvent(gift("second", { ts: 20000 }));
    assert.equal(effects().length, 3);
    assert.deepEqual(
      effects()
        .slice(-2)
        .map((x) => x.clientId),
      ["one", "two"],
    );
    assert.equal(effects().at(-1).payload.sequence, 2);
  } finally {
    app.exports.detach("one");
    app.exports.detach("two");
    app.close();
    globalThis.matchMedia = originalMatch;
  }
});

test("浏览器输出外层按房间挂载，共享特效层跨主题保留且重复网络包不重播", () => {
  const original = {
    document: globalThis.document,
    window: globalThis.window,
    location: globalThis.location,
    WebSocket: globalThis.WebSocket,
  };
  globalThis.window = {};
  const sockets = [];
  globalThis.document = {
    documentElement: { dataset: {} },
    getElementById: () => ({}),
  };
  globalThis.location = {
    origin: "http://localhost:17920",
    host: "localhost:17920",
    protocol: "http:",
    search: "",
    pathname: "/obs",
  };
  globalThis.WebSocket = class {
    constructor() {
      sockets.push(this);
    }
    close() {}
    send() {}
  };
  const Overlay = () => null,
    View = () => null;
  const app = componentRuntime(
    "src/obs/obsBrowserEntry.tsx",
    {
      "react-dom/client": { createRoot: () => ({ render() {} }) },
      "./obsConfigurationIdentity.ts": { resolveOutputScheme },
      "../themes/themeResourceOrigin.ts": { rebaseThemeResourceOrigin },
      "./obsCustomCssBridge.ts": { installObsCustomCssBridge: () => () => {} },
      "./laplaceObsScene.ts": { subscribeLaplaceObsScene: () => () => {} },
      "../theme.ts": { applyThemeToDocument() {} },
      "./obsBrowserState.ts": browser,
      "../components/GiftEffectOverlay.tsx": { GiftEffectOverlay: Overlay },
      "./ObsStateView.tsx": { ObsStateView: View },
    },
    ["BrowserOutput"],
  );
  try {
    app.render("BrowserOutput", {});
    app.effects();
    const send = (message) =>
      sockets[0].onmessage({ data: JSON.stringify(message) });
    const state = {
      type: "state",
      identity: "theme-a",
      sequence: 1,
      snapshot: { roomId: 2 },
      scheme: "light",
      preferences: { showGiftEffect: true },
      giftEffectSession: "room",
      giftEffectSequence: 0,
    };
    send(state);
    let tree = app.render("BrowserOutput", {});
    app.effects();
    const first = findElement(tree, (n) => n.type === Overlay);
    const notice = {
      event: gift("a"),
      resource: {
        id: 1,
        webMp4: "https://example.com/a.mp4",
        webMp4Json: "https://example.com/a.json",
      },
    };
    send({ type: "gift-effect", session: "room", sequence: 1, notice });
    send({ type: "gift-effect", session: "room", sequence: 1, notice });
    tree = app.render("BrowserOutput", {});
    app.effects();
    const active = findElement(tree, (n) => n.type === Overlay);
    assert.equal(active.props.notices.length, 1);
    assert.match(
      active.props.notices[0].resource.webMp4Json,
      /^http:.*\.json$/,
    );
    send({ ...state, identity: "theme-b", sequence: 2, giftEffectSequence: 1 });
    tree = app.render("BrowserOutput", {});
    app.effects();
    const next = findElement(tree, (n) => n.type === Overlay);
    assert.equal(next.key, first.key);
    assert.equal(next.props.notices[0], active.props.notices[0]);
    assert.notEqual(findElement(tree, (n) => n.type === View).key, "theme-a");
    send({ ...state, sequence: 3, preferences: { showGiftEffect: false } });
    tree = app.render("BrowserOutput", {});
    assert.equal(
      findElement(tree, (n) => n.type === Overlay).props.enabled,
      false,
    );
    send({ ...state, sequence: 4, snapshot: { roomId: 3 }, giftEffectSession: "room-3" });
    tree = app.render("BrowserOutput", {});
    const otherRoom = findElement(tree, (n) => n.type === Overlay);
    assert.equal(otherRoom.key, "3");
    assert.deepEqual(otherRoom.props.notices, []);
  } finally {
    app.close();
    Object.assign(globalThis, original);
  }
});
