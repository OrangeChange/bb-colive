import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { windowDiagnosticRuntime, mountFloatingWindow } from './helpers/windowDiagnosticRuntime.mjs';

const source = readFileSync(
  fileURLToPath(new URL('../src-tauri/src/lib.rs', import.meta.url)),
  'utf8',
);

test('退出应用前显式关闭弹幕窗和礼物窗', () => {
  assert.match(source, /fn close_floating_windows\(app: &tauri::AppHandle\)/);
  assert.match(source, /FLOATING_WINDOW_LABELS.*\["display", "gift", "gift-only", "superchat", "guard"\]/);

  const quitStart = source.indexOf('fn finish_app_quit(app:');
  const quitEnd = source.indexOf('\nfn request_app_quit', quitStart);
  const quit = source.slice(quitStart, quitEnd);
  const closeIndex = quit.indexOf('close_floating_windows(app)');
  const exitIndex = quit.indexOf('app.exit(0)');
  assert.ok(closeIndex >= 0, 'quit_app 必须显式关闭副窗口');
  assert.ok(exitIndex > closeIndex, '必须先关闭副窗口，再退出主程序');
});

test('托盘退出先请求主端准备，Rust 最终退出共用 quit_app 链路', () => {
  const quitMenu = source.slice(source.indexOf('"quit" =>'), source.indexOf('\n                    _ => {}', source.indexOf('"quit" =>')));
  assert.match(quitMenu, /request_app_quit\(app\)/);
  assert.doesNotMatch(quitMenu, /app\.exit\(0\)/);
  assert.match(source, /app\.emit_to\("main", "app:prepare-quit", \(\)\)/);
});

test('主窗口退出前停止全局语音控制器', () => {
  const app = readFileSync(fileURLToPath(new URL('../src/App.tsx', import.meta.url)), 'utf8');
  assert.match(app, /voiceController/);
  assert.match(app, /shutdownVoice/);
  assert.match(app, /shutdownVoiceRuntime/);
});

test('热重载释放旧语音模块实例，避免旧队列继续播报', () => {
  const runtime = readFileSync(fileURLToPath(new URL('../src/voice/voiceRuntime.ts', import.meta.url)), 'utf8');
  assert.match(runtime, /import\.meta\.hot[\s\S]*dispose/);
  assert.match(runtime, /dispose\(\(\) => \{[\s\S]*shutdownVoiceRuntime\(\)/);
});

test('实际副窗 StrictMode 清理、移动、锁定、关闭均经主端，几何保存早于原生销毁', async () => {
  for (const label of ['display', 'gift']) {
    const runtime = await windowDiagnosticRuntime(label);
    let cleanup;
    try {
      cleanup = await mountFloatingWindow(runtime, true);
      assert.equal(typeof runtime.port.moved, 'function'); assert.equal(typeof runtime.port.close, 'function');
      const listeners = runtime.listenerCount();
      runtime.port.moved({ payload: { x: 70, y: 90 } });
      runtime.port.resized({ payload: { width: 600, height: 700 } });
      await runtime.port.emitTo(label, `${label}:lock`, true);
      await new Promise((resolve) => setImmediate(resolve));
      let prevented = false;
      await runtime.port.close({ preventDefault: () => { prevented = true; } });
      assert.equal(prevented, true);
      const save = runtime.port.calls.findIndex((call) => call.command === 'save');
      const destroy = runtime.port.calls.findIndex((call) => call.command === 'destroy');
      assert.ok(save >= 0 && destroy > save);
      assert.equal(runtime.port.calls.find((call) => call.command === 'save').file, `${label}-window.local.json`);
      await runtime.receiver.flush();
      const records = runtime.records();
      assert.equal(records.filter((record) => record.subsystem === 'window' && record.action === 'open' && record.outcome === 'ready').length, 1);
      for (const outcome of ['moved', 'resized', 'applied', 'saved']) assert.ok(records.some((record) => record.outcome === outcome));
      assert.ok(records.every((record) => record.windowLabel === label));
      assert.equal(runtime.port.calls.filter((call) => call.command === 'append_log').length, 0);
      assert.equal(runtime.listenerCount(), listeners);
    } finally { await cleanup?.(); await runtime.finish(); }
  }
});
