import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
const vite=await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-nativeGuardPurchaseSemantics.test.mjs",optimizeDeps:{noDiscovery:true,include:[]},configFile:false,server:{middlewareMode:true,watch:null},logLevel:'silent'});
const {publicGuardPurchaseLevel,publicIdentityClasses,publicGuardPurchaseClass}=await vite.ssrLoadModule('/src/events/publicEventStyle.ts');
test.after(async()=>await vite.close());
import { MsgType } from '../src/protocol/types.ts';

test('购买等级独立于用户身份，并使用公开编号', () => {
  for (const [level, expected] of [[1,3],[2,2],[3,1]]) {
    const event={msgType:MsgType.GuardBuy,guard:{level},user:{guardLevel:2}};
    assert.equal(publicGuardPurchaseLevel(event),expected);
    assert.equal(publicGuardPurchaseClass(event),`guard-purchase-level-${expected}`);
    assert.equal(publicIdentityClasses(event.user),'guard-level-2');
  }
  assert.equal(publicGuardPurchaseLevel({msgType:MsgType.GuardBuy,user:{guardLevel:3}}),undefined);
  assert.equal(publicGuardPurchaseLevel({msgType:MsgType.Gift,guard:{level:1}}),undefined);
});
