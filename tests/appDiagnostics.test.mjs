import { readApplicationSources } from "./helpers/applicationSources.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

function read(path) {
  return readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");
}

test("应用根组件创建会话上下文并记录异常与退出生命周期", () => {
  const source = readApplicationSources();
  assert.match(source, /createDiagnosticContext/);
  assert.match(source, /window\.onerror/);
  assert.match(source, /unhandledrejection/);
  assert.match(source, /previousSessionUnclean/);
  assert.match(source, /sessionLifecycleRecordedRef/);
  assert.match(source, /sessionLifecycleRecordedRef\.current/);
  assert.match(source, /shutdown[\s\S]*clean/);
  assert.match(source, /flushAllDiagnosticLogs/);
});

test("应用诊断上下文注入真实 Tauri append_log invoke", () => {
  const source = readApplicationSources();
  assert.match(source, /createDiagnosticContext\(\{\s*invoke:\s*\(command, args\)\s*=>\s*invoke\(command, args\)/);
});

test("设置快照包含启动行为和事件个性化的完整配置", () => {
  const source = readApplicationSources();
  assert.match(source, /general:\s*\{[\s\S]*startOnBoot/);
  assert.match(source, /general:\s*\{[\s\S]*autoConnectOnStartup/);
  assert.match(source, /general:\s*\{[\s\S]*windowEventFontSize/);
  assert.match(source, /eventDisplayPreferences/);
  assert.match(source, /eventStyleSettings/);
});

test("启动行为会记录自启结果和自动连接的成功、失败、跳过原因", () => {
  const source = readApplicationSources();
  assert.match(source, /featureId:\s*["']startup-behavior["']/);
  assert.match(source, /enable-autostart|disable-autostart/);
  assert.match(source, /skipped-no-session|skipped-no-anchor/);
  assert.match(source, /startup-auto-connect/);
  assert.match(source, /connectionStatus/);
});

test("退出路径等待并消费刷盘结果，失败计数可见且不阻断退出", () => {
  const source = readApplicationSources();
  assert.match(source, /onCloseRequested/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /await flushWindowDiagnosticLogs\(\)/);
  assert.match(source, /diagnosticFlushResult/);
  assert.match(source, /writeFailures/);
  assert.match(source, /catch/);
});

test("导出进行中关闭窗口会等待导出完成", () => {
  const source = readApplicationSources();
  assert.match(source, /diagnosticExportInProgressRef/);
  assert.match(source, /if\s*\(diagnosticExportInProgressRef\.current\)/);
  assert.match(source, /await diagnosticExportCompletionRef\.current/);
});

test("刷盘失败时保留 active 状态而不写入 clean 标记", () => {
  const source = readApplicationSources();
  const flushStart = source.indexOf("const flushDiagnostics");
  const flushEnd = source.indexOf("const shutdown =", flushStart);
  assert.ok(flushStart >= 0);
  assert.ok(flushEnd > flushStart);

  const recordShutdownBody = source.slice(0, flushStart);
  const flushBody = source.slice(flushStart, flushEnd);
  assert.equal(recordShutdownBody.includes('writeDiagnosticSessionMarker("clean")'), false);
  assert.match(flushBody, /diagnosticFlushResult\.failed\s*===\s*0/);
  assert.match(flushBody, /diagnosticFlushResult\.pending\s*===\s*0/);
});

test("刷盘成功后才写入 clean 会话标记", () => {
  const source = readApplicationSources();
  const flushStart = source.indexOf("const flushDiagnostics");
  const flushEnd = source.indexOf("const shutdown =", flushStart);
  assert.ok(flushStart >= 0);
  assert.ok(flushEnd > flushStart);

  const flushBody = source.slice(flushStart, flushEnd);
  const flushIndex = flushBody.indexOf("await flushWindowDiagnosticLogs()");
  const cleanIndex = flushBody.indexOf('writeDiagnosticSessionMarker("clean")');
  assert.ok(flushIndex >= 0);
  assert.ok(cleanIndex > flushIndex);
  assert.match(
    flushBody,
    /if\s*\(\s*diagnosticFlushResult\.failed\s*===\s*0[\s\S]*?diagnosticFlushResult\.pending\s*===\s*0[\s\S]*?writeDiagnosticSessionMarker\("clean"\)/,
  );
});

test("全局异常保留安全的 source 摘要而不是固定处理器名", () => {
  const source = readApplicationSources();
  assert.match(source, /diagnosticSourceSummary/);
  assert.match(source, /recordGlobalDiagnosticError\(diagnosticContext, [\"']window\.onerror[\"'], _source/);
  assert.match(source, /new URL/);
});

test("连接阶段覆盖前置请求、可选资源和 WebSocket 生命周期", () => {
  const source = read("src/protocol/connection.ts");
  for (const stage of ["nav", "room_init", "master", "danmu_info", "buvid", "gift_config", "gift_effect", "websocket"]) {
    assert.match(source, new RegExp(stage));
  }
  assert.match(source, /cancelled/);
  assert.match(source, /durationMs/);
});
