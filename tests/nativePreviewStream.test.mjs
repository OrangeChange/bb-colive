import test from 'node:test';import assert from 'node:assert/strict';
import {appendNativePreviewEvent} from '../src/preview/nativePreviewStream.ts';
import {nextNativePreviewEvent,nativePreviewCandidates} from '../src/preview/stylePreviewGenerator.ts';
import {DEFAULT_STYLE_PREVIEW_POLICY as defaults,selectStylePreviewEvents} from '../src/preview/stylePreviewPolicy.ts';
const options={target:'obs',mergeSameDanmu:true,sameDanmuWindowSeconds:8,expiry:{enabled:false,seconds:10}};
const chat=(id,ts=1000,text='晚安')=>({id,ts,roomId:1,msgType:0,text,user:{uid:id,uname:id,guardLevel:0}});
const gift=(id,ts=1000,count=1)=>({id,ts,roomId:1,msgType:1,user:{uid:'u',uname:'用户',guardLevel:0},comboId:'combo',gift:{id:1,name:'礼物',count,price:30000,total:30000*count,priceRmb:30,totalRmb:30*count,paymentRmb:30*count,coinType:'gold'}});
test('输出重复弹幕沿用真实规则，保持首条身份、行ID和首次时间',()=>{
 let rows=appendNativePreviewEvent([],chat('a'),options);rows=appendNativePreviewEvent(rows,chat('b',2000),options);rows=appendNativePreviewEvent(rows,chat('c',3000),options);
 assert.equal(rows.length,1);assert.equal(rows[0].id,'a');assert.equal(rows[0].user.uid,'a');assert.equal(rows[0].danmuRepeatCount,3);assert.equal(rows[0].firstOccurredAt,1000);
 assert.equal(appendNativePreviewEvent(rows,chat('d',12000),options).length,2);
 assert.equal(appendNativePreviewEvent(rows,chat('e',4000,'其他正文'),options).length,2);
 for(const extra of [{mergeSameDanmu:false},{target:'live'}])assert.equal(appendNativePreviewEvent(rows,chat('f',4000),{...options,...extra}).length,2);
});
test('礼物原行累加金额，累计摘要校正不重复叠加，盲盒独立',()=>{
 let rows=[];for(let i=1;i<=3;i++)rows=appendNativePreviewEvent(rows,gift('g'+i,i*1000),options);
 assert.equal(rows.length,1);assert.equal(rows[0].id,'g1');assert.equal(rows[0].gift.count,3);assert.equal(rows[0].gift.totalRmb,90);assert.equal(rows[0].gift.paymentRmb,90);
 rows=appendNativePreviewEvent(rows,{...gift('summary',4000,3),isComboUpdate:true},options);assert.equal(rows[0].gift.count,3);assert.equal(rows[0].gift.totalRmb,90);
 const blind={...gift('blind',5000),comboId:'blind-combo',gift:{...gift('blind').gift,blindGiftName:'盲盒',blindPriceRmb:30,blindHitPriceRmb:50}};rows=appendNativePreviewEvent(rows,blind,options);assert.equal(rows.length,2);
});
test('累计金额在合并后跨过门槛，首次寿命不随增长续期，淘汰行不再作为目标',()=>{
 const policy={...defaults,giftThreshold:60,giftThresholdMode:'cumulative'};const opts={target:'obs',mode:'simulation',displayAll:true,now:1000};let rows=appendNativePreviewEvent([],gift('a'),options);assert.equal(selectStylePreviewEvents(rows,policy,opts).events.length,0);
 rows=appendNativePreviewEvent(rows,gift('b',1500),options);assert.equal(selectStylePreviewEvents(rows,policy,{...opts,now:1500}).events.length,1);
 const expired=selectStylePreviewEvents(rows,{...policy,expiry:{enabled:true,seconds:1}},{...opts,now:2001});assert.equal(expired.events.length,0);
 rows=appendNativePreviewEvent(rows,gift('c',2100),options,new Set(['a']));assert(rows.some(e=>e.id==='c'&&e.gift.count===1));
});
test('低概率重复可跨事件，只限弹幕和付费礼物，同组最多三条',()=>{
 for(const kind of ['弹幕','礼物','盲盒']){
  const sample=nativePreviewCandidates(kind==='弹幕'?'弹幕':'礼物').find(e=>kind==='弹幕'?e.msgType===0:kind==='盲盒'?e.gift?.blindGiftName:e.gift&&!e.gift.blindGiftName&&!e.gift.isFree&&e.gift.coinType==='gold');
  const repetitions=[];let rows=[];const context={candidates:[sample],repetitions,random:()=>0,session:kind};
  const first=nextNativePreviewEvent({...context,sequence:1,now:()=>1000});rows=appendNativePreviewEvent(rows,first,options);
  const other={id:'other',ts:1500,roomId:1,msgType:2};rows.push(other);
  assert.equal(nextNativePreviewEvent({...context,events:rows,sequence:2,now:()=>2000,random:()=>.8}),null);
  for(let i=2;i<=3;i++){const e=nextNativePreviewEvent({...context,events:rows,sequence:i,now:()=>i*1000});rows=appendNativePreviewEvent(rows,e,options)}
  assert.equal(repetitions[0].occurrences,3);assert.equal(nextNativePreviewEvent({...context,events:rows,sequence:4,now:()=>4000}),null);
  if(kind==='弹幕')assert.equal(rows[0].danmuRepeatCount,3);
  else if(kind==='礼物')assert.equal(rows[0].gift.count,sample.gift.count+2);
  else assert.equal(rows.filter(e=>e.gift).length,3);
 }
 for(const type of [2,3,8]){const repetitions=[];const sample={id:'sample',ts:1,roomId:1,msgType:type};for(let i=1;i<=4;i++){const event=nextNativePreviewEvent({candidates:[sample],repetitions,random:()=>0,now:()=>i*1000,sequence:i,session:'other'});assert.equal(Boolean(event),i===1)}assert.equal(repetitions.length,1)}
});

test('淘汰后的累计连击摘要不会复活原行，盲盒结果各自保留',()=>{
 const expiredOptions={...options,expiry:{enabled:true,seconds:1}};
 const initial=appendNativePreviewEvent([],gift('first'),expiredOptions);
 const rows=appendNativePreviewEvent(initial,{...gift('summary',3000,3),isComboUpdate:true},expiredOptions);
 assert.equal(rows.length,1);assert.equal(rows[0].gift.count,1);
 const blind=(id,ts)=>({...gift(id,ts),comboId:'blind',gift:{...gift(id).gift,blindGiftName:'盲盒',blindPriceRmb:30}});
 const blindRows=appendNativePreviewEvent(appendNativePreviewEvent([],blind('one',1000),options),blind('two',1500),options);
 assert.equal(blindRows.length,2);assert.equal(blindRows[0].gift.count,1);assert.equal(blindRows[1].gift.count,1);
});

test('动态素材沿用最新静态选择，保留用户、正文和初始数量',async()=>{
 const {createStylePreviewEvents}=await import('../src/components/stylePreviewEvents.ts');
 const selected=createStylePreviewEvents('混合流').filter(e=>!e.danmuDeleted&&!e.scDeleted);
 const candidates=nativePreviewCandidates('混合流');
 assert.deepEqual(candidates.map(e=>e.id).sort(),selected.map(e=>e.id).sort());
 for(const sample of candidates.filter(e=>e.msgType===0||e.gift)){
  const generated=nextNativePreviewEvent({candidates:[sample],random:()=>0,now:()=>1000,sequence:1,session:'selected'});
  assert.deepEqual(generated.user,sample.user);assert.equal(generated.text,sample.text);
  if(sample.gift)assert.equal(generated.gift.count,sample.gift.count);
 }
});
