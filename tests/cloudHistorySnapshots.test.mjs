import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { source, envelope } from './helpers/cloudHistory.mjs';
import { createHistoryContext, encodeHistoryContext } from '../src/cloudSync/cloudHistoryContext.ts';
import { applyHistorySnapshots, getHistoryGiftIcon } from '../src/cloudSync/cloudHistorySnapshots.ts';

const snapshot = (id, effectId, extra = {}) => ({ snapshot_id: id, availability: 'available', kind: 'gift_config',
  requested_at: '2026-10-07T00:00:00Z', fetched_at: '2026-10-07T00:00:00Z', result: 'success',
  failure_reason: null, raw_data: { list: [{ id: 1, img_basic: `https://example.test/${id}.png`, effect_id: effectId }] }, ...extra });
const item = (...ids) => envelope('1', { cmd: 'SEND_GIFT' }, { snapshot_ids: ids });

test('仅使用事件关联快照，不使用同页较新配置，不修改输入', () => {
  const ctx = createHistoryContext(source), snapshots = [snapshot('new', 22), snapshot('old', 11)];
  const before = structuredClone(snapshots);
  const evidence = applyHistorySnapshots(ctx, item('old'), snapshots);
  assert.equal(getHistoryGiftIcon(ctx, 1).effectId, 11);
  assert.equal(evidence[0].snapshotId, 'old');
  assert.deepEqual(snapshots, before);
});

test('同 ID 到期复用保留投影，缺失、失败和其他 ID 不借用旧资料', () => {
  const ctx = createHistoryContext(source);
  applyHistorySnapshots(ctx, item('old'), [snapshot('old', 11)]);
  const evidence = applyHistorySnapshots(ctx, item('old'), [{ snapshot_id: 'old', availability: 'expired' }]);
  assert.equal(getHistoryGiftIcon(ctx, 1).effectId, 11);
  assert.equal(evidence[0].availability, 'expired');
  assert.equal(evidence[0].retainedProjection, true);
  for (const [ids, snapshots] of [[['missing'], []], [['other'], [{ snapshot_id: 'other', availability: 'expired' }]],
    [['failed'], [snapshot('failed', 22, { result: 'failed', raw_data: null })]], [[], []]]) {
    applyHistorySnapshots(ctx, item('old'), [snapshot('old', 11)]);
    applyHistorySnapshots(ctx, item(...ids), snapshots);
    assert.equal(getHistoryGiftIcon(ctx, 1), undefined);
  }
});

test('房间快照仅采用匹配房间和精确主播 UID，投影大航海档位', () => {
  const room = snapshot('room', 0, { kind: 'room_info', raw_data: {
    room_info: { room_id: 24125, uid: '9007199254740995' },
    guard_info: { anchor_guard_achieve_level: 1000, count: 1024 } } });
  const ctx = createHistoryContext(source);
  applyHistorySnapshots(ctx, item('room'), [room]);
  assert.equal(ctx.adapter.anchorUid, '9007199254740995');
  assert.equal(ctx.adapter.roomGuardProfile.milestone, 'thousand');
  for (const data of [{ room_info: { room_id: 1, uid: '42' } },
    { room_info: { room_id: 24125, uid: 9007199254740993 } }]) {
    applyHistorySnapshots(ctx, item('room'), [{ ...room, raw_data: data }]);
    assert.equal(ctx.adapter.anchorUid, '');
  }
});

test('冲突关联快照被拒绝，未知类型保留依据，特效配置不保存完整数据', () => {
  assert.throws(() => applyHistorySnapshots(createHistoryContext(source), item('old'), [snapshot('old', 11), snapshot('old', 22)]));
  assert.throws(() => applyHistorySnapshots(createHistoryContext(source), item('old', 'new'), [snapshot('old', 11), snapshot('new', 22)]));
  const ctx = createHistoryContext(source);
  const evidence = applyHistorySnapshots(ctx, item('effect', 'unknown'), [snapshot('effect', 11, {
    kind: 'gift_effect_config', raw_data: { privateSyntheticField: 'not retained' } }), snapshot('unknown', 11, { kind: 'future' })]);
  assert.equal(evidence[1].kind, 'future');
  assert.equal(ctx.projections.gift_effect_config.snapshotId, 'effect');
  assert.equal(encodeHistoryContext(ctx).includes('privateSyntheticField'), false);
});

test('历史礼物查询与现场缓存隔离', async () => {
  const server = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-cloudHistorySnapshots.test.mjs",optimizeDeps:{noDiscovery:true,include:[]}, root: fileURLToPath(new URL('../', import.meta.url)), logLevel: 'silent',
    configFile: false, server: { middlewareMode: true, watch: null }, plugins: [{ name: 'history-gift-api-fixture', enforce: 'pre',
      resolveId(id, importer) {
        if ((id === './api' || id === './api.ts') && importer?.replaceAll('\\', '/').endsWith('/src/protocol/gifts.ts')) return '\0history-gift-api';
      },
      load(id) { if (id === '\0history-gift-api') return `export async function getGiftConfig(){return {list:[{id:1,img_basic:'https://example.test/current.png',effect_id:99}]}}`; },
    }] });
  try {
    const { loadGiftConfig } = await server.ssrLoadModule('/src/protocol/gifts.ts');
    const { adapt } = await server.ssrLoadModule('/src/protocol/adapter.ts');
    await loadGiftConfig(24125);
    const ctx = createHistoryContext(source);
    applyHistorySnapshots(ctx, item('old'), [snapshot('old', 11)]);
    const raw = { cmd: 'SEND_GIFT', data: { giftId: 1, giftName: '合成礼物', num: 1, uid: '123', price: 1000, total_coin: 1000, coin_type: 'gold' } };
    assert.equal(adapt(raw, { roomId: 24125, anchorUid: '' }).gift.effectId, 99);
    const historical = adapt(raw, ctx.adapter, { now: () => 1, createId: () => 'synthetic', getGiftIcon: id => getHistoryGiftIcon(ctx, id) });
    assert.equal(historical.gift.effectId, 11);
    applyHistorySnapshots(ctx, item(), []);
    assert.equal(adapt(raw, ctx.adapter, { now: () => 1, createId: () => 'synthetic', getGiftIcon: id => getHistoryGiftIcon(ctx, id) }).gift.effectId, undefined);
  } finally { await server.close(); }
});
