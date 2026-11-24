import test from 'node:test';
import assert from 'node:assert/strict';
import { recoveryTimestamp, recoverySessionMetadata } from '../src/cloudSync/recoverySessionMetadata.ts';

test('毫秒字符串与 ISO 时间使用相同时间轴，无效值不变成当前时间',()=>{
  assert.equal(recoveryTimestamp('1792486228000'),1792486228000);
  assert.equal(recoveryTimestamp('2026-10-20T08:50:28.000Z'),1792486228000);
  assert.equal(recoveryTimestamp(null),null);
  assert.equal(recoveryTimestamp('错误'),null);
});
test('读取真实房间主播结构并保留场次生命周期和未知结束时间',()=>{
  const row={type:'session_state',server_session_id:'a',availability:'available',title:'历史标题',area:'音乐',capture_started_at:'2026-10-20T08:50:30.281Z',source_live_started_at:'1792486228000',
    ended_at:null,ended_discovered_at:'2026-10-20T12:44:35.526Z',end_evidence:'PREPARING',live_status:'ended',recording_status:'stopped',quality:'complete',quality_reasons:[],pending_evidence:[],
    broadcaster_snapshot:{room_info:{uid:42},anchor_info:{base_info:{uname:'主播',face:'https://example.com/a.jpg'}}}};
  const value=recoverySessionMetadata(row);
  assert.deepEqual(value.broadcaster,{uid:'42',name:'主播',face:'https://example.com/a.jpg'});
  assert.equal(value.sourceLiveStartedAt,1792486228000);
  assert.equal(value.endedAt,null);
  assert.equal(value.state.ended_discovered_at,'2026-10-20T12:44:35.526Z');
});
