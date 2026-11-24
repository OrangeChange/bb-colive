import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const vite=await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-systemEventStateClasses.test.mjs",configFile:false,server:{middlewareMode:true,watch:null},optimizeDeps:{noDiscovery:true,include:[]},logLevel:'silent'});
test.after(()=>vite.close());
const {adapt}=await vite.ssrLoadModule('/src/protocol/adapter.ts');
const {publicEventClass}=await vite.ssrLoadModule('/src/events/publicEventStyle.ts');
const {MsgType}=await vite.ssrLoadModule('/src/protocol/types.ts');
const context={roomId:1,anchorUid:'2',keepRaw:false};
test('房管状态从协议保留，并提供独立公共状态类',()=>{
 for(const[message,action,cls]of[
  [{cmd:'room_admin_entrance',uid:3},'appoint','system-admin-appointed'],
  [{cmd:'ROOM_ADMIN_REVOKE',uid:3},'revoke','system-admin-revoked'],
  [{cmd:'ROOM_ADMINS',uids:[3,4]},'list','system-admin-list-updated'],
 ]){const event=adapt(message,context);assert.equal(event.adminAction,action);assert.equal(publicEventClass(event),`type-system system-admin-change ${cls}`);}
});
test('禁言启停提供状态类，缺失状态时保留通用类型',()=>{
 for(const action of['on','off'])assert.equal(publicEventClass({msgType:MsgType.RoomSilent,roomSilent:{action}}),`type-system system-room-silent system-room-silent-${action}`);
 assert.equal(publicEventClass({msgType:MsgType.RoomSilent}),'type-system system-room-silent');
 assert.equal(publicEventClass({msgType:MsgType.AdminChange,text:'被设为房管'}),'type-system system-admin-change');
 assert.equal(publicEventClass({msgType:MsgType.AdminChange,text:'房管被撤销'}),'type-system system-admin-change');
 assert.equal(publicEventClass({msgType:MsgType.AdminChange,adminAction:'revoke',text:'被设为房管'}),'type-system system-admin-change system-admin-revoked');
});
