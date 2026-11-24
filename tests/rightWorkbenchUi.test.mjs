import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('../src/components/RightWorkbench.tsx', import.meta.url)),
  'utf8',
);
const cssSource = readFileSync(
  fileURLToPath(new URL('../src/App.css', import.meta.url)),
  'utf8',
);
const surfaceSource = readFileSync(
  fileURLToPath(new URL('../src/components/WorkbenchSurface.tsx', import.meta.url)),
  'utf8',
);
const uiDesignSource = readFileSync(
  fileURLToPath(new URL('../DESIGN.md', import.meta.url)),
  'utf8',
);
const requirementsSource = readFileSync(
  fileURLToPath(new URL('../docs/development/debugging-and-testing.md', import.meta.url)),
  'utf8',
);

test('工作台提供稳定的展开按钮、独立滚动区和底部设置区', () => {
  assert.match(source, /<aside/);
  assert.match(source, /aria-label="功能工作台"/);
  assert.match(source, /aria-expanded=\{expanded\}/);
  assert.match(source, /onClick=/);
  assert.match(surfaceSource, /overflow-y-auto/);
  assert.match(source, /设置/);
  assert.doesNotMatch(source, /设置面板尚未开放/);
  assert.match(source, /aria-label=\{settingsButtonLabel\}/);
  assert.match(source, /sr-only/);
  assert.match(source, /useConnection/);
  assert.match(source, /rightWorkbenchWidth\(expanded, workbenchWidth\)/);
  assert.match(source, /role="separator"/);
  assert.match(source, /aria-orientation="vertical"/);
  assert.match(source, /onPointerDown/);
  assert.match(source, /onKeyDown/);
  assert.match(source, /setPointerCapture/);
  assert.match(source, /clampRightWorkbenchWidth/);
  assert.match(cssSource, /right-workbench-resizer/);
  assert.match(cssSource, /cursor:\s*col-resize/);
  assert.match(cssSource, /\.right-workbench-content[\s\S]*width:\s*100%/);
});

test('顶部功能区复用设置页的内框、正文滚动条和内容留白', () => {
  assert.match(source, /data-workbench-surface=\{stylePreviewActive \? "style-preview" : "home"\}/);
  assert.match(source, /settings-panel-frame/);
  assert.match(source, /WorkbenchScroll/);
  assert.match(surfaceSource, /settings-panel-scroll/);
  assert.match(surfaceSource, /settings-panel-scrollbar/);
  assert.doesNotMatch(source, /right-workbench-content[^\n]+overflow-y-auto px-4 pt-4 pb-16/);
});

test('样式编辑时右侧工作台保留并切换为预览承载区', () => {
  const appSource = readFileSync(
    fileURLToPath(new URL('../src/App.tsx', import.meta.url)),
    'utf8',
  );
  assert.match(appSource, /active=\{phase === "loggedIn"\}/);
  assert.match(source, /stylePreviewActive/);
  assert.match(source, /data-workbench-surface=\{stylePreviewActive \? "style-preview" : "home"\}/);
  assert.match(source, /ref=\{previewRef\}/);
  assert.match(source, /样式预览/);
});

test('工作台当前直播间状态使用紧邻的横向状态行，不套用双列控件网格', () => {
  assert.match(source, /className="settings-status-row"/);
  assert.match(cssSource, /\.settings-status-row\s*\{[\s\S]*?display:\s*flex[\s\S]*?align-items:\s*center[\s\S]*?gap:\s*8px/);
});

test('设置入口只保留在右侧工作台，左侧不再放置旧设置按钮', () => {
  const sidebarSource = readFileSync(
    fileURLToPath(new URL('../src/components/Sidebar.tsx', import.meta.url)),
    'utf8',
  );
  assert.doesNotMatch(sidebarSource, /设置（步骤 7）/);
  assert.match(source, /right-workbench-settings/);
});

test('工作台接收上下文设置请求并复用现有展开流程', () => {
  assert.match(source, /settingsRequest/);
  assert.match(source, /setView\("settings"\)/);
  assert.match(source, /if \(!expanded\) void toggle\(\)/);
  assert.match(source, /<SettingsPanel/);
});

test('设置按钮按工作台与设置视图状态执行进入或退出', () => {
  assert.match(source, /handleSettingsClick/);
  assert.match(source, /if \(expanded && view === "settings"\)/);
  assert.match(source, /await toggle\(\)/);
  assert.match(source, /setView\("home"\)/);
  assert.match(source, /aria-label=\{settingsButtonLabel\}/);
});

test('顶部工作台按钮在设置视图收起后重开首页，并保留统一过渡', () => {
  assert.match(source, /const handleWorkbenchToggle = async \(\) => \{/);
  assert.match(source, /if \(expanded\) \{\s*await toggle\(\);\s*setView\("home"\);\s*return;\s*\}/);
  assert.match(source, /setView\("home"\);\s*await toggle\(\);/);
  assert.match(source, /onClick=\{\(\) => void handleWorkbenchToggle\(\)\}/);
  assert.match(source, /getAnimations\(\)/);
  assert.match(cssSource, /\.right-workbench-content[\s\S]*transition: opacity 200ms ease, transform 240ms ease/);
});

test('设置滚动条在底部按钮上方保留安全区', () => {
  assert.match(cssSource, /\.settings-panel-scroll\s*\{[^}]*scrollbar-width:\s*none/);
  assert.match(cssSource, /\.settings-panel-scroll::\-webkit-scrollbar\s*\{[^}]*display:\s*none/);
  assert.match(cssSource, /\.settings-panel-scrollbar[\s\S]*bottom:\s*56px/);
});

test('小窗口展开工作台时具备原生窗口尺寸补偿路径', () => {
  assert.match(source, /sceneColumnRef/);
  assert.match(source, /getCurrentWindow/);
  assert.match(source, /isMaximized/);
  assert.match(source, /innerSize/);
  assert.match(source, /setSize/);
  assert.match(source, /LogicalSize/);
});

test('工作台用原生逻辑几何确认调整完成，并在失败时恢复调整前窗口', () => {
  assert.match(source, /waitForWindowGeometry/);
  assert.match(source, /appWindow\.innerSize\(\)/);
  assert.match(source, /new LogicalPosition\(before\.x, before\.y\)/);
  assert.match(source, /new LogicalSize\(before\.width, before\.height\)/);
});

test('工作台宽度过渡和减少动态效果有明确降级', () => {
  assert.match(cssSource, /right-workbench/);
  assert.match(cssSource, /prefers-reduced-motion/);
  assert.match(cssSource, /min-width/);
});

test('项目文档记录右侧工作台第一阶段的实际边界', () => {
  const docs = `${uiDesignSource}\n${requirementsSource}`;
  assert.match(docs, /右侧功能工作台[\s\S]{0,120}第一阶段[\s\S]{0,120}已实现/);
  assert.match(docs, /64px/);
  assert.match(docs, /400px/);
  assert.match(docs, /始终挂载/);
  assert.doesNotMatch(uiDesignSource, /右侧功能工作台（已确认方向，尚未实现）/);
});
