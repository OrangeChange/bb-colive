import { uiText } from "../i18n/index.ts";
import { ThemeVisualScope } from "./ThemeVisualScope.tsx";
import { SettingsIcon } from "./SettingsIcon";
import {resolveThemeImageDecorations,clearThemeImageDecorations,imageEventParents} from "../themes/themeImageDecorations.ts";
import {applyThemeAssetUrls} from "../themes/themeAssets.ts";
import {isImageBackgroundDraft} from "./themeImageValue.ts";
import {ThemeDecorationField} from "./ThemeDecorationField.tsx";
import { compatibleEventOptions } from "../preview/compatiblePreviewOptions.ts";
export { compatibleEventOptions } from "../preview/compatiblePreviewOptions.ts";
import { ThemeAdvancedEditorBoundary } from "./ThemeAdvancedEditorBoundary.tsx";
import { useStylePreviewPolicy } from "../preview/useStylePreviewPolicy.ts";
import { useGeneralSettings } from "../generalSettings.ts";
import { StylePreviewActions } from "./StylePreviewActions.tsx";
import { useStylePreviewPublisher } from "../preview/useStylePreviewPublisher.ts";
import { usePreviewCanvas } from "../preview/usePreviewCanvas.ts";
import { useCompatibleFeedNode, useLocalFeedReading } from "../events/useLocalFeedReading.ts";
import type { PreviewFrame } from "../preview/stylePreviewState.ts";
import { compatibleSelectorFor, normalizeCompatibleVisualTargets, normalizeCompatibleVisualAuthored } from "../themes/compatManagedCss.ts";
import { compatibleVisualEventScopes } from "../themes/compatThemeCapabilities.ts";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { ThemeDocument, ThemeTarget } from "../themes/themeTypes.ts";
import type { NativeThemeCssExportScope } from "../themes/themeCssExport.ts";
import {
  normalizeNativeVisualModel,
  type NativeVisualProperty,
  type NativeVisualScheme,
  type NativeVisualSetting,
  type NativeVisualValue,
} from "../themes/nativeComponentAppearance.ts";
import type {
  CompatibleEditorInspection,
  CompatiblePlacement,
  CompatibleThemeCapabilityMap,
  CompatibleVisualSelection,
} from "../themes/compatThemeCapabilities.ts";
import { clearCompatibleAuthoredProperty, clearCompatibleAuthoredTarget, clearCompatibleManagedTargetCss } from "../themes/compatManagedCss.ts";
import {
  compatibleCapabilityForSettings,
  clearCompatibleVisualTarget,
  resolveCompatibleCodeDefault,
  resolveCompatibleVisualControl,
  setCompatibleVisualProperty,
} from "../themes/compatThemeCapabilities.ts";
import type { CompatibleVisualSettings } from "../themes/compatThemeSettings.ts";
import { ThemeVisualPropertyField, themeVisualPropertyGroups } from "./ThemeVisualPropertyField.tsx";
import { UiSelect } from "./ui/Select.tsx";
import {
  CompatibleThemePreview,
  type CompatibleThemeRenderer,
} from "./CompatibleThemePreview.tsx";
import "./nativeThemeEditor.css";
import type { CompatibleStylePreviewState } from "../preview/stylePreviewState.ts";
import { StylePreviewToolbar, type StylePreviewMotion, type StylePreviewScheme } from "./StylePreviewToolbar.tsx";
import type { NativePreviewGeometry } from "./nativePreviewGeometry.ts";
import { getThemeModeDefinition } from "../themes/themeModes.ts";
import { ThemeEditorContent, ThemeEditorHeader, ThemeEditorTabs, type ThemeEditorSection } from "./ThemeEditorChrome.tsx";
import { buildCompatibleVisualNavigation, compatibleNavigationItemLabel, resolveCompatibleNavigationSelection, normalizeCompatibleNavigationSelection, findCompatibleNavigation, reconcileCompatibleNavigationSession, type CompatibleNavigationSession, type CompatibleNavigationItem } from "../themes/compatibleVisualNavigation.ts";
import { ThemeVisualNavigation, type ThemeVisualNavigationNode } from "./ThemeVisualNavigation.tsx";
import { ThemeVisualPropertyPanel } from "./ThemeVisualPropertyPanel.tsx";

const NativeThemeAdvancedEditor = lazy(() =>
  import("./NativeThemeAdvancedEditor.tsx").then((module) => ({
    default: module.NativeThemeAdvancedEditor,
  })),
);

type Section = ThemeEditorSection;

function sameInspection(left: CompatibleEditorInspection | null, right: CompatibleEditorInspection): boolean {
  if (!left || left.layoutSupported !== right.layoutSupported || left.refresh !== right.refresh
    || left.inspectionRevision !== right.inspectionRevision
    || left.scope.part !== right.scope.part
    || left.scope.eventType !== right.scope.eventType
    || left.scope.identity !== right.scope.identity
    || left.scope.placement !== right.scope.placement) return false;
  const keys = new Set([...Object.keys(left.computed), ...Object.keys(right.computed)]);
  for (const key of keys) {
    const a = left.computed[key as NativeVisualProperty];
    const b = right.computed[key as NativeVisualProperty];
    if (!a || !b || a.value !== b.value || a.unit !== b.unit || a.inherited !== b.inherited || a.mixed !== b.mixed || a.controlled !== b.controlled || a.applicable !== b.applicable) return false;
  }
  return true;
}



export function compatiblePlacementOptions(
  capability: CompatibleThemeCapabilityMap,
) {
  const labels: Record<CompatiblePlacement, string> = {
    main: uiText("compatibleThemeEditor.compatiblePlacementOptions.labels.main"),
    sticky: uiText("compatibleThemeEditor.compatiblePlacementOptions.labels.sticky"),
    detail: uiText("compatibleThemeEditor.compatiblePlacementOptions.labels.detail"),
  };
  return (["main", "sticky", "detail"] as const)
    .filter(
      (value) =>
        capability.eventSelectorsByPlacement?.[value] ||
        Object.values(capability.parts).some((part) =>
          part.placements?.includes(value),
        ),
    )
    .map((value) => ({ value, label: labels[value] }));
}

export function CompatibleThemeEditor({
  document,
  previewDocument,
  capability: baseCapability,
  renderer,
  composeCss,
  visualCss,
  customCss,
  cssMessage,
  cssMessageKind,
  fontFamilyOptions,
  basicControls,
  advancedControls,
  previewTarget,
  previewHeaderTarget,
  previewGeometry,
  onOpenFonts,
  previewActive=true,
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
  document: ThemeDocument;
  previewDocument: ThemeDocument;
  capability: CompatibleThemeCapabilityMap;
  renderer: CompatibleThemeRenderer;
  composeCss?: (document: ThemeDocument) => string;
  visualCss: string;
  customCss: string;
  cssMessage: string;
  cssMessageKind?: "error" | "notice";
  fontFamilyOptions: string[];
  basicControls?: ReactNode;
  advancedControls?: ReactNode;
  previewTarget?: HTMLElement | null;
  previewHeaderTarget?: HTMLElement | null;
  previewGeometry: NativePreviewGeometry | null;
  onOpenFonts?: () => void;
  previewActive?:boolean;
  onSettingsChange: (settings: CompatibleVisualSettings) => void;
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
  const capability = useMemo(()=>compatibleCapabilityForSettings(baseCapability,document.settings),[baseCapability,document.settings]);
  const [section, setSection] = useState<Section>("basic");
  const [previewMotion, setPreviewMotion] = useState<StylePreviewMotion>("static");
  const [previewPlaying, setPreviewPlaying] = useState(true);
  const [previewSpeed, setPreviewSpeed] = useState(1);
  const [previewRestartKey, setPreviewRestartKey] = useState(0);
  const [previewCanvasNode, setPreviewCanvasNode] = useState<HTMLDivElement | null>(null);
  const previewScrollNode = useCompatibleFeedNode(previewCanvasNode, document.mode !== "laplace");
  const softwarePreviewPolicy = useStylePreviewPolicy();
  const [previewEventKinds, setPreviewEventKinds] = useState<string[]>([]);
  const previewPolicy = useMemo(() => ({ ...softwarePreviewPolicy, previewEventKinds }), [softwarePreviewPolicy, previewEventKinds]);
  const scrollDirection = useGeneralSettings(state => state.liveScrollDirection);
  const contentAlignment = useGeneralSettings(state => state.liveContentAlignment);
  useLocalFeedReading(previewScrollNode, previewMotion === "dynamic" ? scrollDirection : contentAlignment ?? "top", true, `${previewMotion}:${previewRestartKey}`);
  const previewDisplayAll = true;
  const previewContext: ThemeTarget = "windows";
  const previewEvent = "all";
  const [previewScheme, setPreviewScheme] = useState<StylePreviewScheme>("light");
  const [previewBackground, setPreviewBackground] = useState("transparent");
  const [fallbackPreviewWidth, setFallbackPreviewWidth] = useState(340);
  const previewWidth = previewGeometry?.width ?? fallbackPreviewWidth;
  const sessionKey = `${document.mode}|${document.themeId}`;
  const [storedNavigation, setStoredNavigation] = useState<CompatibleNavigationSession>(() => ({
    sessionKey, selection: { event: "all", identity: "all", placement: "main", part: "event" }, navigationId: null,
  }));
  const navigation = reconcileCompatibleNavigationSession(capability, storedNavigation, sessionKey);
  if (navigation !== storedNavigation) setStoredNavigation(navigation);
  const { selection, navigationId } = navigation;
  const setNavigationId = (navigationId: string | null) => setStoredNavigation(current => ({ ...current, navigationId }));
  const setSelection = (next: CompatibleVisualSelection | ((current: CompatibleVisualSelection) => CompatibleVisualSelection)) => {
    setStoredNavigation(current => reconcileCompatibleNavigationSession(capability, {
      ...current, selection: typeof next === "function" ? next(current.selection) : next,
    }, sessionKey));
  };
  const [editScheme, setEditScheme] = useState<NativeVisualScheme>("common");
  const [expandedPropertyGroups, setExpandedPropertyGroups] = useState<Set<string>>(() => new Set(["display", "typography", "surface"]));
  const [revealPart, setRevealPart] = useState<string | null>(null);
  const [transientImages,setTransientImages]=useState<NonNullable<CompatibleVisualSettings["imageDecorations"]>|null>(null);
  const [editorInspection, setEditorInspection] = useState<CompatibleEditorInspection | null>(null);
  const inspectionRevisionRef = useRef(0);
  const [inspectionRevision, setInspectionRevision] = useState(0);
  useEffect(() => { if (document.mode !== "laplace") setEditScheme("common"); }, [document.mode]);
  const settings = { ...document.settings, visualAuthored: normalizeCompatibleVisualAuthored(capability, (document.settings as CompatibleVisualSettings).visualAuthored) } as CompatibleVisualSettings;
  const model = normalizeCompatibleVisualTargets(capability, normalizeNativeVisualModel(settings.visualModel));
  const [transientModel, setTransientModel] = useState<typeof model | null>(
    null,
  );
  const [transientAuthored, setTransientAuthored] = useState<CompatibleVisualSettings["visualAuthored"] | null>(null);
  const [pendingControl, setPendingControl] = useState<{
    key: string;
    property: NativeVisualProperty;
    value: NativeVisualValue;
    expectedRevision: number;
  } | null>(null);
  useEffect(
    () => { setTransientModel(null); setTransientAuthored(null); },
    [document.themeId, document.revision, settings.visualModel],
  );
  useEffect(() => { setPendingControl(null); }, [document.themeId, document.revision]);
  useEffect(()=>{setTransientImages(null);setTransientModel(null);setTransientAuthored(null);setPendingControl(null);setEditorInspection(null);},[selection.event,selection.identity,selection.part,selection.placement,editScheme,previewContext,previewScheme,previewMotion,previewEvent,section,document.themeId]);
  useEffect(() => { setRevealPart(null); }, [document.themeId]);
  useEffect(()=>{setRevealPart(section==="visual"?selection.part:null);},[section,selection.part,selection.event,selection.placement,previewContext]);
  useEffect(() => {
    const clearReveal = (event: KeyboardEvent) => {
      if (event.key === "Escape") setRevealPart(null);
    };
    window.addEventListener("keydown", clearReveal);
    return () => window.removeEventListener("keydown", clearReveal);
  }, []);
  const part = capability.parts[selection.part];
  const visualInteractionKey = [document.themeId, selection.event, selection.identity, selection.part, selection.placement, editScheme, previewContext, previewScheme, previewMotion, previewEvent].join("|");
  const update = (
    property: NativeVisualProperty,
    setting: NativeVisualSetting,
  ) => {
    const key = `${selection.event}|${selection.identity}|${selection.placement ?? "main"}|${selection.part}`;
    const expectedRevision = ++inspectionRevisionRef.current;
    setInspectionRevision(expectedRevision);
    setPendingControl(setting.source === "custom" && setting.value !== undefined
      ? { key, property, value: setting.value, expectedRevision }
      : null);
    const nextSettings = {
      ...settings,
      visualAuthored: clearCompatibleAuthoredProperty(settings.visualAuthored, editScheme, key, property),
      visualModel: setCompatibleVisualProperty(
        model,
        selection,
        property,
        setting,
        editScheme,
        {definition:part,settings},
      ),
    };
    onSettingsChange(nextSettings);
    if (setting.source === "inherit") {
      onVisualCssChange(clearCompatibleManagedTargetCss(visualCss, capability, editScheme, key, property));
    }
  };
  const restoreCurrentTarget = () => {
    const key = `${selection.event}|${selection.identity}|${selection.placement ?? "main"}|${selection.part}`;
    onSettingsChange({
      ...settings,
      visualAuthored: clearCompatibleAuthoredTarget(settings.visualAuthored, editScheme, key),
      visualModel: clearCompatibleVisualTarget(model, selection, editScheme),
      imageDecorations: clearThemeImageDecorations(settings.imageDecorations, `${editScheme}|${selection.event}|${selection.identity}|${selection.placement ?? "main"}|${selection.part}`),
    });
    onVisualCssChange(clearCompatibleManagedTargetCss(visualCss, capability, editScheme, key));
  };
  const previewUpdate = (
    property: NativeVisualProperty,
    setting: NativeVisualSetting,
  ) => {
    const key = `${selection.event}|${selection.identity}|${selection.placement ?? "main"}|${selection.part}`;
    setTransientAuthored(clearCompatibleAuthoredProperty(settings.visualAuthored, editScheme, key, property));
    setTransientModel(
      setCompatibleVisualProperty(
        model,
        selection,
        property,
        setting,
        editScheme,
        {definition:part,settings},
      ),
    );
  };
  const previewWithTransientModel=useMemo(()=>applyThemeAssetUrls({...previewDocument,settings:{...previewDocument.settings,...(transientModel?{visualModel:transientModel,visualAuthored:transientAuthored??settings.visualAuthored}:{}),...(transientImages?{imageDecorations:transientImages}:{})}},assetPreviewUrls??new Map()),[previewDocument,transientModel,transientAuthored,settings.visualAuthored,transientImages,assetPreviewUrls]);
  const rendererPreviewMode = previewMotion === "dynamic" ? "simulation" : previewMotion;
  const sampleSelection = useMemo(() => ({ ...selection, event: previewDisplayAll ? "all" : previewEvent }), [previewDisplayAll, previewEvent, selection]);
  const previewSelection = section !== "basic" ? selection : sampleSelection;
  const standaloneState = useMemo<CompatibleStylePreviewState>(() => ({ document: previewWithTransientModel, previewPolicy, scrollDirection, contentAlignment, previewMode: rendererPreviewMode, previewEventType: previewEvent, previewPlaying, previewSpeed, previewRestartKey, displayAll: previewDisplayAll, previewTarget: previewContext, previewScheme, previewBackground, width: previewWidth, selection: section !== "basic" || !previewDisplayAll ? previewSelection : undefined, revealPart: section === "visual" ? revealPart : null }), [previewWithTransientModel, previewPolicy, scrollDirection, contentAlignment, rendererPreviewMode, previewEvent, previewPlaying, previewSpeed, previewRestartKey, previewDisplayAll, previewContext, previewScheme, previewBackground, previewWidth, section, previewSelection, revealPart]);
  const canvas=usePreviewCanvas(previewWidth,previewScheme);
  const sharedFrame=useRef<{restart:number;frame:PreviewFrame}>({restart:previewRestartKey,frame:{epoch:0,records:[]}});
  const emptyFrame=useMemo<PreviewFrame>(()=>({epoch:0,records:[],presentation:{messages:[],paidMessages:[]}}),[]);
  const currentFrame=sharedFrame.current.restart===previewRestartKey?sharedFrame.current.frame:emptyFrame;
  const sharedPreview=useMemo(()=>({kind:"compatible" as const,content:standaloneState,...canvas.geometry,frame:{...currentFrame,scroll:canvas.scroll,playing:previewPlaying,restart:previewRestartKey}}),[standaloneState,currentFrame,canvas.geometry.width,canvas.geometry.height,canvas.geometry.nativeRowWidth,canvas.geometry.scrollbarWidth,canvas.geometry.scrollbarThumb,canvas.geometry.scrollbarTrack,canvas.geometry.palette,canvas.geometry.customColor,canvas.geometry.scheme,canvas.scroll,previewPlaying,previewRestartKey]);
  const publishPreviewFrame=useStylePreviewPublisher(sharedPreview,previewActive);
  const receivePreviewFrame=useCallback((frame:PreviewFrame)=>{
    publishPreviewFrame(frame);
    sharedFrame.current={restart:previewRestartKey,frame};
  },[previewRestartKey,publishPreviewFrame]);

  const eventOptions = useMemo(
    () => compatibleEventOptions(capability, selection.placement ?? "main"),
    [capability, selection.placement],
  );
  const navigationGroups = useMemo(() => buildCompatibleVisualNavigation(document.mode as "blivechat" | "blivechat-open" | "laplace", capability.parts, capability.eventGroups?.[selection.event] ?? [selection.event]), [capability.parts, capability.eventGroups, document.mode, selection.event]);
  const eventScopes = useMemo(() => compatibleVisualEventScopes(capability, selection.placement ?? "main"), [capability, selection.placement]);
  const activeEventScope = eventScopes.find(scope => scope.id === selection.event || scope.children?.some(child => child.id === selection.event || capability.eventGroups?.[child.id]?.includes(selection.event)));
  useEffect(() => {
    if (!eventOptions.some((option) => option.value === selection.event))
      setSelection((current) => ({ ...current, event: "all" }));
  }, [eventOptions, selection.event]);
  const identityOptions = useMemo(
    () => [
      { value: "all", label: uiText("compatibleThemeEditor.CompatibleThemeEditor.identityOptions.label") },
      ...["normal", "captain", "admiral", "governor", "anchor", "streamer", "moderator"]
        .filter((value) => capability.identitySelectors?.[value] !== undefined)
        .map((value) => ({
          value,
          label: capability.identityLabels?.[value] ?? value,
        })),
    ],
    [capability],
  );
  const applicable = Boolean(compatibleSelectorFor(capability, `${selection.event}|${selection.identity}|${selection.placement ?? "main"}|${selection.part}`, editScheme));
  const currentInspection = editorInspection?.scope.part === selection.part && editorInspection.scope.eventType === selection.event && editorInspection.scope.identity === selection.identity && editorInspection.scope.placement === (selection.placement ?? "main") ? editorInspection : null;
  const propertyGroups = themeVisualPropertyGroups((applicable ? part?.properties ?? [] : []).filter(property => (property !== "gap" || currentInspection?.layoutSupported) && currentInspection?.computed[property]?.applicable !== false));
  useEffect(() => {
    const first = propertyGroups[0]?.id;
    if (!first) return;
    setExpandedPropertyGroups((current) => current.has(first) ? current : new Set([...current, first]));
  }, [selection.part]);
  const handleEditorInspection = useCallback((inspection: CompatibleEditorInspection) => {
    if (!inspection.refresh && (capability.parts[inspection.scope.part]?.scope === "global")) {
      setEditorInspection(null);
      setNavigationId(null);
      setSelection({ part: inspection.scope.part, event: "all", identity: "all", placement: inspection.scope.placement, eventId: inspection.eventId });
      setRevealPart(inspection.scope.part);
      setSection(current => current === "basic" ? "visual" : current);
      setInspectionRevision(++inspectionRevisionRef.current);
      return;
    }

    const accept = () => setEditorInspection(current => sameInspection(current, inspection) ? current : inspection);
    setPendingControl(current => {
      if (!current || inspection.inspectionRevision === undefined || inspection.inspectionRevision < current.expectedRevision) return current;
      const key = `${inspection.scope.eventType}|${inspection.scope.identity}|${inspection.scope.placement}|${inspection.scope.part}`;
      return key === current.key ? null : current;
    });
    if (inspection.refresh) {
      if (inspection.scope.part === selection.part
        && inspection.scope.eventType === selection.event
        && inspection.scope.identity === selection.identity
        && inspection.scope.placement === (selection.placement ?? "main")) accept();
      return;
    }
    if (capability.parts[inspection.scope.part]) {
      const picked = normalizeCompatibleNavigationSelection(capability, {
        part: inspection.scope.part, event: inspection.scope.eventType, identity: inspection.scope.identity,
        placement: inspection.scope.placement, eventId: inspection.eventId,
      });
      if (picked.part === inspection.scope.part && picked.event === inspection.scope.eventType
        && picked.identity === inspection.scope.identity && picked.placement === inspection.scope.placement) accept();
      else setEditorInspection(null);
      setNavigationId(null);
      setSelection(current => current.part === picked.part && current.event === picked.event
        && current.identity === picked.identity && current.placement === picked.placement && current.eventId === picked.eventId ? current : picked);
      setRevealPart(picked.part);
      setSection(current => current === "basic" ? "visual" : current);
    }
  }, [capability, selection.event, selection.identity, selection.part, selection.placement]);
  const renderControl = (property: NativeVisualProperty) => {
    const control = resolveCompatibleVisualControl(model,selection,property,{scheme:editScheme,identityPriority:capability.identityPriority,eventGroups:capability.eventGroups,codeDefault:resolveCompatibleCodeDefault(part,selection.event,selection.placement??"main",property,settings)});
    const current=editorInspection?.scope.part===selection.part&&editorInspection.scope.eventType===selection.event&&editorInspection.scope.identity===selection.identity&&editorInspection.scope.placement===(selection.placement??"main") ? editorInspection : null;
    const inspected=current?.computed[property],key=`${selection.event}|${selection.identity}|${selection.placement??"main"}|${selection.part}`;
    const expectedUnit=part?.units?.[property]??(property==="lineHeight"?"number":"px");
    const pending=pendingControl?.key===key&&pendingControl.property===property;
    const raw=pending?pendingControl.value:isImageBackgroundDraft(control.resolved.value)?control.resolved.value:inspected?.value ?? control.resolved.value;
    const value=property==="visible" ? raw===true||raw==="true" : typeof raw==="string"&&/^-?\d+(?:\.\d+)?(?:px)?$/.test(raw) ? Number.parseFloat(raw) : raw;
    const authored=settings.visualAuthored?.[editScheme]?.[key]?.includes(property);
    const complex=!pending && (authored || inspected?.controlled || inspected && !inspected.mixed && property!=="visible" && property!=="fontFamily" && !["color","background","borderColor","borderImage"].includes(property) && typeof value!=="number" && value!=="normal" && value!=="auto");
    const missing=Boolean(current&&!Object.keys(current.computed).length);
    const status=missing?uiText("compatibleThemeEditor.CompatibleThemeEditor.renderControl.status"):inspected?.mixed?uiText("compatibleThemeEditor.CompatibleThemeEditor.renderControl.status2"):complex?uiText("compatibleThemeEditor.CompatibleThemeEditor.renderControl.status3"):control.direct?uiText("compatibleThemeEditor.CompatibleThemeEditor.renderControl.status4"):editScheme==="common"?uiText("compatibleThemeEditor.CompatibleThemeEditor.renderControl.status5"):uiText("compatibleThemeEditor.CompatibleThemeEditor.renderControl.status6");
    return <ThemeVisualPropertyField saved={!dirty} key={`${visualInteractionKey}|${property}`} property={property} imageScale={document.mode==="laplace"?{variable:"--event-base-size",value:Number(settings.baseFontSize)||20}:document.mode==="blivechat"?{variable:"--blc-g",value:Number(settings.globalScale)||1}:undefined} value={value} status={status} mixed={!pending&&inspected?.mixed} missing={missing} controlled={Boolean(complex)} unit={expectedUnit==="px"?"px":undefined}
      fontFamilyOptions={fontFamilyOptions} onOpenFonts={onOpenFonts??(()=>{})} onChange={value=>{setTransientModel(null);setTransientAuthored(null);update(property,{source:"custom",value});}}
      onPreviewChange={value=>previewUpdate(property,{source:"custom",value})} onPreviewCancel={()=>{setTransientModel(null);setTransientAuthored(null);}} onRestore={control.direct||authored?()=>update(property,{source:"inherit"}):undefined}/>;
  };
  const activeNavigation = findCompatibleNavigation(capability, selection, navigationId);
  const globalScope = part?.scope === "global";
  const staffFirst = ["anchor","streamer","moderator"].includes(capability.identityPriority?.[0] ?? "");
  const priorityControl = <div className="native-scope-setting native-identity-priority"><span>{uiText("compatibleThemeEditor.CompatibleThemeEditor.priorityControl")}</span><UiSelect ariaLabel={uiText("compatibleThemeEditor.ariaLabel")} value={staffFirst?"staff-first":"guard-first"} onValueChange={next=>{
    const ids=Object.keys(capability.identitySelectors??{}).filter(id=>id!=="all");
    const staff=ids.filter(id=>["anchor","streamer","moderator"].includes(id)),guards=ids.filter(id=>!["anchor","streamer","moderator","normal"].includes(id));
    onSettingsChange({...settings,identityPriority:next==="staff-first"?[...staff,...guards,...ids.filter(id=>id==="normal")]:[...guards,...staff,...ids.filter(id=>id==="normal")]});
  }} options={[{value:"guard-first",label:uiText("compatibleThemeEditor.options.label")},{value:"staff-first",label:uiText("compatibleThemeEditor.options.label2")}]}/></div>;
  const navigationNodes = (items: readonly CompatibleNavigationItem[]): ThemeVisualNavigationNode[] => items.map(item=>({
    id:item.id,label:compatibleNavigationItemLabel(item),part:item.part,active:activeNavigation?.item.id===item.id && activeNavigation.item.placement===item.placement && activeNavigation.item.event===item.event,
    children:item.children ? navigationNodes(item.children) : undefined,
    onSelect:item.part ? ()=>{setNavigationId(item.id);setSelection(current=>({ ...(resolveCompatibleNavigationSelection(item,current,capability)??current), eventId: undefined }));setRevealPart(item.part!);} : undefined,
  }));
  const preview = (
    <div ref={canvas.ref} className="native-theme-preview" data-compatible-canvas>
      <StylePreviewToolbar
        eventValues={previewEventKinds}
        onEventsChange={setPreviewEventKinds}
        eventOptions={[uiText("compatibleThemeEditor.eventOptions"), uiText("compatibleThemeEditor.eventOptions2"), uiText("compatibleThemeEditor.eventOptions3"), uiText("compatibleThemeEditor.eventOptions4"), uiText("compatibleThemeEditor.eventOptions5"), uiText("compatibleThemeEditor.eventOptions6"), uiText("compatibleThemeEditor.eventOptions7"), uiText("compatibleThemeEditor.eventOptions8")].map(value => ({value,label:value}))}
        scheme={previewScheme}
        motion={previewMotion}
        supportedMotions={["static", "design", "dynamic"]}
        playing={previewPlaying}
        speed={previewSpeed}
        background={previewBackground}
        width={previewWidth}
        onSchemeChange={setPreviewScheme}
        onMotionChange={value => { setPreviewMotion(value); if (value === "dynamic") { setPreviewRestartKey(previous => previous + 1); setPreviewPlaying(true); } }}
        onPlayingChange={() => setPreviewPlaying(value => !value)}
        onRestart={() => { setPreviewPlaying(true); setPreviewRestartKey(value => value + 1); }}
        onSpeedChange={setPreviewSpeed}
        onBackgroundChange={setPreviewBackground}
        onWidthChange={value => {
          const next = Math.max(160, Math.min(1920, Math.round(value)));
          if (previewGeometry) previewGeometry.resizeBy(next - previewWidth);
          else setFallbackPreviewWidth(next);
        }}
      />
      <div className={`native-preview-stage${previewBackground === "transparent" ? " is-checkerboard" : ""} is-${previewScheme} is-${previewMotion}`}>
        <div ref={setPreviewCanvasNode} className="native-preview-canvas" style={{backgroundColor:previewBackground === "transparent" ? undefined : previewBackground}}>
          <CompatibleThemePreview
            transparentCanvas
            previewPolicy={previewPolicy}
            scrollDirection={scrollDirection}
            contentAlignment={contentAlignment}
            onPreviewFrame={receivePreviewFrame}
            document={previewWithTransientModel}
            capability={capability}
            renderer={renderer}
            composeCss={composeCss}
            previewMode={rendererPreviewMode}
            previewEventType={previewEvent}
            previewPlaying={previewPlaying}
            previewSpeed={previewSpeed}
            previewRestartKey={previewRestartKey}
            displayAll={previewDisplayAll}
            previewTarget={previewContext}
            previewWidth={previewWidth}
            revealPart={section === "visual" ? revealPart : null}
            selection={section !== "basic" || !previewDisplayAll ? previewSelection : undefined}
            inspectionRevision={inspectionRevision}
            previewScheme={previewScheme}
            previewBackground={previewBackground}
            onEditorInspection={section === "visual" || previewMotion === "design" ? handleEditorInspection : undefined}
          />
        </div>
      </div>
    </div>
  );
  return (
    <div className="native-theme-editor compatible-theme-editor">
      <ThemeEditorHeader dirty={dirty} saving={saving} document={document} description={uiText("compatibleThemeEditor.description", { label: getThemeModeDefinition(document.mode).label })} onBack={onBack} onEditMetadata={onEditMetadata} onApply={onApply} applyLabel={applyLabel} applyTargets={applyTargets} draftStatus={draftStatus} onRetryDraft={onRetryDraft} onSaveAs={onSaveAs} onRestore={onRestore} />
      <ThemeEditorTabs section={section} onChange={(value) => { setSection(value); setEditorInspection(null); if (value !== "visual") setRevealPart(null); }} />
      <ThemeEditorContent section={section}>
        {section === "basic" ? (
          <div className="native-theme-basic">
            {basicControls ?? (
              <section className="native-editor-section">
                <header>
                  <h3><SettingsIcon name="mode" />{uiText("compatibleThemeEditor.CompatibleThemeEditor")}</h3>
                  <p>{uiText("compatibleThemeEditor.CompatibleThemeEditor2")}</p>
                </header>
              </section>
            )}
          </div>
        ) : section === "visual" ? (
          <div className="native-visual-editor">
            {document.mode !== "laplace" && (Object.keys(model.light).length > 0 || Object.keys(model.dark).length > 0) && <p role="status">{uiText("compatibleThemeEditor.CompatibleThemeEditor3")}</p>}
            <ThemeVisualScope summary={`${eventOptions.find(option=>option.value===selection.event)?.label??selection.event} · ${identityOptions.find(option=>option.value===selection.identity)?.label??selection.identity}`}><div className="native-scope-strip">{globalScope ? <div className="native-global-scope"><span>{uiText("compatibleThemeEditor.CompatibleThemeEditor4")}</span><strong>{uiText("compatibleThemeEditor.CompatibleThemeEditor5")}</strong><div className="native-scope-setting native-edit-scheme"><span>{uiText("compatibleThemeEditor.CompatibleThemeEditor6")}</span>{document.mode !== "laplace" ? <strong className="native-fixed-scheme">{uiText("compatibleThemeEditor.CompatibleThemeEditor7")}</strong> : <UiSelect ariaLabel={uiText("compatibleThemeEditor.ariaLabel2")} value={editScheme} onValueChange={(next) => setEditScheme(next as NativeVisualScheme)} options={document.mode === "laplace" ? [{ value: "common", label: uiText("compatibleThemeEditor.options.label3") }, { value: "light", label: uiText("common.light") }, { value: "dark", label: uiText("common.dark") }] : [{ value: "common", label: uiText("compatibleThemeEditor.options.label3") }]} />}</div>{priorityControl}</div> : <>
              <div className="native-scope-compact">
                <div className="native-scope-setting"><span>{uiText("compatibleThemeEditor.CompatibleThemeEditor8")}</span><UiSelect ariaLabel={uiText("compatibleThemeEditor.ariaLabel3")} value={selection.event} options={eventOptions} onValueChange={event=>setSelection(current=>({...current,event}))} /></div>
                <div className="native-scope-setting"><span>{uiText("compatibleThemeEditor.CompatibleThemeEditor6")}</span>{document.mode !== "laplace" ? <strong className="native-fixed-scheme">{uiText("compatibleThemeEditor.CompatibleThemeEditor7")}</strong> : <UiSelect ariaLabel={uiText("compatibleThemeEditor.ariaLabel2")} value={editScheme} onValueChange={next=>setEditScheme(next as NativeVisualScheme)} options={[{value:"common",label:uiText("compatibleThemeEditor.options.label3")},{value:"light",label:uiText("common.light")},{value:"dark",label:uiText("common.dark")}]} />}</div>
                <div className="native-scope-setting"><span>{uiText("compatibleThemeEditor.CompatibleThemeEditor9")}</span><UiSelect ariaLabel={uiText("compatibleThemeEditor.ariaLabel4")} value={selection.identity} options={identityOptions} onValueChange={identity=>setSelection(current=>({...current,identity}))} /></div>
                {priorityControl}
              </div>
              <div className="native-event-scope-primary"><span>{uiText("compatibleThemeEditor.CompatibleThemeEditor8")}</span><button type="button" className={selection.event === "all" ? "is-active" : ""} onClick={() => setSelection(current => ({ ...current, event: "all" }))}>{uiText("compatibleThemeEditor.CompatibleThemeEditor10")}</button>{eventScopes.map(scope => <button type="button" className={activeEventScope?.id === scope.id ? "is-active" : ""} onClick={() => setSelection(current => ({ ...current, event: scope.id }))} key={scope.id}>{scope.label}</button>)}<div className="native-scope-setting native-edit-scheme"><span>{uiText("compatibleThemeEditor.CompatibleThemeEditor6")}</span>{document.mode !== "laplace" ? <strong className="native-fixed-scheme">{uiText("compatibleThemeEditor.CompatibleThemeEditor7")}</strong> : <UiSelect ariaLabel={uiText("compatibleThemeEditor.ariaLabel2")} value={editScheme} onValueChange={(next) => setEditScheme(next as NativeVisualScheme)} options={document.mode === "laplace" ? [{ value: "common", label: uiText("compatibleThemeEditor.options.label3") }, { value: "light", label: uiText("common.light") }, { value: "dark", label: uiText("common.dark") }] : [{ value: "common", label: uiText("compatibleThemeEditor.options.label3") }]} />}</div></div>
              {(activeEventScope?.children?.length ?? 0) > 0 && <div className="native-event-scope-children"><span>{uiText("compatibleThemeEditor.CompatibleThemeEditor11")}</span>{activeEventScope?.children?.map(child => <button type="button" className={selection.event === child.id ? "is-active" : ""} onClick={() => setSelection(current => ({ ...current, event: child.id }))} key={child.id}>{child.label}</button>)}</div>}
              <div className="native-identity-scope"><span>{uiText("compatibleThemeEditor.CompatibleThemeEditor9")}</span>{identityOptions.map(option => <button type="button" className={selection.identity === option.value ? "is-active" : ""} onClick={() => setSelection(current => ({ ...current, identity: option.value }))} key={option.value}>{option.label}</button>)}{priorityControl}</div>
</>}</div></ThemeVisualScope>
            <div className="native-visual-body native-visual-layout">
              <ThemeVisualNavigation groups={navigationGroups.map(group=>({...group,items:navigationNodes(group.items)}))} />
              <ThemeVisualPropertyPanel imageTarget={{root:previewCanvasNode,selector:compatibleSelectorFor(capability,`${selection.event}|${selection.identity}|${selection.placement??'main'}|${selection.part==='avatarFrame'?'avatarWrap':selection.part}`,editScheme)??''}} title={part?.label ?? selection.part} context={[...(globalScope ? [{label:uiText("compatibleThemeEditor.context.label"),value:uiText("compatibleThemeEditor.context.value")}] : [{label:uiText("compatibleThemeEditor.context.label2"),value:eventOptions.find(option=>option.value===selection.event)?.label??selection.event},{label:uiText("compatibleThemeEditor.context.label3"),value:identityOptions.find(option=>option.value===selection.identity)?.label??selection.identity}]),{label:uiText("compatibleThemeEditor.context.label4"),value:activeNavigation?.path.join(" / ")??part?.label??selection.part,path:true},{label:uiText("compatibleThemeEditor.context.label5"),value:editScheme==="common"?uiText("compatibleThemeEditor.context.value2"):editScheme==="light"?uiText("common.light"):uiText("common.dark")}]} canRestore={Boolean(settings.imageDecorations?.[`${editScheme}|${selection.event}|${selection.identity}|${selection.placement ?? "main"}|${selection.part}`] || model[editScheme][`${selection.event}|${selection.identity}|${selection.placement ?? "main"}|${selection.part}`] || settings.visualAuthored?.[editScheme]?.[`${selection.event}|${selection.identity}|${selection.placement ?? "main"}|${selection.part}`])} onRestore={restoreCurrentTarget}>
                {applicable && !part?.properties.includes("fontFamily") && ["event", "allEvents", "contentArea", "body", "card", "cardHeader", "cardHeaderContent"].includes(selection.part) && <div className="native-text-edit-links"><span>{uiText("compatibleThemeEditor.CompatibleThemeEditor12")}</span>{[["username", uiText("compatibleThemeEditor.CompatibleThemeEditor13")], ["message", uiText("compatibleThemeEditor.CompatibleThemeEditor14")]].filter(([id]) => capability.parts[id]?.properties.includes("fontFamily")).map(([id, label]) => <button type="button" key={id} onClick={() => { setSelection(current => ({ ...current, part: id, eventId: undefined })); setRevealPart(id); }}>{label}</button>)}</div>}
                {currentInspection&&Object.values(currentInspection.computed).some(value=>value?.applicable===false)&&<p role="status">{uiText("compatibleThemeEditor.CompatibleThemeEditor15")}</p>}
                {!applicable && <p role="status">{uiText("compatibleThemeEditor.CompatibleThemeEditor16")}</p>}
                {applicable&&<ThemeDecorationField inherited={!Object.prototype.hasOwnProperty.call(settings.imageDecorations??{},`${editScheme}|${selection.event}|${selection.identity}|${selection.placement??'main'}|${selection.part}`)} onPreviewInherit={()=>setTransientImages(clearThemeImageDecorations(settings.imageDecorations,`${editScheme}|${selection.event}|${selection.identity}|${selection.placement??'main'}|${selection.part}`))} scale={document.mode==="laplace"?{variable:"--event-base-size",value:Number(settings.baseFontSize)||20}:document.mode==="blivechat"?{variable:"--blc-g",value:Number(settings.globalScale)||1}:undefined} avatarFrame={selection.part==='avatarFrame'} root={previewCanvasNode} selector={compatibleSelectorFor(capability,`${selection.event}|${selection.identity}|${selection.placement??'main'}|${selection.part==='avatarFrame'?'avatarWrap':selection.part}`,editScheme)??''} images={resolveThemeImageDecorations(settings.imageDecorations,`${editScheme}|${selection.event}|${selection.identity}|${selection.placement??'main'}|${selection.part}`,imageEventParents(selection.event,capability.eventGroups))} onInherit={()=>onSettingsChange({...settings,imageDecorations:clearThemeImageDecorations(settings.imageDecorations,`${editScheme}|${selection.event}|${selection.identity}|${selection.placement??'main'}|${selection.part}`)})} onPreviewCancel={()=>setTransientImages(null)} onPreviewChange={images=>setTransientImages({...settings.imageDecorations,[`${editScheme}|${selection.event}|${selection.identity}|${selection.placement??'main'}|${selection.part}`]:images})} onChange={images=>onSettingsChange({...settings,imageDecorations:{...settings.imageDecorations,[`${editScheme}|${selection.event}|${selection.identity}|${selection.placement??'main'}|${selection.part}`]:images}})}/>}
                <div className="native-property-sections">{(selection.part==="avatarFrame"?[]:propertyGroups).map((group) => <details key={group.id} open={expandedPropertyGroups.has(group.id)}><summary onClick={(event) => { event.preventDefault(); setExpandedPropertyGroups((current) => { const next = new Set(current); next.has(group.id) ? next.delete(group.id) : next.add(group.id); return next; }); }}><SettingsIcon name={group.id === "display" ? "visibility" : group.id} />{group.label}</summary><div className="native-property-grid">{group.properties.map(renderControl)}</div></details>)}</div>
              </ThemeVisualPropertyPanel>
            </div>
          </div>
        ) : (
          <ThemeAdvancedEditorBoundary onReturn={() => setSection("basic")}><Suspense
            fallback={
              <div className="theme-editor-empty">{uiText("compatibleThemeEditor.fallback")}</div>
            }
          >
            {advancedControls}
            <NativeThemeAdvancedEditor
              document={document}
              visualCss={visualCss}
              customCss={customCss}
              cssMessage={cssMessage}
              cssMessageKind={cssMessageKind}
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
      {previewTarget && createPortal(preview, previewTarget)}
      {previewHeaderTarget &&
        createPortal(
          <StylePreviewActions/>,
          previewHeaderTarget,
        )}
    </div>
  );
}
