import test from 'node:test';import assert from 'node:assert/strict';
import { fixtureBytes,sha } from './recoveryFixtureUtils.mjs';
const api=await import('../src/cloudSync/recoveryDecoder.ts').catch(()=>({}));
const encoder=new TextEncoder();
async function decode(bytes,kind='facts',options={}){const object={objectId:'00000000-0000-4000-8000-000000000100',sha256:sha(bytes),byteSize:String(bytes.length),cacheHandle:'fixture:verified',kind,streamId:kind,streamOrdinal:0,verified:true};const rows=[];for await(const r of api.decodeRecoveryLines(object,async(_,offset,max)=>bytes.slice(Number(offset),Number(offset)+Math.min(47,max)),options))rows.push(r);return rows;}
test('typed exact-byte decoder exists',()=>assert.equal(typeof api.decodeRecoveryLines,'function'));

test('无新事件的恢复允许空 NDJSON 流，但快照必须包含 JSON',async()=>{
  for(const kind of ['facts','baseline','effects'])assert.deepEqual(await decode(new Uint8Array(),kind),[]);
  await assert.rejects(()=>decode(new Uint8Array(),'snapshot'),/invalid_object|invalid_serialization/);
});
test('47-byte splits preserve UTF8 rows raw offsets and per-line exact digests',async()=>{
  const bytes=fixtureBytes('baseline','objects/00000000-0000-4000-8000-000000000100.data');const rows=await decode(bytes);assert.equal(rows.length,3);assert.deepEqual(rows.map(r=>r.value.server_sequence),['1','2','3']);assert.equal(rows[0].value.room_id,'9007199254740993');assert.equal(rows[0].status,'validated');let start=0;for(const r of rows){const end=bytes.indexOf(10,start)+1;assert.equal(r.raw.byteOffset,String(start));assert.equal(r.raw.byteLength,String(end-start));assert.equal(r.raw.sha256,sha(bytes.slice(start,end)));assert.equal(r.raw.cacheHandle,'fixture:verified');start=end;}
});
test('binary outer context remains available; verified unsupported protocol remains pending and later facts keep their raw material',async()=>{
  const rows=await decode(fixtureBytes('delta','objects/00000000-0000-4000-8000-000000000200.data'));assert.equal(rows[0].value.raw_payload.kind,'binary');assert.ok('outer' in rows[0].value.raw_payload);
  const fact=rows[0].value;fact.protocol_version=999;const result=await decode(encoder.encode(JSON.stringify(fact)+'\n'+JSON.stringify(rows[1].value)+'\n'));assert.equal(result.length,2);assert.equal(result[1].status,'validated');assert.equal(result[0].status,'unsupported');assert.equal(result[0].failureCode,'unsupported_protocol');assert.ok(result[0].raw.sha256);
});
test('unknown effect retains raw failure provenance without application success',async()=>{const rows=await decode(encoder.encode('{"effect_index":0,"basis_event_head":"5","type":"future"}\n'),'effects');assert.equal(rows[0].status,'unsupported');assert.equal(rows[0].failureCode,'unsupported_effect');assert.equal(rows[0].value,null);});
test('invalid source JSON retains a durable-copyable raw span',async()=>{const rows=await decode(encoder.encode('{broken}\n'));assert.equal(rows[0].status,'invalid');assert.equal(rows[0].failureCode,'invalid_json');assert.equal(rows[0].raw.byteLength,'9');});
test('bad framing UTF8 and over-limit lines reject before JSON decoding',async()=>{
  for(const b of [encoder.encode('{}'),encoder.encode('{}\r\n'),Uint8Array.from([239,187,191,123,125,10]),Uint8Array.from([123,34,255,34,58,48,125,10])])await assert.rejects(()=>decode(b),/invalid_serialization|invalid_utf8/);
  await assert.rejects(()=>decode(encoder.encode(' '.repeat(128)+'\n'),'facts',{maxLineBytes:128}),/decode_limit_exceeded/);
});
test('a fact spanning consecutive objects has one exact digest and bounded source segments',async()=>{
  const bytes=fixtureBytes('baseline','objects/00000000-0000-4000-8000-000000000100.data'),cut=bytes.indexOf(10)-3,parts=[bytes.slice(0,cut),bytes.slice(cut)],objects=parts.map((b,i)=>({objectId:`00000000-0000-4000-8000-00000000010${i}`,sha256:sha(b),byteSize:String(b.length),cacheHandle:`part:${i}`,kind:'facts',streamId:'facts',streamOrdinal:i,verified:true}));
  const rows=[];for await(const row of api.decodeRecoveryStream((async function*(){yield*objects;})(),async(handle,offset,max)=>parts[Number(handle.slice(-1))].slice(Number(offset),Number(offset)+Math.min(47,max))))rows.push(row);
  assert.equal(rows.length,3);assert.equal(rows[0].raw.segments.length,2);assert.equal(rows[0].raw.segments[1].byteOffset,'0');assert.equal(rows[0].raw.sha256,sha(bytes.slice(0,bytes.indexOf(10)+1)));
});
test('actual 16MiB+1 line is rejected with bounded slices; snapshot rejects a second JSON row',async()=>{
  const bytes=new Uint8Array(16777217).fill(32);bytes[bytes.length-1]=10;const object={objectId:'00000000-0000-4000-8000-000000000100',sha256:sha(bytes),byteSize:String(bytes.length),cacheHandle:'large',kind:'facts',streamId:'facts',streamOrdinal:0,verified:true};
  await assert.rejects(async()=>{for await(const _ of api.decodeRecoveryLines(object,async(_,off,max)=>bytes.slice(Number(off),Number(off)+max))){}},/decode_limit_exceeded/);
  const snapshot=fixtureBytes('baseline','objects/00000000-0000-4000-8000-000000000102.data');const two=new Uint8Array(snapshot.length*2);two.set(snapshot);two.set(snapshot,snapshot.length);await assert.rejects(()=>decode(two,'snapshot'),/invalid_serialization/);
});
test('fact ordering and frozen source boundary cannot be silently coerced',async()=>{
  const bytes=fixtureBytes('baseline','objects/00000000-0000-4000-8000-000000000100.data'),lines=new TextDecoder().decode(bytes).trimEnd().split('\n');
  await assert.rejects(()=>decode(encoder.encode(lines[1]+'\n'+lines[0]+'\n'),'facts',{serverId:'00000000-0000-4000-8000-000000000001',roomId:'9007199254740993',eventFrom:'0',eventThrough:'3'}),/invalid_stream_order/);
});

test('unsupported protocol still obeys source identity, cut and strict sequence order',async()=>{
 const rows=await decode(fixtureBytes('baseline','objects/00000000-0000-4000-8000-000000000100.data'));
 const fact={...rows[0].value,protocol_version:999};
 const encode=value=>encoder.encode(JSON.stringify(value)+'\n');
 await assert.rejects(()=>decode(encode(fact),'facts',{serverId:'00000000-0000-4000-8000-000000000099'}),/invalid_stream_order/);
 await assert.rejects(()=>decode(encode(fact),'facts',{eventThrough:'0'}),/invalid_stream_order/);
 await assert.rejects(()=>decode(encoder.encode(JSON.stringify(fact)+'\n'+JSON.stringify(rows[0].value)+'\n')),/invalid_stream_order/);
});
test('native material resume reads only the committed suffix and retains line and sequence identity',async()=>{
 const bytes=fixtureBytes('baseline','objects/00000000-0000-4000-8000-000000000100.data'),original=await decode(bytes),offset=BigInt(original[0].raw.byteOffset)+BigInt(original[0].raw.byteLength),reads=[];
 const object={objectId:'resume-object',sha256:sha(bytes),byteSize:String(bytes.length),cacheHandle:'resume-cache',kind:'facts',streamId:'facts',streamOrdinal:0,verified:true};
 const rows=[];for await(const row of api.decodeRecoveryLines(object,async(handle,at,max)=>{reads.push(BigInt(at));return bytes.slice(Number(at),Number(at)+Math.min(47,max));},{resume:{kind:'facts',streamId:'facts',streamOrdinal:0,byteOffset:String(offset),lineIndex:'1',previousSequence:'1'}}))rows.push(row);
 assert.deepEqual(rows.map(row=>row.value.server_sequence),['2','3']);assert.deepEqual(rows.map(row=>row.raw.lineIndex),['1','2']);assert.ok(reads.every(at=>at>=offset));assert.deepEqual(rows.map(row=>row.raw.sha256),original.slice(1).map(row=>row.raw.sha256));
});
test('native material resume rejects object/stream/offset drift and enforces predecessor sequence',async()=>{
 const bytes=fixtureBytes('baseline','objects/00000000-0000-4000-8000-000000000100.data'),base={kind:'facts',streamId:'facts',streamOrdinal:0,byteOffset:'0',lineIndex:'1',previousSequence:'0'};
 for(const drift of [{streamId:'effects'},{streamOrdinal:1},{byteOffset:String(bytes.length+1)},{lineIndex:'-1'}])await assert.rejects(()=>decode(bytes,'facts',{resume:{...base,...drift}}),/invalid_material_resume/);
 await assert.rejects(()=>decode(bytes,'facts',{resume:{...base,previousSequence:'2'}}),/invalid_stream_order/);
});

test('exact 16MiB fact line remains readable with bounded slices and exact provenance',async()=>{
 const original=fixtureBytes('baseline','objects/00000000-0000-4000-8000-000000000100.data');
 const fact=original.slice(0,original.indexOf(10));const bytes=new Uint8Array(16777216).fill(32);bytes.set(fact);bytes[bytes.length-1]=10;
 const object={objectId:'capacity-original',sha256:sha(bytes),byteSize:String(bytes.length),cacheHandle:'exact-capacity',kind:'facts',streamId:'facts',streamOrdinal:0,verified:true};let maximum=0,count=0;
 for await(const row of api.decodeRecoveryLines(object,async(_,offset,limit)=>{maximum=Math.max(maximum,limit);return bytes.slice(Number(offset),Number(offset)+limit);})){count++;assert.equal(row.status,'validated');assert.equal(row.raw.byteLength,'16777216');assert.equal(row.raw.sha256,object.sha256);assert.equal(row.value.server_sequence,'1');}
 assert.equal(count,1);assert.ok(maximum<=65536);
});

