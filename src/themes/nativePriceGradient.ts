import { uiText } from "../i18n/index.ts";
import { MsgType, type DanmakuEvent } from '../protocol/types.ts';
import { stickyDisplayAmount } from '../windows/stickyEventModel.ts';

export type PriceGradientKind = 'normal' | 'blind' | 'superchat';
export type PriceGradientScope = PriceGradientKind | 'common';
export type PriceGradientScheme = 'common' | 'light' | 'dark';
export type PriceGradientProperty = 'color' | 'background';
export interface PriceBand { id: string; min: number }
type Colors = Partial<Record<PriceGradientProperty, string>>;
export interface NativePriceGradient {
  preset: 'default' | 'card' | 'bubble';
  nextCustomId: number;
  types: Record<PriceGradientKind, boolean>;
  bands: PriceBand[];
  colors: Partial<Record<PriceGradientScope, Record<string, Partial<Record<PriceGradientScheme, Colors>>>>>;
}

/** B站 SuperChat/config：价格、卡片浅底、底部主色、金额块背景。 */
export const OFFICIAL_SC_PALETTE = [
  [30, '#EDF5FF', '#2A60B2', '#7497CD'],
  [50, '#DBFFFD', '#427D9E', '#7DA4BD'],
  [100, '#FFF1C5', '#E2B52B', '#ECCF75'],
  [500, '#FFEAD2', '#E09443', '#E8AF79'],
  [1000, '#FFE7E4', '#E54D4D', '#EE8B8B'],
  [2000, '#FFD8D8', '#AB1A32', '#C86A7A'],
] as const;
const KINDS: PriceGradientKind[] = ['normal', 'blind', 'superchat'];
const DEFAULT_BANDS = [0, ...OFFICIAL_SC_PALETTE.map(row=>row[0])].map((min,index)=>({id:`band-${index}`,min}));
/** 三个原生主题的定稿配色，每档依次为文字主色与底色。 */
const THEME_PRICE_PALETTES = {
  default: {
    light: [
      ["rgb(61, 83, 114)","rgba(156, 176, 218, 0.3)"],
      ["rgb(29, 91, 171)","rgba(152, 219, 255, 0.3)"],
      ["rgb(33, 115, 126)","rgba(146, 241, 241, 0.3)"],
      ["rgb(156, 128, 17)","rgba(249, 221, 128, 0.3)"],
      ["rgb(176, 89, 8)","rgba(240, 187, 101, 0.3)"],
      ["rgb(193, 61, 41)","rgba(255, 170, 146, 0.3)"],
      ["rgb(159, 19, 85)","rgba(251, 98, 98, 0.3)"],
    ],
    dark: [
      ["rgb(160, 185, 221)","rgba(82, 99, 134, 0.3)"],
      ["rgb(170, 205, 255)","rgba(70, 124, 152, 0.3)"],
      ["rgb(140, 217, 229)","rgba(51, 130, 131, 0.3)"],
      ["rgb(230, 201, 105)","rgba(137, 115, 35, 0.3)"],
      ["rgb(254, 185, 140)","rgba(149, 108, 34, 0.3)"],
      ["rgb(255, 182, 167)","rgba(194, 125, 106, 0.3)"],
      ["rgb(255, 177, 200)","rgba(176, 85, 82, 0.3)"],
    ],
  },
  card: {
    light: [
      ["rgb(65, 83, 108)","rgb(255, 254, 250)"],
      ["rgb(45, 93, 157)","rgb(255, 254, 250)"],
      ["rgb(53, 113, 122)","rgb(255, 254, 250)"],
      ["rgb(125, 103, 21)","rgb(255, 254, 250)"],
      ["rgb(154, 84, 31)","rgb(255, 254, 250)"],
      ["rgb(177, 67, 50)","rgb(255, 254, 250)"],
      ["rgb(148, 43, 86)","rgb(255, 254, 250)"],
    ],
    dark: [
      ["rgb(158, 178, 208)","rgb(27, 33, 30)"],
      ["rgb(170, 198, 239)","rgb(27, 33, 30)"],
      ["rgb(147, 208, 218)","rgb(27, 33, 30)"],
      ["rgb(219, 195, 120)","rgb(27, 33, 30)"],
      ["rgb(239, 182, 146)","rgb(27, 33, 30)"],
      ["rgb(252, 176, 159)","rgb(27, 33, 30)"],
      ["rgb(240, 176, 194)","rgb(27, 33, 30)"],
    ],
  },
  bubble: {
    light: [
      ["rgb(62, 83, 112)","rgb(234, 239, 248)"],
      ["rgb(34, 92, 167)","rgb(227, 241, 249)"],
      ["rgb(40, 114, 125)","rgb(224, 243, 243)"],
      ["rgb(126, 102, 3)","rgb(244, 239, 220)"],
      ["rgb(160, 80, 6)","rgb(249, 237, 219)"],
      ["rgb(188, 55, 35)","rgb(255, 232, 225)"],
      ["rgb(156, 28, 85)","rgb(244, 200, 200)"],
    ],
    dark: [
      ["rgb(158, 182, 216)","rgb(56, 64, 80)"],
      ["rgb(169, 202, 249)","rgb(47, 70, 83)"],
      ["rgb(141, 213, 224)","rgb(41, 73, 73)"],
      ["rgb(225, 198, 108)","rgb(75, 66, 34)"],
      ["rgb(248, 183, 140)","rgb(81, 63, 33)"],
      ["rgb(245, 164, 148)","rgb(102, 66, 55)"],
      ["rgb(249, 175, 197)","rgb(94, 53, 51)"],
    ],
  },
} as const;

export function normalizePriceGradient(value?: unknown, preset: NativePriceGradient['preset'] = 'default'): NativePriceGradient {
  const source = value && typeof value==='object' ? value as Partial<NativePriceGradient> : {};
  const candidates = Array.isArray(source.bands) && source.bands.length ? source.bands : DEFAULT_BANDS;
  const bands = candidates.filter(b=>b && /^[a-zA-Z][\w-]*$/.test(b.id) && Number.isFinite(b.min) && b.min>=0)
    .map(b=>({id:b.id,min:Math.round(b.min*100)/100})).sort((a,b)=>a.min-b.min)
    .filter((b,i,all)=>all.findIndex(x=>x.min===b.min)===i && all.findIndex(x=>x.id===b.id)===i);
  if (!bands.length || bands[0].min!==0) bands.unshift({id:'base',min:0});
  const usedCustomIds=bands.map(b=>b.id.match(/^custom-(\d+)$/)).filter(Boolean).map(m=>Number(m![1])+1);
  const nextCustomId=Math.max(0,Number.isInteger(source.nextCustomId)?source.nextCustomId!:0,...usedCustomIds);
  return {nextCustomId,preset:source.preset==='card'||source.preset==='bubble'||source.preset==='default'?source.preset:preset,types:Object.fromEntries(KINDS.map(k=>[k,source.types?.[k]!==false])) as NativePriceGradient['types'],bands,colors:structuredClone(source.colors??{})};
}
export function setPriceBandMin(value: NativePriceGradient, id: string, min: number): NativePriceGradient {
  let model=normalizePriceGradient(value);
  for(const scheme of ['light','dark'] as const)for(const property of ['color','background'] as const){
    model=setPriceBandColor(model,'common',id,scheme,property,priceBandColor(model,'common',id,scheme,property));
  }
  return normalizePriceGradient({...model,bands:model.bands.map(b=>b.id===id?{...b,min}:b)});
}
export function addPriceBand(value: NativePriceGradient): NativePriceGradient {
  const model=normalizePriceGradient(value);
  return {...model,nextCustomId:model.nextCustomId+1,bands:[...model.bands,{id:`custom-${model.nextCustomId}`,min:Math.max(...model.bands.map(b=>b.min))+100}]};
}
export function priceBandLabel(band: PriceBand): string {
  if(band.min===0)return uiText("priceBands.base");
  return band.id.startsWith('band-')?uiText("priceBands.number", { number: band.id.slice(5) }):band.id.startsWith('custom-')?uiText("priceBands.custom", { number: Number(band.id.slice(7)) + 1 }):band.id;
}
export function themePriceGradient(value: unknown, baseCss: string): NativePriceGradient {
  return normalizePriceGradient(value,baseCss.includes('--bubble-surface')?'bubble':baseCss.includes('--card-surface')?'card':'default');
}
export function priceGradientKind(event: DanmakuEvent): PriceGradientKind | undefined {
  if(event.msgType===MsgType.SuperChat)return 'superchat';
  if(event.msgType===MsgType.Gift && !event.gift?.isFree && event.gift?.coinType!=='silver')return event.gift?.blindGiftName?'blind':'normal';
}
export function priceBandForEvent(event: DanmakuEvent, model: NativePriceGradient): PriceBand | undefined {
  if(!priceGradientKind(event))return;
  const value=stickyDisplayAmount(event);
  if(value===undefined)return;
  return [...model.bands].reverse().find(b=>value>=b.min);
}
export function priceGradientClass(event: DanmakuEvent, value: unknown, enabled: boolean): string {
  const model=normalizePriceGradient(value),kind=priceGradientKind(event),band=priceBandForEvent(event,model);
  return band && kind ? `price-tier-${band.id}${enabled && model.types[kind]?' price-gradient-active':''}` : '';
}
export function priceBandColor(model: NativePriceGradient, kind: PriceGradientScope, id: string, scheme: PriceGradientScheme, property: PriceGradientProperty): string {
  const own=model.colors[kind]?.[id],common=model.colors.common?.[id];
  const value=own?.[scheme]?.[property]??own?.common?.[property]??common?.[scheme]?.[property]??common?.common?.[property];
  if(value!==undefined)return value;
  const band=model.bands.find(b=>b.id===id)??model.bands[0];
  const index=[0,...OFFICIAL_SC_PALETTE.map(row=>row[0])].filter(min=>min<=band.min).length-1;
  const palette=THEME_PRICE_PALETTES[model.preset][scheme==='dark'?'dark':'light'][index];
  return palette[property==='color'?0:1];
}
export function setPriceBandColor(value: NativePriceGradient, kind: PriceGradientScope, id: string, scheme: PriceGradientScheme, property: PriceGradientProperty, color: string | undefined): NativePriceGradient {
  const model=normalizePriceGradient(value);
  const scopes=model.colors[kind]??={},band=scopes[id]??={},colors=band[scheme]??={};
  if(color===undefined)delete colors[property];else colors[property]=color;
  return model;
}
export function renderPriceGradientCss(value: unknown, enabled: boolean): string {
  if(!enabled)return '';
  const model=normalizePriceGradient(value),rules:string[]=[];
  for(const kind of ['common',...KINDS] as const)for(const band of model.bands)for(const scheme of ['light','dark'] as const){
    const own=model.colors[kind]?.[band.id];
    const properties=(['background','color'] as const).filter(p=>kind==='common'||own?.[scheme]?.[p]!==undefined||own?.common?.[p]!==undefined||scheme==='dark'&&own?.light?.[p]!==undefined);
    if(!properties.length)continue;
    const category=kind==='common'?'':`.${kind==='superchat'?'type-superchat':`gift-${kind}`}`;
    const root=`${scheme==='dark'?'.dark ':''}.event${category}.price-gradient-active.price-tier-${band.id}`;
    rules.push(`/* ${band.min}元起 · ${scheme==='dark'?'深色':'浅色'}${kind==='common'?'':` · ${kind}`} */\n${root} {\n${properties.map(p=>`  --${p==='background'?'price-tier-background-color':'price-color'}: ${priceBandColor(model,kind,band.id,scheme,p)};`).join('\n')}\n}`);
  }
  rules.push('.event.price-gradient-active {\n  background: var(--event-background, var(--price-gradient-background, var(--price-tier-background-color)));\n}',
    '.event.price-gradient-active .price:not(.blind-price) {\n  color: var(--price-color);\n}');
  return rules.join('\n\n');
}
