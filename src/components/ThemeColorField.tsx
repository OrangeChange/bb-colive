import { useColorPickerLabels } from "./useColorPickerLabels.ts";
import { useUiLanguage } from "../i18n/react.ts";
import { localized, uiText } from "../i18n/index.ts";
import { X as LucideX, Check, Pipette, Eraser } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RgbColorPicker, RgbaColorPicker } from "react-colorful";
import { placeThemeColorPopover, type ThemeColorPopoverPosition } from "./themeColorPopover.ts";
import { ThemeNumberInput } from "./ThemeNumberInput.tsx";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "./shadcn/select";
import { Input } from "./shadcn/input";
import { Button } from "./shadcn/button";
import { applyThemeColorPickerChange, inferThemeColorFormat, parseThemeColor, serializeThemeColor, type ThemeColorFormat } from "./themeColorValue.ts";
import { STYLE_PREVIEW_POINTER_DOWN_EVENT } from "./stylePreviewInteraction.ts";
import { createThemeColorDragInteraction } from "./themeColorInteraction.ts";

type EyeDropperConstructor = new () => { open: () => Promise<{ sRGBHex: string }> };
const COLOR_PRESETS = localized(() => ([
  { label: uiText("themeColorField.COLOR_PRESETS.label"), value: "#ffffff" }, { label: uiText("themeColorField.COLOR_PRESETS.label2"), value: "#000000" },
  { label: uiText("themeColorField.COLOR_PRESETS.label3"), value: "#fb7299" }, { label: uiText("themeColorField.COLOR_PRESETS.label4"), value: "#7c3aed" },
  { label: uiText("themeColorField.COLOR_PRESETS.label5"), value: "#23ade5" }, { label: uiText("themeColorField.COLOR_PRESETS.label6"), value: "#6366f1" },
  { label: uiText("themeColorField.COLOR_PRESETS.label7"), value: "#4c9a8d" }, { label: uiText("themeColorField.COLOR_PRESETS.label8"), value: "#14b8a6" },
  { label: uiText("themeColorField.COLOR_PRESETS.label9"), value: "#f59e0b" }, { label: uiText("themeColorField.COLOR_PRESETS.label10"), value: "#f97316" },
  { label: uiText("themeColorField.COLOR_PRESETS.label11"), value: "#ef4444" }, { label: uiText("themeColorField.COLOR_PRESETS.label12"), value: "#64748b" },
] as const));

export function ThemeColorField({ value, onChange, onPreviewChange, onPreviewCancel, label, opaque = false, allowTransparent = !opaque, mixed = false, inline = false, valueLabel }: { valueLabel?: string; opaque?: boolean; inline?: boolean; value: string; onChange: (value: string) => void; onPreviewChange?: (value: string) => void; onPreviewCancel?: () => void; label: string; allowTransparent?: boolean; mixed?: boolean }) {
  useUiLanguage();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useColorPickerLabels(panel);
  const presets = useRef<HTMLDivElement>(null);
  const [presetFocus, setPresetFocus] = useState(0);
  const draggingPicker = useRef(false);
  const pickerCancelled = useRef(false);
  const selectsVisibleColor = useRef(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<ThemeColorPopoverPosition | null>(null);
  const [draft, setDraft] = useState(value);
  const [format, setFormat] = useState<ThemeColorFormat>(() => opaque ? "hex" : inferThemeColorFormat(value) ?? "hex");
  const formatRef = useRef(format);
  formatRef.current = format;
  const [eyeDropperError, setEyeDropperError] = useState("");
  const changeRef = useRef(onChange);
  const savedValue = useRef(value);
  savedValue.current = value;
  const previewChangeRef = useRef(onPreviewChange);
  changeRef.current = onChange;
  previewChangeRef.current = onPreviewChange;
  const dragInteraction = useMemo(() => createThemeColorDragInteraction({
    preview: next => previewChangeRef.current?.(next),
    commit: next => changeRef.current(next),
  }), []);
  const parsed = useMemo(() => parseThemeColor(value), [value]);
  const color = parsed ?? { r: 255, g: 255, b: 255, a: 1 };
  const savedColor = useRef(color);
  savedColor.current = color;
  const [pickerColor, setPickerColor] = useState(color);
  const transparent = color.a === 0 || value.trim().toLowerCase() === "transparent";
  const eyeDropper = typeof window !== "undefined" ? (window as Window & { EyeDropper?: EyeDropperConstructor }).EyeDropper : undefined;
  useEffect(() => {
    const strip = presets.current;
    if (!strip) return;
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey) return;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      const distance = delta * (event.deltaMode === 1 ? 20 : event.deltaMode === 2 ? strip.clientWidth : 1);
      const next = Math.max(0, Math.min(strip.scrollWidth - strip.clientWidth, strip.scrollLeft + distance));
      if (Math.abs(next - strip.scrollLeft) < 1) return;
      event.preventDefault();
      strip.scrollLeft = next;
    };
    strip.addEventListener("wheel", wheel, { passive: false });
    return () => strip.removeEventListener("wheel", wheel);
  }, [open, inline, parsed !== null, position !== null]);
  const cancelDrag = () => {
    if (!draggingPicker.current) return;
    dragInteraction.cancel();
    pickerCancelled.current = true;
    draggingPicker.current = false;
    selectsVisibleColor.current = false;
    setPickerColor(savedColor.current);
    setDraft(opaque ? serializeThemeColor(savedColor.current, formatRef.current, true) : savedValue.current);
    onPreviewCancel?.();
  };

  useEffect(() => {
    if (draggingPicker.current) return;
    const next = parseThemeColor(value) ?? { r: 255, g: 255, b: 255, a: 1 };
    setPickerColor(next);
    setDraft(opaque ? serializeThemeColor(next, formatRef.current, true) : value);
    const detected = opaque ? undefined : inferThemeColorFormat(value);
    if (detected) setFormat(detected);
  }, [value]);
  useEffect(() => () => dragInteraction.cancel(), [dragInteraction]);
  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      if (draggingPicker.current) return;
      const rect = trigger.current?.getBoundingClientRect();
      const panelRect = panel.current?.getBoundingClientRect();
      if (rect) setPosition(placeThemeColorPopover(rect, { width: window.innerWidth, height: window.innerHeight }, panelRect ? { width: panelRect.width, height: panelRect.height } : undefined));
    };
    updatePosition();
    const focusFrame = requestAnimationFrame(() => {
      updatePosition();
      panel.current?.querySelector<HTMLElement>("button, input, [tabindex]:not([tabindex='-1'])")?.focus();
    });
    const dismiss = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Node) || (!panel.current?.contains(target) && !trigger.current?.contains(target))) { cancelDrag(); setOpen(false); setPosition(null); }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.querySelector('[data-slot="select-content"][data-state="open"]')) return;
      if (event.key === "Escape") { cancelDrag(); setOpen(false); setPosition(null); trigger.current?.focus(); }
      if (event.key === "Tab" && panel.current) {
        const focusable = [...panel.current.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex='-1'])")];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!panel.current.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
        else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener(STYLE_PREVIEW_POINTER_DOWN_EVENT, dismiss as EventListener);
    window.addEventListener("keydown", escape);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      cancelAnimationFrame(focusFrame);
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener(STYLE_PREVIEW_POINTER_DOWN_EVENT, dismiss as EventListener);
      window.removeEventListener("keydown", escape);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  const editor = <div ref={panel} className={`theme-color-popover${inline ? " is-inline" : ""}`} role={inline ? "group" : "dialog"} aria-modal={inline ? undefined : true} aria-label={uiText("themeColorField.aria_label", { label: label })} style={inline ? undefined : position ?? undefined}>

      {!inline && <div className="theme-color-popover-header"><strong>{label}</strong><Button size="icon-sm" variant="ghost" type="button" aria-label={uiText("themeColorField.aria_label2")} onClick={() => { cancelDrag(); setOpen(false); setPosition(null); trigger.current?.focus(); }}><LucideX aria-hidden="true" width="16" height="16" /></Button></div>}
      <div ref={presets} className="theme-color-presets" role="group" aria-label={uiText("themeColorField.aria_label3")} onKeyDown={event => {
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
        const index = buttons.indexOf(event.target as HTMLButtonElement);
        if (index < 0) return;
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
          : event.key === "ArrowRight" ? Math.min(index + 1, buttons.length - 1)
          : event.key === "ArrowLeft" ? Math.max(index - 1, 0) : -1;
        if (next < 0) return;
        event.preventDefault();
        buttons[next].focus({ preventScroll: true });
        buttons[next].scrollIntoView({ block: "nearest", inline: "nearest" });
      }}>
        {COLOR_PRESETS.map((preset, index) => {
          const presetColor = parseThemeColor(preset.value)!;
          const luminance = [presetColor.r, presetColor.g, presetColor.b].map(channel => { const c = channel / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }).reduce((sum, channel, i) => sum + channel * [.2126, .7152, .0722][i], 0);
          const selected = !mixed && parsed !== null && color.a > 0 && color.r === presetColor.r && color.g === presetColor.g && color.b === presetColor.b;
          return <Button variant="outline" key={preset.value} type="button" title={`${preset.label} ${preset.value.toUpperCase()}`} aria-label={preset.label} aria-pressed={selected} tabIndex={presetFocus === index ? 0 : -1} onFocus={event => { setPresetFocus(index); event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" }); }} style={{ background: preset.value }} onClick={() => {
            cancelDrag();
            const next = applyThemeColorPickerChange(color, { ...presetColor, a: opaque ? 1 : color.a }, true);
            setPickerColor(next);
            const serialized = serializeThemeColor(next, format, opaque);
            setDraft(serialized); onChange(serialized);
          }}>{selected && <Check size={14} strokeWidth={3} aria-hidden="true" style={{ color: luminance < .179 ? "#ffffff" : "#000000" }} />}</Button>;
        })}
      </div>
      <div
        className="theme-color-picker"
        onPointerDownCapture={(event) => { pickerCancelled.current = false; draggingPicker.current = true; selectsVisibleColor.current = event.target instanceof Element && Boolean(event.target.closest(".react-colorful__saturation, .react-colorful__hue")); }}
        onPointerUpCapture={() => { if (draggingPicker.current && onPreviewChange) dragInteraction.end(); draggingPicker.current = false; selectsVisibleColor.current = false; }}
        onPointerCancelCapture={cancelDrag}
        onKeyDownCapture={(event) => {
          if (event.key.startsWith('Arrow')) pickerCancelled.current = false;
          if (!(event.target instanceof Element) || !event.target.closest(".react-colorful__saturation, .react-colorful__hue")) return;
          selectsVisibleColor.current = true;
          queueMicrotask(() => { selectsVisibleColor.current = false; });
        }}
      >
        {opaque ? <RgbColorPicker color={pickerColor} onChange={next => {
          if (pickerCancelled.current) return;
          const selected = { ...next, a: 1 }; setPickerColor(selected);
          const serialized = serializeThemeColor(selected, format, true); setDraft(serialized);
          if (draggingPicker.current && onPreviewChange) dragInteraction.move(serialized); else onChange(serialized);
        }} /> : <RgbaColorPicker color={pickerColor} onChange={(next) => { if (pickerCancelled.current) return; const selected = applyThemeColorPickerChange(pickerColor, next, selectsVisibleColor.current); setPickerColor(selected); const serialized = serializeThemeColor(selected, format); setDraft(serialized); if (draggingPicker.current && onPreviewChange) dragInteraction.move(serialized); else onChange(serialized); }} />}
      </div>
      <div className="theme-color-precise-row">
        <Select value={format} onValueChange={next=>{const selected=next as ThemeColorFormat;setFormat(selected);if(opaque)setDraft(serializeThemeColor(savedColor.current,selected,true));else onChange(serializeThemeColor(color,selected));}}>
          <SelectTrigger aria-label={uiText("themeColorField.ariaLabel")} className="theme-color-format"><SelectValue/></SelectTrigger>
          <SelectContent position="popper" className="theme-color-format-menu" data-ui-overlay="true" onPointerDown={event=>event.stopPropagation()}>{[{value:'hex',label:'HEX'},{value:'rgba',label:opaque?'RGB':'RGBA'},{value:'hsla',label:opaque?'HSL':'HSLA'}].map(option=><SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
        </Select>
        {inline && !opaque && <label className="theme-color-opacity"><span>{uiText("themeColorField.ThemeColorField.editor")}</span><ThemeNumberInput label={uiText("themeColorField.label")} value={Number((color.a*100).toFixed(2))} min={0} max={100}
          onChange={opacity=>onChange(serializeThemeColor({...color,a:opacity/100},format))}
          onPreviewChange={opacity=>onPreviewChange?.(serializeThemeColor({...color,a:opacity/100},format))} onPreviewCancel={onPreviewCancel}/><span>%</span></label>}
        <label className="theme-color-precise"><span>{uiText("themeColorField.ThemeColorField.editor2")}</span><Input value={draft} onChange={event=>{const next=event.target.value;setDraft(next);if(parseThemeColor(next))onChange(next);}} onBlur={()=>setDraft(opaque?serializeThemeColor(savedColor.current,formatRef.current,true):value)}/></label>
      </div>
      <div className="theme-color-actions">
        {allowTransparent && <Button variant="ghost" type="button" className="settings-icon-action" aria-label={uiText("themeColorField.aria_label4")} title={uiText("themeColorField.title")} onClick={() => onChange("transparent")}><Eraser size={16} aria-hidden="true" /></Button>}
        <Button variant="ghost" type="button" className="settings-icon-action" aria-label={uiText("themeColorField.aria_label5")} disabled={!eyeDropper} title={eyeDropper ? uiText("themeColorField.title2") : uiText("themeColorField.title3")} onClick={() => { if (!eyeDropper) return; setEyeDropperError(""); void new eyeDropper().open().then((result) => { const next = parseThemeColor(result.sRGBHex); if (next) onChange(serializeThemeColor(next, format, opaque)); }).catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setEyeDropperError(uiText("themeColorField.onClick")); }); }}><Pipette size={16} aria-hidden="true" /></Button>
      </div>
      {eyeDropperError && <p className="theme-color-error" role="status">{eyeDropperError}</p>}
    </div>;
  if (inline && !parsed) return <div className="theme-background-note"><p>{uiText("themeColorField.ThemeColorField")}</p><code>{value}</code><div className="theme-color-actions"><Button variant="outline" type="button" onClick={()=>onChange("#ffffff")}>{uiText("themeColorField.ThemeColorField2")}</Button></div></div>;
  if (inline) return editor;
  return <div className="theme-color-field">
    <Button variant="outline" ref={trigger} type="button" className={`theme-color-trigger${transparent || mixed ? " is-transparent" : ""}`} aria-label={label} aria-expanded={open} onClick={() => setOpen((current) => { if (current) setPosition(null); return !current; })}>
      <span className="theme-color-swatch" style={transparent || mixed ? undefined : { background: value }} aria-hidden="true" />
      <span>{valueLabel ?? (mixed ? uiText("themeColorField.ThemeColorField3") : transparent ? uiText("themeColorField.ThemeColorField4") : opaque && parsed ? serializeThemeColor(parsed, format, true) : value)}</span>
    </Button>
    {open && position && createPortal(editor, document.body)}
  </div>;
}
