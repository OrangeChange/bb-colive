import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureBytes, goldenRoot, goldenRootBytes, sha } from './recoveryFixtureUtils.mjs';
const api=await import('../src/cloudSync/recoveryValidation.ts').catch(()=>({}));
test('recovery validation exports a real frozen-schema consumer',()=>assert.equal(typeof api.readRecoveryJSON,'function'));
test('both exact golden roots preserve unsafe room identity and cut pairing',async()=>{
  for(const mode of ['baseline','delta']){const bytes=goldenRootBytes(mode);const r=await api.readRecoveryJSON(bytes,'Root',sha(bytes));assert.equal(r.room_id,'9007199254740993');assert.equal(r.mode,mode);assert.equal(r.cut.event_head,mode==='baseline'?'3':'5');}
});
test('root identity, full delta base and bigint constraints reject incompatible pairing',()=>{
  for(const mutate of [r=>r.cut.room_id='1',r=>r.from_cut.event_head='6',r=>r.from_cut.server_id='00000000-0000-4000-8000-000000000099',r=>r.room_id='9223372036854775808',r=>r.counts.facts='02',r=>r.extra=true]){const r=goldenRoot('delta');mutate(r);assert.throws(()=>api.validateRecovery('Root',r));}
});
test('hash check precedes parse; JSON framing rejects BOM CRLF and missing final LF',async()=>{
  const bytes=goldenRootBytes('baseline');await assert.rejects(()=>api.readRecoveryJSON(bytes,'Root','0'.repeat(64)),/hash_mismatch/);
  for(const b of [Uint8Array.from([239,187,191,...bytes]),new TextEncoder().encode(new TextDecoder().decode(bytes).replace(/\n$/,'\r\n')),bytes.slice(0,-1)])await assert.rejects(()=>api.readRecoveryJSON(b,'Root',sha(b)),/invalid_serialization/);
});
test('0.2 root is explicitly incompatible with the current 0.3 contract',async()=>{
  const bytes=fixtureBytes('baseline','root.json');
  await assert.rejects(()=>api.readRecoveryJSON(bytes,'Root',sha(bytes)),/invalid_schema/);
});
test('schema permits unknown raw JSON fields but rejects unknown DTO fields',()=>{
  const fact=JSON.parse(new TextDecoder().decode(fixtureBytes('baseline','objects/00000000-0000-4000-8000-000000000100.data')).split('\n')[0]);fact.raw_payload.value.future={opaque:'9007199254740993'};assert.equal(api.validateRecovery('Fact',fact).raw_payload.value.future.opaque,'9007199254740993');fact.future=true;assert.throws(()=>api.validateRecovery('Fact',fact),/invalid_schema/);
});
test('limits and calendar values cannot bypass actual client bounds',()=>{
  for(const mutate of [r=>r.limits.prefetch_chunks=200,r=>r.limits.chunk_max_bytes=2097153,r=>r.limits.catalog_fanout=65,r=>r.limits.job_max_bytes=r.limits.global_max_bytes+1,r=>r.created_at='2026-02-30T19:00:00.000Z']){const r=goldenRoot('baseline');mutate(r);assert.throws(()=>api.validateRecovery('Root',r));}
});

