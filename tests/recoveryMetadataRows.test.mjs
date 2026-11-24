import test from 'node:test';
import assert from 'node:assert/strict';
import { attachRecoveryMetadata } from '../src/cloudSync/recoveryMetadataRows.ts';

test('场次关联质量、连接、封面和缺口；来源失效不删除场次',()=>{
  const state={server_session_id:'a',availability:'available',min_sequence:'1',max_sequence:'10'};
  const sessions=new Map([['a',{serverSessionId:'a',state}]]);
  attachRecoveryMetadata(sessions,[
    {type:'connection',connection_id:'c',server_session_ids:['a']},
    {type:'quality',issue_id:'q',server_session_id:'a',connection_id:'c'},
    {type:'missing_range',kind:'loss',from_sequence:'2',through_sequence:'3',reason:'gap'},
    {type:'cover_upsert',cover:{resource_id:'cover',server_session_id:'a',availability:'available',result:'success'}},
    {type:'session_tombstone',server_session_id:'a',availability:'expired',reason:'expired'},
  ],{serverId:'server',roomId:'1'});
  const metadata=sessions.get('a').cloudMetadata;
  assert.equal(sessions.size,1);
  assert.equal(metadata.state.availability,'expired');
  assert.equal(metadata.connections[0].connection_id,'c');
  assert.equal(metadata.quality[0].issue_id,'q');
  assert.equal(metadata.covers[0].resource_id,'cover');
  assert.equal(metadata.missingRanges[0].from_sequence,'2');
  attachRecoveryMetadata(sessions,[{type:'quality_upsert',quality:{issue_id:'q',server_session_id:'a',connection_id:'c',quality_impact:'confirmed'}}],{serverId:'server',roomId:'1'});
  assert.equal(sessions.get('a').cloudMetadata.quality.length,1);
  assert.equal(sessions.get('a').cloudMetadata.quality[0].quality_impact,'confirmed');
});
