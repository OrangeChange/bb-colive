import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
let vite, completeGuardAvatar;
test.before(async()=>{
  vite=await createServer({configFile:false,esbuild:{jsx:"automatic"},cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-guardAvatar.test.mjs",optimizeDeps:{noDiscovery:true,include:[]},root:fileURLToPath(new URL('..',import.meta.url)),server:{watch:null,middlewareMode:true},logLevel:'silent'});
  ({completeGuardAvatar}=await vite.ssrLoadModule('/src/protocol/guardAvatar.ts'));
});
test.after(async()=>{await vite?.close();});
test('大航海头像缺失时补取，已有头像不请求，失败保留事件',async()=>{
  const ctx={roomId:1,anchorUid:'9'};
  const ev={user:{uid:'123',uname:'用户'}};
  const result=await completeGuardAvatar(ev,ctx,async()=>({face:'https://example.com/a.png'}));
  assert.equal(result.user.avatar,'https://example.com/a.png');
  await completeGuardAvatar(result,ctx,async()=>{throw new Error('不得请求');});
  assert.equal((await completeGuardAvatar({user:{uid:'456'}},ctx,async()=>{throw new Error('请求失败');})).user.avatar,undefined);
});
test('并行购买复用请求，等待中收到的头像优先于资料接口',async()=>{
  const ctx={roomId:1,anchorUid:'9'}; let resolve, calls=0;
  const fetch=()=>{calls++;return new Promise(r=>resolve=r);};
  const a=completeGuardAvatar({user:{uid:'123'}},ctx,fetch);
  const b=completeGuardAvatar({user:{uid:'123'}},ctx,fetch);
  ctx.avatarsByUid.set('123','https://example.com/live.png');
  resolve({face:'https://example.com/old.png'});
  assert.equal((await a).user.avatar,'https://example.com/live.png');
  assert.equal((await b).user.avatar,'https://example.com/live.png');assert.equal(calls,1);
});
