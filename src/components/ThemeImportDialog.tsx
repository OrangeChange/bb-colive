import { useUiLanguage } from "../i18n/react.ts";
import { localized, uiText } from "../i18n/index.ts";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { ThemeMode } from "../themes/themeTypes.ts";
import { bindUiDismissableLayer } from "./ui/layer";

const FORMATS = localized(() => ([["native", uiText("themeImportDialog.FORMATS")], ["blivechat", uiText("themeImportDialog.FORMATS2")], ["blivechat-open", uiText("themeImportDialog.FORMATS3")], ["laplace", "LAPLACE"]] as const));

function ThemeTransferPanel({ title, description, busy, onClose, children, actions }: {
  title: string; description: string; busy: boolean; onClose(): void; children: ReactNode; actions: ReactNode;
}) {
  useUiLanguage();
  const ref = useRef<HTMLElement>(null);
  const close = useRef(onClose), pending = useRef(busy);
  close.current = onClose; pending.current = busy;
  useEffect(() => ref.current ? bindUiDismissableLayer(ref.current, () => close.current(), { modal: true, canClose: () => !pending.current }) : undefined, []);
  return <div className="theme-name-overlay" role="presentation"><section ref={ref} tabIndex={-1} className="theme-transfer-panel" role="dialog" aria-modal="true" aria-label={title}>
    <header><div><h3>{title}</h3><p>{description}</p></div><button type="button" disabled={busy} onClick={onClose}>{uiText("common.close")}</button></header>
    <div className="theme-transfer-body">{children}</div>
    <footer><button type="button" disabled={busy} onClick={onClose}>{uiText("common.cancel")}</button>{actions}</footer>
  </section></div>;
}

function ThemeFormatOptions({ value, onChange, css = false }: { value: string; onChange(mode: ThemeMode): void; css?: boolean }) {
  useUiLanguage();
  return <div className="theme-format-grid">{FORMATS.map(([mode, label]) => <label key={mode} className={value === mode ? "is-selected" : ""}><input type="radio" name="theme-format" checked={value === mode} onChange={() => onChange(mode)} /><span>{label}{css && mode !== "laplace" ? " CSS" : ""}</span></label>)}</div>;
}

export function ThemeCreateDialog({ onClose, onCreate }: { onClose(): void; onCreate(mode: ThemeMode): void }) {
  useUiLanguage();
  const [mode, setMode] = useState<ThemeMode>("native");
  return <ThemeTransferPanel title={uiText("themeImportDialog.title")} description={uiText("themeImportDialog.description")} busy={false} onClose={onClose} actions={<button type="button" className="is-primary" onClick={() => onCreate(mode)}>{uiText("themeImportDialog.actions")}</button>}>
    <fieldset><legend>{uiText("themeImportDialog.ThemeCreateDialog")}</legend><ThemeFormatOptions value={mode} onChange={setMode} /></fieldset>
  </ThemeTransferPanel>;
}

export function ThemeImportDialog({ onClose, onTheme, onCss, onUrl }: {
  onClose(): void; onTheme(paths: string[]): Promise<void>; onCss(mode: ThemeMode, path: string, name: string, signal?: AbortSignal): Promise<void>; onUrl(url: string): void;
}) {
  useUiLanguage();
  const [kind, setKind] = useState<"package" | ThemeMode>("package");
  const [source, setSource] = useState<"file" | "url">("file");
  const [paths, setPaths] = useState<string[]>([]), [name, setName] = useState(""), [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const download = useRef<AbortController | null>(null);
  useEffect(() => () => download.current?.abort(), []);
  const changeKind = (next: "package" | ThemeMode) => { setKind(next); setSource("file"); setPaths([]); setName(""); setUrl(""); setError(""); };
  const chooseFile = async () => {
    setBusy(true); setError("");
    try {
      const selected = await open({ multiple: kind === "package", filters: [{ name: kind === "package" ? uiText("themeImportDialog.selected.filters.name") : "CSS", extensions: [kind === "package" ? "zip" : "css"] }] });
      if (!selected) return;
      const files = Array.isArray(selected) ? selected : [selected];
      setPaths(files); setName((files[0].split(/[\\/]/).pop() ?? "").replace(/\.(css|zip)$/i, ""));
    } catch { setError(uiText("themeImportDialog.ThemeImportDialog.chooseFile")); }
    finally { setBusy(false); }
  };
  const remote = kind === "laplace" && source === "url";
  const submit = async () => {
    if (busy) return;
    if (remote) { onUrl(url.trim()); return; }
    setBusy(true); setError("");
    try { if (kind === "package") await onTheme(paths); else { download.current = new AbortController(); await onCss(kind, paths[0], name.trim(), download.current.signal); } onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : uiText("themeImportDialog.ThemeImportDialog.submit")); }
    finally { setBusy(false); }
  };
  return <ThemeTransferPanel title={uiText("themeImportDialog.title2")} description={uiText("themeImportDialog.description2")} busy={busy} onClose={onClose} actions={<button type="button" className="is-primary" disabled={busy || (remote ? !url.trim() : !paths.length || (kind !== "package" && !name.trim()))} onClick={() => void submit()}>{busy ? uiText("themeImportDialog.actions2") : remote ? uiText("themeImportDialog.actions3") : uiText("common.import")}</button>}>
    <fieldset disabled={busy}><legend>{uiText("themeImportDialog.ThemeImportDialog")}</legend>
      <label className={`theme-package-option ${kind === "package" ? "is-selected" : ""}`}><input type="radio" name="theme-format" checked={kind === "package"} onChange={() => changeKind("package")} />{uiText("themeImportDialog.ThemeImportDialog2")}</label>
      <p className="theme-transfer-label">{uiText("themeImportDialog.ThemeImportDialog3")}</p><ThemeFormatOptions value={kind} onChange={changeKind} css />
      {kind !== "package" && <p>{uiText("themeImportDialog.ThemeImportDialog4")}</p>}
    </fieldset>
    {kind === "laplace" && <fieldset disabled={busy}><legend>{uiText("themeImportDialog.ThemeImportDialog5")}</legend><div className="theme-format-grid">{([["file", uiText("themeImportDialog.ThemeImportDialog3")], ["url", uiText("themeImportDialog.ThemeImportDialog6")]] as const).map(([value, label]) => <label key={value} className={source === value ? "is-selected" : ""}><input type="radio" name="laplace-import-source" checked={source === value} onChange={() => { setSource(value); setError(""); }} />{label}</label>)}</div></fieldset>}
    <div className="theme-transfer-fields">
      {remote ? <label>{uiText("themeImportDialog.ThemeImportDialog7")}<input value={url} disabled={busy} onChange={event => setUrl(event.target.value)} placeholder="https://example.com/theme.css" /></label> : <><label>{kind === "package" ? uiText("themeImportDialog.ThemeImportDialog2") : uiText("themeImportDialog.ThemeImportDialog3")}</label><div className="theme-transfer-file"><span>{paths.length ? paths.map(path => path.split(/[\\/]/).pop()).join("、") : uiText("themeImportDialog.ThemeImportDialog8")}</span><button type="button" disabled={busy} onClick={() => void chooseFile()}>{uiText("common.chooseFile")}</button></div>{kind !== "package" && <><label>{uiText("themeImportDialog.ThemeImportDialog9")}<input value={name} disabled={busy} onChange={event => setName(event.target.value)} /></label></>}</>}
      {busy && kind !== "package" && <button type="button" onClick={() => download.current?.abort()}>{uiText("themeImportDialog.ThemeImportDialog10")}</button>}
      {error && <p className="theme-transfer-error" role="alert">{error}</p>}
    </div>
  </ThemeTransferPanel>;
}
