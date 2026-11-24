import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));

function varint(value) {
  let n = BigInt(value);
  const bytes = [];
  while (n >= 0x80n) {
    bytes.push(Number((n & 0x7fn) | 0x80n));
    n >>= 7n;
  }
  bytes.push(Number(n));
  return Uint8Array.from(bytes);
}

function concat(...parts) {
  const size = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function field(number, wireType, value) {
  return concat(varint((BigInt(number) << 3n) | BigInt(wireType)), value);
}

function integerField(number, value) {
  return field(number, 0, varint(value));
}

function stringField(number, value) {
  const bytes = new TextEncoder().encode(value);
  return field(number, 2, concat(varint(bytes.length), bytes));
}

function messageField(number, value) {
  return field(number, 2, concat(varint(value.length), value));
}

function giftItem({ id, name, price, total, itemId, timestamp }) {
  return concat(
    integerField(1, id),
    stringField(2, name),
    integerField(3, 1),
    integerField(5, price),
    integerField(7, total),
    stringField(8, "gold"),
    ...(timestamp ? [integerField(10, timestamp)] : []),
    stringField(12, itemId),
  );
}

function blindBox() {
  return concat(
    integerField(2, 32251),
    stringField(3, "心动盲盒"),
    stringField(5, "爆出"),
    integerField(6, 15000),
  );
}

function payload() {
  const bytes = concat(
    integerField(1, 777),
    stringField(2, "测试用户"),
    messageField(9, blindBox()),
    messageField(10, giftItem({ id: 1001, name: "爱心抱枕", price: 16000, total: 15000, itemId: "item-1" })),
    messageField(10, giftItem({ id: 1002, name: "电影票", price: 2000, total: 15000, itemId: "item-2" })),
  );
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function guardPayload({ roomGuard = 0, otherRoomGuard = 0, medalRoomId = 999, medalGuard = 0 } = {}) {
  const currentRoomMedal = concat(
    stringField(1, "测试房间牌"),
    integerField(2, 10),
    integerField(10, medalRoomId),
    integerField(11, medalGuard),
  );
  const userInfo = messageField(3, currentRoomMedal);
  const bytes = concat(
    integerField(1, 777),
    stringField(2, "测试用户"),
    ...(roomGuard ? [integerField(5, roomGuard)] : []),
    messageField(8, concat(integerField(1, 12345), integerField(12, otherRoomGuard))),
    messageField(10, giftItem({ id: 1001, name: "爱心抱枕", price: 16000, total: 16000, itemId: "guard-item" })),
    messageField(15, userInfo),
  );
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

let server;
let adapt;
let getVoiceCategory;
let isEventVisibleInPane;
let DEFAULT_EVENT_FILTERS;

test.before(async () => {
  server = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-sendGiftV2BlindBox.test.mjs",optimizeDeps:{noDiscovery:true,include:[]}, configFile: false, root, logLevel: "silent", server: { middlewareMode: true, watch: null } });
  ({ adapt } = await server.ssrLoadModule("/src/protocol/adapter.ts"));
  ({ getVoiceCategory } = await server.ssrLoadModule("/src/voice/voiceProjection.ts"));
  ({ isEventVisibleInPane, DEFAULT_EVENT_FILTERS } = await server.ssrLoadModule("/src/events/eventView.ts"));
});

test.after(async () => {
  await server?.close();
});

test("SEND_GIFT_V2 使用礼物项来源时间，缺失时使用接收时间", () => {
  const bytes = messageField(10, giftItem({ id: 1, name: "礼物", price: 1000, total: 1000, itemId: "clock", timestamp: 1793459532 }));
  const event = adapt({ cmd: "SEND_GIFT_V2", data: { pb: Buffer.from(bytes).toString("base64") } }, { roomId: 123, anchorUid: "999", keepRaw: false });
  assert.equal(event.ts, 1793459532000);
  const before = Date.now();
  const fallback = adapt({ cmd: "SEND_GIFT_V2", data: { pb: guardPayload() } }, { roomId: 123, anchorUid: "999", keepRaw: false });
  assert.ok(fallback.ts >= before && fallback.ts <= Date.now());
});

test("SEND_GIFT_V2 盲盒报文拆成有序的多个盲盒结果事件", () => {
  const result = adapt(
    { cmd: "SEND_GIFT_V2", data: { pb: payload() } },
    { roomId: 123, anchorUid: "999", keepRaw: false },
  );

  assert.ok(Array.isArray(result), "同一 V2 报文的多个结果应拆成事件数组");
  assert.deepEqual(result.map((event) => event.gift?.name), ["爱心抱枕", "电影票"]);
  assert.deepEqual(result.map((event) => event.gift?.blindGiftName), ["心动盲盒", "心动盲盒"]);
  assert.deepEqual(result.map((event) => event.gift?.blindPriceRmb), [15, 15]);
  assert.deepEqual(result.map((event) => event.gift?.blindHitPriceRmb), [16, 2]);
  assert.deepEqual(result.map((event) => event.user?.uname), ["测试用户", "测试用户"]);
  assert.deepEqual(result.map((event) => getVoiceCategory(event)), ["blindBox", "blindBox"]);
  assert.deepEqual(
    result.map((event) => isEventVisibleInPane(event, "right", DEFAULT_EVENT_FILTERS, 0)),
    [true, true],
  );
  assert.notEqual(result[0].id, result[1].id);
});

test("SEND_GIFT_V2 不会把其他直播间的勋章等级当作当前房间大航海", () => {
  const event = adapt(
    { cmd: "SEND_GIFT_V2", data: { pb: guardPayload({ otherRoomGuard: 3 }) } },
    { roomId: 123, anchorUid: "999", keepRaw: false },
  );

  assert.equal(event.user.guardLevel, 0);
  assert.equal(event.user.medal?.isCurrentRoom, true);
});

test("SEND_GIFT_V2 仍识别当前房间勋章携带的大航海等级", () => {
  const event = adapt(
    { cmd: "SEND_GIFT_V2", data: { pb: guardPayload({ medalGuard: 3, otherRoomGuard: 0 }) } },
    { roomId: 123, anchorUid: "999", keepRaw: false },
  );

  assert.equal(event.user.guardLevel, 1);
  assert.equal(event.user.medal?.isCurrentRoom, true);
});

test("SEND_GIFT_V2 保留协议顶层携带的当前房间大航海等级", () => {
  const event = adapt(
    { cmd: "SEND_GIFT_V2", data: { pb: guardPayload({ roomGuard: 3, otherRoomGuard: 0, medalGuard: 0 }) } },
    { roomId: 123, anchorUid: "999", keepRaw: false },
  );

  assert.equal(event.user.guardLevel, 1);
});

test("SEND_GIFT_V2 不采用所属主播与当前房间不符的勋章等级", () => {
  const event = adapt(
    { cmd: "SEND_GIFT_V2", data: { pb: guardPayload({ medalRoomId: 54321, medalGuard: 3 }) } },
    { roomId: 123, anchorUid: "999", keepRaw: false },
  );

  assert.equal(event.user.guardLevel, 0);
  assert.equal(event.user.medal.isCurrentRoom, false);
});

test("其他房间的勋章不会通过其他事件路径变成当前直播间大航海", () => {
  const foreignMedal = { medal_name: "其他房间牌", medal_level: 10, ruid: 54321, guard_level: 3 };
  const messages = [
    {
      cmd: "SEND_GIFT",
      data: { uid: 777, uname: "测试用户", giftId: 1001, giftName: "礼物", num: 1, price: 100, total_coin: 100, sender_uinfo: { medal: foreignMedal } },
    },
    {
      cmd: "COMBO_SEND",
      data: { uid: 777, uname: "测试用户", gift_id: 1001, gift_name: "礼物", combo_num: 1, sender_uinfo: { medal: foreignMedal, base: {} } },
    },
    {
      cmd: "POPULARITY_RED_POCKET_START",
      data: { lot_id: 1, sender_uid: 777, sender_name: "测试用户", medal_info: foreignMedal },
    },
    {
      cmd: "LIKE_INFO_V3_CLICK",
      data: { uid: 777, uinfo: { base: { name: "测试用户" } }, fans_medal: foreignMedal },
    },
  ];

  const levels = messages.map((message) =>
    adapt(message, { roomId: 123, anchorUid: "999", keepRaw: false }).user.guardLevel,
  );
  assert.deepEqual(levels, [0, 0, 0, 0]);
});

test("各事件路径仍识别明确属于当前直播间的勋章大航海", () => {
  const roomMedal = { medal_name: "当前房间牌", medal_level: 10, ruid: 999, guard_level: 3 };
  const messages = [
    {
      cmd: "SEND_GIFT",
      data: { uid: 777, uname: "测试用户", giftId: 1001, giftName: "礼物", num: 1, price: 100, total_coin: 100, sender_uinfo: { medal: roomMedal } },
    },
    {
      cmd: "COMBO_SEND",
      data: { uid: 777, uname: "测试用户", gift_id: 1001, gift_name: "礼物", combo_num: 1, sender_uinfo: { medal: roomMedal, base: {} } },
    },
    {
      cmd: "POPULARITY_RED_POCKET_START",
      data: { lot_id: 2, sender_uid: 777, sender_name: "测试用户", sender_info: { medal: roomMedal } },
    },
    {
      cmd: "LIKE_INFO_V3_CLICK",
      data: { uid: 777, uinfo: { base: { name: "测试用户" } }, fans_medal: roomMedal },
    },
  ];

  const levels = messages.map((message) =>
    adapt(message, { roomId: 123, anchorUid: "999", keepRaw: false }).user.guardLevel,
  );
  assert.deepEqual(levels, [1, 1, 1, 1]);
});
