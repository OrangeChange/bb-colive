import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("开发模式提供脱离 Codex 会话的启动入口", () => {
  const packageJson = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"));
  assert.equal(
    packageJson.scripts["dev:detached"],
    "wscript.exe //B //NoLogo scripts/start-dev-detached.vbs",
  );
  assert.equal(existsSync(join(projectRoot, "scripts", "start-dev-detached.ps1")), true);
  assert.equal(existsSync(join(projectRoot, "scripts", "start-dev-detached.vbs")), true);
});

test("无控制台入口使用 wscript 静默启动 PowerShell", () => {
  const launcherPath = join(projectRoot, "scripts", "start-dev-detached.vbs");
  const source = readFileSync(launcherPath, "utf8");
  assert.match(source, /CreateObject\("WScript\.Shell"\)/);
  assert.match(source, /shell\.Run command, 0, False/);
  assert.match(source, /-WindowStyle Hidden/);
});

test("独立启动器使用隐藏的计划任务并保留 9223 调试端口", () => {
  const launcherPath = join(projectRoot, "scripts", "start-dev-detached.ps1");
  assert.equal(existsSync(launcherPath), true, "独立启动器尚未创建");
  const source = readFileSync(launcherPath, "utf8");
  assert.match(source, /Register-ScheduledTask/);
  assert.match(source, /Start-ScheduledTask/);
  assert.match(source, /-Hidden/);
  assert.match(source, /remote-debugging-port=9223/);
  assert.match(source, /Get-Process -Name "bb-colive"/);
  assert.match(source, /State -eq "Running" -or \$app/);
});

test("调试启动日志记录唯一源码目录和版本", () => {
  const launcherPath = join(projectRoot, "scripts", "start-dev-detached.ps1");
  const source = readFileSync(launcherPath, "utf8");
  assert.match(source, /\$projectRoot\s*=\s*\(Resolve-Path -LiteralPath \(Split-Path -Parent \$PSScriptRoot\)\)\.Path/);
  assert.match(source, /ConvertFrom-Json/);
  assert.match(source, /source=\$projectRoot/);
  assert.match(source, /package\.version/);
});

test("Windows PowerShell 启动脚本使用统一 CRLF，避免文件解析失败", () => {
  const bytes = readFileSync(join(projectRoot, "scripts", "start-dev-detached.ps1"));
  const source = bytes.toString("utf8");
  assert.equal(source.replace(/\r\n/g, "").includes("\n"), false);
  assert.equal(source.replace(/\r\n/g, "").includes("\r"), false);
});

test("开发日志按 UTF-8 写入，避免 PowerShell 原生重定向产生空字节", () => {
  const source = readFileSync(join(projectRoot, "scripts", "start-dev-detached.ps1"), "utf8");
  assert.match(source, /RedirectStandardOutput \$tauriLogPath/);
  assert.match(source, /RedirectStandardError \$tauriErrorPath/);
  assert.doesNotMatch(source, /\*>> \$logPath/);
});

test("独立启动 Vite，避免 Tauri 内置 beforeDevCommand 创建可见终端", () => {
  const source = readFileSync(join(projectRoot, "scripts", "start-dev-detached.ps1"), "utf8");
  assert.match(source, /Start-Process/);
  assert.match(source, /Get-Command node\.exe/);
  assert.match(source, /viteScript/);
  assert.match(source, /tauriScript/);
  assert.match(source, /Get-NetTCPConnection.*1420.*Listen/);
  assert.doesNotMatch(source, /Invoke-WebRequest.*1420/);
  assert.match(source, /beforeDevCommand/);
  assert.match(source, /tauri-dev-override\.json/);
  assert.match(source, /Set-Content -LiteralPath \$configPath/);
  assert.match(source, /Start-Process/);
  assert.match(source, /ArgumentList.*\$tauriScript/);
  assert.match(source, /RedirectStandardOutput \$tauriLogPath/);
  assert.match(source, /--config.*\$configPath/);
  assert.doesNotMatch(source, /\$configOverride/);
  assert.doesNotMatch(source, /npm\.cmd/);
  assert.doesNotMatch(source, /& \$node /);
});

test("脱离启动器在应用存活期间托管 Vite，并固定本机监听地址", () => {
  const source = readFileSync(join(projectRoot, "scripts", "start-dev-detached.ps1"), "utf8");
  assert.match(source, /viteScript, "--host", "127\.0\.0\.1"/);
  assert.match(source, /while \(Get-Process -Name "bb-colive"/);
  assert.match(source, /taskkill\.exe \/PID \$vite\.Id \/T \/F/);
  assert.doesNotMatch(source, /detached worker is exiting/);
});

test("Debug 和 Release 版 Tauri 都不创建可见控制台窗口", () => {
  const source = readFileSync(join(projectRoot, "src-tauri", "src", "main.rs"), "utf8");
  assert.match(source, /cfg_attr\(windows,\s*windows_subsystem\s*=\s*"windows"\)/);
  assert.doesNotMatch(source, /cfg_attr\(not\(debug_assertions\),\s*windows_subsystem/);
});
