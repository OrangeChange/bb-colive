import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { source, envelope, page } from './helpers/cloudHistory.mjs';
import { createHistoryContext, encodeHistoryContext } from '../src/cloudSync/cloudHistoryContext.ts';
import { SendGiftV2 } from '../src/protocol/proto.ts';
import { readFile } from 'node:fs/promises';
let server, iterateRecoveryOutputs, recoveryExpansionInput, parseHistoryPage;
test.before(async()=>{server=await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-recoveryOutputIterator.test.mjs",root:fileURLToPath(new URL('../',import.meta.url)),configFile:false,optimizeDeps:{noDiscovery:true,include:[]},logLevel:'silent',server:{middlewareMode:true,watch:null}});({iterateRecoveryOutputs,recoveryExpansionInput}=await server.ssrLoadModule('/src/cloudSync/recoveryOutputIterator.ts'));({parseHistoryPage}=await server.ssrLoadModule('/src/cloudSync/cloudHistoryParser.ts'));});
test.after(async()=>{await server?.close();});
const repeated=count=>page([envelope('1',{cmd:'SEND_GIFT_V2',data:{pb:Buffer.from(SendGiftV2.encode({uid:123,uname:'captured',gift:Array.from({length:count},(_,i)=>({giftId:1,name:'gift',num:1,totalCoin:1000,itemId:String(i+1)}))}).finish()).toString('base64')}})]);
test('4097 repeated outputs remain bounded and restart at exact index',()=>{
 const input=repeated(4097),context=createHistoryContext(source),original=encodeHistoryContext(context);let after=0;const actual=[];
 for(const part of iterateRecoveryOutputs(input,context,{maxRows:256,maxBytes:2097152})){assert.ok(part.outputs.length<=256);assert.ok(part.expandedBytes<=2097152);assert.equal(part.outputs[0]?.outputIndex,after);after=part.nextOutputIndex;actual.push(...part.outputs);}
 assert.equal(after,4097);assert.equal(encodeHistoryContext(context),original);
 const resumed=[...iterateRecoveryOutputs(input,context,{after:2048})].flatMap(p=>p.outputs);assert.deepEqual(resumed,actual.slice(2048));assert.equal(new Set(actual.map(o=>o.outputKey)).size,4097);
 const oracle=parseHistoryPage(input,context);assert.deepEqual(actual,oracle.records[0].outputs);
});
test('fallback identities and captured snapshot context match original history parser',()=>{
 const input=repeated(3);const decoded=SendGiftV2.decode(Buffer.from(input.items[0].raw_payload.value.data.pb,'base64'));for(const gift of decoded.gift)delete gift.itemId;input.items[0].raw_payload.value.data.pb=Buffer.from(SendGiftV2.encode(decoded).finish()).toString('base64');
 input.items[0].snapshot_ids=['capture'];input.snapshots=[{snapshot_id:'capture',availability:'available',kind:'gift_config',requested_at:'2026-10-06T00:00:00Z',fetched_at:'2026-10-06T00:00:01Z',result:'failed',raw_data:null,failure_reason:'captured'}];
 const context=createHistoryContext(source),parts=[...iterateRecoveryOutputs(input,context,{maxRows:1})],oracle=parseHistoryPage(input,context);assert.deepEqual(parts.flatMap(p=>p.outputs),oracle.records[0].outputs);assert.equal(encodeHistoryContext(parts.at(-1).contextAfter),encodeHistoryContext(oracle.nextContext));
});
test('byte capacity remains explicit while large user context is compacted without mutating input',()=>{
 const input=repeated(2),context=createHistoryContext(source);assert.throws(()=>[...iterateRecoveryOutputs(input,context,{maxBytes:8})],/waiting_/);
 for(let index=0;index<4097;index++)context.adapter.avatarsByUid.set(String(index),'captured');const result=[...iterateRecoveryOutputs(input,context)];assert.ok(result.at(-1).contextAfter.adapter.avatarsByUid.size<=4096);
 assert.equal(context.lastSequence,'0');assert.equal(context.adapter.avatarsByUid.size,4097);
});
test('frozen fact adapter preserves empty source identity and captured missing evidence',async()=>{
 const fact=JSON.parse((await readFile(new URL('./fixtures/cloudRecovery/v02/baseline/objects/00000000-0000-4000-8000-000000000100.data',import.meta.url),'utf8')).split('\n')[0]);fact.room_id='1';fact.server_session_id=null;const context=createHistoryContext({serverId:fact.server_id,roomId:fact.room_id});
 const reference={type:'snapshot_ref',server_id:fact.server_id,room_id:'1',snapshot_id:fact.snapshot_ids[0],availability:'missing',result:null,object_id:null,sha256:null,reason:'captured'};const input=recoveryExpansionInput(fact,context,[{reference,value:null}]);assert.equal(input.items[0].session_id,null);assert.deepEqual(input.items[0].raw_payload,fact.raw_payload);assert.equal(input.snapshots.length,0);const output=[...iterateRecoveryOutputs(input,context)];assert.equal(output.at(-1).terminal,true);assert.equal(output.at(-1).contextAfter.lastSequence,fact.server_sequence);
 const bad=structuredClone(reference);bad.room_id='2';assert.throws(()=>recoveryExpansionInput(fact,context,[{reference:bad,value:null}]),/source_identity_conflict/);
});
test('captured snapshot with many gift entries is compacted after applying current event',()=>{
 const input=repeated(1),context=createHistoryContext(source);input.items[0].snapshot_ids=['large'];input.snapshots=[{snapshot_id:'large',availability:'available',kind:'gift_config',requested_at:'2026-10-06T00:00:00Z',fetched_at:'2026-10-06T00:00:01Z',result:'success',failure_reason:null,raw_data:{list:Array.from({length:4097},(_,i)=>({id:i+1,img_basic:'captured'}))}}];const result=[...iterateRecoveryOutputs(input,context)];const next=result.at(-1).contextAfter;assert.ok(Object.values(next.projections).reduce((sum,p)=>sum+(p?.gifts.size??0),0)<=4096);assert.deepEqual(context.projections,{});
});
test('frozen input requires one captured reference per snapshot identity',async()=>{
 const fact=JSON.parse((await readFile(new URL('./fixtures/cloudRecovery/v02/baseline/objects/00000000-0000-4000-8000-000000000100.data',import.meta.url),'utf8')).split('\n')[0]);fact.room_id='1';const context=createHistoryContext({serverId:fact.server_id,roomId:'1'});assert.throws(()=>recoveryExpansionInput(fact,context,[]),/waiting_snapshot_reference/);const reference={type:'snapshot_ref',server_id:fact.server_id,room_id:'1',snapshot_id:fact.snapshot_ids[0],availability:'missing',result:null,object_id:null,sha256:null,reason:'captured'};assert.throws(()=>recoveryExpansionInput(fact,context,[{reference,value:null},{reference,value:null}]),/source_material_conflict/);
});
test('captured gift cache and retained adapter keys share a bounded compacted context',()=>{
 const input=repeated(1),context=createHistoryContext(source);context.connectionId=input.items[0].connection_id;context.loginAccountUid=input.items[0].login_account_uid;context.adapter.avatarsByUid.set('123','retained');input.items[0].snapshot_ids=['captured'];input.snapshots=[{snapshot_id:'captured',availability:'available',kind:'gift_config',requested_at:'2026-10-06T00:00:00Z',fetched_at:'2026-10-06T00:00:01Z',result:'success',failure_reason:null,raw_data:{list:Array.from({length:4096},(_,i)=>({id:i+1,img_basic:'captured'}))}}];const result=[...iterateRecoveryOutputs(input,context)];const next=result.at(-1).contextAfter;const keys=next.adapter.avatarsByUid.size+Object.values(next.projections).reduce((sum,p)=>sum+(p?.gifts.size??0),0);assert.ok(keys<=4096);assert.equal(context.adapter.avatarsByUid.size,1);assert.deepEqual(context.projections,{});
});
