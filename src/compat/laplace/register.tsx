import { resolveThemeEventVisibility } from "../../themes/themeEventVisibility.ts";
import { normalizeCompatibleEventVisibility } from "../../themes/compatibleEventVisibility.ts";
import { createAllNativeEventVisibility } from '../../themes/nativeComponentAppearance.ts';
import { StylePreviewFallbacks } from '../../components/StylePreviewFallbacks.tsx';
import { nativeFallbackPreviewCandidates } from '../../preview/sourcePreviewGeneration.ts';
import { eligibleNativePreviewCandidates, nextNativePreviewEvent } from '../../preview/stylePreviewGenerator.ts';
import { MsgType, type DanmakuEvent } from '../../protocol/types.ts';
import { useStylePreviewPlayback } from '../../preview/useStylePreviewPlayback.ts';
import { admitsStylePreviewEvent } from '../../preview/stylePreviewPolicy.ts';
import { DEFAULT_STYLE_PREVIEW_POLICY, projectSourcePreviewFact, scopeStylePreviewSample, selectStylePreviewEvents, stylePreviewAnimation } from "../../preview/stylePreviewPolicy.ts";
import { createElement, useEffect, useLayoutEffect, useMemo, useState, useRef } from "react";
import { PanelSwitch } from "../../components/voicePanelPrimitives.tsx";
import { isLaplaceThemeSampleVisible, laplaceThemeVisibilitySettings } from "../../themes/compatibleEventVisibility.ts";
import type { ThemeDocument } from "../../themes/themeTypes.ts";
import { CompatibleThemeEventSettings } from "../../components/CompatibleThemeEventSettings.tsx";
import type {
  CompatibleVisualSettings,
  LaplaceThemeSettings,
} from "../../themes/compatThemeSettings.ts";
import { registerCompatibleThemeEditingSurface } from "../../components/CompatibleThemePreview.tsx";
import { registerCompatibleEventRenderProvider } from "../CompatibleEventRenderer.tsx";
import { RendererHost } from "./RendererHost.tsx";
import { applyCompatibleThumbnailFramePresentation } from "../thumbnailFramePresentation.ts";
import { originalSimulationCandidates, getOriginalSamples } from "./renderer/samples.ts";

import { DEFAULT_LAPLACE_SETTINGS } from "./settings.ts";
import type { LaplaceEvent as SourceLaplaceEvent } from "./types.ts";
import { LAPLACE_CAPABILITY } from "./theme.ts";
import { composeLaplaceRendererCssSources, composeLaplaceThemeCss, laplaceThemeRuntime, maskLaplaceProductEvent, resolvePublishedLaplaceRender } from "./runtime.tsx";
import {
  installLaplaceThemeCssComposer,
  installLaplaceThemeRenderer,
} from "./adapterRuntime.ts";

export function laplaceNativePreviewCandidates(options: Parameters<typeof nativeFallbackPreviewCandidates>[0]) {
  return nativeFallbackPreviewCandidates(options).filter(event => event.msgType !== MsgType.AdminChange && event.msgType !== MsgType.GuardHonor);
}

function settingsOf(document: ThemeDocument): LaplaceThemeSettings {
  const input = document.settings as Partial<LaplaceThemeSettings>;
  return {
    ...input,
    showSpoiler: input.showSpoiler !== false,
    showGiftHighlightAbove:
      typeof input.showGiftHighlightAbove === "number"
        ? input.showGiftHighlightAbove
        : 30,
    classicElementScope: input.classicElementScope === true,
    showAvatar: input.showAvatar !== false,
    showUsername: input.showUsername !== false,
    showMedal: input.showMedal !== false,
    showAvatarFrame: input.showAvatarFrame !== false,
    showGuardBadge: input.showGuardBadge !== false,
    showMedalLightenedOnly: input.showMedalLightenedOnly !== false,
    showMedalCurrentRoomOnly: input.showMedalCurrentRoomOnly === true,
    showWealthMedal: input.showWealthMedal === true,
    showCurrentRank: input.showCurrentRank === true,
    showModBadge: input.showModBadge !== false,
    showAnchorBadge: input.showAnchorBadge !== false,
    baseFontSize:
      typeof input.baseFontSize === "number" ? input.baseFontSize : 20,
    colorScheme: input.colorScheme === "dark" ? "dark" : "light",
    sceneName:
      typeof input.sceneName === "string" ? input.sceneName : "",
    showTimestamp: input.showTimestamp === true,
    maskUsername: input.maskUsername === true,
    ...(input.visualModel ? { visualModel: input.visualModel } : {}),
  };
}
export function LaplacePreview({
  onPreviewReady, onPreviewFailure,
  previewPolicy, previewFrame,onPreviewFrame,
  document,
  thumbnail,
  previewMode,
  previewEventType,
  previewPlaying = true,
  previewSpeed = 1,
  previewRestartKey = 0,
  displayAll = true,
  previewTarget = "windows",
  scrollDirection,
  contentAlignment,
  editorSelection,
  onEditorInspection,
}: import("../../components/CompatibleThemePreview.tsx").CompatibleThemeRendererProps) {
  const settings = useMemo(() => ({ ...settingsOf(document), eventVisibility: resolveThemeEventVisibility(normalizeCompatibleEventVisibility("laplace", document.settings.eventVisibility), previewTarget) }), [document, previewTarget]);
  const decision = useMemo(() => resolvePublishedLaplaceRender({document: displayAll ? {...document,settings:{...document.settings,eventVisibility:createAllNativeEventVisibility()}} : document,
    context:{target:previewTarget,targetId:'style-preview',roomId:'',displayScale:1}},
    {target:previewTarget,targetId:'style-preview',roomId:null,placement:'main'}).eventDecision!,[document,displayAll,previewTarget]);
  const sourceFact = (event: SourceLaplaceEvent) => ({...scopeStylePreviewSample(projectSourcePreviewFact(event,'laplace'),previewPolicy?.targetRoomId),laplace:{sourceCommand:'',sourceMode:'direct' as const,platform:'bilibili' as const,timestampUnit:'milliseconds' as const,timestampFallback:false,event}});
  const [nativeSimulationEvents,setNativeSimulationEvents]=useState<DanmakuEvent[]>([]);
  const [fallbackDocument,setFallbackDocument]=useState<Document|null>(null);
  const mode = thumbnail ? "static" : previewMode ?? "design";
  const previewEventScope = previewEventType ?? editorSelection?.scope.eventType ?? "all";
  const enabledTypes = useMemo(() => {
    const all = ["message", "effect-message", "superchat", "gift", "toast", "interaction", "like-click", "system", "live-start", "live-end", "live-warning", "live-cutoff", "room-name-update", "room-mute-on", "room-mute-off", "red-envelope-start", "red-envelope-result", "lottery-start", "lottery-result", "user-block"];
    if (displayAll || previewEventScope === "all") return new Set(all);
    const byEvent: Record<string, string[]> = { entry:["interaction"], follow:["interaction"], share:["interaction"], "special-follow":["interaction"], "mutual-follow":["interaction"], "live-status":["live-start","live-end"], "user-block":["user-block"], "room-mute":["room-mute-on","room-mute-off"], "room-change":["room-name-update"], warning:["live-warning","live-cutoff"], danmaku: ["message", "effect-message"], interaction: ["interaction", "like-click"], like: ["like-click"], gift: ["gift", "red-envelope-start", "red-envelope-result", "lottery-start", "lottery-result"], "gift-regular": ["gift"], redpocket: ["red-envelope-start", "red-envelope-result"], lottery: ["lottery-start", "lottery-result"], superchat: ["superchat"], guard: ["toast"], redStart: ["red-envelope-start"], redResult: ["red-envelope-result"], lotteryStart: ["lottery-start"], lotteryResult: ["lottery-result"], system: ["system", "live-start", "live-end", "live-warning", "live-cutoff", "room-name-update", "room-mute-on", "room-mute-off", "user-block"] };
    return new Set(byEvent[previewEventScope] ?? all);
  }, [displayAll, previewEventScope]);
  const [simulationEvents, setSimulationEvents] = useState<SourceLaplaceEvent[]>([]);
  const generationPolicy = previewPolicy ?? DEFAULT_STYLE_PREVIEW_POLICY;
  const actionByType: Record<string, number> = { entry: 1, follow: 2, share: 3, "special-follow": 4, "mutual-follow": 5 };
  const generationAction = !displayAll ? actionByType[previewEventScope] : undefined;
  const sourceCandidates = useMemo(() => originalSimulationCandidates(enabledTypes), [enabledTypes]);
  const candidates = useMemo(() => sourceCandidates.filter(event => {
    if (generationAction !== undefined && !(event.type === 'entry-effect' ? generationAction === 1 : event.type === 'interaction' && event.action === generationAction)) return false;
    if (decision(sourceFact(event as SourceLaplaceEvent)) !== 'render') return false;
    return admitsStylePreviewEvent(scopeStylePreviewSample(projectSourcePreviewFact(event, 'laplace'), generationPolicy.targetRoomId), generationPolicy,
      { target: previewTarget, displayAll, mode: 'simulation', now: Date.now() });
  }), [sourceCandidates, generationAction, decision, generationPolicy, previewTarget, displayAll]);
  const nativeCandidates=useMemo(()=>laplaceNativePreviewCandidates({policy:generationPolicy,target:previewTarget,displayAll,decision,eventType:displayAll?undefined:previewEventScope}),[generationPolicy,previewTarget,displayAll,decision,previewEventScope]);
  const generationScope = JSON.stringify([document.themeId, [...enabledTypes], generationAction, previewTarget, displayAll, settings.eventVisibility,
    generationPolicy.previewEventKinds, generationPolicy.filters, generationPolicy.windowFilters, generationPolicy.audienceFilters, generationPolicy.giftThreshold, generationPolicy.giftThresholdMode,
    generationPolicy.targetRoomId, generationPolicy.displayPreferences.onlyGuardEntry, generationPolicy.displayPreferences.showAutoDanmaku,
    generationPolicy.displayPreferences.showPhoneNotVerified, previewRestartKey]);
  useStylePreviewPlayback({
    enabled: !thumbnail && mode === 'simulation' && !previewFrame, playing: previewPlaying && (candidates.length > 0 || eligibleNativePreviewCandidates(nativeCandidates,nativeSimulationEvents).length>0),
    speed: previewSpeed, scope: generationScope,
    reset: () => {setSimulationEvents([]);setNativeSimulationEvents([]);},
    next: (sequence, session) => {
      const fallbackCandidates=eligibleNativePreviewCandidates(nativeCandidates,nativeSimulationEvents);
      const sourceTypes=new Set(candidates.map(event=>event.type)).size;
      const nativeTypes=new Set(fallbackCandidates.map(event=>event.msgType)).size;
      if(fallbackCandidates.length && Math.random()*(sourceTypes+nativeTypes)<nativeTypes){
        const event=nextNativePreviewEvent({candidates:fallbackCandidates,events:nativeSimulationEvents,random:Math.random,now:Date.now,sequence,session});
        if(event)setNativeSimulationEvents(previous=>[...previous,event].slice(-2000));
        return;
      }
      const sample = candidates[Math.floor(Math.random() * candidates.length)];
      if (!sample) return;
      const now = Date.now();
      const event = { ...structuredClone(sample), id: `preview:${session}:${sequence}`, timestamp: now, timestampNormalized: now } as SourceLaplaceEvent;
      setSimulationEvents(previous => [...previous, event].slice(-2000));
    },
  });
  const sampleIdentity = editorSelection?.part.startsWith("streamerBadge") ? "streamer" : editorSelection?.part.startsWith("modBadge") ? "moderator" : editorSelection?.scope.identity;
  const fineScope = editorSelection?.scope.eventType;
  const fineScopes = new Set(["entry", "follow", "share", "special-follow", "mutual-follow", "live-status", "user-block", "room-mute", "room-change", "warning"]);
  const originalSamples = mode === "simulation" ? [] : getOriginalSamples(mode, thumbnail ? undefined : sampleIdentity, thumbnail ? undefined : editorSelection?.part);
  const scopeSamples = mode === "design" && fineScope && fineScopes.has(fineScope)
    ? getOriginalSamples("static", sampleIdentity, editorSelection?.part)
    : originalSamples;
  const allSamples = previewFrame ? (previewFrame.events ?? []) as SourceLaplaceEvent[] : mode === "simulation" ? simulationEvents : displayAll || previewEventScope === "all"
    ? scopeSamples as SourceLaplaceEvent[]
    : (scopeSamples as SourceLaplaceEvent[]).filter(event => enabledTypes.has(event.type));
  const actionByScope: Record<string, number> = { entry: 1, follow: 2, share: 3, "special-follow": 4, "mutual-follow": 5 };
  const action = !displayAll ? actionByScope[previewEventScope] : undefined;
  const scopedSamples = action === undefined ? allSamples : allSamples.filter(event => event.type === "entry-effect" ? action === 1 : event.type === "interaction" && (event as unknown as { action: number }).action === action);
  const samples = thumbnail ? scopedSamples.slice(0, 6) : scopedSamples;
  const frameCallback=useRef(onPreviewFrame);frameCallback.current=onPreviewFrame;
  const nativeEvents=previewFrame?.nativeEvents??(mode==="simulation"?nativeSimulationEvents:[]);
  const nativeIds=new Set(nativeEvents.map(event=>event.id));
  const nativeKey=JSON.stringify(nativeEvents);
  const frameKey=JSON.stringify(samples);
  const [expiryNow, setExpiryNow] = useState(0);
  const sampleNow=useMemo(()=>Date.now(),[frameKey,nativeKey,previewRestartKey]);
  const frameNow=Math.max(sampleNow,expiryNow);

  const auxiliary = previewTarget !== "live";
  const sourceSettings = useMemo(() => ({ ...DEFAULT_LAPLACE_SETTINGS, ...settings, ...laplaceThemeVisibilitySettings(settings.eventVisibility), ...(displayAll ? {showDanmaku:true,showGift:true,showSuperChat:true,showToast:true,showRedEnvelop:true,showLottery:true,showSystemMessage:true,showEnterEvent:true,showFollowEvent:true,showGiftFree:true} : {}), showTimestamp: auxiliary && settings.showTimestamp, maskUsername: auxiliary && settings.maskUsername }), [settings, displayAll, auxiliary]);
  const policy = previewPolicy ?? DEFAULT_STYLE_PREVIEW_POLICY;
  const sourceSamples = samples.filter(event => !["notice", "mvp", "superchat-delete"].includes(event.type) && (displayAll || isLaplaceThemeSampleVisible(settings.eventVisibility, event)));
  const retired = useRef({ epoch: "", ids: new Set<string>() });
  const epoch = `${mode}:${generationScope}`;
  if (retired.current.epoch !== epoch) retired.current = { epoch, ids: new Set() };
  const orderedFacts = [...sourceSamples.map(sourceFact), ...nativeEvents];
  if (mode === "simulation") orderedFacts.sort((a, b) => a.ts - b.ts);
  const selected = selectStylePreviewEvents(orderedFacts, policy, {
    target: previewTarget, displayAll, mode, now: mode === "simulation" ? previewFrame?.now ?? frameNow : Math.max(0, ...sourceSamples.map(event => event.timestampNormalized)) + 1,
  }, retired.current.ids);
  retired.current.ids = selected.retiredMainIds;
  useEffect(() => {
    if (mode !== "simulation" || previewFrame) return;
    const deadlines = [...selected.sticky.map(card => card.expiresAt), ...(previewTarget !== "live" && policy.expiry.enabled ? selected.events.map(event => event.ts + policy.expiry.seconds * 1000) : [])].filter(time => time > frameNow);
    if (!deadlines.length) return;
    const timer = window.setTimeout(() => setExpiryNow(Date.now()), Math.max(1, Math.min(...deadlines) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [mode, Boolean(previewFrame), frameNow, JSON.stringify(selected.sticky.map(card => card.expiresAt)), JSON.stringify(selected.events.map(event => event.id)), policy.expiry, previewTarget]);
  const mainEventIds = selected.events.map(event => event.id);
  const mainKey = JSON.stringify(mainEventIds);
  useLayoutEffect(() => {
    if (!previewFrame) frameCallback.current?.({ epoch: previewRestartKey, now: frameNow, events: JSON.parse(frameKey), nativeEvents:JSON.parse(nativeKey), mainEventIds: JSON.parse(mainKey) });
  }, [frameKey,nativeKey, mainKey, frameNow, previewRestartKey, Boolean(previewFrame)]);
  const mainIds = new Set(previewFrame?.mainEventIds ?? mainEventIds);
  const projection = { events: sourceSamples.filter(event => mainIds.has(event.id)), stickyEvents: selected.sticky.flatMap(card => {
    const event = sourceSamples.find(event => event.id === card.event.id);
    return event ? [event] : [];
  }) };
  const events = auxiliary && settings.maskUsername ? projection.events.map(maskLaplaceProductEvent) : projection.events;
  const stickyEvents = auxiliary && settings.maskUsername ? projection.stickyEvents.map(maskLaplaceProductEvent) : projection.stickyEvents;
  const rendererCss = useMemo(() => {
    const css = composeLaplaceRendererCssSources({ ...document, settings: sourceSettings });
    if (thumbnail) css.custom = [css.custom, "html,body,#root,.laplace-theme-root,.laplace-renderer-host,.scroll-area{background:transparent!important;background-color:transparent!important}.scroll-area{overflow:hidden!important;scrollbar-width:none!important}.scroll-area::-webkit-scrollbar{display:none!important}"].filter(Boolean).join("\n\n");
    return css;
  }, [document, sourceSettings, thumbnail]);
  return createElement("div", { className: "laplace-theme-root", style:{display:"flex",flexDirection:"column",height:"100%"}, "data-laplace-preview": thumbnail ? "thumbnail" : "editor", "data-laplace-preview-mode": mode, ...(mode === "simulation" ? { "data-laplace-simulation": "source" } : {}), "data-laplace-sample-count": samples.length },
    createElement(RendererHost, {
      onFailure: onPreviewFailure,
      onRendered: onPreviewReady,
      layout: selected.events.filter(event=>mainIds.has(event.id)).map(event=>({kind:nativeIds.has(event.id)?"fallback" as const:"source" as const,eventId:event.id})).sort((a,b)=>scrollDirection==="top"?mainEventIds.indexOf(b.eventId)-mainEventIds.indexOf(a.eventId):0),
      key: previewRestartKey,
      variant: "product",
      settings: { ...sourceSettings, showPhoneNotVerified: true, showAutoDanmaku: true, showStickyBar: previewTarget !== "live" && (displayAll || (previewTarget === "obs" ? policy.stickySettings.obsEnabled : policy.stickySettings.enabled)), limitStickyAmount: policy.stickySettings.maxCount },
      tickerPosition: policy.stickySettings.position,
      animation: stylePreviewAnimation(policy),
      css: rendererCss,
      events: !thumbnail && scrollDirection === "top" ? events.slice().reverse() : events,
      contentAlignment: thumbnail ? "top" : contentAlignment,
      stickyEvents: previewTarget === "live" ? [] : stickyEvents,
      renderMode: previewTarget === "live" ? "dashboard" : "obs",
      rate: mode === "simulation" ? sourceSamples.filter(event => event.timestampNormalized > frameNow - 1000).length : 0,
      preview: true,
      scrollable: !thumbnail,
      followLatest: mode === 'simulation' && !thumbnail,
      direction: thumbnail ? "top" : scrollDirection,
      productElements: { classicScope: settings.classicElementScope },
      acquisitionMode: "direct",
      editorSelection,
      onEditorInspection,
      onFrameDocument: thumbnail ? applyCompatibleThumbnailFramePresentation : setFallbackDocument,
    }),createElement(StylePreviewFallbacks,{frameDocument:fallbackDocument,events:selected.events.filter(event=>nativeIds.has(event.id)&&mainIds.has(event.id)),sticky:selected.sticky.filter(card=>nativeIds.has(card.event.id)),policy,mode:'laplace',settings:document.settings,target:previewTarget,now:previewFrame?.now??frameNow}));
}
function Basic({ document, onSettingsChange }: { document: ThemeDocument; onSettingsChange(settings: CompatibleVisualSettings): void }) {
  const settings = settingsOf(document);
  const update = (next: Partial<LaplaceThemeSettings>) => onSettingsChange({ ...settings, ...next });
  const row = (key: "showSpoiler" | "showAvatar" | "showUsername" | "showMedal" | "showTimestamp" | "maskUsername" | "classicElementScope" | "showAvatarFrame" | "showGuardBadge" | "showMedalLightenedOnly" | "showMedalCurrentRoomOnly" | "showWealthMedal" | "showCurrentRank" | "showModBadge" | "showAnchorBadge", label: string, disabled = false) => <div className="native-theme-setting-row" key={key}><PanelSwitch label={label} checked={Boolean(settings[key])} disabled={disabled} onChange={() => update({ [key]: !settings[key] })} /><span>{label}</span></div>;
  return <>
    <section className="native-editor-section"><header><h3>基础设置</h3><p>基准字号控制相对尺寸；固定 CSS 值保持不变。</p></header>
      <label className="native-theme-number-field"><span>基准字号</span><input aria-label="基准字号" type="number" min="12" max="64" step="0.5" value={settings.baseFontSize} onChange={event => update({ baseFontSize: Number(event.target.value) })} /><span>px</span></label>

    </section>
    <CompatibleThemeEventSettings document={document} onSettingsChange={onSettingsChange} />
    <section className="native-editor-section"><header><h3>信息元素</h3><p>时间与用户名打码仅用于副窗口和 OBS。经典控制范围仅影响副窗口和 OBS 的头像、用户名开关；开启后按 LAPLACE 原有范围控制。</p></header>
      <div className="native-theme-toggle-grid native-theme-element-grid">{row("showAvatar", "头像")}{row("showAvatarFrame", "头像框")}{row("showUsername", "用户名")}{row("showGuardBadge", "大航海标记")}{row("showMedal", "粉丝牌")}{row("showMedalLightenedOnly", "只显示已点亮粉丝牌", !settings.showMedal)}{row("showMedalCurrentRoomOnly", "仅当前房间粉丝牌", !settings.showMedal)}{row("showWealthMedal", "荣耀勋章")}{row("showCurrentRank", "当前排行")}{row("showModBadge", "房管标记")}{row("showAnchorBadge", "主播标记")}{row("showTimestamp", "时间")}{row("maskUsername", "用户名打码")}{row("classicElementScope", "经典控制范围")}</div>
    </section>
    <section className="native-editor-section"><header><h3>模式特色</h3></header>
      <div className="native-theme-feature-grid native-theme-feature-inline">{row("showSpoiler", "解析剧透内容")}<label className="native-theme-number-field" title="高亮金额只影响呈现，不改变事件显示门槛、置顶门槛或收益。"><span>礼物高亮金额</span><input aria-label="礼物高亮金额" type="number" min="0" max="99999999" step="0.01" value={settings.showGiftHighlightAbove} onChange={event => update({ showGiftHighlightAbove: Number(event.target.value) })} /><span>元</span></label></div>
    </section>
  </>;
}
registerCompatibleThemeEditingSurface("laplace", {
  ownsPreviewDocument: true,
  capability: LAPLACE_CAPABILITY,
  renderer: (props) => createElement(LaplacePreview, props),
  renderBasicControls: (context) => createElement(Basic, context),
  composeCss: composeLaplaceThemeCss,

});
registerCompatibleEventRenderProvider((context) =>
  laplaceThemeRuntime.resolve(context),
);
installLaplaceThemeRenderer(laplaceThemeRuntime);
installLaplaceThemeCssComposer(composeLaplaceThemeCss);
void laplaceThemeRuntime.start().catch(() => {});
