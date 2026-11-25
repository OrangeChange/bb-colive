import { admitsStylePreviewEvent, projectSourcePreviewFact, scopeStylePreviewSample, type StylePreviewPolicySettings } from './stylePreviewPolicy.ts';
import { isCompatibleThemeEventVisible } from '../themes/compatibleEventVisibility.ts';
import { nativePreviewCandidates } from './stylePreviewGenerator.ts';
import { MsgType, type DanmakuEvent } from '../protocol/types.ts';
import { createNativeEventVisibilityPredicate } from '../events/outputEventPolicy.ts';
import { createBlivechatFixedPreviewRecords } from '../compat/blivechat/previewRecords.mjs';

export type PreviewEventDecision = (event: DanmakuEvent) => 'render' | 'fallback' | 'omit';
export function nativeFallbackPreviewCandidates(options: {
  policy: StylePreviewPolicySettings; target: 'live' | 'windows' | 'obs'; displayAll: boolean;
  eventType?: string; decision?: PreviewEventDecision;
}) {
  if (options.target === 'obs' || !options.decision) return [];
  const aliases: Record<string,string> = {'gift-normal':'normal','gift-regular':'normal',entry:'enter','special-follow':'specialFollow','mutual-follow':'mutualFollow','live-status':'liveStatus','user-block':'userMute','room-mute':'roomMute','room-change':'roomChange'};
  const scope = aliases[options.eventType ?? ''] ?? options.eventType;
  const categories = ['danmaku','interaction','gift','superchat','guard','system'];
  const visibility = scope && scope !== 'all' ? createNativeEventVisibilityPredicate({categories:Object.fromEntries(categories.map(category=>[category,categories.includes(scope)?category===scope:true])),children:{}}) : () => true;
  const subScope = (event: DanmakuEvent) => {
    if (!scope || scope === 'all' || categories.includes(scope)) return true;
    if (['normal','blind','free','redpocket','lottery'].includes(scope)) return createNativeEventVisibilityPredicate({categories:{danmaku:false,interaction:false,superchat:false,guard:false,system:false},children:Object.fromEntries(['normal','blind','free','redpocket','lottery'].map(child=>[child,child===scope]))})(event);
    if (['enter','follow','share','specialFollow','mutualFollow','like'].includes(scope)) return event.msgType===MsgType.Interact && (event.interactKind==='entry'?'enter':event.interactKind)===scope;
    const types: Record<string,MsgType[]> = {liveStatus:[MsgType.LiveStart,MsgType.LiveEnd],userMute:[MsgType.RoomBlock],roomMute:[MsgType.RoomSilent],roomChange:[MsgType.RoomChange],warning:[MsgType.Warning,MsgType.CutOff,MsgType.RoomLock]};
    return (types[scope]??[]).includes(event.msgType);
  };
  return nativePreviewCandidates('混合流').map(event=>scopeStylePreviewSample(event,options.policy.targetRoomId))
    .filter(event=>!event.gift?.blindGiftName&&visibility(event)&&subScope(event)&&options.decision!(event)==='fallback'
      && admitsStylePreviewEvent(event,options.policy,{target:options.target,displayAll:options.displayAll,mode:'simulation',now:Date.now()}));
}

type Source = 'blivechat' | 'blivechat-open';
export type SourcePreviewRecord = { method: string; payload: Record<string, any>; receivedAt?: number };
export type SourcePreviewRepetition = { key: string; record: SourcePreviewRecord; count: number; lastAt: number };
export function sourcePreviewCandidates(source: Source, options: {
  policy: StylePreviewPolicySettings; target: 'live' | 'windows' | 'obs'; displayAll: boolean;
  visibility?: unknown; eventType?: string; decision?: PreviewEventDecision;
}): SourcePreviewRecord[] {
  const methods: Record<string,string>={danmaku:'onAddText',gift:'onAddGift','gift-normal':'onAddGift',superchat:'onAddSuperChat',guard:'onAddMember',like:'onAddLike',interaction:'onAddLike'};
  const requested=options.displayAll||!options.eventType||options.eventType==='all'?undefined:methods[options.eventType]??'unsupported';
  return createBlivechatFixedPreviewRecords(source).map(record=>({method:String(record.method),payload:{...(record.payload??record.data)}}))
    .filter(record=>{
      if(requested&&record.method!==requested)return false;
      const fact=scopeStylePreviewSample(projectSourcePreviewFact(record,source),options.policy.targetRoomId);
      return (options.decision?options.decision(fact)==='render':options.displayAll||isCompatibleThemeEventVisible(source,options.visibility,fact))
        && admitsStylePreviewEvent(fact,options.policy,{...options,mode:'simulation',now:Date.now()},!(record.method==='onAddGift'&&options.policy.giftThresholdMode==='cumulative'));
    });
}
function sourceKey(record: SourcePreviewRecord): string {
  const p=record.payload;
  if(record.method==='onAddText')return `text:${p.content}:${p.emoticon??''}:${JSON.stringify(p.contentParts??p.emotes??null)}`;
  if(record.method==='onAddGift')return `gift:${p.authorName}:${p.giftName}`;
  return `${record.method}:${p.id}`;
}
export function nextSourcePreviewRecord({candidates,repetitions,random,now,sequence,session}: {
  candidates: readonly SourcePreviewRecord[]; repetitions: SourcePreviewRepetition[]; random:()=>number;now:()=>number;sequence:number;session:string;
}): SourcePreviewRecord|null {
  const at=now(),pick=<T,>(items: readonly T[])=>items[Math.floor(random()*items.length)];
  for(let i=repetitions.length-1;i>=0;i--){const group=repetitions[i],mergeable=group.record.method==='onAddText'||group.record.method==='onAddGift';if(at-group.lastAt>8000&&(!mergeable||i<repetitions.length-5))repetitions.splice(i,1);}
  const repeats=repetitions.filter(g=>g.count<3&&at-g.lastAt<=8000&&(g.record.method==='onAddText'||g.record.method==='onAddGift'&&Number(g.record.payload.totalCoin??g.record.payload.price*1000)>0)&&candidates.some(r=>sourceKey(r)===g.key));
  const repeat=repeats.length&&random()<.15?pick(repeats):null;
  const fresh=candidates.filter(r=>!repetitions.some(g=>g.key===sourceKey(r)));
  const kinds=[...new Set(fresh.map(r=>r.method))];
  const kind=repeat?null:pick(kinds);
  const sample=repeat?.record??pick(fresh.filter(r=>r.method===kind));
  if(!sample)return null;
  const record=structuredClone(sample),p=record.payload,key=sourceKey(sample);
  p.id=`preview:${session}:${sequence}`;p.timestamp=at/1000;p.time=at;p.avatarUrl='/media/noface.gif';record.receivedAt=at;
  if(repeat&&record.method==='onAddGift'){
    const count=Number(p.num)||1;p.totalCoin=Number(p.totalCoin??0)/count;p.totalFreeCoin=Number(p.totalFreeCoin??0)/count;p.num=1;
  }
  if(record.method==='onAddLike'){
    const profiles=createBlivechatFixedPreviewRecords('blivechat-open').filter(r=>r.method==='onAddText');const selected=pick(profiles);const profile=selected?.payload??selected?.data;
    if(profile)for(const field of ['authorName','authorType','privilegeType','medalName','medalLevel','isFanGroup','uid']){if(profile[field]!==undefined)p[field]=profile[field];else delete p[field]}
    p.avatarUrl='/media/noface.gif';
  }
  if(repeat){repeat.count++;repeat.lastAt=at;repeat.record=record}else repetitions.push({key,record,count:1,lastAt:at});
  return record;
}
