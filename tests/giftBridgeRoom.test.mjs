import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";

test("礼物窗漏收首次切房通知后会重试，确认前缓存新房间事件", async () => {
  const state = { window: null, listeners: new Map(), messages: [], timers: new Map(), nextTimer: 0 };
  globalThis.__giftRoomTest = state;
  const mocks = {
    "@tauri-apps/api/event": `export const listen = async (name, callback) => { globalThis.__giftRoomTest.listeners.set(name, callback); return () => {}; }; export const emitTo = async (target, name, payload) => { globalThis.__giftRoomTest.messages.push({target, name, payload}); };`,
    "@tauri-apps/api/webviewWindow": `export class WebviewWindow { static async getByLabel(label) { return label === 'gift' ? globalThis.__giftRoomTest.window : null; } }`,
    "./windowMonitor": `export const readCurrentMonitorWorkArea = async () => null;`,
    "./windowDiagnostics": `export const recordWindowDiagnostic = () => {};`,
    "./eventWindowDiagnostics": `export const withEventWindowDiagnosticContext = (event) => event; export const observeWindowEventDelivery = () => {};`,
    "../protocol/adapter": `export const getEventId = (event) => event.reactKey ?? event.id;`,
  };
  const bundle = await build({ entryPoints: ["src/windows/giftBridge.ts"], bundle: true, platform: "node", format: "esm", write: false, plugins: [{
    name: "gift-room-test",
    setup(plugin) {
      plugin.onResolve({ filter: /.*/ }, args => {
        if (args.importer.replaceAll("\\", "/").endsWith("/windows/giftBridge.ts") && mocks[args.path]) return { path: args.path, namespace: "gift-room" };
      });
      plugin.onLoad({ filter: /.*/, namespace: "gift-room" }, args => ({ contents: mocks[args.path], loader: "js" }));
      plugin.onLoad({ filter: /giftBridge\.ts$/ }, async args => ({ contents: (await readFile(args.path, "utf8")).replaceAll("setInterval(", "globalThis.__giftRoomTest.setInterval(").replaceAll("clearInterval(", "globalThis.__giftRoomTest.clearInterval("), loader: "ts" }));
    },
  }] });
  state.setInterval = (callback) => { state.timers.set(++state.nextTimer, callback); return state.nextTimer; };
  state.clearInterval = (id) => state.timers.delete(id);
  try {
    const bridge = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
    const stop = await bridge.startGiftBridge();
    const nativeCallbacks = new Map();
    state.window = {
      show: async () => {},
      setFocus: async () => {},
      once: async (name, callback) => {
        nativeCallbacks.set(name, callback);
        return () => nativeCallbacks.delete(name);
      },
      close: async () => {
        state.window = null;
        const destroyed = nativeCallbacks.get('tauri://destroyed');
        nativeCallbacks.delete('tauri://destroyed');
        destroyed?.();
      },
    };
    bridge.switchGiftWindowRoom(10);
    await bridge.openGiftWindow();
    let request = state.messages.findLast((message) => message.name === "gift:ready-request");
    await state.listeners.get("gift:ready")({ payload: request.payload });
    state.messages.length = 0;
    bridge.switchGiftWindowRoom(20);
    assert.equal(bridge.publishGiftEvent({ id: "gift", roomId: 20, msgType: 1, user: { uid: '1', uname: '用户', guardLevel: 1 } }), "window-not-ready");
    bridge.updateGiftRoomGuardProfile({ roomId: 20, milestone: 'tenThousand', iconSet: 'enhanced', source: 'room-info' });
    state.messages.length = 0;
    for (const callback of [...state.timers.values()]) callback();
    request = state.messages.findLast((message) => message.name === "gift:ready-request");
    assert.ok(request, "首次通知漏收后必须重新请求当前房间");
    assert.equal(request.payload.roomId, 20);
    assert.equal(request.payload.roomGuardProfile.milestone, 'tenThousand');
    await state.listeners.get("gift:ready")({ payload: { roomId: 10, generation: request.payload.generation - 1 } });
    assert.ok(state.timers.size > 0, "旧房间的确认不能结束重试");
    await state.listeners.get("gift:ready")({ payload: request.payload });
    assert.ok(state.messages.some((message) => message.name === "gift:events" && [message.payload].flat().some(event => event.id === "gift")));
    assert.equal(state.messages.find(message => message.name === 'gift:events' && [message.payload].flat().some(event => event.id === 'gift')).payload[0].user.guardMilestone, 'tenThousand');
    assert.equal(state.timers.size, 0);
    bridge.switchGiftWindowRoom(30);
    bridge.updateGiftRoomGuardProfile({ roomId: 20, milestone: 'thousand', iconSet: 'enhanced', source: 'room-info' });
    assert.equal(state.messages.findLast(message => message.name === 'gift:ready-request').payload.roomGuardProfile, undefined);
    assert.ok(state.timers.size > 0);
    await bridge.closeGiftWindow();
    assert.equal(state.timers.size, 0);
    assert.equal(state.window, null);
    assert.equal(bridge.isGiftWindowOpen(), false);
    stop();
  } finally {
    delete globalThis.__giftRoomTest;
  }
});

test("副窗口不会应用延迟到达的旧房间代次", async () => {
  const { acceptsEventWindowRoomState } = await import("../src/windows/eventWindowChannels.ts");
  const current = { roomId: 20, generation: 3 };
  assert.equal(acceptsEventWindowRoomState(current, { roomId: 10, generation: 2 }), false);
  assert.equal(acceptsEventWindowRoomState(current, { roomId: 10, generation: 3 }), false);
  assert.equal(acceptsEventWindowRoomState(current, current), true);
  assert.equal(acceptsEventWindowRoomState(current, { roomId: 10, generation: 4 }), true);
});
