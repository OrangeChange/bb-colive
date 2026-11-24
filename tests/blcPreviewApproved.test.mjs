import test from 'node:test';
import assert from 'node:assert/strict';
import {createBlivechatFixedPreviewRecords,prepareBlivechatPreviewRecords} from '../src/compat/blivechat/previewRecords.mjs';
import {projectBlivechatEvent} from '../src/compat/blivechat/projection.ts';
import {projectOpenLiveEvent} from '../src/compat/openlive/projection.ts';
import {compatibleEventScopes,isCompatibleThemeEventVisible} from '../src/themes/compatibleEventVisibility.ts';
const values=record=>record.payload??record.data;
for(const [mode,count,designCount] of [['blivechat',27,31],['blivechat-open',28,33]]){
 test(mode+'静态和点选使用审核清单，默认头像且没有盲盒',()=>{
  const records=createBlivechatFixedPreviewRecords(mode),design=createBlivechatFixedPreviewRecords(mode,'design');
  assert.equal(records.length,count);assert.equal(design.length,designCount);
  assert(records.every(record=>values(record).avatarUrl==='/media/noface.gif'&&!values(record).blindGiftName));
  assert(design.some(record=>values(record).authorName==='长条表情用户'));
  assert(records.some(record=>values(record).authorType===3));
  if(mode==='blivechat-open')assert.equal(values(records.find(record=>record.method==='onAddLike')).authorName,'只熊KUMA');
 });
 test(mode+'盲盒按对应兼容模式的礼物规则处理',()=>{
  const event={id:'blind',roomId:1,ts:1,msgType:1,user:{uid:'u',uname:'用户',guardLevel:0},gift:{id:1,name:'礼物',count:1,price:5000,total:15000,totalRmb:15,coinType:'gold',blindGiftName:'盲盒',blindPriceRmb:15,blindHitPriceRmb:5}};
  const projection=mode==='blivechat'?projectBlivechatEvent:projectOpenLiveEvent;
  const projected=projection(event,{roomId:1,generation:1},1,1);
  if(mode==='blivechat')assert.equal(projected,null);
  else {assert.equal(projected.payload.giftName,'礼物');assert.equal(projected.payload.num,1);assert.equal(projected.payload.blindGiftName,undefined);}
  assert.equal(isCompatibleThemeEventVisible(mode,{},event),mode==='blivechat-open');
  assert(!compatibleEventScopes(mode).find(scope=>scope.id==='gift').children.some(child=>child.id==='blind'));
  assert.equal(prepareBlivechatPreviewRecords([{method:'onAddGift',payload:{id:'blind',blindGiftName:'盲盒'}}]).length,0);
 });
}
import {nextSourcePreviewRecord,sourcePreviewCandidates} from '../src/preview/sourcePreviewGeneration.ts';
import {DEFAULT_STYLE_PREVIEW_POLICY} from '../src/preview/stylePreviewPolicy.ts';
test('BLC动态保留审核素材，跨事件重复不超过三条，礼物数量和金额一致',()=>{
 const candidates=sourcePreviewCandidates('blivechat',{policy:DEFAULT_STYLE_PREVIEW_POLICY,target:'obs',displayAll:true});
 const sample=candidates.find(r=>r.method==='onAddGift'&&r.payload.totalCoin>0),other=candidates.find(r=>r.method==='onAddSuperChat');
 const repetitions=[];const context={repetitions,random:()=>0,session:'checked'};
 const first=nextSourcePreviewRecord({...context,candidates:[sample],now:()=>1000,sequence:1});
 assert.equal(first.payload.authorName,sample.payload.authorName);assert.equal(first.payload.num,sample.payload.num);
 nextSourcePreviewRecord({...context,candidates:[other],now:()=>1500,sequence:2});
 for(let i=3;i<=4;i++){
  const record=nextSourcePreviewRecord({...context,candidates:[sample],now:()=>i*1000,sequence:i});
  assert.equal(record.payload.num,1);assert.equal(record.payload.totalCoin,sample.payload.totalCoin/sample.payload.num);
 }
 assert.equal(nextSourcePreviewRecord({...context,candidates:[sample],now:()=>5000,sequence:5}),null);
 assert.equal(repetitions[0].count,3);
});

test('单独点赞预览可持续生成，并从完整素材用户中换名',()=>{
 const candidates=sourcePreviewCandidates('blivechat-open',{policy:DEFAULT_STYLE_PREVIEW_POLICY,target:'obs',displayAll:true}).filter(r=>r.method==='onAddLike');
 const repetitions=[];
 const first=nextSourcePreviewRecord({candidates,repetitions,random:()=>0,now:()=>1000,sequence:1,session:'likes'});
 const second=nextSourcePreviewRecord({candidates,repetitions,random:()=>.99,now:()=>10001,sequence:2,session:'likes'});
 assert(first&&second);assert.notEqual(first.payload.authorName,second.payload.authorName);
 assert.equal(first.payload.avatarUrl,'/media/noface.gif');assert.equal(second.payload.avatarUrl,'/media/noface.gif');
});
