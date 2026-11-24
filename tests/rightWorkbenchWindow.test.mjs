import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { planWorkbenchWindowResize as plan, sameWindowGeometry, resetWorkbenchWindowState } from '../src/components/rightWorkbenchWindow.ts';
import { RIGHT_WORKBENCH_DEFAULT_WIDTH } from '../src/components/rightWorkbenchState.ts';
import * as windowState from '../src/components/rightWorkbenchWindow.ts';
const rightWorkbenchSource = fs.readFileSync(new URL('../src/components/RightWorkbench.tsx', import.meta.url), 'utf8');
const base = { maximized: false, windowWidth: 960, windowX: 100, sceneWidth: 832, minSceneWidth: 872, panelDelta: 336, workX: 0, workWidth: 1920, frameWidth: 0 };
test('默认窗口展开前预留整个面板增量，保持现场原宽', () => {
  assert.deepEqual(plan(base), {width: 1296, x: 100});
});

test('125%与150%软件缩放按实际面板宽度扩宽原生窗口', () => {
  assert.deepEqual(plan({...base, contentScale: 1.25}), {width: 1380, x: 100});
  assert.deepEqual(plan({...base, contentScale: 1.5}), {width: 1464, x: 100});
  assert.deepEqual(plan({...base, contentScale: 1.25, workWidth: 1200, frameWidth: 16}), {width: 1184, x: 0});
});
test('大窗口、最大化采用内部展开', () => {
  assert.deepEqual(plan({...base, windowWidth: 1400, sceneWidth: 1272}), {width: 1400, x: 100});
  assert.deepEqual(plan({...base, maximized: true}), {width: 960, x: 100});
});
test('工具栏实际要求超过基准时仍扩宽', () => {
  assert.equal(plan({...base, windowWidth: 1400, sceneWidth: 1272, minSceneWidth: 1100}).width, 1736);
});
test('右边空间不足会左移，工作区不足会限制扩宽', () => {
  assert.deepEqual(plan({...base, windowX: 800}), {width: 1296, x: 624});
  assert.deepEqual(plan({...base, workWidth: 1200, frameWidth: 16}), {width: 1184, x: 0});
  assert.deepEqual(plan({...base, workX: -1920, windowX: -1000}), {width: 1296, x: -1296});
});
test('用户改变宽、高或位置后不满足自动恢复条件', () => {
  const before = {x:100, y:100, width:1296, height:720};
  assert.equal(sameWindowGeometry(before, {...before}), true);
  for (const key of Object.keys(before)) assert.equal(sameWindowGeometry(before, {...before, [key]: before[key]+10}), false);
});

test('自动扩宽与展开状态跨组件重建保留，收起可找到原尺寸', () => {
  assert.equal(typeof windowState.saveWorkbenchWindowState, 'function');
  const data = new Map();
  const storage = {getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value)};
  const baseline = {x:100, y:100, width:960, height:720};
  const adjusted = {...baseline, width:1296};
  windowState.saveWorkbenchWindowState({expanded:true, baseline, adjusted, width: 512}, storage);
  const reloaded = windowState.loadWorkbenchWindowState(storage);
  assert.equal(reloaded.expanded, true);
  assert.equal(reloaded.width, 512);
  assert.deepEqual(windowState.workbenchCloseTarget(reloaded, adjusted), baseline);
  assert.equal(windowState.workbenchCloseTarget(reloaded, {...adjusted, width:1300}), null);
  assert.equal(windowState.workbenchCloseTarget(reloaded, {...adjusted, height:760}), null);
});

test('普通大窗口没有自动扩宽记录，不应硬减256px', () => {
  assert.equal(typeof windowState.workbenchCloseTarget, 'function');
  const normal = {x:100, y:100, width:1296, height:720};
  assert.equal(windowState.workbenchCloseTarget({expanded:true, baseline:normal, adjusted:null}, normal), null);
});

test('关闭时 adjusted 几何过期仍恢复本次展开前的 baseline', () => {
  const baseline = {x:100, y:100, width:960, height:720};
  const adjusted = {...baseline, width:1296};
  const currentAfterRestore = {...adjusted, x:84, width:1280};
  assert.equal(typeof windowState.workbenchCloseFallbackTarget, 'function');
  assert.deepEqual(windowState.workbenchCloseFallbackTarget({
    expanded: true,
    baseline,
    adjusted,
    width: 400,
  }, currentAfterRestore), baseline);
  assert.equal(windowState.workbenchCloseFallbackTarget({
    expanded: true,
    baseline,
    adjusted: null,
    width: 400,
  }, currentAfterRestore), null);
});

test('原生窗口已经保留工作台宽度时，收起状态再次展开不重复扩宽', () => {
  const current = {x:76, y:108, width:1296, height:720};
  assert.equal(typeof windowState.shouldReuseWorkbenchGeometry, 'function');
  assert.equal(windowState.shouldReuseWorkbenchGeometry({
    expanded: false,
    baseline: current,
    adjusted: null,
    width: 400,
  }, current, 1168, 872), true);
  assert.equal(windowState.shouldReuseWorkbenchGeometry({
    expanded: false,
    baseline: { ...current, width: 960 },
    adjusted: null,
    width: 400,
  }, current, 1168, 872), false);
  assert.equal(windowState.shouldReuseWorkbenchGeometry({
    expanded: false,
    baseline: current,
    adjusted: null,
    width: 400,
  }, { ...current, width: 1280 }, 1168, 872), false);
});

test('恢复主窗口布局时清除工作台陈旧几何并恢复默认面板宽度', () => {
  const state = {
    expanded: true,
    baseline: { x: 100, y: 80, width: 960, height: 720 },
    adjusted: { x: 100, y: 80, width: 1296, height: 720 },
    width: 512,
  };
  assert.deepEqual(resetWorkbenchWindowState(state), {
    expanded: false,
    baseline: null,
    adjusted: null,
    width: RIGHT_WORKBENCH_DEFAULT_WIDTH,
  });
});

test('恢复主窗口布局时同步更新工作台当前宽度状态', () => {
  assert.match(rightWorkbenchSource, /workbenchWidthRef\.current = reset\.width/);
  assert.match(rightWorkbenchSource, /setWorkbenchWidth\(reset\.width\)/);
});

test('原生收起过渡单调缩宽，保留高度与左边缘并准确落到目标', () => {
  assert.equal(typeof windowState.workbenchResizeFrame, 'function');
  const from = {x:100, y:80, width:1296, height:720};
  const to = {...from, width:960};
  assert.deepEqual(windowState.workbenchResizeFrame(from, to, 0), from);
  assert.deepEqual(windowState.workbenchResizeFrame(from, to, 1), to);
  const frames = [0.25, 0.5, 0.75].map(t => windowState.workbenchResizeFrame(from, to, t));
  assert.ok(frames[0].width < 1296 && frames[2].width > 960);
  assert.ok(frames[0].width > frames[1].width && frames[1].width > frames[2].width);
  for (const frame of frames) {
    assert.equal(frame.x, 100);
    assert.equal(frame.y, 80);
    assert.equal(frame.height, 720);
  }
});

test('小窗口展开和收起使用同一套原生尺寸过渡', () => {
  assert.match(rightWorkbenchSource, /const RIGHT_WORKBENCH_TRANSITION_MS = 240/);
  assert.match(rightWorkbenchSource, /const animateNativeResize = !restoring && !window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches/);
  assert.match(rightWorkbenchSource, /if \(animateNativeResize\)/);
  assert.match(rightWorkbenchSource, /asideRef\.current\.style\.flex = "1 0 64px"/);
  assert.doesNotMatch(rightWorkbenchSource, /const animateClose = !opening && !restoring/);
});

test('等待原生窗口几何达到目标，而不是读取 CSS 视口宽度', async () => {
  const target = {x: 100, y: 80, width: 960, height: 720};
  const samples = [
    {...target, width: 1296},
    target,
  ];
  const seen = [];
  assert.equal(typeof windowState.waitForWindowGeometry, 'function');
  if (typeof windowState.waitForWindowGeometry !== 'function') return;
  const settled = await windowState.waitForWindowGeometry(
    async () => {
      const value = samples.shift();
      seen.push(value);
      return value;
    },
    target,
    async () => {},
    100,
  );
  assert.equal(settled, true);
  assert.equal(seen.length, 2);
});
