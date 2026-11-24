import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readApplicationSources } from './helpers/applicationSources.mjs';

const rust = readFileSync(
  fileURLToPath(new URL('../src-tauri/src/lib.rs', import.meta.url)),
  'utf8',
);
const app = readApplicationSources();

test('托盘菜单提供主窗口、两个副窗口、设置和问题标记入口', () => {
  for (const id of ['show', 'toggle-display', 'toggle-gift', 'open-settings', 'mark-issue', 'quit']) {
    assert.match(
      rust,
      new RegExp(`MenuItem::with_id\\(\\s*app,\\s*"${id}"`),
      `缺少托盘菜单项：${id}`,
    );
  }
  assert.match(rust, /"显示弹幕窗"/);
  assert.match(rust, /"隐藏弹幕窗"/);
  assert.match(rust, /"显示收益窗"/);
  assert.match(rust, /"隐藏收益窗"/);
});

test('托盘动作转发到前端而不重复实现窗口和诊断逻辑', () => {
  assert.match(rust, /app\.emit\("tray:toggle-display-window", \(\)\)/);
  assert.match(rust, /app\.emit\("tray:toggle-gift-window", \(\)\)/);
  assert.match(rust, /app\.emit\("tray:open-settings", \(\)\)/);
  assert.match(rust, /app\.emit\("tray:mark-issue", \(\)\)/);

  assert.match(app, /listen\("tray:toggle-display-window"/);
  assert.match(app, /listen\("tray:toggle-gift-window"/);
  assert.match(app, /listen\("tray:open-settings"/);
  assert.match(app, /listen\("tray:mark-issue"/);
  assert.match(app, /toggleDisplayWindow\(\)/);
  assert.match(app, /toggleGiftWindow\(\)/);
});

test('副窗口状态变化会更新托盘菜单文案', () => {
  assert.match(rust, /fn build_tray_menu/);
  assert.match(rust, /if display_open \{ "隐藏弹幕窗" \} else \{ "显示弹幕窗" \}/);
  assert.match(rust, /if gift_open \{ "隐藏收益窗" \} else \{ "显示收益窗" \}/);
  assert.match(rust, /fn set_tray_window_state/);
  assert.match(rust, /tray\.set_menu\(Some\(menu\)\)/);
  assert.match(app, /invoke\("set_tray_window_state"/);
});

test('托盘退出监听属于应用生命周期，隐藏设置不会吞掉退出请求', () => {
  assert.match(app, /listen\("app:prepare-quit", prepareQuit\)/);
  assert.match(rust, /begin_app_quit,/);
});

test('托盘标记问题先打开诊断对话框，不直接写入默认备注', () => {
  const markBranchStart = rust.indexOf('"mark-issue" =>');
  const markBranchEnd = rust.indexOf('"quit" =>', markBranchStart);
  const markBranch = rust.slice(markBranchStart, markBranchEnd);
  assert.match(markBranch, /show_main_window\(app\)/);
  assert.match(markBranch, /app\.emit\("tray:mark-issue", \(\)\)/);
  assert.match(app, /openDiagnosticMarker/);
  assert.match(app, /sectionId:\s*"other",\s*anchorId:\s*"diagnostics",\s*action:\s*"mark-issue"/);
  assert.doesNotMatch(app, /tray:mark-issue[\s\S]*markDiagnosticIssue\("托盘标记"\)/);
});
