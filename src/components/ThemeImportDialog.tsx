import { useEffect, useRef, useState, type ReactNode } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { ThemeMode } from "../themes/themeTypes.ts";
import { bindUiDismissableLayer } from "./ui/layer";

const FORMATS = [["native", "原生"], ["blivechat", "BLC 原版"], ["blivechat-open", "BLC 开放版"], ["laplace", "LAPLACE"]] as const;

function ThemeTransferPanel({ title, description, busy, onClose, children, actions }: {
  title: string; description: string; busy: boolean; onClose(): void; children: ReactNode; actions: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const close = useRef(onClose), pending = useRef(busy);
  close.current = onClose; pending.current = busy;
  useEffect(() => ref.current ? bindUiDismissableLayer(ref.current, () => close.current(), { modal: true, canClose: () => !pending.current }) : undefined, []);
  return <div className="theme-name-overlay" role="presentation"><section ref={ref} tabIndex={-1} className="theme-transfer-panel" role="dialog" aria-modal="true" aria-label={title}>
    <header><div><h3>{title}</h3><p>{description}</p></div><button type="button" disabled={busy} onClick={onClose}>关闭</button></header>
    <div className="theme-transfer-body">{children}</div>
    <footer><button type="button" disabled={busy} onClick={onClose}>取消</button>{actions}</footer>
  </section></div>;
}

function ThemeFormatOptions({ value, onChange, css = false }: { value: string; onChange(mode: ThemeMode): void; css?: boolean }) {
  return <div className="theme-format-grid">{FORMATS.map(([mode, label]) => <label key={mode} className={value === mode ? "is-selected" : ""}><input type="radio" name="theme-format" checked={value === mode} onChange={() => onChange(mode)} /><span>{label}{css && mode !== "laplace" ? " CSS" : ""}</span></label>)}</div>;
}

export function ThemeCreateDialog({ onClose, onCreate }: { onClose(): void; onCreate(mode: ThemeMode): void }) {
  const [mode, setMode] = useState<ThemeMode>("native");
  return <ThemeTransferPanel title="新建主题" description="选择主题格式，进入编辑。" busy={false} onClose={onClose} actions={<button type="button" className="is-primary" onClick={() => onCreate(mode)}>创建</button>}>
    <fieldset><legend>主题格式</legend><ThemeFormatOptions value={mode} onChange={setMode} /></fieldset>
  </ThemeTransferPanel>;
}

export function ThemeImportDialog({ onClose, onTheme, onCss, onUrl }: {
  onClose(): void; onTheme(paths: string[]): Promise<void>; onCss(mode: ThemeMode, path: string, name: string, signal?: AbortSignal): Promise<void>; onUrl(url: string): void;
}) {
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
      const selected = await open({ multiple: kind === "package", filters: [{ name: kind === "package" ? "主题包" : "CSS", extensions: [kind === "package" ? "zip" : "css"] }] });
      if (!selected) return;
      const files = Array.isArray(selected) ? selected : [selected];
      setPaths(files); setName((files[0].split(/[\\/]/).pop() ?? "").replace(/\.(css|zip)$/i, ""));
    } catch { setError("无法选择文件，请重试。"); }
    finally { setBusy(false); }
  };
  const remote = kind === "laplace" && source === "url";
  const submit = async () => {
    if (busy) return;
    if (remote) { onUrl(url.trim()); return; }
    setBusy(true); setError("");
    try { if (kind === "package") await onTheme(paths); else { download.current = new AbortController(); await onCss(kind, paths[0], name.trim(), download.current.signal); } onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "导入失败，请检查文件后重试。"); }
    finally { setBusy(false); }
  };
  return <ThemeTransferPanel title="导入主题" description="选择导入方式，添加到主题库。" busy={busy} onClose={onClose} actions={<button type="button" className="is-primary" disabled={busy || (remote ? !url.trim() : !paths.length || (kind !== "package" && !name.trim()))} onClick={() => void submit()}>{busy ? "正在导入" : remote ? "加载预览" : "导入"}</button>}>
    <fieldset disabled={busy}><legend>导入格式</legend>
      <label className={`theme-package-option ${kind === "package" ? "is-selected" : ""}`}><input type="radio" name="theme-format" checked={kind === "package"} onChange={() => changeKind("package")} />主题文件</label>
      <p className="theme-transfer-label">CSS 文件</p><ThemeFormatOptions value={kind} onChange={changeKind} css />
      {kind !== "package" && <p>作为基础样式导入。</p>}
    </fieldset>
    {kind === "laplace" && <fieldset disabled={busy}><legend>CSS 来源</legend><div className="theme-format-grid">{([["file", "CSS 文件"], ["url", "远程 URL"]] as const).map(([value, label]) => <label key={value} className={source === value ? "is-selected" : ""}><input type="radio" name="laplace-import-source" checked={source === value} onChange={() => { setSource(value); setError(""); }} />{label}</label>)}</div></fieldset>}
    <div className="theme-transfer-fields">
      {remote ? <label>CSS 网址<input value={url} disabled={busy} onChange={event => setUrl(event.target.value)} placeholder="https://example.com/theme.css" /></label> : <><label>{kind === "package" ? "主题文件" : "CSS 文件"}</label><div className="theme-transfer-file"><span>{paths.length ? paths.map(path => path.split(/[\\/]/).pop()).join("、") : "未选择文件"}</span><button type="button" disabled={busy} onClick={() => void chooseFile()}>选择文件</button></div>{kind !== "package" && <><label>主题名称<input value={name} disabled={busy} onChange={event => setName(event.target.value)} /></label></>}</>}
      {busy && kind !== "package" && <button type="button" onClick={() => download.current?.abort()}>取消加载</button>}
      {error && <p className="theme-transfer-error" role="alert">{error}</p>}
    </div>
  </ThemeTransferPanel>;
}
