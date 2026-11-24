import test from 'node:test';import assert from 'node:assert/strict';
import {projectCompatibleDisplayNames} from '../src/compat/compatibleDisplayNames.ts';

test('兼容昵称只改显示姓名，保留UID、原始事件及空昵称行为',()=>{
 const event={user:{uid:'1',uname:'原名'}},names={'1':'昵称','2':'对象昵称'};
 for(const payload of [{method:'onAddText',payload:{authorName:'原名',uid:'1'}},{uid:'1',username:'原名',reply:{uid:2,uname:'对象'},receiver:{uid:2,uname:'对象'},list:[[2,'中奖者','avatar']]}]){
  const before=structuredClone(payload),result=projectCompatibleDisplayNames(payload,event,names,false);
  assert.equal(result.payload?.authorName??result.username,'昵称');assert.deepEqual(payload,before);assert.equal(event.user.uname,'原名');
  const masked=projectCompatibleDisplayNames(payload,event,names,true);assert.equal(masked.payload?.authorName??masked.username,'昵***');
  if(result.list){assert.equal(result.reply.uname,'对象昵称');assert.equal(result.receiver.uname,'对象昵称');assert.deepEqual(result.list[0],[2,'对象昵称','avatar']);}
 }
});
