import test from 'node:test';
import assert from 'node:assert/strict';
import { readRecoverySessionPages } from '../src/cloudSync/recoverySessionPages.ts';

test('分页完成前不返回，后续页失败保留已读取项目供重试', async () => {
  const seen=[];
  await assert.rejects(readRecoverySessionPages(async cursor => {
    if(cursor) throw Error('offline');
    return {items:[{session_id:'a'}],hasMore:true,nextCursor:'next'};
  }, page=>seen.push(page)), /offline/);
  assert.equal(seen[0].items[0].session_id,'a');
  const result=await readRecoverySessionPages(async cursor=>({items:[{session_id:cursor?'b':'a'}],hasMore:!cursor,nextCursor:cursor?null:'next'}));
  assert.deepEqual(result.map(item=>item.session_id),['a','b']);
});
