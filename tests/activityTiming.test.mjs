import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
let server, adapt;
const ctx = { roomId: 545068, anchorUid: '1', keepRaw: false };
test.before(async () => {
  server = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-activityTiming.test.mjs", configFile: false, logLevel: 'silent', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null } });
  ({ adapt } = await server.ssrLoadModule('/src/protocol/adapter.ts'));
});
test.after(() => server?.close());
test('红包保留官方截止时间，未来开始不以接收时间替代', () => {
  const event = adapt({ cmd: 'POPULARITY_RED_POCKET_V2_START', data: { lot_id: 8, start_time: 1794457600, current_time: 1794457529, end_time: 1794458201, last_time: 600 } }, ctx);
  assert.equal(event.lottery.timing.startsAt, 1794457600000);
  assert.equal(event.lottery.timing.endsAt, 1794458201000);
  assert.equal(event.lottery.timing.serverNow, 1794457529000);
  assert.equal(event.lottery.timing.source, 'end-time');
});
test('天选的65秒剩余不变为600秒总时长，同活动去重身份稳定', () => {
  const message = { cmd: 'ANCHOR_LOT_START', data: { id: 101, current_time: 1794457529, time: 65, max_time: 600 } };
  const a = adapt(message, ctx), b = adapt(message, ctx);
  assert.equal(a.id, b.id);
  assert.equal(a.lottery.maxTime, 600);
  assert.equal(a.lottery.timing.endsAt - a.lottery.timing.serverNow, 65000);
  assert.equal(a.lottery.timing.source, 'remaining');
});
test('缺少剩余时间时不以总时长制造截止时间，旧事件仍可读取', () => {
  const event = adapt({ cmd: 'ANCHOR_LOT_START', data: { id: 102, max_time: 600 } }, ctx);
  assert.equal(event.lottery.timing, undefined);
  assert.equal(event.lottery.maxTime, 600);
});
test('红包没有end_time时由明确开始和持续时长推导', () => {
  const event = adapt({ cmd: 'POPULARITY_RED_POCKET_START', data: { lot_id: 9, start_time: 1794456994, last_time: 600 } }, ctx);
  assert.equal(event.lottery.timing.endsAt, 1794457594000);
  assert.equal(event.lottery.timing.source, 'start-duration');
});
