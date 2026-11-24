import test from "node:test";
import assert from "node:assert/strict";
import { projectOpenLiveCallback } from "../src/compat/openlive/projection.ts";
import { projectCallback, richParts, DEFAULT_CONFIG } from "../src/compat/openlive/runtime/core.mjs";
import { MsgType } from "../src/protocol/types.ts";
const event = { id: "image", roomId: 1, ts: 1000, msgType: MsgType.Danmu, text: "[emote]", user: { uid: "1", uname: "user" } };
test("开放版实际回调消费大表情与小表情图片", () => {
  const url = "https://example.com/emote.png";
  for (const media of [{ emoticon: { url, width: 162, height: 162 } }, { emotes: { "[emote]": { url, width: 20, height: 20 } } }]) {
    const record = projectOpenLiveCallback({ ...event, ...media }, 1);
    const rendered = projectCallback(record, DEFAULT_CONFIG);
    assert.equal(rendered.richContent.find(part => part.type === 1)?.url, url);
  }
});

test("没有消息表情数据时，关键词保留为原文", () => {
  const content = "正文[dog][吃瓜][比心]";
  assert.deepEqual(richParts(content), [{ type: 0, text: content }]);
  const rendered = projectCallback({ method: "onAddText", payload: { id: "plain", content, translation: "翻译[dog]" }, receivedAt: 1000 }, DEFAULT_CONFIG);
  assert.deepEqual(rendered.richContent, [{ type: 0, text: content }]);
  assert.deepEqual(rendered.richTranslate, [{ type: 0, text: "翻译[dog]" }]);
});

test("小表情只使用消息提供的图片地址，其他关键词保留原文", () => {
  assert.deepEqual(richParts("前[dog]后[吃瓜]", null, { "[dog]": { url: "https://example.com/captured.png" } }), [
    { type: 0, text: "前" },
    { type: 1, text: "[dog]", url: "https://example.com/captured.png" },
    { type: 0, text: "后[吃瓜]" },
  ]);
});
