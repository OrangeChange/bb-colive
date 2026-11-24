import assert from "node:assert/strict";
import { test } from "node:test";

test("诊断记录按启动会话递增 seq 并保留关联字段", async () => {
  const { createDiagnosticLogger } = await import("../src/diagnostics/diagnosticLogger.ts");
  let now = 1000;
  const logger = createDiagnosticLogger({ invoke: async () => {}, now: () => now, sessionId: "launch-1" });
  logger.record({ subsystem: "connection", action: "room-init", outcome: "start", connectionId: "connect-1" });
  now = 1100;
  const line = logger.record({ subsystem: "event", action: "adapt", outcome: "success", eventId: "event-1", connectionId: "connect-1" });
  const record = JSON.parse(line);
  assert.equal(record.sessionId, "launch-1");
  assert.equal(record.seq, 2);
  assert.equal(record.eventId, "event-1");
});

test("诊断记录补充统一信封并只保留安全标量数据", async () => {
  const { createDiagnosticLogger } = await import("../src/diagnostics/diagnosticLogger.ts");
  const logger = createDiagnosticLogger({ invoke: async () => {}, now: () => 2000, sessionId: "launch-2" });
  const line = logger.record({
    level: "warn",
    subsystem: "voice",
    action: "synthesis",
    outcome: "failure",
    durationMs: 42,
    connectionId: "connect-2",
    roomId: 24125,
    eventId: "event-2",
    requestId: "request-2",
    windowLabel: "main",
    extra: "must not be copied",
    data: {
      count: 3,
      enabled: true,
      label: "safe",
      empty: null,
      nested: { value: "drop" },
      list: [1, 2, 3],
      cookie: "cookie-value",
      apiKey: "api-key-value",
      Authorization: "Bearer authorization-value",
      tokenValue: "token-value",
      secret: "secret-value",
      password: "password-value",
      windowsPath: "C:\\Users\\Orange\\private\\voice.wav",
      posixPath: "/Users/Orange/private/voice.wav",
    },
  });
  const record = JSON.parse(line);

  assert.deepEqual(record, {
    t: 2000,
    seq: 1,
    kind: "app",
    sessionId: "launch-2",
    level: "warn",
    subsystem: "voice",
    action: "synthesis",
    outcome: "failure",
    connectionId: "connect-2",
    roomId: 24125,
    eventId: "event-2",
    requestId: "request-2",
    windowLabel: "main",
    durationMs: 42,
    data: { count: 3, enabled: true, label: "safe", empty: null },
  });
  assert.doesNotMatch(line, /cookie-value|api-key-value|authorization-value|token-value|secret-value|password-value|C:\\Users|\/Users\//iu);
});

test("安全键名下的凭证内容、内嵌 file URI 和 POSIX 路径也不会进入记录", async () => {
  const { createDiagnosticLogger } = await import("../src/diagnostics/diagnosticLogger.ts");
  const logger = createDiagnosticLogger({ now: () => 2500, sessionId: "launch-2b", invoke: async () => {} });
  const line = logger.record({
    subsystem: "diagnostic",
    action: "sanitize",
    outcome: "success",
    data: {
      message: "Authorization: Bearer abc123",
      headerText: "Bearer abc123",
      fileNotice: "failed at file:///Users/Orange/private/voice.wav",
      embeddedFileNotice: "trace_file:///Users/Orange/private/voice.wav",
      posixNotice: "failed at /srv/danmu/app.ndjson",
      safe: "ordinary diagnostic value",
    },
  });

  const record = JSON.parse(line);
  assert.deepEqual(record.data, { safe: "ordinary diagnostic value" });
  assert.doesNotMatch(line, /Authorization|Bearer|file:\/\/|\/srv\/danmu|\/Users\/Orange/iu);
});

test("路径脱敏覆盖 POSIX 单段、POSIX 根路径和 Windows 驱动器根路径", async () => {
  const { createDiagnosticLogger } = await import("../src/diagnostics/diagnosticLogger.ts");
  const logger = createDiagnosticLogger({ now: () => 2525, sessionId: "launch-2a", invoke: async () => {} });
  const unsafePaths = ["/", "/tmp", "prefix /tmp", "C:\\", "prefix C:\\"];

  for (const path of unsafePaths) {
    const record = JSON.parse(logger.record({
      subsystem: "diagnostic",
      action: "path-boundary",
      outcome: "success",
      data: { path },
    }));
    assert.equal("data" in record, false, "path leaked: " + path);
  }
});

test("顶层字符串字段使用同一脱敏策略但仍保留统一信封", async () => {
  const { createDiagnosticLogger } = await import("../src/diagnostics/diagnosticLogger.ts");
  const logger = createDiagnosticLogger({
    now: () => 2550,
    sessionId: "file:///Users/Orange/private/session.log",
    invoke: async () => {},
  });
  const record = JSON.parse(logger.record({
    subsystem: "Authorization: Bearer abc123",
    action: "file:///Users/Orange/private/action.log",
    outcome: "/srv/danmu/app.ndjson",
    connectionId: "Bearer connection-secret",
    eventId: "event-safe",
    roomId: "/var/private/room-id",
  }));

  assert.equal(record.t, 2550);
  assert.equal(record.kind, "app");
  assert.equal(record.sessionId, "[redacted]");
  assert.equal(record.subsystem, "[redacted]");
  assert.equal(record.action, "[redacted]");
  assert.equal(record.outcome, "[redacted]");
  assert.equal("connectionId" in record, false);
  assert.equal(record.eventId, "event-safe");
  assert.equal("roomId" in record, false);
  assert.doesNotMatch(JSON.stringify(record), /Authorization|Bearer|file:\/\/|\/srv\/danmu|\/var\/private/iu);
});

test("缺失 invoke 时日志状态为 degraded 且刷盘失败可见但不抛错", async () => {
  const { createDiagnosticLogger } = await import("../src/diagnostics/diagnosticLogger.ts");
  const logger = createDiagnosticLogger({ now: () => 2600, sessionId: "launch-2c" });
  logger.record({ subsystem: "app", action: "start", outcome: "success" });

  assert.equal(logger.getStatus(), "degraded");
  const result = await logger.flush();
  assert.equal(result.failed, 1);
  assert.equal(result.pending, 1);
  assert.equal(result.writeFailures, 1);
  assert.equal(logger.getStatus(), "degraded");
});

test("诊断记录按日期文件名缓冲为 NDJSON 并在刷盘时调用 append_log", async () => {
  const { createDiagnosticLogger } = await import("../src/diagnostics/diagnosticLogger.ts");
  const calls = [];
  const now = () => Date.UTC(2026, 8, 13, 1, 2, 3);
  const logger = createDiagnosticLogger({
    invoke: async (command, args) => calls.push({ command, args }),
    now,
    sessionId: "launch-3",
  });
  const line = logger.record({ subsystem: "app", action: "start", outcome: "success" });

  assert.equal(calls.length, 0);
  const result = await logger.flush();

  assert.equal(result.failed, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "append_log");
  assert.match(calls[0].args.file, /^app-\d{8}\.ndjson$/);
  assert.equal(calls[0].args.lines, `${line}\n`);
});

test("刷盘失败不抛出、保留待写行并让 degraded 状态可见", async () => {
  const { createDiagnosticLogger } = await import("../src/diagnostics/diagnosticLogger.ts");
  const calls = [];
  let shouldFail = true;
  const logger = createDiagnosticLogger({
    invoke: async (command, args) => {
      calls.push({ command, args });
      if (shouldFail) throw new Error("append failed");
    },
    now: () => 3000,
    sessionId: "launch-4",
  });
  const line = logger.record({ subsystem: "app", action: "failure", outcome: "failure" });

  const failed = await logger.flush();
  assert.equal(failed.failed, 1);
  assert.equal(logger.getStatus(), "degraded");

  shouldFail = false;
  const recovered = await logger.flush();
  assert.equal(recovered.failed, 0);
  assert.equal(recovered.writeFailures, 1);
  assert.equal(logger.getStatus(), "degraded");
  assert.match(calls[1].args.lines, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("刷盘进行期间新增的记录由同一次 flush 等待并写出", async () => {
  const { createDiagnosticLogger } = await import("../src/diagnostics/diagnosticLogger.ts");
  const calls = [];
  const releases = [];
  const logger = createDiagnosticLogger({
    invoke: async (command, args) => {
      calls.push({ command, args });
      return new Promise((resolve) => releases.push(resolve));
    },
    now: () => 4000,
    sessionId: "launch-5",
  });

  logger.record({ subsystem: "app", action: "first", outcome: "success" });
  const flushing = logger.flush();
  logger.record({ subsystem: "app", action: "second", outcome: "success" });
  const sameFlush = logger.flush();

  assert.equal(calls.length, 1);
  assert.equal(releases.length, 1);
  releases.shift()();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(calls.length, 2);
  assert.equal(JSON.parse(calls[0].args.lines).seq, 1);
  assert.equal(JSON.parse(calls[1].args.lines).seq, 2);
  releases.shift()();

  const [firstResult, secondResult] = await Promise.all([flushing, sameFlush]);
  assert.deepEqual(firstResult, { failed: 0, flushed: 2, pending: 0, writeFailures: 0, droppedRecords: 0 });
  assert.deepEqual(secondResult, firstResult);
});

test("并发刷盘失败后待写缓冲仍有界并报告因恢复而丢弃的记录数", async () => {
  const { createDiagnosticLogger } = await import("../src/diagnostics/diagnosticLogger.ts");
  let rejectWrite;
  const logger = createDiagnosticLogger({
    invoke: async () => new Promise((resolve, reject) => {
      rejectWrite = reject;
    }),
    now: () => 4500,
    sessionId: "launch-5b",
  });

  logger.record({ subsystem: "app", action: "first", outcome: "success" });
  const flushing = logger.flush();
  for (let index = 0; index < 1200; index += 1) {
    logger.record({ subsystem: "event", action: "during-write", outcome: "success", data: { index } });
  }
  const sameFlush = logger.flush();

  rejectWrite(new Error("append failed"));
  const [firstResult, secondResult] = await Promise.all([flushing, sameFlush]);
  assert.equal(firstResult.failed, 1);
  assert.equal(firstResult.pending, 1000);
  assert.equal(firstResult.droppedRecords, 201);
  assert.deepEqual(secondResult, firstResult);
  assert.equal(logger.getStatus(), "full");
});

test("写入持续失败时待写记录保持有界并将 full 状态暴露给调用方", async () => {
  const { createDiagnosticLogger } = await import("../src/diagnostics/diagnosticLogger.ts");
  const total = 1200;
  const logger = createDiagnosticLogger({
    invoke: async () => {
      throw new Error("append failed");
    },
    now: () => 5000,
    sessionId: "launch-6",
  });

  for (let index = 0; index < total; index += 1) {
    logger.record({ subsystem: "event", action: "burst", outcome: "success", data: { index } });
  }

  const result = await logger.flush();
  assert.equal(result.failed, 1);
  assert.ok(result.pending > 0);
  assert.ok(result.pending < total);
  assert.equal(logger.getStatus(), "full");
});

for (const stream of ["app", "source", "render"]) {
  test(`${stream} 显式刷盘只写调用边界，健康计数包含正在写入的批次`, async () => {
    const { DiagnosticLogger, DiagnosticStreamLogger, createDiagnosticContext } = await import("../src/diagnostics/diagnosticLogger.ts");
    const context = createDiagnosticContext({ invoke: async () => {}, flushIntervalMs: 0 });
    const writes = [];
    let release;
    const dependencies = { context, stream, flushIntervalMs: 0, invoke: async (_command, args) => {
      writes.push(args);
      await new Promise(resolve => { release = resolve; });
    } };
    const logger = stream === "app" ? new DiagnosticLogger(dependencies) : new DiagnosticStreamLogger(dependencies);
    const record = () => logger.record({ subsystem: "test", action: "record", outcome: "ok", record: { value: 1 } });
    try {
      record();
      const first = logger.flush();
      record();
      assert.equal(logger.getHealthSnapshot().pending, 2);
      release();
      assert.deepEqual(await first, { failed: 0, flushed: 1, pending: 1, writeFailures: 0, droppedRecords: 0 });
      assert.equal(writes.length, 1);
      const second = logger.flush();
      release();
      assert.equal((await second).pending, 0);
    } finally { logger.stop(); context.stop(); }
  });
}

test("空刷盘后同一轮新增记录的显式刷盘不会复用空结果", async () => {
  const { createDiagnosticLogger } = await import("../src/diagnostics/diagnosticLogger.ts");
  const writes = [];
  const logger = createDiagnosticLogger({ flushIntervalMs: 0, invoke: async (_command, args) => writes.push(args) });
  try {
    const empty = logger.flush();
    logger.record({ subsystem: "test", action: "new", outcome: "ok" });
    const next = logger.flush();
    assert.equal((await empty).flushed, 0);
    assert.equal((await next).flushed, 1);
    assert.equal(writes.length, 1);
  } finally { logger.stop(); }
});
