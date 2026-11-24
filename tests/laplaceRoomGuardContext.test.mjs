import test from 'node:test';
import assert from 'node:assert/strict';
import { laplaceRoomGuardContext } from '../src/compat/laplace/roomGuardContext.ts';
test('LAPLACE房间档位使用真实人数，不从用户勋章猜测人数',()=>{
 for(const count of [0,999,1000,9999,10000])assert.deepEqual(laplaceRoomGuardContext({roomId:42,anchorUid:'7',guardCount:count,milestone:'thousand',iconSet:'enhanced',source:'room-info'},42),{'7':{roomId:42,guardCount:count}});
 const profile={roomId:42,anchorUid:'7',milestone:'thousand',iconSet:'enhanced',source:'room-info'};
 assert.deepEqual(laplaceRoomGuardContext(profile,42),{});
 assert.deepEqual(laplaceRoomGuardContext({...profile,guardCount:1000},43),{});
 assert.deepEqual(laplaceRoomGuardContext(undefined,42),{});
});
