import test from "node:test";
import assert from "node:assert/strict";
import { useDanmakuComposer as store } from "../src/stores/danmakuComposer.ts";
test("切房隔离草稿，原发送结果不清空新房间内容", async () => {
  store.getState().setContext("a:1");
  store.getState().edit({ text: "原房间" });
  let finish;
  const pending = store
    .getState()
    .submit(() => new Promise((r) => (finish = r)));
  store.getState().setContext("a:2");
  store.getState().edit({ text: "新房间" });
  finish({ status: "sent" });
  await pending;
  assert.equal(store.getState().drafts["a:2"].text, "新房间");
  assert.equal(store.getState().drafts["a:1"].text, "");
  assert.equal(store.getState().open, false);
});
test("重复提交被阻止，独立表情成功保留文字草稿", async () => {
  store.getState().setContext("a:3");
  store
    .getState()
    .edit({
      text: "保留",
      emoticon: {
        unique: "x",
        text: "笑",
        url: "https://x",
        width: 40,
        height: 40,
        available: true,
        unlockText: "",
        textual: false,
      },
    });
  let finish;
  let calls = 0;
  const task = store.getState().submit(() => {
    calls++;
    return new Promise((r) => (finish = r));
  });
  await store.getState().submit(async () => {
    calls++;
    return { status: "sent" };
  });
  finish({ status: "sent" });
  await task;
  assert.equal(calls, 1);
  assert.equal(store.getState().drafts["a:3"].text, "保留");
  assert.equal(store.getState().drafts["a:3"].emoticon, undefined);
});
