import test from 'node:test';
import assert from 'node:assert/strict';
const api = await import('../src/preview/stylePreviewGenerator.ts').catch(() => ({}));
import {MsgType} from '../src/protocol/types.ts';
import {admitsStylePreviewEvent,DEFAULT_STYLE_PREVIEW_POLICY} from '../src/preview/stylePreviewPolicy.ts';
test('绑定按ID区分同名用户，保留默认头像', () => {
  assert.equal(typeof api.pickPreviewUser, 'function');
  const users = [{id:'1',name:'同名',avatar:'/media/noface.gif'},{id:'2',name:'同名',avatar:'/media/style-preview-avatar-2.jpg'}];
  assert.deepEqual(api.pickPreviewUser(users,()=>0),users[0]);
  assert.deepEqual(api.pickPreviewUser(users,()=>0.9),users[1]);
  assert.equal(api.pickPreviewUser([],()=>0),null);
});
test('原生数量先进入候选准入，生成后不跌破累计金额门槛',()=>{
  const policy={...DEFAULT_STYLE_PREVIEW_POLICY,giftThreshold:40,giftThresholdMode:'cumulative'};
  const opts={target:'obs',displayAll:false,mode:'simulation',now:1};
  const candidates=api.nativePreviewCandidates('礼物').filter(event=>admitsStylePreviewEvent(event,policy,opts));
  for(const candidate of candidates) {
    const event=api.nextNativePreviewEvent({candidates:[candidate],random:()=>0,now:()=>1,sequence:1,session:'threshold'});
    assert.ok(admitsStylePreviewEvent(event,policy,opts));
  }
});
test('原生开奖只关联已生成的开始事件，中奖用户成组绑定',()=>{
  const all=api.nativePreviewCandidates('红包/天选');
  const result=all.find(event=>event.msgType===MsgType.RedPocketWinner);
  const context={candidates:[result],random:()=>0,now:()=>1,sequence:2,session:'lottery'};
  assert.equal(api.nextNativePreviewEvent(context),null);
  assert.equal(api.eligibleNativePreviewCandidates([result]).length,0);
  const start=api.nextNativePreviewEvent({...context,candidates:all.filter(event=>event.msgType===MsgType.RedPocketStart),sequence:1});
  const winner=api.nextNativePreviewEvent({...context,events:[start]});
  assert.equal(winner.lottery.id,start.lottery.id);
  assert.equal(start.lottery.awardName,all.find(e=>e.msgType===MsgType.RedPocketStart).lottery.awardName);
  assert.equal(winner.lottery.awardName,result.lottery.awardName);
  assert(winner.lottery.winners.every(w=>w.awardName===result.lottery.awardName));
  assert.deepEqual(winner.lottery.winners.map(w=>[w.uid,w.uname]),result.lottery.winners.map(w=>[w.uid,w.uname]));
  assert.equal(api.nextNativePreviewEvent({...context,events:[start,winner]}),null);
});
test('原生空候选不生成；类别先抽取，金额与资料配套且ID递增', () => {
  assert.equal(typeof api.nextNativePreviewEvent, 'function');
  assert.equal(api.nextNativePreviewEvent({candidates:[],random:()=>0,now:()=>1,sequence:1,session:'a'}),null);
  const candidates=api.nativePreviewCandidates('礼物');
  const byId=new Map();
  for(let i=1;i<=40;i++){
    let n=0; const random=()=>((i*13+(n++)*7)%41)/41;
    const event=api.nextNativePreviewEvent({candidates,random,now:()=>1000,sequence:i,session:'a'});
    assert.equal(event.id,`preview:a:${i}`);
    assert.equal(event.ts,1000);
    const profile=[event.user.uname,event.user.avatar];
    if(byId.has(event.user.uid))assert.deepEqual(profile,byId.get(event.user.uid));
    byId.set(event.user.uid,profile);
    assert(candidates.some(sample=>JSON.stringify(sample.gift)===JSON.stringify(event.gift)));
  }
});
test('原生身份、购买等级和说明正文按整组变体生成',()=>{
  const candidates=api.nativePreviewCandidates('大航海').filter(event=>event.guard?.level===1||event.guard?.level===3).slice(0,2);
  let draws=0;
  const paired=api.nextNativePreviewEvent({candidates,random:()=>draws++<2?0:0.99,now:()=>1,sequence:1,session:'paired'});
  assert.equal(paired.user?.guardLevel,candidates[0].user?.guardLevel);
  for(let i=0;i<candidates.length;i++) {
    const sample=candidates[i];
    const event=api.nextNativePreviewEvent({candidates:[sample],random:()=>0.99,now:()=>1,sequence:i,session:'purchase'});
    assert.equal(event.user?.guardLevel,sample.user?.guardLevel);
    assert.deepEqual(event.guard,sample.guard);
    assert.equal(event.text,sample.text);
  }
});

test('原生随机资料与纯文本均取自独立素材，不回到合成名字或正文',async()=>{
 const {createStylePreviewEvents}=await import('../src/components/stylePreviewEvents.ts');const local=createStylePreviewEvents('混合流');const profiles=new Set(local.filter(e=>e.user).map(e=>JSON.stringify([e.user.uid,e.user.uname,e.user.avatar??'/media/noface.gif'])));assert(api.PREVIEW_USERS.every(u=>profiles.has(JSON.stringify([u.id,u.name,u.avatar]))));
 const texts=new Set(local.filter(e=>e.msgType===0&&!e.emoticon&&!e.emotes&&!e.replyTo).map(e=>e.text));const candidates=api.nativePreviewCandidates('弹幕').filter(e=>!e.emoticon&&!e.emotes&&!e.replyTo);for(let i=0;i<20;i++){let n=0;const e=api.nextNativePreviewEvent({candidates,random:()=>((i*13+n++*7)%41)/41,now:()=>1,sequence:i,session:'local'});assert(texts.has(e.text));assert(profiles.has(JSON.stringify([e.user.uid,e.user.uname,e.user.avatar])))}
});
