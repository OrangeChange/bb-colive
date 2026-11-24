import type { HistoryContext, HistoryPageInput, HistoryOutputDraft } from './cloudHistoryTypes.ts';
import { prepareHistoryExpansion, parseHistoryPage } from './cloudHistoryParser.ts';
import { adapt } from '../protocol/adapter.ts';
import { b64ToBytes } from '../protocol/proto.ts';
import { cloneHistoryContext, encodeHistoryContext } from './cloudHistoryContext.ts';
import type { Fact, Snapshot, SnapshotRef } from './recoveryContract.ts';
import { validateRecovery } from './recoveryValidation.ts';
export interface CapturedRecoverySnapshot { reference: SnapshotRef; value: Snapshot | null }
export function recoveryExpansionInput(fact: Fact, context: HistoryContext,
  captures: readonly CapturedRecoverySnapshot[], options: { preserveUnsupported?: boolean } = {}): HistoryPageInput {
  validateRecovery('Fact',fact);
  if(fact.protocol_version!==3&&!options.preserveUnsupported)throw new Error('waiting_unsupported_protocol');
  if(fact.server_id!==context.source.serverId||fact.room_id!==context.source.roomId)throw new Error('source_identity_conflict');
  if(fact.snapshot_ids.length>128||captures.length>128)throw new Error('waiting_snapshot_capacity');
  const snapshots:HistoryPageInput['snapshots']=[];
  const capturedIds=new Set<string>();
  for(const capture of captures){const r=capture.reference;validateRecovery('SnapshotRef',r);if(r.server_id!==fact.server_id||r.room_id!==fact.room_id||!fact.snapshot_ids.includes(r.snapshot_id))throw new Error('source_identity_conflict');
    if(capturedIds.has(r.snapshot_id))throw new Error('source_material_conflict');capturedIds.add(r.snapshot_id);
    if(r.availability==='expired')snapshots.push({snapshot_id:r.snapshot_id,availability:'expired'});
    else if(r.availability==='available'){const value=capture.value;if(!value)throw new Error('waiting_snapshot_material');validateRecovery('Snapshot',value);if(value.server_id!==fact.server_id||value.room_id!==fact.room_id||value.snapshot_id!==r.snapshot_id||value.result!==r.result)throw new Error('source_identity_conflict');snapshots.push({...value,availability:'available'});}
    else if(capture.value!==null)throw new Error('source_material_conflict');
  }
  if(fact.snapshot_ids.some(id=>!capturedIds.has(id)))throw new Error('waiting_snapshot_reference');
  const {server_session_id,...unchanged}=fact;
  return {boundary:{...context.source,expectedCursor:context.lastSequence,nextCursor:fact.server_sequence,metadataRevision:'0',scanAfter:context.lastSequence,scanThrough:fact.server_sequence,rangesComplete:true},items:[{...unchanged,session_id:server_session_id}],snapshots};
}
export interface RecoveryOutputPage {
  outputs: HistoryOutputDraft[]; nextOutputIndex: number; terminal: boolean;
  contextAfter: HistoryContext; expandedBytes: number;
}
function waiting(reason: string): never { throw new Error(reason); }
// Walk original protobuf fields, never decode the repeated gift array. Field 10
// is GiftItem in the vendored frozen SEND_GIFT_V2 protocol definition.
function* fields(bytes: Uint8Array): Generator<{ field: number; start: number; end: number }> {
  let pos=0;
  const varint=()=>{let value=0,shift=0;for(let count=0;count<10;count++){if(pos>=bytes.length)waiting('invalid_protobuf');const b=bytes[pos++];if(shift<35)value+=(b&127)*2**shift;else if(b&127)waiting('invalid_protobuf');if(!(b&128))return value;shift+=7;}return waiting('invalid_protobuf');};
  while(pos<bytes.length){const start=pos,tag=varint(),field=Math.floor(tag/8),wire=tag%8;if(!field)waiting('invalid_protobuf');switch(wire){case 0:while(pos<bytes.length&&bytes[pos++]&128){}if(bytes[pos-1]&128)waiting('invalid_protobuf');break;case 1:pos+=8;break;case 2:{const size=varint();pos+=size;break;}case 5:pos+=4;break;default:waiting('waiting_unsupported_protobuf_wire');}if(pos>bytes.length)waiting('invalid_protobuf');if(field===10&&wire!==2)waiting('invalid_protobuf');yield {field,start,end:pos};}
}
function base64(bytes:Uint8Array):string {let text='';for(let offset=0;offset<bytes.length;offset+=8192)text+=String.fromCharCode(...bytes.subarray(offset,offset+8192));return btoa(text);}
function contextKeyCount(context:HistoryContext):number {
  return [context.adapter.wealthByUid,context.adapter.avatarsByUid,context.adapter.guardIconUrlsByUid,context.adapter.wealthIconUrlsByLevel,...Object.values(context.projections).map(p=>p?.gifts)].reduce((sum,map)=>sum+(map?.size??0),0);
}
export function compactHistoryContext(context: HistoryContext, maximum = 4096): HistoryContext {
  const maps = [context.adapter.wealthByUid, context.adapter.avatarsByUid, context.adapter.guardIconUrlsByUid,
    context.adapter.wealthIconUrlsByLevel, ...Object.values(context.projections).map(projection => projection?.gifts).filter(Boolean)] as Map<unknown, unknown>[];
  while (contextKeyCount(context) > maximum) {
    const target = maps.reduce((largest, map) => map.size > largest.size ? map : largest, maps[0]);
    const oldest = target.keys().next();
    if (oldest.done) break;
    target.delete(oldest.value);
  }
  return context;
}
export function* iterateRecoveryOutputs(input: HistoryPageInput, context: HistoryContext,
  options: { after?: number; maxRows?: number; maxBytes?: number } = {}): Generator<RecoveryOutputPage> {
  const after=options.after??0,maxRows=options.maxRows??256,maxBytes=options.maxBytes??2097152;
  if(!Number.isSafeInteger(after)||after<0||!Number.isSafeInteger(maxRows)||maxRows<1||maxRows>256||!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>2097152)waiting('invalid_output_budget');
  const {item,candidate,runtime}=prepareHistoryExpansion(input,context);
  compactHistoryContext(candidate);
  const raw=item.raw_payload.kind==='json'?item.raw_payload.value as {cmd?:string;data?:{pb?:string}}:null;
  const command=raw?.cmd?.split(':')[0];let index=0;let outputs:HistoryOutputDraft[]=[],expandedBytes=0;
  const encoder=new TextEncoder();
  const contextAfter=()=>{candidate.lastSequence=input.boundary.nextCursor;compactHistoryContext(candidate);if(encoder.encode(encodeHistoryContext(candidate)).length>2097152)waiting('waiting_context_expansion');return cloneHistoryContext(candidate);};
  function* events(){
    if(command!=='SEND_GIFT_V2'){const parsed=parseHistoryPage(input,context);Object.assign(candidate,parsed.nextContext);for(const output of parsed.records[0].outputs)yield output.event;return;}
    if(typeof raw?.data?.pb!=='string'||!raw.data.pb)waiting('waiting_missing_protobuf');
    const bytes=b64ToBytes(raw.data.pb);if(bytes.length>16777216)waiting('raw_fact_limit');
    const headerParts:Uint8Array[]=[];let size=0;
    for(const part of fields(bytes))if(part.field!==10){size+=part.end-part.start;if(size>maxBytes||headerParts.length>=4096)waiting('waiting_context_expansion');headerParts.push(bytes.subarray(part.start,part.end));}
    const header=new Uint8Array(size);let offset=0;for(const part of headerParts){header.set(part,offset);offset+=part.length;}
    for(const part of fields(bytes))if(part.field===10){const gift=bytes.subarray(part.start,part.end);if(size+gift.length>maxBytes)waiting('waiting_output_expansion');const one=new Uint8Array(size+gift.length);one.set(header);one.set(gift,size);
      const event=adapt({cmd:raw.cmd,data:{pb:base64(one)}},candidate.adapter,runtime);if(event===null||Array.isArray(event))waiting('invalid_output_expansion');yield event;
    }
  }
  for(const event of events()){
    const output={outputIndex:index,outputKey:JSON.stringify(['cloud-output',item.server_id,item.room_id,item.server_sequence,index]),event};index++;
    if(index<=after)continue;
    const bytes=encoder.encode(JSON.stringify(output)).length;if(bytes>maxBytes)waiting('waiting_output_expansion');
    if(outputs.length&&(outputs.length===maxRows||expandedBytes+bytes>maxBytes)){yield {outputs,nextOutputIndex:index-1,terminal:false,contextAfter:contextAfter(),expandedBytes};outputs=[];expandedBytes=0;}
    outputs.push(output);expandedBytes+=bytes;
  }
  if(after>index)waiting('invalid_output_cursor');
  yield {outputs,nextOutputIndex:index,terminal:true,contextAfter:contextAfter(),expandedBytes};
}
