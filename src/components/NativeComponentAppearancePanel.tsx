import { useState } from "react";
import {
  NATIVE_COMPONENT_LABELS,
  NATIVE_COMPONENT_PARTS,
  type NativeComponentAppearance,
  type NativeComponentPart,
  type NativeComponentStyle,
} from "../themes/nativeComponentAppearance.ts";

function NumberField({ label, value, onChange, step = 1 }: { label: string; value?: number; onChange: (value?: number) => void; step?: number }) {
  return <label><span>{label}</span><input type="number" min="0" step={step} value={value ?? ""} placeholder="继承" onChange={event => onChange(event.target.value === "" ? undefined : Number(event.target.value))} /></label>;
}

function TextField({ label, value, onChange }: { label: string; value?: string; onChange: (value?: string) => void }) {
  return <label><span>{label}</span><input value={value ?? ""} placeholder="继承" onChange={event => onChange(event.target.value.trim() || undefined)} /></label>;
}

export function NativeComponentAppearancePanel({ value, onChange, onClose }: {
  value: NativeComponentAppearance;
  onChange: (value: NativeComponentAppearance) => void;
  onClose: () => void;
}) {
  const [part, setPart] = useState<NativeComponentPart>("event");
  const current = value[part];
  const update = (patch: Partial<NativeComponentStyle>) => onChange({ ...value, [part]: { ...current, ...patch } });
  return <div className="theme-name-overlay" role="dialog" aria-modal="true" aria-label="部件样式">
    <section className="theme-component-dialog">
      <header><div><h3>部件样式</h3><p>设置原生事件中各部件的外观。</p></div><button type="button" onClick={onClose} aria-label="关闭部件样式">×</button></header>
      <div className="theme-component-body">
        <nav aria-label="事件部件">{NATIVE_COMPONENT_PARTS.map(item => <button type="button" key={item} className={part === item ? "is-active" : ""} onClick={() => setPart(item)}>{NATIVE_COMPONENT_LABELS[item]}</button>)}</nav>
        <div className="theme-component-fields">
          <TextField label="文字颜色" value={current.color} onChange={color => update({ color })} />
          <TextField label="背景颜色" value={current.background} onChange={background => update({ background })} />
          <NumberField label="边框宽度" value={current.borderWidth} onChange={borderWidth => update({ borderWidth })} />
          <TextField label="边框颜色" value={current.borderColor} onChange={borderColor => update({ borderColor })} />
          <NumberField label="圆角" value={current.borderRadius} onChange={borderRadius => update({ borderRadius })} />
          <button type="button" className="theme-component-reset" onClick={() => onChange({ ...value, [part]: { visible: true } })}>恢复默认</button>
          <details className="theme-component-details"><summary>尺寸与间距</summary><div>
            <TextField label="字体" value={current.fontFamily} onChange={fontFamily => update({ fontFamily })} />
            <NumberField label="字号" value={current.fontSize} onChange={fontSize => update({ fontSize })} />
            <NumberField label="行高" value={current.lineHeight} step={0.1} onChange={lineHeight => update({ lineHeight })} />
            <NumberField label="水平内边距" value={current.paddingX} onChange={paddingX => update({ paddingX })} />
            <NumberField label="垂直内边距" value={current.paddingY} onChange={paddingY => update({ paddingY })} />
            <NumberField label="水平外边距" value={current.marginX} onChange={marginX => update({ marginX })} />
            <NumberField label="垂直外边距" value={current.marginY} onChange={marginY => update({ marginY })} />
            <NumberField label="内部间距" value={current.gap} onChange={gap => update({ gap })} />
            <NumberField label="宽度" value={current.width} onChange={width => update({ width })} />
            <NumberField label="高度" value={current.height} onChange={height => update({ height })} />
          </div></details>
        </div>
      </div>
      <footer><button type="button" className="is-primary" onClick={onClose}>完成</button></footer>
    </section>
  </div>;
}
