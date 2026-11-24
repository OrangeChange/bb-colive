import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import bundle from '../src/preview/nativeStaticSamples.json' with {type:'json'};
import {createStylePreviewEvents} from '../src/components/stylePreviewEvents.ts';
import {nativePreviewCandidates,nextNativePreviewEvent} from '../src/preview/stylePreviewGenerator.ts';

test('已确认的62条静态样例保留选定身份、正文和顺序',()=>{
 assert.equal(bundle.samples.length,62);
 const expected={'slot-1':['T060','诸仙immortal'],'slot-2':['D014','傾--城'],'slot-4':['H015','猫耳小月子'],'slot-6':['B004','迟年春'],'slot-11':['NQ086','吾欲随风行'],'slot-32':['P014','亚妮艾丝克劳蒂尔'],'slot-34':['R215','不約線下的貓車的喵車'],'slot-35':['S006','鲑鱼-Official'],'slot-43':['A019','薩達哈魯']};
 for(const[key,[id,user]]of Object.entries(expected)){const sample=bundle.samples.find(s=>s.key===key);assert.equal(sample.selectionId,id);assert.equal(sample.event.user.uname,user)}
 const events=createStylePreviewEvents('混合流');
 assert.equal(events.find(e=>e.id==='native-static:slot-11').replyTo.uname,'萨摩椰奶茶冻');
 for(const key of ['slot-7','slot-21'])assert(!events.find(e=>e.id==='native-static:'+key).user.currentRank);
 assert.equal(events.find(e=>e.id==='native-static:slot-21').danmuRepeatCount,3);
 assert.equal(events.find(e=>e.id==='native-static:slot-24').gift.name,'糖霜纸鸢');
 for(const id of ['U003','E005','C198','RESTORE-neuro'])assert(bundle.samples.some(s=>s.selectionId===id));
});

test('静态与动态使用相同的新素材，平台译文可进入动态生成',()=>{
 const candidates=nativePreviewCandidates('混合流');
 const translated=candidates.find(e=>e.user?.uname==='鲑鱼-Official');assert(translated?.sc?.trans);
 for(const name of ['猫耳小月子','吾欲随风行','傾--城'])assert(candidates.some(e=>e.user?.uname===name));
 const event=nextNativePreviewEvent({candidates:[translated],random:()=>0,now:()=>1000,sequence:1,session:'approved'});
 assert.deepEqual(event.sc,translated.sc);assert.deepEqual(event.user,translated.user);
});

test('新样例的全部媒体均可离线读取',()=>{
 const visit=value=>{if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')Object.values(value).forEach(visit);else if(typeof value==='string'){assert(!/^https?:\/\//.test(value));if(value.startsWith('/media/'))assert(fs.statSync(new URL('../public'+value,import.meta.url)).size>0)}};
 bundle.samples.forEach(s=>visit(s.event));
});

test('连击摘要缺单价时，动态增长按真实总价与数量计算',()=>{
 const sample=createStylePreviewEvents('礼物').find(e=>e.user?.uname==='--shuo--');
 const repetitions=[];const context={candidates:[sample],repetitions,random:()=>0,session:'combo'};
 nextNativePreviewEvent({...context,now:()=>1000,sequence:1});
 const next=nextNativePreviewEvent({...context,now:()=>2000,sequence:2});
 assert.equal(next.gift.count,1);assert.equal(next.gift.totalRmb,0.1);assert.equal(next.gift.total,100);
});
