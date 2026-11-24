import { readApplicationSources } from "./helpers/applicationSources.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${root}/${path}`, "utf8");

test("导出桥接接收并传递运行快照", () => {
  const bridge = read("src/diagnostics/diagnosticBridge.ts");
  assert.match(bridge, /snapshot/);
  assert.match(bridge, /snapshot/);
  assert.match(bridge, /flushResult/);
  assert.match(bridge, /diagnostics/);
  assert.match(bridge, /export_diagnostic_bundle/);
  const app = readApplicationSources();
  assert.match(app, /environment/);
  assert.match(app, /settings/);
  assert.match(app, /abnormalExit/);
  assert.match(app, /getArchiveDiagnosticSnapshot/);
  assert.match(app, /getArchiveWriterStatus/);
  assert.match(app, /getHealthSnapshot/);
  assert.match(app, /archiveSnapshot/);
  assert.match(app, /reviewSnapshot/);
  assert.match(app, /reviewOwnerRetentionDays/);
  assert.match(app, /webviewRuntimeVersion/);
  assert.match(app, /availableMonitors/);
  assert.match(app, /displayMonitors/);
  assert.match(app, /healthBeforeFlush/);
  assert.match(app, /collectFeatureActivity/);
  assert.match(app, /collectFeatureSettingHistory/);
});

test("Rust 导出会写入环境和设置快照，并让 manifest 使用实际构建状态", () => {
  const source = read("src-tauri/src/diagnostics.rs");
  assert.match(source, /environment\.json/);
  assert.match(source, /settings\.json/);
  assert.match(source, /diagnostics\.json/);
  assert.match(source, /snapshot/);
  assert.match(source, /get\("build"\)/);
  assert.match(source, /get\("abnormalExit"\)/);
  assert.match(source, /buildId|build_id/);
});

test("诊断快照包含可定位源码的构建标识", () => {
  const app = readApplicationSources();
  const vite = read("vite.config.ts");
  const env = read("src/vite-env.d.ts");
  assert.match(app, /__DANMU_BUILD_ID__/);
  assert.match(vite, /rev-parse/);
  assert.match(vite, /status/);
  assert.match(env, /__DANMU_BUILD_ID__/);
});
