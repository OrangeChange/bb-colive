import test from 'node:test';
import assert from 'node:assert/strict';
const policy = await import('../src/preview/stylePreviewPolicy.ts').catch(()=>({}));
const { DEFAULT_EVENT_DISPLAY_PREFERENCES: display } = await import('../src/eventDisplaySettings.ts');
const { DEFAULT_EVENT_FILTERS: filters } = await import('../src/events/eventView.ts');
const { DEFAULT_STICKY_EVENT_SETTINGS: sticky } = await import('../src/windows/stickyEventModel.ts');
const settings = () => ({displayPreferences:{...display},filters:structuredClone(filters),giftThreshold:50,giftThresholdMode:'unit',stickySettings:{...sticky,enabled:true,obsEnabled:false,maxCount:2,giftThreshold:50},capacity:1,expiry:{enabled:true,seconds:1}});
const gift = (id, amount, ts=1000) => ({id,roomId:1,ts,msgType:1,gift:{id:1,name:'原始礼物',count:1,price:amount*1000,total:amount*1000,coinType:'gold',priceRmb:amount,totalRmb:amount,paymentRmb:amount}});

test('完整预览可独立筛选多种事件，清空筛选恢复全部案例',()=>{
 const events=[{id:'chat',roomId:1,ts:1000,msgType:0},gift('gift',100),{id:'system',roomId:1,ts:1000,msgType:22}];
 const options={target:'obs',displayAll:true,mode:'static',now:1001};
 const p={...settings(),previewEventKinds:['弹幕','系统']};
 assert.deepEqual(policy.selectStylePreviewEvents(events,p,options).events.map(e=>e.id),['chat','system']);
 assert.equal(policy.selectStylePreviewEvents(events,{...p,previewEventKinds:[]},options).events.length,3);
});

test('固定样例归属预览房间，真实跨房准入保持不变',()=>{
 const event=gift('sample',50),original=structuredClone(event),s={...settings(),targetRoomId:999,audienceFilters:{showCrossRoomEvents:false,minimumWealthLevel:0,minimumCurrentRoomMedalLevel:0}};
 const options={target:'obs',mode:'static',displayAll:false,now:1001};
 assert.equal(policy.selectStylePreviewEvents([event],s,options).events.length,0);
 const scoped=policy.scopeStylePreviewSample(event,999);
 assert.equal(policy.selectStylePreviewEvents([scoped],s,options).events.length,1);
 assert.deepEqual(event,original);assert.equal(scoped.roomId,999);
});
test('预览按软件门槛与置顶上限排序，置顶不受主流容量影响',()=>{
 assert.equal(typeof policy.selectStylePreviewEvents,'function');
 const events=[gift('low',30),gift('a',50),gift('b',100),gift('c',60)];
 const result=policy.selectStylePreviewEvents(events,settings(),{target:'windows',displayAll:false,mode:'simulation',now:1001});
 assert.deepEqual(result.events.map(e=>e.id),['c']);
 assert.deepEqual(result.sticky.map(c=>c.event.id),['b','c']);
});
test('静态和点选豁免容量与寿命；全部部件只放开显示条件，现场无置顶',()=>{
 for(const mode of ['static','design']){
 const result=policy.selectStylePreviewEvents([gift('low',30),gift('a',50)],settings(),{target:'windows',displayAll:true,mode,now:999999});
 assert.equal(result.events.length,1);assert.equal(result.sticky.length,1);
 }
 const p=settings();p.displayPreferences.eventAnimationPreset='slide';p.displayPreferences.eventAnimationDurationMs=345;
 assert.deepEqual(policy.stylePreviewAnimation(p),{preset:'slide',durationMs:345});
 assert.equal(policy.selectStylePreviewEvents([gift('a',100)],p,{target:'live',displayAll:true,mode:'static',now:1001}).sticky.length,0);
 assert.equal(policy.selectStylePreviewEvents([gift('a',100)],p,{target:'obs',displayAll:false,mode:'static',now:1001}).sticky.length,0);
});
test('来源回调最小事实投影保持未知，金额取实际字段且不改样例',()=>{
 const record={method:'onAddGift',receivedAt:1000,payload:{id:'g',totalCoin:100000,num:2,giftName:'真实字段'}};
 const before=structuredClone(record);const ev=policy.projectSourcePreviewFact(record,'blivechat');
 assert.equal(ev.gift.paymentRmb,100);assert.equal(ev.gift.priceRmb,50);assert.deepEqual(record,before);
 const text=policy.projectSourcePreviewFact({method:'onAddText',payload:{id:'t',timestamp:1}},'blivechat-open');
 assert.equal(text.user.phoneVerified,undefined);assert.equal(text.isAutoDanmaku,undefined);
 assert.equal(policy.selectStylePreviewEvents([text],settings(),{target:'windows',displayAll:false,mode:'static',now:1001}).events.length,1);
});
test('动态全部部件仍执行容量寿命，公共筛选与主题筛选不互相替代',()=>{
 const p=settings();p.displayPreferences.showPhoneNotVerified=false;
 const text={id:'t',roomId:1,ts:1000,msgType:0,user:{uid:'u',uname:'用户',guardLevel:0,phoneVerified:false}};
 assert.equal(policy.selectStylePreviewEvents([text],p,{target:'windows',displayAll:false,mode:'design',now:1001}).events.length,0);
 assert.equal(policy.selectStylePreviewEvents([text],p,{target:'windows',displayAll:true,mode:'design',now:1001}).events.length,1);
 assert.equal(policy.selectStylePreviewEvents([text],p,{target:'windows',displayAll:true,mode:'simulation',now:3000}).events.length,0);
});

test('动态容量扩大不复活已淘汰主流，置顶仍独立保留',()=>{
 const p=settings();const events=[gift('a',100),gift('b',60)];
 const first=policy.selectStylePreviewEvents(events,p,{target:'windows',displayAll:true,mode:'simulation',now:1001});
 const second=policy.selectStylePreviewEvents(events,{...p,capacity:10},{target:'windows',displayAll:true,mode:'simulation',now:1002},first.retiredMainIds);
 assert.deepEqual(second.events.map(e=>e.id),['b']);assert.equal(second.sticky.length,2);
});
test('LAPLACE 只依据实际数字手机状态和付款，未知身份不补造',()=>{
 const ev=policy.projectSourcePreviewFact({type:'message',id:'t',timestampNormalized:1000,phoneVerified:0,sendType:1},'laplace');
 assert.equal(ev.user.phoneVerified,false);assert.equal(ev.isAutoDanmaku,true);
 const unknown=policy.projectSourcePreviewFact({type:'toast',id:'u',timestampNormalized:1000},'laplace');
 assert.equal(unknown.guard.level,undefined);assert.equal(unknown.guard.priceRmb,undefined);
});

test('输出预览沿用输出分类，现场分类关闭不覆盖输出；系统样例不误按收益分类移除',()=>{
 const p=settings();p.filters.left.danmu=false;p.windowFilters={...structuredClone(filters.left),danmu:true};
 const text={id:'t',roomId:1,ts:1000,msgType:0};
 assert.equal(policy.selectStylePreviewEvents([text],p,{target:'live',displayAll:false,mode:'static',now:1001}).events.length,0);
 assert.equal(policy.selectStylePreviewEvents([text],p,{target:'obs',displayAll:false,mode:'static',now:1001}).events.length,1);
 const system={id:'s',roomId:1,ts:1000,msgType:18};
 assert.equal(policy.selectStylePreviewEvents([system],p,{target:'obs',displayAll:false,mode:'static',now:1001}).events.length,1);
});

test('实际来源 SC 撤回不进入主流，也不能重新进入置顶',()=>{
 const added=policy.projectSourcePreviewFact({method:'onAddSuperChat',receivedAt:1000,payload:{id:'sc',price:100,content:'真实留言'}},'blivechat');
 const removed=policy.projectSourcePreviewFact({method:'onDelSuperChat',receivedAt:1100,payload:{ids:['sc']}},'blivechat');
 assert.deepEqual(removed.scDeleteIds,['sc']);
 const result=policy.selectStylePreviewEvents([added,removed],settings(),{target:'windows',displayAll:false,mode:'simulation',now:1101});
 assert.equal(result.sticky.length,0);
 assert.equal(result.events.some(event=>event.msgType===removed.msgType),false);
});

test('来源已知粉丝牌参与公共等级筛选，未知归属不补为当前房间',()=>{
 const p=settings();p.audienceFilters={showCrossRoomEvents:true,minimumWealthLevel:0,minimumCurrentRoomMedalLevel:10};
 const other=policy.projectSourcePreviewFact({type:'message',id:'m',origin:1,timestampNormalized:1000,medal:{name:'真实牌',level:2,room:2}},'laplace');
 assert.equal(other.user.medal.isCurrentRoom,false);
 assert.equal(policy.selectStylePreviewEvents([other],p,{target:'obs',displayAll:false,mode:'static',now:1001}).events.length,0);
 const unknown=policy.projectSourcePreviewFact({method:'onAddText',payload:{id:'u',medalLevel:5}},'blivechat-open');
 assert.equal(unknown.user.medal.isCurrentRoom,undefined);
 assert.equal(policy.selectStylePreviewEvents([unknown],p,{target:'obs',displayAll:false,mode:'static',now:1001}).events.length,1);
});
