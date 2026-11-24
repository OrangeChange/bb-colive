import test from 'node:test';
import assert from 'node:assert/strict';
import { componentRuntime } from './helpers/componentRuntime.mjs';

function connection() {
  const states = [];
  const { exports } = componentRuntime('src/protocol/connection.ts', {
    '../diagnostics/diagnosticLogger': { getDiagnosticContext: () => ({}) },
  });
  const connection = new exports.DanmuConnection({ onState: state => states.push(state), onEvent() {} });
  connection.ctx = { roomId: 101 };
  connection.live = { connection: { live: true } };
  connection.anchorInfo = { realRoomId: 101, uname: '主播', liveStatus: 1 };
  connection.liveStatus = 1;
  connection.liveStartedAt = 1700000000000;
  return { connection, states };
}

test('定时房间快照同步当前连接和主播资料', () => {
  const { connection: c, states } = connection();
  assert.equal(c.reconcileLiveStatus({ room_id: 101, live_status: 0, live_time: -1 }, c.liveStatusRevision), true);
  assert.equal(c.anchor.liveStatus, 0);
  assert.equal(states.at(-1).liveStatus, 0);
  assert.equal(states.at(-1).status, 'connected');
});

test('查询期间收到开下播推送，不接受先前快照', () => {
  const { connection: c, states } = connection();
  const revision = c.liveStatusRevision;
  c.liveEvidenceRevision++;
  assert.equal(c.reconcileLiveStatus({ room_id: 101, live_status: 0 }, revision), false);
  assert.equal(c.anchor.liveStatus, 1);
  assert.equal(states.length, 0);
});

test('同场查询缺少开播时间时保留已知时间', () => {
  const { connection: c, states } = connection();
  assert.equal(c.reconcileLiveStatus({ room_id: 101, live_status: 1 }, c.liveStatusRevision), true);
  assert.equal(states.at(-1).liveStartedAt, 1700000000000);
});

test('下播后的相同开播时间旧快照不能重开上一场，新的开播时间可以', () => {
  const { connection: c, states } = connection();
  c.liveStatus = 0;
  c.anchorInfo.liveStatus = 0;
  assert.equal(c.reconcileLiveStatus({ room_id: 101, live_status: 1, live_time: 1700000000 }, c.liveStatusRevision), false);
  assert.equal(states.length, 0);
  assert.equal(c.reconcileLiveStatus({ room_id: 101, live_status: 1, live_time: 1700001000 }, c.liveStatusRevision), true);
  assert.equal(states.at(-1).liveStartedAt, 1700001000000);
});

test('断开或其他房间的查询结果不更新当前连接', () => {
  const { connection: c, states } = connection();
  assert.equal(c.reconcileLiveStatus({ room_id: 202, live_status: 0 }, c.liveStatusRevision), false);
  c.closedByUser = true;
  assert.equal(c.reconcileLiveStatus({ room_id: 101, live_status: 0 }, c.liveStatusRevision), false);
  assert.equal(states.length, 0);
});

test('已知下播但未记录上一场时间时，允许接口确认开播状态', () => {
  const { connection: c, states } = connection();
  c.liveStatus = 0;
  c.liveStartedAt = undefined;
  assert.equal(c.reconcileLiveStatus({ room_id: 101, live_status: 1 }, c.liveStatusRevision), true);
  assert.equal(states.at(-1).liveStatus, 1);
  assert.equal(states.at(-1).liveStartedAt, undefined);
});
