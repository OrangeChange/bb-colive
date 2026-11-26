import { COMPATIBLE_RECALL_CSS, reconcileCompatibleRecall } from '../../../../public/compatibleEventStatus.mjs';
import { pickPreviewEditorPart, installPreviewEditorHover } from '../../../../public/previewEditorHit.mjs';
import { inspectEditorProperty } from "../../editorPropertyInspection.mjs";
import {setLaplaceEventMedia,laplaceEventMediaSources} from './eventMedia';
import { laplaceEditorIdentity } from "./editorIdentity";
import { flowGeometry } from "./flowGeometry";
import { EVENT_TRANSITION_CSS, applyEventTransition } from '../../../../public/eventTransitions.mjs';
import { composeLaplaceFrameCustomCss, LAPLACE_LAYER_ORDER } from '../cssCascade';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { reuseObsEvents, sameObsValue } from '../../../obs/useObsEventTransitions';
import { Flipper, Flipped, OriginalScrollArea, useOriginalStyle } from './independent/platform';
// @ts-expect-error Source extraction runtime adapter, no upstream application code.
import { assetLedger, resolveLaplaceRenderSettings } from './runtime-context.mjs';
import { getOriginalSamples, generateOriginalSimulationEvent } from './samples';
import { bindLaplaceStableEventRoots } from './stableRoots';
import { hasLaplaceThemeEntryMotion } from './entryMotion';
import { splitBilibiliVideoText } from '../../../components/bilibiliVideoLinks';
import { attachLaplaceLayoutFollowing, laplaceAutoScrollBehavior } from './layoutFollowing';
import { isLaplaceControlMessage, isLaplaceRenderEnvelope, laplaceConnectionModeClass, LAPLACE_CHANNEL, LAPLACE_BRIDGE_VERSION, type LaplaceRenderMessage, type LaplaceRendererReply } from './bridge';

type RenderExports = { implementation?: 'independent'; supportsProductElements?: true; LaplaceEventRenderer: React.ComponentType<{ data: LaplaceRenderMessage['events'][number]; as: string; mode: string }>; LaplaceRenderContext: React.Context<Record<string, unknown>>; defaultOptions: Record<string, unknown> };
const originalScrollbarClasses = '_eventList_1yte6_2 event-list';
const decoratedVideoText = new WeakMap<Element, Text>();
function clearVideoLinks(root: ParentNode) {
  root.querySelectorAll<HTMLElement>('[data-laplace-video-decoration]').forEach(decoration => {
    const original = decoratedVideoText.get(decoration);
    if (original) decoration.replaceWith(original);
    else decoration.replaceWith(document.createTextNode(decoration.textContent ?? ''));
  });
}
function reconcileVideoLinks(root: ParentNode, enabled: boolean) {
  if (!enabled) { clearVideoLinks(root); return; }
  root.querySelectorAll<HTMLElement>('.event-list .message,.event-list .message-text,.event-list .message-content').forEach(message => {
    const walker = document.createTreeWalker(message, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) if (!(walker.currentNode.parentElement?.closest('a'))) nodes.push(walker.currentNode as Text);
    for (const node of nodes) {
      const parts = splitBilibiliVideoText(node.data);
      if (!parts.some(part => part.type === 'video')) continue;
      const decoration = document.createElement('span'); decoration.dataset.laplaceVideoDecoration = '';
      decoratedVideoText.set(decoration,node);
      for (const part of parts) if (part.type === 'text') decoration.append(part.value); else {
        const link = document.createElement('a'); link.href = part.href; link.textContent = part.value; link.dataset.laplaceVideoLink = ''; link.className = 'bilibili-video-link'; decoration.append(link);
      }
      node.replaceWith(decoration);
    }
  });
}

function reconcileRepeatCounts(root: ParentNode, events: readonly Record<string, any>[]) {
  for (const event of events) {
    const row = root.querySelector<HTMLElement>(`[data-event-id="${CSS.escape(String(event.id))}"]`);
    const existing = row?.querySelector<HTMLElement>('[data-host-repeat-count]');
    const repeatCount = Number(event.hostRepeatCount ?? 0);
    if (!row || repeatCount <= 1 || !event.emote?.url) { existing?.remove(); continue; }
    const message = row.querySelector<HTMLElement>('.message');
    if (!message) continue;
    const badge = existing ?? document.createElement('span');
    badge.dataset.hostRepeatCount = String(repeatCount);
    badge.textContent = ` ×${repeatCount}`;
    if (!existing) message.append(badge);
  }
}
export function startFrame(role: 'candidate' | 'reference', renderer: RenderExports) {
  if (role === 'candidate') {
    for (const link of document.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')) {
      if (new URL(link.href).pathname.endsWith('/default.css')) {
        const css = `${LAPLACE_LAYER_ORDER}\n@import url(${JSON.stringify(link.href)}) layer(default);`;
        link.href = `data:text/css,${encodeURIComponent(css)}`;
      }
    }
  }
  const query = new URLSearchParams(location.search);
  const generation = Number(query.get('generation') || 0);
  let sequence = -1;
  let last: LaplaceRenderMessage | null = null;
  let origin = '';
  const requestedOrigin = query.get('parentOrigin') || document.referrer;
  try {
    const parsed = new URL(requestedOrigin);
    // Referrers may contain a path/query. Compare and send to the parsed
    // origin, while still rejecting opaque/file origins.
    if (parsed.origin !== 'null' && /^[a-z][a-z\d+.-]*:\/\/[^/]+$/i.test(parsed.origin)) origin = parsed.origin;
  } catch { /* Standalone QA has no parent authority. */ }
  const sendReply = (reply: Omit<LaplaceRendererReply, 'channel' | 'version' | 'generation' | 'sequence'>) => {
    if (parent !== window && origin) parent.postMessage({ channel:LAPLACE_CHANNEL,version:LAPLACE_BRIDGE_VERSION,generation,sequence:Math.max(0,sequence),...reply }, origin);
  };
  const rootElement = document.getElementById('root');
  if (!rootElement) throw new Error('Root container #root not found');
  const root = createRoot(rootElement);
  let decorationObserver: MutationObserver | null = null;
  let decorationSuspended = false;
  const controlState = { followingLatest: true, locatedEventId: undefined as string | undefined, restoredEventId: undefined as string | undefined, restoredAnchorOffset: undefined as number | undefined };
  let controls: { locate(eventId: string): void; scrollToLatest(): void; restoreScroll(eventId?: string, scrollTop?: number, anchorOffset?: number, followingLatest?: boolean): void } | null = null;
  function styleValues(message: LaplaceRenderMessage, customCss: string) {
    const size=message.settings.baseFontSize;
    const effective=size?Math.max(12,Number(size)):20;
    const appearance=message.appearance;
    const bg=message.preview?appearance?.demoBgColor:'';
    const hue=appearance?.uiHue;
    const chroma=appearance?.uiChroma;
    const configLayer=role==='candidate'?'config':'custom-css';
    const values=[`@layer ${configLayer} {\n      :root {\n        --event-font-size: ${effective}px;\n      }\n    }\n    `,
      `@layer ${configLayer} {\n      :root,\n      [data-theme='dark'] {\n        ${bg?`--demo-bg: ${bg}; --demo-bg-alt: ${bg};`:''}\n      }\n    }\n    `,
      `@layer ${configLayer} {\n      :root,\n      [data-theme='dark'] {\n        ${hue&&typeof hue==='number'?`--primary-h: ${hue};\n              --secondary-h: ${hue};`:''}\n        ${chroma&&typeof chroma==='number'?`--secondary-c: ${chroma};`:''}\n      }\n    }\n    `,
      message.css.cloud,message.css.remote,customCss,
      `${message.contentAlignment ? `@layer utilities{.scroll-area>div{min-block-size:100%;align-content:${message.contentAlignment === 'bottom' ? 'flex-end' : 'flex-start'}}}` : ''}
      ${message.tickerPosition ? '@layer utilities{.events-list-wrap>.gift-sticky-bar{order:0!important}.events-list-wrap>.event-list{order:0!important}}' : ''}
      ${EVENT_TRANSITION_CSS}
      ${COMPATIBLE_RECALL_CSS}
      `];
    return values;
  }
  const {LaplaceEventRenderer:SourceEvent,LaplaceRenderContext:Context,defaultOptions}=renderer;
  const Event=React.memo(({mediaSources:_,...props}:{mediaSources:string[];data:LaplaceRenderMessage['events'][number];as:string;mode:string})=>React.createElement(SourceEvent,{...props,data:{...props.data}}),
    (a,b)=>a.data===b.data&&a.as===b.as&&a.mode===b.mode&&a.mediaSources.length===b.mediaSources.length&&a.mediaSources.every((url,index)=>url===b.mediaSources[index]));
  class RenderBoundary extends React.Component<{ message: LaplaceRenderMessage; children: React.ReactNode }, { error: string | null }> {
    state={error:null as string|null};
    static getDerivedStateFromError(error: Error){return {error:error.message};}
    componentDidCatch(error: Error){sendReply({type:'error',message:error.message,mode:role});}
    componentDidUpdate(previous: {message:LaplaceRenderMessage}){if(previous.message.sequence!==this.props.message.sequence&&this.state.error)this.setState({error:null});}
    render(){return this.state.error?null:this.props.children;}
  }
  function Surface({message}:{message:LaplaceRenderMessage}){
    const latestInspectionRevision=React.useRef(0);
    const inspectionRequest=React.useRef(0);
    latestInspectionRevision.current=message.editorSelection?.inspectionRevision??0;
    const send=(reply:Omit<LaplaceRendererReply,'channel'|'version'|'generation'|'sequence'>)=>sendReply(reply.type==='editor-inspected'?{...reply,inspectionRevision:latestInspectionRevision.current}:reply);
    const viewport=React.useRef<HTMLDivElement>(null);
    const layoutFollowing=React.useRef<ReturnType<typeof attachLaplaceLayoutFollowing> | null>(null);
    const sourceFollowing=React.useRef(message.followLatest!==false);
    const hasEvents=(message.layout?.length??message.events.length)>0;
    const refreshInspection=React.useRef<()=>void>(()=>{});
    const sampledInspectionKey=React.useRef('');
    React.useLayoutEffect(()=>{
      if(!hasEvents||!viewport.current)return;
      const follower=attachLaplaceLayoutFollowing(viewport.current,undefined,()=>sourceFollowing.current,message.direction);layoutFollowing.current=follower;
      return()=>{follower.dispose();layoutFollowing.current=null;};
    },[hasEvents,message.direction]);
    React.useLayoutEffect(()=>{
      sourceFollowing.current=message.followLatest!==false;
      controlState.followingLatest=sourceFollowing.current;
      if(!sourceFollowing.current)layoutFollowing.current?.pause();
    },[message.followLatest]);
    const requestedScheme=String(message.editorSelection?.scheme||message.settings?.colorScheme||defaultOptions.colorScheme||'light');
    const options: Record<string, unknown>=React.useMemo(()=>resolveLaplaceRenderSettings(defaultOptions,{...message.settings,...(renderer.supportsProductElements===true?{classicElementScope:message.productElements?.classicScope??false}:{})},requestedScheme),[message.settings,message.productElements?.classicScope,requestedScheme]);
    const contextValue=React.useMemo(()=>({settings:options,dashboardLiveGuards:message.dashboardLiveGuards||{}}),[options,message.dashboardLiveGuards]);
    const scheme=String(options.colorScheme);
    const editorSelectionKey=JSON.stringify(message.editorSelection?Object.fromEntries(Object.entries(message.editorSelection).filter(([key])=>key!=='inspectionRevision')):null);
    const editorInspectionKey=message.editorSelection?JSON.stringify([message.editorSelection,message.css,message.settings,message.events,message.stickyEvents]):'';
    const scene=String(options.sceneName||'');
    React.useEffect(()=>{document.documentElement.setAttribute('data-theme',scheme);},[scheme]);
    const customCss=React.useMemo(()=>role==='candidate'?composeLaplaceFrameCustomCss(message.css.custom):message.css.custom,[message.css.custom]);
    const hostMotionEnabled=Boolean(message.animation&&message.animation.preset!=='none'&&message.animation.durationMs>0);
    const values=styleValues(message,customCss);
    useOriginalStyle(()=>values[0],'base-font-size');
    useOriginalStyle(()=>values[1],'demo-bg');
    useOriginalStyle(()=>values[2],'custom-ui');
    useOriginalStyle(()=>values[3],'template');
    useOriginalStyle(()=>values[4],'remote-css');
    useOriginalStyle(()=>values[5],'custom-css');
    useOriginalStyle(()=>values[6],'host-behavior');
    React.useEffect(()=>{
      const selection=message.editorSelection,rootNode=rootElement!;
      if(selection?.accentColor)document.documentElement.style.setProperty("--preview-editor-accent",selection.accentColor);
      const revealState=new Map<HTMLElement,Record<string,{value:string;priority:string}>>();
      const restoreReveal=()=>{for(const[node,props]of revealState)for(const[prop,state]of Object.entries(props)){if(state.value)node.style.setProperty(prop,state.value,state.priority);else node.style.removeProperty(prop);}revealState.clear();};
      const remember=(node:HTMLElement,property:string)=>{let state=revealState.get(node);if(!state){state={};revealState.set(node,state);}if(!state[property])state[property]={value:node.style.getPropertyValue(property),priority:node.style.getPropertyPriority(property)};};
      const authoredDisplay=(node:Element)=>{let result='';const visit=(rules:CSSRuleList)=>{for(const rule of [...rules]){if('cssRules'in rule)visit((rule as CSSGroupingRule).cssRules);else if('selectorText'in rule)try{const styleRule=rule as CSSStyleRule;if(node.matches(styleRule.selectorText)){const value=styleRule.style.getPropertyValue('display');if(value&&value!=='none')result=value;}}catch{}}};for(const sheet of document.styleSheets)try{visit(sheet.cssRules);}catch{}return result||'block';};
      const reveal=(element:Element)=>{const node=element as HTMLElement,computed=getComputedStyle(node);if(computed.display==='none'){remember(node,'display');node.style.setProperty('display',authoredDisplay(node),'important');node.setAttribute('data-compatible-editor-reveal-display','');}if(computed.visibility==='hidden'||computed.visibility==='collapse'){remember(node,'visibility');node.style.setProperty('visibility','visible','important');node.setAttribute('data-compatible-editor-reveal-visibility','');}if(computed.opacity==='0'){remember(node,'opacity');node.style.setProperty('opacity','1','important');node.setAttribute('data-compatible-editor-reveal-opacity','');}if(revealState.has(node))node.setAttribute('data-compatible-editor-reveal','');};
      document.querySelectorAll('[data-compatible-editor-selected],[data-compatible-editor-reveal],[data-compatible-editor-reveal-display],[data-compatible-editor-reveal-visibility],[data-compatible-editor-reveal-opacity]').forEach(node=>{for(const name of ['data-compatible-editor-selected','data-compatible-editor-reveal','data-compatible-editor-reveal-display','data-compatible-editor-reveal-visibility','data-compatible-editor-reveal-opacity'])node.removeAttribute(name);});
      let style=document.getElementById('bb-compatible-editor-style') as HTMLStyleElement|null;
      if(!style){style=document.createElement('style');style.id='bb-compatible-editor-style';document.head.appendChild(style);}
      style.textContent=selection&&selection.pickEnabled!==false?'[data-compatible-editor-selected]{outline:2px solid var(--preview-editor-accent,currentColor)!important;outline-offset:-2px!important}.event,.event *{pointer-events:auto!important}':'';
      if(!selection||(!selection.part&&selection.pickEnabled===false))return;
      let matched=0;const mark=(node:Element)=>{if(node.closest(".hidden"))return;matched+=1;node.setAttribute('data-compatible-editor-selected','');if(selection.reveal)for(let current:Element|null=node;current;current=current.parentElement)reveal(current);if(!selection.readOnly&&selection.pickEnabled!==false)requestAnimationFrame(()=>node.scrollIntoView?.({block:'center',inline:'nearest'}));};for(const selector of selection.focusSelectors){try{for(const node of rootNode.querySelectorAll(selector))mark(node);}catch{}}const strictScope=selection.strictScope===true,scopeMatched=matched>0;if(!scopeMatched&&!strictScope)for(const selector of selection.selectors[selection.part]??[]){try{for(const node of rootNode.querySelectorAll(selector))mark(node);}catch{}}
      const cssProperties:Record<string,string>={visible:'display',color:'color',background:'background-color',fontFamily:'font-family',fontSize:'font-size',lineHeight:'line-height',paddingX:'padding-inline-start',paddingY:'padding-block-start',marginX:'margin-inline-start',marginY:'margin-block-start',gap:'gap',width:'width',height:'height',borderWidth:'border-top-width',borderColor:'border-top-color',borderRadius:'border-top-left-radius',borderImage:'border-image'};
      const specificity=(selector:string)=>(selector.match(/#[\w-]+/g)||[]).length*100+(selector.match(/\.[\w-]+|\[[^\]]+\]|:[\w-]+/g)||[]).length*10+(selector.match(/(^|[\s>+~])\w+/g)||[]).length;
      const matchScope=(node:Element,selectors:Record<string,string>|undefined,fallback:string)=>{let best:{name:string;distance:number;specificity:number;length:number}|null=null;for(const[name,source]of Object.entries(selectors??{}))for(const selector of source.split(','))try{const matched=node.closest(selector);if(!matched)continue;let distance=0,current:Element|null=node;while(current&&current!==matched){distance++;current=current.parentElement;}const candidate={name,distance,specificity:specificity(selector),length:selector.length};if(!best||distance<best.distance||distance===best.distance&&(candidate.specificity>best.specificity||candidate.specificity===best.specificity&&candidate.length>best.length))best=candidate;}catch{}return best?.name||fallback;};
      const authoredValues=(node:Element,properties:readonly string[])=>{
        const result=new Map(properties.map(property=>[property,((node as HTMLElement).style?.getPropertyValue(property)||'').trim()]));
        const visit=(rules:CSSRuleList)=>{for(const rule of [...rules]){
          if(rule instanceof CSSMediaRule&&!matchMedia(rule.conditionText).matches)continue;
          if('selectorText'in rule)try{const styleRule=rule as CSSStyleRule;if(node.matches(styleRule.selectorText))for(const property of properties){const value=styleRule.style.getPropertyValue(property);if(value&&(!result.get(property)?.endsWith('!important')||styleRule.style.getPropertyPriority(property)==='important'))result.set(property,value.trim()+(styleRule.style.getPropertyPriority(property)==='important'?' !important':''));}}catch{}
          if('cssRules'in rule)visit((rule as CSSGroupingRule).cssRules);
        }};
        for(const sheet of document.styleSheets)try{visit(sheet.cssRules);}catch{}
        return result;
      };
      const scopeFor=(node:Element,part:string)=>{const scope=selection.scopeSelectors,placement=matchScope(node,scope.placements,'main') as 'main'|'sticky'|'detail';return{part,eventType:matchScope(node,scope.eventsByPlacement?.[placement], 'all'),identity:laplaceEditorIdentity(node,selection),placement};};
      const inspect=(picked:{part:string;node:Element},refresh=false)=>{const scope=refresh?selection.scope:scopeFor(picked.node,picked.part),nodes:Element[]=[];if(refresh)for(const node of rootNode.querySelectorAll('[data-compatible-editor-selected]'))nodes.push(node);else for(const selector of selection.selectors[picked.part]??[])try{for(const node of rootNode.querySelectorAll(selector)){const candidate=scopeFor(node,picked.part);if(candidate.eventType===scope.eventType&&candidate.identity===scope.identity&&candidate.placement===scope.placement&&!nodes.includes(node))nodes.push(node);}}catch{}if(!nodes.length)nodes.push(picked.node);const computed:Record<string,{value:string;unit:string;inherited:boolean;mixed:boolean;controlled?:boolean;applicable?:boolean}>={},properties=(selection.properties?.[picked.part]??[]).flatMap(property=>cssProperties[property]?[{property,cssProperty:cssProperties[property]}]:[]),authored=authoredValues(nodes[0],properties.map(item=>item.cssProperty)),styles=new Map(nodes.map(node=>[node,getComputedStyle(node)])),parentStyles=new Map(nodes.map(node=>[node,node.parentElement?getComputedStyle(node.parentElement):null]));for(const {property,cssProperty} of properties){const samples=nodes.map((node,index)=>{const nodeStyle=styles.get(node)!,parentStyle=parentStyles.get(node),declared=index===0?authored.get(cssProperty)??'':((node as HTMLElement).style?.getPropertyValue(cssProperty)||'').trim(),raw=property==='background'&&nodeStyle.backgroundImage!=='none'?nodeStyle.background:nodeStyle.getPropertyValue(cssProperty).trim();return{value:property==='lineHeight'&&raw.endsWith('px')&&parseFloat(nodeStyle.fontSize)>0?String(Number((parseFloat(raw)/parseFloat(nodeStyle.fontSize)).toFixed(4))):property==='visible'?String(nodeStyle.display!=='none'&&nodeStyle.visibility!=='hidden'&&nodeStyle.visibility!=='collapse'&&nodeStyle.opacity!=='0'):raw,authored:declared,inherited:!declared&&!!parentStyle&&['color','font-family','font-size','line-height'].includes(cssProperty)&&raw===parentStyle.getPropertyValue(cssProperty).trim()};});const values=new Set(samples.map(x=>x.value)),units=new Set(samples.map(x=>x.value.match(/[a-z%]+$/i)?.[0]||''));computed[property]={value:samples[0].value,unit:units.size===1?[...units][0]:'',inherited:samples.every(x=>x.inherited),mixed:values.size>1,controlled:samples.some(x=>/!important$/.test(x.authored))};}for(const property of Object.keys(computed))computed[property]=inspectEditorProperty(nodes,property,computed[property]);send({type:'editor-inspected',scope,computed,layoutSupported:nodes.every(node=>/flex|grid/.test(getComputedStyle(node).display)),mode:role,...(refresh?{refresh:true}:{})});};
      const pickedAt=(event:MouseEvent|PointerEvent)=>selection.readOnly||selection.pickEnabled===false?null:pickPreviewEditorPart(event.target as Element,selection.selectors,{x:event.clientX,y:event.clientY},(part,node)=>!selection.partPlacements?.[part]||selection.partPlacements[part].includes(scopeFor(node,part).placement));
      const disposeHover=installPreviewEditorHover(rootNode,pickedAt);
      const pick=(event:MouseEvent)=>{const best=pickedAt(event);if(best){event.preventDefault();event.stopPropagation();inspect(best);}};
      refreshInspection.current=()=>{const request=++inspectionRequest.current,revision=latestInspectionRevision.current;requestAnimationFrame(()=>{if(request!==inspectionRequest.current||revision!==latestInspectionRevision.current)return;for(const selector of selection.focusSelectors)try{for(const candidate of rootNode.querySelectorAll(selector))if(!candidate.hasAttribute('data-compatible-editor-selected'))mark(candidate);}catch{}if(selection.readOnly)return;const node=rootNode.querySelector('[data-compatible-editor-selected]');if(node)inspect({part:selection.part,node},true);else send({type:'editor-inspected',scope:selection.scope,computed:{},refresh:true,mode:role});});};
      sampledInspectionKey.current=editorInspectionKey;refreshInspection.current();
      const selectionObserver=new MutationObserver(()=>refreshInspection.current());selectionObserver.observe(rootNode,{childList:true,subtree:true});
      rootNode.addEventListener('click',pick,true);return()=>{selectionObserver.disconnect();refreshInspection.current=()=>{};rootNode.removeEventListener('click',pick,true);disposeHover();restoreReveal();document.querySelectorAll('[data-compatible-editor-selected],[data-compatible-editor-reveal],[data-compatible-editor-reveal-display],[data-compatible-editor-reveal-visibility],[data-compatible-editor-reveal-opacity]').forEach(node=>{for(const name of ['data-compatible-editor-selected','data-compatible-editor-reveal','data-compatible-editor-reveal-display','data-compatible-editor-reveal-visibility','data-compatible-editor-reveal-opacity'])node.removeAttribute(name);});};
    },[editorSelectionKey]);
    React.useEffect(()=>{if(sampledInspectionKey.current===editorInspectionKey)return;sampledInspectionKey.current=editorInspectionKey;refreshInspection.current();},[editorInspectionKey]);
    // postMessage clones objects. Content identity avoids treating a CSS-only
    // packet as a new original store projection and restarting auto-scroll.
    const projectionKey=JSON.stringify([message.events,message.layout]);
    React.useEffect(()=>{
      if(hasEvents&&sourceFollowing.current)layoutFollowing.current?.followEvents(laplaceAutoScrollBehavior(message.rate));
    },[projectionKey,message.rate,message.followLatest,message.direction,message.contentAlignment,options.showGiftStickyAbove,options.limitEventAmount,options.limitStickyAmount]);
    React.useEffect(()=>{send({type:'rendered',mode:role});},[message.sequence]);
    const userScroll=React.useRef(false);
    const pointerScroll=React.useRef(false);
    React.useEffect(()=>{
      const rootNode=rootElement!;
      const markUser=(event:WheelEvent)=>{userScroll.current=true;const node=viewport.current;if(node&&event.target instanceof Node&&node.contains(event.target)){const geometry=flowGeometry(node);if(geometry.horizontal&&geometry.extent>geometry.viewport){const delta=Math.abs(event.deltaX)>Math.abs(event.deltaY)?event.deltaX:event.deltaY;geometry.scroll(Math.max(0,Math.min(geometry.extent-geometry.viewport,geometry.position+delta)));event.preventDefault();}}if(node&&event.target instanceof Node&&node.contains(event.target)&&flowGeometry(node).extent>flowGeometry(node).viewport+1&&(message.direction==='top'?event.deltaY>0:event.deltaY<0)){sourceFollowing.current=false;controlState.followingLatest=false;}};
      const resumeAtEdge=(event:WheelEvent)=>{const node=viewport.current;if(!node||!(event.target instanceof Node)||!node.contains(event.target))return;const geometry=flowGeometry(node);const forward=message.direction==='top'?event.deltaY<0:event.deltaY>0;const atLatest=message.direction==='top'?geometry.position<=4:geometry.position+geometry.viewport>=geometry.extent-4;if(forward&&atLatest){sourceFollowing.current=true;controlState.followingLatest=true;layoutFollowing.current?.scrollToEnd('auto');reportScrollState(true);}};
      const markPointer=()=>{pointerScroll.current=true;};
      const releasePointer=()=>{pointerScroll.current=false;};
      const markKeyboard=(event:KeyboardEvent)=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','PageUp','PageDown','Home','End'].includes(event.key)||event.key===' '&&event.target===viewport.current){userScroll.current=true;const node=viewport.current;if(node&&event.target instanceof Node&&node.contains(event.target)){const g=flowGeometry(node);if(g.horizontal){const forward=['ArrowDown','ArrowRight','PageDown',' '].includes(event.key);const amount=event.key.startsWith('Page')||event.key===' '?g.viewport:40;const position=event.key==='Home'?0:event.key==='End'?g.extent-g.viewport:g.position+(forward?amount:-amount);sourceFollowing.current=message.direction==='top'?position<=4:position>=g.extent-g.viewport-4;g.scroll(Math.max(0,Math.min(g.extent-g.viewport,position)));event.preventDefault();}}}};
      const horizontalStickyWheel=(event:WheelEvent)=>{const target=event.target instanceof Element?event.target.closest<HTMLElement>('.gift-sticky-bar'):null;if(!target)return;const max=target.scrollWidth-target.clientWidth;if(max<=0)return;const reversed=getComputedStyle(target).flexDirection==='row-reverse';const delta=Math.abs(event.deltaX)>Math.abs(event.deltaY)?event.deltaX:event.deltaY*(reversed?-1:1);if(!delta)return;const current=target.scrollLeft;const min=reversed?-max:0;const upper=reversed?0:max;if(delta>0&&current>=upper-1||delta<0&&current<=min+1)return;const next=Math.max(min,Math.min(upper,current+delta));if(next===current)return;target.scrollLeft=next;event.preventDefault();event.stopPropagation();};
      rootNode.addEventListener('wheel',horizontalStickyWheel,{passive:false});rootNode.addEventListener('wheel',resumeAtEdge,{passive:true});rootNode.addEventListener('wheel',markUser,{passive:false});rootNode.addEventListener('pointerdown',markPointer,{passive:true});rootNode.addEventListener('keydown',markKeyboard);window.addEventListener('pointerup',releasePointer);
      const bind=()=>{
        if(decorationSuspended)return;
        bindLaplaceStableEventRoots(rootNode,message.events,message.stickyEvents);
        const removing=new Set(message.removingEventIds??[]);
        const recalled=new Set(message.recalledEventIds??[]);
        rootNode.querySelectorAll<HTMLElement>('[data-event-id]').forEach(row=>{
          reconcileCompatibleRecall(row, recalled.has(row.dataset.eventId??''), '.message');
          const isRemoving=removing.has(row.dataset.eventId??'');
          delete row.dataset.hostAnimation;
          delete row.dataset.hostEnter;
          delete row.dataset.hostRemoving;
          row.style.removeProperty('--host-animation-duration');
          applyEventTransition(row,!isRemoving&&role==='candidate'&&message.animation?.preferThemeAnimation===true&&hasLaplaceThemeEntryMotion(row)?{preset:'none',durationMs:0}:message.animation,isRemoving);
        });
        reconcileRepeatCounts(rootNode,[...message.events,...message.stickyEvents]);
        reconcileVideoLinks(rootNode,message.enableBilibiliVideoLinks===true);
      };
      decorationSuspended=false;
      bind();
      const observer=new MutationObserver(bind);decorationObserver=observer;observer.observe(rootNode,{childList:true,subtree:true});
      const playGift=(target:Element|null)=>{
        if(message.preview||!message.giftEffectInteractive)return false;
        const icon=target?.closest('.gift-image-wrap');
        const row=icon?.closest<HTMLElement>('.event--gift[data-event-id]');
        if(!row)return false;
        send({type:'action',eventId:row.dataset.eventId!,action:'gift-effect',mode:role});
        return true;
      };
      const click=(event:MouseEvent)=>{const target=event.target instanceof Element?event.target:null;if(playGift(target))return;const row=target?.closest<HTMLElement>('[data-event-id]');if(!row)return;const eventId=row.dataset.eventId!;const link=target?.closest<HTMLAnchorElement>('a[href]');if(link&&message.enableBilibiliVideoLinks){event.preventDefault();send({type:'action',eventId,action:{type:'open-link',href:link.href},mode:role});}else { const user=target?.closest<HTMLElement>('[data-user-uid]'); if(user&&message.renderMode==='dashboard'&&!message.preview)send({type:'action',eventId,action:user.dataset.userUid===row.dataset.uid?'filter-user':{type:'filter-user',uid:user.dataset.userUid},mode:role}); }};
      const giftKey=(event:KeyboardEvent)=>{if((event.key!=='Enter'&&event.key!==' ')||event.repeat)return;const target=event.target instanceof Element?event.target:null;if(playGift(target))event.preventDefault();else if(target?.closest('[data-user-uid]')&&message.renderMode==='dashboard'&&!message.preview){event.preventDefault();click(event as unknown as MouseEvent);}};
      const menu=(event:MouseEvent)=>{const row=event.target instanceof Element?event.target.closest<HTMLElement>('[data-event-id]'):null;if(!row)return;event.preventDefault();send({type:'context-menu',eventId:row.dataset.eventId,action:'open-menu',x:event.clientX,y:event.clientY,mode:role});};
      const pointer=()=>send({type:'pointer-down',mode:role});
      rootNode.addEventListener('click',click);rootNode.addEventListener('contextmenu',menu);rootNode.addEventListener('pointerdown',pointer);
      rootNode.addEventListener('keydown',giftKey);
      controls={
        locate(eventId){
          userScroll.current=false;pointerScroll.current=false;
          sourceFollowing.current=false;controlState.followingLatest=false;
          controlState.locatedEventId=eventId;
          layoutFollowing.current?.pause();
          rootNode.querySelector<HTMLElement>(`[data-event-id="${CSS.escape(eventId)}"]`)?.scrollIntoView({block:'center'});
          layoutFollowing.current?.rememberReadingPosition();
        },
        scrollToLatest(){
          userScroll.current=false;pointerScroll.current=false;
          sourceFollowing.current=true;controlState.followingLatest=true;
          if(layoutFollowing.current)layoutFollowing.current.scrollToEnd('auto');
          else if(message.direction==='top')viewport.current&&flowGeometry(viewport.current).scroll(0);
          else if(message.scrollable&&viewport.current)flowGeometry(viewport.current).scroll(flowGeometry(viewport.current).extent);
        },
        restoreScroll(eventId,scrollTop,anchorOffset=0,followingLatest=false){
          userScroll.current=false;pointerScroll.current=false;
          sourceFollowing.current=followingLatest;controlState.followingLatest=followingLatest;
          controlState.restoredEventId=eventId;controlState.restoredAnchorOffset=anchorOffset;
          if(followingLatest){
            if(layoutFollowing.current)layoutFollowing.current.scrollToEnd('auto');
            else if(message.direction==='top')viewport.current&&flowGeometry(viewport.current).scroll(0);
            else if(viewport.current)flowGeometry(viewport.current).scroll(flowGeometry(viewport.current).extent);
            return;
          }
          layoutFollowing.current?.pause();
          const node=eventId?rootNode.querySelector<HTMLElement>(`[data-event-id="${CSS.escape(eventId)}"]`):null;
          if(node&&viewport.current){
            const geometry=flowGeometry(viewport.current);
            geometry.scroll(geometry.position+geometry.offset(node)-anchorOffset);
          }else if(viewport.current&&Number.isFinite(scrollTop))flowGeometry(viewport.current).scroll(Number(scrollTop));
          layoutFollowing.current?.rememberReadingPosition();
        },
      };
      if(!sourceFollowing.current)reportScrollState(false);
      return()=>{observer.disconnect();if(decorationObserver===observer)decorationObserver=null;rootNode.removeEventListener('wheel',horizontalStickyWheel);rootNode.removeEventListener('wheel',resumeAtEdge);rootNode.removeEventListener('wheel',markUser);rootNode.removeEventListener('pointerdown',markPointer);rootNode.removeEventListener('keydown',markKeyboard);rootNode.removeEventListener('keydown',giftKey);window.removeEventListener('pointerup',releasePointer);rootNode.removeEventListener('click',click);rootNode.removeEventListener('contextmenu',menu);rootNode.removeEventListener('pointerdown',pointer);controls=null;};
    },[message]);
    const reportScrollState=(userInitiated:boolean)=>{const node=viewport.current;if(node){const visible=[...node.querySelectorAll<HTMLElement>('[data-event-id]')].find(item=>{const geometry=flowGeometry(node),box=item.getBoundingClientRect();return geometry.offset(item)+(geometry.horizontal?box.width:box.height)>0;});const following=message.direction==='top'?flowGeometry(node).position<=4:flowGeometry(node).position+flowGeometry(node).viewport>=flowGeometry(node).extent-4;if(userInitiated){const paused=sourceFollowing.current&&!following;sourceFollowing.current=following;if(paused)layoutFollowing.current?.pause();}send({type:'scroll-state',following:sourceFollowing.current&&following,scrollTop:flowGeometry(node).position,scrollHeight:flowGeometry(node).extent,clientHeight:flowGeometry(node).viewport,nearStart:flowGeometry(node).position<=250,nearEnd:flowGeometry(node).position+flowGeometry(node).viewport>=flowGeometry(node).extent-250,anchorId:visible?.dataset.eventId,anchorOffset:visible?flowGeometry(node).offset(visible):0,userInitiated});}};
    const onScroll=()=>{reportScrollState(userScroll.current||pointerScroll.current);userScroll.current=false;};
    const eventsById=new Map(message.events.map(event=>[event.id,event]));
    const layout=message.layout??message.events.map(event=>({kind:'source' as const,eventId:event.id}));
    const renderMode=message.renderMode??'obs';
    const sticky=Boolean(options.showStickyBar)&&message.stickyEvents.length>0&&<Flipper enabled={hostMotionEnabled} className={['_giftStickyBar_1yte6_24',message.scrollable&&'_scrollable_1yte6_19','gift-sticky-bar scroll-fade-x'].filter(Boolean).join(' ')} flipKey={message.stickyEvents.map(event=>event.id).join('|')} spring={{stiffness:1000,damping:100}}>
          {message.stickyEvents.map(event=><Flipped key={event.id} flipId={event.id}><Event data={event} mediaSources={laplaceEventMediaSources(event)} as="sticky" mode={renderMode} /></Flipped>)}
        </Flipper>;
    const list=<OriginalScrollArea viewportRef={viewport} className={[originalScrollbarClasses,laplaceConnectionModeClass(message.acquisitionMode)].filter(Boolean).join(' ')} onScrollPositionChange={message.scrollable?onScroll:undefined} scrollbarSize={0}>
          {layout.map(item=>item.kind==='fallback'
            ? <div key={item.eventId} data-compatible-fallback-id={item.eventId} data-event-id={item.eventId} />
            : eventsById.has(item.eventId) ? <Event key={item.eventId} data={eventsById.get(item.eventId)!} mediaSources={laplaceEventMediaSources(eventsById.get(item.eventId)!)} as="normal" mode={renderMode} /> : null)}
        </OriginalScrollArea>;
    return <Context.Provider value={contextValue}><div className="scheme-wrap" data-theme={scheme}><main data-page={renderMode} className={`group/${renderMode}`}>
      {(layout.length>0 || role==='candidate' && message.stickyEvents.length>0)&&<div className={['_eventListWrap_1yte6_2','events-list-wrap',renderMode==='obs'&&'in-obs',`scheme-${scheme}`,scene&&`scene-${scene}`,message.rate>6?'reduced-motion':'can-motion'].filter(Boolean).join(' ')} style={message.scrollable&&(!message.preview||message.contentAlignment)?{gridTemplateRows:sticky?(message.tickerPosition==='bottom'?'minmax(0, 1fr) auto':'auto minmax(0, 1fr)'):'minmax(0, 1fr)',alignContent:'stretch'}:undefined}>
        {message.tickerPosition==='bottom'?<>{list}{sticky}</>:<>{sticky}{list}</>}
      </div>}
    </main></div></Context.Provider>;
  }
  function render(input: unknown) {
    if(!isLaplaceRenderEnvelope(input,last?.css)){sendReply({type:'error',message:'Invalid LAPLACE render envelope',mode:role});return false;}
    let message: LaplaceRenderMessage={...input,css:input.css??last!.css};
    if(message.productElements && renderer.supportsProductElements!==true){sendReply({type:'error',message:'Product elements unsupported by source renderer',mode:role});return false;}
    if(message.generation!==generation||message.sequence<=sequence)return false;
    if(last)message={...message,events:reuseObsEvents(last.events,message.events),stickyEvents:reuseObsEvents(last.stickyEvents,message.stickyEvents),settings:sameObsValue(last.settings,message.settings)?last.settings:message.settings,dashboardLiveGuards:sameObsValue(last.dashboardLiveGuards,message.dashboardLiveGuards)?last.dashboardLiveGuards:message.dashboardLiveGuards};
    // Pinned OBS displayed-state effect only updates when its selected input is
    // nonempty. A fresh frame remains empty; an already displayed reference
    // retains its list when predefined/store input becomes empty. See the real
    // source-function sequence test, not an inferred reference reset contract.
    const presentation=role==='reference'&&message.events.length===0&&last?.events.length?{...message,events:last.events,stickyEvents:last.stickyEvents}:message;
    decorationSuspended=true;decorationObserver?.disconnect();decorationObserver=null;clearVideoLinks(rootElement!);
    sequence=message.sequence;last=presentation;
    setLaplaceEventMedia([...presentation.events,...presentation.stickyEvents],presentation.preview);
    document.documentElement.dataset.showTimestamp = String(message.settings.showTimestamp === true);
    const commit = () => root.render(<RenderBoundary message={message}><Surface message={presentation}/></RenderBoundary>);
    if (renderer.supportsProductElements) flushSync(commit);
    else commit();
    return true;
  }
  const control=(message:unknown)=>{if(!isLaplaceControlMessage(message)||message.generation!==generation)return false;if(message.action==='locate')controls?.locate(message.eventId!);else if(message.action==='restore-scroll')controls?.restoreScroll(message.eventId,message.scrollTop,message.anchorOffset,message.followingLatest);else controls?.scrollToLatest();return true;};
  const listener=(event:MessageEvent)=>{if(event.source!==parent||!origin||event.origin!==origin)return;if(isLaplaceControlMessage(event.data)){control(event.data);return;}render(event.data);};
  window.addEventListener('message',listener);
  const seenErrors=new Set<string>();
  const trackAsset=(event:Event)=>{
    const node=event.target;
    if(!(node instanceof HTMLImageElement))return;
    const url=node.currentSrc||node.src;
    for(const asset of assetLedger.values()){if(new URL(asset.resolvedUrl,location.href).href===url)asset.status=event.type==='load'?'loaded':'failed';}
    if(event.type==='error'&&!seenErrors.has(url)){seenErrors.add(url);sendReply({type:'asset-missing',url,message:'Original media unavailable; original component error state applies.',mode:role});}
  };
  document.addEventListener('load',trackAsset,true);document.addEventListener('error',trackAsset,true);
  window.addEventListener('pagehide',()=>{window.removeEventListener('message',listener);document.removeEventListener('load',trackAsset,true);document.removeEventListener('error',trackAsset,true);root.unmount();},{once:true});
  if(query.get('qa')==='1')Object.defineProperty(window,'__laplaceQA',{value:Object.freeze({role,reactVersion:React.version,referenceKind:renderer.implementation==='independent'?'independent-react-dom':'source-extracted-original-react-dom',render,reset:render,renderSerialized:(json:string)=>render(JSON.parse(json)),dispatchControlSerialized:(json:string)=>window.dispatchEvent(new MessageEvent('message',{source:parent,origin,data:JSON.parse(json)})),getOriginalSamples,generateOriginalSimulationEvent,snapshot:()=>({role,reactVersion:React.version,generation,sequence,sourceExtracted:renderer.implementation!=='independent',controlState:{...controlState},html:rootElement.innerHTML,assets:[...assetLedger.values()],styles:[...document.head.querySelectorAll('style[id^="dynamic-"]')].map(element=>({id:element.id,text:element.textContent})),rate:last?.rate,scrollable:last?.scrollable,approvedDifferences:role==='candidate'?['L11.04','L11.05']:[]})})});
  sendReply({type:'ready',mode:role});
}
