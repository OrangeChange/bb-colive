import test from 'node:test';import assert from 'node:assert/strict';
import { goldenRoot,goldenFetch,SqliteCatalogIndex,sha } from './recoveryFixtureUtils.mjs';
const api=await import('../src/cloudSync/recoveryCatalog.ts').catch(()=>({}));
test('catalog consumer exists',()=>assert.equal(typeof api.walkRecoveryCatalog,'function'));
test('golden trees validate every exact descriptor and forward snapshot reference in a SQLite index',async()=>{
  for(const mode of ['baseline','delta']){const index=new SqliteCatalogIndex();try{const r=await api.walkRecoveryCatalog(goldenRoot(mode),goldenFetch(mode),index);assert.equal(r.objects,mode==='baseline'?3:4);assert.equal(r.catalogNodes,mode==='baseline'?3:6);const refs=[];for await(const ref of index.snapshots())refs.push(ref);assert.equal(refs[0].snapshot_id,'00000000-0000-4000-8000-000000000004');}finally{index.close();}}
});
test('catalog bytes are checked before parsing and duplicate/cyclic node IDs fail',async()=>{
  const root=goldenRoot('baseline'),fetch=goldenFetch('baseline');let index=new SqliteCatalogIndex();try{await assert.rejects(()=>api.walkRecoveryCatalog(root,async ref=>{const b=await fetch(ref);b[0]=33;return b;},index),/hash_mismatch/);}finally{index.close();}
  const bytes=new TextEncoder().encode(JSON.stringify({kind:'catalog_index',level:1,children:[{...root.catalog_root,level:0,kind:'catalog_leaf'}]})+'\n');root.catalog_root={...root.catalog_root,byte_size:String(bytes.length),sha256:sha(bytes)};index=new SqliteCatalogIndex();try{await assert.rejects(()=>api.walkRecoveryCatalog(root,async()=>bytes,index),/invalid_catalog/);}finally{index.close();}
});
test('declared objects reject lying chunk totals and snapshot bindings',async()=>{
  for(const change of [leaf=>leaf.entries[0].chunks[0].byte_size++,leaf=>leaf.entries.push({...leaf.entries[0],object_id:'00000000-0000-4000-8000-000000000099',stream_ordinal:2}),leaf=>leaf.entries.push({type:'snapshot_ref',server_id:'00000000-0000-4000-8000-000000000001',room_id:'1',snapshot_id:'00000000-0000-4000-8000-000000000004',availability:'available',result:'success',object_id:leaf.entries[0].object_id,sha256:leaf.entries[0].sha256,reason:null})]){
    const root=goldenRoot('baseline');const bytes=await goldenFetch('baseline')({...root.catalog_root,object_id:'00000000-0000-4000-8000-000000000103'});const leaf=JSON.parse(new TextDecoder().decode(bytes));change(leaf);const b=new TextEncoder().encode(JSON.stringify(leaf)+'\n');root.catalog_root={object_id:'00000000-0000-4000-8000-000000000103',kind:'catalog_leaf',level:0,byte_size:String(b.length),sha256:sha(b),chunk_count:1};root.limits.catalog_fanout=64;const index=new SqliteCatalogIndex();try{await assert.rejects(()=>api.walkRecoveryCatalog(root,async()=>b,index),/invalid_catalog/);}finally{index.close();}
  }
});

