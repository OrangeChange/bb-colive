import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCloudRecoverySelection,
  createCloudRecoverySelectionDraft,
} from '../src/cloudSync/cloudRecoverySelection.ts';

test('恢复选择默认覆盖全部内容', () => {
  assert.deepEqual(buildCloudRecoverySelection(createCloudRecoverySelectionDraft()), {
    selection: { scope: 'all', include_danmaku: true, include_interactions: true },
    error: null,
  });
});

test('选择场次至少包含一场并去重', () => {
  const draft = { ...createCloudRecoverySelectionDraft(), scope: 'sessions', sessionIds: [] };
  assert.equal(buildCloudRecoverySelection(draft).error, '至少选择一场直播');
  assert.deepEqual(buildCloudRecoverySelection({ ...draft, sessionIds: ['a', 'a', 'b'] }).selection, {
    scope: 'sessions', session_ids: ['a', 'b'], include_danmaku: true, include_interactions: true,
  });
});

test('指定时间要求完整且顺序正确', () => {
  const draft = { ...createCloudRecoverySelectionDraft(), scope: 'time' };
  assert.equal(buildCloudRecoverySelection(draft).error, '请选择完整的开始和结束时间');
  assert.equal(buildCloudRecoverySelection({
    ...draft, startedAt: '2026-10-20T12:00', endedAt: '2026-10-20T11:00',
  }).error, '结束时间必须晚于开始时间');
  assert.deepEqual(buildCloudRecoverySelection({
    ...draft,
    startedAt: '2026-10-20T10:00',
    endedAt: '2026-10-20T12:00',
    includeDanmaku: false,
    includeInteractions: false,
  }).selection, {
    scope: 'time',
    started_at: new Date('2026-10-20T10:00').toISOString(),
    ended_at: new Date('2026-10-20T12:00').toISOString(),
    include_danmaku: false,
    include_interactions: false,
  });
});
