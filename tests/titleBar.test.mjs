import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const titleBarPath = join(projectRoot, "src", "components", "TitleBar.tsx");

test("Tauri 主窗口关闭原生装饰，交给沉浸式标题栏承载", () => {
  const config = JSON.parse(readFileSync(join(projectRoot, "src-tauri", "tauri.conf.json"), "utf8"));
  assert.equal(config.app.windows[0].decorations, false);
});

test("窗口控制所需的 Tauri 权限已明确授权", () => {
  const capability = JSON.parse(readFileSync(join(projectRoot, "src-tauri", "capabilities", "default.json"), "utf8"));
  const permissions = capability.permissions;
  for (const permission of [
    "core:window:allow-close",
    "core:window:allow-is-maximized",
    "core:window:allow-minimize",
    "core:window:allow-unminimize",
    "core:window:allow-hide",
    "core:window:allow-start-dragging",
    "core:window:allow-toggle-maximize",
    "core:window:allow-set-title",
    "core:window:allow-inner-size",
    "core:window:allow-scale-factor",
    "core:window:allow-set-size",
    "core:window:allow-destroy",
  ]) {
    assert.equal(permissions.includes(permission), true, `缺少权限：${permission}`);
  }
});

test("主窗口最终退出失败后保留关闭重试能力", () => {
  const source = readFileSync(join(projectRoot, "src", "runtime", "useApplicationLifecycle.ts"), "utf8");
  assert.match(source, /await flushDiagnostics\(\)[\s\S]*?closeAllowed\s*=\s*true[\s\S]*?invoke\("quit_app"\)/);
  assert.match(source, /invoke\("quit_app"\)[\s\S]*?catch[\s\S]*?closeAllowed\s*=\s*false[\s\S]*?closeInProgress\s*=\s*false/);
});

test("沉浸式标题栏提供拖拽与完整窗口控制", () => {
  assert.equal(existsSync(titleBarPath), true, "沉浸式标题栏组件尚未创建");
  const source = readFileSync(titleBarPath, "utf8");
  assert.match(source, /data-tauri-drag-region/);
  assert.match(source, /\.minimize\(\)/);
  assert.match(source, /\.toggleMaximize\(\)/);
  assert.match(source, /\.hide\(\)/);
  assert.match(source, /\.close\(\)/);
  assert.doesNotMatch(source, /invoke\("quit_app"\)/);
  assert.doesNotMatch(source, /onCloseRequested/);
  assert.match(source, /\.setTitle\(/);
  assert.match(source, /getWindowTitle/);
  assert.match(source, /onDoubleClick/);
  assert.match(source, /onResized/);
  assert.match(source, /aria-label="最小化窗口"/);
  assert.match(source, /aria-label="关闭窗口"/);
});

test("标题栏位于整个应用壳层顶部，不挤占现场内部工具条", () => {
  const source = readFileSync(join(projectRoot, "src", "App.tsx"), "utf8");
  assert.match(source, /<TitleBar \/>[\s\S]*?className="flex min-h-0 flex-1"/);
});
