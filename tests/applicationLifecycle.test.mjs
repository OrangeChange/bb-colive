import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import { windowDiagnosticRuntime, mountFloatingWindow } from './helpers/windowDiagnosticRuntime.mjs';

const root = fileURLToPath(new URL("../", import.meta.url));

async function lifecycle(options = {}) {
  const calls = [];
  const effects = [];
  const values = new Map();
  if (options.initialMarker) values.set('bb-colive.diagnostic-session', options.initialMarker);
  const listeners = new Map();
  const globals = { window: globalThis.window };
  const state = {
    effects, calls,
    window: {
      onCloseRequested: async (handler) => { state.close = handler; return () => calls.push("unlisten"); },
      hide: async () => calls.push("hide"),
      destroy: async () => { calls.push("destroy"); if (options.failDestroy && calls.filter((call) => call === "destroy").length === 1) throw new Error("busy"); },
    },
    disconnect: (reason) => { state.disconnectReason = reason; calls.push("disconnect"); },
    flushArchive: async () => calls.push("archive"),
    flushLogs: async () => { calls.push("logs"); if (options.flushWindowLogs) return options.flushWindowLogs(); return { failed: options.failLogs ? 1 : 0, flushed: 1, pending: options.pending ?? 0, writeFailures: options.writeFailures ?? 0, droppedRecords: options.droppedRecords ?? 0, ...(options.windowFlush ? { windowFlush: options.windowFlush } : {}) }; },
    invoke: async (command) => {
      calls.push(command);
      if (command === 'prepare_floating_windows_close') return options.prepareWindows ? options.prepareWindows() : { complete: true, incompleteWindows: [] };
      if (command === 'quit_app') options.finalExit?.();
      if (command === 'quit_app' && options.failDestroy && calls.filter((call) => call === 'quit_app').length === 1) throw new Error('busy');
    },
    listen: async (channel, handler) => { state.tray = handler; return () => calls.push('unlisten-tray'); },
  };
  globalThis.__applicationLifecycle = state;
  globalThis.window = {
    localStorage: { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) },
    addEventListener: (name, handler) => listeners.set(name, handler),
    removeEventListener: (name) => listeners.delete(name),
    onerror: null,
  };
  const modules = {
    react: 'export const useEffect = (effect) => globalThis.__applicationLifecycle.effects.push(effect); export const useRef = (current) => ({ current });',
    '@tauri-apps/api/window': 'export const getCurrentWindow = () => globalThis.__applicationLifecycle.window;',
    '../stores/connection': 'export const useConnection = { getState: () => ({ disconnect: globalThis.__applicationLifecycle.disconnect }) };',
    '../archive/archiveRuntime.ts': 'export const flushArchiveWriter = () => globalThis.__applicationLifecycle.flushArchive();',
    '../diagnostics/diagnosticLogger': 'export const flushAllDiagnosticLogs = () => globalThis.__applicationLifecycle.flushLogs(); export const sanitizeDiagnosticString = (value) => value;',
    '../diagnostics/windowDiagnosticBridge.ts': 'export const flushWindowDiagnosticLogs = async () => { globalThis.__applicationLifecycle.calls.push("windows"); return globalThis.__applicationLifecycle.flushLogs(); };',
    '@tauri-apps/api/core': 'export const invoke = (command) => globalThis.__applicationLifecycle.invoke(command);',
    '@tauri-apps/api/event': 'export const listen = (channel, handler) => globalThis.__applicationLifecycle.listen(channel, handler);',
  };
  const server = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-applicationLifecycle.test.mjs",optimizeDeps:{noDiscovery:true,include:[]}, root, configFile: false, logLevel: "silent", server: {watch:null, middlewareMode: true, hmr: false, ws: false }, plugins: [{
    name: "application-lifecycle-ports",
    resolveId: (id) => id.startsWith("\0lifecycle:") ? id : undefined,
    load: (id) => modules[id.slice("\0lifecycle:".length)],
    transform(code, id) {
      if (!id.replaceAll("\\", "/").endsWith("/src/runtime/useApplicationLifecycle.ts")) return;
      for (const name of Object.keys(modules)) code = code.replaceAll(`from "${name}"`, `from "\0lifecycle:${name}"`);
      return code;
    },
  }] });
  const { useApplicationLifecycle } = await server.ssrLoadModule("/src/runtime/useApplicationLifecycle.ts");
  useApplicationLifecycle({
    closeBehavior: options.closeBehavior ?? "exit",
    diagnosticContext: { record: (input) => (state.records ??= []).push(input), stop: () => calls.push("stop") },
    diagnosticExportInProgressRef: { current: Boolean(options.exportCompletion) },
    diagnosticExportCompletionRef: { current: options.exportCompletion ?? null },
    setDiagnosticFlushResult: (result) => { state.flushResult = result; },
  });
  const cleanup = effects[0]();
  await Promise.resolve();
  return { state, values, calls, close: () => state.close({ preventDefault: () => calls.push("prevent") }),
    async finish() { cleanup(); await server.close(); globalThis.window = globals.window; delete globalThis.__applicationLifecycle; },
  };
}

test("退出按断开、档案刷盘、诊断刷盘顺序完成，成功后写入 clean", async () => {
  const app = await lifecycle();
  try {
    await app.close();
    assert.deepEqual(app.calls, ["prevent", "begin_app_quit", "disconnect", "archive", "prepare_floating_windows_close", "windows", "logs", "quit_app", "stop"]);
    assert.equal(app.values.get("bb-colive.diagnostic-session"), "clean");
    assert.equal(app.state.disconnectReason, "app-exit");
  } finally { await app.finish(); }
});

test('成功收尾后的下次启动不报告异常，active 会话明确报告未收尾', async () => {
  for (const marker of ['clean', 'active']) {
    const app = await lifecycle({ initialMarker: marker });
    try {
      assert.equal(app.state.records.some((record) => record.outcome === 'previousSessionUnclean'), marker === 'active');
      assert.equal(app.values.get('bb-colive.diagnostic-session'), 'active');
    } finally { await app.finish(); }
  }
});

test('窗口接收未完成不能标 clean；累计失败和本次失败分别消费', async () => {
  for (const options of [
    { windowFlush: { requestId: 'timeout', complete: false, incompleteWindows: ['display'] } },
    { pending: 1 }, { droppedRecords: 1 },
  ]) {
    const app = await lifecycle(options);
    try { await app.close(); assert.equal(app.values.get('bb-colive.diagnostic-session'), 'active'); }
    finally { await app.finish(); }
  }
  const recovered = await lifecycle({ writeFailures: 2 });
  try { await recovered.close(); assert.equal(recovered.values.get('bb-colive.diagnostic-session'), 'clean'); }
  finally { await recovered.finish(); }
});

test('重复退出只调用一次最终退出；退出日志不在刷盘前伪报 clean', async () => {
  let resolve;
  const exportCompletion = new Promise((done) => { resolve = done; });
  const app = await lifecycle({ exportCompletion });
  try {
    const first = app.close(), second = app.close();
    resolve(); await Promise.all([first, second]);
    assert.equal(app.calls.filter((call) => call === 'quit_app').length, 1);
    assert.equal(app.state.records.some((record) => record.action === 'shutdown' && record.outcome === 'clean'), false);
  } finally { resolve(); await app.finish(); }
});

test("诊断刷盘失败保留 active，原生关闭失败可以再次关闭", async () => {
  const app = await lifecycle({ failLogs: true, failDestroy: true });
  try {
    await app.close();
    await app.close();
    assert.equal(app.values.get("bb-colive.diagnostic-session"), "active");
    assert.equal(app.calls.filter((call) => call === "quit_app").length, 2);
    assert.equal(app.calls.filter((call) => call === "archive").length, 1);
  } finally { await app.finish(); }
});

test('托盘退出等待导出，复用接收屏障与 Rust 退出且忽略隐藏设置', async () => {
  let resolve;
  const exportCompletion = new Promise((done) => { resolve = done; });
  const app = await lifecycle({ closeBehavior: 'tray', exportCompletion });
  try {
    assert.equal(typeof app.state.tray, 'function', '必须安装托盘退出监听');
    const quitting = app.state.tray();
    await Promise.resolve(); await Promise.resolve();
    assert.deepEqual(app.calls, ['begin_app_quit']);
    resolve(); await quitting;
    assert.deepEqual(app.calls, ['begin_app_quit', 'disconnect', 'archive', 'prepare_floating_windows_close', 'windows', 'logs', 'quit_app', 'stop']);
    assert.equal(app.values.get('bb-colive.diagnostic-session'), 'clean');
  } finally { resolve(); await app.finish(); }
});

test('最终退出调用失败后重试重新刷诊断，成功收尾恢复 clean', async () => {
  const app = await lifecycle({ failDestroy: true });
  try {
    await app.close(); assert.equal(app.values.get('bb-colive.diagnostic-session'), 'active');
    await app.close(); assert.equal(app.values.get('bb-colive.diagnostic-session'), 'clean');
    assert.equal(app.calls.filter((call) => call === 'logs').length, 2);
    assert.equal(app.calls.filter((call) => call === 'archive').length, 1);
    assert.equal(app.calls.filter((call) => call === 'stop').length, 1);
  } finally { await app.finish(); }
});

test("导出完成前等待关闭，托盘模式完成后隐藏且保持连接", async () => {
  let resolve;
  const exportCompletion = new Promise((done) => { resolve = done; });
  const app = await lifecycle({ closeBehavior: "tray", exportCompletion });
  try {
    const closing = app.close();
    await Promise.resolve();
    assert.deepEqual(app.calls, ["prevent"]);
    resolve();
    await closing;
    assert.deepEqual(app.calls, ["prevent", "hide"]);
  } finally { resolve(); await app.finish(); }
});

test('主端退出复用正在关闭的真实副窗，末条只写一次后才最终退出', async () => {
  for (const label of ['display', 'gift']) {
    const runtime = await windowDiagnosticRuntime(label);
    const cleanup = await mountFloatingWindow(runtime);
    let release;
    runtime.port.saveGate = new Promise((resolve) => { release = resolve; });
    let signalSaveStarted;
    const saveStarted = new Promise((resolve) => { signalSaveStarted = resolve; });
    runtime.port.onSaveStarted = signalSaveStarted;
    const app = await lifecycle({
      prepareWindows: async () => { await runtime.port.close({ preventDefault() {} }); return { complete: true, incompleteWindows: [] }; },
      flushWindowLogs: () => runtime.receiver.flush(),
      finalExit: () => {
        assert.equal(runtime.port.destroyed, true);
        assert.equal(runtime.records().filter((record) => record.action === 'close' && record.outcome === 'saved').length, 1);
      },
    });
    try {
      const alreadyClosing = runtime.port.close({ preventDefault() {} });
      const quitting = app.close();
      await saveStarted;
      assert.equal(app.calls.includes('logs'), false, '几何保存未完成时不能最终刷盘');
      assert.equal(app.calls.includes('quit_app'), false);
      release(); await Promise.all([alreadyClosing, quitting]);
      assert.equal(app.calls.includes('quit_app'), true);
      assert.equal(runtime.records().filter((record) => record.action === 'close' && record.outcome === 'saved').length, 1);
      assert.equal(runtime.port.calls.filter((call) => call.command === 'destroy').length, 1);
      assert.equal(app.values.get('bb-colive.diagnostic-session'), 'clean');
    } finally { release(); await app.finish(); await cleanup(); await runtime.finish(); }
  }
});

test('真实副窗关闭两个诊断发送均失败，销毁后导出和退出保持未完成', async () => {
  const runtime = await windowDiagnosticRuntime('display');
  const cleanup = await mountFloatingWindow(runtime);
  let app;
  try {
    await runtime.receiver.flush();
    runtime.port.failDiagnostics = true;
    await runtime.port.close({ preventDefault() {} });
    assert.equal(runtime.port.destroyed, true);
    const exported = await runtime.receiver.flush();
    assert.equal(exported.windowFlush.complete, false);
    assert.equal(exported.droppedRecords, 1);
    app = await lifecycle({ flushWindowLogs: () => runtime.receiver.flush() });
    await app.close();
    assert.equal(app.values.get('bb-colive.diagnostic-session'), 'active');
    assert.equal(app.state.flushResult.windowFlush.complete, false);
    assert.equal(app.calls.includes('quit_app'), true, '确认失败不能永久阻止退出');
  } finally { await app?.finish(); await cleanup(); await runtime.finish(); }
});

test('副窗关闭准备超时不伪报 clean，也不永久阻止 Rust 退出', async () => {
  const app = await lifecycle({ prepareWindows: async () => ({ complete: false, incompleteWindows: ['gift'] }) });
  try {
    await app.close();
    assert.equal(app.values.get('bb-colive.diagnostic-session'), 'active');
    assert.equal(app.state.flushResult.windowFlush.complete, false);
    assert.equal(app.calls.includes('quit_app'), true);
  } finally { await app.finish(); }
});
