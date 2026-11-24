import * as H from 'react';
import {resolveLaplaceEventMedia,laplaceAvatarMediaKey} from './eventMedia.ts';
import * as JSX from 'react/jsx-runtime';
import { createPortal } from 'react-dom';
import assetLocations from './asset-locations.json' with {type:'json'};
const assetPaths = Object.fromEntries(Object.entries(assetLocations).map(([url, local]) => [url, `/laplace/${local}`]));
export const defaultOptions = {colorScheme:'light',showUsername:true,showAvatar:true,showAvatarFrame:true,showSystemMessage:true,showStickyBar:true,showPhoneNotVerified:false,showAutoDanmaku:false,showGiftPriceAbove:1,showGiftHighlightAbove:30,showGiftStickyAbove:29.99,showGiftFree:false,showEnterEvent:false,showEnterEventCurrentGuardOnly:false,showFollowEvent:false,showDanmaku:true,showGift:true,showSuperChat:true,showToast:true,showRedEnvelop:true,showLottery:true,showGuardBadge:true,showSpoiler:true,showMedal:false,showMedalLightenedOnly:true,showWealthMedal:false,showCurrentRank:false,showModBadge:true,limitEventAmount:50,limitStickyAmount:10,baseFontSize:20,sceneName:'',useCst:false};
export const LaplaceRenderContext=H.createContext({settings:defaultOptions,dashboardLiveGuards:{}});
export const assetLedger=new Map();
const roomGiftAssets=new Map(Object.entries(assetPaths).flatMap(([source,local])=>{
  const match=source.match(/^https:\/\/workers\.laplace\.cn\/bilibili\/room-gift-config\/([^?]+)\?[^#]*\bgift=([^&#]+)/);
  return match?[[`${match[1]}:${match[2]}`,local]]:[];
}));
export function resolveLaplaceRenderSettings(defaults,settings,scheme){
  return {...defaults,...settings,colorScheme:scheme==='dark'?'dark':'light'};
}
export function resolveAsset(url){
  if(typeof url!=='string')return url;
  // A source identity is not a public numeric UID. Do not transmit raw Open IDs
  // to an avatar resolver. A local unavailable URL enters Z's ORIGINAL onError
  // branch, with no replacement renderer, invented identity, or synthetic image.
  const resolverIdentity=url.match(/^https:\/\/workers\.laplace\.cn\/bilibili\/avatar\/([^?]+)/)?.[1];
  if(resolverIdentity&&!/^\d+$/.test(resolverIdentity)){
    const key='https://workers.laplace.cn/bilibili/avatar/<unavailable-numeric-identity>';
    const unavailable='/laplace/files/rsrc.laplace.cn/assets/chat/no-avatar.jpg';
    assetLedger.set(key,{originalUrl:key,resolvedUrl:unavailable,status:'local-fallback',pinned:true,diagnostic:'No numeric UID or supplied avatar; use the local fallback.'});
    return unavailable;
  }
  let local=resolveLaplaceEventMedia(url) || assetPaths[url] || (url.startsWith('/')?assetPaths['https://chat.laplace.live'+url]:undefined);
  const roomGift=url.match(/^https:\/\/workers\.laplace\.cn\/bilibili\/room-gift-config\/([^?]+)\?[^#]*\bgift=([^&#]+)/);
  if(!local&&roomGift)local=roomGiftAssets.get(`${roomGift[1]}:${roomGift[2]}`);
  if(/^https?:/.test(url))assetLedger.set(url,{originalUrl:url,resolvedUrl:local||url,status:assetLedger.get(url)?.status||'requested',pinned:Boolean(local)});
  return local||url;
}
export function resolveStyle(style){if(!style)return style;return Object.fromEntries(Object.entries(style).map(([k,v])=>[k,typeof v==='string'?v.replace(/url\((['"]?)(.*?)\1\)/g,(_,q,url)=>`url(${q}${resolveAsset(url)}${q})`):v]));}
function propsFor(type,props){if(!props)return props;if(typeof type!=='string')return props;const next={...props};if(typeof next.src==='string')next.src=resolveAsset(next.src);if(next.style)next.style=resolveStyle(next.style);return next;}
function mediaKey(type,props,key){
  // The pinned source passes a top-level uid only to its avatar component.
  return typeof type==='function'&&props&&Object.hasOwn(props,'uid')?`${key??''}:avatar:${props.uid}:${laplaceAvatarMediaKey(props)}`:key;
}
export const U={...JSX,jsx:(type,props,key)=>JSX.jsx(type,propsFor(type,props),mediaKey(type,props,key)),jsxs:(type,props,key)=>JSX.jsxs(type,propsFor(type,props),mediaKey(type,props,key))};
export const tt=()=>({...defaultOptions,...H.useContext(LaplaceRenderContext).settings,useCst:false});
export const R=selector=>selector({remoteEmotes:undefined,dashboardLiveGuards:H.useContext(LaplaceRenderContext).dashboardLiveGuards||{}});
/** Gift effects are deliberately absent. Original message/image DOM is retained. */
export const Rc=selector=>selector({addGiftEffectQueue:()=>{}});
export function s(...args){const out=[];for(const arg of args){if(!arg)continue;if(Array.isArray(arg))out.push(s(...arg));else if(typeof arg==='object')for(const[k,v]of Object.entries(arg)){if(v)out.push(k)}else out.push(String(arg));}return out.join(' ');}
export const V={format:(value,options={})=>new Intl.NumberFormat('en-US',options).format(value)};
export const g={Assets:'https://rsrc.laplace.cn',Workers:'https://workers.laplace.cn'};
export const p='Asia/Shanghai';
const TooltipContext=H.createContext(null);
function createTooltipStore(){
  return{current:null,open:false,anchor:null,listeners:new Set(),set(payload,anchor){this.current=payload;this.anchor=anchor;this.open=true;for(const listener of this.listeners)listener();},close(){this.open=false;this.anchor=null;for(const listener of this.listeners)listener();},subscribe(listener){this.listeners.add(listener);return()=>this.listeners.delete(listener);}};
}
export const jr=createTooltipStore;
const childrenOf=props=>typeof props?.children==='function'?props.children({payload:props.payload??null}):props?.children??null;
export const $=childrenOf,Ne=childrenOf,Me=childrenOf,Pe=childrenOf,pt=childrenOf,Bu=childrenOf;
function chain(first,second){return event=>{first?.(event);if(!event.defaultPrevented)second(event);};}
export function rt({handle,payload,render,children}={}){
  const contextual=H.useContext(TooltipContext),store=handle??contextual,child=render??children??null;
  if(!store||!H.isValidElement(child))return child;
  return H.cloneElement(child,{onPointerEnter:chain(child.props.onPointerEnter,event=>store.set(payload,event.currentTarget)),onPointerLeave:chain(child.props.onPointerLeave,()=>store.close()),onFocus:chain(child.props.onFocus,event=>store.set(payload,event.currentTarget)),onBlur:chain(child.props.onBlur,()=>store.close())});
}
export function ut({handle,children}={}){
  const local=H.useMemo(createTooltipStore,[]),store=handle??local;
  const[,refresh]=H.useReducer(value=>value+1,0);
  H.useEffect(()=>store.subscribe(refresh),[store]);
  const content=typeof children==='function'?children({payload:store.current}):children??null;
  return H.createElement(TooltipContext.Provider,{value:store},content);
}
export function ot({children,className,style,...props}={}){
  const store=H.useContext(TooltipContext);
  if(!store?.open||typeof document==='undefined')return null;
  const rect=store.anchor?.getBoundingClientRect?.(),left=rect?Math.min(rect.left,Math.max(8,window.innerWidth-280)):8,top=rect?rect.bottom+6:8;
  return createPortal(H.createElement('span',{...props,role:'tooltip',className,style:{position:'fixed',left,top,zIndex:2147483647,maxWidth:272,pointerEvents:'none',...style}},children),document.body);
}
export const ou=()=>null;
export const Br=value=>new Intl.DateTimeFormat('zh-CN',{timeZone:p,hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(value));
