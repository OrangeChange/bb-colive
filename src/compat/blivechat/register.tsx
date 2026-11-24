import { resolveThemeEventVisibility } from "../../themes/themeEventVisibility.ts";
import { normalizeCompatibleEventVisibility } from "../../themes/compatibleEventVisibility.ts";
import { createAllNativeEventVisibility } from '../../themes/nativeComponentAppearance.ts';
import { resolvePublishedBlivechatRender } from './runtime.tsx';
import { createElement, useMemo } from "react";
import type { ThemeDocument } from "../../themes/themeTypes.ts";
import { CompatibleThemeEventSettings } from "../../components/CompatibleThemeEventSettings.tsx";
import type { BlivechatThemeSettings, CompatibleVisualSettings } from "../../themes/compatThemeSettings.ts";
import { registerCompatibleThemeEditingSurface } from "../../components/CompatibleThemePreview.tsx";
import { registerCompatibleEventRenderProvider } from "../CompatibleEventRenderer.tsx";
import { BLIVECHAT_CAPABILITY } from "./theme.ts";
import { composeBlivechatThemeCss, createBlivechatAuxiliaryDisplayCss } from "./runtime.tsx";
import { blivechatThemeRuntime } from "./runtime.tsx";
import { installBlivechatThemeRenderer } from "./adapterRuntime.ts";
import { BlivechatSourcePreview } from "./BlivechatSourceSurface.tsx";
import { createBlivechatSourceConfig } from "./sourceConfig.ts";
import { PanelSwitch } from "../../components/voicePanelPrimitives.tsx";

function settingsOf(document: ThemeDocument): BlivechatThemeSettings {
  const settings = document.settings as Partial<BlivechatThemeSettings>;
  return {
    ...settings,
    showGiftName: settings.showGiftName === true,
    globalScale: typeof settings.globalScale === "number" ? settings.globalScale : 1,
    fontScale: typeof settings.fontScale === "number" ? settings.fontScale : 1,
    showTimestamp: settings.showTimestamp === true,
    maskUsername: settings.maskUsername === true,
    showAvatar: settings.showAvatar !== false,
    showUsername: settings.showUsername !== false,
    showGuardBadge: settings.showGuardBadge !== false,
    showModBadge: settings.showModBadge !== false,
    ...(settings.visualModel ? { visualModel: settings.visualModel } : {}),
  };
}

export function BlivechatPreview({ previewPolicy, previewFrame,onPreviewFrame,document, thumbnail, previewMode, previewPlaying, previewSpeed, previewRestartKey, previewEventType, displayAll, previewTarget, scrollDirection, contentAlignment, editorSelection, onEditorInspection }: import("../../components/CompatibleThemePreview.tsx").CompatibleThemeRendererProps) {
  const decision = useMemo(() => resolvePublishedBlivechatRender({document: displayAll ? {...document,settings:{...document.settings,eventVisibility:createAllNativeEventVisibility()}} : document,
    context:{target:previewTarget??'windows',targetId:'style-preview',roomId:'',displayScale:1}},
    {target:previewTarget??'windows',targetId:'style-preview',roomId:null,placement:'main'}).eventDecision!,[document,displayAll,previewTarget]);
  const configured = { ...settingsOf(document), eventVisibility: resolveThemeEventVisibility(normalizeCompatibleEventVisibility("blivechat", displayAll ? createAllNativeEventVisibility() : document.settings.eventVisibility), previewTarget ?? 'windows') };
  const settings = configured;
  const auxiliary = previewTarget !== "live";
  const previewScrollCss = (thumbnail || previewMode !== "simulation")
    ? "#item-scroller.yt-live-chat-item-list-renderer{overflow-y:auto;padding-right:0;}#item-scroller.animated.yt-live-chat-item-list-renderer #items.yt-live-chat-item-list-renderer{position:relative!important;inset:auto!important;transform:none!important;flex:none!important}"
    : "";
  const targetCss = [
    previewScrollCss,
    "html,body,#app,yt-live-chat-renderer,yt-live-chat-item-list-renderer,#item-scroller,#items{background:transparent!important;background-color:transparent!important}html{--yt-live-chat-background-color:transparent!important;--yt-live-chat-action-panel-background-color:transparent!important}",
    previewTarget === "live" ? "yt-live-chat-ticker-renderer{display:none!important}:where(#timestamp){display:none!important}" : "",
    thumbnail ? "html,body,#app,yt-live-chat-renderer,yt-live-chat-item-list-renderer,#item-scroller,#items{background:transparent!important;background-color:transparent!important}html{--yt-live-chat-background-color:transparent!important;--yt-live-chat-action-panel-background-color:transparent!important}html,body,#app{overflow:hidden!important}#item-scroller.yt-live-chat-item-list-renderer{overflow:hidden!important;scrollbar-width:none!important}#item-scroller.yt-live-chat-item-list-renderer::-webkit-scrollbar{display:none!important}#item-scroller.yt-live-chat-item-list-renderer #items.yt-live-chat-item-list-renderer{padding-top:0!important}" : "",
  ].filter(Boolean).join("\n");
  return createElement(BlivechatSourcePreview, { previewDecision:decision, previewDocument:document, maskUsername: previewTarget !== "live" && settings.maskUsername, previewPolicy, previewTarget, eventVisibility: settings.eventVisibility, previewFrame,onPreviewFrame, css: [composeBlivechatThemeCss({ ...document, settings }), createBlivechatAuxiliaryDisplayCss({ ...settings, showTimestamp: auxiliary && settings.showTimestamp, maskUsername: auxiliary && settings.maskUsername }), targetCss].filter(Boolean).join("\n\n"), config: createBlivechatSourceConfig(settings), thumbnail, previewMode, previewPlaying, previewSpeed, previewRestartKey, previewEventType, displayAll, scrollDirection, contentAlignment, editorSelection, onEditorInspection });
}

function BlivechatBasicControls({ document, onSettingsChange }: { document: ThemeDocument; onSettingsChange(settings: CompatibleVisualSettings): void }) {
  const settings = settingsOf(document);
  const update = (next: Partial<BlivechatThemeSettings>) => onSettingsChange({ ...settings, ...next });
  const row = (key: "showGiftName" | "showTimestamp" | "maskUsername" | "showAvatar" | "showUsername" | "showGuardBadge" | "showModBadge", label: string) => <div className="native-theme-setting-row" key={key}><PanelSwitch label={label} checked={Boolean(settings[key])} onChange={() => update({ [key]: !settings[key] })} /><span>{label}</span></div>;
  return <>
    <section className="native-editor-section"><header><h3>基础设置</h3><p>整体比例 调整文字、尺寸与间距；字体比例 调整文字及随字号变化的表情等元素。</p></header>
      <div className="native-theme-inline-fields"><label className="native-theme-number-field"><span>整体比例</span><input type="number" min="0.5" max="3" step="0.05" value={settings.globalScale} onChange={event => update({ globalScale: Number(event.target.value) })} /></label>
      <label className="native-theme-number-field"><span>字体比例</span><input type="number" min="0.5" max="3" step="0.05" value={settings.fontScale} onChange={event => update({ fontScale: Number(event.target.value) })} /></label></div>
    </section>
    <CompatibleThemeEventSettings document={document} onSettingsChange={onSettingsChange} />
    <section className="native-editor-section"><header><h3>信息元素</h3><p>时间与用户名打码仅用于副窗口和 OBS。</p></header><div className="native-theme-toggle-grid native-theme-element-grid">{row("showAvatar", "头像")}{row("showUsername", "用户名")}{row("showGuardBadge", "大航海标记")}{row("showModBadge", "房管标记")}{row("showTimestamp", "时间")}{row("maskUsername", "用户名打码")}</div></section>
    <section className="native-editor-section"><header><h3>模式特色</h3><p>仅调整 BLC 原版主消息区的礼物描述。</p></header><div className="native-theme-toggle-grid native-theme-feature-grid">{row("showGiftName", "显示礼物名称与数量")}</div></section>
  </>;
}

registerCompatibleThemeEditingSurface("blivechat", {
  capability: BLIVECHAT_CAPABILITY,
  ownsPreviewDocument: true,
  renderer: props => createElement(BlivechatPreview, props),
  renderBasicControls: context => createElement(BlivechatBasicControls, context),
  composeCss: composeBlivechatThemeCss,
});

registerCompatibleEventRenderProvider(context => blivechatThemeRuntime.resolve(context));
installBlivechatThemeRenderer(blivechatThemeRuntime);
void blivechatThemeRuntime.start().catch(() => {
  // 非 Tauri 预览环境没有持久化端口；编辑器内预览仍可正常使用。
});

