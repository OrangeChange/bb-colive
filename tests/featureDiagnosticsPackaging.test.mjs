import { readApplicationSources } from "./helpers/applicationSources.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${root}/${path}`, "utf8");

test("功能诊断源码由前端入口纳入构建，导出文件由 Rust 清单负责写入", () => {
  const app = readApplicationSources();
  const featureModule = read("src/diagnostics/featureDiagnostics.ts");
  const rust = read("src-tauri/src/diagnostics.rs");
  assert.match(app, /diagnostics\/featureDiagnostics/);
  assert.match(featureModule, /FEATURE_DIAGNOSTIC_CATALOG/);
  assert.match(featureModule, /assertFeatureCoverage/);
  assert.match(featureModule, /snapshotSchema/);
  assert.match(featureModule, /failureHooks/);
  assert.match(rust, /feature-manifest\.json/);
  assert.match(rust, /snapshotSchema/);
  assert.match(rust, /sourceRenderBoundary/);
  assert.match(rust, /README\.txt/);
  assert.match(rust, /feature-manifest\.json 记录当前功能的/);
});

test("功能诊断没有偷偷引入未登记的 Tauri 外部资源", () => {
  const config = JSON.parse(read("src-tauri/tauri.conf.json"));
  assert.deepEqual(config.bundle.resources, { "style-distribution/": "style/", "../licenses/distribution/": "licenses/" });
});
