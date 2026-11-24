import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreRecoveryCovers } from '../src/cloudSync/recoveryCovers.ts';
const covers=[{resource_id:'a',mime_type:'image/jpeg',availability:'available',result:'success',file_url:'/api/v1/resources/a',discovered_at:'2026-10-20T00:00:00Z'}];
test('封面下载失败可独立重试，成功文件不重复下载',async()=>{
  let calls=0;
  const failed=await restoreRecoveryCovers('s',covers,async()=>{calls++;throw Error('offline');});
  assert.equal(failed[0].localUrl,null);assert(failed[0].downloadError);
  const restored=await restoreRecoveryCovers('s',failed,async()=>{calls++;return 'cloud-cover://s/a.jpg';});
  assert.equal(restored[0].localUrl,'cloud-cover://s/a.jpg');assert.equal(restored[0].downloadError,null);
  const again=await restoreRecoveryCovers('s',restored,async()=>{calls++;throw Error('unexpected');});
  assert.equal(calls,2);assert.equal(again[0].localUrl,'cloud-cover://s/a.jpg');
});
test('源过期保留已下载文件，不重试已过期资源',async()=>{
  const result=await restoreRecoveryCovers('s',[{...covers[0],availability:'expired',localUrl:'cloud-cover://s/a.jpg'}],async()=>{throw Error('should not download');});
  assert.equal(result[0].localUrl,'cloud-cover://s/a.jpg');
});
