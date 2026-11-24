import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
test('实时舰队档位由已有用户事实映射',async()=>{
 const server=await createServer({configFile:false,esbuild:{jsx:"automatic"},cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-laplaceGuardMilestone.test.mjs",optimizeDeps:{noDiscovery:true,include:[]},server:{watch:null,middlewareMode:true},appType:'custom'});
 try{
  const {projectLaplaceEvent}=await server.ssrLoadModule('/src/compat/laplace/projection.ts');
  const {createStylePreviewEvents}=await server.ssrLoadModule('/src/components/stylePreviewEvents.ts');
  const sample=createStylePreviewEvents('弹幕')[0];
  for(const [milestone,expected] of [['standard',1],['thousand',2],['tenThousand',3]]){
   const event={...sample,roomId:24125,user:{...sample.user,guardMilestone:milestone}};
   const result=projectLaplaceEvent(event,{roomId:24125},1,Date.now());
   assert.equal(result.event.medal.resolvedPerkLevel,expected);
  }
 }finally{await server.close();}
});
