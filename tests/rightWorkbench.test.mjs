import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RIGHT_WORKBENCH_COLLAPSED_WIDTH,
  RIGHT_WORKBENCH_DEFAULT_WIDTH,
  RIGHT_WORKBENCH_EXPANDED_WIDTH,
  RIGHT_WORKBENCH_MAX_WIDTH,
  RIGHT_WORKBENCH_MIN_WIDTH,
  RIGHT_WORKBENCH_PANEL_DELTA,
  clampRightWorkbenchWidth,
  rightWorkbenchPanelDelta,
  rightWorkbenchWidth,
  rightWorkbenchToggleLabel,
} from '../src/components/rightWorkbenchState.ts';

test('工作台只在两种明确宽度之间切换', () => {
  assert.equal(RIGHT_WORKBENCH_COLLAPSED_WIDTH, 64);
  assert.equal(RIGHT_WORKBENCH_DEFAULT_WIDTH, 400);
  assert.equal(RIGHT_WORKBENCH_EXPANDED_WIDTH, 400);
  assert.equal(RIGHT_WORKBENCH_MIN_WIDTH, 320);
  assert.equal(RIGHT_WORKBENCH_MAX_WIDTH, 560);
  assert.equal(RIGHT_WORKBENCH_PANEL_DELTA, 336);
  assert.equal(rightWorkbenchWidth(false), 64);
  assert.equal(rightWorkbenchWidth(true), 400);
  assert.equal(rightWorkbenchWidth(true, 512), 512);
  assert.equal(rightWorkbenchPanelDelta(512), 448);
  assert.equal(rightWorkbenchToggleLabel(false), '展开功能面板');
  assert.equal(rightWorkbenchToggleLabel(true), '收起功能面板');
});

test('工作台宽度限制在可读范围，拖动超出边界时回到边界', () => {
  assert.equal(clampRightWorkbenchWidth(200), 320);
  assert.equal(clampRightWorkbenchWidth(480), 480);
  assert.equal(clampRightWorkbenchWidth(800), 560);
  assert.equal(clampRightWorkbenchWidth(Number.NaN), 400);
});

test('样式预览可缩至260，普通面板仍保留320下限',()=>{
 assert.equal(clampRightWorkbenchWidth(260,960,260),260);
 assert.equal(rightWorkbenchPanelDelta(260,960,260),196);
 assert.equal(clampRightWorkbenchWidth(260),320);
});
