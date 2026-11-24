import postcss from 'postcss';
import { normalizePriceGradient, renderPriceGradientCss, setPriceBandColor, type NativePriceGradient, type PriceGradientScope, type PriceGradientScheme } from './nativePriceGradient.ts';

const BAND_SELECTOR=/^(\.dark\s+)?\.event(?:\.(gift-normal|gift-blind|type-superchat))?\.price-gradient-active\.price-tier-([\w-]+)$/;
const PROPERTY_MAP={'--event-background':'background','--price-tier-background-color':'background','--price-color':'color'} as const;
function plainRule(rule:postcss.Rule):boolean{
  for(let parent=rule.parent;parent&&parent.type!=='root';parent=parent.parent)if(parent.type!=='atrule'||parent.name!=='layer')return false;
  return true;
}
function bandRules(root:postcss.Root){
  const rules=new Map<string,{rule:postcss.Rule;scope:PriceGradientScope;scheme:PriceGradientScheme;id:string;values:Map<string,string>}>();
  root.walkRules(rule=>{
    if(!plainRule(rule))return;
    const match=rule.selector.trim().match(BAND_SELECTOR);
    if(!match)return;
    const scope:PriceGradientScope=match[2]==='gift-normal'?'normal':match[2]==='gift-blind'?'blind':match[2]==='type-superchat'?'superchat':'common';
    const scheme=match[1]?'dark':'light',key=`${scope}|${scheme}|${match[3]}`,values=new Map(rules.get(key)?.values);
    rule.walkDecls(d=>{values.set(d.prop,d.value);});
    rules.set(key,{rule,scope,scheme,id:match[3],values});
  });return rules;
}
function removeGradientRules(root:postcss.Root, ids:Set<string>){
  root.walkRules(rule=>{const selector=rule.selector.replace(/\s+/g,' ').trim();
    if(!plainRule(rule))return;
    const match=selector.match(BAND_SELECTOR);if(match&&!ids.has(match[3]))return;
    const band=BAND_SELECTOR.test(selector),background=selector==='.event.price-gradient-active'||selector==='.event.price-gradient-active > .event-card, .event.price-gradient-active.event-sticky',price=selector==='.event.price-gradient-active .price:not(.blind-price)';
    if(!band&&!background&&!price)return;
    rule.walkDecls(d=>{if(band&&d.prop in PROPERTY_MAP||background&&d.prop==='background'&&(d.value==='var(--event-background, var(--price-gradient-background, var(--price-tier-background-color)))'||d.value==='var(--event-background)'||d.value==='var(--price-gradient-background, var(--event-background))')||price&&d.prop==='color'&&d.value==='var(--price-color)')d.remove();});
    if(!rule.nodes.length){const comment=rule.prev();if(comment?.type==='comment'&&/元起 · /.test(comment.text))comment.remove();rule.remove();}
  });
}
export function reverseSyncPriceGradientCss(source:string,value:unknown,enabled:boolean):{model:NativePriceGradient|undefined;css:string}{
  if(!enabled&&!source.includes('.price-gradient-active'))return{model:value as NativePriceGradient|undefined,css:source};
  let model=normalizePriceGradient(value);const root=postcss.parse(source),current=bandRules(root),previous=bandRules(postcss.parse(renderPriceGradientCss(model,true)));
  for(const key of new Set([...previous.keys(),...current.keys()])){
    const before=previous.get(key),after=current.get(key),target=after??before!;
    if(!model.bands.some(b=>b.id===target.id))continue;
    for(const property of ['background','color'] as const){
      const variables=property==='background'?['--price-tier-background-color','--event-background']:['--price-color'];
      const old=variables.map(variable=>before?.values.get(variable)).find(value=>value!==undefined),next=variables.map(variable=>after?.values.get(variable)).find(value=>value!==undefined);
      if(old===next)continue;
      model=setPriceBandColor(model,target.scope,target.id,target.scheme,property,next);
      if(next===undefined){const own=model.colors[target.scope]?.[target.id];if(own?.common&&own.common[property]===old)delete own.common[property];}
    }
  }
  removeGradientRules(root,new Set(model.bands.map(b=>b.id)));return{model,css:root.toString()};
}
export function patchPriceGradientCss(source:string,value:unknown,enabled:boolean,previous:unknown=value):string{
  const root=postcss.parse(source);removeGradientRules(root,new Set([...normalizePriceGradient(value).bands,...normalizePriceGradient(previous).bands].map(b=>b.id)));const css=renderPriceGradientCss(value,enabled);
  const end=root.nodes.find(n=>n.type==='comment'&&n.text.trim()==='danmu-managed:end');
  if(css){const rules=[...postcss.parse(css).nodes];if(end)for(const rule of rules)root.insertBefore(end,rule);else root.append(...rules);}
  return root.toString();
}
