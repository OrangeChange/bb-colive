import { readApplicationSources } from "./helpers/applicationSources.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${root}/${path}`, "utf8");

test("诊断环境快照记录真实 WebView2 运行时版本，并接入导出快照", () => {
  const rust = read("src-tauri/src/diagnostics.rs");
  const app = readApplicationSources();

  assert.match(rust, /webview_runtime_version/);
  assert.match(rust, /webview_version_source/);
  assert.doesNotMatch(rust, /webview:\s*"tauri-webview"/);
  assert.match(rust, /WebView2/);
  assert.match(app, /get_diagnostic_environment/);
  assert.match(app, /webviewRuntimeVersion/);
});
