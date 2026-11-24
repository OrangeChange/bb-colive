import test from 'node:test';
import assert from 'node:assert/strict';
const api=await import('../scripts/export-native-preview-samples.mjs').catch(()=>({}));
test('本地素材按完整事件选择并保持开奖关联，不以改写字段补覆盖',()=>{
 assert.equal(typeof api.selectNativePreviewSamples,'function');
 const input=[{source:{eventKey:'a',sessionId:'s'},event:{id:'a',msgType:0,roomId:1,ts:1,interactKind:'entry',likeCount:3,user:{uid:'1',uname:'原名',avatar:'/media/noface.gif',guardLevel:0},text:'真实正文'}},{source:{eventKey:'b',sessionId:'s'},event:{id:'b',msgType:4,roomId:1,ts:2,lottery:{id:10,awardName:'原奖励',awardNum:1}}},{source:{eventKey:'c',sessionId:'s'},event:{id:'c',msgType:5,roomId:1,ts:3,lottery:{id:10,awardName:'原奖励',awardNum:1,winners:[{uid:'2',uname:'中奖者'}]}}}];
 const output=api.selectNativePreviewSamples(input);
 assert.equal(output.samples.length,3);for(const sample of output.samples)assert.deepEqual(sample.event,input.find(row=>row.source.eventKey===sample.source.eventKey).event);
 assert(output.gaps.includes('chat:small-emote'));assert.equal(output.samples.filter(x=>[4,5].includes(x.event.msgType)).length,2);
});

test('独立图片资源不共用被并行覆盖的文件路径',async()=>{
 const fs=await import('node:fs/promises');const bundle=JSON.parse(await fs.readFile(new URL('../src/preview/nativePreviewSamples.json',import.meta.url),'utf8'));
 const paths=bundle.resources.filter(r=>r.path.startsWith('/media/native-preview/')).map(r=>r.path);
 assert.equal(new Set(paths).size,paths.length);
});
