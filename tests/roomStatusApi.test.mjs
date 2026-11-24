import test from 'node:test';
import assert from 'node:assert/strict';
import { componentRuntime } from './helpers/componentRuntime.mjs';
function api(fetch) { return componentRuntime('src/protocol/api.ts', {'@tauri-apps/plugin-http':{fetch},'js-md5':{md5:()=>''}}).exports; }
const response = data => ({status:200,json:async()=>({code:0,data})});
test('31位主播状态一次批量获取，开播时间按北京时间转换',async()=>{
 const calls=[];const a=api(async url=>{calls.push(new URL(url));return response({by_room_ids:{101:{room_id:101,short_id:7,uid:9,live_status:1,live_time:'2026-11-19 18:00:00'},202:{room_id:202,uid:10,live_status:0,live_time:'0000-00-00 00:00:00'}}});});
 assert.equal(typeof a.getRoomBaseInfo,'function');const rows=await a.getRoomBaseInfo(Array.from({length:31},(_,i)=>i+1),'cookie');assert.equal(calls.length,1);assert.equal(calls[0].searchParams.getAll('room_ids').length,31);assert.equal(rows[0].live_time,Date.parse('2026-11-19T18:00:00+08:00')/1000);assert.equal(rows[1].live_time,undefined);assert.equal(rows[0].locked,undefined);
});
test('room_init返回412后通过官方房间信息解析，冷却期间不重复请求room_init',async()=>{
 const calls=[];const a=api(async url=>{calls.push(url);return url.includes('room_init')?{status:412,json:async()=>{throw Error('HTML');}}:response({by_room_ids:{101:{room_id:101,short_id:7,uid:9,live_status:0,live_time:'0000-00-00 00:00:00'}}});});
 const first=await a.getRealRoomId('7','cookie');assert.equal(first.room_id,101);assert.equal((await a.getRealRoomId(101,'cookie')).room_id,101);assert.equal(calls.filter(x=>x.includes('room_init')).length,1);assert.equal(calls.filter(x=>x.includes('getRoomBaseInfo')).length,2);
});
test('房间不存在等业务错误不切换接口',async()=>{
 let calls=0;const a=api(async()=>{calls++;return{status:200,json:async()=>({code:60004,message:'missing'})};});await assert.rejects(()=>a.getRealRoomId(404),e=>e.code===60004);assert.equal(calls,1);
});
