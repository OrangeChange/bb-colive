import test from 'node:test';
import assert from 'node:assert/strict';
import * as transitions from '../src/obs/useObsEventTransitions.ts';

test('完整状态重复传送时保留未变化事件，连击更新仍替换对应行', () => {
  assert.equal(typeof transitions.reuseObsEvents, 'function');
  const old = [
    { id: 'a', user: { uid: 1, uname: 'A' }, text: 'hello' },
    { id: 'b', user: { uid: 2, uname: 'B' }, gift: { count: 1, totalRmb: 5 } },
  ];
  const next = JSON.parse(JSON.stringify(old));
  next[1].gift.count = 2;
  next.push({ id: 'c', user: { uid: 3 }, text: 'new' });
  const result = transitions.reuseObsEvents(old, next);
  assert.equal(result[0], old[0]);
  assert.notEqual(result[1], old[1]);
  assert.equal(result[1].gift.count, 2);
  assert.equal(result[2].id, 'c');
});

test('事件调整顺序或删除时保留正确身份', () => {
  const old = [{ id: 'a', text: 'a' }, { id: 'b', text: 'b' }];
  const result = transitions.reuseObsEvents(old, [{ id: 'b', text: 'b' }]);
  assert.deepEqual(result.map(event => event.id), ['b']);
  assert.equal(result[0], old[1]);
});

test('主题的嵌套配置和资源变更会触发更新', () => {
  const snapshot = { css: '.a { color: red }', settings: { colors: ['red', 'blue'] } };
  assert.equal(transitions.sameObsValue(snapshot, structuredClone(snapshot)), true);
  assert.equal(transitions.sameObsValue(snapshot, { ...snapshot, css: '.a { color: blue }' }), false);
  assert.equal(transitions.sameObsValue(snapshot, { ...snapshot, settings: { colors: ['red', 'green'] } }), false);
  assert.equal(transitions.sameObsValue({a: undefined}, {b: undefined}), false);
});
