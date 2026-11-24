/** OpenLive callback adapter. The renderer owns queues, merge search and animation.
 * BB enhancement OL15 rebuilds retained facts in place; it never replays a reset clock.
 */
import {paidAmountVisible,mergePaidAmounts} from '../compat-paid-filter.mjs';
import {evaluateNativeTextFilters,readNativeTextFilterFacts} from '../native-text-filter-facts.mjs';
import {planTextReconciliation,projectTextMembers} from './textReconcile.mjs';
export const DEFAULT_CONFIG = Object.freeze({skin:'none',minGiftPrice:0,minTickerPrice:.1,showDanmaku:true,showSuperchat:true,showNewMember:true,showGift:true,showGiftInfo:true,mergeSimilarDanmaku:false,mergeGift:true,danmakuAtBottom:true,tickerAtButtom:false,maxNumber:30,fadeOutNum:3,pinTime:0,showLike:false,blockMedalLevel:0,minDanmakuInterval:400,maxDanmakuInterval:1200,emoticonSize:80});
export const DEFAULT_HOST_POLICY = Object.freeze({hostPaidFilter:false,hostPaidThreshold:.1,hostPaidMode:'unit',hostShowFreeGift:true,hostShowNormalGift:true});
export const DEFAULT_NATIVE_TEXT_POLICY=Object.freeze({hostNativeTextFilter:false,hostShowAutoDanmaku:true,hostShowPhoneNotVerified:false});
const ENGINE_DEFAULTS = Object.freeze({...DEFAULT_CONFIG,...DEFAULT_HOST_POLICY,...DEFAULT_NATIVE_TEXT_POLICY});
export const METHODS = new Set(['onAddText','onAddLike','onAddGift','onAddMember','onAddSuperChat','onDelSuperChat','onUpdateTranslation']);
export const RETENTION = Object.freeze({maxRecords:10000,maxBytes:16*1024*1024,maxJournal:10000,maxTombstones:20000,maxTombstoneBytes:2*1024*1024,ttlMs:2*60*60*1000});
const validLike = n => Number.isSafeInteger(n) && n >= 0;
const finite = n => typeof n === 'number' && Number.isFinite(n);
const text = value => typeof value === 'string' ? value : '';
const copy = value => JSON.parse(JSON.stringify(value));
function validateConfig(patch, previous, defaults) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new TypeError('OpenLive settings must be an object');
  for (const key of ['hostNativeTextFilter','hostShowAutoDanmaku','hostShowPhoneNotVerified']) {
    if (key in patch) {
      const slot=Object.getOwnPropertyDescriptor(patch,key);
      if (!slot || !slot.enumerable || !('value' in slot) || typeof slot.value!=='boolean') throw new TypeError(`Invalid OpenLive setting: ${key}`);
    }
  }
  const next = Object.fromEntries(Object.keys(defaults).map(key=>[key,Object.hasOwn(previous,key)?previous[key]:defaults[key]]));
  for (const [key,value] of Object.entries(patch)) {
    if (!Object.hasOwn(defaults,key)) throw new TypeError(`Unsupported OpenLive setting: ${key}`);
    if (typeof value !== typeof defaults[key] || typeof value === 'number' && Number.isNaN(value)) throw new TypeError(`Invalid OpenLive setting: ${key}`);
    if(key==='hostPaidMode'&&!['unit','cumulative'].includes(value))throw new TypeError('Invalid OpenLive paid mode');
    if(key==='hostPaidThreshold'&&(!finite(value)||value<0))throw new TypeError('Invalid OpenLive paid threshold');
    next[key] = value; // upstream parsers, not UI ranges, determine accepted numbers
  }
  return next;
}
export function checkConfig(patch = {}, previous = DEFAULT_CONFIG) { return validateConfig(patch,previous,DEFAULT_CONFIG); }
// The parent bridge owns host policy; frozen renderer/UI settings remain separate.
export function checkEngineConfig(patch = {}, previous = ENGINE_DEFAULTS) { return validateConfig(patch,previous,ENGINE_DEFAULTS); }
export function richParts(content, emoticon = null, emotes) {
  const value = text(content);
  if (emoticon) return [{type:1,text:value,url:emoticon}];
  const dictionary = new Map();
  if (emotes && typeof emotes === 'object') for (const [key,item] of Object.entries(emotes)) {
    const url = typeof item === 'string' ? item : item?.url;
    if (typeof url === 'string' && url) dictionary.set(key,url);
  }
  if (!dictionary.size) return [{type:0,text:value}];
  const starts=new Set([...dictionary.keys()].map(key=>key[0])),longest=Math.max(...[...dictionary.keys()].map(key=>key.length));
  const parts=[]; let from=0;
  for(let i=0;i<value.length;) {
    let match=null;
    if(starts.has(value[i])) for(let end=i+1;end<=Math.min(value.length,i+longest);end++) if(dictionary.has(value.slice(i,end))) {match=value.slice(i,end);break;}
    if(!match){i++;continue;}
    if(i>from) parts.push({type:0,text:value.slice(from,i)});
    parts.push({type:1,text:match,url:dictionary.get(match)}); i+=match.length; from=i;
  }
  if(from<value.length || !parts.length) parts.push({type:0,text:value.slice(from)});
  return parts;
}
export function projectCallback(event, config) {
  const p=event.payload ?? event.data, method=event.method;
  const time = new Date(finite(p.time) ? p.time : finite(p.timestamp) ? p.timestamp*1000 : event.receivedAt);
  const common={bbPaidAmount:copy(p.bbPaidAmount??{unit:null,cumulative:null}),id:String(p.id),time,avatarUrl:text(p.avatarUrl),authorName:text(p.authorName)};
  if(method==='onAddText'||method==='onAddLike') {
    const like=method==='onAddLike';
    if(like ? !config.showLike || !validLike(p.likeCount) : !config.showDanmaku || config.blockMedalLevel>0 && p.medalLevel<config.blockMedalLevel) return null;
    const content=like ? (p.likeCount>1 ? `点赞了直播间${p.likeCount}次` : '点赞了直播间') : text(p.content);
    return {...common,type:0,sourceKind:like?'like':'text',uid:p.uid,authorType:like?0:p.authorType,privilegeType:like?0:p.privilegeType,content,
      richContent:like?richParts(content):Array.isArray(p.richContent)?copy(p.richContent):richParts(content,p.emoticon,p.emotes),
      richTranslate:Array.isArray(p.richTranslate)?copy(p.richTranslate):like?[]:richParts(p.translation,null,p.emotes),
      translation:text(p.translation),emoticon:p.emoticon ?? null,medalName:p.medalName,medalLevel:p.medalLevel,
      isFanGroup:p.isFanGroup,isCurrentRoom:p.isCurrentRoom,medalLighted:p.medalLighted,repeated:1,...(like?{likeCount:p.likeCount}:{})};
  }
  if(method==='onAddGift') {
    if(!config.showGift)return null;
    const price=finite(p.totalCoin)?p.totalCoin/1000:finite(p.price)?p.price:0;
    if(config[price<=0?'hostShowFreeGift':'hostShowNormalGift']===false)return null;
    return {...common,type:1,price,giftName:text(p.giftName),num:finite(p.num)?p.num:0};
  }
  if(method==='onAddMember') {
    if(!config.showNewMember)return null;
    // OL06: BB's actual total, never the upstream synthesized 198/1998/19998.
    return {...common,type:2,price:finite(p.price)?p.price:finite(p.totalCoin)?p.totalCoin/1000:0,privilegeType:p.privilegeType,title:typeof p.title==='string'?p.title:common.authorName,num:p.num};
  }
  if(method==='onAddSuperChat') {
    if(!config.showSuperchat||!config.hostPaidFilter&&p.price<config.minGiftPrice)return null;
    return {...common,type:3,price:p.price,content:text(p.content).trim(),translation:text(p.translation),severTranslation:text(p.severTranslation)};
  }
  return null;
}
export function tickerMinutes(m) {
  if(m.type===2 && [1,2,3].includes(m.privilegeType)) return ({1:30,2:15,3:5})[m.privilegeType];
  return [[1000,15],[100,8],[50,5],[30,3],[1,.4],[.1,.2],[0,.08]].find(([p])=>m.price>=p)?.[1] ?? .08;
}
function laneState(r) {
  return {queue:r.smoothedMessageQueue.flat().filter(m=>m.type<4),buffer:[...r.messagesBuffer],main:[...r.messages],ticker:[...r.paidMessages]};
}
function allMessages(state) {return [...new Set([...state.queue,...state.buffer,...state.main,...state.ticker])];}
export class OpenLiveRuntime {
  constructor({renderer,config={},now=()=>Date.now(),retention={},schedule=callback=>setTimeout(callback,0),cancel=timer=>clearTimeout(timer)}={}) {
    if(!renderer)throw new TypeError('OpenLive renderer is required');
    this.schedule=schedule;this.cancel=cancel;this.renderer=renderer;this.sourceMethods=renderer.$options?.methods;this.tombstoneOverflow=false;this.config=checkEngineConfig(config);this.now=now;this.retention={...RETENTION,...retention};
    this.records=new Map();this.journal=[];this.journalBytes=0;this.tombstoneBytes=0;this.bytes=0;this.sequence=0;this.droppedRecords=0;this.tombstones=new Set();
    this.managedTicker=false;this.scopeEpoch=0;this.inFlight=null;this.installLifecycleHooks();
  }
  installLifecycleHooks() {
    const r=this.renderer, runtime=this;
    const add=r.handleAddMessage.bind(r),del=r.handleDelMessage.bind(r),update=r.updateProgress.bind(r);
    const consume=function(message){
      // The frozen ticker keeps its own admission; only main admission is replaced.
      if(runtime.config.hostPaidFilter||runtime.managedTicker){
        // Shadow this one read without mutating a Vue prop or either lane's arrays.
        const admission=Object.create(this);
        if(runtime.config.hostPaidFilter)Object.defineProperty(admission,'minGiftPrice',{value:-Infinity});
        if(runtime.managedTicker)Object.defineProperty(admission,'minTickerPrice',{value:Infinity});
        runtime.sourceMethods.handleAddMessage.call(admission,message);
      }else add(message);
      if(runtime.config.hostPaidFilter&&!runtime.mainVisible(message)){
        this.messagesBuffer=this.messagesBuffer.filter(m=>m.id!==message.id);
        for(const id of message._recordIds||[message.id]){const rec=runtime.records.get(id);if(rec)rec.hiddenMain=true;}
      }
      const actual=this.messagesBuffer.find(m=>m.id===message.id)||this.paidMessages.find(m=>m.id===message.id);
      const ids=message._recordIds||[message.id];
      if(actual&&message.sourceKind==='text'&&message.addTime!==undefined)actual.addTime=new Date(message.addTime);
      if(actual) {
        actual._recordIds=ids;
        for(const id of ids){const rec=runtime.records.get(id);if(rec){rec.addTime ??= +actual.addTime;rec.delivered=true;}}
      }
      // A source-admitted event below both price thresholds still has an arrival clock.
      for(const id of ids){const rec=runtime.records.get(id);if(rec){rec.addTime ??= runtime.now();rec.delivered=true;}}
      runtime.observe();
    };
    r.handleAddMessage=function(message){
      const ids=message._recordIds||[message.id];
      try {
        if(runtime.inFlight&&runtime.inFlight.epoch!==runtime.scopeEpoch)return;
        if(!runtime.config.hostNativeTextFilter||message.sourceKind!=='text')return consume.call(this,message);
        const records=ids.map(id=>runtime.records.get(id)).filter(Boolean);
        if(!records.length)return consume.call(this,message);
        let changed=false;
        for(const rec of records){
          if(rec.delivered&&rec.addTime!==undefined&&runtime.config.pinTime!==0&&(runtime.now()-rec.addTime)/1000>=runtime.config.pinTime)rec.mainExpired=true;
          if(!runtime.nativeTextAllowed(rec)){runtime.hideNativeText(rec);changed=true;}
          else rec.nativeTextHidden=false;
          if(rec.deleted||rec.mainExpired)changed=true;
        }
        const rows=changed?projectTextMembers(runtime,runtime.config,records,projectCallback):[message];
        for(const row of rows)consume.call(this,row);
      } finally {if(runtime.inFlight)for(const id of ids)runtime.inFlight.pending.delete(id);}
    };
    const handleGroup=r.handleMessageGroup.bind(r);
    r.handleMessageGroup=function(messages){
      if(!runtime.config.hostNativeTextFilter)return handleGroup(messages);
      const previous=runtime.inFlight,epoch=runtime.scopeEpoch;
      runtime.inFlight={epoch,pending:new Set(messages.filter(m=>m.type<4).flatMap(m=>m._recordIds||[m.id])),messages};
      // Source group dispatch/flush order is unchanged; a reset invalidates its remaining calls.
      const facade=Object.create(this);
      for(const name of ['handleAddMessage','handleDelMessage','handleUpdateMessage','maybeResizeScrollContainer','flushMessagesBuffer','maybeScrollToBottom','$nextTick'])
        Object.defineProperty(facade,name,{value:(...args)=>epoch===runtime.scopeEpoch?this[name](...args):undefined});
      try{return runtime.sourceMethods.handleMessageGroup.call(facade,messages);}
      finally{runtime.inFlight=previous?.epoch===runtime.scopeEpoch?previous:null;}
    };
    r.handleDelMessage=function(operation){
      // Preserve source boundary: direct delete does not remove a queued add.
      const victims=[...this.messages,...this.messagesBuffer,...this.paidMessages].filter(m=>m.id===operation.id);
      for(const m of victims)for(const id of m._recordIds||[m.id]) {const rec=runtime.records.get(id);if(rec)rec.deleted=true;runtime.markDeleted(id);}
      del(operation);
      const ticker=this.$children?.find(child=>child.$options?.name==='Ticker');
      if(ticker?.pinnedMessage?.id===operation.id) ticker.pinnedMessage=null;
      runtime.observe();
    };
    r.updateProgress=function(){update();runtime.observe();};
  }
  observe() {
    const state=laneState(this.renderer),now=this.now();
    const lookup={};for(const lane of ['main','buffer','queue','ticker']){lookup[lane]=new Map();for(const m of state[lane])for(const id of m._recordIds||[m.id])lookup[lane].set(id,m);}
    if(this.inFlight?.epoch===this.scopeEpoch)for(const m of this.inFlight.messages.filter(m=>m.type<4))for(const id of m._recordIds||[m.id])if(this.inFlight.pending.has(id))lookup.queue.set(id,m);
    for(const rec of this.records.values()) {
      if(rec.deleted)continue;
      const main=lookup.main.get(rec.id),buffer=lookup.buffer.get(rec.id),queued=lookup.queue.get(rec.id),ticker=lookup.ticker.get(rec.id);
      const current=main||buffer||queued||ticker;
      if(current?.addTime)rec.addTime ??= +new Date(current.addTime);
      if((rec.wasMain||rec.wasBuffer) && !main && !buffer && !queued && !rec.hiddenMain && !rec.nativeTextHidden)rec.mainExpired=true;
      if(rec.wasTicker && !ticker && !rec.hiddenTicker)rec.tickerExpired=true;
      if(main)rec.wasMain=true;if(buffer)rec.wasBuffer=true;
      if(ticker)rec.wasTicker=true;
      if(current)rec.lane=queued?'queue':buffer?'buffer':main?'main':'ticker';
      if(main||buffer||queued)delete rec.restorationLane;
      if(main?.isDelete)rec.isDelete=true;
      if(rec.addTime!==undefined && this.config.pinTime!==0 && (now-rec.addTime)/1000>=this.config.pinTime && rec.delivered)rec.mainExpired=true;
    }
    return state;
  }
  receive(event) {
    if(!event||!METHODS.has(event.method))throw new TypeError('Unknown OpenLive callback');
    const payload=event.payload??event.data;
    if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new TypeError('OpenLive payload must be an object');
    const facts=readNativeTextFilterFacts(event);
    const serialized=JSON.stringify({method:event.method,payload,...(facts===undefined?{}:{source:{nativeTextFilterFacts:facts}}),receivedAt:finite(event.receivedAt)?event.receivedAt:this.now()});
    const bytes=new TextEncoder().encode(serialized).byteLength;
    if(bytes>this.retention.maxBytes)throw new RangeError('OpenLive event exceeds retained-cache limit');
    const item=JSON.parse(serialized);const inputSequence=++this.sequence;
    if(!item.method.startsWith('onAdd')){
      this.remember(item,bytes);this.trim();
      if(item.method==='onDelSuperChat') {
        if(!Array.isArray(payload.ids))throw new TypeError('SC delete requires ids');
        const ids=payload.ids.map(String),deleted=new Set(ids);
        // SC-QUEUE-DELETE: explicitly approved on 2026-10-05 (Sentinel_d05c9a1e65c88191a66e89af5a0c685b).
        // The frozen oracle intentionally retains its contrary queue behavior.
        for(const id of ids){this.markDeleted(id);const rec=this.records.get(id);if(rec)rec.deleted=true;}
        this.renderer.smoothedMessageQueue=this.renderer.smoothedMessageQueue.map(group=>group.filter(m=>!(m.type===3&&deleted.has(m.id)))).filter(group=>group.length);
        this.renderer.delMessages(ids);
        for(const m of this.renderer.smoothedMessageQueue.flat())if(m.type===4&&ids.includes(m.id)&&m._hostSequence===undefined)m._hostSequence=inputSequence;
      } else {
        const id=String(payload.id);if(this.tombstones.has(id)||this.tombstoneOverflow)return;
        const rec=this.records.get(id);
        const values={};
        if(Object.hasOwn(payload,'translation')){
          values.translation=text(payload.translation);
          values.richTranslate=richParts(values.translation,null,rec?.event.payload.emotes);
        }
        if(Array.isArray(payload.richTranslate))values.richTranslate=copy(payload.richTranslate);
        if(typeof payload.severTranslation==='string')values.severTranslation=payload.severTranslation;
        // Reprojection must use the same normalized translation as the live update.
        if(rec&&!rec.deleted)Object.assign(rec.event.payload,copy(values));
        this.renderer.updateMessage(id,values);
        for(const m of this.renderer.smoothedMessageQueue.flat())if(m.type===5&&m.id===id&&m._hostSequence===undefined)m._hostSequence=inputSequence;
      }
      return;
    }
    if(payload.id===undefined||payload.id===null)throw new TypeError('OpenLive add requires id');
    const id=String(payload.id);
    if(this.records.has(id)||this.tombstones.has(id)||this.tombstoneOverflow&&item.method==='onAddSuperChat')return; // repeated BB delivery is not a second source event
    this.observe();this.trim(bytes);
    if(this.records.size>=this.retention.maxRecords||this.bytes+bytes>this.retention.maxBytes)throw new RangeError('OpenLive active cache is full; reset or let queued messages drain');
    const rec={id,event:item,sequence:inputSequence,bytes,addTime:undefined,delivered:false,deleted:false};
    this.records.set(id,rec);this.bytes+=bytes;this.remember(item,bytes);
    if(!this.nativeTextAllowed(rec)){this.hideNativeText(rec);this.trim();return;}
    const message=projectCallback(item,this.config);
    if(message) {
      message._recordIds=[id];rec.groupId=id;
      if(this.config.hostPaidFilter&&message.type===1&&this.config.mergeGift){
        // Only merged gifts need hidden-history regrouping. Other traffic uses
        // the frozen incremental admission path and its lifecycle hook.
        // Keep every input in the source queue; regroup against retained hidden rows.
        rec.groupId=undefined;this.renderer.addMessage(message);this.recompute();this.trim();return;
      }
      const merged=this.merge(message);
      if(merged){merged._recordIds??=[merged.id];merged._recordIds.push(id);rec.addTime=merged.addTime?+new Date(merged.addTime):undefined;rec.delivered=!!merged.addTime;rec.lane=this.records.get(merged.id)?.lane;rec.groupId=this.config.hostNativeTextFilter&&message.sourceKind==='text'?(this.records.get(merged.id)?.groupId??merged.id):merged.id;const root=this.records.get(merged.id);if(root&&!(this.config.hostNativeTextFilter&&message.sourceKind==='text'))root.groupId=merged.id;}
      else this.renderer.addMessage(message);
    }
    this.trim();
  }
  nativeTextAllowed(rec,config=this.config) {
    return rec.event.method!=='onAddText'||!config.hostNativeTextFilter||evaluateNativeTextFilters(rec.event,{showAutoDanmaku:config.hostShowAutoDanmaku,showPhoneNotVerified:config.hostShowPhoneNotVerified}).allowed;
  }
  hideNativeText(rec) {
    rec.nativeTextHidden=true;
    if(!rec.delivered){rec.addTime ??= this.now();rec.delivered=true;rec.restorationLane='main';}
  }
  mainVisible(message) {
    return this.config.hostPaidFilter?paidAmountVisible(message.bbPaidAmount,this.config.hostPaidThreshold,this.config.hostPaidMode):(message.price===undefined||message.price>=this.config.minGiftPrice);
  }
  merge(message, renderer=this.renderer) {
    let target=null;
    // Observe the exact original recent-five search rather than inventing UID/time keys.
    const each=renderer.forEachRecentMessage;
    renderer.forEachRecentMessage=function(limit,callback){return each.call(this,limit,m=>{const before=JSON.stringify([m.repeated,m.price,m.num,m.likeCount]);const result=callback(m);if(result===false||before!==JSON.stringify([m.repeated,m.price,m.num,m.likeCount]))target=m;return result;});};
    try {
      if(message.sourceKind==='like')renderer.mergeSimilarLike(message.authorName,message.likeCount);
      else if(message.type===0 && this.config.mergeSimilarDanmaku)renderer.mergeSimilarText(message.content);
      else if(message.type===1 && this.config.mergeGift)renderer.mergeSimilarGift(message.authorName,message.price,message.giftName,message.num);
    } finally {renderer.forEachRecentMessage=each;}
    if(target)target.bbPaidAmount=mergePaidAmounts(target.bbPaidAmount,message.bbPaidAmount);
    return target;
  }
  setConfig(patch) {
    const config=checkEngineConfig(patch,this.config);
    const changed=Object.keys(config).filter(key=>config[key]!==this.config[key]);
    if(this.config.hostNativeTextFilter&&config.hostNativeTextFilter&&!changed.length)return this.snapshot();
    this.observe();
    if(this.config.hostNativeTextFilter&&config.hostNativeTextFilter&&changed.every(key=>['hostShowAutoDanmaku','hostShowPhoneNotVerified'].includes(key))){
      const plan=planTextReconciliation(this,config,projectCallback);
      this.config=config;for(const [id,rec]of plan.updates)Object.assign(this.records.get(id),rec);
      const r=this.renderer;r.messages=plan.messages;r.messagesBuffer=plan.messagesBuffer;r.smoothedMessageQueue=plan.smoothedMessageQueue;
      for(const m of plan.fades)m.isDelete=true;
      if(!r.emitSmoothedMessageTimerId&&r.smoothedMessageQueue.some(group=>group.some(m=>m.sourceKind==='text')))r.emitSmoothedMessageTimerId=this.schedule(r.emitSmoothedMessages);
      return this.snapshot();
    }
    this.regroup=new Set();
    if(['showDanmaku','blockMedalLevel','mergeSimilarDanmaku'].some(key=>config[key]!==this.config[key]))this.regroup.add('text');
    if(config.showLike!==this.config.showLike)this.regroup.add('like');
    if(['showGift','mergeGift'].some(key=>config[key]!==this.config[key])||config.minGiftPrice<this.config.minGiftPrice)this.regroup.add(1);this.capacityChanged=config.maxNumber!==this.config.maxNumber||config.fadeOutNum!==this.config.fadeOutNum;this.config=config;
    return this.recompute();
  }
  recompute() {
    const r=this.renderer,state=laneState(r),now=this.now();
    const oldById=new Map();for(const m of allMessages(state))for(const id of m._recordIds||[m.id])oldById.set(id,m);
    const laneById=new Map();for(const lane of ['ticker','main','buffer','queue'])for(const m of state[lane])for(const id of m._recordIds||[m.id])laneById.set(id,lane);
    const projected={smoothedMessageQueue:[],messagesBuffer:[],messages:[]};
    for(const name of ['forEachRecentMessage','mergeSimilarText','mergeSimilarGift','mergeSimilarLike'])projected[name]=this.sourceMethods[name].bind(projected);
    const groups=[],groupInfo=new Map(),previousGroups=new Map(),textGroups=new Map();
    // Queue controls consume the same recent-five budget as they do upstream.
    const controls=r.smoothedMessageQueue.flat().filter(m=>m.type>=4).sort((a,b)=>(a._hostSequence??Infinity)-(b._hostSequence??Infinity));let controlIndex=0;
    // A restored older member may have joined a younger, still-pending root.
    // Preserve that actual root/consumption boundary on unrelated full recomputes.
    const ordered=[...this.records.values()].map(rec=>{
      const old=oldById.get(rec.id),root=this.config.hostNativeTextFilter&&!this.regroup?.has('text')&&old?.sourceKind==='text'?this.records.get(old.id):null;
      return {rec,at:Math.max(rec.sequence,root?.sequence??rec.sequence),root:root?.id===rec.id};
    }).sort((a,b)=>a.at-b.at||Number(b.root)-Number(a.root));
    for(const {rec} of ordered) {
      if(rec.deleted||this.inFlight?.pending.has(rec.id))continue;
      while(controlIndex<controls.length&&(controls[controlIndex]._hostSequence??Infinity)<rec.sequence){projected.smoothedMessageQueue.push([controls[controlIndex++]]);}
      if(!this.nativeTextAllowed(rec)){this.hideNativeText(rec);continue;}
      rec.nativeTextHidden=false;
      if(this.config.hostNativeTextFilter&&rec.event.method==='onAddText'&&rec.mainExpired)continue;
      const m=projectCallback(rec.event,this.config),old=oldById.get(rec.id);
      if(!m){rec.hiddenMain=true;rec.hiddenTicker=true;continue;}
      const lane=laneById.get(rec.id)||rec.restorationLane||rec.lane;
      const pending=lane==='queue'&&!rec.delivered;
      if(!pending){rec.addTime ??= old?.addTime?+new Date(old.addTime):rec.event.receivedAt;m.addTime=new Date(rec.addTime);rec.delivered=true;}
      m._recordIds=[rec.id];if(rec.isDelete)m.isDelete=true;
      const regroup=this.regroup?.has(m.sourceKind??m.type);
      const mergeEnabled=m.sourceKind==='like'||m.type===0&&this.config.mergeSimilarDanmaku||m.type===1&&this.config.mergeGift;
      // Existing group associations survive unrelated settings, even when the row
      // has left the main list and only its independently-lived ticker remains.
      const groupKey=this.config.hostNativeTextFilter&&m.sourceKind==='text'?(rec.groupId??old?.id):(old?.id??rec.groupId);
      const nativeHistoricalText=this.config.hostNativeTextFilter&&m.sourceKind==='text'&&groupKey&&!regroup;
      let textContext;
      if(nativeHistoricalText){
        textContext=textGroups.get(groupKey);
        if(!textContext){textContext={messages:[],messagesBuffer:[],smoothedMessageQueue:[]};for(const name of ['forEachRecentMessage','mergeSimilarText'])textContext[name]=this.sourceMethods[name].bind(textContext);textGroups.set(groupKey,textContext);}
      }
      let merged=nativeHistoricalText?this.merge(m,textContext):mergeEnabled&&groupKey&&!regroup?previousGroups.get(groupKey):null;
      if(merged&&!nativeHistoricalText){
        if(m.sourceKind==='like'){merged.likeCount+=m.likeCount;merged.richContent=richParts(`点赞了直播间${merged.likeCount}次`);}
        else if(m.type===1){merged.price+=m.price;merged.num+=m.num;}
        else merged.repeated++;
        merged.bbPaidAmount=mergePaidAmounts(merged.bbPaidAmount,m.bbPaidAmount);
      }else if(!nativeHistoricalText&&(regroup||!rec.groupId))merged=this.merge(m,projected);
      if(merged){merged._recordIds.push(rec.id);groupInfo.get(merged).records.push(rec);if(groupKey)previousGroups.set(groupKey,merged);continue;}
      if(textContext)textContext.messages.push(m);
      const info={records:[rec],lane,pending};groups.push(m);groupInfo.set(m,info);if(groupKey)previousGroups.set(groupKey,m);
      // Freshly enabled cached rows participate in the same recent-five search.
      // Final price-tier and expiry checks happen only AFTER complete aggregation.
      if(pending)projected.smoothedMessageQueue.push([m]);
      else if(!rec.mainExpired&&(this.config.hostPaidFilter||this.mainVisible(m))){
        if(lane==='main')projected.messages.push(m);else projected.messagesBuffer.push(m);
      }
    }
    const queue=[],buffer=[],main=[],paid=[];
    for(const m of groups){
      const info=groupInfo.get(m),records=info.records;
      const expiredMain=!info.pending&&this.config.pinTime!==0&&(now-+m.addTime)/1000>=this.config.pinTime;
      const expiredTicker=!info.pending&&(now-+m.addTime)/60000>=tickerMinutes(m);
      // Clock/expiry belongs to the aggregate's final tier, never its original
      // constituent prices (29+1 is the 30-yuan / three-minute tier).
      for(const rec of records){if(!(this.config.hostNativeTextFilter&&m.sourceKind==='text'&&rec.groupId&&!this.regroup?.has('text')))rec.groupId=m.id;if(expiredMain)rec.mainExpired=true;if(expiredTicker&&m.price!==undefined)rec.tickerExpired=true;}
      const mainAllowed=records.some(rec=>!rec.mainExpired)&&this.mainVisible(m);
      const tickerAllowed=records.some(rec=>!rec.tickerExpired)&&m.price!==undefined&&m.price>=this.config.minTickerPrice;
      for(const rec of records){rec.hiddenMain=!mainAllowed;rec.hiddenTicker=!tickerAllowed;}
      if(info.pending){queue.push(m);continue;}
      if(mainAllowed)(info.lane==='main'?main:buffer).push(m);
      if(tickerAllowed)paid.unshift(m);
    }
    // Retain queued control operations, without restarting the smoothing timer.
    const queueById=new Map(queue.map(m=>[m.id,m])),preservedQueue=[];
    for(const group of r.smoothedMessageQueue){const next=[];for(const m of group){if(m.type>=4)next.push(m);else{const replacement=queueById.get(m.id);if(replacement){next.push(replacement);queueById.delete(m.id);}}}if(next.length)preservedQueue.push(next);}
    for(const m of queueById.values())preservedQueue.push([m]);
    r.smoothedMessageQueue=preservedQueue;
    if(preservedQueue.length&&!r.emitSmoothedMessageTimerId)r.emitSmoothedMessageTimerId=this.schedule(r.emitSmoothedMessages);
    if(this.managedTicker){
      const reuse=message=>{
        const previous=oldById.get(message.id),keys=Object.keys(message);
        return previous&&keys.length===Object.keys(previous).length&&keys.every(key=>Object.hasOwn(previous,key)&&JSON.stringify(message[key])===JSON.stringify(previous[key]))?previous:message;
      };
      for(let index=0;index<main.length;index++)main[index]=reuse(main[index]);
      for(let index=0;index<buffer.length;index++)buffer[index]=reuse(buffer[index]);
    }
    r.messages=main;r.messagesBuffer=buffer;if(!this.managedTicker)r.paidMessages=paid.slice(0,100);
    const ticker=r.$children?.find(child=>child.$options?.name==='Ticker');
    if(ticker?.pinnedMessage)ticker.pinnedMessage=r.paidMessages.find(m=>m.id===ticker.pinnedMessage.id)||null;
    if(this.capacityChanged&&!r.messagesBuffer.length){
      const excess=Math.max(r.messages.length-this.config.maxNumber,0);
      if(excess>0&&this.config.fadeOutNum>0)for(let i=0;i<Math.min(excess,r.messages.length);i++)r.messages[i].isDelete=true;
      const remove=Math.max(r.messages.length-this.config.maxNumber-this.config.fadeOutNum,0);if(remove>0)r.messages.splice(0,remove);
    }
    this.capacityChanged=false;this.regroup=null;
    // Frozen flush trims old rows before appending the entire new batch (D08).
    r.flushMessagesBuffer();r.$nextTick(()=>r.maybeResizeScrollContainer());
    return this.snapshot();
  }
  markDeleted(id) {
    if(this.tombstones.has(id))return;
    const bytes=new TextEncoder().encode(id).byteLength;
    if(this.tombstones.size>=this.retention.maxTombstones||this.tombstoneBytes+bytes>this.retention.maxTombstoneBytes){this.tombstoneOverflow=true;return;}
    this.tombstones.add(id);this.tombstoneBytes+=bytes;
  }
  remember(item,bytes) {
    this.journal.push({...item,_bytes:bytes});this.journalBytes+=bytes;
    while(this.journal.length>this.retention.maxJournal||this.journalBytes>this.retention.maxBytes)this.journalBytes-=this.journal.shift()._bytes;
  }
  trim(incomingBytes=0) {
    const live=new Set(allMessages(laneState(this.renderer)).flatMap(m=>m._recordIds||[m.id]));
    if(this.inFlight?.epoch===this.scopeEpoch)for(const id of this.inFlight.pending)live.add(id);
    for(const [id,rec]of this.records){if(live.has(id))continue;if(this.records.size+(incomingBytes?1:0)>this.retention.maxRecords||this.bytes+incomingBytes>this.retention.maxBytes||!this.managedTicker&&this.now()-rec.event.receivedAt>this.retention.ttlMs){this.records.delete(id);this.bytes-=rec.bytes;this.droppedRecords++;}}
  }
  async hydrate(records,{deletedSuperChatIds=[],deletionOverflow=false}={}) {
    if(!Array.isArray(records)||records.length>this.retention.maxJournal)throw new RangeError('OpenLive history requires bounded records');
    if(!Array.isArray(deletedSuperChatIds))throw new TypeError('OpenLive deleted SC IDs must be an array');
    // Normalize host carriers before JSON's enumerable getter/toJSON traversal.
    records=records.map(event=>{const facts=readNativeTextFilterFacts(event);return {method:event.method,payload:event.payload??event.data,receivedAt:event.receivedAt,...(facts===undefined?{}:{source:{nativeTextFilterFacts:facts}})};});
    if(new TextEncoder().encode(JSON.stringify(records)).byteLength>this.retention.maxBytes)throw new RangeError('OpenLive history exceeds cache size');
    this.reset();
    const hydrationEpoch=this.scopeEpoch;
    // Session tombstones are independent of retained event history. Import them
    // first, including unknown-ID deletes that may precede a late arriving SC.
    for(const id of deletedSuperChatIds)this.markDeleted(String(id));
    if(deletionOverflow)this.tombstoneOverflow=true;
    for(const event of records)this.receive(event);
    for(const rec of this.records.values()){rec.addTime=rec.event.receivedAt;rec.delivered=true;rec.lane='main';}
    this.cancel(this.renderer.emitSmoothedMessageTimerId);this.renderer.emitSmoothedMessageTimerId=null;
    this.recompute();
    if(this.managedTicker){
      this.renderer.messages.push(...this.renderer.messagesBuffer);
      this.renderer.messagesBuffer=[];
      this.renderer.maybeResizeScrollContainer();
      await this.renderer.$nextTick();
      return this.snapshot();
    }
    while(this.renderer.smoothedMessageQueue.length){if(hydrationEpoch!==this.scopeEpoch)return;this.renderer.emitSmoothedMessages();await this.renderer.$nextTick();}
    await this.renderer.$nextTick();
    if(hydrationEpoch!==this.scopeEpoch)return;
    if(this.renderer.onLeave)await new Promise(resolve=>{
      const stop=this.renderer.$watch('onLeave',leaving=>{if(!leaving){stop();resolve();}});
    });
    if(hydrationEpoch!==this.scopeEpoch)return;
    this.renderer.cantScrollStartTime=null;
    await this.renderer.flushMessagesBuffer();
    await this.renderer.$nextTick();
    if(hydrationEpoch!==this.scopeEpoch)return;
    return this.snapshot();
  }
  reset() {
    ++this.scopeEpoch;this.inFlight=null;
    const r=this.renderer;if(r.emitSmoothedMessageTimerId)this.cancel(r.emitSmoothedMessageTimerId);r.emitSmoothedMessageTimerId=null;
    r.resetSmoothScroll();
    if(this.managedTicker){
      r.messages=[];r.smoothedMessageQueue=[];r.messagesBuffer=[];r.isSmoothed=true;r.lastSmoothChatMessageAddMs=null;r.chatRateMs=1000;r.lastSmoothScrollUpdate=null;r.scrollTimeRemainingMs=0;r.scrollPixelsRemaining=0;r.smoothScrollRafHandle=null;r.preinsertHeight=0;r.maybeResizeScrollContainer();
    }else{r.clearMessages();const ticker=r.$children?.find(child=>child.$options?.name==='Ticker');if(ticker)ticker.pinnedMessage=null;}
    this.records.clear();this.journal=[];this.journalBytes=0;this.tombstoneBytes=0;this.bytes=0;this.sequence=0;this.tombstones.clear();this.tombstoneOverflow=false;this.droppedRecords=0;
  }
  nativeTextDiagnostics() {
    const result={invalid:0,auto:0,phone:0};
    if(this.config.hostNativeTextFilter)for(const rec of this.records.values())if(rec.event.method==='onAddText'&&!rec.deleted){
      const decision=evaluateNativeTextFilters(rec.event,{showAutoDanmaku:this.config.hostShowAutoDanmaku,showPhoneNotVerified:this.config.hostShowPhoneNotVerified});
      for(const key of Object.keys(result))if(decision[key])result[key]++;
    }
    return result;
  }
  snapshot() {
    const r=this.renderer;const result=copy({nativeTextFilterDiagnostics:this.nativeTextDiagnostics(),config:this.config,messages:r.messages,paidMessages:r.paidMessages,messagesBuffer:r.messagesBuffer,smoothedMessageQueue:r.smoothedMessageQueue,tombstones:[...this.tombstones],tombstoneOverflow:this.tombstoneOverflow,retainedRecords:this.records.size,droppedRecords:this.droppedRecords});result.config={...this.config};return result;
  }
}
