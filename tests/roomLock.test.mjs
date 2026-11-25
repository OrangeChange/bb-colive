import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {tmpdir} from 'node:os';
let server,adapt,MsgType,reminders;
test.before(async()=>{
 server=await createServer({configFile:false,cacheDir:tmpdir()+'/bb-colive-room-lock-tests',logLevel:'silent',optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,watch:null}});
 ({adapt}=await server.ssrLoadModule('/src/protocol/adapter.ts'));
 ({MsgType}=await server.ssrLoadModule('/src/protocol/types.ts'));
 reminders=await server.ssrLoadModule('/src/components/systemReminder.ts');
});
test.after(()=>server?.close());
const ctx={roomId:870004,anchorUid:'1',keepRaw:true};
test('封禁与切断独立入列，保留原文和北京时间解禁期限',()=>{
 const raw={cmd:'ROOM_LOCK',expire:'2026-11-27 03:00:00',roomid:870004};
 const event=adapt(raw,ctx);
 assert.notEqual(event.msgType,MsgType.Unknown);
 assert.equal(event.msgType,MsgType.RoomLock);
 assert.equal(event.roomLock.endsAt,Date.UTC(2026,10,26,19));
 assert.deepEqual(event.raw,raw);
 assert.equal(reminders.isSystemReminderEvent(event),true);
 assert.equal(reminders.isUrgentSystemEvent(event),true);
 assert.match(reminders.formatSystemReminderText(event),/直播间被封禁[\s\S]*2026-11-27 03:00:00/);
 assert.equal(adapt({cmd:'CUT_OFF',msg:'违反直播规范'},ctx).msgType,MsgType.CutOff);
 assert.equal(adapt({...raw,roomid:1},ctx),null);
});
test('未知或无效封禁期限不推算，不将其认定为永久',()=>{
 for(const expire of [undefined,'','0000-00-00 00:00:00','2026-02-30 03:00:00','永久']){
  const event=adapt({cmd:'ROOM_LOCK',roomid:870004,expire},ctx);
  assert.equal(event.msgType,MsgType.RoomLock);
  assert.equal(event.roomLock.endsAt,undefined);
  assert.match(reminders.formatSystemReminderText(event),/解禁时间未提供/);
 }
});
test('封禁提示优先于随后的切断提示，重新开播后结束紧急提示但保留记录',()=>{
 const lock={id:'lock',roomId:870004,ts:1,msgType:MsgType.RoomLock};
 const cut={...lock,id:'cut',ts:2,msgType:MsgType.CutOff};
 const live={...lock,id:'live',ts:3,msgType:MsgType.LiveStart};
 assert.equal(reminders.getLatestUrgentSystemEvent([lock,cut]),lock);
 assert.equal(reminders.getLatestUrgentSystemEvent([lock,cut,live]),null);
 assert.equal(reminders.getSystemReminderEvents([lock,cut,live]).length,3);
});

test('期限补查只接受平台明确锁定且有效的时间，失败保留封禁事件',async()=>{
 const {completeRoomLock}=await server.ssrLoadModule('/src/protocol/roomLock.ts');
 const event=adapt({cmd:'ROOM_LOCK',roomid:870004},ctx);
 const seconds=Date.UTC(2026,10,26,19)/1000;
 const completed=await completeRoomLock(event,async()=>({is_locked:true,lock_till:seconds}));
 assert.equal(completed.roomLock.endsAt,seconds*1000);
 assert.equal(completed.roomLock.source,'room-info');
 assert.deepEqual(completed.raw,event.raw);
 assert.equal(await completeRoomLock(event,async()=>({is_locked:false,lock_till:seconds})),event);
 assert.equal(await completeRoomLock(event,async()=>{throw Error('offline')}),event);
 assert.equal(await completeRoomLock(completed,async()=>{throw Error('must not query')}),completed);
});
test('期限异步补齐晚于重新开播时，旧封禁仍只作为历史记录',()=>{
 const lock={id:'lock',roomId:870004,ts:1,msgType:MsgType.RoomLock};
 const live={...lock,id:'live',ts:3,msgType:MsgType.LiveStart};
 assert.equal(reminders.getLatestUrgentSystemEvent([live,lock]),null);
});
test('剩余时长支持五级单位、精简和完整格式及四种语言',async()=>{
 const {formatRemainingDuration}=await server.ssrLoadModule('/src/i18n/duration.ts');
 const duration=(365*86400+2*86400+3*3600+4*60+5)*1000;
 assert.equal(formatRemainingDuration(duration,false,'zh-CN'),'1年2天');
 assert.equal(formatRemainingDuration(duration,true,'zh-CN'),'1年2天3小时4分钟5秒');
 assert.equal(formatRemainingDuration(3605000,false,'zh-CN'),'1小时5秒');
 assert.equal(formatRemainingDuration(100,false,'zh-CN'),'1秒');
 assert.equal(formatRemainingDuration(-1,false,'zh-CN'),'');
 for(const locale of ['zh-Hant','en','ja'])assert(formatRemainingDuration(duration,true,locale).length>0);
});

test('原生封禁消息使用锁图标和独立期限部件，关闭普通时间仍保留期限',async()=>{
 const {createElement}=await import('react');
 const {renderToStaticMarkup}=await import('react-dom/server');
 const {EventRow}=await server.ssrLoadModule('/src/components/EventRow.tsx');
 const event=adapt({cmd:'ROOM_LOCK',roomid:870004,expire:'2026-11-27 03:00:00'},ctx);
 const html=renderToStaticMarkup(createElement(EventRow,{ev:event,liveLayout:true,showTime:false,animateOnMount:false}));
 assert.match(html,/live-locked/);
 assert.match(html,/lucide-lock-keyhole/);
 assert.match(html,/system-message-expiry/);
 assert.match(html,/2026-11-27/);
 assert.match(html,/datetime="2026-11-26T19:00:00.000Z"/i);
});
test('原生输出的系统开关及警告分组同时约束封禁，兼容投影保留完整消息',async()=>{
 const {createNativeEventVisibilityPredicate}=await server.ssrLoadModule('/src/events/outputEventPolicy.ts');
 const event=adapt({cmd:'ROOM_LOCK',roomid:870004,expire:'2026-11-27 03:00:00'},ctx);
 assert.equal(createNativeEventVisibilityPredicate({categories:{system:false}})(event),false);
 assert.equal(createNativeEventVisibilityPredicate({children:{warning:false}})(event),false);
 const {projectLaplaceEvent}=await server.ssrLoadModule('/src/compat/laplace/projection.ts');
 const projected=projectLaplaceEvent(event,{roomId:870004,generation:1},1,Date.now());
 assert.equal(projected.event.type,'system');
 assert.match(projected.event.message,/直播间被封禁[\s\S]*2026-11-27/);
});
