import safeParse from 'postcss-safe-parser';
import valueParser, {type Node} from 'postcss-value-parser';
import type {ThemeDocument} from './themeTypes.ts';
import {applyThemeAssetUrls} from './themeAssets.ts';

const shedSource='https://npm.elemecdn.com/shed-fonts/HarmonyOS%20Sans/';
const shedPublishedFiles=new Set(['result.css','Medium/result.css',
 'Medium/51895d7c51f026370c7791d09cfbc384.woff2','Medium/097bf64c4d39f40cda6622bf3df98d81.woff2',
 'Medium/5432972636dce38bf42983e2b180f734.woff2','Medium/21dc475f8735279808e9dc54bc57a5fc.woff2']);

export function resolveThemeResourceSource(url:string):string{
 const path=url.startsWith(shedSource)?url.slice(shedSource.length):'';
 return shedPublishedFiles.has(path)?`https://unpkg.com/shed-fonts@1.0.4/HarmonyOS%20Sans/${path}`:url;
}

/** 保留浏览器的字体选择与导入条件，只改资源请求入口。 */
export function routeThemeRemoteUrls(document:ThemeDocument,origin:string):ThemeDocument {
 const replacements=new Map<string,string>();
 const known=new Set(document.assets.map(asset=>asset.path));
 const register=(raw:string,css=false)=>{
  if(!raw||known.has(raw.replace(/^\.\//,''))||/^(?:data:|blob:|#)/i.test(raw))return;
  let url:URL;try{url=new URL(raw,document.metadata.resourceBaseUrl||document.metadata.sourceUrl||'file:///theme.css')}catch{return}
  if(!/^https?:$/.test(url.protocol)||url.origin===origin&&/^\/theme-/.test(url.pathname))return;
  replacements.set(raw.replace(/^\.\//,''),`${origin}/theme-remote?url=${encodeURIComponent(resolveThemeResourceSource(url.href))}${css?'&css=1':''}`);
 };
 for(const css of Object.values(document.styles)){
  const root=safeParse(css);
  root.walkAtRules('import',rule=>{
   const first=valueParser(rule.params).nodes.find(node=>node.type!=='space'&&node.type!=='comment');
   if(first?.type==='string')register(first.value,true);
   else if(first?.type==='function'&&first.value.toLowerCase()==='url')register(valueParser.stringify(first.nodes).trim().replace(/^(["'])([\s\S]*)\1$/,'$2'),true);
  });
  root.walkDecls(declaration=>{
   const walk=(nodes:Node[],imageSet=false)=>{for(const node of nodes){
    if(node.type==='function'&&node.value.toLowerCase()==='url')register(valueParser.stringify(node.nodes).trim().replace(/^(["'])([\s\S]*)\1$/,'$2'));
    else if(node.type==='function')walk(node.nodes,/^(?:-webkit-)?image-set$/i.test(node.value));
    else if(imageSet&&node.type==='string')register(node.value);
   }};
   walk(valueParser(declaration.value).nodes);
  });
 }
 return replacements.size?applyThemeAssetUrls(document,replacements):document;
}
