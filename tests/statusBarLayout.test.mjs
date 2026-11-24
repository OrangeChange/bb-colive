import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const appSource = readFileSync(join(projectRoot, 'src/App.tsx'), 'utf8');

test('登录后的共享主工作区在页面切换之外固定挂载唯一底栏', () => {
  const appShell = appSource.slice(appSource.indexOf('function App()'));
  const providerStart = appShell.indexOf('<RoomInsightsProvider>');
  const providerEnd = appShell.indexOf('</RoomInsightsProvider>', providerStart);
  const providerContent = appShell.slice(providerStart, providerEnd);
  const statusBarIndex = providerContent.indexOf('<StatusBar />');
  const mainViews = ['scene', 'voice', 'personal', 'review', 'style'];

  assert.ok(providerStart >= 0, '四个主页面与底栏应共享直播概览上下文');
  assert.equal((providerContent.match(/<StatusBar \/>/g) ?? []).length, 1);
  assert.match(
    providerContent,
    /<div className="relative min-h-0 flex-1">[\s\S]*?<div hidden=\{mainView !== "style"\}[\s\S]*?<StylePanel[^>]*\/>\s*<\/div>\s*<\/div>\s*<StatusBar \/>/,
    '底栏应作为页面切换容器的固定同级元素',
  );
  assert.ok(statusBarIndex >= 0);
  for (const view of mainViews) {
    assert.ok(providerContent.slice(0, statusBarIndex).includes(`hidden={mainView !== "${view}"}`), `${view} 页面应在共享底栏上方切换`);
  }
});

test('语音和个性播报页面不再各自重复挂载底栏', () => {
  for (const panel of ['VoicePanel.tsx', 'PersonalBroadcastPanel.tsx']) {
    const source = readFileSync(join(projectRoot, 'src/components', panel), 'utf8');
    assert.equal(source.includes('<StatusBar />'), false, `${panel} 应使用 App 主工作区的共享底栏`);
  }
});

test('底栏固定单行，不能因窄现场列把版本号换到第二行', () => {
  const source = readFileSync(join(projectRoot, 'src/components/StatusBar.tsx'), 'utf8');
  const footer = source.slice(source.indexOf('<footer'), source.indexOf('</footer>') + '</footer>'.length);
  assert.match(footer, /flex-nowrap/);
  assert.doesNotMatch(footer, /flex-wrap/);
  assert.match(footer, /overflow-x-auto overflow-y-hidden/);
  assert.match(footer, /tabIndex=\{0\}/);
  assert.match(source, /status-bar-version/);
});

test('底栏概览在单行布局中不再内部换行', () => {
  const source = readFileSync(join(projectRoot, 'src/components/RoomOverviewBar.tsx'), 'utf8');
  assert.match(source, /flex-nowrap/);
  assert.match(source, /w-max min-w-full/);
  assert.doesNotMatch(source, /overflow-hidden/);
});

test('底栏窄现场列按优先级隐藏版本和事件数', () => {
  const css = readFileSync(join(projectRoot, 'src/App.css'), 'utf8');
  assert.match(css, /@container \(max-width: 920px\)[\s\S]*\.status-bar-version/);
  assert.match(css, /@container \(max-width: 760px\)[\s\S]*\.status-bar-event-count/);
});

test('系统提醒位于共享底栏右侧，连接状态不重复显示为实时记录', () => {
  const source = readFileSync(join(projectRoot, 'src/components/StatusBar.tsx'), 'utf8');
  assert.match(source, /status-bar-actions ml-auto/);
  assert.match(source, /<SystemReminderBell events=\{events\} placement="top" \/>/);
  assert.match(source, /overflow-visible/);
  assert.doesNotMatch(source, /实时记录中/);
});
