import test from 'node:test';
import assert from 'node:assert/strict';
import {dispatchCompatibleLiveAction} from '../src/compat/compatibleLiveBridge.ts';

test('兼容事件可按UID筛选回复对象、收礼对象和中奖者，不退回发送者',()=>{
 const event={id:'participants',msgType:0,roomId:1,ts:1,user:{uid:'10',uname:'发送者'},replyTo:{uid:'20',uname:'回复对象'},lottery:{winners:[{uid:'40',uname:'中奖者'}]},laplace:{event:{receiver:{uid:30,uname:'收礼对象'},list:[[50,'红包中奖者']]}}};
 const selected=[];
 for(const uid of ['20','30','40','50'])assert.equal(dispatchCompatibleLiveAction(event,{type:'filter-user',uid},{onFilterUser:user=>selected.push(user.uid)}),true);
 assert.deepEqual(selected,['20','30','40','50']);
 assert.equal(dispatchCompatibleLiveAction(event,{type:'filter-user',uid:'999'},{onFilterUser:user=>selected.push(user.uid)}),false);
 assert.equal(event.user.uname,'发送者');
});
