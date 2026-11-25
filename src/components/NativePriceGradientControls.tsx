import { Input } from "./shadcn/input";
import { Button } from "./shadcn/button";
import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";
import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./shadcn/dialog";
import { UiSelect } from './ui/Select.tsx';
import { normalizePriceGradient, addPriceBand, setPriceBandMin, priceBandLabel, type NativePriceGradient, type PriceGradientKind } from '../themes/nativePriceGradient.ts';

export function priceKindsForScope(event: string): PriceGradientKind[] {
  return event==='all' ? ['normal','blind','superchat'] : ['normal','blind','superchat'].includes(event) ? [event as PriceGradientKind] : [];
}

export function NativePriceGradientControls({ event, model, selected, onSelect, onChange }: {
  event: string; model: NativePriceGradient; selected: string; onSelect: (id:string)=>void;
  onChange: (model:NativePriceGradient)=>void;
}) {
  useUiLanguage();
  const [manage,setManage]=useState(false),[error,setError]=useState('');
  const kinds=priceKindsForScope(event);
  if(!kinds.length)return null;
  const enabled=kinds.filter(k=>model.types[k]).length;
  const mode=enabled===kinds.length?'gradient':enabled===0?'fixed':'mixed';
  const updateMin=(id:string,value:number)=>{
    if(!Number.isFinite(value)||value<0||model.bands.some(b=>b.id!==id&&b.min===value)){setError(uiText("nativePriceGradientControls.NativePriceGradientControls.updateMin"));return;}
    setError('');onChange(setPriceBandMin(model,id,value));
  };
  return <div className="native-price-gradient-controls">
    <div className="native-price-gradient-scope">
      <div className="native-price-mode"><span>{uiText("nativePriceGradientControls.NativePriceGradientControls")}</span><UiSelect ariaLabel={uiText("nativePriceGradientControls.label")} placeholder={uiText("nativePriceGradientControls.NativePriceGradientControls2")} value={mode==='mixed'?undefined:mode} options={[{value:'fixed',label:uiText("nativePriceGradientControls.options.label")},{value:'gradient',label:uiText("nativePriceGradientControls.options.label2")}]} onValueChange={value=>{
        onChange({...model,types:{...model.types,...Object.fromEntries(kinds.map(k=>[k,value==='gradient']))}});
        onSelect(value==='gradient'?model.bands[0].id:'');
      }}/></div>
      {mode!=='fixed'&&<><label><span>{uiText("nativePriceGradientControls.NativePriceGradientControls3")}</span><UiSelect ariaLabel={uiText("nativePriceGradientControls.ariaLabel")} value={selected} options={[{value:'',label:uiText("nativePriceGradientControls.fixedColor") },...model.bands.map(b=>({value:b.id,title:b.min===0?uiText("nativePriceGradientControls.baseTierHint"):undefined,label:b.min===0?uiText("nativePriceGradientControls.options.label3"):uiText("nativePriceGradientControls.options.label4", { value: priceBandLabel(b), min: b.min })})),{value:'__manage_price_bands',label:uiText("nativePriceGradientControls.NativePriceGradientControls4"),separatorBefore:true}]} onValueChange={value=>{if(value==='__manage_price_bands')requestAnimationFrame(()=>setManage(true));else onSelect(value);}}/></label></>}
    </div>
    <Dialog open={manage} onOpenChange={setManage}><DialogContent asChild showCloseButton={false} className="max-w-none gap-0 p-0"><section className="theme-transfer-panel native-price-band-dialog">
      <header><div><DialogTitle asChild><h3>{uiText("nativePriceGradientControls.NativePriceGradientControls6")}</h3></DialogTitle><DialogDescription asChild><p>{uiText("nativePriceGradientControls.NativePriceGradientControls7")}</p></DialogDescription></div><Button variant="outline" type="button" onClick={()=>setManage(false)}>{uiText("common.close")}</Button></header>
      <div className="theme-transfer-body native-price-band-manager">
      <p className="ui-type-control text-t3">{uiText("nativePriceGradientControls.NativePriceGradientControls8")}</p>
      {model.bands.map(b=><div className="native-price-band-row" key={b.id}>
        <label>{priceBandLabel(b)}<Input key={`${b.id}:${b.min}`} aria-label={uiText("nativePriceGradientControls.aria_label2", { min: b.min })} type="number" min="0" step="0.01" defaultValue={b.min} disabled={b.min===0} onBlur={e=>updateMin(b.id,Number(e.target.value))}/><span>{uiText("nativePriceGradientControls.NativePriceGradientControls9")}</span></label>
        {b.min>0&&<Button variant="outline" type="button" className="ui-btn" aria-label={uiText("nativePriceGradientControls.aria_label3", { min: b.min })} onClick={()=>{const next=normalizePriceGradient({...model,bands:model.bands.filter(x=>x.id!==b.id)});for(const colors of Object.values(next.colors))if(colors)delete colors[b.id];onChange(next);if(selected===b.id)onSelect(next.bands[0].id);}}>{uiText("common.delete")}</Button>}
      </div>)}
      {error&&<p role="alert">{error}</p>}
      </div><footer className="native-price-band-actions"><Button variant="outline" type="button" className="ui-btn" onClick={()=>{const next=addPriceBand(model);onChange(next);onSelect(next.bands[next.bands.length-1].id);}}>{uiText("nativePriceGradientControls.NativePriceGradientControls10")}</Button>
        <Button variant="outline" type="button" className="ui-btn" onClick={()=>{onChange(normalizePriceGradient({types:model.types,preset:model.preset,nextCustomId:model.nextCustomId}));onSelect('');setManage(false);}}>{uiText("nativePriceGradientControls.NativePriceGradientControls11")}</Button><Button variant="default" type="button" className="is-primary" onClick={()=>setManage(false)}>{uiText("nativePriceGradientControls.NativePriceGradientControls12")}</Button></footer>
    </section></DialogContent></Dialog>
  </div>;
}
