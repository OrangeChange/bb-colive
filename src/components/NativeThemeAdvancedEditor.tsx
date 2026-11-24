import { uiText } from "../i18n/index.ts";
import { Copy, Check, Trash2, ListOrdered, Download, ChevronDown, Plus, Images } from "lucide-react";
import { ThemeActionMenu } from "./ThemeActionMenu.tsx";
import { notifyWorkspace } from "./WorkspaceNotice.tsx";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ThemeAssetReference, ThemeDocument } from "../themes/themeTypes.ts";
import { NativeCssCodeEditor, type NativeCssCodeEditorHandle } from "./NativeCssCodeEditor.tsx";
import postcss from "postcss";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import type { NativeThemeCssExportScope } from "../themes/themeCssExport.ts";
import { commitFormattedCss, handleCssFormatError } from "./nativeCssFormatting.ts";

import { bindUiDismissableLayer } from "./ui/layer";
import { findThemeAssetUsages, isLocalUserThemeAsset, themeAssetExample, themeAssetFontAlias, themeAssetInsertValue } from "../themes/themeAssetPresentation.ts";

export function NativeThemeAdvancedEditor({ document, visualCss, customCss, cssMessage, cssMessageKind = "error", onCustomCssChange, onVisualCssChange, onSave, onExportCss, onAddAsset, onRemoveAsset, onReplaceAsset, assetPreviewUrls }: { document: ThemeDocument; visualCss: string; customCss: string; cssMessage: string; cssMessageKind?: "error" | "notice"; onCustomCssChange: (css: string) => void; onVisualCssChange: (css: string) => string; onSave: () => void; onExportCss: (scope: NativeThemeCssExportScope) => void; onAddAsset: () => void; onRemoveAsset: (assetId: string) => void; onReplaceAsset?: (assetId: string) => void; assetPreviewUrls?: ReadonlyMap<string, string> }) {
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [assetMessage, setAssetMessage] = useState("");
  const [fontAliases, setFontAliases] = useState<Record<string, string>>({});
  const assetPanel = useRef<HTMLElement>(null);
  const userAssets = document.assets.filter(isLocalUserThemeAsset);
  useEffect(() => assetsOpen && assetPanel.current ? bindUiDismissableLayer(assetPanel.current, () => setAssetsOpen(false), { modal: true }) : undefined, [assetsOpen]);
  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); notifyWorkspace(uiText("nativeThemeAdvancedEditor.NativeThemeAdvancedEditor.copy")); }
    catch { setAssetMessage(uiText("nativeThemeAdvancedEditor.NativeThemeAdvancedEditor.copy2")); }
  };
  const remove = (asset: ThemeAssetReference) => {
    const usages = findThemeAssetUsages({ ...document.styles, visualCss, customCss }, asset);
    const names = { baseCss: uiText("nativeThemeAdvancedEditor.remove.names.baseCss"), visualCss: uiText("nativeThemeAdvancedEditor.remove.names.visualCss"), customCss: uiText("nativeThemeAdvancedEditor.remove.names.customCss") };
    const impact = usages.length ? uiText("nativeThemeAdvancedEditor.NativeThemeAdvancedEditor.remove.impact", { length: usages.length, value: usages.map(item => uiText("nativeThemeAdvancedEditor.remove.impact.value", { value: names[item.layer], line: item.line, context: item.context })).join("\n") }) : uiText("nativeThemeAdvancedEditor.NativeThemeAdvancedEditor.remove.impact2");
    if (window.confirm(uiText("nativeThemeAdvancedEditor.NativeThemeAdvancedEditor.remove", { name: asset.name, path: asset.path, impact: impact }))) onRemoveAsset(asset.id);
  };
  const [layer, setLayer] = useState<"visual" | "custom">("custom");
  const [showBase, setShowBase] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(copyTimer.current), []);
  const [formatting, setFormatting] = useState(false);
  const [formatError, setFormatError] = useState("");
  const [clearLayer, setClearLayer] = useState<"visual" | "custom" | null>(null);
  const copyCode = async () => {
    try { await navigator.clipboard.writeText(showBase ? document.styles.baseCss : text); setCopied(true); clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopied(false), 1500); }
    catch { notifyWorkspace(uiText("nativeThemeAdvancedEditor.NativeThemeAdvancedEditor.copyCode")); }
  };
  const editor = useRef<NativeCssCodeEditorHandle>(null);
  const text = layer === "visual" ? visualCss : customCss;
  const changeText = layer === "visual" ? onVisualCssChange : onCustomCssChange;
  const syntaxError = useMemo(() => {
    if (!text.trim()) return "";
    try { postcss.parse(text); return ""; }
    catch (error) { return error instanceof Error ? error.message : uiText("nativeThemeAdvancedEditor.NativeThemeAdvancedEditor.syntaxError"); }
  }, [text]);
  const format = async () => {
    if (formatting) return;
    setFormatting(true);
    setFormatError("");
    const requestedLayer = layer;
    const requestedText = text;
    try {
      const [{ format: prettierFormat }, postcssPlugin] = await Promise.all([import("prettier/standalone"), import("prettier/plugins/postcss")]);
      await commitFormattedCss(requestedLayer, requestedText, (source) => prettierFormat(source, { parser: "css", plugins: [postcssPlugin.default] }), (targetLayer, formatted) => {
        if (editor.current?.replaceDocument(`${document.themeId}:${targetLayer}`, formatted)) {
          if (targetLayer === "visual") onVisualCssChange(formatted);
          else onCustomCssChange(formatted);
          requestAnimationFrame(() => editor.current?.focus());
        } else if (targetLayer === "visual") onVisualCssChange(formatted);
        else onCustomCssChange(formatted);
      });
    } catch (error) {
      setFormatError(handleCssFormatError(requestedLayer, error, (targetLayer, line, column) => {
        setLayer(targetLayer);
        requestAnimationFrame(() => editor.current?.goToLine(line, column));
      }));
    } finally {
      setFormatting(false);
    }
  };
  const lastAssetCount = useRef(userAssets.length);
  useEffect(() => { if (userAssets.length > lastAssetCount.current) setAssetsOpen(true); lastAssetCount.current = userAssets.length; }, [userAssets.length]);
  const message = formatError || syntaxError || cssMessage;
  return <div className="native-advanced-editor">
    {clearLayer && <ConfirmDialog title={uiText("nativeThemeAdvancedEditor.title", { value: clearLayer === "visual" ? uiText("nativeThemeAdvancedEditor.title.value") : uiText("nativeThemeAdvancedEditor.title.value2") })} description={uiText("nativeThemeAdvancedEditor.description")} confirmLabel={uiText("common.clear")} confirmTone="danger" onCancel={() => setClearLayer(null)} onConfirm={() => {
      if (clearLayer === layer && !showBase) editor.current?.clear();
      if (clearLayer === "visual") onVisualCssChange(""); else onCustomCssChange("");
      setFormatError("");
    }} />}
    {assetsOpen && <div className="theme-name-overlay" role="presentation"><section ref={assetPanel} tabIndex={-1} className="theme-transfer-panel native-asset-panel" role="dialog" aria-modal="true" aria-label={uiText("nativeThemeAdvancedEditor.aria_label")}>
      <header><h3>{uiText("nativeThemeAdvancedEditor.NativeThemeAdvancedEditor")}</h3><button type="button" className="native-theme-asset-action" onClick={() => setAssetsOpen(false)}>{uiText("common.close")}</button></header>
      <div className="theme-transfer-body native-asset-body">
        {!userAssets.length && <p>{uiText("nativeThemeAdvancedEditor.NativeThemeAdvancedEditor2")}</p>}
        {userAssets.map(asset => <article className="native-asset-card" key={asset.id}>
          <div className="native-asset-heading">{asset.mediaType.startsWith("image/") && (assetPreviewUrls?.get(asset.path) ? <img className="native-asset-thumbnail" src={assetPreviewUrls.get(asset.path)} alt={asset.name} /> : <span className="native-asset-thumbnail">{uiText("nativeThemeAdvancedEditor.NativeThemeAdvancedEditor3")}</span>)}<div><strong>{asset.name}</strong><code>{asset.path}</code></div></div>
          {!asset.mediaType.startsWith("image/") && <label className="native-asset-alias">{uiText("nativeThemeAdvancedEditor.NativeThemeAdvancedEditor4")}<input value={fontAliases[asset.id] ?? themeAssetFontAlias(asset)} onChange={event => setFontAliases(current => ({ ...current, [asset.id]: event.target.value }))} /></label>}
          <div className="native-asset-actions"><button type="button" className="native-theme-asset-action" onClick={() => void copy(themeAssetInsertValue(asset, fontAliases[asset.id]))}>{uiText("nativeThemeAdvancedEditor.NativeThemeAdvancedEditor5")}</button><button type="button" className="native-theme-asset-action" onClick={() => { if (editor.current?.insertText(themeAssetInsertValue(asset, fontAliases[asset.id]))) { setAssetsOpen(false); requestAnimationFrame(() => editor.current?.focus()); } else setAssetMessage(uiText("nativeThemeAdvancedEditor.onClick")); }}>{uiText("nativeThemeAdvancedEditor.NativeThemeAdvancedEditor6")}</button><button type="button" className="native-theme-asset-action" onClick={() => void copy(themeAssetExample(asset, fontAliases[asset.id]))}>{asset.mediaType.startsWith("image/") ? uiText("nativeThemeAdvancedEditor.NativeThemeAdvancedEditor7") : uiText("nativeThemeAdvancedEditor.NativeThemeAdvancedEditor8")}</button><button type="button" className="native-theme-asset-action" disabled={!onReplaceAsset} title={onReplaceAsset ? uiText("nativeThemeAdvancedEditor.title2") : uiText("nativeThemeAdvancedEditor.title3")} onClick={() => onReplaceAsset?.(asset.id)}>{uiText("nativeThemeAdvancedEditor.NativeThemeAdvancedEditor9")}</button><button type="button" className="native-theme-asset-action" onClick={() => remove(asset)}>{uiText("common.remove")}</button></div>
          <pre className="native-asset-example">{themeAssetExample(asset, fontAliases[asset.id])}</pre>
        </article>)}
        {assetMessage && <p role="status">{assetMessage}</p>}
      </div>
    </section></div>}
    <div className="native-advanced-tabs">{([ ["visual", uiText("nativeThemeAdvancedEditor.NativeThemeAdvancedEditor10")], ["custom", uiText("nativeThemeAdvancedEditor.NativeThemeAdvancedEditor11")] ] as const).map(([id, label]) => <button type="button" className={!showBase && layer === id ? "is-active" : ""} onClick={() => {setShowBase(false);setLayer(id);}} key={id}>{label}</button>)}<div className="native-theme-asset-tools"><button type="button" className="native-theme-asset-action" onClick={onAddAsset}><Plus size={16} aria-hidden="true" />{uiText("nativeThemeAdvancedEditor.NativeThemeAdvancedEditor12")}</button>{userAssets.length > 0 && <button type="button" className="native-theme-asset-action" onClick={() => { setAssetMessage(""); setAssetsOpen(true); }}><Images size={16} aria-hidden="true" />{uiText("nativeThemeAdvancedEditor.NativeThemeAdvancedEditor")}</button>}</div><div className="native-css-export"><button type="button" className="settings-icon-action" title={copied ? uiText("nativeThemeAdvancedEditor.title4") : uiText("nativeThemeAdvancedEditor.title5")} aria-label={copied ? uiText("nativeThemeAdvancedEditor.aria_label2") : uiText("nativeThemeAdvancedEditor.aria_label3")} onClick={() => void copyCode()}>{copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}</button><button type="button" className="settings-icon-action theme-code-clear" title={uiText("nativeThemeAdvancedEditor.title6")} aria-label={uiText("nativeThemeAdvancedEditor.aria_label4")} disabled={showBase || !text} onClick={() => setClearLayer(layer)}><Trash2 size={16} aria-hidden="true" /></button><button type="button" className="native-theme-asset-action" aria-pressed={showBase} onClick={()=>setShowBase(value=>!value)}>{showBase ? uiText("nativeThemeAdvancedEditor.NativeThemeAdvancedEditor13") : uiText("nativeThemeAdvancedEditor.NativeThemeAdvancedEditor14")}</button><button type="button" disabled={formatting || showBase} onClick={() => void format()}><ListOrdered size={16} aria-hidden="true" />{formatting ? uiText("nativeThemeAdvancedEditor.NativeThemeAdvancedEditor15") : uiText("nativeThemeAdvancedEditor.NativeThemeAdvancedEditor16")}</button><ThemeActionMenu label={uiText("nativeThemeAdvancedEditor.label")} className="theme-css-export-action" items={([
        ["complete", uiText("nativeThemeAdvancedEditor.items")], ["base-visual", uiText("nativeThemeAdvancedEditor.items2")], ["visual", uiText("nativeThemeAdvancedEditor.items3")], ["custom", uiText("nativeThemeAdvancedEditor.items4")]
      ] as const).map(([scope, label]) => ({ label, action: () => onExportCss(scope) }))}><Download size={16} aria-hidden="true" />{uiText("nativeThemeAdvancedEditor.NativeThemeAdvancedEditor17")}<ChevronDown size={14} aria-hidden="true" /></ThemeActionMenu></div></div>
    {message && <p className={formatError || syntaxError || cssMessageKind !== "notice" ? "native-css-error" : "native-css-notice"} role="status">{message}</p>}
    <NativeCssCodeEditor ref={editor} documentKey={`${document.themeId}:${showBase ? "base" : layer}`} label={showBase ? uiText("nativeThemeAdvancedEditor.label2") : `${layer === "visual" ? uiText("nativeThemeAdvancedEditor.label3") : uiText("nativeThemeAdvancedEditor.label4")} CSS`} readOnly={showBase} value={showBase ? document.styles.baseCss : text} onChange={value=>{if(!showBase)changeText(value);}} onSave={onSave} onFormat={()=>{if(!showBase)void format();}} onCopy={() => void copyCode()} onClear={() => {if(!showBase)setClearLayer(layer);}} />
  </div>;
}
