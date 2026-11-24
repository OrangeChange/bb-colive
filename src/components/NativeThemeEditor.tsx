import type {ThemeImageDecorations} from "../themes/themeImageDecorations.ts";
import {applyThemeAssetUrls} from "../themes/themeAssets.ts";
import { themePriceGradient } from '../themes/nativePriceGradient.ts';
import { normalizeNativeNavigationSelection } from "../themes/nativeVisualNavigation.ts";
import { useNativePreviewEvents } from "../preview/useNativePreviewEvents.ts";
import { ThemeAdvancedEditorBoundary } from "./ThemeAdvancedEditorBoundary.tsx";
import { tryComposeNativePreviewCss } from "../themes/nativeThemeCascade.ts";
import { useStylePreviewPolicy } from "../preview/useStylePreviewPolicy.ts";
import { previewElementMark } from "../preview/stylePreviewSelection.ts";
import { StylePreviewActions } from "./StylePreviewActions.tsx";
import { useStylePreviewPublisher } from "../preview/useStylePreviewPublisher.ts";
import { usePreviewCanvas } from "../preview/usePreviewCanvas.ts";
import { createPortal } from "react-dom";
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { EventDisplayPreferences } from "../eventDisplaySettings.ts";
import type { EventStyleSettings } from "../eventStyleSettings.ts";
import type { ThemeDocument } from "../themes/themeTypes.ts";
import {
  createAllNativeEventVisibility,
  normalizeNativeThemeDisplaySettings,
  type NativeThemeSettings,
  type NativeVisualModel,
} from "../themes/nativeComponentAppearance.ts";
import {
  NATIVE_PART_SELECTORS,
  nativePartElementFromTarget,
  nativeSelectionContextFromElement,
} from "../themes/nativeSemanticSelectors.ts";
import { renderNativeVisualBlocks, tryScopeNativePreviewCss } from "../themes/nativeManagedCss.ts";
import { scopeThemeCss } from "../themes/themeCssScope.ts";
import {
  createStylePreviewPartEvents,
  createStylePreviewDesignEvents,
  type PreviewEventKind,
} from "./stylePreviewEvents.ts";
import { NativeThemeBasicSettings } from "./NativeThemeBasicSettings.tsx";
import {
  NativeThemeVisualEditor,
  type NativeVisualSelection,
} from "./NativeThemeVisualEditor.tsx";
import "./nativeThemeEditor.css";
import type { NativeThemeCssExportScope } from "../themes/themeCssExport.ts";

import type { ThemeCssControlledField } from "../themes/themeEditorSession.ts";
import { NativeStylePreviewSurface } from "./NativeStylePreviewSurface.tsx";
import { STYLE_PREVIEW_POINTER_DOWN_EVENT } from "./stylePreviewInteraction.ts";
import type { NativePreviewGeometry } from "./nativePreviewGeometry.ts";
import { useGeneralSettings } from "../generalSettings.ts";
import {
  type NativeStylePreviewPayload,
} from "../windows/nativeStylePreviewBridge.ts";
import type {
  StylePreviewContext,
  StylePreviewMode,
} from "./stylePreviewContext.ts";
import { StylePreviewToolbar } from "./StylePreviewToolbar.tsx";
import { ThemeEditorContent, ThemeEditorHeader, ThemeEditorTabs, type ThemeEditorSection } from "./ThemeEditorChrome.tsx";

type Section = ThemeEditorSection;
type PreviewMotion = "static" | "design" | "dynamic";
type PreviewScheme = "system" | "light" | "dark";
type NativePreviewSessionState = {
  displayMode: StylePreviewMode;
  kind: PreviewEventKind;
  motion: PreviewMotion;
  scheme: PreviewScheme;
  transparent: boolean;
  background: string;
  speed: number;
};
let nativePreviewSessionState: NativePreviewSessionState = {
  displayMode: "all",
  kind: "混合流",
  motion: "static",
  scheme: "light",
  transparent: true,
  background: "#ffffff",
  speed: 1,
};
const NativeThemeAdvancedEditor = lazy(() =>
  import("./NativeThemeAdvancedEditor.tsx").then((module) => ({
    default: module.NativeThemeAdvancedEditor,
  })),
);

export function NativeThemeEditor({
  previewActive = true,
  document,
  previewDocument,
  visualCss,
  customCss,
  cssMessage,
  visualCssControlled,
  previewTarget,
  previewHeaderTarget,
  previewGeometry,
  displayPreferences,
  fontFamilyOptions,
  onOpenFonts,
  onSettingsChange,
  onCustomCssChange,
  onVisualCssChange,
  onExportCss,
  onAddAsset,
  onRemoveAsset,
  onReplaceAsset,
  assetPreviewUrls,
  onBack,
  dirty = false,
  draftStatus,
  onRetryDraft,
  saving = false,
  onSave,
  onSaveAs,
  onRestore,
  onEditMetadata,
  onApply,
  applyLabel,
  applyTargets,
}: {
  previewActive?: boolean;
  document: ThemeDocument;
  previewDocument: ThemeDocument;
  visualCss: string;
  customCss: string;
  cssMessage: string;
  visualCssControlled: ThemeCssControlledField[];
  previewTarget: HTMLElement | null;
  previewHeaderTarget: HTMLElement | null;
  previewGeometry: NativePreviewGeometry | null;
  displayPreferences: EventDisplayPreferences;
  fontFamilyOptions: string[];
  onOpenFonts: () => void;
  onSettingsChange: (settings: NativeThemeSettings) => void;
  onCustomCssChange: (css: string) => void;
  onVisualCssChange: (css: string) => string;
  onExportCss: (scope: NativeThemeCssExportScope) => void;
  onAddAsset: () => void;
  onRemoveAsset: (assetId: string) => void;
  onReplaceAsset: (assetId: string) => void;
  assetPreviewUrls: ReadonlyMap<string,string>;
  onBack: () => void;
  dirty?: boolean;
  draftStatus?: "saving" | "saved" | "error";
  onRetryDraft?: () => void;
  saving?: boolean;
  onSave: () => void;
  onSaveAs?: () => void;
  onRestore?: (scope: string) => void;
  onEditMetadata: () => void;
  onApply: () => void;
  applyLabel?: string;
  applyTargets?: readonly { label: string; action: () => void }[];
}) {
  const persistedSettings = document.settings as NativeThemeSettings;
  const [transientSettings, setTransientSettings] = useState<NativeThemeSettings | null>(null);
  const [pricePreviewMin, setPricePreviewMin] = useState<number | undefined>(undefined);
  const editedSettings = transientSettings ?? persistedSettings;
  const settings = pricePreviewMin === undefined ? editedSettings : { ...editedSettings, display: { ...editedSettings.display, usePriceGradient: true } };
  const visualPreview = Boolean(transientSettings && transientSettings.visualModel !== persistedSettings.visualModel);
  const compositionSettings = visualPreview ? persistedSettings : settings;
  const previewEventSettings = useMemo(() => ({...compositionSettings,rolePriority:[...compositionSettings.display.identityPriority]}) as EventStyleSettings, [compositionSettings]);
  const priceMinimums = useMemo(() => themePriceGradient(settings.priceGradient, document.styles.baseCss).bands.map(band => band.min), [settings.priceGradient, document.styles.baseCss]);
  const display = useMemo(
    () => normalizeNativeThemeDisplaySettings(settings.display),
    [settings.display],
  );
  const [section, setSection] = useState<Section>("basic");
  const previewContext: StylePreviewContext = "obs";
  const previewDisplayMode: StylePreviewMode = "all";
  const previewKind: PreviewEventKind = "混合流";
  const [previewMotion, setPreviewMotion] = useState<PreviewMotion>(
    () => nativePreviewSessionState.motion,
  );
  const [previewPlaying, setPreviewPlaying] = useState(true);
  const [fallbackPreviewWidth, setFallbackPreviewWidth] = useState(340);
  const previewWidth = previewGeometry?.width ?? fallbackPreviewWidth;
  const [previewEventKinds, setPreviewEventKinds] = useState<string[]>([]);
  const [previewScheme, setPreviewScheme] = useState<PreviewScheme>(
    () => nativePreviewSessionState.scheme,
  );
  const [previewTransparent, setPreviewTransparent] = useState(
    () => nativePreviewSessionState.transparent,
  );
  const [previewBackground, setPreviewBackground] = useState(
    () => nativePreviewSessionState.background,
  );
  const [previewSpeed, setPreviewSpeed] = useState(
    () => nativePreviewSessionState.speed,
  );
  const [storedSelection, setStoredSelection] = useState<NativeVisualSelection>({
    event: "all",
    identity: "all",
    part: "row",
  });
  const selection = normalizeNativeNavigationSelection(storedSelection);
  if (selection !== storedSelection) setStoredSelection(selection);
  const setSelection = (next: NativeVisualSelection) => setStoredSelection(normalizeNativeNavigationSelection(next));
  useEffect(() => setTransientSettings(null), [document.themeId, section, selection.event, selection.identity, selection.part, previewContext, previewScheme, previewMotion, previewKind]);
  const previewHoveredElement = useRef<Element | null>(null);
  const previewSelectedElement = useRef<Element | null>(null);
  useEffect(() => {
    previewSelectedElement.current?.removeAttribute("data-preview-part-selected");
    previewSelectedElement.current = null;
    previewHoveredElement.current?.removeAttribute("data-preview-part-hover");
    previewHoveredElement.current = null;
  }, [document.themeId]);
  const clearPreviewHover = () => {
    previewHoveredElement.current?.removeAttribute("data-preview-part-hover");
    previewHoveredElement.current = null;
  };
  useEffect(() => {
    if (previewMotion !== "design") {
      clearPreviewHover();
      previewSelectedElement.current?.removeAttribute("data-preview-part-selected");
      previewSelectedElement.current = null;
    }
    return () => {
      clearPreviewHover();
      previewSelectedElement.current?.removeAttribute("data-preview-part-selected");
    };
  }, [previewMotion]);
  const events = useMemo(
    () => { const list = previewMotion === "design" ? createStylePreviewDesignEvents(previewKind, priceMinimums) : createStylePreviewPartEvents(previewKind);
      if(pricePreviewMin===undefined)return list;
      const value=Math.max(0.1,pricePreviewMin);
      return list.map(e=>e.gift&&!e.gift.isFree&&e.gift.coinType!=="silver"?{...e,gift:{...e.gift,count:1,priceRmb:value,totalRmb:value,...(e.gift.blindGiftName?{blindHitPriceRmb:value}:{})}}:e.sc?{...e,sc:{...e.sc,price:value}}:e); },
    [previewKind, previewMotion === "design", pricePreviewMin, priceMinimums],
  );
  const [playback, setPlayback] = useState(() => ({ count: previewMotion === "dynamic" ? 1 : events.length, restart: 0 }));
  useEffect(() => {
    nativePreviewSessionState = {
      displayMode: previewDisplayMode,
      kind: previewKind,
      motion: previewMotion,
      scheme: previewScheme,
      transparent: previewTransparent,
      background: previewBackground,
      speed: previewSpeed,
    };
  }, [
    previewContext,
    previewDisplayMode,
    previewKind,
    previewMotion,
    previewScheme,
    previewTransparent,
    previewBackground,
    previewSpeed,
  ]);
  const softwarePreviewPolicy = useStylePreviewPolicy();
  const previewPolicy = useMemo(() => ({ ...softwarePreviewPolicy, previewEventKinds }), [softwarePreviewPolicy, previewEventKinds]);
  const previewPreferences = useMemo(() => ({ ...displayPreferences, ...display }), [displayPreferences, display]);
  const stickySettings = useGeneralSettings(state => state.stickyEvents);
  const scrollDirection = useGeneralSettings(state => state.liveScrollDirection);
  const contentAlignment = useGeneralSettings(state => state.liveContentAlignment);
  const { previewEvents, previewNow, previewMainEventIds } = useNativePreviewEvents({ document, settings, baseFontSize: display.baseFontSize, events, previewContext, previewDisplayMode, previewKind, previewMotion, previewActive, previewPlaying, previewSpeed, previewPreferences, previewPolicy, restart: playback.restart });
  useEffect(() => {
    if (!previewTarget) return;
    const update = () => setFallbackPreviewWidth(Math.round(previewTarget.getBoundingClientRect().width));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(previewTarget);
    return () => observer.disconnect();
  }, [previewTarget]);
  const previewCssResult = useMemo(
    () =>
      [tryComposeNativePreviewCss(applyThemeAssetUrls({
        ...previewDocument,
        settings: previewDisplayMode === "all"
          ? { ...compositionSettings, eventVisibility: createAllNativeEventVisibility() }
          : compositionSettings,
      },assetPreviewUrls), ".native-theme-preview")],
    [previewDocument, compositionSettings, previewDisplayMode,assetPreviewUrls],
  );
  const transientVisualCss = useMemo(() => {
    if (!visualPreview || !transientSettings) return "";
    const css = `@layer config {\n${renderNativeVisualBlocks(applyThemeAssetUrls({...document,settings:transientSettings},assetPreviewUrls).settings as NativeThemeSettings).join("\n")}\n}`;
    return tryScopeNativePreviewCss(scopeThemeCss(css, ".theme-surface"), ".native-theme-preview").css;
  }, [visualPreview, transientSettings,assetPreviewUrls,document]);
  const previewCss = useMemo(() => [...previewCssResult.map(result => result.css).filter(Boolean), transientVisualCss].filter(Boolean).join("\n\n"), [previewCssResult, transientVisualCss]);
  const previewCssError =
    previewCssResult.find((result) => result.error)?.error ?? "";
  const previewPayload = useMemo<NativeStylePreviewPayload>(
    () => ({
      previewCss,
      previewPolicy,
      previewMotion: previewMotion === "dynamic" ? "simulation" : previewMotion,
      previewNow,
      previewMainEventIds,
      context: previewContext,
      mode: previewDisplayMode,
      events: previewEvents,
      eventStyleSettings: previewEventSettings,
      displayPreferences: previewPreferences,
      eventFontSize: display.baseFontSize,
      windowEventFontSize: display.baseFontSize,
      stickySettings,
      scrollDirection,
      contentAlignment,
      previewScheme,
      previewBackground: previewTransparent ? "transparent" : previewBackground,
    }),
    [
      previewCss,
      previewPolicy,
      previewNow,
      previewMainEventIds,
      previewMotion,
      previewContext,
      previewDisplayMode,
      previewEvents,
      previewEventSettings,
      previewPreferences,
      display,
      stickySettings,
      scrollDirection,
      contentAlignment,
      previewScheme,
      previewBackground,
      previewTransparent,
    ],
  );
  const canvas=usePreviewCanvas(previewWidth,previewScheme);
  const sharedPreview=useMemo(()=>({kind:"native" as const,content:previewPayload,...canvas.geometry,frame:{epoch:0,selection:previewMotion==="design"?previewElementMark(previewSelectedElement.current):undefined,scroll:canvas.scroll,playing:previewPlaying,cursor:previewEvents.length,restart:playback.restart}}),[previewPayload,selection,section,previewMotion,canvas.geometry.width,canvas.geometry.height,canvas.geometry.nativeRowWidth,canvas.geometry.scrollbarWidth,canvas.geometry.scrollbarThumb,canvas.geometry.scrollbarTrack,canvas.geometry.palette,canvas.geometry.customColor,canvas.geometry.scheme,canvas.scroll,previewPlaying,previewEvents.length,playback.restart]);
  useStylePreviewPublisher(sharedPreview,previewActive);
  const requestPreviewWidth = (value: number) => {
    const next = Math.max(160, Math.min(1920, Math.round(value)));
    if (previewGeometry) previewGeometry.resizeBy(next - previewWidth);
    else setFallbackPreviewWidth(next);
  };
  const renderPreview = () => (
    <div
      ref={canvas.ref}
      className="native-theme-preview"
      data-native-canvas
    >
      <StylePreviewToolbar
        eventValues={previewEventKinds}
        onEventsChange={setPreviewEventKinds}
        eventOptions={["混合流", "弹幕", "互动", "礼物", "红包/天选", "醒目留言", "大航海", "系统"].map(value => ({ value, label: value }))}
        scheme={previewScheme}
        motion={previewMotion}
        playing={previewPlaying}
        speed={previewSpeed}
        background={previewTransparent ? "transparent" : previewBackground}
        width={previewWidth}
        error={Boolean(previewCssError)}
        onSchemeChange={setPreviewScheme}
        onMotionChange={value => {
          setPreviewMotion(value);
          if (value === "dynamic") {
            setPlayback(current => ({ count: 1, restart: current.restart + 1 }));
            setPreviewPlaying(true);
          }
        }}
        onPlayingChange={() => setPreviewPlaying(value => !value)}
        onRestart={() => { setPlayback(current => ({ count: 1, restart: current.restart + 1 })); setPreviewPlaying(true); }}
        onSpeedChange={setPreviewSpeed}
        onBackgroundChange={value => { const transparent = value === "transparent"; setPreviewTransparent(transparent); if (!transparent) setPreviewBackground(value); }}
        onWidthChange={requestPreviewWidth}
      />
      <div
        className={`native-preview-stage${previewTransparent ? " is-checkerboard" : ""} is-${previewScheme} is-${previewMotion}`}
        data-native-list
      >
        <div className="native-preview-canvas" style={{backgroundColor:previewTransparent ? undefined : previewBackground}}>
          <NativeStylePreviewSurface
            title="主题样式预览"
            payload={previewPayload}
            previewScheme={canvas.geometry.scheme}
            previewPalette={canvas.geometry.palette}
            customColor={canvas.geometry.customColor}
            previewBackground={
              previewTransparent ? "transparent" : previewBackground
            }
            onContentPointerDown={() => window.dispatchEvent(new Event(STYLE_PREVIEW_POINTER_DOWN_EVENT))}
            onContentClick={(target, boundary, point) => {
              if (previewMotion !== "design") return;
              const nextSelection = nativeSelectionContextFromElement(target, boundary, display.identityPriority, point);
              if (nextSelection) {
                previewSelectedElement.current?.removeAttribute("data-preview-part-selected");
                const selected = normalizeNativeNavigationSelection(nextSelection);
                const inspected = nativePartElementFromTarget(target, boundary, point)?.element;
                const picked = selected.part === nextSelection.part
                  ? inspected
                  : inspected?.closest(NATIVE_PART_SELECTORS[selected.part]);
                picked?.setAttribute("data-preview-part-selected", "");
                previewSelectedElement.current = picked ?? null;
                setSelection(selected);
                setSection(current => current === "basic" ? "visual" : current);
              }
            }}
            onContentPointerMove={(target, boundary, point) => {
              if (previewMotion !== "design") return clearPreviewHover();
              const picked = nativePartElementFromTarget(target, boundary, point)?.element ?? null;
              if (picked === previewHoveredElement.current) return;
              clearPreviewHover();
              picked?.setAttribute("data-preview-part-hover", "");
              previewHoveredElement.current = picked;
            }}
            onContentPointerLeave={clearPreviewHover}
           readingResetKey={playback.restart} />
        </div>
      </div>
    </div>
  );
  return (
    <div className="native-theme-editor">
      <ThemeEditorHeader dirty={dirty} saving={saving} document={document} description="原生样式 · 现场、副窗口和 OBS" onBack={onBack} onEditMetadata={onEditMetadata} onApply={onApply} applyLabel={applyLabel} applyTargets={applyTargets} draftStatus={draftStatus} onRetryDraft={onRetryDraft} onSaveAs={onSaveAs} onRestore={onRestore} />
      <ThemeEditorTabs section={section} onChange={setSection} />
      <ThemeEditorContent section={section}>
        {section === "basic" ? (
          <NativeThemeBasicSettings
              display={display}
              visibility={settings.eventVisibility}
              onDisplayChange={(value) =>
                onSettingsChange({ ...settings, display: value,
                  ...(value.usePriceGradient !== display.usePriceGradient
                    ? { priceGradient: themePriceGradient(settings.priceGradient, document.styles.baseCss) }
                    : {}) })
              }
              onVisibilityChange={(value) =>
                onSettingsChange({ ...settings, eventVisibility: value })
              }
            />
        ) : section === "visual" ? (
          <NativeThemeVisualEditor
            dirty={dirty}
            baseCss={document.styles.baseCss}
            previewRoot={previewTarget}
            interactionKey={[document.themeId, previewContext, previewScheme, previewMotion, previewKind].join("|")}
            onPreviewCancel={() => setTransientSettings(null)}
            settings={persistedSettings}
            onPricePreview={setPricePreviewMin}
            onDecorationsPreviewChange={imageDecorations=>setTransientSettings({...persistedSettings,imageDecorations})}
            onDecorationsChange={imageDecorations=>{setTransientSettings(null);onSettingsChange({...persistedSettings,imageDecorations});}}
            onGradientChange={priceGradient => { setTransientSettings(null); onSettingsChange({ ...persistedSettings, priceGradient }); }}
            onGradientPreviewChange={priceGradient => setTransientSettings({ ...persistedSettings, priceGradient })}
            cssControlled={visualCssControlled}
            selection={selection}
            fontFamilyOptions={fontFamilyOptions}
            onOpenFonts={onOpenFonts}
            onSelectionChange={setSelection}
            onChange={(visualModel: NativeVisualModel, imageDecorations?: ThemeImageDecorations) =>
              { setTransientSettings(null); onSettingsChange({ ...persistedSettings, visualModel, ...(imageDecorations ? {imageDecorations} : {}) }); }
            }
            onPreviewChange={(visualModel: NativeVisualModel) => setTransientSettings({ ...persistedSettings, visualModel })}
            onDisplayChange={(nextDisplay) => onSettingsChange({ ...settings, display: nextDisplay })}
          />
        ) : (
          <ThemeAdvancedEditorBoundary onReturn={() => setSection("basic")}><Suspense
            fallback={
              <div className="theme-editor-empty">正在打开高级编辑…</div>
            }
          >
            <NativeThemeAdvancedEditor
              document={document}
              visualCss={visualCss}
              customCss={customCss}
              cssMessage={cssMessage}
              onCustomCssChange={onCustomCssChange}
              onVisualCssChange={onVisualCssChange}
              onSave={onSave}
              onExportCss={onExportCss}
              onAddAsset={onAddAsset}
              onRemoveAsset={onRemoveAsset}
              onReplaceAsset={onReplaceAsset}
              assetPreviewUrls={assetPreviewUrls}
            />
          </Suspense></ThemeAdvancedEditorBoundary>
        )}
      </ThemeEditorContent>
      {previewTarget && createPortal(renderPreview(), previewTarget)}
      {previewHeaderTarget && createPortal(<StylePreviewActions/>, previewHeaderTarget)}
    </div>
  );
}
