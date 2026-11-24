import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRecoveryBatch, createRecoveryProgress } from '../src/cloudSync/cloudRecoveryProgress.ts';

const root = (mode, cut, from = null) => ({ mode, server_id: 'server', room_id: '123', cut: { cut_id: cut }, from_cut: from && { cut_id: from } });

test('首次恢复保存完成 cut，增量只接受紧接的上一 cut', async () => {
  const calls = [], saved = [];
  const sink = { async writeBatch(batch, state) { calls.push(batch.records.map(row => row.source.sequence));
    return { insertedEvents: batch.records.length, state: { ...state, lastSequence: batch.records.at(-1)?.source.sequence ?? state.lastSequence } }; } };
  const first = await applyRecoveryBatch({ root: root('baseline', 'cut-1'), sessions: [], records: [{ source: { sequence: '2' } }] },
    createRecoveryProgress('server', '123'), sink, value => saved.push(structuredClone(value)));
  assert.equal(first.cutId, 'cut-1');
  assert.equal(first.archiveState.lastSequence, '2');
  const second = await applyRecoveryBatch({ root: root('delta', 'cut-2', 'cut-1'), sessions: [], records: [{ source: { sequence: '3' } }] }, first, sink);
  assert.equal(second.cutId, 'cut-2');
  assert.deepEqual(calls, [['2'], ['3']]);
  await assert.rejects(() => applyRecoveryBatch({ root: root('delta', 'cut-3', 'wrong'), sessions: [], records: [] }, second, sink));
  assert.equal(saved.at(-1).cutId, 'cut-1');
});

test('无新增内容更新 cut，不重复调用档案写入', async () => {
  let writes = 0;
  const sink = { async writeBatch() { writes++; throw new Error('不应调用'); } };
  const previous = { ...createRecoveryProgress('server', '123'), cutId: 'cut-1' };
  const next = await applyRecoveryBatch({ root: root('delta', 'cut-2', 'cut-1'), sessions: [], records: [] }, previous, sink);
  assert.equal(next.cutId, 'cut-2');
  assert.equal(writes, 0);
});

test('档案写入失败不推进恢复状态', async () => {
  const previous = createRecoveryProgress('server', '123');
  let saves = 0;
  const sink = { async writeBatch() { throw new Error('write failed'); } };
  await assert.rejects(() => applyRecoveryBatch({ root: root('baseline', 'cut-1'), sessions: [], records: [{ source: { sequence: '1' } }] },
    previous, sink, () => { saves++; }));
  assert.equal(previous.cutId, null);
  assert.equal(saves, 0);
});
