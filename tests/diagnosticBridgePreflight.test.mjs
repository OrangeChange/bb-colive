import assert from "node:assert/strict";
import test from "node:test";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { createDiagnosticBridge } from "../src/diagnostics/diagnosticBridge.ts";
import { createDiagnosticLogger } from "../src/diagnostics/diagnosticLogger.ts";
import { unzipSync, strFromU8 } from "fflate";

test("导出前刷盘结果进入诊断快照并返回给调用方", async () => {
  const calls = [];
  const flushResult = { failed: 0, flushed: 3, pending: 0, writeFailures: 0, droppedRecords: 0 };
  const bridge = createDiagnosticBridge({
    flush: async () => flushResult,
    invoke: async (command, args) => {
      calls.push({ command, args });
      return { outputPath: args.outputPath, files: ["manifest.json"], mode: args.mode, bytes: 42 };
    },
  });

  const result = await bridge.exportBundle("24h", "D:\\diagnostic.zip", { build: "test" });
  assert.deepEqual(result.flush, flushResult);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args.snapshot.diagnostics.flush, flushResult);
});

test("Rust DTO 实际序列化结果映射实际路径与最终缺失项", async () => {
  const evidence = mkdtempSync(join(tmpdir(), "danmu-diagnostic-contract-"));
  mkdirSync(join(evidence, "logs"));
  const logger = createDiagnosticLogger({ sessionId: "launch-bridge", flushIntervalMs: 0,
    invoke: async (_command, args) => appendFileSync(join(evidence, "logs", args.file), args.lines),
  });
  logger.record({ subsystem: "test", action: "first", outcome: "ok" });
  logger.record({ subsystem: "test", action: "second", outcome: "ok" });
  const flush = { failed: 0, flushed: 2, pending: 0, writeFailures: 0, droppedRecords: 0 };
  let dto;
  const bridge = createDiagnosticBridge({ flush: () => logger.flush(), invoke: async (_command, args) => {
    const rust = spawnSync("cargo", ["test", "diagnostics::tests::export_contract_evidence", "--", "--nocapture"], {
      cwd: fileURLToPath(new URL("../src-tauri", import.meta.url)),
      env: { ...process.env, DIAGNOSTIC_EXPORT_EVIDENCE: evidence,
        DIAGNOSTIC_EXPORT_DIAGNOSTICS: JSON.stringify(args.snapshot.diagnostics) }, encoding: "utf8",
    });
    console.log(rust.stdout + rust.stderr);
    assert.equal(rust.status, 0, rust.stdout + rust.stderr);
    dto = JSON.parse(readFileSync(join(evidence, "result.json"), "utf8"));
    return dto;
  } });
  try {
    const result = await bridge.exportBundle("full", join(evidence, "diagnostic.zip"), {});
    assert.equal(result.outputPath, dto.output_path);
    assert.deepEqual(result.missingSnapshots, ["settings.json", "startup-behavior:settings.general.startOnBoot"]);
    assert.deepEqual(result.flush, flush);
    for (const name of ["diagnostic.zip", "diagnostic (1).zip"]) {
      const zip = unzipSync(readFileSync(join(evidence, name)));
      const manifest = JSON.parse(strFromU8(zip["manifest.json"]));
      assert.deepEqual(manifest.missingSnapshots, result.missingSnapshots);
      assert.deepEqual(JSON.parse(strFromU8(zip["diagnostics.json"])).flush, result.flush);
      const app = Object.keys(zip).find(key => key.startsWith("app-"));
      const records = strFromU8(zip[app]).trim().split("\n").map(line => JSON.parse(line));
      assert.deepEqual(records.map(record => record.seq), [1, 2]);
      assert.ok(records.every(record => record.sessionId === "launch-bridge"));
    }
  } finally { logger.stop(); }
});

test("未提供运行快照时仍将最后刷盘结果写入导出快照", async () => {
  const flush = { failed: 1, flushed: 0, pending: 1, writeFailures: 1, droppedRecords: 0 };
  let snapshot;
  const bridge = createDiagnosticBridge({ flush: async () => flush, invoke: async (_command, args) => {
    snapshot = args.snapshot;
    return { output_path: "actual.zip", mode: "24h", files: [], bytes: 1, missing_snapshots: [] };
  } });
  await bridge.exportBundle("24h", "requested.zip");
  assert.deepEqual(snapshot?.diagnostics?.flush, flush);
});
