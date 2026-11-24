import test from 'node:test';
import assert from 'node:assert/strict';
import approved from '../src/compat/blivechat/approvedPreviewSamples.json' with {type:'json'};
import {readFileSync} from 'node:fs';
import {BLIVECHAT_FIXED_PREVIEW_SAMPLES} from '../src/compat/blivechat/previewSamples.mjs';
import {createBlivechatFixedPreviewRecords,prepareBlivechatPreviewRecords} from '../src/compat/blivechat/previewRecords.mjs';
const fixturePath=path=>path.replace(/^blivechat-fixtures\//,'blc-original/').replace(/^openlive-fixtures\//,'blc-open/');
const read=path=>JSON.parse(readFileSync(new URL('./fixtures/compat/'+fixturePath(path),import.meta.url))).events;
const payload=record=>record.payload??record.data;
for(const mode of ['blivechat','blivechat-open'])test(`${mode}原始素材保留来源字段，静态预览使用已审核清单顺序`,()=>{
 const manifests=BLIVECHAT_FIXED_PREVIEW_SAMPLES[mode],last=new Map(),seen=new Set();
 for(const sample of manifests){const [file,id]=sample.source.split('#');const rows=read(file);const index=rows.findIndex(row=>payload(row)?.id===id);assert(index>=0,sample.source);assert.deepEqual(sample.record,rows[index],sample.source);assert.equal(payload(sample.record).id,id);assert(index>(last.get(file)??-1),'来源顺序');last.set(file,index);assert(!seen.has(id));seen.add(id);}
 const records=createBlivechatFixedPreviewRecords(mode);
 assert.deepEqual(records.map(record=>[record.method,payload(record)?.id]),approved[mode].static.map(record=>[record.method,payload(record)?.id]));
 assert(records.every(record=>!payload(record)?.blindGiftName));
});
