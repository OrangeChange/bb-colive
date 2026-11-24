import fs from 'node:fs';
const data=record=>record.payload??record.data;
const output={},gaps={};
for(const [mode,folder]of[['blivechat','blivechat'],['blivechat-open','openlive']]){
 const file=`tests/fixtures/compat/${folder==='blivechat'?'blc-original':'blc-open'}/original-fixed-batch.json`,events=JSON.parse(fs.readFileSync(new URL('../'+file,import.meta.url))).events;
 const selected=new Map();const missing=[];
 const choose=(label,predicate)=>{const index=events.findIndex(predicate);if(index<0){missing.push(label);return;}const existing=selected.get(index);if(existing)existing.coverage.push(label);else selected.set(index,{source:file+'#'+data(events[index]).id,coverage:[label],record:structuredClone(events[index])});};
 const text=predicate=>record=>record.method==='onAddText'&&predicate(data(record));
 choose('first-text',text(()=>true));
 choose('inline-emote-token',text(item=>!item.emoticon&&(mode==='blivechat-open'
  ? Object.keys(item.emotes??{}).some(token=>String(item.content).includes(token)) || item.richContent?.some(part=>part.type===1)
  : ['[吃瓜]','[妙啊]','[dog]'].some(token=>String(item.content).includes(token)))));
 choose('large-emote',text(item=>Boolean(item.emoticon)));
 if(mode==='blivechat-open'){
  // 来源表中的 162×162 大表情，补足横幅以外的显示形态。
  for(const id of ['fc88c0ce96a425fd2f8c2eb3774781e8','19fd468f386395a20db68217f384b3bb'])
   choose('large-emote-square:'+id,text(item=>item.id===id));
 }
 const longest=events.filter(text(item=>!item.emoticon)).sort((a,b)=>String(data(b).content).length-String(data(a).content).length)[0];
 if(longest)choose('long-text',record=>record===longest);
 for(const role of[0,1,2,3])choose('author-type-'+role,text(item=>item.authorType===role));
 for(const rank of[0,1,2,3])choose('guard-level-'+rank,text(item=>item.privilegeType===rank));
 for(const role of[2,3])choose('combined-author-'+role,text(item=>item.authorType===role&&item.privilegeType>0));
 choose('medal',text(item=>item.medalLevel>0&&Boolean(item.medalName)));
 choose('fan-group',text(item=>item.isFanGroup===true));
 for(const name of new Set(events.filter(r=>r.method==='onAddGift').map(r=>data(r).giftName)))choose('gift:'+name,r=>r.method==='onAddGift'&&data(r).giftName===name);
 for(const price of new Set(events.filter(r=>r.method==='onAddSuperChat').map(r=>data(r).price)))choose('superchat:'+price,r=>r.method==='onAddSuperChat'&&data(r).price===price);
 for(const rank of[3,2,1])choose('membership:'+rank,r=>r.method==='onAddMember'&&data(r).privilegeType===rank);
 output[mode]=[...selected].sort(([a],[b])=>a-b).map(([,sample])=>sample);
 if(mode==='blivechat-open'){
  const likeFile='tests/fixtures/compat/blc-open/constructed-like-batch.json';
  for(const record of JSON.parse(fs.readFileSync(new URL('../'+likeFile,import.meta.url))).events.slice(-1))output[mode].push({source:likeFile+'#'+data(record).id,coverage:['qa-like'],record:structuredClone(record)});
 }
 gaps[mode]=[...missing,...(events.some(r=>data(r)?.blindGiftName)?[]:['blind-gift']),...(mode==='blivechat'?['inline-emote-image']:[])];
}
fs.writeFileSync(new URL('../src/compat/blivechat/previewSamples.mjs',import.meta.url),'/** 各版既有回调的有限子集，保留完整字段及来源顺序。 */\nexport const BLIVECHAT_FIXED_PREVIEW_SAMPLES = '+JSON.stringify(output,null,2)+';\n\nexport const BLIVECHAT_PREVIEW_SAMPLE_GAPS = '+JSON.stringify(gaps,null,2)+';\n');
console.log(JSON.stringify({counts:Object.fromEntries(Object.entries(output).map(([mode,rows])=>[mode,rows.length])),gaps}));
