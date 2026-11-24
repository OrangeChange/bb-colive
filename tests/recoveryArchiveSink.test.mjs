import test from 'node:test';
import assert from 'node:assert/strict';

import { RecoveryArchiveSink, cloudEventKey, cloudSessionId } from '../src/cloudSync/recoveryArchiveSink.ts';

function repository() {
  const owners = new Map(), sessions = new Map(), events = new Map(), updates = [];
  return {
    owners, sessions, events, updates, recomputed: 0,
    async upsertOwner(value) { owners.set(value.ownerId, value); },
    async getSession(id) { return sessions.get(id) ?? null; },
    async upsertSession(value) { sessions.set(value.sessionId, value); },
    async updateSession(value) { sessions.set(value.sessionId, { ...sessions.get(value.sessionId), ...value }); },
    async getNextEventOrdinal(id) { return [...events.values()].filter(event => event.sessionId === id).length; },
    async appendEvents(values) { let inserted = 0; for (const value of values) if (!events.has(value.eventKey)) { events.set(value.eventKey, value); inserted++; } return inserted; },
    async updateEvent(value) { updates.push(value); }, async reassignSourceEventRange(value) { updates.push(value); return 1; },
    async recomputePaidTotals() { this.recomputed++; return 0; },
    async recomputeEventCounts() { this.recomputed++; return 0; },
  };
}

const source = { serverId: 'server', roomId: '123', cutId: 'cut-1' };
const session = { serverSessionId: 'session-a', title: '直播标题', captureStartedAt: 1_000,
  sourceLiveStartedAt: 900, endedAt: 2_000, liveStatus: 'ended', quality: 'complete', qualityReasons: [],
  broadcaster: { uid: '88', name: '主播', face: 'face.webp' } };
const record = (sequence, id, text = id) => ({ source: { serverId: 'server', roomId: '123', sequence },
  evidence: { serverSessionId: 'session-a' }, outputs: [{ outputIndex: 0, event: { id, roomId: 123, ts: 1_100 + Number(sequence), msgType: 0, text } }] });

test('修正已恢复场次开播时间，空标题不覆盖已有资料和收藏',async()=>{
  const repo=repository(),sink=new RecoveryArchiveSink(repo),id=cloudSessionId(source,'session-a');
  await sink.syncSessions(source,[session]);
  await repo.updateSession({sessionId:id,favoriteCount:2,coverUrl:'local-cover'});
  await sink.syncSessions(source,[{...session,sourceLiveStartedAt:800,title:null}]);
  assert.equal(repo.sessions.get(id).startedAt,800);
  assert.equal(repo.sessions.get(id).title,'直播标题');
  assert.equal(repo.sessions.get(id).favoriteCount,2);
  assert.equal(repo.sessions.get(id).coverUrl,'local-cover');
});

test('稳定写入主播、场次与事件，重复应用不产生重复数据', async () => {
  const repo = repository();
  const sink = new RecoveryArchiveSink(repo);
  const first = await sink.writeBatch({ source, sessions: [session], records: [record('1', 'dm-1')] });
  const second = await sink.writeBatch({ source, sessions: [session], records: [record('1', 'dm-1')] }, first.state);
  assert.equal(repo.owners.size, 1);
  assert.equal(repo.sessions.size, 1);
  assert.equal(repo.events.size, 1);
  assert.equal(first.insertedEvents, 1);
  assert.equal(second.insertedEvents, 0);
  assert.equal([...repo.sessions][0][0], cloudSessionId(source, 'session-a'));
  assert.equal([...repo.events][0][0], cloudEventKey(source, '1', 0));
  assert.equal([...repo.events.values()][0].sourceId, 'cloud-recovery:server:123');
  assert.deepEqual(first.state.eventKeysByPlatformId, {});
});

test('元数据缺少结束时间时使用明确的直播结束事件补齐场次边界', async () => {
  const repo = repository(), sink = new RecoveryArchiveSink(repo);
  const endedAt = 2_345;
  await sink.writeBatch({ source, sessions: [{ ...session, endedAt: null }], records: [{
    ...record('2', 'live-end'), outputs: [{ outputIndex: 0,
      event: { id: 'live-end', roomId: 123, ts: endedAt, msgType: 23, text: '直播结束', stats: { liveEndedAt: endedAt } } }],
  }] });
  assert.equal(repo.sessions.get(cloudSessionId(source, 'session-a')).endedAt, endedAt);
});

test('恢复任务为新增事件写入独立来源标识并报告新建场次', async () => {
  const repo = repository();
  const created = [];
  const sink = new RecoveryArchiveSink(repo, undefined, value => created.push(value));
  await sink.writeBatch({ source: { ...source, recoveryRunId: 'run-1' }, sessions: [session], records: [record('1', 'dm-1')] });
  assert.deepEqual(created, [cloudSessionId(source, 'session-a')]);
  assert.equal([...repo.events.values()][0].sourceId, 'cloud-recovery-run:run-1');
});

test('失败批次不保存进度，重试后从同一批继续', async () => {
  const repo = repository();
  const original = repo.appendEvents.bind(repo);
  let fail = true;
  repo.appendEvents = async values => { if (fail) { fail = false; throw new Error('write failed'); } return original(values); };
  const saved = [];
  const sink = new RecoveryArchiveSink(repo, state => saved.push(structuredClone(state)));
  await assert.rejects(() => sink.writeBatch({ source, sessions: [session], records: [record('1', 'dm-1')] }));
  assert.equal(saved.length, 0);
  const result = await sink.writeBatch({ source, sessions: [session], records: [record('1', 'dm-1')] });
  assert.equal(result.insertedEvents, 1);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].lastSequence, '1');
  assert.equal(saved[0].lastOutputIndex, 0);
});

test('同一事实的多页输出按输出位置继续写入', async () => {
  const repo = repository();
  const sink = new RecoveryArchiveSink(repo);
  const outputs = Array.from({ length: 64 }, (_, outputIndex) => ({ outputIndex,
    event: { id: `dm-${outputIndex}`, roomId: 123, ts: 1_100, msgType: 0, text: `event-${outputIndex}` } }));
  const first = await sink.writeRecords(source, [{ ...record('2', 'unused'), outputs }]);
  const second = await sink.writeRecords(source, [{ ...record('2', 'unused'), outputs: [{ outputIndex: 64,
    event: { id: 'dm-64', roomId: 123, ts: 1_101, msgType: 0, text: 'event-64' } }] }], first.state);
  assert.equal(first.state.lastSequence, '2');
  assert.equal(first.state.lastOutputIndex, 63);
  assert.equal(second.state.lastOutputIndex, 64);
  assert.equal(repo.events.size, 65);
});

test('跨批使用已保存事件映射处理醒目留言删除', async () => {
  const repo = repository();
  const sink = new RecoveryArchiveSink(repo);
  const first = await sink.writeBatch({ source, sessions: [session], records: [{ ...record('1', 'sc-1'), outputs: [{ outputIndex: 0,
    event: { id: 'sc-1', roomId: 123, ts: 1_100, msgType: 2, text: '留言', sc: { price: 30, message: '留言', duration: 60 } } }] }] });
  const deletion = { source: { serverId: 'server', roomId: '123', sequence: '2' }, evidence: { serverSessionId: 'session-a' },
    outputs: [{ outputIndex: 0, event: { id: 'delete', roomId: 123, ts: 1_200, msgType: 17, scDeleteIds: ['sc-1'] } }] };
  await sink.writeBatch({ source, sessions: [session], records: [deletion] }, first.state);
  assert.deepEqual(repo.updates, [{ eventKey: cloudEventKey(source, '1', 0), patch: { scDeleted: true } }]);
});

test('跨批忽略同一场次内醒目留言的重复回显', async () => {
  const repo = repository();
  const sink = new RecoveryArchiveSink(repo);
  const sc = sequence => ({ ...record(sequence, 'sc-1'), outputs: [{ outputIndex: 0,
    event: { id: 'sc-1', roomId: 123, ts: 1_100, msgType: 2, text: '留言',
      sc: { price: 30, message: '留言', duration: 60 } } }] });
  const first = await sink.writeBatch({ source, sessions: [session], records: [sc('1')] });
  const second = await sink.writeRecords(source, [sc('2')], first.state);
  assert.equal(first.insertedEvents, 1);
  assert.equal(second.insertedEvents, 0);
  assert.equal(repo.events.size, 1);
});

test('完成后只调用现有统计重算', async () => {
  const repo = repository();
  await new RecoveryArchiveSink(repo).finalize();
  assert.equal(repo.recomputed, 2);
});

test('场次元数据可以在没有事件时独立更新', async () => {
  const repo = repository();
  const sink = new RecoveryArchiveSink(repo);
  await sink.syncSessions(source, [session]);
  await sink.syncSessions(source, [{ ...session, title: '更新后的标题', liveStatus: 'ongoing', endedAt: null }]);
  const saved = repo.sessions.get(cloudSessionId(source, 'session-a'));
  assert.equal(saved.title, '更新后的标题');
  assert.equal(saved.status, 'active');
  assert.equal(repo.events.size, 0);
});

test('归属修订交给现有档案库按稳定来源范围应用', async () => {
  const repo = repository();
  const sink = new RecoveryArchiveSink(repo);
  await sink.applyAssignments(source, [{ from_sequence: '2', through_sequence: '3', server_session_id: 'session-a' },
    { from_sequence: '1', through_sequence: '1', server_session_id: null }]);
  assert.deepEqual(repo.updates.slice(-1), [
    { namespace: 'cloud-event', serverId: 'server', roomId: '123', fromSequence: '2', throughSequence: '3',
      targetSessionId: cloudSessionId(source, 'session-a') },
  ]);
});
