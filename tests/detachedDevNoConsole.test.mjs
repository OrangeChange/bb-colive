import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("独立启动器为 Vite 和 Tauri 创建独立的无窗口进程", () => {
  const source = readFileSync(join(projectRoot, "scripts", "start-dev-detached.ps1"), "utf8");
  const viteBlock = source.slice(source.indexOf("$vite = Start-Process"), source.indexOf("$viteReady"));
  const tauriBlock = source.slice(source.indexOf("$tauri = Start-Process"), source.indexOf("$appReady"));
  assert.match(viteBlock, /-WindowStyle Hidden/);
  assert.match(tauriBlock, /-WindowStyle Hidden/);
  assert.doesNotMatch(viteBlock, /-NoNewWindow/);
  assert.doesNotMatch(tauriBlock, /-NoNewWindow/);
});

test("独立启动器为首次 Rust 编译保留足够的启动等待时间", () => {
  const source = readFileSync(join(projectRoot, "scripts", "start-dev-detached.ps1"), "utf8");
  const appWaitBlock = source.slice(source.indexOf("$appReady"), source.indexOf("if (-not $appReady)"));
  assert.match(appWaitBlock, /\$i -lt 240/);
});

test("计划任务通过无窗口的 WScript 启动 PowerShell worker", () => {
  const scriptSource = readFileSync(join(projectRoot, "scripts", "start-dev-detached.ps1"), "utf8");
  const launcherSource = readFileSync(join(projectRoot, "scripts", "start-dev-detached.vbs"), "utf8");
  const taskAction = scriptSource.slice(
    scriptSource.indexOf("$action = New-ScheduledTaskAction"),
    scriptSource.indexOf("Register-ScheduledTask"),
  );
  assert.match(taskAction, /-Execute \$wscript/);
  assert.doesNotMatch(taskAction, /-Execute \$powershell/);
  assert.match(launcherSource, /--worker/);
  assert.match(launcherSource, /shell\.Run command, 0, False/);
});
