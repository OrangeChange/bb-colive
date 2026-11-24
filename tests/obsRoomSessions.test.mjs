import test from "node:test";
import assert from "node:assert/strict";
let createRoomSessions;
try {
  ({ createRoomSessions } = await import("../src/obs/obsRoomSessions.ts"));
} catch (error) {
  if (error.code !== "ERR_MODULE_NOT_FOUND") throw error;
}
test("同房连接共享且释放其中一个使用者不会断开其他输出", async () => {
  assert.equal(typeof createRoomSessions, "function");
  let created = 0,
    disconnected = 0,
    callbacks;
  const sessions = createRoomSessions({
    resolveRoom: async (input) => (Number(input) == 7 ? 700 : Number(input)),
    create: (cb) => {
      created++;
      callbacks = cb;
      return {
        connect: async () => {},
        disconnect() {
          disconnected++;
        },
        anchor: null,
        isConnected: true,
      };
    },
  });
  const first = [],
    second = [];
  const a = await sessions.acquire(
    { roomIdInput: "7", cookie: "", uid: 1 },
    { onEvent: (e) => first.push(e.id), onState() {} },
  );
  const b = await sessions.acquire(
    { roomIdInput: "700", cookie: "", uid: 1 },
    { onEvent: (e) => second.push(e.id), onState() {} },
  );
  assert.equal(created, 1);
  callbacks.onEvent({ id: "a" });
  a.release();
  callbacks.onEvent({ id: "b" });
  assert.deepEqual(first, ["a"]);
  assert.deepEqual(second, ["a", "b"]);
  assert.equal(disconnected, 0);
  b.release();
  assert.equal(disconnected, 1);
});
test("不同房间事件互不影响", async () => {
  assert.equal(typeof createRoomSessions, "function");
  const sources = new Map();
  const sessions = createRoomSessions({
    resolveRoom: async (input) => Number(input),
    create: (cb) => ({
      connect: async (p) => {
        sources.set(p.roomIdInput, cb);
      },
      disconnect() {},
      anchor: null,
      isConnected: true,
    }),
  });
  const received = [];
  await sessions.acquire(
    { roomIdInput: "1", cookie: "", uid: 1 },
    { onEvent: (e) => received.push("1:" + e.id), onState() {} },
  );
  await sessions.acquire(
    { roomIdInput: "2", cookie: "", uid: 1 },
    { onEvent: (e) => received.push("2:" + e.id), onState() {} },
  );
  sources.get("1").onEvent({ id: "x" });
  assert.deepEqual(received, ["1:x"]);
});

test("初始化失败后再次订阅会重试，并保留已有订阅者", async () => {
  let attempts = 0;
  const states = [];
  const sessions = createRoomSessions({
    resolveRoom: async () => 1,
    create: (cb) => ({
      connect: async () => {
        attempts++;
        if (attempts === 1) throw new Error("network");
        cb.onState({ status: "connected", roomId: 1 });
      },
      disconnect() {},
      anchor: null,
      isConnected: false,
    }),
  });
  const a = await sessions.acquire(
    { roomIdInput: "1", cookie: "", uid: 1 },
    { onEvent() {}, onState: (s) => states.push(s.status) },
  );
  await a.ready;
  const b = await sessions.acquire(
    { roomIdInput: "1", cookie: "", uid: 1 },
    { onEvent() {}, onState() {} },
  );
  await b.ready;
  assert.equal(attempts, 2);
  assert.equal(states.at(-1), "connected");
  a.release();
  b.release();
});

test('共享连接重放最新开下播状态，不提前向原订阅者发布状态', async () => {
  const { MsgType } = await import('../src/protocol/types.ts');
  let source;
  const sessions = createRoomSessions({
    resolveRoom: async () => 101,
    create: cb => { source = cb; return { connect: async () => {}, disconnect() {}, anchor: null, isConnected: true }; },
  });
  const states = [];
  const first = await sessions.acquire({ roomIdInput: '101', cookie: '', uid: 1 }, {
    onState: state => states.push(state), onEvent() {},
  });
  source.onState({ status: 'connected', roomId: 101, liveStatus: 1, liveStartedAt: 1700000000000 });
  source.onEvent({ id: 'end', roomId: 101, msgType: MsgType.LiveEnd, ts: 1700000100000 });
  assert.equal(states.length, 1);
  let replay;
  const second = await sessions.acquire({ roomIdInput: '101', cookie: '', uid: 1 }, {
    onState: state => { replay = state; }, onEvent() {},
  });
  second.replay();
  assert.equal(replay.liveStatus, 0);
  source.onEvent({ id: 'start', roomId: 101, msgType: MsgType.LiveStart, ts: 1700000200000,
    liveIdentity: { sourceLiveStartedAt: 1700000200000 } });
  second.replay();
  assert.equal(replay.liveStatus, 1);
  assert.equal(replay.liveStartedAt, 1700000200000);
  first.release(); second.release();
});
