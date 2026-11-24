import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${root}/${path}`, "utf8");

test("事件日志区分适配、去重、合并和窗口分发结果", () => {
  const source = read("src/stores/connection.ts");
  assert.match(source, /adapt/);
  assert.match(source, /dedupe|seenIds/);
  assert.match(source, /mergeGiftInto/);
  assert.match(source, /eventDelivery\.append/);
  assert.match(read("src/runtime/liveEventDelivery.ts"), /publishDisplayEvent/);
  assert.match(source, /recordEventDecision|subsystem.*event/);
});

test("适配诊断区分无事件、兼容状态和适配异常", async () => {
  const { classifyAdaptationResult } = await import("../src/protocol/adaptationDiagnostics.ts");
  assert.deepEqual(classifyAdaptationResult(null, false), {
    outcome: "ignored",
    reason: "no-event",
    eventCount: 0,
  });
  assert.deepEqual(classifyAdaptationResult(null, true), {
    outcome: "ignored",
    reason: "laplace-state-only",
    eventCount: 0,
  });
  assert.deepEqual(classifyAdaptationResult([{ id: "event-1" }], false), {
    outcome: "accepted",
    reason: "adapted-event",
    eventCount: 1,
  });
  assert.deepEqual(classifyAdaptationResult(null, false, new Error("adapter failed")), {
    outcome: "failure",
    reason: "adapter-threw",
    eventCount: 0,
  });
});

test("HTTP 插件网络错误保留安全诊断字段，并且网络失败最多自动重试一次", async () => {
  const api = await import("../src/protocol/api.ts");
  assert.equal(typeof api.describeRequestFailure, "function");
  assert.equal(typeof api.withNetworkRetry, "function");

  const details = api.describeRequestFailure({
    name: "FetchError",
    code: "ECONNRESET",
    message: "error sending request for url (https://api.bilibili.com/x/web-interface/nav?token=secret)",
    cause: { name: "ConnectError", message: "connection reset by peer" },
  });
  assert.equal(details.category, "network");
  assert.equal(details.errorName, "FetchError");
  assert.equal(details.errorCode, "ECONNRESET");
  assert.match(details.errorMessage, /\[redacted-url\]/);
  assert.doesNotMatch(details.errorMessage, /token=secret/);
  assert.equal(details.causeName, "ConnectError");
  assert.equal(details.causeMessage, "connection reset by peer");

  let attempts = 0;
  let retryCount = 0;
  const result = await api.withNetworkRetry(async () => {
    attempts += 1;
    if (attempts === 1) throw { message: "error sending request for url (https://api.bilibili.com/x)" };
    return "ok";
  }, { delayMs: 0, onRetry: () => { retryCount += 1; } });
  assert.equal(result, "ok");
  assert.equal(attempts, 2);
  assert.equal(retryCount, 1);

  attempts = 0;
  await assert.rejects(() => api.withNetworkRetry(async () => {
    attempts += 1;
    throw new api.ApiError("接口失败", -101);
  }, { delayMs: 0 }));
  assert.equal(attempts, 1);
});

test("连接阶段使用网络重试，并把重试作为独立诊断结果记录", () => {
  const source = read("src/protocol/connection.ts");
  assert.match(source, /withNetworkRetry/);
  assert.match(source, /outcome:\s*["']retry["']/);
  assert.match(source, /BiliTransportError/);
});

test("WebSocket 诊断保留原生关闭码和关闭原因", () => {
  const source = read("src/protocol/connection.ts");
  assert.match(source, /attachTransportDiagnostics/);
  assert.match(source, /connection\?\.ws/);
  assert.match(source, /code:\s*event\.code/);
  assert.match(source, /reason:\s*event\.reason/);
  assert.match(source, /wasClean:\s*event\.wasClean/);
  assert.match(source, /transport-close/);
  assert.match(source, /transport-error/);
});

test("UI日志通过 eventId 对应事件而不是只依赖DOM文字", () => {
  const source = read("src/components/EventList.tsx");
  assert.match(source, /observeRenderedEventRows/);
  assert.match(source, /data-event-id=\{getEventRowKey\(ev\)\}/);
});

test("UI行元数据把 data-event-msg-type 映射为 dataset.eventMsgType", async () => {
  const { readEventMsgType } = await import("../src/components/eventListDiagnostics.ts");
  assert.equal(readEventMsgType({ eventMsgType: "1", msgType: "999" }), 1);
  assert.equal(readEventMsgType({ msgType: "1" }), undefined);
  assert.equal(readEventMsgType({ eventMsgType: "not-a-number" }), undefined);

  const source = read("src/components/EventList.tsx");
  assert.match(source, /data-event-msg-type=\{ev\.msgType\}/);
  const renderSource = read("src/diagnostics/renderLogger.ts");
  assert.match(renderSource, /eventHost\?\.dataset\.eventMsgType/);
});

test("render 诊断记录实际事件样式和动画元信息", () => {
  const renderSource = read("src/diagnostics/renderLogger.ts");
  assert.match(renderSource, /eventStyleType/);
  assert.match(renderSource, /animationPreset/);
  assert.match(renderSource, /animationDurationMs/);
  assert.match(renderSource, /animationExitDurationMs/);
  assert.match(renderSource, /fontFamily/);
  assert.match(renderSource, /fontLoaded/);
  for (const source of [read("src/components/EventList.tsx"), read("src/windows/FloatingEventWindow.tsx"), read("src/windows/FloatingEventWindow.tsx")]) {
    assert.match(source, /data-event-animation-preset/);
    assert.match(source, /data-event-style-type/);
  }
});

test("副窗口事件携带主窗口的渲染诊断关联", async () => {
  const { createDiagnosticContext } = await import("../src/diagnostics/diagnosticLogger.ts");
  const { withEventWindowDiagnosticContext } = await import("../src/windows/eventWindowDiagnostics.ts");
  const context = createDiagnosticContext({ sessionId: "main-session", invoke: async () => {} });
  const connectionId = context.nextConnectionId();
  const event = { id: "event-1", msgType: 1, roomId: 12345, ts: 1000 };
  const payload = withEventWindowDiagnosticContext(event, context);
  assert.equal(payload.__renderDiagnostic.sessionId, "main-session");
  assert.equal(payload.__renderDiagnostic.connectionId, connectionId);

  const display = read("src/windows/displayBridge.ts");
  const gift = read("src/windows/giftBridge.ts");
  const floating = read("src/windows/FloatingEventWindow.tsx");
  const displayWindow = read("src/windows/FloatingEventWindow.tsx");
  for (const bridge of [display, gift]) assert.match(bridge, /withEventWindowDiagnosticContext/);
  for (const windowSource of [floating, displayWindow]) {
    assert.match(windowSource, /data-event-session-id/);
    assert.match(windowSource, /data-event-connection-id/);
    assert.match(windowSource, /data-event-room-id/);
  }
  assert.match(read("src/diagnostics/renderLogger.ts"), /dataset\.eventSessionId/);
  assert.match(read("src/diagnostics/renderLogger.ts"), /dataset\.eventConnectionId/);
  assert.match(read("src/diagnostics/renderLogger.ts"), /dataset\.eventRoomId/);
});

test("事件诊断 ID 优先使用 reactKey，回退到 id", () => {
  const source = read("src/protocol/adapter.ts");
  assert.match(source, /export function getEventId\([^)]*id[^)]*reactKey[^)]*\)/);
  assert.match(source, /return event\.reactKey \?\? event\.id/);
});

test("副窗口桥接返回 delivered 或 window-not-ready，且通道文件不引入连接日志", () => {
  const display = read("src/windows/displayBridge.ts");
  const gift = read("src/windows/giftBridge.ts");
  const channels = read("src/windows/eventWindowChannels.ts");
  assert.match(display, /window-not-ready/);
  assert.match(display, /return ["']delivered["']/);
  assert.match(gift, /window-not-ready/);
  assert.match(gift, /return ["']delivered["']/);
  assert.doesNotMatch(channels, /ConnectionLogger|raw-message/);
});

test("副窗口只有打开但未 ready 时才返回 window-not-ready", async () => {
  const { getEventWindowPublishResult } = await import("../src/windows/eventWindowChannels.ts");
  assert.equal(getEventWindowPublishResult(false, false), "not-applicable");
  assert.equal(getEventWindowPublishResult(true, false), "window-not-ready");
  assert.equal(getEventWindowPublishResult(true, true), "delivered");

  for (const path of ["src/windows/displayBridge.ts", "src/windows/giftBridge.ts"]) {
    const source = read(path);
    assert.match(source, /getEventWindowPublishResult\(session\.open, session\.ready\)/);
    assert.match(source, /if \(result === "window-not-ready"\)[\s\S]*?queue(?:Display|Gift)(?:Window)?Event\(session, payload\)/);
  }
});

test("副窗口事件投递 reject 后追加可关联的固定诊断失败记录且不携带事件正文", async () => {
  const { createDiagnosticContext, flushAllDiagnosticLogs } = await import("../src/diagnostics/diagnosticLogger.ts");
  const { observeWindowEventDelivery } = await import("../src/windows/eventWindowDiagnostics.ts");
  const calls = [];
  const context = createDiagnosticContext({
    sessionId: "window-delivery-test",
    invoke: async (_command, args) => calls.push(args),
  });
  context.nextConnectionId();

  let rejectDelivery;
  const delivery = new Promise((_resolve, reject) => {
    rejectDelivery = reject;
  });
  let cleanupCount = 0;
  observeWindowEventDelivery(
    delivery,
    {
      eventId: "react-event-1",
      roomId: 123,
      msgType: 1,
      region: "display",
      windowLabel: "display",
      phase: "display-window",
    },
    () => { cleanupCount += 1; },
  );
  rejectDelivery(new Error("完整弹幕正文不应进入诊断失败记录"));
  await new Promise((resolve) => setImmediate(resolve));
  await flushAllDiagnosticLogs();

  const record = calls
    .filter((call) => call.file.startsWith("app-"))
    .flatMap((call) => call.lines.trim().split("\n"))
    .map((line) => JSON.parse(line))
    .find((item) => item.sessionId === "window-delivery-test" && item.action === "display-window");
  assert.equal(cleanupCount, 1);
  assert.ok(record);
  assert.equal(record.outcome, "failure");
  assert.equal(record.connectionId, "connect-1");
  assert.equal(record.roomId, 123);
  assert.equal(record.eventId, "react-event-1");
  assert.equal(record.windowLabel, "display");
  assert.deepEqual(record.data, {
    reason: "window-delivery-failed",
    msgType: 1,
    region: "display",
  });
  assert.doesNotMatch(JSON.stringify(record), /完整弹幕正文/);
});

test("窗口生命周期诊断保留窗口、动作和结果", async () => {
  const { recordWindowDiagnostic } = await import("../src/windows/windowDiagnostics.ts");
  const records = [];
  recordWindowDiagnostic({
    context: { record: (record) => { records.push(record); return "window-1"; } },
    windowLabel: "gift",
    action: "restore",
    outcome: "failure",
    data: { reason: "geometry-unavailable" },
  });
  assert.deepEqual(records, [{
    subsystem: "window",
    action: "restore",
    outcome: "failure",
    windowLabel: "gift",
    data: { reason: "geometry-unavailable" },
  }]);
});

test("副窗口实现声明打开、恢复、锁定和销毁诊断边界", () => {
  for (const path of ["src/windows/FloatingEventWindow.tsx", "src/windows/FloatingEventWindow.tsx"]) {
    const source = read(path);
    assert.match(source, /recordWindowDiagnostic/);
    assert.match(source, /action: "open"/);
    assert.match(source, /action: "restore"/);
    assert.match(source, /action: "lock"/);
    assert.match(source, /action: "destroy"/);
  }
});
