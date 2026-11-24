import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createGiftEffectQueue } from "../src/windows/giftEffectQueue.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("队列同一时间只消费一个特效，清空只移除等待项", () => {
  const queue = createGiftEffectQueue();
  const first = { id: "1" };
  const second = { id: "2" };

  assert.equal(queue.enqueue(first), true);
  assert.equal(queue.current, first);
  assert.equal(queue.enqueue(second), false);
  assert.equal(queue.pendingCount, 1);
  queue.clearPending();
  assert.equal(queue.pendingCount, 0);
  assert.equal(queue.finishCurrent(), null);
  assert.equal(queue.current, null);
});

test("查询代际清空 current 与 pending 后，新查询通知可以立即成为 current", () => {
  const queue = createGiftEffectQueue();
  const oldCurrent = { id: "old-current" };
  const oldPending = { id: "old-pending" };
  const newQueryNotice = { id: "new-query" };

  assert.equal(queue.enqueue(oldCurrent), true);
  assert.equal(queue.enqueue(oldPending), false);
  queue.cancelAll();

  assert.equal(queue.current, null);
  assert.equal(queue.pendingCount, 0);
  assert.equal(queue.enqueue(newQueryNotice), true);
  assert.equal(queue.current, newQueryNotice);
});

test("完成当前特效后按 FIFO 取出下一个，等待队列有界", () => {
  const queue = createGiftEffectQueue(2);
  queue.enqueue("1");
  queue.enqueue("2");
  queue.enqueue("3");
  queue.enqueue("4");

  assert.equal(queue.pendingCount, 2);
  assert.equal(queue.finishCurrent(), "3");
  assert.equal(queue.finishCurrent(), "4");
  assert.equal(queue.finishCurrent(), null);
});

test("适配器保留礼物特效元数据，并通过独立总线传递匹配后的事件", () => {
  const adapter = read("src/protocol/adapter.ts");
  const bus = read("src/windows/giftEffectBus.ts");
  assert.match(adapter, /effectId/);
  assert.match(adapter, /comboStayTime/);
  assert.match(adapter, /hasImagedGift/);
  assert.match(bus, /GiftEffectNotice/);
  assert.match(bus, /subscribeGiftEffect/);
});
