import { SettingsChoiceControl } from "./SettingsChoiceControl";
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { bindUiDismissableLayer } from './ui/layer';
import { UiSelect } from './ui/Select.tsx';
import { normalizePriceGradient, addPriceBand, setPriceBandMin, priceBandLabel, type NativePriceGradient, type PriceGradientKind } from '../themes/nativePriceGradient.ts';

export function priceKindsForScope(event: string): PriceGradientKind[] {
  return event==='all' ? ['normal','blind','superchat'] : ['normal','blind','superchat'].includes(event) ? [event as PriceGradientKind] : [];
}

export function NativePriceGradientControls({ event, model, selected, onSelect, onChange, applied }: {
  event: string; model: NativePriceGradient; selected: string; onSelect: (id:string)=>void;
  onChange: (model:NativePriceGradient)=>void; applied: boolean;
}) {
  const [manage,setManage]=useState(false),[error,setError]=useState('');
  const manager=useRef<HTMLElement>(null);
  useEffect(()=>manage&&manager.current?bindUiDismissableLayer(manager.current,()=>setManage(false),{modal:true}):undefined,[manage]);
  const kinds=priceKindsForScope(event);
  if(!kinds.length)return null;
  const enabled=kinds.filter(k=>model.types[k]).length;
  const mode=enabled===kinds.length?'gradient':enabled===0?'fixed':'mixed';
  const updateMin=(id:string,value:number)=>{
    if(!Number.isFinite(value)||value<0||model.bands.some(b=>b.id!==id&&b.min===value)){setError('起始金额不能重复，且不能小于0元');return;}
    setError('');onChange(setPriceBandMin(model,id,value));
  };
  return <div className="native-price-gradient-controls">
    <div className="native-price-gradient-scope">
      <div className="native-price-mode"><span>价格配色</span><SettingsChoiceControl label="价格配色" value={mode==='mixed'?undefined:mode} options={[{value:'fixed',label:'固定配色'},{value:'gradient',label:'价格梯度'}]} onChange={value=>{
        onChange({...model,types:{...model.types,...Object.fromEntries(kinds.map(k=>[k,value==='gradient']))}});
        onSelect(value==='gradient'?model.bands[0].id:'');
      }}/>{mode==='mixed'&&<small>分类型设置</small>}</div>
      {mode!=='fixed'&&<><label><span>金额档位</span><UiSelect ariaLabel="金额档位" value={selected} options={[{value:'',label:'固定配色' },...model.bands.map(b=>({value:b.id,label:b.min===0?'基础档（不足下一档）':`${priceBandLabel(b)} · ${b.min}元起`}))]} onValueChange={onSelect}/></label>
        <button type="button" className="ui-btn" aria-expanded={manage} onClick={()=>setManage(!manage)}>管理档位</button></>}
    </div>
    {selected&&!applied&&<p className="ui-type-control text-t3">价格梯度尚未应用，当前仅预览所选档位。</p>}
    {manage&&createPortal(<div className="theme-name-overlay" role="presentation"><section ref={manager} tabIndex={-1} className="theme-transfer-panel native-price-band-dialog" role="dialog" aria-modal="true" aria-label="管理金额档位">
      <header><div><h3>管理金额档位</h3><p>修改起始金额，调整所有参与类型共用的价格档位。</p></div><button type="button" onClick={()=>setManage(false)}>关闭</button></header>
      <div className="theme-transfer-body native-price-band-manager">
      <p className="ui-type-control text-t3">档位共用，起始金额包含在本档内。修改金额不改变档位配色，基础档从0元开始。</p>
      {model.bands.map(b=><div className="native-price-band-row" key={b.id}>
        <label>{priceBandLabel(b)}<input key={`${b.id}:${b.min}`} aria-label={`档位 ${b.min} 起始金额`} type="number" min="0" step="0.01" defaultValue={b.min} disabled={b.min===0} onBlur={e=>updateMin(b.id,Number(e.target.value))}/><span>元</span></label>
        {b.min>0&&<button type="button" className="ui-btn" aria-label={`删除 ${b.min} 元档位`} onClick={()=>{const next=normalizePriceGradient({...model,bands:model.bands.filter(x=>x.id!==b.id)});for(const colors of Object.values(next.colors))if(colors)delete colors[b.id];onChange(next);if(selected===b.id)onSelect(next.bands[0].id);}}>删除</button>}
      </div>)}
      {error&&<p role="alert">{error}</p>}
      </div><footer className="native-price-band-actions"><button type="button" className="ui-btn" onClick={()=>{const next=addPriceBand(model);onChange(next);onSelect(next.bands[next.bands.length-1].id);}}>添加档位</button>
        <button type="button" className="ui-btn" onClick={()=>{onChange(normalizePriceGradient({types:model.types,preset:model.preset,nextCustomId:model.nextCustomId}));onSelect('');setManage(false);}}>恢复预设档位与配色</button><button type="button" className="is-primary" onClick={()=>setManage(false)}>完成</button></footer>
    </section></div>,document.body)}
  </div>;
}
