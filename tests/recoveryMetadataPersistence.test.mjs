import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { sqliteAdapter } from './helpers/archiveAcceptance.mjs';
import { initializeArchiveDatabase } from '../src/archive/archiveSchema.ts';
import { ArchiveRepository } from '../src/archive/archiveRepository.ts';

test('恢复资料与场次一起持久保存；更新时间不改变身份和统计',async t=>{
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  const adapter=sqliteAdapter(db);await initializeArchiveDatabase(adapter);
  const repo=new ArchiveRepository(adapter);
  await repo.upsertOwner({ownerId:'room:1',roomId:1,name:'主播'});
  const cloudMetadata={serverId:'s',roomId:'1',state:{server_session_id:'a',ended_at:null,ended_discovered_at:'2026-10-20T12:44:35.526Z'},connections:[],quality:[],missingRanges:[],covers:[],sourceAvailability:[]};
  await repo.upsertSession({sessionId:'a',ownerId:'room:1',roomId:1,startedAt:2000,status:'ended',quality:'complete',cloudMetadata});
  await repo.updateSession({sessionId:'a',startedAt:1000});
  const reopened=new ArchiveRepository(adapter),actual=await reopened.getSession('a');
  assert.deepEqual(actual.cloudMetadata,cloudMetadata);
  assert.equal(actual.startedAt,1000);
  assert.equal(actual.endedAt,null);
});
