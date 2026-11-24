import test from 'node:test';
import assert from 'node:assert/strict';

async function stateModule() {
  const module = await import('../src/archive/archiveSessionState.ts').catch(() => ({}));
  assert.equal(typeof module.normalizeArchiveSessionState, 'function');
  return module;
}

test('旧场次按证据归一化，未知开头与进程遗留不证明缺口', async () => {
  const { normalizeArchiveSessionState } = await stateModule();
  for (const [status, quality, qualityReason, wantStatus, wantQuality, reasons] of [
    ['active', 'in-progress', null, 'unclean', 'in-progress', []],
    ['unclean', 'incomplete', 'start-time-unknown', 'unclean', 'in-progress', []],
    ['unclean', 'incomplete', 'previous-runtime', 'unclean', 'in-progress', []],
    ['unclean', 'incomplete', 'app-exit', 'unclean', 'in-progress', []],
    ['ended', 'complete', null, 'ended', 'complete', []],
    ['ended', 'incomplete', 'live-start-not-captured', 'ended', 'incomplete', ['live-start-not-captured']],
    ['unclean', 'incomplete', 'connection-switched', 'unclean', 'incomplete', ['connection-switched']],
    ['unclean', 'incomplete', 'unrecognized-old-reason', 'unclean', 'in-progress', []],
  ]) {
    const value = normalizeArchiveSessionState({ sessionId: 'kept', status, quality, qualityReason });
    assert.equal(value.sessionId, 'kept');
    assert.equal(value.status, wantStatus);
    assert.equal(value.recordingStatus, 'stopped');
    assert.equal(value.quality, wantQuality, qualityReason);
    assert.equal(value.qualityReason, qualityReason);
    assert.deepEqual(value.qualityReasons, reasons);
  }
});

test('新字段显式优先，原因集合不被旧停止原因覆盖', async () => {
  const { normalizeArchiveSessionState, isArchiveSessionRecording } = await stateModule();
  const input = { status: 'active', quality: 'incomplete', qualityReason: 'previous-runtime',
    recordingStatus: 'reconnecting', stopReason: null, qualityReasons: ['live-start-not-captured', 'connection-error'] };
  assert.deepEqual(normalizeArchiveSessionState(input), input);
  assert.deepEqual(normalizeArchiveSessionState(normalizeArchiveSessionState(input)), input);
  for (const [recordingStatus, expected] of [['recording', true], ['reconnecting', true], ['stopped', false], [undefined, false]]) {
    assert.equal(isArchiveSessionRecording({ recordingStatus }), expected);
  }
  assert.equal(isArchiveSessionRecording({ status: 'active' }), false);
});

test('实时构造及持久化输入透传独立记录状态', async () => {
  const { createLiveArchiveSession, restoreLiveArchiveSession, toArchiveSessionInput } = await import('../src/stores/liveSession.ts');
  const live = createLiveArchiveSession({ roomId: 1, ownerId: 'owner', now: 1000 });
  assert.equal(live.recordingStatus, 'recording');
  assert.equal(toArchiveSessionInput(live, 1001).recordingStatus, 'recording');
  const restored = restoreLiveArchiveSession({ ...toArchiveSessionInput(live, 1001), status: 'unclean', recordingStatus: 'stopped' }, 1002);
  assert.equal(toArchiveSessionInput(restored, 1003).recordingStatus, 'recording');
});

for (const [name, quality, qualityReason, sourceLiveStartedAt, expectedQuality, expectedReasons] of [
  ['晚连接与进程遗留', 'incomplete', 'previous-runtime', 990000, 'incomplete', ['live-start-not-captured']],
  ['晚连接与其他缺口', 'incomplete', 'connection-switched', 990000, 'incomplete', ['live-start-not-captured', 'connection-switched']],
  ['旧完整结论被明确晚连接证据更正', 'complete', null, 990000, 'incomplete', ['live-start-not-captured']],
  ['旧完整结论在容差边界保留', 'complete', null, 995000, 'complete', []],
  ['超过容差一毫秒证明晚连接', 'complete', null, 994999, 'incomplete', ['live-start-not-captured']],
  ['旧完整结论无时间证据保留', 'complete', null, null, 'complete', []],
]) {
  test(`旧状态时间证据：${name}`, async () => {
    const { normalizeArchiveSessionState } = await stateModule();
    const state = normalizeArchiveSessionState({ status: 'ended', quality, qualityReason,
      startedAt: 1000000, sourceLiveStartedAt });
    assert.equal(state.quality, expectedQuality);
    assert.deepEqual(state.qualityReasons, expectedReasons);
    assert.equal(state.qualityReason, qualityReason);
    assert.equal(state.recordingStatus, 'stopped');
  });
}

test('新模型的显式原因集合不重新推断历史时间', async () => {
  const { normalizeArchiveSessionState } = await stateModule();
  const input = { status: 'ended', quality: 'complete', recordingStatus: 'stopped',
    qualityReasons: [], stopReason: null, startedAt: 1000000, sourceLiveStartedAt: 990000 };
  assert.deepEqual(normalizeArchiveSessionState(input), input);
});
