import { uiText } from "../i18n/index.ts";
import { useEffect, useState } from "react";
import { HslaColorPicker, RgbaColorPicker } from "react-colorful";
import { hexToRgba, hslaToRgba, rgbaToHex, rgbaToHsla, type HslaColor, type RgbaColor } from "../eventStyleSettings";

export function ColorSlider({ value, onChange, compact = false }: { value: RgbaColor; onChange: (value: RgbaColor) => void; compact?: boolean }) {
  const [mode, setMode] = useState<"rgba" | "hsla" | "hex">("hex");
  const [hexDraft, setHexDraft] = useState(() => rgbaToHex(value));
  const hsla = rgbaToHsla(value);
  useEffect(() => setHexDraft(rgbaToHex(value)), [value.r, value.g, value.b, value.a]);
  const fields = mode === "rgba"
    ? [["R", "r", value.r, 0, 255], ["G", "g", value.g, 0, 255], ["B", "b", value.b, 0, 255], ["A", "a", value.a, 0, 1]] as const
    : mode === "hsla"
      ? [["H", "h", hsla.h, 0, 360], ["S", "s", hsla.s, 0, 100], ["L", "l", hsla.l, 0, 100], ["A", "a", hsla.a, 0, 1]] as const
      : null;
  return <div className={`style-color-editor${compact ? " style-color-editor-compact" : ""}`}>
    <div className="style-color-picker-surface" aria-label={uiText("colorSlider.aria_label")}>{mode === "hsla" ? <HslaColorPicker color={hsla} onChange={next => onChange(hslaToRgba(next))} /> : <RgbaColorPicker color={value} onChange={onChange} />}</div>
    <div className="style-color-precise" aria-label={uiText("colorSlider.aria_label2", { value: mode.toUpperCase() })}>
      <div className="style-color-precise-title ui-type-control text-t2">{uiText("colorSlider.ColorSlider")}{mode.toUpperCase()}</div>
      <div className="style-color-mode-tabs" role="group" aria-label={uiText("colorSlider.aria_label3")}>{(["hex", "rgba", "hsla"] as const).map(option => <button key={option} type="button" aria-pressed={mode === option} onClick={() => setMode(option)} className={mode === option ? "is-active" : ""}>{option.toUpperCase()}</button>)}</div>
      {fields ? <div className="style-color-fields">{fields.map(([label, key, fieldValue, min, max]) => <label key={key}><span>{label}</span><input type="number" min={min} max={max} step={key === "a" ? 0.01 : 1} value={fieldValue} aria-label={label} onChange={event => { const next = Number(event.target.value); if (!Number.isFinite(next)) return; if (mode === "rgba") onChange({ ...value, [key]: next } as RgbaColor); else onChange(hslaToRgba({ ...hsla, [key]: next } as HslaColor)); }} /></label>)}</div>
        : <div className="style-color-hex-fields"><label><span>HEX</span><input type="text" inputMode="text" maxLength={9} value={hexDraft} aria-label={uiText("colorSlider.aria_label4")} onChange={event => { const nextDraft = event.target.value; setHexDraft(nextDraft); const next = hexToRgba(nextDraft, value.a); if (next) onChange(next); }} onBlur={() => setHexDraft(rgbaToHex(value))} /></label><label><span>{uiText("colorSlider.ColorSlider2")}</span><div className="style-color-opacity-input"><input type="number" min={0} max={100} step={1} value={Math.round(value.a * 100)} aria-label={uiText("colorSlider.aria_label5")} onChange={event => { const next = Number(event.target.value); if (Number.isFinite(next)) onChange({ ...value, a: Math.min(100, Math.max(0, next)) / 100 }); }} /><span aria-hidden="true">%</span></div></label></div>}
    </div>
  </div>;
}
