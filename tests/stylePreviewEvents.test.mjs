import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as api from '../src/components/stylePreviewEvents.ts';
import bundle from '../src/preview/nativePreviewSamples.json' with {type:'json'};
import { completePreviewEventMedia } from '../src/preview/previewUserMedia.ts';
import { MsgType } from '../src/protocol/types.ts';
import {PREVIEW_KINDS} from '../scripts/export-native-preview-samples.mjs';

test('动态预览保留独立实录素材，补齐本地媒体并排除控制事件',()=>{
 const events=api.createStylePreviewSimulationEvents('混合流');
 const recorded=bundle.samples.filter(s=>![MsgType.Recall,MsgType.CoverAudit].includes(s.event.msgType));
 for(const sample of recorded){const event=events.find(e=>e.id==='native-preview:'+sample.key);assert(event);const expected=structuredClone(sample.event);completePreviewEventMedia(expected);assert.deepEqual({...event,id:sample.event.id},expected)}
 assert(events.some(e=>e.interactKind==='specialFollow'));assert(events.some(e=>e.interactKind==='mutualFollow'));assert(events.some(e=>e.msgType===MsgType.GuardHonor));
 assert.equal(events[0].msgType,0);assert.equal(events[1].interactKind,'entry');
});
test('点选和静态采用独立集合，动态保留原始素材',()=>{
 const fixed=api.createStylePreviewEvents('混合流'),design=api.createStylePreviewDesignEvents('混合流');
 assert(design.every(e=>e.id.startsWith('native-design:')));
 assert(design.length>fixed.length);
 assert.equal(new Set(design.map(e=>e.id)).size,design.length);
 design[0].text='修改';assert.notEqual(api.createStylePreviewDesignEvents('混合流')[0].text,'修改');
 for(const kind of PREVIEW_KINDS)for(const sample of bundle.samples.filter(s=>s.kind===kind&&![MsgType.Recall,MsgType.CoverAudit].includes(s.event.msgType)))assert(api.createStylePreviewSimulationEvents(kind).some(e=>e.id==='native-preview:'+sample.key));
});

test('信息元素与开奖关联保留实录，缺样明确披露',()=>{
 const events=api.createStylePreviewSimulationEvents('混合流');assert(events.some(e=>e.replyTo));assert(events.some(e=>e.sc?.trans));assert(events.some(e=>e.scDeleted));assert(events.some(e=>e.gift?.blindGiftName));assert(events.some(e=>e.emoticon));assert(events.some(e=>e.emotes));
 for(const type of [4,6]){const start=events.find(e=>e.msgType===type);assert(start);assert(events.some(e=>e.msgType===type+1&&(e.lottery?.id??e.pocket?.lotId)===(start.lottery?.id??start.pocket?.lotId)&&e.roomId===start.roomId))}
 assert.deepEqual(api.NATIVE_PREVIEW_GAPS,bundle.gaps);assert(events.some(e=>e.interactKind==='specialFollow'));assert(events.some(e=>e.interactKind==='mutualFollow'));assert(!events.some(e=>[MsgType.Recall,MsgType.CoverAudit].includes(e.msgType)));
});
test('全部本地图片存在，事件不含外部资源和用户机器路径',()=>{
 for(const r of bundle.resources)assert(fs.statSync(new URL('../public'+r.path,import.meta.url)).size>0);
 const values=JSON.stringify(bundle.samples.map(s=>s.event));assert(!/https?:|AppData|cc_work/.test(values));
});
import * as blcSamples from '../src/compat/blivechat/previewRecords.mjs';

test('两版BLC固定集合保留来源ID、金额与可用身份，不补造缺失变体', async () => {
  const {readFileSync}=await import('node:fs');
  for(const [mode,folder]of[['blivechat','blivechat'],['blivechat-open','openlive']]) {
    const source=JSON.parse(readFileSync(new URL('../src/compat/blivechat/approvedPreviewSamples.json',import.meta.url)))[mode].static;
    const data=record=>record.payload??record.data;
    const records=blcSamples.createBlivechatFixedPreviewRecords(mode);
    assert(records.length>0&&records.length<60);
    assert.equal(data(records[0]).id,data(source[0]).id);
    assert.equal(new Set(records.map(r=>data(r).id)).size,records.length);
    assert(records.every(r=>!('translation' in data(r))));
    for(const method of ['onAddSuperChat','onAddGift','onAddMember']) {
      const field=method==='onAddSuperChat'?'price':method==='onAddGift'?'giftName':'privilegeType';
      assert.deepEqual(new Set(records.filter(r=>r.method===method).map(r=>data(r)[field])),new Set(source.filter(r=>r.method===method).map(r=>data(r)[field])));
    }
    assert.equal(records.some(r=>Boolean(data(r).blindGiftName)),false);
    records[0][records[0].payload?'payload':'data'].content='修改';
    assert.notEqual(data(blcSamples.createBlivechatFixedPreviewRecords(mode)[0]).content,'修改');
  }
});

test('不存在的详情部件不生成可编辑选择器', async () => {
  const {BLIVECHAT_CAPABILITY}=await import('../src/compat/blivechat/theme.ts');
  const {OPENLIVE_CAPABILITY}=await import('../src/compat/openlive/theme.ts');
  const {compatibleSelectorFor}=await import('../src/themes/compatManagedCss.ts');
  for(const capability of [BLIVECHAT_CAPABILITY,OPENLIVE_CAPABILITY]) {
    assert.equal(compatibleSelectorFor(capability,'superchat|all|detail|modBadge','common'),null);
  }
  assert.equal(compatibleSelectorFor(OPENLIVE_CAPABILITY,'superchat|all|detail|imageAndMessage','common'),null);
});

test('BLC点选按类别与原始呈现变体排列，只重排同一集合',()=>{
 assert.equal(typeof blcSamples.orderBlivechatDesignRecords,'function');
 for(const mode of ['blivechat','blivechat-open']){
  const fixed=blcSamples.createBlivechatFixedPreviewRecords(mode),snapshot=structuredClone(fixed),design=blcSamples.orderBlivechatDesignRecords(fixed);const rank=r=>['onAddText','onAddLike','onAddGift','onAddSuperChat','onAddMember'].indexOf(r.method);
  assert.deepEqual(design.map(rank),design.map(rank).toSorted((a,b)=>a-b));assert.deepEqual(fixed,snapshot);assert.deepEqual(new Set(design.map(r=>(r.payload??r.data).id)),new Set(fixed.map(r=>(r.payload??r.data).id)));for(const r of design)assert.deepEqual(r,fixed.find(x=>(x.payload??x.data).id===(r.payload??r.data).id));
 }
});

test('开放版点选点赞保留实际次数，参与相同的宿主布局',async()=>{
 const {projectSourcePreviewFact}=await import('../src/preview/stylePreviewPolicy.ts');const row=blcSamples.createBlivechatFixedPreviewRecords('blivechat-open').find(r=>r.method==='onAddLike');const event=projectSourcePreviewFact(row,'blivechat-open');assert.equal(event.interactKind,'like');assert.equal(event.likeCount,(row.payload??row.data).likeCount);
});


test('大航海红包在静态、点选和动态候选中保留来源奖励及口令',async()=>{
 const {nativePreviewCandidates}=await import('../src/preview/stylePreviewGenerator.ts');
 for(const events of [api.createStylePreviewEvents('红包/天选'),api.createStylePreviewDesignEvents('红包/天选'),nativePreviewCandidates('红包/天选')]) {
  const event=events.find(e=>e.pocket?.rpType===2);assert(event);
  assert.equal(event.msgType,6);assert.equal(event.pocket.danmu,event.id.startsWith('native-design:')?'老板大气，祝大家好运！':'老板大气，抽到红包就上舰！');
  assert.deepEqual(event.lottery.awards,[{id:0,name:'1折上舰',count:5}]);
  assert.equal(event.lottery.totalPrice,891000);assert.equal(event.lottery.waitTime,600);
 }
});
