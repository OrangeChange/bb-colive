import test from 'node:test';
import assert from 'node:assert/strict';
import * as diagnostics from '../src/windows/orderedWindowDelivery.ts';

test('配置交接隔开事件批次，后续事件使用新配置', async () => {
  let release;
  const ordered = diagnostics.createOrderedWindowDelivery();
  const blocked = ordered(() => new Promise(resolve => { release = resolve; }));
  await Promise.resolve();
  let threshold = 10;
  const received = [];
  const enqueue = diagnostics.createBatchedWindowDelivery(ordered, async items => {
    received.push(...items.filter(value => value >= threshold));
  });
  const first = enqueue(20);
  enqueue.seal();
  const config = ordered(async () => { threshold = 1; });
  const next = enqueue(2);
  release();
  await Promise.all([blocked, first, config, next]);
  assert.deepEqual(received, [20, 2]);
});

test('批量交付保留顺序并合并等待期间追加的消息', async () => {
  const calls = [];
  let release;
  const ordered = diagnostics.createOrderedWindowDelivery();
  const blocker = ordered(() => new Promise(resolve => { release = resolve; }));
  await Promise.resolve();
  const enqueue = diagnostics.createBatchedWindowDelivery(ordered, async items => { calls.push([...items]); });
  const deliveries = [enqueue('append'), enqueue('update'), enqueue('recall')];
  release();
  await blocker;
  await Promise.all(deliveries);
  assert.deepEqual(calls, [['append', 'update', 'recall']]);
});

test('失败批次拒绝所属消息且后续批次继续发送', async () => {
  let fail = true;
  const enqueue = diagnostics.createBatchedWindowDelivery(diagnostics.createOrderedWindowDelivery(), async items => {
    if (fail) throw new Error('failed batch');
    return items;
  });
  await assert.rejects(enqueue('first'), /failed batch/);
  fail = false;
  assert.deepEqual(await enqueue('next'), ['next']);
});

test('发送中的批次不吸收后续更新，独立窗口不等待慢窗口', async () => {
  const calls = [];
  let release;
  const enqueue = diagnostics.createBatchedWindowDelivery(diagnostics.createOrderedWindowDelivery(), async items => {
    calls.push([...items]);
    if (items[0] === 'append') await new Promise(resolve => { release = resolve; });
  });
  const first = enqueue('append');
  await Promise.resolve();
  const second = enqueue('update');
  const third = enqueue('recall');
  const other = diagnostics.createBatchedWindowDelivery(diagnostics.createOrderedWindowDelivery(), async items => calls.push([...items]));
  await other('other-window');
  assert.deepEqual(calls, [['append'], ['other-window']]);
  release();
  await Promise.all([first, second, third]);
  assert.deepEqual(calls, [['append'], ['other-window'], ['update', 'recall']]);
});

test('异步投递耗时不同也按事件接收顺序到达', async () => {
  assert.equal(typeof diagnostics.createOrderedWindowDelivery, 'function');
  const deliver = diagnostics.createOrderedWindowDelivery();
  const received = [];
  const send = (id, delay) => new Promise(resolve => setTimeout(() => { received.push(id); resolve(); }, delay));
  await Promise.all([deliver(() => send('0', 30)), deliver(() => send('1', 0)), deliver(() => send('2', 0))]);
  assert.deepEqual(received, ['0', '1', '2']);
});

test('一次投递失败不使后续投递永远停滞', async () => {
  const deliver = diagnostics.createOrderedWindowDelivery();
  const first = deliver(() => Promise.reject(new Error('delivery failed')));
  const received = [];
  const second = deliver(async () => { received.push('next'); });
  await assert.rejects(first, /delivery failed/);
  await second;
  assert.deepEqual(received, ['next']);
});
