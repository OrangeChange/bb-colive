import { resolveThemeEventVisibility } from "../../themes/themeEventVisibility.ts";
import { normalizeCompatibleEventVisibility } from "../../themes/compatibleEventVisibility.ts";
import { createAllNativeEventVisibility } from '../../themes/nativeComponentAppearance.ts';
import { resolvePublishedOpenLiveRender } from './runtime.tsx';
import { createElement, useMemo } from "react";
import type { ThemeDocument } from "../../themes/themeTypes.ts";
import { CompatibleThemeEventSettings } from "../../components/CompatibleThemeEventSettings.tsx";
import type { BlivechatOpenThemeSettings, CompatibleVisualSettings } from "../../themes/compatThemeSettings.ts";
import { registerCompatibleThemeEditingSurface } from "../../components/CompatibleThemePreview.tsx";
import { registerCompatibleEventRenderProvider } from "../CompatibleEventRenderer.tsx";
import { OPENLIVE_CAPABILITY, DEFAULT_OPENLIVE_THEME_SETTINGS } from "./theme.ts";
import { composeOpenLiveThemeCss, openLiveThemeRuntime } from "./runtime.tsx";
import { createOpenLiveDocumentCss } from "./css.ts";
import { createOpenLiveSourceConfig } from "./sourceConfig.ts";
import { OpenLiveSourcePreview } from "./OpenLiveSourceSurface.tsx";
import { installOpenLiveThemeRenderer } from "./adapterRuntime.ts";
import { PanelSwitch } from "../../components/voicePanelPrimitives.tsx";

function settingsOf(document: ThemeDocument) {
  const input = document.settings as Partial<BlivechatOpenThemeSettings & { showTimestamp: boolean; maskUsername: boolean }>;
  return { ...DEFAULT_OPENLIVE_THEME_SETTINGS, ...input, skin: input.skin === "default" ? "default" as const : "none" as const, emoticonSize: Number.isFinite(input.emoticonSize) ? Number(input.emoticonSize) : 80, showGiftInfo: input.showGiftInfo !== false, showTimestamp: input.showTimestamp === true, maskUsername: input.maskUsername === true, showAvatar: input.showAvatar !== false, showUsername: input.showUsername !== false, showMedal: input.showMedal !== false, showGuardBadge: input.showGuardBadge !== false, showModBadge: input.showModBadge !== false, showMedalLightenedOnly: input.showMedalLightenedOnly !== false, showMedalCurrentRoomOnly: input.showMedalCurrentRoomOnly === true, ...(input.visualModel ? { visualModel: input.visualModel } : {}) };
}
export function OpenLivePreview({ previewPolicy, previewFrame,onPreviewFrame,document, thumbnail, previewMode, previewPlaying, previewSpeed, previewRestartKey, previewEventType, displayAll, previewTarget, scrollDirection, contentAlignment, editorSelection, onEditorInspection }: import("../../components/CompatibleThemePreview.tsx").CompatibleThemeRendererProps) {
  const decision = useMemo(() => resolvePublishedOpenLiveRender({document: displayAll ? {...document,settings:{...document.settings,eventVisibility:createAllNativeEventVisibility()}} : document,
    context:{target:previewTarget??'windows',targetId:'style-preview',roomId:'',displayScale:1}},
    {target:previewTarget??'windows',targetId:'style-preview',roomId:null,placement:'main'}).eventDecision!,[document,displayAll,previewTarget]);
  const configured = { ...settingsOf(document), eventVisibility: resolveThemeEventVisibility(normalizeCompatibleEventVisibility("blivechat-open", displayAll ? createAllNativeEventVisibility() : document.settings.eventVisibility), previewTarget ?? 'windows') };
  const settings = configured;
  const auxiliaryTarget = previewTarget !== "live";
  const sourceCss = createOpenLiveDocumentCss({ ...document, settings });
  const showTimestamp = auxiliaryTarget && settings.showTimestamp;
  const previewScrollCss = (thumbnail || previewMode !== "simulation")
    ? "#item-scroller.yt-live-chat-item-list-renderer{overflow-y:auto;padding-right:0;}#item-scroller.animated.yt-live-chat-item-list-renderer #items.yt-live-chat-item-list-renderer{position:relative!important;inset:auto!important;transform:none!important;flex:none!important}"
    : previewFrame
      ? "#item-scroller.yt-live-chat-item-list-renderer{overflow-y:auto;justify-content:flex-start!important}#item-scroller.animated.yt-live-chat-item-list-renderer #items.yt-live-chat-item-list-renderer{position:relative!important;inset:auto!important;transform:none!important;flex:none!important}"
      : "";
  const auxiliary = [sourceCss.appearanceCss, previewScrollCss, "html,body,#app,yt-live-chat-renderer,yt-live-chat-item-list-renderer,#item-scroller,#items{background:transparent!important;background-color:transparent!important}html{--yt-live-chat-background-color:transparent!important;--yt-live-chat-action-panel-background-color:transparent!important}", previewTarget === "live" ? "yt-live-chat-ticker-renderer{display:none!important}:where(#timestamp){display:none!important}" : "", thumbnail ? "html,body,#app,yt-live-chat-renderer,yt-live-chat-item-list-renderer,#item-scroller,#items{background:transparent!important;background-color:transparent!important}html{--yt-live-chat-background-color:transparent!important;--yt-live-chat-action-panel-background-color:transparent!important}html,body,#app{overflow:hidden!important}#item-scroller.yt-live-chat-item-list-renderer{overflow:hidden!important;scrollbar-width:none!important}#item-scroller.yt-live-chat-item-list-renderer::-webkit-scrollbar{display:none!important}#item-scroller.yt-live-chat-item-list-renderer #items.yt-live-chat-item-list-renderer{padding-top:0!important}" : "", showTimestamp ? ":where(#timestamp){display:inline!important}" : "", settings.showAvatar ? "" : ":where(#author-photo){display:none!important}", settings.showUsername ? "" : ":where(#author-name){display:none!important}", settings.showMedal ? "" : ":where(yt-live-chat-author-medal-renderer){display:none!important}"].filter(Boolean).join("\n");
  return createElement(OpenLiveSourcePreview, { previewDecision:decision, previewDocument:document, maskUsername: previewTarget !== "live" && settings.maskUsername, previewPolicy, previewTarget, eventVisibility: settings.eventVisibility, previewFrame,onPreviewFrame, css: sourceCss.css, appearanceCss: auxiliary, config: createOpenLiveSourceConfig(settings, { maxNumber: thumbnail || previewMode === "simulation" ? 60 : 1000 }), thumbnail, previewMode, previewPlaying, previewSpeed, previewRestartKey, previewEventType, displayAll, scrollDirection, contentAlignment, editorSelection, onEditorInspection });
}
function OpenLiveBasicControls({ document, onSettingsChange }: { document: ThemeDocument; onSettingsChange(settings: CompatibleVisualSettings): void }) {
  const settings = settingsOf(document); const update = (next: Partial<typeof settings>) => onSettingsChange({ ...settings, ...next });
  const row = (key: "showGiftInfo" | "showTimestamp" | "maskUsername" | "showAvatar" | "showUsername" | "showGuardBadge" | "showModBadge" | "showMedal" | "showMedalLightenedOnly" | "showMedalCurrentRoomOnly", label: string) => <div className="native-theme-setting-row" key={key}><PanelSwitch label={label} checked={Boolean(settings[key])} onChange={() => update({ [key]: !settings[key] })} /><span>{label}</span></div>;
  return <>

    <CompatibleThemeEventSettings document={document} onSettingsChange={onSettingsChange} />
    <section className="native-editor-section"><header><h3>信息元素</h3><p>时间与用户名打码仅用于副窗口和 OBS。</p></header><div className="native-theme-toggle-grid native-theme-element-grid">{row("showAvatar", "头像")}{row("showUsername", "用户名")}{row("showGuardBadge", "大航海标记")}{row("showModBadge", "房管标记")}{row("showMedal", "粉丝牌")}{row("showMedalLightenedOnly", "只显示已点亮粉丝牌")}{row("showMedalCurrentRoomOnly", "只显示当前直播间粉丝牌")}{row("showTimestamp", "时间")}{row("maskUsername", "用户名打码")}</div></section>
    <section className="native-editor-section"><header><h3>模式特色</h3><p>礼物描述仅影响主消息区。</p></header><div className="native-theme-toggle-grid native-theme-feature-grid">{row("showGiftInfo", "显示礼物名称与数量")}</div></section>
  </>;
}
registerCompatibleThemeEditingSurface("blivechat-open", { capability: OPENLIVE_CAPABILITY, ownsPreviewDocument: true, renderer: props => createElement(OpenLivePreview, props), renderBasicControls: context => createElement(OpenLiveBasicControls, context), composeCss: composeOpenLiveThemeCss });
registerCompatibleEventRenderProvider(context => openLiveThemeRuntime.resolve(context));
installOpenLiveThemeRenderer(openLiveThemeRuntime);
void openLiveThemeRuntime.start().catch(() => { /* 非 Tauri 预览环境只使用编辑器预览。 */ });
