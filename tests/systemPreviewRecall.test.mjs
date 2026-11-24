import test from 'node:test';import assert from 'node:assert/strict';import {createStylePreviewEvents,createStylePreviewDesignEvents} from '../src/components/stylePreviewEvents.ts';
for(const factory of [createStylePreviewEvents,createStylePreviewDesignEvents]) test(factory.name+'系统覆盖并排除撤回控制',()=>{
 const s=factory('系统');assert.deepEqual([...new Set(s.map(e=>e.msgType))].sort((a,b)=>a-b),[18,19,20,21,22,23,24,25]);
 assert(!factory('混合流').some(e=>e.msgType===16||e.msgType===26));
 if(factory===createStylePreviewEvents){const e=factory('弹幕').find(e=>e.danmuDeleted&&e.user?.uname==='稳健的G');assert.equal(e.text,'一生有爱何惧风飞沙');}
 else {const e=factory('弹幕').find(e=>e.id==='native-design:body-recalled');assert(e.danmuDeleted);assert.match(e.text,/已撤回.*检查/);}
});

test('系统预览覆盖开关与房管变更，并复用已保存用户素材',()=>{
 const events=createStylePreviewEvents('系统');
 assert.deepEqual(events.filter(e=>e.msgType===19).map(e=>e.roomSilent.action),['on']);
 assert.equal(events.filter(e=>e.msgType===20).length,1);
 assert.equal(events.find(e=>e.msgType===18).user.uname,'アイノラパス');
 assert.match(events.find(e=>e.msgType===18).user.avatar,/^\/media\/native-preview\//);
 assert(!events.some(e=>/状态样例|变更样例/.test(e.text)));
});
