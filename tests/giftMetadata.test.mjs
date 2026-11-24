import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const adapterSource = readFileSync(
  fileURLToPath(new URL("../src/protocol/adapter.ts", import.meta.url)),
  "utf8",
);
const protoSource = readFileSync(
  fileURLToPath(new URL("../src/protocol/proto.ts", import.meta.url)),
  "utf8",
);

test("语音连麦开关信令只归档，不进入未知事件列表", () => {
  assert.match(adapterSource, /cmd === 'VOICE_JOIN_SWITCH'/);
  assert.match(adapterSource, /cmd === 'VOICE_JOIN_SWITCH_V2'/);
});

test("V1 礼物使用发送者粉丝牌，而不是无关的 medal_info", () => {
  assert.match(adapterSource, /sender_uinfo\?\.medal/);
  assert.match(adapterSource, /senderMedal/);
});

test("V2 礼物解析当前房间粉丝牌和大航海等级", () => {
  assert.match(protoSource, /userInfo:\s*\{\s*id: 15/);
  assert.match(protoSource, /guardLevel:\s*\{ id: 11, type: 'int32' \}/);
  assert.match(adapterSource, /g\.medal/);
  assert.match(adapterSource, /g\.guardLevel/);
});
