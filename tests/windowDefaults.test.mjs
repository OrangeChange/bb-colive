import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RIGHT_WORKBENCH_MIN_SCENE_WIDTH } from '../src/components/rightWorkbenchWindow.ts';

const projectRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');

test('主窗口默认尺寸为 4:3 的 960×720', () => {
  const config = JSON.parse(readFileSync(join(projectRoot, 'src-tauri', 'tauri.conf.json'), 'utf8'));
  const main = config.app.windows.find(window => window.label === 'main');
  assert.deepEqual({ width: main.width, height: main.height }, { width: 960, height: 720 });
});

test('右侧工作台保留现场最低可用宽度，不把默认窗口尺寸误当成最低宽度', () => {
  assert.equal(RIGHT_WORKBENCH_MIN_SCENE_WIDTH, 872);
});
