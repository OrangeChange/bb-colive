import test from "node:test";
import assert from "node:assert/strict";
import { observePreviewRuntime } from "../public/previewCapture.mjs";
test("同步已呈现帧时取消接收端旧平滑队列，不保留第二条播放时间线", async () => {
  const { applyPreviewPresentation } =
    await import("../public/previewCapture.mjs");
  let fired = false;
  const renderer = {
    emitSmoothedMessageTimerId: setTimeout(() => {
      fired = true;
    }, 10),
    resetSmoothScroll() {
      this.scrollReset = true;
    },
    smoothedMessageQueue: [1],
    messagesBuffer: [1],
  };
  applyPreviewPresentation(renderer, {
    messages: [
      {
        id: "a",
        time: "2026-10-30T00:00:00Z",
        addTime: "2026-10-30T00:00:00Z",
      },
    ],
    paidMessages: [],
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(fired, false);
  assert.equal(renderer.scrollReset, true);
  assert.equal(renderer.smoothedMessageQueue.length, 0);
  assert.equal(renderer.messages[0].id, "a");
  assert(renderer.messages[0].time instanceof Date);
});
test("来源回调只生成一次，迟到接收者获得同一身份，重播清空旧记录", () => {
  const received = [],
    frames = [],
    tasks = [];
  const runtime = {
    receive(value) {
      received.push(value);
    },
    reset() {
      received.length = 0;
    },
    retention: { maxCallbacks: 2 },
  };
  const observe = observePreviewRuntime(
    runtime,
    (value) => frames.push(value),
    (fn) => tasks.push(fn),
  );
  runtime.receive({ method: "onAddText", payload: { content: "before" } });
  assert.equal(tasks.length, 0);
  observe(true);
  runtime.receive({ method: "onAddText", payload: { content: "a" } });
  while (tasks.length) tasks.shift()();
  assert.equal(frames.at(-1).records[0].payload.id, received.at(-1).payload.id);
  const epoch = frames.at(-1).epoch;
  runtime.reset();
  while (tasks.length) tasks.shift()();
  assert.equal(frames.at(-1).records.length, 0);
  assert(frames.at(-1).epoch > epoch);
  observe(false);
  runtime.receive({ method: "onAddText", payload: { id: "formal" } });
  assert.equal(tasks.length, 0);
});

test("仅修改CSS不重建相同的已呈现事件，内容变化仍会更新", async () => {
  const { applyPreviewPresentation } =
    await import("../public/previewCapture.mjs");
  const messages = [
    { id: "a", text: "one", time: new Date("2026-10-30T00:00:00Z") },
  ];
  const renderer = { messages, paidMessages: [], resetSmoothScroll() {} };
  applyPreviewPresentation(
    renderer,
    JSON.parse(JSON.stringify({ messages, paidMessages: [] })),
  );
  assert.equal(renderer.messages, messages);
  applyPreviewPresentation(renderer, {
    messages: [{ ...messages[0], text: "two" }],
    paidMessages: [],
  });
  assert.equal(renderer.messages[0].text, "two");
  assert.equal(renderer.messages, messages);
});

test("同轮追加和更新复用未变事件及付费栏，不重置动画或队列", async () => {
  const { applyPreviewPresentation } = await import("../public/previewCapture.mjs");
  const renderer = { messages: [], paidMessages: [], smoothedMessageQueue: [], messagesBuffer: [], resetCount: 0, resetSmoothScroll() { this.resetCount++; } };
  const frame = { restart: 1, epoch: 4, messages: [{ id: "a", text: "one" }, { id: "b", text: "two" }], paidMessages: [{ id: "paid", amount: 10 }] };
  applyPreviewPresentation(renderer, frame);
  const messages = renderer.messages, paid = renderer.paidMessages, a = messages[0], b = messages[1], pinned = paid[0];
  renderer.smoothedMessageQueue.push("pending");
  renderer.messagesBuffer.push("buffered");
  applyPreviewPresentation(renderer, { ...frame, messages: [...frame.messages, { id: "c", text: "three" }] });
  assert.equal(renderer.messages, messages);
  assert.equal(messages[0], a);
  assert.equal(messages[1], b);
  assert.equal(renderer.paidMessages, paid);
  assert.equal(paid[0], pinned);
  assert.equal(renderer.resetCount, 1);
  assert.deepEqual(renderer.smoothedMessageQueue, ["pending"]);
  assert.deepEqual(renderer.messagesBuffer, ["buffered"]);
  applyPreviewPresentation(renderer, { ...frame, messages: [{ id: "b", text: "updated" }, { id: "c", text: "three" }], paidMessages: [{ id: "paid", amount: 20 }] });
  assert.equal(renderer.messages, messages);
  assert.deepEqual(messages.map(item => [item.id, item.text]), [["b", "updated"], ["c", "three"]]);
  assert.equal(paid[0].amount, 20);
  assert.equal(renderer.resetCount, 1);
});

test("只有明确播放轮次变化才清理旧队列，即使同内容重建来源 iframe", async () => {
  const { applyPreviewPresentation } = await import("../public/previewCapture.mjs");
  const renderer = { messages: [], paidMessages: [], smoothedMessageQueue: [], messagesBuffer: [], resetCount: 0, resetSmoothScroll() { this.resetCount++; } };
  applyPreviewPresentation(renderer, { restart: 2, epoch: 8, messages: [{ id: "a" }], paidMessages: [{ id: "p" }] });
  const messages = renderer.messages, paid = renderer.paidMessages;
  renderer.smoothedMessageQueue.push("pending");
  renderer.messagesBuffer.push("buffered");
  applyPreviewPresentation(renderer, { restart: 2, epoch: 0, messages: [{ id: "a" }], paidMessages: [{ id: "p" }] });
  assert.equal(renderer.resetCount, 1);
  assert.deepEqual(renderer.smoothedMessageQueue, ["pending"]);
  applyPreviewPresentation(renderer, { restart: 2, epoch: 1, messages: [{ id: "a" }], paidMessages: [{ id: "p" }] });
  assert.equal(renderer.resetCount, 1, "重建来源后的初始化不应再次重置");
  applyPreviewPresentation(renderer, { restart: 3, epoch: 0, messages: [{ id: "new" }], paidMessages: [] });
  assert.equal(renderer.resetCount, 2);
  assert.deepEqual(renderer.smoothedMessageQueue, []);
  assert.deepEqual(renderer.messagesBuffer, []);
  assert.equal(renderer.messages, messages);
  assert.equal(renderer.paidMessages, paid);
  assert.deepEqual(messages.map(item => item.id), ["new"]);
  assert.equal(paid.length, 0);
  const old = messages[0];
  applyPreviewPresentation(renderer, { restart: 4, epoch: 0, messages: [{ id: "new" }], paidMessages: [] });
  assert.notEqual(messages[0], old, "新轮次即使复用 ID 也应重建事件");
  const afterReplay = messages[0];
  applyPreviewPresentation(renderer, { restart: 4, epoch: 1, messages: [{ id: "new" }], paidMessages: [] });
  assert.equal(renderer.resetCount, 3, "重播后的来源初始化不应重复重置");
  applyPreviewPresentation(renderer, { restart: 4, epoch: 2, messages: [{ id: "new" }], paidMessages: [] });
  assert.equal(renderer.resetCount, 4, "来源明确重置也应开启新轮次");
  assert.notEqual(messages[0], afterReplay);
});

test("暂停采集期间重置仍清空上一轮，重新启用不会重放旧记录", () => {
  const frames = [], tasks = [];
  const runtime = { receive() {}, reset() {} };
  const observe = observePreviewRuntime(runtime, value => frames.push(value), fn => tasks.push(fn));
  observe(true);
  runtime.receive({ method: "onAddText", payload: { id: "old" } });
  while (tasks.length) tasks.shift()();
  const epoch = frames.at(-1).epoch;
  observe(false);
  runtime.reset();
  observe(true);
  while (tasks.length) tasks.shift()();
  assert.deepEqual(frames.at(-1).records, []);
  assert(frames.at(-1).epoch > epoch);
});

test("动态快照解除静态分页并保留已有消息对象", async () => {
  const { applyPreviewPresentation } = await import("../public/previewCapture.mjs");
  const previous = { id: "a" };
  const renderer = { messages: [previous], paidMessages: [], resetSmoothScroll() {} };
  let active = true;
  const previewWindow = { cancel() { active = false; } };
  applyPreviewPresentation(renderer, { restart: 1, epoch: 1, messages: [{ id: "a" }], paidMessages: [] }, previewWindow);
  assert.equal(active, false);
  assert.equal(renderer.messages[0], previous);
});
