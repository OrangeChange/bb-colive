import { uiText, UiMessageError } from "../i18n/index.ts";
import {resolveThemeResourceSource} from './themeRemoteCss.ts';
import safeParse from "postcss-safe-parser";
import postcss from 'postcss';
import valueParser, { type Node as ValueNode } from 'postcss-value-parser';
import {invoke} from '@tauri-apps/api/core';
import type {ThemeDocument,ThemeAssetReference} from './themeTypes.ts';
import {isRendererProvidedBaseCss,rendererProvidedBaseCss} from './builtinThemeDefaults.ts';
import {assignNativeCssLayer} from './nativeThemeCascade.ts';
import {materializeOpenLiveSourceCss} from '../compat/openlive/css.ts';

export interface LoadedThemeDependency {css?:string;finalUrl?:string;asset?:ThemeAssetReference;bytes?:Uint8Array}
export interface ThemeResourceLoader {load(url:string,css:boolean):Promise<LoadedThemeDependency>;signal?:AbortSignal}
function checkSignal(signal?:AbortSignal){if(signal?.aborted)throw new UiMessageError("themeResourceDependencies.checkSignal");}
function cssUrl(node:ValueNode):string|undefined {
 if(node.type==='string')return node.value;
 if(node.type==='function'&&node.value.toLowerCase()==='url')return valueParser.stringify(node.nodes).trim().replace(/^(["'])([\s\S]*)\1$/,'$2');
}
function resourceUrl(value:string,base:string):string|undefined{
 if(!value||value.startsWith('#')||/^(data:|blob:)/i.test(value))return;
 return new URL(value,base).href;
}
function quoted(value:string):ValueNode{return {type:'string',quote:'"',value,sourceIndex:0,sourceEndIndex:value.length};}

export async function localizeThemeResources(document:ThemeDocument,origin:string,loader:ThemeResourceLoader,remotePolicy:"cache"|"preserve"|"apply"="cache"):Promise<{document:ThemeDocument;assets:Record<string,Uint8Array>}>{
 const next=structuredClone(document),assets:Record<string,Uint8Array>={};
 const loads=new Map<string,Promise<LoadedThemeDependency>>(),references=new Map<string,string>();
 const load=(url:string,css:boolean)=>{checkSignal(loader.signal);const key=(css?'css:':'asset:')+url;if(!loads.has(key))loads.set(key,loader.load(url,css));return loads.get(key)!;};
 const register=async(raw:string,base:string,preserveLogical:boolean)=>{
  const known = preserveLogical ? document.assets.find(a=>a.path===raw.replace(/^\.\//,'').split('#')[0]) : undefined;
  if(known && (!known.sourceUrl || !/^https?:/i.test(known.sourceUrl) || known.cacheResourceId || remotePolicy==="preserve")) return raw;
  const resolved=known?.sourceUrl||resourceUrl(raw,base);if(!resolved)return raw;
  if(remotePolicy==="preserve" && /^https?:/i.test(resolved))return raw;
  const url=new URL(resolved),fragment=url.hash;url.hash='';const key=url.href;
  if(references.has(key))return references.get(key)!+fragment;
  let loaded:LoadedThemeDependency;
  try{loaded=await load(key,false)}catch(error){checkSignal(loader.signal);if(remotePolicy==='apply'&&/^https?:/i.test(key))return resolved;throw error;}
  checkSignal(loader.signal);if(!loaded.asset)throw new UiMessageError("themeResourceDependencies.localizeThemeResources.register", { key: key });
  const previous=known ? next.assets.find(x=>x.path===known.path) : next.assets.find(x=>x.sourceUrl===key);
  const filename=(loaded.asset.name||'resource').replace(/[^a-zA-Z0-9._-]/g,'-');
  let path=previous?.path||`assets/${filename}`;
  for(let n=2;next.assets.some(x=>x.path===path&&x!==previous);n++)path=`assets/${n}-${filename}`;
  const ref={...loaded.asset,path,sourceUrl:key,...(loaded.asset.cacheResourceId?{resourceFileName:loaded.asset.name}:{})};
  next.assets=previous?next.assets.map(x=>x===previous?ref:x):[...next.assets,ref];
  if(loaded.bytes)assets[path]=loaded.bytes;
  references.set(key,path);return path+fragment;
 };
 const engineSource=rendererProvidedBaseCss(document.mode);
 const sourceVariants=engineSource?[engineSource,...(document.mode==='blivechat-open'?[materializeOpenLiveSourceCss(engineSource)]:[])]:[];
 const engineSources=sourceVariants.flatMap(source=>[source,assignNativeCssLayer(source,'default')]);
 const process=async(css:string,base:string,ancestors:Set<string>,preserveLogical=false):Promise<string>=>{
  const engineRanges=engineSources.flatMap(source=>{
   const ranges:{start:number;end:number}[]=[];
   for(let start=css.indexOf(source);start>=0;start=css.indexOf(source,start+source.length))ranges.push({start,end:start+source.length});
   return ranges;
  });
  const root=safeParse(css);
  const declarations:postcss.Declaration[]=[];root.walkDecls(d=>{declarations.push(d)});
  const imports:postcss.AtRule[]=[];root.walkAtRules('import',n=>{imports.push(n)});
  for(const rule of imports){
   const parsed=valueParser(rule.params),first=parsed.nodes.find(n=>n.type!=='space'&&n.type!=='comment');
   const raw=first&&cssUrl(first);if(!raw)throw new UiMessageError("themeResourceDependencies.localizeThemeResources.process", { params: rule.params });
   const inlineCss=document.mode==="native"&&/^data:/i.test(raw);
   if(/^data:/i.test(raw)&&!inlineCss)continue;
   const url=inlineCss?raw:resourceUrl(raw,base);if(!url)throw new UiMessageError("themeResourceDependencies.localizeThemeResources.process2");
   if(remotePolicy==="preserve" && /^https?:/i.test(url)){
    continue;
   }
   if(ancestors.has(url)){rule.remove();continue;}
   let loaded:LoadedThemeDependency;
   try{loaded=inlineCss?{css:await (await fetch(url)).text(),finalUrl:url}:await load(url,true)}catch(error){checkSignal(loader.signal);if(remotePolicy==='apply'&&document.mode!=="native"&&/^https?:/i.test(url)){
    if(first?.type==='string')first.value=url;else if(first?.type==='function')first.nodes=[quoted(url)];rule.params=parsed.toString();continue;
   }throw error;}
   checkSignal(loader.signal);if(loaded.css===undefined)throw new UiMessageError("themeResourceDependencies.localizeThemeResources.process3", { url: url });
   const nested=safeParse(await process(loaded.css,loaded.finalUrl||url,new Set([...ancestors,url,loaded.finalUrl||url]))) as postcss.Root;
   let contents:postcss.ChildNode[]=nested.nodes;
   const suffix=parsed.nodes.slice(parsed.nodes.indexOf(first!)+1).filter(n=>n.type!=='comment');
   const significant=suffix.filter(n=>n.type!=='space');let layer:string|undefined,supports:string|undefined;
   if(significant[0]?.type==='word'&&significant[0].value==='layer'){layer='';significant.shift();}
   else if(significant[0]?.type==='function'&&significant[0].value==='layer'){layer=valueParser.stringify((significant.shift() as valueParser.FunctionNode).nodes);}
   if(significant[0]?.type==='function'&&significant[0].value==='supports'){const n=significant.shift() as valueParser.FunctionNode;supports=valueParser.stringify(n.nodes);}
   // 剩余条件以原始节点间的空格恢复，避免将 screen and 拼为 screenand。
   let rest=suffix.slice();const trim=()=>{const space=()=>rest[0]?.type==='space';while(space())rest.shift();};trim();if(layer!==undefined){rest.shift();trim();}if(supports!==undefined){rest.shift();trim();}
   const media=valueParser.stringify(rest).trim();
   const wrap=(name:string,params:string)=>{const at=postcss.atRule({name,params});at.append(contents);contents=[at];};
   if(media)wrap('media',media);
   if(supports)wrap('supports',/^(\(|not\s|selector\(|font-tech\(|font-format\()/i.test(supports)?supports:`(${supports})`);
   if(layer!==undefined)wrap('layer',layer);
   rule.replaceWith(...contents);
  }
  for(const declaration of declarations){
   const offset=declaration.source?.start?.offset;
   if(offset!==undefined&&engineRanges.some(range=>offset>=range.start&&offset<range.end))continue;
   const parsed=valueParser(declaration.value);
   const rewrite=async(nodes:ValueNode[],imageSet=false):Promise<void>=>{
    for(let i=0;i<nodes.length;i++){
     const node=nodes[i];
     if(node.type==='function'&&node.value.toLowerCase()==='url'){
      const raw=cssUrl(node)!;const next=await register(raw,base,preserveLogical);if(next!==raw)node.nodes=[quoted(next)];
     }else if(node.type==='function'&&node.value.toLowerCase()!=='local')await rewrite(node.nodes,/^(?:-webkit-)?image-set$/i.test(node.value));
     else if(imageSet&&node.type==='string')node.value=await register(node.value,base,preserveLogical);
    }
   };
   await rewrite(parsed.nodes);declaration.value=parsed.toString();
  }
  return root.toString();
 };
 for(const layer of ['baseCss','visualCss','customCss'] as const){
  if(layer==='baseCss'&&isRendererProvidedBaseCss(document))continue;
  next.styles[layer]=await process(next.styles[layer],origin,new Set([origin]),true);
 }
 return {document:next,assets};
}

export function themeDependencyLoader(refresh=false,signal?:AbortSignal,onProgress?:(completed:number)=>void):ThemeResourceLoader{
 let completed=0;
 return {signal,async load(url,css){
  checkSignal(signal);
  const value=await invoke<{id:string;name:string;mediaType:string;size:number;finalUrl:string;text?:string;bytes?:number[]}>('load_theme_resource',{url:resolveThemeResourceSource(url),refresh,css}).catch(cause=>{const message=cause instanceof Error?cause.message:String(cause);throw new Error(message.includes(url)?message:uiText("themeResourceDependencies.themeDependencyLoader.load.value", { url: url, message: message }))});
  checkSignal(signal);onProgress?.(++completed);
  if(css)return {css:value.text,finalUrl:value.finalUrl};
  return {asset:{id:value.id,name:value.name,path:'',mediaType:value.mediaType,size:value.size,...(value.bytes?{}:{cacheResourceId:value.id})},...(value.bytes?{bytes:new Uint8Array(value.bytes)}:{})};
 }};
}
