import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
    estimateExportRemainingSeconds,
    exportProgressPercent,
    formatExportRemaining,
    hasReliableExportProgressSample,
} from "../src/diagnostics/exportProgress.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${root}/${path}`, "utf8");

test("导出进度按已处理日志量计算百分比，并在完成时到达100%", () => {
  assert.equal(exportProgressPercent({ processedBytes: 25, totalBytes: 100, complete: false }), 25);
  assert.equal(exportProgressPercent({ processedBytes: 250, totalBytes: 100, complete: false }), 99);
  assert.equal(exportProgressPercent({ processedBytes: 100, totalBytes: 100, complete: true }), 100);
});

test("导出进度能够估算剩余时长并处理尚未有样本的阶段", () => {
  assert.equal(estimateExportRemainingSeconds({ processedBytes: 100, totalBytes: 300, elapsedMs: 2000 }), 4);
  assert.equal(estimateExportRemainingSeconds({ processedBytes: 0, totalBytes: 300, elapsedMs: 2000 }), null);
  assert.equal(formatExportRemaining(null), "剩余时间计算中");
  assert.equal(formatExportRemaining(90), "预计剩余 1 分 30 秒");
});

test("导出剩余时长在预热采样不足时保持计算中", () => {
  assert.equal(hasReliableExportProgressSample({ processedBytes: 1024 * 1024, totalBytes: 100 * 1024 * 1024, elapsedMs: 1000 }), false);
  assert.equal(hasReliableExportProgressSample({ processedBytes: 4 * 1024 * 1024, totalBytes: 100 * 1024 * 1024, elapsedMs: 500, sampleCount: 1 }), false);
  assert.equal(hasReliableExportProgressSample({ processedBytes: 4 * 1024 * 1024, totalBytes: 100 * 1024 * 1024, elapsedMs: 500, sampleCount: 2 }), true);
  assert.equal(formatExportRemaining(1), "即将完成");
});

test("诊断导出界面订阅进度事件并显示进度条与剩余时长", () => {
  const rust = read("src-tauri/src/diagnostics.rs");
  const component = read("src/components/DiagnosticSettings.tsx");
  assert.match(rust, /diagnostic:export-progress/);
  assert.match(rust, /processedBytes/);
  assert.match(rust, /totalBytes/);
  assert.match(component, /diagnostic:export-progress/);
  assert.match(component, /<Progress[^>]*value=/);
  assert.match(component, /formatExportRemaining/);
});

test("剩余时长只在新的导出进度节点到达时更新", () => {
  const component = read("src/components/DiagnosticSettings.tsx");
  assert.match(component, /setExportRemaining/);
  assert.match(component, /exportRateRef/);
  assert.match(component, /previousExportProgressRef/);
  assert.match(component, /hasReliableExportProgressSample/);
  assert.match(component, /requestAnimationFrame/);
  assert.match(component, /displayExportPercent/);
  assert.doesNotMatch(component, /setInterval\(\(\) => setNow\(Date\.now\(\), 500\)/);
});

test("导出大日志按固定字节节点发送进度", () => {
  const rust = read("src-tauri/src/diagnostics.rs");
  assert.match(rust, /EXPORT_PROGRESS_CHUNK_BYTES/);
  assert.match(rust, /read_export_log/);
  assert.doesNotMatch(rust, /fs::read_to_string\(d\.join\(n\)\)/);
});

test("导出读取缓冲区放在堆上，避免大数组耗尽线程栈", () => {
  const rust = read("src-tauri/src/diagnostics.rs");
  assert.match(rust, /let mut buffer = vec!\[0u8; EXPORT_PROGRESS_CHUNK_BYTES\]/);
  assert.doesNotMatch(rust, /let mut buffer = \[0u8; EXPORT_PROGRESS_CHUNK_BYTES\]/);
});

test("导出进度事件按时间节流，避免大文件读取时事件洪水", () => {
  const rust = read("src-tauri/src/diagnostics.rs");
  assert.match(rust, /ExportProgressReporter/);
  assert.match(rust, /EXPORT_PROGRESS_MIN_INTERVAL_MS/);
});

test("完整日志导出放到后台阻塞线程，不占用界面处理路径", () => {
  const rust = read("src-tauri/src/diagnostics.rs");
  assert.match(rust, /pub async fn export_diagnostic_bundle/);
  assert.match(rust, /spawn_blocking\(move \|\| \{\s*export_diagnostic_bundle_sync/);
  assert.match(rust, /fn export_diagnostic_bundle_sync/);
});
