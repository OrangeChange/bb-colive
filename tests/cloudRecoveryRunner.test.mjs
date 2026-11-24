import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { goldenRoot, sha } from './recoveryFixtureUtils.mjs';
let server, createCloudRecoveryState, recoveryStartState, outputsAfterArchiveCursor, recoveryCheckpointState, runCloudRecovery;
test.before(async () => {
  server = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-cloudRecoveryRunner.test.mjs",optimizeDeps:{noDiscovery:true,include:[]}, root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
    logLevel: 'silent', server: { middlewareMode: true, watch: null } });
  ({ createCloudRecoveryState, recoveryStartState, outputsAfterArchiveCursor, recoveryCheckpointState,
    runCloudRecovery } = await server.ssrLoadModule('/src/cloudSync/cloudRecoveryRunner.ts'));
});

test.after(async () => { await server?.close(); });

test('同一事实仅保留检查点之后的输出', () => {
  const outputs = [0, 63, 64].map(outputIndex => ({ outputIndex, event: { id: String(outputIndex) } }));
  assert.deepEqual(outputsAfterArchiveCursor('2', outputs,
    { lastSequence: '2', lastOutputIndex: 63, eventKeysByPlatformId: {} }).map(value => value.outputIndex), [64]);
});

test('待归属记录保留读取边界但保存醒目留言去重映射', () => {
  const previous = { lastSequence: '1', lastOutputIndex: 2, eventKeysByPlatformId: { old: 'event-1' } };
  const current = { lastSequence: '9', lastOutputIndex: 4,
    eventKeysByPlatformId: { old: 'event-1', sc: 'event-9' } };
  assert.deepEqual(recoveryCheckpointState(previous, current, true), {
    lastSequence: '1', lastOutputIndex: 2, eventKeysByPlatformId: { old: 'event-1', sc: 'event-9' },
  });
});

test('重新完整恢复从空断点开始，普通恢复保留现有断点', () => {
  const previous = { ...createCloudRecoveryState('server-1', '24125'), cutId: 'cut-1' };
  assert.equal(recoveryStartState(previous, false, 'server-1', '24125'), previous);
  assert.deepEqual(recoveryStartState(previous, true, 'server-1', '24125'),
    createCloudRecoveryState('server-1', '24125'));
});

function repository() {
  const sessions = new Map(), events = new Map();
  return { sessions, events,
    async upsertOwner() {}, async getSession(id) { return sessions.get(id) ?? null; },
    async upsertSession(value) { sessions.set(value.sessionId, value); },
    async updateSession(value) { sessions.set(value.sessionId, { ...sessions.get(value.sessionId), ...value }); },
    async getNextEventOrdinal(id) { return [...events.values()].filter(value => value.sessionId === id).length; },
    async appendEvents(values) { let count = 0; for (const value of values) if (!events.has(value.eventKey)) { events.set(value.eventKey, value); count++; } return count; },
    async updateEvent() {}, async reassignSourceEventRange() { return 0; },
    async recomputePaidTotals() { return 0; }, async recomputeEventCounts() { return 0; },
  };
}

const encoder = new TextEncoder();
const jsonLine = value => encoder.encode(`${JSON.stringify(value)}\n`);
function fixtureTransport(startCalls = []) {
  const root = structuredClone(goldenRoot('baseline'));
  root.room_id = '123'; root.cut.room_id = '123'; root.cut.event_head = '1'; root.counts.facts = '1';
  root.counts.pending_assignments = '0';
  const fact = { server_id: root.server_id, room_id: '123', server_sequence: '1', server_session_id: '00000000-0000-4000-8000-000000000002', received_at: '2026-10-07T19:00:00.000Z',
    bilibili_timestamp: null, protocol_version: 3, connection_id: '00000000-0000-4000-8000-000000000003', login_account_uid: '9', upstream_event_id: null,
    user_uid: '9', command_category: 'danmu', is_paid: false, business_id: null, combo_id: null, index_extractor_version: null,
    decode_status: 'decoded', duplicate_of_sequence: null, quality_flags: [],
    command: 'DANMU_MSG', raw_payload: { kind: 'json', value: { cmd: 'DANMU_MSG', info: [[0, 0, 0, 0, Date.parse('2026-10-07T19:00:00Z')], '恢复弹幕', ['9', '用户'], [], []] } }, snapshot_ids: [] };
  const state = { type: 'session_state', server_session_id: fact.server_session_id, availability: 'available', broadcaster_snapshot: { uid: '8', name: '主播' },
    title: '恢复场次', area: null, source_live_started_at: '1791396000', capture_started_at: '2026-10-07T18:00:00.000Z', captured_start: true,
    ended_at: '2026-10-07T20:00:00.000Z', end_evidence: 'live_end', ended_discovered_at: '2026-10-07T20:00:00.000Z', live_status: 'ended', recording_status: 'stopped',
    stopped_at: '2026-10-07T20:00:00.000Z', stop_reason: null, quality: 'complete', quality_reasons: [], pending_evidence: null,
    min_sequence: '1', max_sequence: '1', event_count: '1', expires_at: null };
  const assignment = { type: 'assignment', from_sequence: '1', through_sequence: '1', server_session_id: fact.server_session_id };
  const material = new Map([['facts', jsonLine(fact)], ['baseline', encoder.encode(`${JSON.stringify(state)}\n${JSON.stringify(assignment)}\n`)]]);
  const ids = { facts: '10000000-0000-4000-8000-000000000001', baseline: '10000000-0000-4000-8000-000000000002' };
  const entries = [...material].map(([kind, bytes]) => ({ type: 'object', object_id: ids[kind], kind, stream_id: kind,
    stream_ordinal: 0, media_type: 'application/x-ndjson', byte_size: String(bytes.length), sha256: sha(bytes), chunk_count: 1,
    chunks: [{ index: 0, byte_size: bytes.length, sha256: sha(bytes) }] }));
  const leafBytes = jsonLine({ kind: 'catalog_leaf', level: 0, entries });
  const leaf = { object_id: '10000000-0000-4000-8000-000000000003', kind: 'catalog_leaf', level: 0,
    byte_size: String(leafBytes.length), sha256: sha(leafBytes), chunk_count: 1 };
  const indexBytes = jsonLine({ kind: 'catalog_index', level: 1, children: [leaf] });
  root.catalog_root = { object_id: '10000000-0000-4000-8000-000000000004', kind: 'catalog_index', level: 1,
    byte_size: String(indexBytes.length), sha256: sha(indexBytes), chunk_count: 1 };
  const cache = new Map([[ids.facts, material.get('facts')], [ids.baseline, material.get('baseline')]]);
  const catalogs = new Map([[root.catalog_root.object_id, indexBytes], [leaf.object_id, leafBytes]]);
  return {
    root,
    async start(roomId, mode, fromCutId, selection) { assert.equal(roomId, root.room_id); root.selection = structuredClone(selection); root.cut.selection = structuredClone(selection); startCalls.push({ mode, fromCutId, selection }); return { localJobId: 'local' }; },
    async status() { return { state: 'ready', root }; },
    async downloadCatalog(_, ref) { return catalogs.get(ref.object_id); },
    async downloadObject(_, object) { const bytes = cache.get(object.object_id);
      return { objectId: object.object_id, sha256: object.sha256, byteSize: object.byte_size, cacheHandle: object.object_id,
        kind: object.kind, streamId: object.stream_id, streamOrdinal: object.stream_ordinal, verified: true }; },
    async readSlice(_, handle, offset, maximum) { const bytes = cache.get(handle); return bytes.slice(Number(offset), Number(offset) + maximum); },
  };
}

test('Contract 0.3 基线通过真实目录、对象和解码链恢复进度', async () => {
  const starts = [], transport = fixtureTransport(starts), root = transport.root, repo = repository(), saved = [], progress = [];
  const state = await runCloudRecovery({ roomId: root.room_id, repository: repo,
    previous: createCloudRecoveryState(root.server_id, root.room_id), transport,
    save: value => saved.push(structuredClone(value)), onProgress: value => progress.push(value.phase) });
  assert.equal(state.cutId, root.cut.cut_id);
  assert.equal(JSON.parse(state.contextJson).lastSequence, '1');
  assert.equal(state.sessions.length, 1);
  assert.equal(repo.events.size, 1);
  assert.equal(saved.length, 2);
  assert.equal(saved[0].cutId, null);
  assert.ok(progress.includes('downloading'));
  assert.equal(progress.at(-2), 'finalizing');
  assert.equal(progress.at(-1), 'complete');
  assert.deepEqual(starts, [{ mode: 'baseline', fromCutId: undefined,
    selection: { scope: 'all', include_danmaku: true, include_interactions: true } }]);
});

test('选场恢复始终建立 baseline 并把选择条件传给原生层', async () => {
  const starts = [], transport = fixtureTransport(starts), root = transport.root, selection = {
    scope: 'sessions', session_ids: ['00000000-0000-4000-8000-000000000002'],
    include_danmaku: false, include_interactions: true,
  };
  await runCloudRecovery({ roomId: root.room_id, repository: repository(), transport, selection,
    previous: { ...createCloudRecoveryState(root.server_id, root.room_id), cutId: '00000000-0000-4000-8000-000000000099' },
    save: () => {} });
  assert.deepEqual(starts, [{ mode: 'baseline', fromCutId: undefined, selection }]);
});

