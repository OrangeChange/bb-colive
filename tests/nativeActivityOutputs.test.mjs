import assert from 'node:assert/strict';
import test from 'node:test';
import {createObsOutputState} from '../src/obs/obsOutputState.ts';
import {createRoomSessions} from '../src/obs/obsRoomSessions.ts';
import {DEFAULT_EVENT_WINDOW_PREFERENCES as defaults} from '../src/windows/eventWindowPreferences.ts';
const start={id:'anchor-start:21',msgType:4,roomId:1,ts:1000,lottery:{id:21,awardName:'奖品',awardNum:1,maxTime:600,timing:{observedAt:1000,serverNow:1000,endsAt:66000,source:'remaining'}}};
const result={id:'award',msgType:5,roomId:1,ts:66000,lottery:{id:21,awardName:'奖品',awardNum:1,winners:[{uid:'1',uname:'用户'}]}};
test('原生OBS保留开始行与首条身份，结果被隐藏仍呈现已开奖',()=>{
 const state=createObsOutputState(1,{...defaults,stickyEvents:{...defaults.stickyEvents,obsEnabled:true}},{nativeMain:true,allowsMain:e=>e.msgType!==5});
 state.accept(start,1000);const key=state.snapshot(1001).events[0].reactKey;
 state.accept({...start,lottery:{...start.lottery,timing:{...start.lottery.timing,serverNow:2000,observedAt:2000}}},2000);
 assert.equal(state.snapshot(2001).events.length,1);
 assert.equal(state.snapshot(2001).events[0].reactKey,key);
 state.accept(result,66000);const snapshot=state.snapshot(66001);
 assert.equal(snapshot.events.length,1);
 assert.equal(snapshot.events[0].activity.drawnAt,66000);
 assert.equal(snapshot.sticky.length,0);
});
test('兼容输出继续使用原有结果移除开始行策略',()=>{
 const state=createObsOutputState(1,defaults);
 state.accept(start,1000);state.accept(result,66000);
 assert.deepEqual(state.snapshot(66001).events.map(e=>e.id),['award']);
});
test('END是内部事实，更新状态但不占用事件容量',()=>{
 const state=createObsOutputState(1,defaults,{nativeMain:true});state.accept(start,1000);
 state.acceptActivity({roomId:1,kind:'anchor',activityId:21,observedAt:2000,endedAt:2000});
 assert.equal(state.snapshot(2001).events.length,1);
 assert.equal(state.snapshot(2001).events[0].activity.endedAt,2000);
});
test('共享连接先分发事实，后交付事件，重开输出重放相同锚点',async()=>{
 let callbacks;const order=[];
 const sessions=createRoomSessions({resolveRoom:async()=>1,create:cb=>{callbacks=cb;return {connect:async()=>{},disconnect(){},isConnected:true,anchor:null}}});
 const lease=await sessions.acquire({roomIdInput:'1',cookie:'',uid:0},{onState(){},onEvent:e=>order.push(['event',e.activity]),onActivityUpdate:f=>order.push(['fact',f])});
 callbacks.onEvent(start);assert.deepEqual(order.map(x=>x[0]),['fact','event']);
 const replay=[];const second=await sessions.acquire({roomIdInput:'1',cookie:'',uid:0},{onState(){},onEvent(){},onActivityUpdate:f=>replay.push(f)});second.replay();
 assert.equal(replay[0].timing.observedAt,1000);lease.release();second.release();
});

test('活动时间修订同步现存置顶候选且不改变首次入队时间',()=>{
 const state=createObsOutputState(1,{...defaults,stickyEvents:{...defaults.stickyEvents,obsEnabled:true}},{nativeMain:true});state.accept(start,1000);
 const first=state.snapshot(1001).sticky[0];
 state.acceptActivity({roomId:1,kind:'anchor',activityId:21,observedAt:2000,timing:{endsAt:80000,observedAt:2000,serverNow:2000,source:'end-time'}});
 const next=state.snapshot(2001);assert.equal(next.sticky[0].expiresAt,80000);assert.equal(next.sticky[0].startedAt,first.startedAt);assert.equal(next.events.length,1);
});
