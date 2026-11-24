import { readApplicationSources } from "./helpers/applicationSources.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${root}/${path}`, "utf8");

test("前端诊断上下文暴露丢弃和待写健康计数", async () => {
  const { createDiagnosticContext } = await import("../src/diagnostics/diagnosticLogger.ts");
  const context = createDiagnosticContext({ sessionId: "health-test", invoke: async () => {} });
  for (let index = 0; index < 1001; index += 1) {
    context.record({ subsystem: "test", action: "flood", outcome: "accepted" });
  }
  assert.equal(typeof context.getHealthSnapshot, "function");
  const health = context.getHealthSnapshot();
  assert.equal(health.status, "full");
  assert.equal(health.droppedRecords, 1);
});

test("TTS 记录器纳入全局刷盘并返回健康结果", async () => {
  const { createDiagnosticContext, flushAllDiagnosticLogs } = await import("../src/diagnostics/diagnosticLogger.ts");
  const { createTtsDiagnosticLogger } = await import("../src/voice/ttsDiagnostics.ts");
  const writes = [];
  createDiagnosticContext({ sessionId: "tts-health-test", invoke: async () => {} });
  const logger = createTtsDiagnosticLogger({
    invoke: async (_command, args) => { writes.push(args); },
    now: () => 2_000_000_000_000,
  });
  logger.record({ provider: "fish", requestId: "req-1", outcome: "success", stage: "complete" });
  const result = await flushAllDiagnosticLogs();
  assert.ok(writes.some((write) => write.file.startsWith("tts-")));
  assert.ok(result.flushed >= 1);
  assert.equal(typeof logger.getHealthSnapshot, "function");
});

test("Rust 诊断状态在达到容量上限时能够返回 full", () => {
  const source = read("src-tauri/src/diagnostics.rs");
  assert.match(source, /normal_bytes/);
  assert.match(source, /detailed_bytes/);
  assert.match(source, /detailed_bytes\s*>=\s*DETAIL_LIMIT/);
  assert.match(source, /"full"/);
});

test("source/render 流按独立上限与期限清理，且应用会周期触发清理", () => {
  const rust = read("src-tauri/src/diagnostics.rs");
  assert.match(rust, /is_detailed_log/);
  assert.match(rust, /DETAIL_RETENTION_DAYS/);
  assert.match(rust, /select_old_detailed_files/);
  const app = readApplicationSources();
  assert.match(app, /setInterval\(cleanup, 60 \* 1000\)/);
  assert.match(app, /cleanup_diagnostic_logs/);
});

test("诊断导出链路声明并写入功能覆盖清单", () => {
  const rust = read("src-tauri/src/diagnostics.rs");
  const app = readApplicationSources();
  assert.match(app, /collectFeatureManifest/);
  assert.match(app, /collectFeatureSnapshots/);
  assert.match(rust, /feature-manifest\.json/);
});

test("TTS 并发刷盘覆盖后一调用前记录并统计在写批次", async () => {
  const { createTtsDiagnosticLogger } = await import("../src/voice/ttsDiagnostics.ts");
  const writes = [];
  const releases = [];
  const logger = createTtsDiagnosticLogger({ invoke: async (_command, args) => {
    writes.push(args);
    await new Promise(resolve => releases.push(resolve));
  } });
  try {
    logger.record({ provider: "fish", requestId: "first", outcome: "success", stage: "complete" });
    const first = logger.flush();
    logger.record({ provider: "fish", requestId: "second", outcome: "success", stage: "complete" });
    const second = logger.flush();
    assert.equal(logger.getHealthSnapshot().pending, 2);
    releases.shift()();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(writes.length, 2);
    releases.shift()();
    const results = await Promise.all([first, second]);
    assert.deepEqual(results[0], { failed: 0, flushed: 2, pending: 0, writeFailures: 0, droppedRecords: 0 });
    assert.deepEqual(results[1], results[0]);
  } finally { logger.stop(); }
});
