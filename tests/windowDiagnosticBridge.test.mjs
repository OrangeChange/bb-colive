import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiagnosticContext, flushAllDiagnosticLogs } from '../src/diagnostics/diagnosticLogger.ts';
import { createRenderDiagnosticLogger } from '../src/diagnostics/renderLogger.ts';
import { createDiagnosticBridge } from '../src/diagnostics/diagnosticBridge.ts';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { unzipSync, strFromU8 } from 'fflate';
import { windowDiagnosticRuntime } from './helpers/windowDiagnosticRuntime.mjs';

async function api() {
  const module = await import('../src/diagnostics/windowDiagnosticBridge.ts').catch(() => ({}));
  assert.equal(typeof module.createWindowDiagnosticReceiver, 'function', '需要副窗口诊断接收屏障');
  return module;
}

function bus() {
  const listeners = new Map();
  const held = [];
  const state = { labels: [], holdRecords: false, failRecords: false, failClose: false };
  const closeStates = new Map();
  const transport = (label) => ({
    async listen(channel, handler) {
      const key = `${label}:${channel}`;
      const handlers = listeners.get(key) ?? new Set();
      handlers.add(handler); listeners.set(key, handlers);
      return () => handlers.delete(handler);
    },
    async emitTo(target, channel, payload) {
      if (channel === 'diagnostic:window-record' && state.failRecords) throw new Error('transport failed');
      if (channel === 'diagnostic:window-flush' && target === 'main' && state.failClose) throw new Error('close transport failed');
      const deliver = () => { for (const handler of listeners.get(`${target}:${channel}`) ?? []) handler({ payload }); };
      if (channel === 'diagnostic:window-record' && state.holdRecords) held.push(deliver);
      else deliver();
    },
    getWindowLabels: async () => state.labels,
    storeCloseState: async (value) => closeStates.set(value.instanceId, value),
    readCloseStates: async () => [...closeStates.values()],
  });
  return { state, transport, release: () => held.splice(0).forEach((deliver) => deliver()),
    count: () => [...listeners.values()].reduce((sum, handlers) => sum + handlers.size, 0) };
}

async function setup(t, options = {}) {
  const module = await api();
  const wire = bus();
  const writes = [];
  const invoke = async (_, args) => { writes.push(args); options.write?.(args); };
  const context = createDiagnosticContext({ sessionId: 'launch-main', flushIntervalMs: 0, invoke });
  context.nextConnectionId(); context.nextConnectionId();
  const render = createRenderDiagnosticLogger({ context, flushIntervalMs: 0, invoke });
  const receiver = module.createWindowDiagnosticReceiver({ ...wire.transport('main'),
    recordApp: (input) => context.record(input), recordRender: (input) => render.record(input),
    flushLogs: flushAllDiagnosticLogs,
    ...options,
  });
  await receiver.start();
  const children = [];
  const child = async (label) => {
    const sender = module.createWindowDiagnosticSender({ ...wire.transport(label), windowLabel: label, instanceId: `${label}-${children.length}` });
    await sender.start(); children.push(sender); return sender;
  };
  t.after(() => { receiver.stop(); children.forEach((sender) => sender.stop()); render.stop(); context.stop(); });
  return { module, wire, receiver, child, context, render, writes };
}

test('两窗口定向提交：旧房关联、真实渲染内容及主端统一序号只写一次', async (t) => {
  const s = await setup(t);
  const display = await s.child('display'), gift = await s.child('gift');
  s.wire.state.labels = ['main', 'display', 'gift'];
  display.submitApp({ subsystem: 'window', action: 'lock', outcome: 'applied', roomId: 11, connectionId: 'connect-old', eventId: 'event-old' });
  gift.submitRender({ action: 'update', text: '礼物真实 DOM', imgs: ['https://example.com/gift.png'], imgStates: ['error'], imageStatus: 'error', imageIndex: 0, roomId: 11, connectionId: 'connect-old', eventId: 'event-old', sessionId: 'launch-main' });
  const boundary = await s.receiver.flushWindows();
  assert.equal(boundary.complete, true);
  const { flushAllDiagnosticLogs } = await import('../src/diagnostics/diagnosticLogger.ts');
  await flushAllDiagnosticLogs(); await flushAllDiagnosticLogs();
  const records = s.writes.flatMap((write) => write.lines.trim().split('\n').map(JSON.parse));
  assert.equal(records.length, 2);
  assert.deepEqual(records.map((record) => record.seq).sort(), [1, 2]);
  assert.deepEqual(records.map((record) => record.windowLabel).sort(), ['display', 'gift']);
  for (const record of records) {
    assert.equal(record.sessionId, 'launch-main'); assert.equal(record.roomId, 11);
    assert.equal(record.connectionId, 'connect-old'); assert.equal(record.eventId, 'event-old');
  }
  const actual = records.find((record) => record.kind === 'render');
  assert.equal(actual.text, '礼物真实 DOM'); assert.deepEqual(actual.imgStates, ['error']);
  assert.equal(actual.imageStatus, 'error'); assert.equal(actual.imageIndex, 0);
});

test('副窗两类诊断经接收屏障和真实刷盘进入 Rust 实际 ZIP', async (t) => {
  const evidence = mkdtempSync(join(tmpdir(), 'danmu-window-diagnostics-'));
  mkdirSync(join(evidence, 'logs'));
  const s = await setup(t, { write: (args) => appendFileSync(join(evidence, 'logs', args.file), args.lines) });
  const display = await s.child('display'), gift = await s.child('gift');
  s.wire.state.labels = ['display', 'gift'];
  display.submitApp({ subsystem: 'window', action: 'lock', outcome: 'applied', roomId: 11, eventId: 'old-event', connectionId: 'connect-old' });
  gift.submitRender({ action: 'update', text: '真实礼物正文', imgs: ['https://example.com/gift.png'], imgStates: ['loaded'], imageStatus: 'loaded', imageIndex: 0, roomId: 11, eventId: 'old-event', connectionId: 'connect-old' });
  const bridge = createDiagnosticBridge({ flush: () => s.receiver.flush(), invoke: async (_command, args) => {
    const rust = spawnSync('cargo', ['test', 'diagnostics::tests::export_contract_evidence', '--', '--nocapture'], {
      cwd: fileURLToPath(new URL('../src-tauri/', import.meta.url)), encoding: 'utf8',
      env: { ...process.env, DIAGNOSTIC_EXPORT_EVIDENCE: evidence, DIAGNOSTIC_EXPORT_DIAGNOSTICS: JSON.stringify(args.snapshot.diagnostics) },
    });
    console.log(rust.stdout + rust.stderr); assert.equal(rust.status, 0);
    return JSON.parse(readFileSync(join(evidence, 'result.json'), 'utf8'));
  } });
  const result = await bridge.exportBundle('full', join(evidence, 'diagnostic.zip'), {});
  assert.equal(result.flush.failed, 0); assert.equal(result.flush.flushed, 2);
  for (const filename of ['diagnostic.zip', 'diagnostic (1).zip']) {
    const zip = unzipSync(readFileSync(join(evidence, filename)));
    const appName = Object.keys(zip).find((name) => name.startsWith('app-'));
    const renderName = Object.keys(zip).find((name) => name.startsWith('render-'));
    const app = JSON.parse(strFromU8(zip[appName]).trim()), render = JSON.parse(strFromU8(zip[renderName]).trim());
    assert.equal(app.windowLabel, 'display'); assert.equal(render.windowLabel, 'gift');
    assert.deepEqual([app.seq, render.seq].sort(), [1, 2]);
    for (const record of [app, render]) { assert.equal(record.sessionId, 'launch-main'); assert.equal(record.roomId, 11); assert.equal(record.connectionId, 'connect-old'); assert.equal(record.eventId, 'old-event'); }
    assert.equal(render.text, '真实礼物正文'); assert.equal(render.imageStatus, 'loaded'); assert.deepEqual(render.imgStates, ['loaded']);
    assert.deepEqual(JSON.parse(strFromU8(zip['diagnostics.json'])).flush, result.flush);
  }
  console.log(`Window ZIP evidence: ${evidence}`);
});

test('副端未发送队列有界，溢出累计丢弃不伪装成写入失败', async (t) => {
  const s = await setup(t); const child = await s.child('display'); s.wire.state.labels = ['display'];
  for (let i = 0; i < 1001; i++) child.submitApp({ subsystem: 'window', action: 'layout', outcome: 'moved' });
  const result = await s.receiver.flush();
  assert.equal(result.flushed, 1000); assert.equal(result.droppedRecords, 1);
  assert.equal(result.failed, 1); assert.equal(result.writeFailures, 0); assert.equal(result.pending, 0);
  const next = await s.receiver.flush();
  assert.equal(next.flushed, 0); assert.equal(next.droppedRecords, 1);
});

test('flushed 先到仍等待 window-record 接收边界，然后才刷日志', async (t) => {
  const order = [];
  const s = await setup(t, { flushLogs: async () => { order.push('logs'); return { failed: 0, flushed: 1, pending: 0, writeFailures: 0, droppedRecords: 0 }; } });
  const display = await s.child('display'); s.wire.state.labels = ['display'];
  s.wire.state.holdRecords = true;
  display.submitApp({ subsystem: 'window', action: 'open', outcome: 'shown' });
  let settled = false;
  const flushing = s.receiver.flush().then((result) => { settled = true; return result; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false); assert.deepEqual(order, []);
  s.wire.release();
  const result = await flushing;
  assert.deepEqual(order, ['logs']); assert.equal(result.windowFlush.complete, true);
});

test('未开窗立即完成；无响应 3 秒如实未完成，刷盘仍执行', async (t) => {
  let expire; let delay;
  const s = await setup(t, { setTimeout: (callback, ms) => { expire = callback; delay = ms; return 1; }, clearTimeout: () => {} });
  assert.deepEqual((await s.receiver.flushWindows()).incompleteWindows, []);
  assert.equal(expire, undefined);
  s.wire.state.labels = ['gift'];
  const flushing = s.receiver.flush();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(delay, 3000); expire();
  const result = await flushing;
  assert.equal(result.failed, 1); assert.equal(result.windowFlush.complete, false);
  assert.deepEqual(result.windowFlush.incompleteWindows, ['gift']);
  assert.equal(result.writeFailures, 0);
});

test('提交失败不重试且不能报告完整接收；并发请求 requestId 独立', async (t) => {
  const s = await setup(t); const display = await s.child('display');
  s.wire.state.labels = ['display']; s.wire.state.failRecords = true;
  display.submitApp({ subsystem: 'window', action: 'lock', outcome: 'applied' });
  const [a, b] = await Promise.all([s.receiver.flushWindows(), s.receiver.flushWindows()]);
  assert.notEqual(a.requestId, b.requestId); assert.equal(a.complete, false); assert.equal(b.complete, false);
  assert.deepEqual(a.incompleteWindows, ['display']);
});

test('重复安装及停止后重开不重复监听或重写旧记录', async (t) => {
  const s = await setup(t); await s.receiver.start();
  const child = await s.child('display'); await child.start();
  assert.equal(s.wire.count(), 5);
  child.submitApp({ subsystem: 'window', action: 'open', outcome: 'shown' });
  s.wire.state.labels = ['display']; await s.receiver.flushWindows();
  child.stop(); const reopened = await s.child('display');
  reopened.submitApp({ subsystem: 'window', action: 'lock', outcome: 'applied' });
  await s.receiver.flushWindows();
  assert.equal(s.context.getHealthSnapshot().pending, 2);
  s.receiver.stop(); await s.receiver.start();
  assert.equal(s.wire.count(), 5);
});

test('副窗口关闭前 drain 等主端接收，关闭后的导出包含末条操作', async (t) => {
  const s = await setup(t); const child = await s.child('display');
  s.wire.state.holdRecords = true;
  child.submitApp({ subsystem: 'window', action: 'close', outcome: 'saved' });
  let settled = false;
  const closing = child.drain().then((result) => { settled = true; return result; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false, '传输 Promise 完成不能代替主端接收完成');
  s.wire.release(); assert.equal(await closing, true);
  child.stop(); s.wire.state.labels = [];
  assert.equal((await s.receiver.flushWindows()).complete, true);
  assert.equal(s.context.getHealthSnapshot().pending, 1);
});

test('关闭时提交丢失被主端保留，重开和未开窗都不掩盖缺失记录', async (t) => {
  const s = await setup(t); const child = await s.child('gift');
  s.wire.state.failRecords = true;
  child.submitApp({ subsystem: 'window', action: 'close', outcome: 'saved' });
  assert.equal(await child.drain(), false); child.stop();
  const result = await s.receiver.flush();
  assert.equal(result.failed, 1); assert.equal(result.droppedRecords, 1);
  assert.deepEqual(result.windowFlush.incompleteWindows, ['gift']);
});

test('记录和关闭请求均发送失败，销毁后导出仍读取独立关闭状态', async (t) => {
  const s = await setup(t); const child = await s.child('display');
  s.wire.state.failRecords = true; s.wire.state.failClose = true;
  child.submitApp({ subsystem: 'window', action: 'close', outcome: 'saved' });
  assert.equal(await child.drain(), false);
  child.stop(); s.wire.state.labels = [];
  let snapshot;
  const exporter = createDiagnosticBridge({ flush: () => s.receiver.flush(), invoke: async (command, args) => {
    assert.equal(command, 'export_diagnostic_bundle'); snapshot = args.snapshot;
    return { output_path: args.outputPath, mode: args.mode, files: ['diagnostics.json'], bytes: 1 };
  } });
  const exported = await exporter.exportBundle('full', 'closed-window.zip', {});
  const result = exported.flush;
  assert.deepEqual(snapshot.diagnostics.flush, result);
  console.log('Closed failed channel health:', JSON.stringify(result));
  assert.equal(result.windowFlush.complete, false);
  assert.equal(result.failed, 1); assert.equal(result.droppedRecords, 1);
  assert.equal(result.writeFailures, 0);
  assert.deepEqual(result.windowFlush.incompleteWindows, ['display']);
  s.wire.state.failRecords = false; s.wire.state.failClose = false;
  await s.child('display'); s.wire.state.labels = ['display'];
  const reopened = await s.receiver.flush();
  assert.equal(reopened.windowFlush.complete, false); assert.equal(reopened.droppedRecords, 1);
});

test('关闭状态读取失败不能伪报完整；日志仍刷盘', async (t) => {
  const s = await setup(t, { readCloseStates: async () => { throw new Error('native unavailable'); } });
  s.context.record({ subsystem: 'app', action: 'marker', outcome: 'saved' });
  const result = await s.receiver.flush();
  assert.equal(result.failed, 1); assert.equal(result.flushed, 1);
  assert.equal(result.windowFlush.complete, false); assert.equal(result.writeFailures, 0);
});

test('部分提交失败仍等成功记录接收，不能提前刷盘遗漏其余记录', async (t) => {
  const s = await setup(t); const child = await s.child('display');
  s.wire.state.failRecords = true;
  child.submitApp({ subsystem: 'window', action: 'lock', outcome: 'failed-transfer' });
  await new Promise((resolve) => setImmediate(resolve));
  s.wire.state.failRecords = false; s.wire.state.holdRecords = true; s.wire.state.labels = ['display'];
  child.submitApp({ subsystem: 'window', action: 'close', outcome: 'saved' });
  let settled = false;
  const flushing = s.receiver.flushWindows().then((result) => { settled = true; return result; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  s.wire.release(); const result = await flushing;
  assert.equal(result.complete, false); assert.equal(s.context.getHealthSnapshot().pending, 1);
});

test('实际入口在组件模块诊断前安装副端，只加载对应窗口组件', { timeout: 60000 }, async () => {
  for (const label of ['display', 'gift', 'gift-only', 'superchat', 'guard']) {
    const runtime = await windowDiagnosticRuntime(label, { entry: true, installSender: false });
    const originalWindow = globalThis.window, originalDocument = globalThis.document;
    globalThis.window = { localStorage: { length: 0 }, sessionStorage: { length: 0 }, location: { search: `?window=${label}` }, addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }) };
    globalThis.document = { documentElement: { dataset: {}, classList: { toggle() {} } }, getElementById: () => ({}) };
    try {
      await runtime.server.ssrLoadModule('/src/main.tsx'); await runtime.port.rendered;
      assert.deepEqual(runtime.port.moduleLoads, [label]);
      assert.equal(runtime.port.stylesLoaded, true, '副窗口入口必须加载共用窗口样式');
      const flush = await runtime.receiver.flush(); assert.equal(flush.windowFlush.complete, true);
      assert.equal(runtime.records().filter((record) => record.action === 'module-load').length, 1);
      assert.equal(runtime.port.calls.filter((call) => call.command === 'append_log').length, 0);
    } finally { await runtime.finish(); globalThis.window = originalWindow; globalThis.document = originalDocument; }
  }
});
