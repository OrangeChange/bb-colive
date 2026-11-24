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

export function NativeThemeAdvancedEditor({ document, visualCss, customCss, cssMessage, onCustomCssChange, onVisualCssChange, onSave, onExportCss, onAddAsset, onRemoveAsset, onReplaceAsset, assetPreviewUrls }: { document: ThemeDocument; visualCss: string; customCss: string; cssMessage: string; onCustomCssChange: (css: string) => void; onVisualCssChange: (css: string) => string; onSave: () => void; onExportCss: (scope: NativeThemeCssExportScope) => void; onAddAsset: () => void; onRemoveAsset: (assetId: string) => void; onReplaceAsset?: (assetId: string) => void; assetPreviewUrls?: ReadonlyMap<string, string> }) {
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [assetMessage, setAssetMessage] = useState("");
  const [fontAliases, setFontAliases] = useState<Record<string, string>>({});
  const assetPanel = useRef<HTMLElement>(null);
  const userAssets = document.assets.filter(isLocalUserThemeAsset);
  useEffect(() => assetsOpen && assetPanel.current ? bindUiDismissableLayer(assetPanel.current, () => setAssetsOpen(false), { modal: true }) : undefined, [assetsOpen]);
  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); notifyWorkspace("素材引用已复制"); }
    catch { setAssetMessage("复制失败，请重试或从示例中选择文字复制。"); }
  };
  const remove = (asset: ThemeAssetReference) => {
    const usages = findThemeAssetUsages({ ...document.styles, visualCss, customCss }, asset);
    const names = { baseCss: "基础 CSS", visualCss: "可视化 CSS", customCss: "自定义 CSS" };
    const impact = usages.length ? `下列 ${usages.length} 处引用将失效，请调整对应 CSS：\n${usages.map(item => `${names[item.layer]} 第 ${item.line} 行（${item.context}）`).join("\n")}` : "未发现 CSS 引用。";
    if (window.confirm(`移除素材“${asset.name}”？\n路径：${asset.path}\n数量：1\n${impact}`)) onRemoveAsset(asset.id);
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
    catch { notifyWorkspace("复制失败，请重试"); }
  };
  const editor = useRef<NativeCssCodeEditorHandle>(null);
  const text = layer === "visual" ? visualCss : customCss;
  const changeText = layer === "visual" ? onVisualCssChange : onCustomCssChange;
  const syntaxError = useMemo(() => {
    if (!text.trim()) return "";
    try { postcss.parse(text); return ""; }
    catch (error) { return error instanceof Error ? error.message : "CSS 语法有误"; }
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
    {clearLayer && <ConfirmDialog title={`清空${clearLayer === "visual" ? "可视化" : "自定义"} CSS？`} description="将清空当前代码，应用后更新输出。可通过撤销恢复。" confirmLabel="清空" confirmTone="danger" onCancel={() => setClearLayer(null)} onConfirm={() => {
      if (clearLayer === layer && !showBase) editor.current?.clear();
      if (clearLayer === "visual") onVisualCssChange(""); else onCustomCssChange("");
      setFormatError("");
    }} />}
    {assetsOpen && <div className="theme-name-overlay" role="presentation"><section ref={assetPanel} tabIndex={-1} className="theme-transfer-panel native-asset-panel" role="dialog" aria-modal="true" aria-label="管理已添加素材">
      <header><h3>管理已添加素材</h3><button type="button" className="native-theme-asset-action" onClick={() => setAssetsOpen(false)}>关闭</button></header>
      <div className="theme-transfer-body native-asset-body">
        {!userAssets.length && <p>暂无本地素材，可添加图片或字体。</p>}
        {userAssets.map(asset => <article className="native-asset-card" key={asset.id}>
          <div className="native-asset-heading">{asset.mediaType.startsWith("image/") && (assetPreviewUrls?.get(asset.path) ? <img className="native-asset-thumbnail" src={assetPreviewUrls.get(asset.path)} alt={asset.name} /> : <span className="native-asset-thumbnail">图片</span>)}<div><strong>{asset.name}</strong><code>{asset.path}</code></div></div>
          {!asset.mediaType.startsWith("image/") && <label className="native-asset-alias">字体别名<input value={fontAliases[asset.id] ?? themeAssetFontAlias(asset)} onChange={event => setFontAliases(current => ({ ...current, [asset.id]: event.target.value }))} /></label>}
          <div className="native-asset-actions"><button type="button" className="native-theme-asset-action" onClick={() => void copy(themeAssetInsertValue(asset, fontAliases[asset.id]))}>复制引用</button><button type="button" className="native-theme-asset-action" onClick={() => { if (editor.current?.insertText(themeAssetInsertValue(asset, fontAliases[asset.id]))) { setAssetsOpen(false); requestAnimationFrame(() => editor.current?.focus()); } else setAssetMessage("编辑器尚未就绪，请稍后重试。"); }}>插入引用</button><button type="button" className="native-theme-asset-action" onClick={() => void copy(themeAssetExample(asset, fontAliases[asset.id]))}>{asset.mediaType.startsWith("image/") ? "复制 background 示例" : "复制 @font-face 示例"}</button><button type="button" className="native-theme-asset-action" disabled={!onReplaceAsset} title={onReplaceAsset ? "替换素材" : "素材替换暂不可用"} onClick={() => onReplaceAsset?.(asset.id)}>替换</button><button type="button" className="native-theme-asset-action" onClick={() => remove(asset)}>移除</button></div>
          <pre className="native-asset-example">{themeAssetExample(asset, fontAliases[asset.id])}</pre>
        </article>)}
        {assetMessage && <p role="status">{assetMessage}</p>}
      </div>
    </section></div>}
    <div className="native-advanced-tabs">{([ ["visual", "可视化 CSS"], ["custom", "自定义 CSS"] ] as const).map(([id, label]) => <button type="button" className={!showBase && layer === id ? "is-active" : ""} onClick={() => {setShowBase(false);setLayer(id);}} key={id}>{label}</button>)}<div className="native-theme-asset-tools"><button type="button" className="native-theme-asset-action" onClick={onAddAsset}><Plus size={16} aria-hidden="true" />添加图片或字体</button>{userAssets.length > 0 && <button type="button" className="native-theme-asset-action" onClick={() => { setAssetMessage(""); setAssetsOpen(true); }}><Images size={16} aria-hidden="true" />管理已添加素材</button>}</div><div className="native-css-export"><button type="button" className="settings-icon-action" title={copied ? "已复制" : "复制当前 CSS"} aria-label={copied ? "已复制" : "复制当前 CSS"} onClick={() => void copyCode()}>{copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}</button><button type="button" className="settings-icon-action theme-code-clear" title="清空当前 CSS" aria-label="清空当前 CSS" disabled={showBase || !text} onClick={() => setClearLayer(layer)}><Trash2 size={16} aria-hidden="true" /></button><button type="button" className="native-theme-asset-action" aria-pressed={showBase} onClick={()=>setShowBase(value=>!value)}>{showBase ? "返回编辑" : "查看基础 CSS"}</button><button type="button" disabled={formatting || showBase} onClick={() => void format()}><ListOrdered size={16} aria-hidden="true" />{formatting ? "格式化中…" : "格式化"}</button><ThemeActionMenu label="导出 CSS" className="theme-css-export-action" items={([
        ["complete", "完整 CSS"], ["base-visual", "基础与可视化 CSS"], ["visual", "仅可视化 CSS"], ["custom", "仅自定义 CSS"]
      ] as const).map(([scope, label]) => ({ label, action: () => onExportCss(scope) }))}><Download size={16} aria-hidden="true" />导出 CSS<ChevronDown size={14} aria-hidden="true" /></ThemeActionMenu></div></div>
    {message && <p className={formatError || syntaxError || !cssMessage.startsWith("提示：") ? "native-css-error" : "native-css-notice"} role="status">{message}</p>}
    <NativeCssCodeEditor ref={editor} documentKey={`${document.themeId}:${showBase ? "base" : layer}`} label={showBase ? "基础 CSS（只读）" : `${layer === "visual" ? "编辑可视化" : "编辑自定义"} CSS`} readOnly={showBase} value={showBase ? document.styles.baseCss : text} onChange={value=>{if(!showBase)changeText(value);}} onSave={onSave} onFormat={()=>{if(!showBase)void format();}} onCopy={() => void copyCode()} onClear={() => {if(!showBase)setClearLayer(layer);}} />
  </div>;
}
