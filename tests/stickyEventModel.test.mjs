import test from 'node:test';
import assert from 'node:assert/strict';
import { MsgType } from '../src/protocol/types.ts';
import { createGiftWindowSession, openGiftWindowSession, closeGiftWindowSession, appendGiftWindowEvent } from '../src/windows/giftWindowModel.ts';
import { createEventDelivery } from '../src/runtime/eventDelivery.ts';
import { collectFeatureSnapshots } from '../src/diagnostics/featureDiagnostics.ts';
let model;
try { model = await import('../src/windows/stickyEventModel.ts'); } catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
const now = 1700000000000;
const settings = { enabled: true, position: 'top', giftThreshold: 30, maxCount: 10, sort: 'amount' };
const gift = (id, payment = 30, ts = now, extra = {}) => ({ id, roomId: 1, ts, msgType: MsgType.Gift, gift: { id: 1, name: '礼物', count: 1, paymentRmb: payment, totalRmb: payment, priceRmb: payment, ...extra } });
const api = () => { assert.ok(model, '固定候选模型应已实现'); return model; };
const view = (events, options = settings, at = now) => api().selectStickyEvents(events, options, at);
const update = (events, event, at = now, options = settings) => api().updateStickyEvents(events, event, options, at);

test('29.99不合格、30合格；免费礼物不取得资格，已知价值无需支付字段', () => {
  assert.deepEqual(view([gift('low',29.99),gift('edge'),gift('free',100,now,{isFree:true}),gift('unknown',undefined,now,{paymentRmb:undefined,totalRmb:999})]).map(x=>x.event.id),['unknown','edge']);
});
test('礼物价值统一决定门槛、寿命、展示和金额排序', () => {
  const blind=gift('blind',30,now,{blindGiftName:'盲盒',blindPriceRmb:30,blindHitPriceRmb:100,totalRmb:100});
  const cards=view([gift('normal',50),blind]);
  assert.deepEqual(cards.map(x=>[x.event.id,x.amount,x.expiresAt]),[['blind',100,now+300000],['normal',50,now+120000]]);
  assert.equal(view([blind],settings,now+300000).length,0);
});
test('天选优先占用名额，其他事件金额降序同额按时间', () => {
  const lottery={id:'lot',roomId:1,ts:now,msgType:MsgType.AnchorLotStart,lottery:{id:8,maxTime:60}};
  assert.deepEqual(view([gift('old',50,now-1),gift('new',50),gift('big',100),lottery],{...settings,maxCount:3}).map(x=>x.event.id),['lot','big','new']);
  assert.deepEqual(view([lottery,gift('big',100)]).map(x=>x.event.id),['lot','big']);
  assert.deepEqual(view([gift('old',100,now-1),gift('new')],{...settings,sort:'time'}).map(x=>x.event.id),['new','old']);
});
test('全部金额档位按左闭右开精确计时', () => {
  for(const [amount,seconds] of [[0.5,4],[1,6],[5,10],[10,20],[15,30],[30,60],[50,120],[100,300],[500,1800],[1000,3600],[2000,7200],[5000,10800],[10000,14400],[20000,18000]]) {
    assert.equal(view([gift('g',amount)],{...settings,giftThreshold:0})[0].expiresAt,now+seconds*1000);
  }
});

test('同金额同时间按首次接收倒序，先排序再截取上限',()=>{
  let events=[];
  for (const id of ['old','middle','new']) events=update(events,gift(id,50));
  assert.deepEqual(view(events).map(card=>card.event.id),['new','middle','old']);
  assert.deepEqual(view(events,{...settings,maxCount:2}).map(card=>card.event.id),['new','middle']);
  assert.deepEqual(view(events,{...settings,sort:'time'}).map(card=>card.event.id),['new','middle','old']);
  assert.deepEqual(view([...events,gift('late-old-time',50,now-1000)]).map(card=>card.event.id),['new','middle','old','late-old-time']);
});

test('重复包及连击更新保留首次接收顺序，金额更新后仍按首条时间排同价位',()=>{
  let events=[];
  for(const id of ['old','middle','new']) events=update(events,gift(id,50));
  events=update(events,gift('old',50,now+1000),now+1000);
  assert.deepEqual(view(events,settings,now+1000).map(card=>card.event.id),['new','middle','old']);
  assert.equal(view(events,settings,now+1000)[2].expiresAt,now+120000);
  events=update(events,gift('old',100,now+2000),now+2000);
  assert.deepEqual(view(events,settings,now+2000).map(card=>card.event.id),['old','new','middle']);
  events=update(events,gift('middle',100,now+3000),now+3000);
  assert.deepEqual(view(events,settings,now+3000).map(card=>card.event.id),['middle','old','new']);
});

test('窗口重开快照保留同秒首次顺序，重播快照不把旧卡片移到同价位前方',()=>{
  const projection=api().createStickyProjection();
  projection.configure(settings,now);
  for(const id of ['old','middle','new']) projection.accept(gift(id,50),now);
  projection.accept(gift('old',50,now+1000),now+1000);
  const snapshot=projection.snapshot(now+1000);
  const reopened=snapshot.reduce((events,event)=>update(events,event,now+1000),[]);
  assert.deepEqual(view(reopened,settings,now+1000).map(card=>card.event.id),['new','middle','old']);
  const replayed=snapshot.reduce((events,event)=>update(events,event,now+1000),reopened);
  assert.deepEqual(view(replayed,settings,now+1000).map(card=>card.event.id),['new','middle','old']);
});

test('候选到期清理不改变其余同秒卡片的首次顺序',()=>{
  const projection=api().createStickyProjection();
  projection.configure(settings,now);
  projection.accept(gift('expiring',30,now-59000),now-59000);
  for(const id of ['old','middle','new']) projection.accept(gift(id,50),now);
  const remaining=projection.snapshot(now+2000);
  assert.deepEqual(remaining.map(event=>event.id),['old','middle','new']);
  assert.deepEqual(view(remaining,settings,now+2000).map(card=>card.event.id),['new','middle','old']);
  projection.configure({...settings,sort:'time'},now+2000);
  assert.deepEqual(view(projection.snapshot(now+2000),{...settings,sort:'time'},now+2000).map(card=>card.event.id),['new','middle','old']);
});
test('两种排序均将天选置前，多个天选按时间及首次接收倒序',()=>{
  const lottery=(id,ts=now)=>({id,roomId:1,ts,msgType:MsgType.AnchorLotStart,lottery:{id,maxTime:60}});
  const events=[lottery('old',now-2000),lottery('middle'),lottery('new'),gift('paid',1000,now+1000)];
  for(const sort of ['amount','time']) {
    assert.deepEqual(view(events,{...settings,sort}).map(card=>card.event.id),['new','middle','old','paid']);
    assert.deepEqual(view(events,{...settings,sort,maxCount:2}).map(card=>card.event.id),['new','middle']);
  }
});
test('红包按金额正常排序，同金额新事件在前；时间排序不受金额有无影响',()=>{
  const red=(id,totalPrice,ts=now)=>({id,roomId:1,ts,msgType:MsgType.RedPocketStart,lottery:{id,totalPrice,waitTime:120}});
  const events=[gift('big',100),gift('old-equal',50,now-1000),red('red',50000),gift('small',30),red('unknown',undefined,now+1000)];
  assert.deepEqual(view(events).map(card=>card.event.id),['big','red','old-equal','small','unknown']);
  assert.deepEqual(view(events,{...settings,sort:'time'}).map(card=>card.event.id),['unknown','small','red','big','old-equal']);
});
test('重复包不续期，连击更新原卡片且保留首条时间', () => {
  let events=update([],gift('g'));
  events=update(events,gift('g',30,now+10000),now+10000);
  assert.equal(view(events,settings,now+10000)[0].expiresAt,now+60000);
  events=update(events,gift('g',50,now+20000),now+20000);
  assert.equal(view(events,settings,now+20000)[0].expiresAt,now+120000);
  assert.equal(events.length,1);
});
test('过期后重开不续期；合并行携带首条时间', () => {
  assert.equal(view([gift('g')],settings,now+60000).length,0);
  assert.equal(view([{...gift('g',30,now+59000),firstOccurredAt:now}],settings,now+60000).length,0);
});
for (const [name, msgType, duration] of [['天选',MsgType.AnchorLotStart,'maxTime'],['红包',MsgType.RedPocketStart,'waitTime']]) {
  test(`${name}同房同业务ID相隔10秒的重复开始保持单卡和原结束时间`, () => {
    const first={id:'first',roomId:1,ts:now,msgType,lottery:{id:9,[duration]:120}};
    const second={...first,id:'second',ts:now+10000};
    const events=update(update([],first),second,now+10000);
    assert.equal(events.length,1);
    assert.equal(view(events,settings,now+10000)[0].expiresAt,now+120000);
    assert.equal(view(events,settings,now+120000).length,0);
    assert.equal(second.firstOccurredAt,undefined);
    assert.equal(second.ts,now+10000);
  });
}
test('固定活动身份按类别隔离，缺失业务ID沿用原键',()=>{
  const lot={id:'lot',roomId:1,ts:now,msgType:MsgType.AnchorLotStart,lottery:{id:9,maxTime:120}};
  const red={...lot,id:'red',msgType:MsgType.RedPocketStart,lottery:{id:9,waitTime:120}};
  assert.equal(update(update([],lot),red).length,2);
  for(const extra of [{},{dedupe:'dedupe'},{comboId:'combo'}]) {
    const first={...lot,...extra,lottery:{maxTime:120}};
    const second={...first,ts:now+10000};
    assert.equal(view(update(update([],first),second,now+10000),settings,now+10000)[0].expiresAt,now+120000);
  }
});
test('SC按金额档位计时、撤回移除固定卡片并保留普通删除行', () => {
  const sc={id:'sc',roomId:1,ts:now,msgType:MsgType.SuperChat,sc:{price:30,duration:120,message:'正文'}};
  assert.equal(view([sc])[0].expiresAt,now+60000);
  const deletion={id:'delete',roomId:1,ts:now,msgType:MsgType.ScDeleted,scDeleteIds:['sc']};
  assert.equal(view(update([sc],deletion)).length,0);
  const rows=api().applyScDeletion([sc],deletion);
  assert.equal(rows.length,1);assert.equal(rows[0].scDeleted,true);
});
test('付费卡片从首次入队计时，天选和红包仍按源事件截止时间',()=>{
  const projection=api().createStickyProjection();
  projection.configure(settings,now+30_000);
  const delayedGift=projection.accept(gift('delayed',50,now),now+30_000);
  const delayedSc=projection.accept({id:'sc-delay',roomId:1,ts:now,msgType:MsgType.SuperChat,sc:{price:100,duration:1,message:'正文'}},now+30_000);
  assert.equal(api().stickyCandidate(delayedGift,settings).expiresAt,now+150_000);
  assert.equal(api().stickyCandidate(delayedSc,settings).expiresAt,now+330_000);
  const lottery={id:'lot-delay',roomId:1,ts:now,msgType:MsgType.AnchorLotStart,lottery:{id:10,maxTime:120}};
  const projectedLottery=projection.accept(lottery,now+30_000);
  assert.equal(api().stickyCandidate(projectedLottery,settings).expiresAt,now+120_000);
});
test('天选和红包按原始等待时间；匹配开奖提前移除', () => {
  for(const [start,result,time] of [[MsgType.AnchorLotStart,MsgType.AnchorLotAward,'maxTime'],[MsgType.RedPocketStart,MsgType.RedPocketWinner,'waitTime']]) {
    const event={id:'lot',roomId:1,ts:now,msgType:start,lottery:{id:9,[time]:120}};
    assert.equal(view([event])[0].expiresAt,now+120000);
    assert.equal(view(update([event],{...event,id:'result',msgType:result})).length,0);
    assert.equal(view([{...event,lottery:{id:9}}]).length,0);
  }
});
test('关闭功能和切房清空；类别及缺失可靠时长不补资格', () => {
  assert.deepEqual(update([gift('old')],gift('new'),now,{...settings,enabled:false}),[]);
  assert.deepEqual(api().clearStickyEvents(),[]);
  for(const msgType of [MsgType.Danmu,MsgType.Interact,MsgType.AnchorLotAward,MsgType.RedPocketGift]) assert.equal(view([{...gift('x'),msgType}]).length,0);
  assert.equal(view([{id:'sc',roomId:1,ts:now,msgType:MsgType.SuperChat,sc:{price:30}}]).length,1);
});
test('主端候选在窗口关闭期间接收更新，ready快照只带剩余寿命且不重播普通列表', () => {
  const projection=api().createStickyProjection();
  projection.configure(settings,now);
  const session=createGiftWindowSession();openGiftWindowSession(session,1);
  projection.accept(gift('first'),now);
  closeGiftWindowSession(session);
  projection.accept(gift('during-close',50,now+10000),now+10000);
  openGiftWindowSession(session,1);
  assert.deepEqual(session.pending,[]);
  assert.deepEqual(projection.snapshot(now+59000).map(x=>x.id),['first','during-close']);
  assert.deepEqual(view(projection.snapshot(now+60000),settings,now+60000).map(x=>[x.event.id,x.expiresAt]),[['during-close',now+130000]]);
  projection.clear();assert.deepEqual(projection.snapshot(now),[]);
  projection.accept(gift('new-room'),now);projection.configure({...settings,enabled:false},now);
  projection.configure(settings,now);assert.deepEqual(projection.snapshot(now),[]);
});
test('删除通知只更新副窗、不触发语音或特效；普通SC保留删除样式', () => {
  let rows=[{id:'sc',roomId:1,ts:now,msgType:MsgType.SuperChat,sc:{price:30,duration:120,message:'正文'}}];
  const deletion={id:'del',roomId:1,ts:now,msgType:MsgType.ScDeleted,scDeleteIds:['sc']};
  const calls=[];
  const delivery=createEventDelivery({display:()=> 'not-applicable',gift:event=>{rows=appendGiftWindowEvent(rows,event);return 'delivered';},voice:()=>calls.push('voice'),effect:()=>calls.push('effect'),observe:()=>{},switchRoom:()=>{},clearVoice:()=>{}});
  assert.equal(typeof delivery.updateWindows,'function');delivery.updateWindows(deletion);
  assert.equal(rows.length,1);assert.equal(rows[0].scDeleted,true);assert.deepEqual(calls,[]);
});
test('副窗口诊断快照带有效固定设置，旧快照明确报告缺失',()=>{
  const snapshot=collectFeatureSnapshots({environment:{live:{}},settings:{general:{stickyEvents:settings}}});
  assert.deepEqual(snapshot.snapshots['floating-windows'].settings.general.stickyEvents,settings);
  assert.ok(collectFeatureSnapshots({environment:{live:{}}}).missing.some(item=>item.featureId==='floating-windows'&&item.key==='settings.general.stickyEvents'));
});

 test('可靠截止时间不依赖总时长字段，重复接收不续期',()=>{
 const event={id:'timed-lot',roomId:1,ts:now,msgType:MsgType.AnchorLotStart,lottery:{id:85,timing:{observedAt:now,endsAt:now+20000,source:'remaining'}}};
 assert.equal(view([event])[0]?.expiresAt,now+20000);
 assert.equal(view([event],settings,now+20000).length,0);
 });

test('盲盒实付9元开出100元按100元置顶',()=>{const e=gift('hit',9,now,{blindGiftName:'盲盒',blindHitPriceRmb:100});const cards=view([e]);assert.equal(cards.length,1);assert.equal(cards[0].amount,100);assert.equal(cards[0].expiresAt,now+300000);});
test('普通礼物缺少总价值时以已知单价乘数量计算',()=>{const e=gift('many',5,now,{totalRmb:undefined,priceRmb:10,count:3});assert.equal(view([e])[0]?.amount,30);});
