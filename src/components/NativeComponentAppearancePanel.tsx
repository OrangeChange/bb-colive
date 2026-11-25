import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./shadcn/dialog";
import { Button } from "./shadcn/button";
import { Input } from "./shadcn/input";
import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";
import { useState } from "react";
import {
  NATIVE_COMPONENT_LABELS,
  NATIVE_COMPONENT_PARTS,
  type NativeComponentAppearance,
  type NativeComponentPart,
  type NativeComponentStyle,
} from "../themes/nativeComponentAppearance.ts";

function NumberField({ label, value, onChange, step = 1 }: { label: string; value?: number; onChange: (value?: number) => void; step?: number }) {
  useUiLanguage();
  return <label><span>{label}</span><Input type="number" min="0" step={step} value={value ?? ""} placeholder={uiText("nativeComponentAppearancePanel.placeholder")} onChange={event => onChange(event.target.value === "" ? undefined : Number(event.target.value))} /></label>;
}

function TextField({ label, value, onChange }: { label: string; value?: string; onChange: (value?: string) => void }) {
  useUiLanguage();
  return <label><span>{label}</span><Input value={value ?? ""} placeholder={uiText("nativeComponentAppearancePanel.placeholder")} onChange={event => onChange(event.target.value.trim() || undefined)} /></label>;
}

export function NativeComponentAppearancePanel({ value, onChange, onClose }: {
  value: NativeComponentAppearance;
  onChange: (value: NativeComponentAppearance) => void;
  onClose: () => void;
}) {
  useUiLanguage();
  const [part, setPart] = useState<NativeComponentPart>("event");
  const current = value[part];
  const update = (patch: Partial<NativeComponentStyle>) => onChange({ ...value, [part]: { ...current, ...patch } });
  return <Dialog open onOpenChange={open=>{if(!open)onClose();}}><DialogContent asChild showCloseButton={false} className="max-w-none gap-0 p-0">
    <section className="theme-component-dialog">
      <header><div><DialogTitle asChild><h3>{uiText("nativeComponentAppearancePanel.NativeComponentAppearancePanel")}</h3></DialogTitle><DialogDescription asChild><p>{uiText("nativeComponentAppearancePanel.NativeComponentAppearancePanel2")}</p></DialogDescription></div><Button variant="outline" type="button" onClick={onClose} aria-label={uiText("nativeComponentAppearancePanel.aria_label2")}>×</Button></header>
      <div className="theme-component-body">
        <nav aria-label={uiText("nativeComponentAppearancePanel.aria_label3")}>{NATIVE_COMPONENT_PARTS.map(item => <Button variant="outline" type="button" key={item} className={part === item ? "is-active" : ""} onClick={() => setPart(item)}>{NATIVE_COMPONENT_LABELS[item]}</Button>)}</nav>
        <div className="theme-component-fields">
          <TextField label={uiText("nativeComponentAppearancePanel.label")} value={current.color} onChange={color => update({ color })} />
          <TextField label={uiText("nativeComponentAppearancePanel.label2")} value={current.background} onChange={background => update({ background })} />
          <NumberField label={uiText("nativeComponentAppearancePanel.label3")} value={current.borderWidth} onChange={borderWidth => update({ borderWidth })} />
          <TextField label={uiText("nativeComponentAppearancePanel.label4")} value={current.borderColor} onChange={borderColor => update({ borderColor })} />
          <NumberField label={uiText("nativeComponentAppearancePanel.label5")} value={current.borderRadius} onChange={borderRadius => update({ borderRadius })} />
          <Button variant="ghost" type="button" className="theme-component-reset" onClick={() => onChange({ ...value, [part]: { visible: true } })}>{uiText("common.restoreDefaults")}</Button>
          <details className="theme-component-details"><summary>{uiText("nativeComponentAppearancePanel.NativeComponentAppearancePanel3")}</summary><div>
            <TextField label={uiText("common.font")} value={current.fontFamily} onChange={fontFamily => update({ fontFamily })} />
            <NumberField label={uiText("common.fontSize")} value={current.fontSize} onChange={fontSize => update({ fontSize })} />
            <NumberField label={uiText("nativeComponentAppearancePanel.label6")} value={current.lineHeight} step={0.1} onChange={lineHeight => update({ lineHeight })} />
            <NumberField label={uiText("nativeComponentAppearancePanel.label7")} value={current.paddingX} onChange={paddingX => update({ paddingX })} />
            <NumberField label={uiText("nativeComponentAppearancePanel.label8")} value={current.paddingY} onChange={paddingY => update({ paddingY })} />
            <NumberField label={uiText("nativeComponentAppearancePanel.label9")} value={current.marginX} onChange={marginX => update({ marginX })} />
            <NumberField label={uiText("nativeComponentAppearancePanel.label10")} value={current.marginY} onChange={marginY => update({ marginY })} />
            <NumberField label={uiText("nativeComponentAppearancePanel.label11")} value={current.gap} onChange={gap => update({ gap })} />
            <NumberField label={uiText("nativeComponentAppearancePanel.label12")} value={current.width} onChange={width => update({ width })} />
            <NumberField label={uiText("nativeComponentAppearancePanel.label13")} value={current.height} onChange={height => update({ height })} />
          </div></details>
        </div>
      </div>
      <footer><Button variant="default" type="button" className="is-primary" onClick={onClose}>{uiText("nativeComponentAppearancePanel.NativeComponentAppearancePanel4")}</Button></footer>
    </section></DialogContent></Dialog>;
}
