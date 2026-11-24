import { readUiSourceAsync } from "./helpers/readUiSource.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readUiSourceAsync(new URL(path, import.meta.url), 'utf8');

test('主播档案页提供云端恢复入口并在未连接时打开对应设置', async () => {
  const source = await read('../src/components/ReviewPanel.tsx');
  assert.match(source, /从云端恢复/);
  assert.match(source, /onOpenCloudRecoverySettings/);
  assert.match(source, /cloudRecoveryTask\.start/);
  assert.match(source, /binding-required/);
  const app = await read('../src/App.tsx');
  assert.match(app, /action: "connect-cloud-recovery"/);
});

test('全局恢复浮层提供折叠详情、暂停、重试和完成状态', async () => {
  const source = await read('../src/components/CloudRecoveryProgress.tsx');
  for (const text of ['云端恢复', '准备记录', '下载', '写入档案', '整理档案', '暂停', '重试']) {
    assert.match(source, new RegExp(text));
  }
  assert.match(source, /aria-expanded/);
  assert.match(source, /role="status"/);
  assert.match(source, /重新完整恢复/);
  assert.match(source, /restartFully/);
  assert.match(source, /取消恢复/);
  assert.match(source, /确认取消恢复/);
  assert.match(source, /本次恢复新增的记录将被删除/);
});

test('恢复浮层定位在主内容右下角而不覆盖右侧工作台', async () => {
  const app = await read('../src/App.tsx');
  const progress = await read('../src/components/CloudRecoveryProgress.tsx');
  const sceneColumnIndex = app.indexOf('ref={sceneColumnRef}');
  const progressIndex = app.indexOf('<CloudRecoveryProgress />');
  const workbenchIndex = app.indexOf('<RightWorkbench');
  assert.ok(sceneColumnIndex >= 0 && progressIndex > sceneColumnIndex && progressIndex < workbenchIndex);
  assert.match(progress, /className="absolute bottom-12 right-4/);
  assert.doesNotMatch(progress, /className="fixed bottom-12/);
  assert.match(progress, /calc\(100%-2rem\)/);
});

test('云端恢复设置复用全局任务且可被设置锚点定位', async () => {
  const settings = await read('../src/components/CloudRecoverySettings.tsx');
  const panel = await read('../src/components/SettingsPanel.tsx');
  const navigation = await read('../src/components/settingsNavigation.ts');
  assert.match(settings, /cloudRecoveryTask\.start/);
  assert.match(settings, /请先连接服务器，再恢复当前主播/);
  assert.match(panel, /anchorRefs\.current\.set\("cloud-recovery"/);
  assert.match(navigation, /"cloud-recovery"/);
});
