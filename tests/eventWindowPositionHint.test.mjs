import test from 'node:test';
import assert from 'node:assert/strict';
import { createWindowPositionHint, shouldShowWindowPositionHint } from '../src/windows/windowPositionHint.ts';

test('只有确认未锁定的透明窗口常驻定位辅助', () => {
  assert.equal(shouldShowWindowPositionHint('transparent', null, false), false);
  assert.equal(shouldShowWindowPositionHint('transparent', false, false), true);
  assert.equal(shouldShowWindowPositionHint('transparent', true, false), false);
  assert.equal(shouldShowWindowPositionHint('solid', false, false), false);
  assert.equal(shouldShowWindowPositionHint('glass', true, true), true);
});
test('主动定位三秒，重复续时，锁定与卸载立即清除', context => {
  context.mock.timers.enable({apis:['setTimeout']});
  const states = [];
  const hint = createWindowPositionHint(value => states.push(value));
  hint.locate(); context.mock.timers.tick(2000); hint.locate();
  context.mock.timers.tick(2999); assert.equal(states.at(-1), true);
  context.mock.timers.tick(1); assert.equal(states.at(-1), false);
  hint.locate(); hint.clear(); assert.equal(states.at(-1), false);
  hint.dispose(); const count = states.length; context.mock.timers.tick(4000);
  assert.equal(states.length, count);
});
