export function projectTextMembers(runtime, config, records, project) {
  const local={messages:[],messagesBuffer:[],smoothedMessageQueue:[]};
  for(const name of ['forEachRecentMessage','mergeSimilarText'])local[name]=runtime.sourceMethods[name].bind(local);
  for(const rec of records) {
    if(rec.deleted||rec.mainExpired||rec.nativeTextHidden)continue;
    const m=project(rec.event,config);if(!m)continue;
    m._recordIds=[rec.id];if(rec.addTime!==undefined)m.addTime=new Date(rec.addTime);if(rec.isDelete)m.isDelete=true;
    const merged=runtime.merge(m,local);
    if(merged)merged._recordIds.push(rec.id);else local.messages.push(m);
  }
  return local.messages;
}
/** A bounded text-only transaction. Nontext rows are read-only search positions.
 * Historical associations outlive consumed control barriers: never replay unaffected groups.
 */
export function planTextReconciliation(runtime, config, project) {
  const r=runtime.renderer, now=runtime.now(), updates=new Map(), groups=new Map(), locations=new Map();
  for(const [lane,rows] of [['main',r.messages],['buffer',r.messagesBuffer],['queue',r.smoothedMessageQueue.flat()]])
    for(const m of rows)if(m.sourceKind==='text')for(const id of m._recordIds||[m.id])locations.set(id,{m,lane});
  for(const rec of runtime.records.values()) {
    if(rec.event.method!=='onAddText'||runtime.inFlight?.pending.has(rec.id))continue;
    const next={...rec}, allowed=runtime.nativeTextAllowed(rec,config);updates.set(rec.id,next);
    next.nativeTextHidden=!allowed;
    if(!allowed&&!next.delivered){next.addTime??=now;next.delivered=true;next.restorationLane='main';}
    const key=rec.groupId??rec.id;let group=groups.get(key);
    if(!group){group={key,records:[],old:new Set(),lanes:new Set(),changed:false};groups.set(key,group);}
    group.records.push(next);const loc=locations.get(rec.id);if(loc){group.old.add(loc.m);group.lanes.add(loc.lane);group.lane=loc.lane;}
    if(Boolean(rec.nativeTextHidden)!==!allowed)group.changed=true;
  }
  const replacements=new Map(), additions=[];
  const context=()=>{
    const v={messages:[],messagesBuffer:[],smoothedMessageQueue:[]};
    for(const name of ['forEachRecentMessage','mergeSimilarText'])v[name]=runtime.sourceMethods[name].bind(v);
    return v;
  };
  // Each changed historical group is rebuilt locally, with the actual source text algorithm.
  for(const group of groups.values()) {
    if(!group.changed)continue;
    const rows=projectTextMembers(runtime,config,group.records,project);
    const olds=[...group.old];
    if(group.lanes.size>1)throw new Error('OpenLive historical text group spans lanes; reconciliation cannot prove its destination');
    if(olds.length){replacements.set(olds[0],rows);for(const old of olds.slice(1))replacements.set(old,[]);}
    else for(const m of rows){const rec=updates.get(m.id);additions.push({m,lane:rec.restorationLane||rec.lane||'main',fresh:rec.groupId===undefined});}
  }
  const replace=rows=>rows.flatMap(m=>replacements.has(m)?replacements.get(m):[m]);
  const v=context();v.messages=replace(Array.from(r.messages));v.messagesBuffer=replace(Array.from(r.messagesBuffer));
  v.smoothedMessageQueue=Array.from(r.smoothedMessageQueue,group=>replace(Array.from(group))).filter(group=>group.length);
  // Copy-on-write text search candidates. Failed searches retain original object identity.
  const originals=new Map(),touched=new Set();
  const shadow=m=>{if(m.sourceKind!=='text')return m;const clone={...m,_recordIds:[...(m._recordIds||[m.id])]};originals.set(clone,m);return clone;};
  v.messages=v.messages.map(shadow);v.messagesBuffer=v.messagesBuffer.map(shadow);v.smoothedMessageQueue=v.smoothedMessageQueue.map(group=>group.map(shadow));
  const sequence=m=>runtime.records.get((m._recordIds||[m.id])[0])?.sequence??Infinity;
  for(const {m,lane,fresh} of additions.sort((a,b)=>sequence(a.m)-sequence(b.m))) {
    const target=fresh?runtime.merge(m,v):null;
    if(target){
      touched.add(target);target._recordIds.push(...m._recordIds);
      const root=updates.get(target.id)||runtime.records.get(target.id);
      for(const id of m._recordIds){const rec=updates.get(id);rec.groupId=root?.groupId??target.id;
        if(target.addTime){rec.addTime??=+target.addTime;rec.delivered=true;}}
    }else{
      const list=lane==='buffer'?v.messagesBuffer:lane==='queue'?null:v.messages;
      if(list){const at=list.findIndex(row=>sequence(row)>sequence(m));list.splice(at<0?list.length:at,0,m);}
      else v.smoothedMessageQueue.push([m]);
      for(const id of m._recordIds){const rec=updates.get(id);rec.groupId??=m.id;}
    }
  }
  const unshadow=m=>originals.has(m)&&!touched.has(m)?originals.get(m):m;
  v.messages=v.messages.map(unshadow);v.messagesBuffer=v.messagesBuffer.map(unshadow);v.smoothedMessageQueue=v.smoothedMessageQueue.map(group=>group.map(unshadow));
  const fades=[];
  // Only newly restored/split main rows trigger capacity treatment; hiding never trims unrelated rows.
  if(v.messages.length>r.messages.length){
    const excess=Math.max(v.messages.length-config.maxNumber,0);
    if(config.fadeOutNum>0)fades.push(...v.messages.slice(0,excess));
    const remove=Math.max(v.messages.length-config.maxNumber-config.fadeOutNum,0);
    for(const m of v.messages.splice(0,remove))for(const id of m._recordIds||[m.id]){
      const rec=updates.get(id)||runtime.records.get(id);if(rec)updates.set(id,{...rec,mainExpired:true});
    }
  }
  return {updates,messages:v.messages,messagesBuffer:v.messagesBuffer,smoothedMessageQueue:v.smoothedMessageQueue,fades};
}
