import assert from "node:assert/strict";
import { test } from "node:test";

test("问题标记覆盖前2分钟和后3分钟", async () => {
  const { createIssueMarker, getIssueMarkerWindow } = await import("../src/diagnostics/issueMarkers.ts");
  assert.deepEqual(getIssueMarkerWindow(createIssueMarker({ id: "m-1", markedAt: 300000, sessionId: "launch-1" })), { start: 180000, end: 480000 });
});

test("问题标记保留关联字段但不复制事件日志", async () => {
  const { createIssueMarker } = await import("../src/diagnostics/issueMarkers.ts");
  const marker = createIssueMarker({
    id: "m-2",
    markedAt: 900000,
    note: "弹幕延迟",
    sessionId: "launch-2",
    connectionId: "connect-2",
    roomId: 24125,
  });

  assert.deepEqual(marker, {
    id: "m-2",
    markedAt: 900000,
    note: "弹幕延迟",
    sessionId: "launch-2",
    connectionId: "connect-2",
    roomId: 24125,
  });
  assert.equal("events" in marker, false);
  assert.equal("logs" in marker, false);
});

test("问题标记备注与统一记录使用相同脱敏策略", async () => {
  const { createIssueMarker } = await import("../src/diagnostics/issueMarkers.ts");
  const unsafeNotes = [
    "Bearer abc123",
    "details: file:///Users/Orange/private/voice.wav",
    "details: /srv/danmu/app.ndjson",
  ];

  for (const note of unsafeNotes) {
    const marker = createIssueMarker({ id: "m-unsafe", markedAt: 900000, note, sessionId: "launch-unsafe" });
    assert.equal("note" in marker, false);
    assert.doesNotMatch(JSON.stringify(marker), /Bearer|file:\/\/|\/srv\/danmu|\/Users\/Orange/iu);
  }
});

test("问题标记备注覆盖 POSIX 单段、POSIX 根路径和 Windows 驱动器根路径", async () => {
  const { createIssueMarker } = await import("../src/diagnostics/issueMarkers.ts");
  const unsafeNotes = ["/", "/tmp", "prefix /tmp", "C:\\", "prefix C:\\"];

  for (const note of unsafeNotes) {
    const marker = createIssueMarker({ id: "m-path-boundary", markedAt: 900000, note, sessionId: "launch-path" });
    assert.equal("note" in marker, false, "note leaked: " + note);
  }
});

test("问题标记在后3分钟结束时从 collecting 变为 complete", async () => {
  const { createIssueMarker, getIssueMarkerStatus } = await import("../src/diagnostics/issueMarkers.ts");
  const marker = createIssueMarker({ id: "m-3", markedAt: 300000, sessionId: "launch-3" });

  assert.equal(getIssueMarkerStatus(marker, 479999), "collecting");
  assert.equal(getIssueMarkerStatus(marker, 480000), "complete");
  assert.equal(getIssueMarkerStatus(marker, 600000), "complete");
});

test("问题标记待写队列有上限并报告丢弃数量", async () => {
  const { createDiagnosticContext } = await import("../src/diagnostics/diagnosticLogger.ts");
  const { IssueMarkerLogger, ISSUE_MARKER_MAX_PENDING_LINES } = await import("../src/diagnostics/markerLogger.ts");
  const context = createDiagnosticContext({ sessionId: "marker-buffer-test", invoke: async () => {} });
  const logger = new IssueMarkerLogger({ context, invoke: async () => {} });
  for (let index = 0; index < ISSUE_MARKER_MAX_PENDING_LINES + 7; index += 1) {
    logger.record({ id: `marker-${index}`, markedAt: index, sessionId: "marker-buffer-test" });
  }
  const health = logger.getHealthSnapshot();
  assert.equal(health.pending, ISSUE_MARKER_MAX_PENDING_LINES);
  assert.equal(health.droppedRecords, 7);
  await logger.flush();
  logger.stop();
  context.stop?.();
});

test("marker 并发刷盘推进边界，失败保留批次且只在下一次调用重试", async () => {
  const { createDiagnosticContext } = await import("../src/diagnostics/diagnosticLogger.ts");
  const { IssueMarkerLogger } = await import("../src/diagnostics/markerLogger.ts");
  const context = createDiagnosticContext({ invoke: async () => {}, flushIntervalMs: 0 });
  const writes = [];
  const releases = [];
  const logger = new IssueMarkerLogger({ context, invoke: async (_command, args) => {
    writes.push(args);
    await new Promise((resolve, reject) => releases.push({ resolve, reject }));
  } });
  const record = id => logger.record({ id, markedAt: 2000000000000, sessionId: "launch-marker" });
  try {
    record("first");
    const first = logger.flush();
    record("second");
    const second = logger.flush();
    assert.equal(logger.getHealthSnapshot().pending, 2);
    releases.shift().resolve();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(writes.length, 2);
    assert.equal(JSON.parse(writes[1].lines).id, "second");
    releases.shift().reject(new Error("write failure"));
    const results = await Promise.all([first, second]);
    assert.deepEqual(results[0], { failed: 1, flushed: 1, pending: 1, writeFailures: 1, droppedRecords: 0 });
    assert.deepEqual(results[1], results[0]);
    assert.equal(writes.length, 2);
    const retry = logger.flush();
    releases.shift().resolve();
    assert.deepEqual(await retry, { failed: 0, flushed: 1, pending: 0, writeFailures: 1, droppedRecords: 0 });
    assert.equal(writes[2].lines, writes[1].lines);
  } finally { logger.stop(); context.stop(); }
});
