import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { windowDiagnosticRuntime } from './helpers/windowDiagnosticRuntime.mjs';

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${root}/${path}`, "utf8");

test("新诊断 source 流保留原始命令和完整报文并共享关联字段", async () => {
  const { createDiagnosticContext, flushAllDiagnosticLogs } = await import("../src/diagnostics/diagnosticLogger.ts");
  const { createSourceDiagnosticLogger } = await import("../src/diagnostics/sourceLogger.ts");
  const calls = [];
  const context = createDiagnosticContext({
    sessionId: "source-test",
    now: () => 1000,
    invoke: async (_command, args) => calls.push(args),
  });
  const connectionId = context.nextConnectionId();
  const logger = createSourceDiagnosticLogger({ context, now: () => 1100, flushIntervalMs: 0, invoke: async (_command, args) => calls.push(args) });
  const payload = {
    cmd: "SEND_GIFT_V2",
    data: {
      uid: 42,
      gift: { name: "盲盒", price: 100, nested: [{ count: 3 }] },
    },
  };

  try {
    const line = logger.record({ cmd: payload.cmd, data: payload, roomId: 12345, connectionId });
    const record = JSON.parse(line);
    assert.equal(record.kind, "source");
    assert.equal(record.sessionId, "source-test");
    assert.equal(record.connectionId, connectionId);
    assert.equal(record.roomId, 12345);
    assert.equal(record.cmd, "SEND_GIFT_V2");
    assert.deepEqual(record.data, payload);

    await flushAllDiagnosticLogs();
    const sourceWrite = calls.find((call) => call.file.startsWith("source-"));
    assert.ok(sourceWrite);
    assert.deepEqual(JSON.parse(sourceWrite.lines), record);
  } finally {
    logger.stop();
  }
});

test("新诊断 render 流保留实际文字、图片和窗口区域", async () => {
  const { createDiagnosticContext, flushAllDiagnosticLogs } = await import("../src/diagnostics/diagnosticLogger.ts");
  const { createRenderDiagnosticLogger } = await import("../src/diagnostics/renderLogger.ts");
  const calls = [];
  const context = createDiagnosticContext({
    sessionId: "render-test",
    now: () => 2000,
    invoke: async (_command, args) => calls.push(args),
  });
  const connectionId = context.nextConnectionId();
  const logger = createRenderDiagnosticLogger({ context, now: () => 2100, flushIntervalMs: 0, invoke: async (_command, args) => calls.push(args) });

  try {
    const line = logger.record({
      action: "update",
      text: "完整的盲盒事件正文",
      imgs: ["https://img.example/gift.webp"],
      eventId: "event-1",
      roomId: 12345,
      connectionId,
      windowLabel: "main",
      region: "partition|gift",
      msgType: 5,
    });
    const record = JSON.parse(line);
    assert.equal(record.kind, "render");
    assert.equal(record.action, "update");
    assert.equal(record.text, "完整的盲盒事件正文");
    assert.deepEqual(record.imgs, ["https://img.example/gift.webp"]);
    assert.equal(record.eventId, "event-1");
    assert.equal(record.windowLabel, "main");
    assert.equal(record.region, "partition|gift");
    assert.equal(record.msgType, 5);
    assert.equal(record.renderSchemaVersion, 3);

    await flushAllDiagnosticLogs();
    const renderWrite = calls.find((call) => call.file.startsWith("render-"));
    assert.ok(renderWrite);
    assert.deepEqual(JSON.parse(renderWrite.lines), record);
  } finally {
    logger.stop();
  }
});

test("source/render 详细流可承载功能阶段和失败关联", async () => {
  const { createDiagnosticContext } = await import("../src/diagnostics/diagnosticLogger.ts");
  const { createSourceDiagnosticLogger } = await import("../src/diagnostics/sourceLogger.ts");
  const { createRenderDiagnosticLogger } = await import("../src/diagnostics/renderLogger.ts");
  const context = createDiagnosticContext({ sessionId: "feature-stream-test", invoke: async () => {} });
  const source = createSourceDiagnosticLogger({ context, flushIntervalMs: 0, invoke: async () => {} });
  const render = createRenderDiagnosticLogger({ context, flushIntervalMs: 0, invoke: async () => {} });
  try {
    const sourceRecord = JSON.parse(source.recordFeature({
      featureId: "review-archive",
      stage: "failure",
      action: "archive-query",
      outcome: "failed",
      sessionId: "session-1",
      eventId: "event-1",
      data: { sourceRef: "source:query", renderRef: "render:query" },
    }));
    const renderRecord = JSON.parse(render.recordFeature({
      featureId: "review-archive",
      stage: "render",
      action: "archive-render",
      outcome: "rendered",
      sessionId: "session-1",
      eventId: "event-1",
      data: { projectedCount: 1 },
    }));
    assert.equal(sourceRecord.kind, "source");
    assert.equal(sourceRecord.featureId, "review-archive");
    assert.equal(sourceRecord.sourceRef, "source:query");
    assert.equal(renderRecord.kind, "render");
    assert.equal(renderRecord.stage, "render");
    assert.equal(renderRecord.projectedCount, 1);
  } finally {
    source.stop();
    render.stop();
    context.stop?.();
  }
});

test("render 流允许副窗口使用主窗口的诊断会话关联", async () => {
  const { createDiagnosticContext } = await import("../src/diagnostics/diagnosticLogger.ts");
  const { createRenderDiagnosticLogger } = await import("../src/diagnostics/renderLogger.ts");
  const context = createDiagnosticContext({ sessionId: "child-render-context", now: () => 2050, invoke: async () => {} });
  const logger = createRenderDiagnosticLogger({ context, now: () => 2060, flushIntervalMs: 0, invoke: async () => {} });
  try {
    const line = logger.record({
      action: "new",
      text: "副窗口事件",
      imgs: [],
      sessionId: "main-session",
      connectionId: "connect-main-1",
      roomId: 12345,
      eventId: "child-event-1",
      windowLabel: "gift",
      region: "gift",
    });
    const record = JSON.parse(line);
    assert.equal(record.sessionId, "main-session");
    assert.equal(record.connectionId, "connect-main-1");
    assert.equal(record.roomId, 12345);
  } finally {
    logger.stop();
  }
});

test("副窗口迟到 render 未携带连接号时不补当前新连接", async () => {
  const { createDiagnosticContext } = await import('../src/diagnostics/diagnosticLogger.ts');
  const { createRenderDiagnosticLogger } = await import('../src/diagnostics/renderLogger.ts');
  const context = createDiagnosticContext({ sessionId: 'launch-main', flushIntervalMs: 0, invoke: async () => {} });
  context.nextConnectionId(); context.nextConnectionId();
  const logger = createRenderDiagnosticLogger({ context, flushIntervalMs: 0, invoke: async () => {} });
  try {
    const record = JSON.parse(logger.record({ action: 'remove', text: '旧房行', imgs: [], windowLabel: 'gift', roomId: 11, eventId: 'old-event' }, context));
    assert.equal(record.roomId, 11); assert.equal(record.connectionId, undefined);
  } finally { logger.stop(); context.stop(); }
});

test("render 流记录事件行移除，便于区分虚拟列表回收和实际消失", () => {
  const source = read("src/diagnostics/renderLogger.ts");
  assert.match(source, /action: "new" \| "update" \| "remove"/);
  assert.match(source, /removedNodes/);
  assert.match(source, /rows\.set\(row, "remove"\)/);
  assert.match(source, /action === "remove"/);
  assert.match(source, /imgStates/);
  assert.match(source, /imageStatus/);
  assert.match(source, /addEventListener\("load"/);
  assert.match(source, /addEventListener\("error"/);
});

test("普通诊断记录会在定时刷盘，不必等到导出或退出", async () => {
  const { createDiagnosticLogger } = await import("../src/diagnostics/diagnosticLogger.ts");
  const calls = [];
  const logger = createDiagnosticLogger({
    sessionId: "periodic-flush-test",
    now: () => 3000,
    flushIntervalMs: 10,
    invoke: async (_command, args) => calls.push(args),
  });

  try {
    logger.record({ subsystem: "event", action: "received", outcome: "success" });
    await new Promise((resolve) => setTimeout(resolve, 35));
    assert.ok(calls.some((call) => call.file.startsWith("app-")));
  } finally {
    logger.stop();
  }
});

test("连接和事件列表生产路径不再调用旧日志记录器", () => {
  const connection = read("src/protocol/connection.ts");
  const eventList = read("src/components/EventList.tsx");
  assert.match(connection, /sourceDiagnosticLogger/);
  assert.doesNotMatch(connection, /ConnectionLogger|uiLogger/);
  assert.match(eventList, /observeRenderedEventRows/);
  assert.doesNotMatch(eventList, /uiLogger/);
});

test('实际副窗口 DOM 观察器经主端写入：初次挂载、图片失败、移除及 StrictMode 重挂', async () => {
  const runtime = await windowDiagnosticRuntime('gift');
  const original = Object.fromEntries(['Element', 'HTMLImageElement', 'MutationObserver', 'document'].map((key) => [key, globalThis[key]]));
  let observer;
  const handlers = new Map();
  class Element {
    constructor() { this.dataset = {}; this.classList = { contains: (name) => name === 'event-row' }; }
    closest(selector) { return selector === '[data-event-id]' ? this : this.row ?? this; }
    querySelectorAll(selector) { return selector === 'img' ? this.images ?? [] : this.rows ?? []; }
    addEventListener(name, handler) { handlers.set(name, handler); }
    removeEventListener(name) { handlers.delete(name); }
  }
  class Image extends Element {}
  globalThis.Element = Element; globalThis.HTMLImageElement = Image;
  globalThis.document = { fonts: { check: () => true } };
  globalThis.MutationObserver = class {
    constructor(callback) { this.callback = callback; observer = this; }
    observe() {} disconnect() { this.disconnected = true; }
  };
  const row = new Element(); row.textContent = '  旧房  礼物正文  ';
  row.dataset = { eventId: 'old-row', eventRoomId: '11', eventConnectionId: 'connect-old', eventSessionId: 'launch-window-test', eventMsgType: '5', eventFontFamily: 'Test Font', eventStyleType: 'gift', eventAnimationPreset: 'fade', eventAnimationDuration: '240', eventAnimationExitDuration: '180', eventPadding: '12' };
  const image = new Image(); Object.assign(image, { src: 'https://example.com/gift.png', className: '', complete: false, naturalWidth: 0, row });
  row.images = [image]; const rootElement = new Element(); rootElement.rows = [row];
  let stop;
  try {
    const { observeRenderedEventRows } = await runtime.server.ssrLoadModule('/src/diagnostics/renderLogger.ts');
    stop = observeRenderedEventRows(rootElement, { windowLabel: 'gift', region: 'gift' });
    stop(); assert.equal(handlers.size, 0);
    stop = observeRenderedEventRows(rootElement, { windowLabel: 'gift', region: 'gift' });
    stop();
    stop = observeRenderedEventRows(rootElement, { windowLabel: 'gift', region: 'gift-other' });
    image.complete = true; handlers.get('error')({ target: image, type: 'error' });
    observer.callback([{ type: 'childList', addedNodes: [], removedNodes: [row] }]);
    const result = await runtime.receiver.flush();
    assert.equal(result.windowFlush.complete, true, JSON.stringify(result.windowFlush));
    const records = runtime.records();
    assert.equal(records.length, 4, '相同区域重挂不重复记录，换区域保留新的渲染归属');
    assert.deepEqual(records.map((record) => record.action), ['new', 'new', 'update', 'remove']);
    assert.deepEqual(records.map((record) => record.seq), [1, 2, 3, 4]);
    assert.deepEqual(records.map((record) => record.region), ['gift', 'gift-other', 'gift-other', 'gift-other']);
    assert.deepEqual(records[0].imgStates, ['pending']); assert.deepEqual(records[2].imgStates, ['error']);
    assert.equal(records[2].imageStatus, 'error'); assert.equal(records[2].imageIndex, 0);
    for (const record of records) {
      assert.equal(record.text, '旧房 礼物正文'); assert.equal(record.fontLoaded, true);
      assert.equal(record.windowLabel, 'gift'); assert.equal(record.roomId, 11);
      assert.equal(record.connectionId, 'connect-old'); assert.equal(record.eventId, 'old-row');
      assert.equal(record.animationDurationMs, 240); assert.equal(record.eventPadding, 12);
    }
    assert.equal(runtime.port.calls.filter((call) => call.command === 'append_log').length, 0, '副端不直接写同一记录');
  } finally {
    stop?.(); await runtime.finish();
    for (const [key, value] of Object.entries(original)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  }
});
