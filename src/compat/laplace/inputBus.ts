import type { ConnStatus, DanmakuEvent } from '../../protocol/types.ts';
import { MsgType } from '../../protocol/eventTypeCodes.ts';
import { laplaceSourceIdentity, projectLaplaceEvent } from './projection.ts';
import { DEFAULT_LAPLACE_RETENTION, laplaceRecordBytes, validateLaplaceRetention } from './retention.ts';
import type { LaplaceInputNotification, LaplaceInputRecord, LaplaceInputScope, LaplaceInputSnapshot, LaplaceRetentionPolicy } from './types.ts';

/** Reconcile deltas without rereading/cloning full retained history on each
 * arrival. Consumers own their copies; the bus never exposes mutable records. */
export function applyLaplaceInputNotification(snapshot: LaplaceInputSnapshot, notice: LaplaceInputNotification): LaplaceInputSnapshot {
  if (notice.type==='reset') return structuredClone(notice.snapshot);
  if (notice.generation<snapshot.generation || notice.revision<=snapshot.revision) return snapshot;
  const bySequence=new Map((notice.generation===snapshot.generation?snapshot.records:[]).map(r=>[r.sequence,r]));
  for(const sequence of notice.removedSequences)bySequence.delete(sequence);
  for(const record of notice.records)bySequence.set(record.sequence,record);
  return {roomId:notice.roomId,generation:notice.generation,revision:notice.revision,
    records:[...bySequence.values()].sort((a,b)=>a.sequence-b.sequence),retention:notice.retention};
}
/** Bounded unmerged post-dedupe input. Byte costs are calculated only for new or
 * changed records, and notification copies contain deltas, never whole history.
 * Every retained object and index is removed on clear/epoch change/eviction. */
export function createLaplaceInputBus(policyInput: LaplaceRetentionPolicy = DEFAULT_LAPLACE_RETENTION) {
  const policy=validateLaplaceRetention(policyInput);
  let roomId:number|null=null,generation=0,revision=0,sequence=0,totalBytes=0,evictedRecords=0,rejectedOversizeRecords=0;
  const records=new Map<number,LaplaceInputRecord>();
  const sizes=new Map<number,number>();
  const scSequences=new Map<string,Set<number>>();
  const activitySequences=new Map<string,Set<number>>();
  const tombstoneSequences=new Map<string,Set<number>>();
  const tombstoneKeys=new Map<number,string[]>();
  const listeners=new Set<(notification:LaplaceInputNotification)=>void>();
  let expiry:ReturnType<typeof setTimeout>|undefined;
  let expiryDeadline=Infinity;
  let lastConnectionStatus:ConnStatus|undefined;
  const retention=()=>({configured:true,policy:{...policy},retainedBytes:totalBytes,evictedRecords,rejectedOversizeRecords});
  const snapshot=():LaplaceInputSnapshot=>structuredClone({roomId,generation,revision,records:[...records.values()],retention:retention()});
  const pendingNotifications:LaplaceInputNotification[]=[];
  let notifying=false;
  const notify=(type:'reset'|'batch'|'retention',changed:LaplaceInputRecord[]=[],removedSequences:number[]=[])=>{
    // Capture this mutation's scope/revision before any listener can publish or
    // reset reentrantly. Deliver every delta FIFO; no later delta may overtake it.
    pendingNotifications.push(type==='reset'?{type,snapshot:snapshot()}:structuredClone({type,roomId,generation,revision,
      records:changed,removedSequences,retention:retention()}));
    if(notifying)return;
    notifying=true;
    try {
      while(pendingNotifications.length){
        const notification=pendingNotifications.shift()!;
        for(const listener of [...listeners])try { listener(structuredClone(notification)); }
        catch{/* isolates native and other consumers, including cloned records */}
      }
    }finally{notifying=false;}
  };
  const remove=(key:number,removed:number[])=>{
    const record=records.get(key);if(!record)return;
    records.delete(key);totalBytes-=sizes.get(key)??0;sizes.delete(key);removed.push(key);evictedRecords++;
    if(record.source.scIdentity){const set=scSequences.get(record.source.scIdentity);set?.delete(key);if(!set?.size)scSequences.delete(record.source.scIdentity);}
    if(record.source.activity){const identity=record.source.activity.identity,set=activitySequences.get(identity);set?.delete(key);if(!set?.size)activitySequences.delete(identity);}
    for(const identity of tombstoneKeys.get(key)??[]){const set=tombstoneSequences.get(identity);set?.delete(key);if(!set?.size)tombstoneSequences.delete(identity);}
    tombstoneKeys.delete(key);
  };
  const schedule=()=>{
    let next=Infinity;
    for(const record of records.values())next=Math.min(next,record.receivedAt+policy.maxAgeMs+1);
    if(next===expiryDeadline)return;
    if(expiry!==undefined)clearTimeout(expiry);
    expiry=undefined;expiryDeadline=next;
    if(!Number.isFinite(next))return;
    expiry=setTimeout(()=>{expiry=undefined;expiryDeadline=Infinity;prune(Date.now());},Math.max(1,Math.min(2_147_483_647,next-Date.now())));
    (expiry as unknown as {unref?:()=>void}).unref?.();
  };
  const reclaim=(now:number,removed:number[])=>{
    for(const [key,record] of records)if(record.receivedAt<now-policy.maxAgeMs)remove(key,removed);
    while(records.size>policy.maxRecords||totalBytes>policy.maxBytes)remove(records.keys().next().value!,removed);
  };
  const prune=(now=Date.now()):boolean=>{
    const removed:number[]=[];reclaim(now,removed);
    if(removed.length){revision++;notify('retention',[],removed);}
    schedule();return removed.length>0;
  };
  const forget=()=>{records.clear();sizes.clear();scSequences.clear();activitySequences.clear();tombstoneSequences.clear();tombstoneKeys.clear();totalBytes=0;
    if(expiry!==undefined)clearTimeout(expiry);expiry=undefined;expiryDeadline=Infinity;};
  const reset=(nextRoom:number|null,nextGeneration:number):boolean=>{
    if(nextGeneration<generation||nextGeneration===generation&&nextRoom===roomId)return false;
    forget();lastConnectionStatus=undefined;roomId=nextRoom;generation=nextGeneration;revision++;sequence=0;evictedRecords=0;rejectedOversizeRecords=0;notify('reset');return true;
  };
  const api = {
    snapshot,reset,prune,
    clear():void{forget();revision++;notify('reset');},
    begin(nextRoom:number|null):number{reset(nextRoom,generation+1);return generation;},
    subscribe(listener:(notification:LaplaceInputNotification)=>void):()=>void{listeners.add(listener);return()=>{listeners.delete(listener);};},
    publish(events:readonly DanmakuEvent[],scope:LaplaceInputScope,receivedAt=Date.now()):void{
      if(!Number.isFinite(receivedAt)||scope.generation<generation)return;
      if(scope.generation===generation&&scope.roomId!==roomId)return;
      if(scope.generation!==generation||roomId===null)reset(scope.roomId,scope.generation);
      // A reset listener may synchronously choose a newer room/generation.
      if(scope.generation!==generation||scope.roomId!==roomId)return;
      const changed=new Map<number,LaplaceInputRecord>(),removed:number[]=[];
      let attempted=false;
      for(const event of events){
        let record=projectLaplaceEvent(event,scope,sequence+1,receivedAt);if(!record)continue;
        attempted=true;sequence++;
        if(record.source.scIdentity){
          const identity=record.source.scIdentity;
          let deleted=tombstoneSequences.has(identity);
          // A retained SC is also deletion evidence after its delete tombstone
          // is evicted. Inherit before FIFO may evict that older SC on this add.
          // Reuse the bounded index; do not dedupe or keep permanent tombstones.
          if(!deleted)for(const retainedSequence of scSequences.get(identity)??[]){
            if(records.get(retainedSequence)?.event.deleted){deleted=true;break;}
          }
          if(deleted)record={...record,event:{...record.event,deleted:true}};
        }
        // Terminal control precedes whole-record oversize rejection and FIFO.
        // Every index member is a retained record; late TTL timers confer no
        // authority on expired evidence. No independent tombstone is kept.
        const activity=record.source.activity;
        if(activity){
          if(activity.phase==='end'){
            record={...record,source:{...record.source,activity:{...activity,terminal:true}}};
            for(const target of activitySequences.get(activity.identity)??[]){
              const original=records.get(target)!;
              if(original.receivedAt<receivedAt-policy.maxAgeMs || original.source.activity?.phase!=='start' || original.source.activity.terminal)continue;
              const update={...original,source:{...original.source,activity:{...original.source.activity,terminal:true}}};
              const size=laplaceRecordBytes(update);totalBytes+=size-(sizes.get(target)??0);sizes.set(target,size);records.set(target,update);changed.set(target,update);
            }
          }else for(const target of activitySequences.get(activity.identity)??[]){
            const evidence=records.get(target)!;
            if(evidence.receivedAt>=receivedAt-policy.maxAgeMs && evidence.source.activity?.terminal){
              record={...record,source:{...record.source,activity:{...activity,terminal:true}}};break;
            }
          }
        }
        const bytes=laplaceRecordBytes(record);
        if(bytes>policy.maxBytes){rejectedOversizeRecords++;continue;}
        records.set(sequence,record);sizes.set(sequence,bytes);totalBytes+=bytes;changed.set(sequence,record);
        if(record.source.scIdentity){const set=scSequences.get(record.source.scIdentity)??new Set<number>();set.add(sequence);scSequences.set(record.source.scIdentity,set);}
        if(record.source.activity){const identity=record.source.activity.identity,set=activitySequences.get(identity)??new Set<number>();set.add(sequence);activitySequences.set(identity,set);}
        if(record.event.type==='superchat-delete'){
          const keys:string[]=[];
          for(const id of record.event.ids??[]){
            const identity=laplaceSourceIdentity(scope,record.source.sourceMode,'sc',String(id));keys.push(identity);
            const tombstones=tombstoneSequences.get(identity)??new Set<number>();tombstones.add(sequence);tombstoneSequences.set(identity,tombstones);
            for(const target of scSequences.get(identity)??[]){
              const original=records.get(target)!;if(original.event.deleted)continue;
              const update={...original,event:{...original.event,deleted:true}};
              const size=laplaceRecordBytes(update);totalBytes+=size-(sizes.get(target)??0);sizes.set(target,size);records.set(target,update);changed.set(target,update);
            }
          }
          tombstoneKeys.set(sequence,keys);
        }
      }
      reclaim(receivedAt,removed);
      if(attempted||removed.length){revision++;for(const key of removed)changed.delete(key);notify('batch',[...changed.values()],removed);}
      schedule();
    },
    publishConnectionState(status:ConnStatus,scope:LaplaceInputScope,receivedAt=Date.now()):void {
      if(!['connected','reconnecting','closed'].includes(status) || lastConnectionStatus===status
        || scope.generation!==generation || scope.roomId!==roomId)return;
      lastConnectionStatus=status;
      const message=status==='connected'?`直播间已连接：${scope.roomId}`
        :status==='reconnecting'?'弹幕连接断开，等待重新连接…':'弹幕连接已关闭';
      const id=`bb-system:${scope.roomId}:${scope.generation}:${receivedAt}:${sequence+1}`;
      // This is a BB lifecycle fact, not a Bilibili command or a room live/end
      // event. It goes only to compatibility history, never native or archive.
      api.publish([{id,msgType:MsgType.Unknown,roomId:scope.roomId,ts:receivedAt,laplace:{
        sourceCommand:'BB_CONNECTION_STATE',sourceMode:'canonical',platform:'bilibili',
        timestampUnit:'receipt-milliseconds',timestampFallback:false,
        event:{type:'system',id,origin:scope.roomId,originIdx:0,uid:0,username:'系统消息',message,
          timestamp:receivedAt,timestampNormalized:receivedAt,read:false}}}],scope,receivedAt);
    },
    dispose():void{forget();listeners.clear();},
  };
  return api;
}
const bus=createLaplaceInputBus();
export const getLaplaceInputSnapshot=bus.snapshot;
export const subscribeLaplaceInput=bus.subscribe;
export const resetLaplaceInput=bus.reset;
export const beginLaplaceInputGeneration=bus.begin;
export const publishAcceptedLaplaceEvents=bus.publish;
export const clearLaplaceInput=bus.clear;
export const pruneLaplaceInput=bus.prune;

export const publishLaplaceConnectionState=bus.publishConnectionState;
