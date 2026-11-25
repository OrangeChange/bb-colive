import { RadioGroup, RadioGroupItem } from "./shadcn/radio-group";
import { Input } from "./shadcn/input";
import { Button } from "./shadcn/button";
import { useUiLanguage } from "../i18n/react.ts";
import { localized, uiText } from "../i18n/index.ts";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { ThemeMode } from "../themes/themeTypes.ts";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./shadcn/dialog";

const FORMATS = localized(() => ([["native", uiText("themeImportDialog.FORMATS")], ["blivechat", uiText("themeImportDialog.FORMATS2")], ["blivechat-open", uiText("themeImportDialog.FORMATS3")], ["laplace", "LAPLACE"]] as const));

function ThemeTransferPanel({ title, description, busy, onClose, children, actions }: {
  title: string; description: string; busy: boolean; onClose(): void; children: ReactNode; actions: ReactNode;
}) {
  useUiLanguage();
  return <Dialog open onOpenChange={open => {if(!open && !busy) onClose();}}><DialogContent asChild showCloseButton={false} className="max-w-none gap-0 p-0" onEscapeKeyDown={event=>{if(busy)event.preventDefault();}} onInteractOutside={event=>{if(busy)event.preventDefault();}}><section className="theme-transfer-panel">
    <header><div><DialogTitle asChild><h3>{title}</h3></DialogTitle><DialogDescription asChild><p>{description}</p></DialogDescription></div><Button variant="outline" type="button" disabled={busy} onClick={onClose}>{uiText("common.close")}</Button></header>
    <div className="theme-transfer-body">{children}</div>
    <footer><Button variant="outline" type="button" disabled={busy} onClick={onClose}>{uiText("common.cancel")}</Button>{actions}</footer>
  </section></DialogContent></Dialog>;
}

function ThemeFormatOptions({ value, onChange, css = false, includePackage = false }: { value: string; onChange(mode: ThemeMode | "package"): void; css?: boolean; includePackage?: boolean }) {
  useUiLanguage();
  return <RadioGroup className="theme-format-grid" value={value} onValueChange={next=>onChange(next as ThemeMode | "package")}>{(includePackage ? [["package",uiText("themeImportDialog.ThemeImportDialog2")],...FORMATS] : FORMATS).map(([mode, label]) => <label key={mode} className={value === mode ? "is-selected" : ""}><RadioGroupItem value={mode} /><span>{label}{css && mode !== "laplace" && mode !== "package" ? " CSS" : ""}</span></label>)}</RadioGroup>;
}

export function ThemeCreateDialog({ onClose, onCreate }: { onClose(): void; onCreate(mode: ThemeMode): void }) {
  useUiLanguage();
  const [mode, setMode] = useState<ThemeMode>("native");
  return <ThemeTransferPanel title={uiText("themeImportDialog.title")} description={uiText("themeImportDialog.description")} busy={false} onClose={onClose} actions={<Button variant="default" type="button" className="is-primary" onClick={() => onCreate(mode)}>{uiText("themeImportDialog.actions")}</Button>}>
    <fieldset><legend>{uiText("themeImportDialog.ThemeCreateDialog")}</legend><ThemeFormatOptions value={mode} onChange={next=>{if(next!=="package")setMode(next);}} /></fieldset>
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
  return <ThemeTransferPanel title={uiText("themeImportDialog.title2")} description={uiText("themeImportDialog.description2")} busy={busy} onClose={onClose} actions={<Button variant="default" type="button" className="is-primary" disabled={busy || (remote ? !url.trim() : !paths.length || (kind !== "package" && !name.trim()))} onClick={() => void submit()}>{busy ? uiText("themeImportDialog.actions2") : remote ? uiText("themeImportDialog.actions3") : uiText("common.import")}</Button>}>
    <fieldset disabled={busy}><legend>{uiText("themeImportDialog.ThemeImportDialog")}</legend>
      <ThemeFormatOptions value={kind} onChange={changeKind} css includePackage />
      {kind !== "package" && <p>{uiText("themeImportDialog.ThemeImportDialog4")}</p>}
    </fieldset>
    {kind === "laplace" && <fieldset disabled={busy}><legend>{uiText("themeImportDialog.ThemeImportDialog5")}</legend><RadioGroup className="theme-format-grid" value={source} onValueChange={next=>{setSource(next as "file" | "url");setError("");}}>{([["file", uiText("themeImportDialog.ThemeImportDialog3")], ["url", uiText("themeImportDialog.ThemeImportDialog6")]] as const).map(([value, label]) => <label key={value} className={source === value ? "is-selected" : ""}><RadioGroupItem value={value} />{label}</label>)}</RadioGroup></fieldset>}
    <div className="theme-transfer-fields">
      {remote ? <label>{uiText("themeImportDialog.ThemeImportDialog7")}<Input value={url} disabled={busy} onChange={event => setUrl(event.target.value)} placeholder="https://example.com/theme.css" /></label> : <><label>{kind === "package" ? uiText("themeImportDialog.ThemeImportDialog2") : uiText("themeImportDialog.ThemeImportDialog3")}</label><div className="theme-transfer-file"><span>{paths.length ? paths.map(path => path.split(/[\\/]/).pop()).join("、") : uiText("themeImportDialog.ThemeImportDialog8")}</span><Button variant="outline" type="button" disabled={busy} onClick={() => void chooseFile()}>{uiText("common.chooseFile")}</Button></div>{kind !== "package" && <><label>{uiText("themeImportDialog.ThemeImportDialog9")}<Input value={name} disabled={busy} onChange={event => setName(event.target.value)} /></label></>}</>}
      {busy && kind !== "package" && <Button variant="outline" type="button" onClick={() => download.current?.abort()}>{uiText("themeImportDialog.ThemeImportDialog10")}</Button>}
      {error && <p className="theme-transfer-error" role="alert">{error}</p>}
    </div>
  </ThemeTransferPanel>;
}
