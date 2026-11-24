import test from 'node:test';
import assert from 'node:assert/strict';
import { source } from './helpers/cloudHistory.mjs';
import { createHistoryContext, cloneHistoryContext, advanceHistoryConnection,
  encodeHistoryContext, decodeHistoryContext } from '../src/cloudSync/cloudHistoryContext.ts';

test('历史上下文按键确定性编码，保留精确进度和 UID', () => {
  const a = createHistoryContext(source, '9007199254740993');
  a.adapter.avatarsByUid.set('9007199254740995', 'https://example.test/old.png');
  a.adapter.avatarsByUid.set('1', 'https://example.test/new.png');
  a.adapter.wealthByUid.set('3', { wealthLevel: 7, wealthIconKey: '7', wealthIconUrl: 'https://example.test/wealth.png' });
  a.adapter.guardIconUrlsByUid.set('3', 'https://example.test/guard.png');
  a.adapter.wealthIconUrlsByLevel.set(7, 'https://example.test/7.png');
  a.projections.gift_config = { snapshotId: 'gift-old', kind: 'gift_config', fetchedAt: '2026-10-07T00:00:00Z',
    gifts: new Map([[2, { icon: 'https://example.test/2.png', effectId: 11 }], [1, { gif: 'https://example.test/1.gif' }]]) };
  const encoded = encodeHistoryContext(a);
  const restored = decodeHistoryContext(encoded, source);
  assert.equal(encodeHistoryContext(restored), encoded);
  assert.equal(restored.lastSequence, '9007199254740993');
  assert.equal(restored.adapter.avatarsByUid.get('9007199254740995'), 'https://example.test/old.png');
  assert.equal(restored.adapter.wealthByUid.get('3').wealthLevel, 7);
  assert.equal(restored.projections.gift_config.gifts.get(2).effectId, 11);
  const b = cloneHistoryContext(a);
  b.adapter.avatarsByUid = new Map([...a.adapter.avatarsByUid].reverse());
  b.projections.gift_config.gifts = new Map([...a.projections.gift_config.gifts].reverse());
  assert.equal(encodeHistoryContext(b), encoded);
  a.extra = { raw: 'not persisted' };
  assert.equal(encodeHistoryContext(a), encoded);
});

test('候选上下文独立复制资料和礼物条目', () => {
  const ctx = createHistoryContext(source);
  ctx.adapter.avatarsByUid.set('1', 'old');
  ctx.adapter.wealthByUid.set('1', { wealthLevel: 7 });
  ctx.adapter.roomGuardProfile = { milestone: 'standard', iconSet: 'base', source: 'room-info' };
  ctx.projections.gift_config = { snapshotId: 'gift', kind: 'gift_config', fetchedAt: '2026-10-07T00:00:00Z', gifts: new Map([[1, { effectId: 11 }]]) };
  const copy = cloneHistoryContext(ctx);
  copy.adapter.avatarsByUid.set('2', 'new');
  copy.adapter.wealthByUid.get('1').wealthLevel = 8;
  copy.adapter.roomGuardProfile.milestone = 'thousand';
  copy.projections.gift_config.gifts.get(1).effectId = 22;
  assert.equal(ctx.adapter.avatarsByUid.has('2'), false);
  assert.equal(ctx.adapter.wealthByUid.get('1').wealthLevel, 7);
  assert.equal(ctx.adapter.roomGuardProfile.milestone, 'standard');
  assert.equal(ctx.projections.gift_config.gifts.get(1).effectId, 11);
});

test('连接或账号变化清空观测资料，同边界保留资料且不修改输入', () => {
  const ctx = advanceHistoryConnection(createHistoryContext(source, '15'), 'old', '9');
  ctx.adapter.anchorUid = '42';
  ctx.adapter.avatarsByUid.set('1', 'old');
  ctx.projections.room_info = { snapshotId: 'room', kind: 'room_info', fetchedAt: '2026-10-07T00:00:00Z', anchorUid: '42' };
  assert.equal(advanceHistoryConnection(ctx, 'old', '9').adapter.avatarsByUid.size, 1);
  for (const next of [advanceHistoryConnection(ctx, 'new', '9'), advanceHistoryConnection(ctx, 'old', '10')]) {
    assert.equal(next.adapter.avatarsByUid.size, 0);
    assert.equal(next.adapter.anchorUid, '');
    assert.deepEqual(next.projections, {});
    assert.equal(next.lastSequence, '15');
    assert.equal(next.adapter.keepRaw, false);
  }
  assert.equal(ctx.adapter.avatarsByUid.size, 1);
});

test('拒绝不匹配版本、来源、损坏资料与非规范进度', () => {
  const valid = JSON.parse(encodeHistoryContext(createHistoryContext(source)));
  for (const mutate of [v => v.formatVersion = 2, v => v.parserVersion = 'other',
    v => v.source.serverId = 'other', v => v.lastSequence = '01',
    v => v.adapter.avatarsByUid = [['1', 42]], v => v.adapter.wealthByUid = [['1', { wealthLevel: '7' }]],
    v => v.adapter.wealthIconUrlsByLevel = [['7', 'url']], v => v.adapter.keepRaw = true]) {
    const value = structuredClone(valid); mutate(value);
    assert.throws(() => decodeHistoryContext(JSON.stringify(value), source));
  }
  assert.throws(() => createHistoryContext({ ...source, roomId: '9007199254740993' }));
  assert.throws(() => createHistoryContext(source, '9223372036854775808'));
  assert.throws(() => decodeHistoryContext('{', source));
});

test('上下文保留既有房间档位的全部来源', () => {
  for (const profileSource of ['room-info', 'guard-ranking', 'achievement-event', 'unknown']) {
    const ctx = createHistoryContext(source);
    ctx.adapter.roomGuardProfile = { milestone: 'standard', iconSet: 'base', source: profileSource };
    const restored = decodeHistoryContext(encodeHistoryContext(ctx), source);
    assert.equal(restored.adapter.roomGuardProfile.source, profileSource);
  }
});
