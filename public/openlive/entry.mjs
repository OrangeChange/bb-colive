import { COMPATIBLE_RECALL_CSS, reconcileCompatibleRecall } from '../compatibleEventStatus.mjs';
import { pickPreviewEditorPart, installPreviewEditorHover } from '../previewEditorHit.mjs';
import { inspectEditorProperty } from './editorPropertyInspection.mjs';
import { createOpenLiveSimulation } from './simulation.mjs';
import { bindSimulationIdentity } from '../previewSimulationIdentity.mjs';
import { EVENT_TRANSITION_CSS, applyEventTransition } from '../eventTransitions.mjs';
import { observePreviewRuntime,applyPreviewPresentation } from "../previewCapture.mjs";
import { createPreviewWindow, markPreviewEditorSelection, previewEditorIdentity, previewEditorSelectionNeedsScroll } from "../previewWindow.mjs";
import {OpenLiveRuntime,DEFAULT_CONFIG,checkConfig,checkEngineConfig,projectCallback} from './core.mjs';
import {acceptsParentMessage,skinStylesheet} from './bridge.mjs';
import {composeCompatibleCssLayers} from './css-layer.mjs';
const {Vue,xl}=window.OpenLiveSource;
Vue.config.productionTip=false;
const TYPE='bb-openlive',parentOrigin=window.location.origin;
const post=(command,data)=>{if(window.parent!==window)window.parent.postMessage({type:TYPE,command,data},parentOrigin);};
const SourceRenderer=xl;
const app=new Vue({data:()=>({config:{...DEFAULT_CONFIG}}),render(h){return h(SourceRenderer,{ref:'renderer',props:{...this.config,showTranslateDanmakuOnly:false,translateActive:false,onlyShowTranslate:false,scTranslate:false}});}}).$mount('#app');
const runtime=new OpenLiveRuntime({renderer:app.$refs.renderer});
let capturedPreview=null,stopPreviewWatch=null,previewWindow=null;
function sendPreviewPresentation(){if(capturedPreview)post('preview-frame',{...capturedPreview,...(previewWindow?.active?{windowed:true,records:previewWindow.records}:{}),presentation:simulationSession&&simulationProjection?simulationProjection:{messages:app.$refs.renderer.messages,paidMessages:app.$refs.renderer.paidMessages}});}
const capturePreview=observePreviewRuntime(runtime,data=>{capturedPreview=data;sendPreviewPresentation();});
function observePreview(enabled){document.body.dataset.bbPreviewReading=String(enabled===true);updateTicker();capturePreview(enabled);if(enabled&&!stopPreviewWatch)stopPreviewWatch=app.$watch(()=>[app.$refs.renderer.messages,app.$refs.renderer.paidMessages],()=>{if(!simulationSession)sendPreviewPresentation();},{deep:true});else if(!enabled&&stopPreviewWatch){stopPreviewWatch();stopPreviewWatch=null;capturedPreview=null;}}

const skin=document.createElement('style');skin.id='bb-openlive-named-skin';document.head.append(skin);
const appearance=document.createElement('style');appearance.id='bb-openlive-appearance-css';document.head.append(appearance);
const custom=document.createElement('style');custom.id='bb-openlive-custom-css';document.head.append(custom);
const hostStyle=document.createElement('style');hostStyle.id='bb-openlive-host-css';document.head.append(hostStyle);
let destroyed=false,simulationSession=null,simulationRenderer=null,simulationProjection=null;
const simulationGenerator=createOpenLiveSimulation();
let editorSelection=null,editorSelectionKey='';
const editorFrames=new Set();
function scheduleEditorFrame(callback){const frame=requestAnimationFrame(time=>{editorFrames.delete(frame);callback(time);});editorFrames.add(frame);return frame;}
const editorStyle=document.createElement('style');editorStyle.id='bb-compatible-editor-style';document.head.append(editorStyle);
const editorRevealState=new Map();function restoreEditorReveal(){for(const[node,props]of editorRevealState)for(const[prop,state]of Object.entries(props)){if(state.value)node.style.setProperty(prop,state.value,state.priority);else node.style.removeProperty(prop);}editorRevealState.clear();}function rememberEditorStyle(node,property){let state=editorRevealState.get(node);if(!state){state={};editorRevealState.set(node,state);}if(!state[property])state[property]={value:node.style.getPropertyValue(property),priority:node.style.getPropertyPriority(property)};}function authoredDisplayBeforeNone(node){let result='';const visit=rules=>{for(const rule of rules||[]){if(rule.selectorText)try{if(node.matches(rule.selectorText)){const value=rule.style?.getPropertyValue('display');if(value&&value!=='none')result=value;}}catch{}if(rule.cssRules)visit(rule.cssRules);}};for(const sheet of document.styleSheets)try{visit(sheet.cssRules);}catch{}return result||'block';}function revealEditorNode(node){const computed=getComputedStyle(node);if(computed.display==='none'){rememberEditorStyle(node,'display');node.style.setProperty('display',authoredDisplayBeforeNone(node),'important');node.setAttribute('data-compatible-editor-reveal-display','');}if(computed.visibility==='hidden'||computed.visibility==='collapse'){rememberEditorStyle(node,'visibility');node.style.setProperty('visibility','visible','important');node.setAttribute('data-compatible-editor-reveal-visibility','');}if(computed.opacity==='0'){rememberEditorStyle(node,'opacity');node.style.setProperty('opacity','1','important');node.setAttribute('data-compatible-editor-reveal-opacity','');}if(editorRevealState.has(node))node.setAttribute('data-compatible-editor-reveal','');}
let editorPinnedId = null;
function ensureEditorDetail(selection) {
  const renderer = app.$refs.renderer;
  const ticker = renderer?.$children?.find(child => child.$options?.name === 'Ticker');
  if (!ticker) return;
  if (selection?.scope?.placement !== 'detail') {
    if (editorPinnedId && ticker.pinnedMessage?.id === editorPinnedId) ticker.pinnedMessage = null;
    editorPinnedId = null; return;
  }
  const type = {gift:1,'gift-normal':1,superchat:3,guard:2}[selection.scope.eventType];
  const message = renderer.paidMessages?.find(message => type === undefined || message.type === type);
  if (message && ticker.pinnedMessage?.id !== message.id) { editorPinnedId = message.id; ticker.pinnedMessage = message; }
}

function applyEditorSelection(data,force=false){ if(data?.accentColor)document.documentElement.style.setProperty('--preview-editor-accent',data.accentColor); if(!data || data.readOnly || data.pickEnabled === false)document.querySelectorAll('[data-compatible-editor-hover]').forEach(node=>node.removeAttribute('data-compatible-editor-hover'));ensureEditorDetail(data);const nextSelection=data&&typeof data==='object'?data:null,nextKey=JSON.stringify(nextSelection),shouldScroll=!force&&previewEditorSelectionNeedsScroll(editorSelection,nextSelection);if(!force&&nextKey===editorSelectionKey&&(!nextSelection||document.querySelector('[data-compatible-editor-selected]')))return;restoreEditorReveal();editorSelection=nextSelection;editorSelectionKey=nextKey;document.querySelectorAll('[data-compatible-editor-selected],[data-compatible-editor-reveal],[data-compatible-editor-reveal-display],[data-compatible-editor-reveal-visibility],[data-compatible-editor-reveal-opacity]').forEach(node=>{for(const name of ['data-compatible-editor-selected','data-compatible-editor-reveal','data-compatible-editor-reveal-display','data-compatible-editor-reveal-visibility','data-compatible-editor-reveal-opacity'])node.removeAttribute(name);});editorStyle.textContent=editorSelection&&editorSelection.pickEnabled!==false?'[data-compatible-editor-selected]{outline:2px solid var(--preview-editor-accent,currentColor)!important;outline-offset:-2px!important}':'';if(!editorSelection)return;const scheme=editorSelection.scheme;document.documentElement.dataset.theme=scheme;document.documentElement.classList.toggle('dark',scheme==='dark');document.documentElement.classList.toggle('light',scheme==='light');markPreviewEditorSelection(document,editorSelection,{scroll:shouldScroll,schedule:scheduleEditorFrame,reveal:revealEditorNode});refreshEditorInspection();}
const applyEditorSelectionBase=applyEditorSelection;let editorSelectionStructureKey='';applyEditorSelection=(data,force=false)=>{const next=data&&typeof data==='object'?data:null,key=JSON.stringify(next?Object.fromEntries(Object.entries(next).filter(([name])=>name!=='inspectionRevision')):null);if(!force&&key===editorSelectionStructureKey&&next&&document.querySelector('[data-compatible-editor-selected]')){if(next.inspectionRevision===editorSelection?.inspectionRevision)return;editorSelection=next;refreshEditorInspection();return;}editorSelectionStructureKey=key;applyEditorSelectionBase(next,force);};
const applyEditorSelectionDirect=applyEditorSelection;applyEditorSelection=(data,force=false)=>{const next=data&&typeof data==='object'?data:null;if(next?.scope?.placement==='detail'&&!document.querySelector("[data-openlive-placement='detail']")){const kind=next.scope.eventType==='guard'?'guard':next.scope.eventType==='superchat'?'superchat':'gift',ticker=renderer?.$children?.find(child=>child.$options?.name==='Ticker'),target=document.querySelector(`yt-live-chat-ticker-paid-message-item-renderer[data-openlive-kind='${kind}']`),targetId=target?.dataset?.compatibleEventId,message=(ticker?.showMessages??renderer?.paidMessages??[]).find(item=>String((item?.raw??item)?.id??'')===targetId);if(ticker&&message){ticker.onItemClick(message.raw??message);scheduleEditorFrame(()=>applyEditorSelectionDirect(next,true));return;}}applyEditorSelectionDirect(next,force);};
function pickEditorPart(target, point) { return pickPreviewEditorPart(target, editorSelection?.selectors, point, (part,node)=>!editorSelection?.partPlacements?.[part] || editorSelection.partPlacements[part].includes(editorScopeFor(node,part).placement)); }
const editorCssProperties={visible:'display',color:'color',background:'background-color',fontFamily:'font-family',fontSize:'font-size',lineHeight:'line-height',paddingX:'padding-inline-start',paddingY:'padding-block-start',marginX:'margin-inline-start',marginY:'margin-block-start',gap:'gap',width:'width',height:'height',borderWidth:'border-top-width',borderColor:'border-top-color',borderRadius:'border-top-left-radius',borderImage:'border-image'};
function selectorSpecificity(selector){return(selector.match(/#[\w-]+/g)||[]).length*100+(selector.match(/\.[\w-]+|\[[^\]]+\]|:[\w-]+/g)||[]).length*10+(selector.match(/(^|[\s>+~])\w+/g)||[]).length;}function matchEditorScope(node,selectors,fallback){let best=null;for(const[name,source]of Object.entries(selectors||{}))for(const selector of String(source).split(','))try{const matched=node.closest(selector);if(!matched)continue;let distance=0,current=node;while(current&&current!==matched){distance++;current=current.parentElement;}const candidate={name,distance,specificity:selectorSpecificity(selector),length:selector.length};if(!best||distance<best.distance||distance===best.distance&&(candidate.specificity>best.specificity||candidate.specificity===best.specificity&&candidate.length>best.length))best=candidate;}catch{}return best?.name||fallback;}function authoredEditorValue(node,property){
 let result=node.style?.getPropertyValue(property)||'';
 const visit=rules=>{for(const rule of rules||[]){
  if(rule.media&&!matchMedia(rule.conditionText).matches)continue;
  if(rule.selectorText)try{if(node.matches(rule.selectorText)){const value=rule.style?.getPropertyValue(property);if(value&&(!result.endsWith('!important')||rule.style.getPropertyPriority(property)==='important'))result=value+(rule.style.getPropertyPriority(property)==='important'?' !important':'');}}catch{}
  if(rule.cssRules)visit(rule.cssRules);
 }};
 for(const sheet of document.styleSheets)try{visit(sheet.cssRules);}catch{}
 return result.trim();
}
function editorScopeFor(node,part){const scope=editorSelection.scopeSelectors||{};const placement=matchEditorScope(node,scope.placements,'main');return{part,eventType:matchEditorScope(node,scope.eventsByPlacement?.[placement]||{},'all'),identity:previewEditorIdentity(node,editorSelection),placement};}function inspectEditorNode(picked,requestedScope){const scope=requestedScope||editorScopeFor(picked.node,picked.part),nodes=[];if(requestedScope)for(const node of document.querySelectorAll('[data-compatible-editor-selected]'))nodes.push(node);else for(const selector of editorSelection.selectors?.[picked.part]||[])try{for(const node of document.querySelectorAll(selector)){const candidate=editorScopeFor(node,picked.part);if(candidate.eventType===scope.eventType&&candidate.identity===scope.identity&&candidate.placement===scope.placement&&!nodes.includes(node))nodes.push(node);}}catch{}if(!nodes.length)nodes.push(picked.node);const computed={};for(const property of editorSelection.properties?.[picked.part]||[]){const cssProperty=editorCssProperties[property];if(!cssProperty)continue;const samples=nodes.map((node,index)=>{const style=getComputedStyle(node),parent=node.parentElement?getComputedStyle(node.parentElement):null,authored=index===0?authoredEditorValue(node,cssProperty):(node.style?.getPropertyValue(cssProperty)||'').trim();const value=property==='visible'?String(style.display!=='none'&&style.visibility!=='hidden'&&style.visibility!=='collapse'&&style.opacity!=='0'):(property==='background'&&style.backgroundImage!=='none'?style.background:style.getPropertyValue(cssProperty).trim());return{value,authored,inherited:!authored&&!!parent&&['color','font-family','font-size','line-height'].includes(cssProperty)&&style.getPropertyValue(cssProperty).trim()===parent.getPropertyValue(cssProperty).trim()};});const values=new Set(samples.map(x=>x.value)),units=new Set(samples.map(x=>x.value.match(/[a-z%]+$/i)?.[0]||''));computed[property]={value:samples[0].value,unit:units.size===1?[...units][0]:'',inherited:samples.every(x=>x.inherited),mixed:values.size>1,controlled:samples.some(x=>/!important$/.test(x.authored))};}for(const property of Object.keys(computed))computed[property]=inspectEditorProperty(nodes,property,computed[property]);return{scope,computed,layoutSupported:nodes.every(node=>/flex|grid/.test(getComputedStyle(node).display))};}let cssInspectionTimer;function scheduleCssInspection(){clearTimeout(cssInspectionTimer);cssInspectionTimer=setTimeout(()=>{if(!editorSelection||editorSelection.readOnly)return;if(document.querySelector('[data-compatible-editor-selected]'))refreshEditorInspection();else applyEditorSelection(editorSelection,true);},50);}function refreshEditorInspection(){if(editorSelection?.readOnly)return;const node=document.querySelector('[data-compatible-editor-selected]');if(editorSelection)post('editor-inspected',node?{...inspectEditorNode({part:editorSelection.part,node},editorSelection.scope),refresh:true,inspectionRevision:editorSelection.inspectionRevision}:{scope:editorSelection.scope,computed:{},refresh:true,inspectionRevision:editorSelection.inspectionRevision});}
document.addEventListener('click',event=>{if(editorSelection?.readOnly||!editorSelection?.selectors||editorSelection.pickEnabled===false)return;const target=event.target instanceof Element?event.target:null;if(!target)return;const picked=pickEditorPart(target, {x:event.clientX,y:event.clientY});if(picked){event.preventDefault();event.stopPropagation();post('editor-inspected',{...inspectEditorNode(picked),eventId:picked.node.closest('[data-compatible-event-id]')?.dataset.compatibleEventId});}},true);
let hostOptions={scale:1,tickerEnabled:true,enableBilibiliVideoLinks:false,direction:'bottom',managed:false};
let presentation={layout:[],stickyRecords:[],position:'top',direction:'bottom',animation:{preset:'none',durationMs:0}};
let softwarePaidMessages=[],syncingPresentation=false,fallbackSignature='';
const presentedRows=new WeakSet();
const resources={loaded:[],failed:[]};
document.addEventListener('load',e=>{if(e.target?.tagName==='IMG')resources.loaded.length<1000&&resources.loaded.push(e.target.currentSrc||e.target.src);},true);
document.addEventListener('error',e=>{if(e.target?.tagName==='IMG')resources.failed.length<1000&&resources.failed.push(e.target.currentSrc||e.target.src);},true);
function updateSkin(){
  const href=skinStylesheet(runtime.config.skin);
  const css=href?`@layer default, config, custom; @import url(${JSON.stringify(href)}) layer(default);`:'';
  if(skin.textContent!==css)skin.textContent=css;
}
function stopSimulation(){if(simulationSession)runtime.config={...runtime.config,mergeGift:false,mergeSimilarDanmaku:false};simulationSession=null;}
function simulation(){stopSimulation();}
function beginSimulation(data){previewWindow.cancel();simulationSession=data.session;runtime.reset();simulationProjection=null;
 simulationRenderer={...runtime.config,mergeGift:true,mergeSimilarDanmaku:data.mergeSameDanmu===true,messages:[],paidMessages:[],messagesBuffer:[],smoothedMessageQueue:[],emitSmoothedMessageTimerId:1,$children:[], $nextTick(){},flushMessagesBuffer(){},addMessage(message){message.addTime=new Date();this.messages.push(message);}};
 for(const name of ['forEachRecentMessage','mergeSimilarText','mergeSimilarGift','mergeSimilarLike'])simulationRenderer[name]=runtime.sourceMethods[name].bind(simulationRenderer);
}
function generateSimulation(data){
 if(destroyed||!simulationSession||data.session!==simulationSession)return;
 const record=bindSimulationIdentity(data.record ?? simulationGenerator.next(data),data.session,data.sequence);
 if(!record)return;
 if(data.verifiedOnly)record.payload.isMobileVerified=true;
 if(data.manualOnly)record.payload.isGiftDanmaku=false;
 const displayRenderer=runtime.renderer;
 runtime.config={...runtime.config,mergeGift:true,mergeSimilarDanmaku:data.mergeSameDanmu===true};
 runtime.renderer=simulationRenderer;
 try{runtime.receive(record);for(const rec of runtime.records.values()){rec.addTime??=rec.event.receivedAt;rec.delivered=true;rec.lane='main';}runtime.recompute();simulationProjection=runtime.snapshot();}
 finally{runtime.renderer=displayRenderer;}
}

function stats(){return {retainedRecords:runtime.records.size,droppedRecords:runtime.droppedRecords,queued:runtime.renderer.smoothedMessageQueue.length,messages:runtime.renderer.messages.length,ticker:runtime.renderer.paidMessages.length,sourceCommit:'0da8c94d40a8791bb212985f6ac0ae55765c3a03'};}
const renderer=app.$refs.renderer;
const tickerRenderer=renderer.$children.find(child=>child.$options.name==='Ticker');
const sourceTickerEnter=tickerRenderer.onTickerItemEnter.bind(tickerRenderer);
const sourceTickerLeave=tickerRenderer.onTickerItemLeave.bind(tickerRenderer);
tickerRenderer.onTickerItemEnter=(node,done)=>sourceTickerEnter(node,()=>{node.style.width='auto';done();});
tickerRenderer.onTickerItemLeave=(node,done)=>{
  node.style.width=`${node.clientWidth}px`;
  return sourceTickerLeave(node,done);
};
app.$watch(()=>renderer.paidMessages,()=>Vue.nextTick(updateTicker),{deep:true});
const sourceCanScroll=renderer.canScrollToBottomOrTimedOut.bind(renderer),sourceScrollToBottom=renderer.scrollToBottom.bind(renderer),sourceShowNewMessages=renderer.showNewMessages.bind(renderer);
renderer.canScrollToBottomOrTimedOut=function(){return stopPreviewWatch?true:sourceCanScroll();};
renderer.scrollToBottom=function(){if(stopPreviewWatch&&!this.atBottom)return;return sourceScrollToBottom();};
renderer.showNewMessages=function(){if(stopPreviewWatch&&!this.atBottom){this.resetSmoothScroll();this.maybeResizeScrollContainer();return;}return sourceShowNewMessages();};
previewWindow=createPreviewWindow({windowSize:40,renderer,scroller:document.getElementById('item-scroller'),hydrate:async records=>{capturePreview(false);try{await runtime.hydrate(records);}finally{if(stopPreviewWatch)capturePreview(true);}},afterRender:async()=>{await Vue.nextTick();renderer.maybeResizeScrollContainer();syncRows();}});


function kindOf(message){return message?.sourceKind==='like'?'like':message?.type===0?'danmaku':message?.type===1?'gift':message?.type===2?'guard':message?.type===3?'superchat':'unknown';}
function decorate(row,message,placement='main',force=false){
  if(!row||!message||(!force&&row.dataset.compatibleEventId))return;row.dataset.compatibleEventId=message.id;row.dataset.openliveKind=kindOf(message);row.dataset.openlivePlacement=placement;
  if(typeof message.medalLighted==='boolean')row.dataset.openliveMedalLighted=String(message.medalLighted);
  if(typeof message.isCurrentRoom==='boolean')row.dataset.openliveMedalCurrentRoom=String(message.isCurrentRoom);
  if(message.type===1)row.dataset.openliveGiftKind='normal';
}
function bindStableRows(nodes,messages,placement){
  const occupied=new Set(nodes.map(node=>node.dataset.compatibleEventId).filter(Boolean));
  const available=messages.filter(message=>message?.id&&!occupied.has(String(message.id)));
  for(const node of nodes)if(!node.dataset.compatibleEventId)decorate(node,available.shift(),placement);
}
function syncMembershipTickerText(rows){
  for(const row of rows){
    if(row.getAttribute('type')!=='2')continue;
    const content=row.querySelector('#content'),text=row.querySelector('#text');
    if(!content||!text)continue;
    const hasThemeLabel=[content,text].some(node=>['::before','::after'].some(pseudo=>{
      const value=getComputedStyle(node,pseudo).content;
      return value&& !['none','normal','""',"''"].includes(value)&&!value.startsWith('url(');
    }));
    const label=hasThemeLabel?'':'会员';
    if(text.textContent!==label)text.textContent=label;
  }
}
function syncRows(){
 for(const img of document.querySelectorAll('img.emoji'))if(img.complete&&img.naturalWidth)img.classList.toggle('blc-large-emoji',img.naturalHeight>=100||(img.naturalHeight>0&&img.naturalWidth>=img.naturalHeight*2));
  const rows=[...document.querySelectorAll('#chat-items > *:not([data-compatible-fallback-id])')];bindStableRows(rows,renderer.messages,'main');
  const ticker=renderer.$children?.find(child=>child.$options?.name==='Ticker');
  const tickerMessages=(ticker?.showMessages??renderer.paidMessages).map(message=>message?.raw??message);
  const tickerRows=[...document.querySelectorAll('yt-live-chat-ticker-renderer yt-live-chat-ticker-paid-message-item-renderer')];bindStableRows(tickerRows,tickerMessages,'sticky');
  syncMembershipTickerText(tickerRows);
  const pinned=document.querySelector('yt-live-chat-ticker-renderer > yt-live-chat-paid-message-renderer,yt-live-chat-ticker-renderer > yt-live-chat-membership-item-renderer');
  if(pinned&&ticker?.pinnedMessage)decorate(pinned,ticker.pinnedMessage,'detail',true);
  const recalled = new Set(presentation.layout.filter(item => item.recalled).map(item => item.eventId));
  for (const row of rows) reconcileCompatibleRecall(row, recalled.has(row.dataset.compatibleEventId));
  syncPresentation();
  if(editorSelection)applyEditorSelection(editorSelection,true);
}
const observer=new MutationObserver(syncRows);observer.observe(document.body,{childList:true,subtree:true});
function listRoot(){return document.querySelector('#chat-items');}
function moveLegacyPresentationRow(items,node,next){
  const animations=presentedRows.has(node)?node.getAnimations({subtree:true})
    .filter(animation=>animation instanceof CSSAnimation)
    .map(animation=>({target:animation.effect.target,pseudo:animation.effect.pseudoElement,
      name:animation.animationName,time:animation.currentTime,paused:animation.playState==='paused'})):null;
  items.insertBefore(node,next);
  if(!animations)return;
  for(const animation of node.getAnimations({subtree:true})){
    if(!(animation instanceof CSSAnimation))continue;
    const index=animations.findIndex(previous=>previous.target===animation.effect.target
      &&previous.pseudo===animation.effect.pseudoElement&&previous.name===animation.animationName);
    // Finished non-filling entries are absent from the pre-move animation list.
    if(index<0){animation.cancel();continue;}
    const [previous]=animations.splice(index,1);
    animation.currentTime=previous.time;
    if(previous.paused)animation.pause();
  }
}
function syncPresentation(){
  if(syncingPresentation)return;const items=listRoot();if(!items)return;syncingPresentation=true;
  try{
    const source=new Map([...items.children].filter(node=>node.dataset.compatibleEventId&&!node.dataset.compatibleFallbackId).map(node=>[node.dataset.compatibleEventId,node]));
    const wanted=new Set(),desired=[];
    for(const item of presentation.layout){let node;if(item.kind==='fallback'){wanted.add(item.eventId);node=[...items.querySelectorAll('[data-compatible-fallback-id]')].find(value=>value.dataset.compatibleFallbackId===item.eventId);if(!node){node=document.createElement('div');node.className='bb-compatible-fallback-slot';node.dataset.compatibleFallbackId=item.eventId;node.dataset.compatibleEventId=item.eventId;}}else node=source.get(item.eventId);if(node){node.dataset.compatibleEventRemoving=item.removing===true?'true':'false';applyEventTransition(node,presentation.animation,item.removing===true);desired.push(node);}}
    if(!hostOptions.managed&&presentation.contentAlignment){const messages=renderer.messages.slice();if((hostOptions.direction==='top')===(runtime.config.danmakuAtBottom!==false))messages.reverse();desired.push(...messages.map(message=>source.get(message.id)).filter(node=>node&&!desired.includes(node)));}
    for(const node of items.querySelectorAll('[data-compatible-fallback-id]'))if(!wanted.has(node.dataset.compatibleFallbackId))node.remove();
    const current=[...items.children].filter(node=>desired.includes(node));
    if(current.length!==desired.length||current.some((node,index)=>node!==desired[index])){
      // Move only necessary rows and preserve their animation progress.
      let previous=null;
      for(const node of desired){
        const next=previous?previous.nextSibling:items.firstChild;
        if(node!==next){
          if(node.parentNode===items&&items.moveBefore)items.moveBefore(node,next);
          else moveLegacyPresentationRow(items,node,next);
        }
        previous=node;
      }
    }
    const entering=desired.filter(node=>!presentedRows.has(node));
    if(entering.length)requestAnimationFrame(()=>requestAnimationFrame(()=>{
      for(const node of entering)presentedRows.add(node);
    }));
    const signature=[...wanted].join('\n');if(signature!==fallbackSignature){fallbackSignature=signature;post('fallback-slots-ready',{ids:[...wanted]});}
  }finally{syncingPresentation=false;}
}
function postScrollState(userInitiated=false){
  const scroller=document.getElementById('item-scroller');if(!scroller)return;const latest=hostOptions.direction==='top'?scroller.scrollTop<=4:scroller.scrollHeight-scroller.scrollTop-scroller.clientHeight<=4;
  const rows=[...(listRoot()?.querySelectorAll('[data-compatible-event-id]')??[])],first=rows.find(row=>row.getBoundingClientRect().bottom>scroller.getBoundingClientRect().top);
  post('scroll-state',{userInitiated,followingLatest:latest,scrollTop:scroller.scrollTop,scrollHeight:scroller.scrollHeight,clientHeight:scroller.clientHeight,anchorId:first?.dataset.compatibleEventId,anchorOffset:first?first.getBoundingClientRect().top-scroller.getBoundingClientRect().top:0,nearStart:scroller.scrollTop<=80,nearEnd:scroller.scrollHeight-scroller.scrollTop-scroller.clientHeight<=80});
}
const scroller=document.getElementById('item-scroller');let userScroll=false,pointerScroll=false,keyboardScroll=false;
function syncListContentWidth(){if(scroller&&hostOptions.managed)scroller.style.setProperty('overflow-y','auto','important');const width=scroller?.clientWidth;if(width>0)document.documentElement.style.setProperty('--bb-list-content-width',`${width}px`);}
const listContentResizeObserver=scroller&&typeof ResizeObserver==='function'?new ResizeObserver(syncListContentWidth):null;listContentResizeObserver?.observe(scroller);window.addEventListener('resize',syncListContentWidth);requestAnimationFrame(syncListContentWidth);
const tickerScroller=document.querySelector('yt-live-chat-ticker-renderer > #container');
function scrollTickerWithWheel(event,target){event.stopImmediatePropagation();const max=target.scrollWidth-target.clientWidth;if(max<=0)return;const delta=Math.abs(event.deltaX)>Math.abs(event.deltaY)?event.deltaX:event.deltaY;if(!delta)return;const current=target.scrollLeft;if(delta>0&&current>=max-1||delta<0&&current<=1)return;const next=Math.max(0,Math.min(max,current+delta));if(next===current)return;target.scrollLeft=next;event.preventDefault();}
tickerScroller?.addEventListener('wheel',event=>scrollTickerWithWheel(event,tickerScroller),{passive:false,capture:true});
scroller?.addEventListener('wheel',()=>{userScroll=true;},{passive:true});scroller?.addEventListener('keydown',event=>{if(hostOptions.managed&&(hostOptions.direction==='top'?event.key==='Home':event.key==='End')){event.preventDefault();if(previewWindow?.active)void previewWindow.latest().then(()=>scrollLatest());else post('scroll-latest-request');return;}if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key))keyboardScroll=true;});scroller?.addEventListener('scrollend',()=>{keyboardScroll=false;});scroller?.addEventListener('pointerdown',()=>{pointerScroll=true;});document.addEventListener('pointerup',()=>{pointerScroll=false;});scroller?.addEventListener('scroll',()=>{postScrollState(pointerScroll||userScroll||keyboardScroll);if(!pointerScroll)userScroll=false;});
scroller?.addEventListener('wheel',event=>{if(stopPreviewWatch&&event.deltaY<0&&scroller.scrollHeight>scroller.clientHeight+1){renderer.atBottom=false;renderer.resetSmoothScroll();}if(!previewWindow.active)return;if(event.deltaY<0&&scroller.scrollTop<=80)void previewWindow.move(hostOptions.direction==='top'?'forward':'backward');else if(event.deltaY>0&&scroller.scrollHeight-scroller.clientHeight-scroller.scrollTop<=80)void previewWindow.move(hostOptions.direction==='top'?'backward':'forward');},{passive:true});
scroller?.addEventListener('scroll',()=>{if(!previewWindow.active||!pointerScroll&&!keyboardScroll)return;if(scroller.scrollTop<=80)void previewWindow.move(hostOptions.direction==='top'?'forward':'backward');else if(scroller.scrollHeight-scroller.clientHeight-scroller.scrollTop<=80)void previewWindow.move(hostOptions.direction==='top'?'backward':'forward');});
async function applyHost(data){
  if(!data||typeof data!=='object')throw Error('宿主显示设置无效');const scale=Number(data.scale);if(!Number.isFinite(scale)||scale<=0)throw Error('宿主显示缩放无效');
  hostOptions={scale,tickerEnabled:data.tickerEnabled!==false,enableBilibiliVideoLinks:data.enableBilibiliVideoLinks===true,direction:data.direction==='top'?'top':'bottom',managed:data.managed===true};if(data.contentAlignment)presentation.contentAlignment=data.contentAlignment==='bottom'?'bottom':'top';document.body.dataset.bbHostRenderMode=data.renderMode==='dashboard'?'dashboard':'output';runtime.managedTicker=hostOptions.managed;document.body.dataset.bbHostManaged=String(hostOptions.managed);document.body.dataset.bbHostDirection=hostOptions.direction;if(hostOptions.managed)scroller?.setAttribute('tabindex','0');else scroller?.removeAttribute('tabindex');document.body.style.zoom=String(scale);await syncManagedDirection();updateTicker();syncPresentation();syncListContentWidth();postScrollState();
}
async function syncManagedDirection(){if(!hostOptions.managed)return;const danmakuAtBottom=hostOptions.direction!=='top';if(runtime.config.danmakuAtBottom===danmakuAtBottom)return;const config={...runtime.config,danmakuAtBottom};app.config=checkConfig({},config);runtime.setConfig(config);await Vue.nextTick();}
function updateTicker(){const ticker=document.querySelector('yt-live-chat-ticker-renderer');if(ticker)ticker.hidden=!hostOptions.tickerEnabled||!(ticker.__vue__?.showMessages?.length);document.documentElement.dataset.tickerPosition=presentation.position;const animation=EVENT_TRANSITION_CSS;const reading='body[data-bb-preview-reading="true"] #item-scroller.yt-live-chat-item-list-renderer{overflow-y:auto!important;justify-content:flex-start!important}body[data-bb-preview-reading="true"] #item-offset.yt-live-chat-item-list-renderer{height:auto!important;flex:none!important}body[data-bb-preview-reading="true"] #item-scroller.animated.yt-live-chat-item-list-renderer #items.yt-live-chat-item-list-renderer{position:relative!important;inset:auto!important;flex:none!important}';const alignment = (hostOptions.managed || presentation.contentAlignment) ? `#item-scroller.yt-live-chat-item-list-renderer{display:flex!important;flex-direction:column!important;justify-content:flex-start!important}#item-offset.yt-live-chat-item-list-renderer{height:auto!important;flex:none!important;margin-top:${presentation.contentAlignment === 'bottom' ? 'auto' : '0'}!important}#item-scroller.animated.yt-live-chat-item-list-renderer #items.yt-live-chat-item-list-renderer{position:relative!important;inset:auto!important;flex:none!important}` : '';hostStyle.textContent=`${hostOptions.tickerEnabled?'':'yt-live-chat-ticker-renderer{display:none!important}'}${presentation.position==='bottom'?'yt-live-chat-renderer{display:flex!important;flex-direction:column!important}yt-live-chat-item-list-renderer{flex:1 1 auto!important;min-height:0!important}yt-live-chat-ticker-renderer{order:2!important;flex:none!important}':''}${animation}${reading}${alignment}${COMPATIBLE_RECALL_CSS}`;}
async function applyPresentation(data){
  if(!data||!Array.isArray(data.layout)||!Array.isArray(data.stickyRecords))throw Error('来源呈现窗口无效');const preset=['none','fade','lift','scale','slide'].includes(data.animation?.preset)?data.animation.preset:'none',durationMs=Number.isFinite(data.animation?.durationMs)?Math.max(0,data.animation.durationMs):0;presentation={layout:data.layout.filter(item=>item&&typeof item.eventId==='string'&&(item.kind==='source'||item.kind==='fallback')).map(item=>({...item,removing:item.removing===true,recalled:item.recalled===true})),stickyRecords:data.stickyRecords.filter(item=>item?.record&&Number.isFinite(item.startedAt)&&Number.isFinite(item.expiresAt)),position:data.position==='bottom'?'bottom':'top',direction:data.direction==='top'?'top':'bottom',contentAlignment:data.contentAlignment==='bottom'?'bottom':'top',animation:{preset,durationMs}};hostOptions.direction=presentation.direction;fallbackSignature='';
  await syncManagedDirection();softwarePaidMessages=presentation.stickyRecords.flatMap(item=>{const message=projectCallback(item.record,runtime.config);return message?[{...message,addTime:new Date(item.startedAt),bbHostStartedAt:item.startedAt,bbHostExpiresAt:item.expiresAt}]:[];});renderer.paidMessages=softwarePaidMessages.slice();const ticker=renderer.$children?.find(child=>child.$options?.name==='Ticker');if(ticker&&!ticker.__bbHostTiming){const sourceNeed=ticker.needToShow?.bind(ticker),sourcePin=ticker.getPinTime?.bind(ticker);ticker.needToShow=message=>Number.isFinite(message?.bbHostExpiresAt)?Date.now()<message.bbHostExpiresAt:sourceNeed?.(message);ticker.getPinTime=message=>Number.isFinite(message?.bbHostExpiresAt)&&Number.isFinite(message?.bbHostStartedAt)?Math.max(1/60000,(message.bbHostExpiresAt-message.bbHostStartedAt)/60000):sourcePin?.(message);ticker.__bbHostTiming=true;}syncRows();updateTicker();post('presented',{count:presentation.layout.length});
}
function locate(data){const eventId=data?.eventId,row=[...document.querySelectorAll('[data-compatible-event-id]')].find(node=>node.dataset.compatibleEventId===eventId);document.querySelectorAll('[data-compatible-located]').forEach(node=>node.removeAttribute('data-compatible-located'));if(row){row.setAttribute('data-compatible-located','');row.scrollIntoView?.({block:'center'});}post('located',{eventId,found:!!row});postScrollState();}
async function scrollLatest(){if(renderer.onLeave)await new Promise(resolve=>{const stop=renderer.$watch('onLeave',leaving=>{if(!leaving){stop();resolve();}});});renderer.atBottom=true;await renderer.flushMessagesBuffer();await Vue.nextTick();const node=document.getElementById('item-scroller');if(node)node.scrollTop=hostOptions.direction==='top'?0:node.scrollHeight;postScrollState();}
async function restoreScroll(data){if(data?.followingLatest){await scrollLatest();return;}const node=document.getElementById('item-scroller');if(!node)return;const anchor=data?.anchorId&&[...document.querySelectorAll('[data-compatible-event-id]')].find(row=>row.dataset.compatibleEventId===data.anchorId);if(anchor&&Number.isFinite(data.anchorOffset))node.scrollTop+=anchor.getBoundingClientRect().top-node.getBoundingClientRect().top-data.anchorOffset;else if(Number.isFinite(data?.scrollTop))node.scrollTop=data.scrollTop;postScrollState();}
function actionRow(target){return target.closest?.('[data-compatible-event-id]');}
function videoHref(target){const message=target.closest?.('#message');if(!message||!message.contains(target))return null;const match=String(target.textContent||'').match(/(?:^|[^0-9A-Za-z])((?:av\d+|bv[0-9A-Za-z]{10}))(?![0-9A-Za-z])/i);if(!match)return null;const value=match[1],id=value.slice(0,2).toLowerCase()==='av'?`av${value.slice(2)}`:`BV${value.slice(2)}`;return `https://www.bilibili.com/video/${id}`;}
document.addEventListener('click',event=>{const row=actionRow(event.target);if(!row)return;const link=event.target.closest?.('a[href]');if(link&&hostOptions.enableBilibiliVideoLinks){event.preventDefault();post('action',{eventId:row.dataset.compatibleEventId,action:{type:'open-link',href:link.href}});return;}const href=hostOptions.enableBilibiliVideoLinks&&videoHref(event.target);if(href){event.preventDefault();post('action',{eventId:row.dataset.compatibleEventId,action:{type:'open-link',href}});return;}if(event.target.closest?.('#author-name'))post('action',{eventId:row.dataset.compatibleEventId,action:'filter-user'});});
document.addEventListener('contextmenu',event=>{const row=actionRow(event.target);if(!row)return;event.preventDefault();post('context-menu',{eventId:row.dataset.compatibleEventId,x:event.clientX,y:event.clientY});});
document.addEventListener('pointerdown',event=>{if(event.button!==2)post('pointer-down',{});},true);
async function command(command,data){
  if(command==='preview-observe'){observePreview(data);return;}
 else if(command==='preview-present'){
  applyPreviewPresentation(renderer,data,previewWindow);
  await Vue.nextTick();syncRows();return;
 }else if(command==='event-batch'){presentation=data.presentation;
  if(hostOptions.managed){
    const retained=new Set(presentation.layout.map(item=>item.eventId));
    for(const[id,record]of runtime.records)if(!retained.has(id)){runtime.records.delete(id);runtime.bytes-=record.bytes;}
  }
  for(const record of data.records)runtime.receive(record);if(hostOptions.managed){for(const rec of runtime.records.values()){rec.addTime??=rec.event.receivedAt;rec.delivered=true;rec.lane='main';}if(renderer.emitSmoothedMessageTimerId)clearTimeout(renderer.emitSmoothedMessageTimerId);renderer.emitSmoothedMessageTimerId=null;runtime.recompute();renderer.messages.push(...renderer.messagesBuffer);renderer.messagesBuffer=[];}await Vue.nextTick();await applyPresentation(data.presentation);
 }else if(command==='event'){runtime.receive(data);}
  else if(command==='config'){
    const config=checkEngineConfig(data,runtime.config),effective=hostOptions.managed?{...config,danmakuAtBottom:hostOptions.direction!=='top'}:config;app.config=checkConfig({},effective);await Vue.nextTick();runtime.setConfig(effective);updateSkin();updateTicker();
  }else if(command==='css'){
    if(typeof data?.css!=='string')throw Error('OpenLive CSS must be text');
    if(data.appearanceCss!==undefined&&typeof data.appearanceCss!=='string')throw Error('OpenLive appearance CSS must be text');
    const nextAppearance=composeCompatibleCssLayers([[data.appearanceCss??'','config']]),nextCustom=composeCompatibleCssLayers([[data.css,'custom']]);
    if(appearance.textContent!==nextAppearance)appearance.textContent=nextAppearance;if(custom.textContent!==nextCustom)custom.textContent=nextCustom;if(editorSelection&&Number.isSafeInteger(data.inspectionRevision))editorSelection={...editorSelection,inspectionRevision:data.inspectionRevision};await Vue.nextTick();if(editorSelection&&!editorSelection.readOnly)scheduleCssInspection();
  }else if(command==='hydrate'||command==='preview-window'){
    if(hostOptions.managed&&data?.presentation)presentation=data.presentation;
    stopSimulation();if(command==='preview-window'||(!hostOptions.managed&&stopPreviewWatch&&data?.records?.length>120)){await previewWindow.replace(data.records,{fromStart:command==='preview-window'});}else await runtime.hydrate(data?.records,{deletedSuperChatIds:data?.deletedSuperChatIds??[],deletionOverflow:data?.deletionOverflow===true});await Vue.nextTick();syncRows();if(hostOptions.managed&&data?.presentation)await applyPresentation(data.presentation);post('hydrated',{count:runtime.records.size});
  }else if(command==='reset'){stopSimulation();runtime.reset();}
  else if(command==='simulation-begin')beginSimulation(data);
  else if(command==='simulation-next')generateSimulation(data);
  else if(command==='simulation')await simulation(data);
  else if(command==='host')await applyHost(data);
  else if(command==='presentation'){await applyPresentation(data);return;}
  else if(command==='locate'){if(previewWindow.active)await previewWindow.locate(data?.eventId);locate(data);return;}
  else if(command==='scroll-latest'){if(previewWindow.active)await previewWindow.latest();await scrollLatest();return;}
  else if(command==='restore-scroll'){if(previewWindow.active){if(data?.followingLatest)await previewWindow.latest();else if(data?.anchorId)await previewWindow.locate(data.anchorId);}await restoreScroll(data);return;}
  else if(command==='snapshot'||command==='inspect'){post('snapshot',{...runtime.snapshot(),resources});return;}
  else if(command==='editor-select'){applyEditorSelection(data);return;}
  else return;
  post('status',stats());
}
// Each command is serialized across Vue ticks. Config followed by event cannot observe stale props.
let tail=Promise.resolve();
const onHostMessage=event=>{
  if(!acceptsParentMessage(event,window.parent,parentOrigin))return;
  const {command:verb,data}=event.data;
  if((verb==='reset'||verb==='hydrate'||verb==='preview-window'||verb==='preview-present'||verb==='simulation'&&data?.enabled)&&previewWindow.active){previewWindow.cancel();++runtime.scopeEpoch;if(stopPreviewWatch)capturePreview(true);}
  tail=tail.then(()=>command(verb,data)).catch(error=>post('error',{code:'invalid-command',message:error.message}));
};
window.addEventListener('message',onHostMessage);
window.addEventListener('pagehide',event=>{if(!event.persisted){destroyed=true;clearTimeout(cssInspectionTimer);window.removeEventListener('message',onHostMessage);window.removeEventListener('resize',syncListContentWidth);listContentResizeObserver?.disconnect();for(const frame of editorFrames)cancelAnimationFrame(frame);editorFrames.clear();stopSimulation();observer.disconnect();restoreEditorReveal();app.$destroy();}});
// Internal component objects are intentionally not a native SDK or external HTML-template handshake.
if(new URLSearchParams(location.search).get('qa')==='1')window.__bbOpenLiveQA={getRuntime:()=>runtime,getRenderer:()=>app.$refs.renderer,getResources:()=>resources};
post('ready',{sourceCommit:'0da8c94d40a8791bb212985f6ac0ae55765c3a03',renderer:'openlive-mit-vue2',retainedSettings:Object.keys(DEFAULT_CONFIG)});

installPreviewEditorHover(document, event => editorSelection?.readOnly || editorSelection?.pickEnabled === false || !editorSelection?.selectors ? null : pickEditorPart(event.target, {x:event.clientX,y:event.clientY}));

document.addEventListener('load', event => { if(event.target instanceof HTMLImageElement && event.target.matches('img.emoji'))syncRows(); },true);
