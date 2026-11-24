import test from 'node:test';
import assert from 'node:assert/strict';
import { applyEventTransition } from '../public/eventTransitions.mjs';

test('零时长不启用软件入场，主题保留自己的过渡', () => {
  const node = { dataset: {}, style: { setProperty() {} }, ownerDocument: { defaultView: { requestAnimationFrame() { throw new Error('零时长不应调度入场'); } } } };
  applyEventTransition(node, { preset: 'slide', durationMs: 0 });
  assert.equal(node.dataset.eventMotion, 'none');
  assert.equal(node.dataset.eventMotionEntering, undefined);
});

test('新节点进入一次，更新不重播且保留来源布局变换', () => {
  const frames = [];
  const values = {};
  const node = { dataset: {}, style: { transform: 'translateY(20px)', setProperty: (key, value) => values[key] = value }, ownerDocument: { addEventListener() {}, removeEventListener() {}, defaultView: { requestAnimationFrame: fn => frames.push(fn) } } };
  applyEventTransition(node, { preset: 'slide', durationMs: 800 });
  assert.equal(node.dataset.eventMotionEntering, '');
  assert.equal(values['--event-motion-duration'], '800ms');
  frames.shift()(); frames.shift()();
  assert.equal(node.dataset.eventMotionEntering, undefined);
  applyEventTransition(node, { preset: 'fade', durationMs: 200 });
  assert.equal(frames.length, 0);
  assert.equal(node.style.transform, 'translateY(20px)');
  applyEventTransition(node, { preset: 'none', durationMs: 200 }, true);
  assert.equal(node.dataset.eventMotionRemoving, 'true');
  assert.equal(node.dataset.eventMotion, 'none');
});

test('隐藏时新增事件不排队播放入场动画', () => {
  const frames = [];
  const node = { dataset: {}, style: { setProperty() {} }, ownerDocument: { visibilityState: 'hidden', defaultView: { requestAnimationFrame: fn => frames.push(fn) } } };
  applyEventTransition(node, { preset: 'fade', durationMs: 200 });
  assert.equal(node.dataset.eventMotionEntering, undefined);
  assert.equal(frames.length, 0);
  node.ownerDocument.visibilityState = 'visible';
  applyEventTransition(node, { preset: 'fade', durationMs: 200 });
  assert.equal(frames.length, 0);
});

test('入场准备期间隐藏会清除标记并释放调度', () => {
  const frames = new Map(), listeners = new Map(); let next = 0;
  const doc = { visibilityState: 'visible', addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name), defaultView: { requestAnimationFrame(fn) { frames.set(++next, fn); return next; }, cancelAnimationFrame: id => frames.delete(id) } };
  const node = { dataset: {}, style: { setProperty() {} }, ownerDocument: doc };
  applyEventTransition(node, { preset: 'fade', durationMs: 200 });
  doc.visibilityState = 'hidden'; listeners.get('visibilitychange')?.();
  assert.equal(node.dataset.eventMotionEntering, undefined);
  assert.equal(frames.size, 0);
  assert.equal(listeners.size, 0);
});
