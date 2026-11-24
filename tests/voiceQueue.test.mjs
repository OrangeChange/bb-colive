import test from "node:test";
import assert from "node:assert/strict";
import { createInitialVoiceQueue, enqueueVoiceEntry, takeNextVoiceEntry, expireVoiceEntries, clearVoiceQueue, failVoiceQueue } from "../src/voice/voiceQueue.ts";

const entry = (id, priority = "normal", enqueuedAt = 0) => ({
  id,
  text: id,
  event: { id },
  enqueuedAt,
  priority,
});

const policy = (overrides = {}) => ({
  mode: "original",
  queueLimit: 50,
  overflowPolicy: "drop-oldest",
  expiryEnabled: false,
  expirySeconds: 60,
  ...overrides,
});

test("默认原始顺序和超限丢弃最旧项", () => {
  let state = createInitialVoiceQueue();
  for (let i = 0; i < 51; i++) state = enqueueVoiceEntry(state, entry(String(i)), policy(), i).state;
  assert.equal(state.pending.length, 50);
  assert.equal(state.pending[0].id, "1");
  assert.equal(state.discardedCount, 1);
});

test("优先级模式在不打乱同优先级顺序的情况下插入高优先级事件", () => {
  let state = createInitialVoiceQueue();
  for (const item of [entry("normal-1"), entry("high", "high"), entry("normal-2"), entry("medium", "medium")]) {
    state = enqueueVoiceEntry(state, item, policy({ mode: "priority" }), 0).state;
  }
  assert.deepEqual(state.pending.map((item) => item.id), ["high", "medium", "normal-1", "normal-2"]);
});

test("暂停时不消费队列，恢复后取出一条且不打断当前事件", () => {
  let state = { ...createInitialVoiceQueue(), paused: true };
  state = enqueueVoiceEntry(state, entry("next"), policy(), 0).state;
  assert.equal(takeNextVoiceEntry(state, 0).entry, undefined);
  state = { ...state, paused: false };
  const result = takeNextVoiceEntry(state, 0);
  assert.equal(result.entry.id, "next");
  assert.equal(result.state.current.id, "next");
  assert.equal(takeNextVoiceEntry(result.state, 0).entry, undefined);
});

test("丢弃新事件和优先丢弃普通事件分别遵循设置", () => {
  let state = createInitialVoiceQueue();
  for (let i = 0; i < 10; i++) state = enqueueVoiceEntry(state, entry(`old-${i}`), policy({ queueLimit: 10 }), 0).state;
  const rejected = enqueueVoiceEntry(state, entry("new"), policy({ queueLimit: 10, overflowPolicy: "drop-newest" }), 0);
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.state.pending.at(-1).id, "old-9");

  state = { ...state, pending: [entry("high", "high"), entry("normal", "normal")] };
  const prioritized = enqueueVoiceEntry(state, entry("new-high", "high"), policy({ queueLimit: 2, overflowPolicy: "drop-normal-first" }), 0);
  assert.deepEqual(prioritized.state.pending.map((item) => item.id), ["high", "new-high"]);
});

test("过期只移除等待中的事件，不触碰当前正在播放的事件", () => {
  const state = {
    ...createInitialVoiceQueue(),
    current: entry("current", "normal", 0),
    pending: [entry("fresh", "normal", 9_000), entry("expired", "normal", 0)],
  };
  const result = expireVoiceEntries(state, policy({ expiryEnabled: true, expirySeconds: 10 }), 10_000);
  assert.equal(result.removedCount, 1);
  assert.equal(result.state.current.id, "current");
  assert.deepEqual(result.state.pending.map((item) => item.id), ["fresh"]);
});

test("错误会停止并清空当前与待播状态", () => {
  const state = failVoiceQueue({
    ...createInitialVoiceQueue(),
    current: entry("current"),
    pending: [entry("pending")],
  }, new Error("offline"));
  assert.equal(state.current, null);
  assert.deepEqual(state.pending, []);
  assert.equal(state.accepting, false);
  assert.equal(state.failedCount, 1);
  assert.equal(state.error, "offline");
});

test("清空队列不改变继续接收新事件的生命周期状态", () => {
  const state = clearVoiceQueue({
    ...createInitialVoiceQueue(),
    current: entry("current"),
    pending: [entry("pending")],
    discardedCount: 3,
  });
  assert.equal(state.current, null);
  assert.deepEqual(state.pending, []);
  assert.equal(state.accepting, true);
  assert.equal(state.discardedCount, 3);
});
