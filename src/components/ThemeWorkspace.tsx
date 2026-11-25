import { useUiLanguage } from "../i18n/react.ts";
import { localized, uiText, UiMessageError } from "../i18n/index.ts";
import { captureThemeDraft, createThemeDraftStore } from "../themes/themeDraftStore.ts";
import { ThemeImageAssetsContext } from "./ThemeImageAssets.tsx";
import { SettingsChoiceControl } from "./SettingsChoiceControl";
import { ChevronLeft as LucideChevronLeft, Pencil, Check, ChevronDown } from "lucide-react";
import { getSettingsIcon } from "./SettingsIcon.tsx";
import { ThemeActionMenu } from "./ThemeActionMenu.tsx";
import { UiSearchInput } from "./ui/SearchInput.tsx";
import { compareThemes } from '../themes/themeIndex.ts';
import { themePriceGradient } from '../themes/nativePriceGradient.ts';
import { reverseSyncPriceGradientCss } from '../themes/nativePriceGradientCss.ts';
import { bindUiDismissableLayer } from "./ui/layer";
import { createObsConfigurationId } from "../obs/obsConfigurationIdentity.ts";
import { WorkspaceNotice } from "./WorkspaceNotice.tsx";
import {routeThemeRemoteUrls} from "../themes/themeRemoteCss.ts";
import { invokeThemeCommand as invoke } from "../themes/themeCommand.ts";
import { localizeThemeResources, themeDependencyLoader } from "../themes/themeResourceDependencies.ts";
import { formatThemeTimestamp } from "../themes/themeDate.ts";
import { readThemePackageFile, writeThemePackageFile } from "../themes/themePackageFiles.ts";
import { ThemeMetadataDetails } from "./ThemeMetadataDetails.tsx";
import { ThemeCreateDialog, ThemeImportDialog } from "./ThemeImportDialog.tsx";
import { closeNativeStylePreviewWindow } from "../windows/nativeStylePreviewBridge.ts";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { open, save as saveFile } from "@tauri-apps/plugin-dialog";
import { NativeThemeEditor } from "./NativeThemeEditor.tsx";
import { CompatibleThemeEditor } from "./CompatibleThemeEditor.tsx";
import { CompatibleThemeThumbnail, getCompatibleThemeEditingSurface } from "./CompatibleThemePreview.tsx";
import "../compat/blivechat/register.tsx";
import "../compat/laplace/register.tsx";
import { NativeThemeThumbnail } from "./NativeThemeThumbnail.tsx";
import { createThemeRepository, tauriThemeStoragePort } from "../themes/themeRepository.ts";
import { resolveCatalogRuntimeAssets } from "../themes/builtinThemeCatalog.ts";
import { createThemeSessionHost, subscribeThemeRepositoryChanges, type ThemeEditorSession } from "../themes/themeEditorSession.ts";
import { getRevenueWindowSelection, subscribeRevenueWindowSelection } from "../windows/giftBridge.ts";
import { saveWindowThemeMode, useWindowThemeSettings } from "../themes/windowThemeSettings.ts";
import { windowThemeTargets, windowThemeLabel, type WindowThemeMode } from "../themes/windowThemeTargets.ts";
import { loadThemeBindings } from "../themes/themeBindings.ts";
import type { ThemeBinding } from "../themes/themeBindings.ts";
import { listThemeReferences, ThemeReferenceUpdateError, retryThemeReferences, saveAndUpdateThemeReferences } from "../themes/themeReferences.ts";
import type { EventDisplayPreferences } from "../eventDisplaySettings.ts";
import { permissionsForOrigin, type ThemeDocument, type ThemeSummary, type ThemeTarget } from "../themes/themeTypes.ts";
import { exportThemeDocumentBytesAsync, importThemeEntriesBytesAsync, zipEntriesBytesAsync } from "../themes/themeTransfer.ts";
import { addThemeAsset, resolveThemeAssetUrls, inlineThemeAssetUrls, applyThemeAssetUrls, readThemeAssetDraft, removeThemeAsset } from "../themes/themeAssets.ts";
import { normalizeNativeVisualModel, type NativeThemeSettings } from "../themes/nativeComponentAppearance.ts";
import type { NativeThemeProjection } from "../themes/nativeThemeProjection.ts";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { UiSelect } from "./ui/Select.tsx";
import "./themeWorkspace.css";
import type { NativeThemeCssExportScope } from "../themes/themeCssExport.ts";
import { useConnection } from "../stores/connection.ts";
import type { NativePreviewGeometry } from "./nativePreviewGeometry.ts";
import { nativeObsConfigurationStore, obsThemeOptions, type NativeObsConfiguration } from "../obs/nativeObsConfigurations.ts";
import { reverseSyncNativeVisualCss } from "../themes/nativeCssReverseSync.ts";
import { patchManagedNativeCss } from "../themes/nativeManagedCss.ts";
import { patchCompatibleManagedCss } from "../themes/compatManagedCss.ts";
import { reverseSyncCompatibleCss } from "../themes/compatCssReverseSync.ts";
import type { CompatibleVisualSettings } from "../themes/compatThemeSettings.ts";
import { createThemeFromCss, installImportedThemePackage, type ThemeImportConflictAction } from "../themes/themeImport.ts";
import postcss from "postcss";
import { canApplyThemeMode, getThemeModeDefinition } from "../themes/themeModes.ts";
import { commitObsConfiguration, deleteObsConfiguration as deleteObsConfigurationTransaction, ObsConfigurationDeleteError, themeSaveErrorMessage } from "../themes/themeWorkspaceTransactions.ts";
import { createBuiltinThemes, getThemeModeAdapter, resolvePublishedThemeMode, resolveRegisteredBuiltinThemeId } from "../themes/themeModeAdapters.ts";
import { ObsManagementPreview } from "../obs/ObsManagementPreview.tsx";
import { ObsServiceSettings } from "../obs/ObsServiceSettings.tsx";
import { obsOutputUrl, obsServiceStatus, refreshObsConfigurations } from "../obs/obsService.ts";
import { openUrl } from "@tauri-apps/plugin-opener";
import { createStylePreviewEvents } from "./stylePreviewEvents.ts";
import { loadRemoteCss } from "../compat/laplace/styleLoader.ts";
import { confirmLaplaceRemoteTheme, createLaplaceRemoteSourceCoordinator, createLaplaceRemoteTheme, createLaplaceSavedCopy, updateLaplaceRemoteTheme } from "../themes/laplaceThemeSources.ts";
import { normalizeBlivechatExternalHtmlUrl } from "../compat/blivechat/externalHtmlBridge.ts";
import { BlivechatExternalHtmlSurface } from "../compat/blivechat/BlivechatExternalHtmlSurface.tsx";

const builtinThemes = createBuiltinThemes();
const repository = createThemeRepository(tauriThemeStoragePort, builtinThemes);
const defaultThemeId = (target: ThemeTarget) => resolveRegisteredBuiltinThemeId(builtinThemes, target) ?? "";
const sessionHost = createThemeSessionHost(repository);
let themeDraftStore: ReturnType<typeof createThemeDraftStore> | undefined;
const drafts = () => themeDraftStore ??= createThemeDraftStore();
function prepareEditorSession(session: ThemeEditorSession): ThemeEditorSession {
  if (!session.visualCssInitialized) {
    sessionHost.initializeThemeVisualCss(session, getThemeModeAdapter(session.document.mode).initializeVisualCss(session.document));
  }
  return session;
}
const resolveThemeAssets = async (document: ThemeDocument, changes: Record<string, Uint8Array | null> = {}, publish = false, preparation: {signal?:AbortSignal;onProgress?:(completed:number)=>void} = {}) => {
  if(publish) document=(await localizeThemeResources(document,document.metadata.resourceBaseUrl||document.metadata.sourceUrl||"file:///theme.css",themeDependencyLoader(false,preparation.signal,preparation.onProgress),"apply")).document;
  const urls = await resolveCatalogRuntimeAssets(document, changes, path => readThemeAssetDraft(path, changes, savedPath => repository.readThemeAsset(document.themeId, savedPath)));
  const localAssets=document.assets.filter(a=>!a.sharedResourceId&&!a.cacheResourceId&&!/^https?:/i.test(a.sourceUrl??""));
  if (publish && localAssets.length) {
    const frozen = await invoke<Record<string,{id:string;name:string}>>("freeze_theme_resources", {document:{...document,assets:localAssets}});
    const status = await obsServiceStatus();
    for (const [path,asset] of Object.entries(frozen)) urls.set(path, `http://127.0.0.1:${status.port}/theme-resources/published/${asset.id}/${encodeURIComponent(asset.name)}`);
  }
  const resolved = applyThemeAssetUrls(document, urls);
  return routeThemeRemoteUrls(resolved, `http://127.0.0.1:${(await obsServiceStatus()).port}`);
};
const resolveSavedThemeForObsPreview = async (themeId: string) => resolveThemeAssets(await repository.loadThemeDocument(themeId));
const THEME_CATEGORIES = localized(() => ([["all", uiText("themeWorkspace.THEME_CATEGORIES")], ["native", uiText("themeWorkspace.THEME_CATEGORIES2")], ["blivechat", uiText("themeWorkspace.THEME_CATEGORIES3")], ["blivechat-open", uiText("themeWorkspace.THEME_CATEGORIES4")], ["laplace", "LAPLACE"]] as const));
type ThemeCategory = typeof THEME_CATEGORIES[number][0];
type ObsDraft = NativeObsConfiguration;
type ThemeInfoDraft = { mode: "save" | "rename" | "edit"; name: string; author: string; version: string; target?: ThemeSummary };

const THEME_ASSET_ERROR_KEYS = new Set<string>(["themeAssets.readThemeAssetDraft", "themeTransfer.exportThemeDocumentBytes", "themeTransfer.exportThemeDocumentBytesAsync", "themeResourceDependencies.checkSignal", "themeResourceDependencies.localizeThemeResources.register"]);

function themeTargetIcon(targetId: string) {
  const kind = targetId.split(":")[1];
  return getSettingsIcon(targetId === "live" ? "live" : targetId === "windows" ? "windows" : kind === "display" ? "chatWindow" : kind === "gift" ? "revenueWindow" : kind === "gift-only" ? "gift" : kind ?? "windows");
}

function ThemeModeThumbnail(props: Parameters<typeof NativeThemeThumbnail>[0] & { mode: ThemeDocument["mode"] }) {
  useUiLanguage();
  if (getThemeModeAdapter(props.mode).thumbnail === "native") {
    const { mode: _mode, ...nativeProps } = props;
    return <NativeThemeThumbnail {...nativeProps} />;
  }
  if (props.mode !== "native") return <CompatibleThemeThumbnail mode={props.mode} themeId={props.themeId} revision={props.revision} load={props.load} />;
  return <div className="theme-library-thumbnail is-error" aria-label={uiText("themeWorkspace.aria_label", { label: getThemeModeDefinition(props.mode).label })}><span>{getThemeModeDefinition(props.mode).label}<small>{uiText("themeWorkspace.ThemeModeThumbnail")}</small></span></div>;
}

function ChevronLeftIcon() {
  return <LucideChevronLeft aria-hidden="true" width="16" height="16" />;
}



export function ThemeWorkspace({ active, displayPreferences, applyThemeProjection, previewTarget, previewHeaderTarget, previewGeometry, onEditingChange, onPreviewTitleChange, fontFamilyOptions, onOpenFonts }: {
  active: boolean;
  displayPreferences: EventDisplayPreferences;
  applyThemeProjection: (projection: NativeThemeProjection) => void;
  previewTarget: HTMLElement | null;
  previewHeaderTarget: HTMLElement | null;
  previewGeometry: NativePreviewGeometry | null;
  onEditingChange: (editing: boolean) => void;
  onPreviewTitleChange: (title: string) => void;
  fontFamilyOptions: string[];
  onOpenFonts: () => void;
}) {
  useUiLanguage();
  const [summaries, setSummaries] = useState<ThemeSummary[]>([]);
  // 会话由 sessionHost 持有，界面刷新只更换容器，不复制会话。
  const [{ session }, setSession] = useReducer(
    (_current: { session: ThemeEditorSession | null }, session: ThemeEditorSession | null) => ({ session }),
    { session: null },
  );
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const [editorPreviewDocument, setEditorPreviewDocument] = useState<{ source: ThemeDocument; resolved: ThemeDocument } | null>(null);
  const [view, setView] = useState<"home" | "editor" | "obs">("home");
  useEffect(()=>{if(!active)void closeNativeStylePreviewWindow();},[active]);
  const [themeCategory, setThemeCategory] = useState<ThemeCategory>("all");
  const [manageMode, setManageMode] = useState(false);
  const [selectedThemeIds, setSelectedThemeIds] = useState<Set<string>>(new Set());
  const [deleteSelectionOpen, setDeleteSelectionOpen] = useState(false);
  const [restoreScope, setRestoreScope] = useState<string | null>(null);
  const [obsDrafts, setObsDrafts] = useState<ObsDraft[]>([]);
  const namedObsDrafts = useRef(new Set<string>());
  const persistedObsConfigurations = useRef(new Map<string, ObsDraft>());
  const [selectedObsId, setSelectedObsId] = useState<string | null>(null);
  const [deleteObsOpen, setDeleteObsOpen] = useState(false);
  const [obsAnchorOpen, setObsAnchorOpen] = useState(false);
  const [savingObs, setSavingObs] = useState(false);
  const [savingThemes, setSavingThemes] = useState<ReadonlySet<string>>(new Set());
  const anchors = useConnection(state => state.anchors);
  useEffect(()=>{
    setObsDrafts(current=>{
      let changed=false;
      const next=current.map(item=>{
        if(persistedObsConfigurations.current.has(item.id)||namedObsDrafts.current.has(item.id)||!item.roomId)return item;
        const anchor=item.anchorName||anchors.find(anchor=>String(anchor.realRoomId)===item.roomId)?.uname||uiText("themeWorkspace.ThemeWorkspace.next.anchor", { roomId: item.roomId });
        const theme=summaries.find(theme=>theme.themeId===item.themeId)?.name;
        const name=theme?`${anchor} · ${theme}`:anchor;
        if(name===item.name)return item;
        changed=true;return {...item,name};
      });return changed?next:current;
    });
  },[obsDrafts,anchors,summaries]);
  const [appliedThemeIds, setAppliedThemeIds] = useState<Record<string, string>>({ live: defaultThemeId("live"), windows: defaultThemeId("windows"), obs: defaultThemeId("obs") });
  const [displayScales, setDisplayScales] = useState<Record<string, number>>({ live: 1, windows: 1 });
  const windowThemes = useWindowThemeSettings();
  const revenueSelection = useSyncExternalStore(subscribeRevenueWindowSelection, getRevenueWindowSelection);
  const [editorApplyTarget, setEditorApplyTarget] = useState<string | null>(null);
  const pendingApplyTarget = useRef<string | null>(null);
  const destinations = [{ id: "live", label: uiText("common.live") }, ...windowThemeTargets(windowThemes.mode, revenueSelection.mode)];
  const themeIdAt = (targetId: string) => appliedThemeIds[targetId] ?? appliedThemeIds.windows;
  const scaleAt = (targetId: string) => displayScales[targetId] ?? displayScales.windows ?? 1;
  const targetLabel = (targetId: string) => targetId === "live" ? uiText("common.live") : windowThemeLabel(targetId);
  useEffect(() => {
    setAppliedThemeIds(current => ({ ...current, ...Object.fromEntries(windowThemes.bindings.map(binding => [binding.targetId, binding.themeId])) }));
    setDisplayScales(current => ({ ...current, ...Object.fromEntries(windowThemes.bindings.map(binding => [binding.targetId, binding.displayScale ?? 1])) }));
  }, [windowThemes.bindings]);
  const changeWindowThemeMode = async (mode: WindowThemeMode) => {
    try { await saveWindowThemeMode(mode); }
    catch { setError(uiText("themeWorkspace.ThemeWorkspace.changeWindowThemeMode")); }
  };
  const [themeInfoDraft, setThemeInfoDraft] = useState<ThemeInfoDraft | null>(null);
  const savingThemeInfo = Boolean(session && themeInfoDraft?.mode === "save" && savingThemes.has(session.themeId));
  const [pendingApply, setPendingApply] = useState(false);
  const [applyingThemes, setApplyingThemes] = useState<ReadonlySet<string>>(new Set());
  const [draftStatus, setDraftStatus] = useState<"saving" | "saved" | "error">("saved");
  const [draftLoadError, setDraftLoadError] = useState(false);
  const [pendingDraftCleanup, setPendingDraftCleanup] = useState<string[]>([]);
  const draftWriteRevision = useRef(0);
  const [deleteTarget, setDeleteTarget] = useState<ThemeSummary | null>(null);
  const [notice, setNotice] = useState({ message: "", revision: 0 });
  const error = notice.message;
  const setError = useCallback((message: string) => {
    setNotice(current => ({ message, revision: current.revision + 1 }));
  }, []);
  useEffect(() => { const receive=(event:Event)=>setError((event as CustomEvent<string>).detail);window.addEventListener("style-workspace-notice",receive);return()=>window.removeEventListener("style-workspace-notice",receive); },[]);
  const [failedPublication, setFailedPublication] = useState<ThemeReferenceUpdateError | null>(null);
  const [retryingPublication, setRetryingPublication] = useState(false);
  const [externalThemeState, setExternalThemeState] = useState<"changed" | "deleted" | null>(null);
  const [reloadExternalOpen, setReloadExternalOpen] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [pendingImports, setPendingImports] = useState<Array<{ document: ThemeDocument; assets: Record<string, Uint8Array> }>>([]);
  const [resourceProgress,setResourceProgress]=useState<{label:string;completed:number}|null>(null);
  const resourceAbort=useRef<AbortController|null>(null);
  const withThemeResources=async<T,>(label:string,operation:(options:{signal:AbortSignal;onProgress:(completed:number)=>void})=>Promise<T>):Promise<T>=>{
    if(resourceAbort.current)throw new Error(uiText("themeWorkspace.ThemeWorkspace.withThemeResources"));
    const controller=new AbortController();resourceAbort.current=controller;setError("");setResourceProgress({label,completed:0});
    try{return await operation({signal:controller.signal,onProgress:completed=>setResourceProgress({label,completed})})}
    finally{resourceAbort.current=null;setResourceProgress(null)}
  };
  const completeThemePackage=async(document:ThemeDocument)=>withThemeResources(uiText("themeWorkspace.ThemeWorkspace.completeThemePackage"),async options=>{
    const complete=await localizeThemeResources(document,document.metadata.resourceBaseUrl||document.metadata.sourceUrl||"file:///theme.css",themeDependencyLoader(false,options.signal,options.onProgress));
    const status=await obsServiceStatus();
    const assets:Record<string,Uint8Array>={...complete.assets};
    for(const asset of complete.document.assets){
      if(options.signal.aborted)throw new Error(uiText("themeWorkspace.ThemeWorkspace.completeThemePackage2"));
      if(assets[asset.path])continue;
      const id=asset.cacheResourceId??asset.sharedResourceId;
      if(id){
        const response=await fetch(`http://127.0.0.1:${status.port}/theme-resources/${asset.cacheResourceId?"remote":"shared"}/${encodeURIComponent(id)}/${encodeURIComponent(asset.resourceFileName??asset.path.split("/").pop()!)}`,{signal:options.signal});
        if(!response.ok)throw new Error(uiText("themeWorkspace.ThemeWorkspace.completeThemePackage3", { name: asset.name }));
        assets[asset.path]=new Uint8Array(await response.arrayBuffer());
      }else assets[asset.path]=await repository.readThemeAsset(document.themeId,asset.path);
    }
    if(options.signal.aborted)throw new Error(uiText("themeWorkspace.ThemeWorkspace.completeThemePackage2"));
    const bytes=await exportThemeDocumentBytesAsync(complete.document,assets);
    if(options.signal.aborted)throw new Error(uiText("themeWorkspace.ThemeWorkspace.completeThemePackage2"));
    return bytes;
  });
  const [importResults, setImportResults] = useState<string[]>([]);
  useEffect(() => {
    if (!importResults.length || pendingImports.length) return;
    const failed=importResults.some(result=>!/已读取|已导入|已更新|已跳过/.test(result));
    setError(failed ? uiText("themeWorkspace.ThemeWorkspace") : uiText("themeWorkspace.ThemeWorkspace2"));
  }, [importResults,pendingImports.length]);
  const [importPanelOpen, setImportPanelOpen] = useState(false);
  const [createPanelOpen, setCreatePanelOpen] = useState(false);
  const [laplaceUrlDraft, setLaplaceUrlDraft] = useState<{ url: string; document: ThemeDocument | null; loading: boolean; error: string } | null>(null);
  const [laplaceReadyDocument, setLaplaceReadyDocument] = useState<ThemeDocument | null>(null);
  const laplacePreviewDocument = laplaceUrlDraft?.document;
  const loadLaplacePreviewDocument = useCallback(async () => {
    if (!laplacePreviewDocument) throw new Error(uiText("themeWorkspace.ThemeWorkspace.loadLaplacePreviewDocument"));
    return laplacePreviewDocument;
  }, [laplacePreviewDocument]);
  const laplacePreviewReady = useCallback(() => {
    setLaplaceReadyDocument(laplacePreviewDocument ?? null);
    setLaplaceUrlDraft(current => current && current.document === laplacePreviewDocument && current.error ? { ...current, error: "" } : current);
  }, [laplacePreviewDocument]);
  const laplacePreviewFailure = useCallback((message: string) => {
    setLaplaceReadyDocument(current => current === laplacePreviewDocument ? null : current);
    setLaplaceUrlDraft(current => current && current.document === laplacePreviewDocument && current.error !== message ? { ...current, error: message } : current);
  }, [laplacePreviewDocument]);
  const [blivechatHtmlDraft, setBlivechatHtmlDraft] = useState<{ url: string; document: ThemeDocument | null; loading: boolean; ready: boolean; error: string } | null>(null);
  const laplaceSourceCoordinatorRef = useRef<ReturnType<typeof createLaplaceRemoteSourceCoordinator> | null>(null);
  if (!laplaceSourceCoordinatorRef.current) laplaceSourceCoordinatorRef.current = createLaplaceRemoteSourceCoordinator(async url => { const loaded = await loadRemoteCss(url); return { css: loaded.css, metadata: loaded.metadata }; });
  const laplacePreviewGenerationRef = useRef(0);
  const blivechatPreviewGenerationRef = useRef(0);
  const pendingImport = pendingImports[0] ?? null;

  const removeDraftRecord = async (themeId: string) => {
    try {
      await drafts().remove(themeId);
      setPendingDraftCleanup(current => current.filter(id => id !== themeId));
      return true;
    } catch {
      setPendingDraftCleanup(current => [...new Set([...current, themeId])]);
      return false;
    }
  };
  const retryDraftCleanup = async () => {
    const result = await Promise.all(pendingDraftCleanup.map(removeDraftRecord));
    setError(result.every(Boolean) ? uiText("themeWorkspace.ThemeWorkspace.retryDraftCleanup") : uiText("themeWorkspace.ThemeWorkspace.retryDraftCleanup2"));
  };
  const persistDraft = async (current: ThemeEditorSession | null = sessionRef.current) => {
    if (!current) return;
    const revision = ++draftWriteRevision.current;
    setDraftStatus("saving");
    try {
      const snapshot = captureThemeDraft(current);
      if (snapshot.dirty) await drafts().write(snapshot); else await drafts().remove(snapshot.themeId);
      if (revision === draftWriteRevision.current) setDraftStatus("saved");
    } catch {
      if (revision === draftWriteRevision.current) {
        setDraftStatus("error");
        setError(uiText("themeWorkspace.ThemeWorkspace.persistDraft"));
      }
    }
  };
  useEffect(() => { if (session) void persistDraft(session); }, [session, session?.document, session?.saved, session?.assetChanges, session?.visualCssDraft, session?.customCssDraft, session?.visualCssError, session?.customCssError]);
  const restoreStoredDrafts = async () => {
    try { sessionHost.restoreThemeDrafts(await drafts().list()); setDraftLoadError(false); }
    catch { setDraftLoadError(true); setError(uiText("themeWorkspace.ThemeWorkspace.restoreStoredDrafts")); }
  };
  const refresh = async () => {
    try {
      const next = await repository.listThemeSummaries();
      setSummaries(next);
      const currentSession = sessionRef.current;
      if (currentSession?.persisted && currentSession.themeId !== deleteTarget?.themeId) {
        const checkedSession = { ...currentSession };
        const checkedDocument = currentSession.document;
        const state = await sessionHost.checkThemeSessionForExternalChange(checkedSession);
        if (sessionRef.current !== currentSession || currentSession.document !== checkedDocument) return next;
        if (state === "deleted") { setExternalThemeState("deleted"); setError(uiText("themeWorkspace.ThemeWorkspace.refresh")); }
        else if (state === "changed") { setExternalThemeState("changed"); setError(uiText("themeWorkspace.ThemeWorkspace.refresh2")); }
        else {
          if (state === "reloaded") {
            Object.assign(currentSession, checkedSession);
            setSession(prepareEditorSession(currentSession));
          }
          setExternalThemeState(null);
        }
      } else { setExternalThemeState(null); }
      return next;
    }
    catch { setError(uiText("themeWorkspace.ThemeWorkspace.refresh3")); }
    return [];
  };
  useEffect(() => {
    if (!active || initialized) return;
    setInitialized(true);
    void Promise.all([restoreStoredDrafts().then(refresh), nativeObsConfigurationStore.load().then(()=>loadThemeBindings())]).then(([, bindings]) => {
      setAppliedThemeIds(current => ({ ...current, ...Object.fromEntries(bindings.map(item => [item.targetId, item.themeId])) }));
      setDisplayScales(current => ({ ...current, ...Object.fromEntries(bindings.map(item => [item.targetId, item.displayScale ?? 1])) }));
    });
  }, [active, initialized]);
  useEffect(() => { if (active) void nativeObsConfigurationStore.load().then(items => { persistedObsConfigurations.current = new Map(items.map(item => [item.id, item])); setObsDrafts(items); setSelectedObsId(current => items.some(item => item.id === current) ? current : items[0]?.id ?? null); }); }, [active]);
  useEffect(() => {
    if (!active) return;
    const checkExternalTheme = () => { void refresh(); };
    return subscribeThemeRepositoryChanges(window, checkExternalTheme);
  }, [active, session?.themeId, session?.dirty, session?.saved.revision]);
  const draftSummaries = sessionHost.listDraftThemeSummaries();
  const draftThemeIds = new Set(draftSummaries.map(item => item.themeId));
  const librarySummaries = [...summaries, ...draftSummaries.filter(draft => !summaries.some(item => item.themeId === draft.themeId))].sort(compareThemes);
  const [themeSearch, setThemeSearch] = useState("");
  const visible = librarySummaries.filter(item => (themeCategory === "all" || item.mode === themeCategory) && `${item.name} ${item.author}`.toLocaleLowerCase().includes(themeSearch.trim().toLocaleLowerCase()));
  const selectableVisible = visible.filter(item => !draftThemeIds.has(item.themeId));
  const previewSessionAvailable = session !== null && getThemeModeAdapter(session.document.mode).rendererReady;
  useEffect(() => {
    const previewMode = active && view === "editor" && previewSessionAvailable ? "editor" : active && view === "obs" && selectedObsId ? "obs" : null;
    onEditingChange(previewMode !== null);
    onPreviewTitleChange(previewMode === "obs" ? uiText("themeWorkspace.ThemeWorkspace3") : uiText("themeWorkspace.ThemeWorkspace4"));
    return () => onEditingChange(false);
  }, [active, view, previewSessionAvailable, selectedObsId, onEditingChange, onPreviewTitleChange]);
  const editorAssetUrls = useMemo(() => {
    if (!session) return Promise.resolve(new Map<string, string>());
    const source = session.document;
    const changes = session.assetChanges;
    const read=(path:string)=>readThemeAssetDraft(path,changes,savedPath=>repository.readThemeAsset(source.themeId,savedPath));
    return Promise.all([resolveCatalogRuntimeAssets(source,changes,read),resolveThemeAssetUrls({...source,assets:source.assets.filter(asset=>asset.mediaType.startsWith("image/")&&!asset.sharedResourceId&&!asset.cacheResourceId&&!asset.sourceUrl)},read)]).then(([served,images])=>new Map([...served,...images]));
  }, [session?.themeId, session?.saved, session?.assetChanges]);
  const [assetPreviewUrls, setAssetPreviewUrls] = useState<ReadonlyMap<string,string>>(new Map());
  useEffect(() => {
    if (!session) { setEditorPreviewDocument(null); return; }
    const source = session.document;
    let disposed = false;
    void editorAssetUrls
      .then(async urls => {
        const status = await obsServiceStatus();
        const resolved = routeThemeRemoteUrls(applyThemeAssetUrls(source, urls), `http://127.0.0.1:${status.port}`);
        if (!disposed) { setAssetPreviewUrls(urls); setEditorPreviewDocument({ source, resolved }); }
      })
      .catch(() => { if (!disposed) setEditorPreviewDocument(null); });
    return () => { disposed = true; };
  }, [session?.document, editorAssetUrls]);

  const openTheme = async (themeId: string, targetId: string | null = null) => {
    setEditorApplyTarget(targetId);
    try {
      const opened = await sessionHost.openThemeSession(themeId);
      const external = opened.persisted ? await sessionHost.checkThemeSessionForExternalChange(opened) : "unchanged";
      setSession(prepareEditorSession(opened)); setView("editor");
      setExternalThemeState(external === "changed" ? "changed" : external === "deleted" ? "deleted" : null);
      setError(external === "changed" ? uiText("themeWorkspace.ThemeWorkspace.openTheme") : external === "deleted" ? uiText("themeWorkspace.ThemeWorkspace.openTheme2") : "");
    }
    catch (cause) { setError(cause instanceof UiMessageError && cause.messageKey === "themeRepository.createThemeRepository.loadThemeDocument" ? cause.message : uiText("themeWorkspace.ThemeWorkspace.openTheme3")); }
  };
  const updateSettings = (nextSettings: NativeThemeSettings) => {
    if (!session) return;
    const patchedCss = patchManagedNativeCss(
      session.visualCssValid,
      session.document.settings as NativeThemeSettings,
      nextSettings,
    );
    sessionHost.updateThemeDraft(session, document => ({ ...document, settings: nextSettings }));
    sessionHost.updateThemeVisualCssFromControls(session, patchedCss);
    setSession(session);
  };
  const updateCompatibleSettings = (nextSettings: CompatibleVisualSettings) => {
    if (!session) return;
    const surface = getCompatibleThemeEditingSurface(session.document.mode);
    if (!surface) return;
    const previousSettings = session.document.settings as CompatibleVisualSettings;
    const patchedCss = patchCompatibleManagedCss(
      session.visualCssValid,
      surface.capability,
      normalizeNativeVisualModel(previousSettings.visualModel),
      normalizeNativeVisualModel(nextSettings.visualModel),
    );
    sessionHost.updateThemeDraft(session, document => ({ ...document, settings: nextSettings }));
    sessionHost.updateThemeVisualCssFromControls(session, patchedCss);
    setSession(session);
  };
  const apply = async (targetId = editorApplyTarget, keepDraft = false) => {
    if (!session) return;
    if (!session.persisted) { pendingApplyTarget.current = targetId; setPendingApply(true); await save(); return; }
    const themeId = session.themeId;
    setApplyingThemes(current => new Set(current).add(themeId));
    try {
      if (!session.dirty && !keepDraft) {
        const external = await sessionHost.checkThemeSessionForExternalChange(session);
        if (external === "deleted") {
          setExternalThemeState("deleted");
          setError(uiText("themeWorkspace.ThemeWorkspace.apply"));
          return;
        }
        if (external === "reloaded") setSession(prepareEditorSession(session));
      }
      const savedDocument = session.dirty || keepDraft ? await save(keepDraft) : session.saved;
      if (!savedDocument) return;
      if (!session.dirty) {
        try { await drafts().remove(themeId); }
        catch { throw new Error(uiText("themeWorkspace.ThemeWorkspace.apply2")); }
      }
      const references = await loadThemeBindings();
      await saveAndUpdateThemeReferences(savedDocument, {save: async () => savedDocument, bindings: async () => references, publish: publishSavedReference});
      setFailedPublication(null);
      if (targetId) await publishToTarget(savedDocument, targetId);
      setError(targetId ? uiText("themeWorkspace.ThemeWorkspace.apply3", { value: targetLabel(targetId) }) : listThemeReferences(themeId, references).length ? uiText("themeWorkspace.ThemeWorkspace.apply4") : uiText("themeWorkspace.ThemeWorkspace.apply5"));
    } catch (cause) {
      if (cause instanceof ThemeReferenceUpdateError) setFailedPublication(cause);
      setError(themeSaveErrorMessage(cause, uiText("themeWorkspace.ThemeWorkspace.apply6")));
    } finally {
      setApplyingThemes(current => { const next = new Set(current); next.delete(themeId); return next; });
    }
  };
  const returnHome = () => {
    setEditorApplyTarget(null);
    setView("home");
  };
  const publishSavedReference = async (document: ThemeDocument, binding: ThemeBinding) => {
        const adapter = getThemeModeAdapter(document.mode);
        const room = binding.targetKind === "obs"
          ? (await nativeObsConfigurationStore.load()).find(item => item.id === binding.targetId)?.roomId
          : String(useConnection.getState().state.roomId ?? "");
        await adapter.publishTarget(await withThemeResources(uiText("themeWorkspace.ThemeWorkspace.publishSavedReference"), options => resolveThemeAssets(document, {}, true, options)), adapter.createRenderContext(binding, room), binding.targetKind === "live" ? applyThemeProjection : undefined);
      };
  const retryFailedPublication = async () => {
    if (!failedPublication || retryingPublication) return;
    setRetryingPublication(true);
    try {
      const skipped = await retryThemeReferences(failedPublication, { bindings: loadThemeBindings, publish: publishSavedReference });
      setFailedPublication(null);
      setError(skipped.length ? uiText("themeWorkspace.ThemeWorkspace.retryFailedPublication", { value: skipped.join("、") }) : uiText("themeWorkspace.ThemeWorkspace.retryFailedPublication2"));
      await refresh();
    } catch (cause) {
      if (cause instanceof ThemeReferenceUpdateError) setFailedPublication(cause);
      setError(cause instanceof Error ? cause.message : uiText("themeWorkspace.ThemeWorkspace.retryFailedPublication3"));
    } finally { setRetryingPublication(false); }
  };
  const save = async (keepDraft = false): Promise<ThemeDocument | null> => {
    if (!session) return null;
    if (!session.persisted) {
      setThemeInfoDraft({ mode: "save", name: session.persisted ? uiText("themeWorkspace.ThemeWorkspace.save.name", { name: session.document.metadata.name }) : session.document.metadata.name, author: session.document.metadata.author, version: session.document.metadata.version });
      return null;
    }
    const themeId = session.document.themeId;
    setSavingThemes(current => new Set(current).add(themeId));
    try {
    if (!keepDraft) {
      const external = await sessionHost.checkThemeSessionForExternalChange(session);
      if (external === "changed" || external === "deleted") {
        setExternalThemeState(external);
        setError(external === "changed" ? uiText("themeWorkspace.ThemeWorkspace.save") : uiText("themeWorkspace.ThemeWorkspace.save2"));
        return null;
      }
    }
    const savedDocument = (await sessionHost.saveThemeSession(session, keepDraft)).saved;
    setExternalThemeState(null);
    setSession(session);
    setFailedPublication(current => current?.saved.themeId === savedDocument.themeId ? null : current);

    await refresh();
    return savedDocument;
    } catch (cause) {
      if (cause instanceof ThemeReferenceUpdateError) { setFailedPublication(cause); setError(cause.message); setSession(session); await refresh(); return cause.saved; }
      setError(cause instanceof UiMessageError && cause.messageKey === "themes.fileConflict" ? uiText("themeWorkspace.ThemeWorkspace.save") : themeSaveErrorMessage(cause, uiText("themeWorkspace.ThemeWorkspace.save3")));
      if (cause instanceof UiMessageError && cause.messageKey === "themes.fileConflict") setExternalThemeState("changed");
      return null;
    } finally {
      setSavingThemes(current => { const next = new Set(current); next.delete(themeId); return next; });
    }
  };
  const restoreDefaults = async (scope: string) => {
    if (!session) return;
    try {
      const defaults = session.persisted ? await invoke<ThemeDocument | null>("read_theme_defaults", {themeId:session.themeId}) : session.saved;
      if (!defaults) throw new Error(uiText("themeWorkspace.ThemeWorkspace.restoreDefaults"));
      sessionHost.restoreThemeDraft(session, defaults, scope);
      setFailedPublication(current => current?.saved.themeId === session.themeId ? null : current);
      setError(uiText("themeWorkspace.ThemeWorkspace.restoreDefaults2"));
    } catch (cause) {
      if (cause instanceof ThemeReferenceUpdateError) setFailedPublication(cause);
      setError(cause instanceof Error ? cause.message : uiText("themeWorkspace.ThemeWorkspace.restoreDefaults3"));
    } finally { setRestoreScope(null); setSession(session); await refresh(); }
  };
  const reloadExternalTheme = async () => {
    if (!session) return;
    try { setSession(prepareEditorSession(await sessionHost.reloadThemeSession(session))); setExternalThemeState(null); setError(""); }
    catch { setError(uiText("themeWorkspace.ThemeWorkspace.reloadExternalTheme")); }
  };
  const saveAs = async () => {
    if (!session || !themeInfoDraft?.name.trim() || savingThemeInfo) return;
    const themeId = session.themeId;
    setSavingThemes(current => new Set(current).add(themeId));
    try {
      const saved = await sessionHost.saveThemeSessionAs(session, { name: themeInfoDraft.name.trim(), author: themeInfoDraft.author.trim(), version: themeInfoDraft.version.trim() });
      setThemeInfoDraft(null); setSession(saved); await refresh();
      const cleaned = session.persisted || await removeDraftRecord(themeId);
      if (!session.persisted) sessionHost.discardThemeSession(themeId);
      if (pendingApply && pendingApplyTarget.current) await publishToTarget(saved.saved, pendingApplyTarget.current);
      setPendingApply(false);
      setError(!cleaned ? uiText("themeWorkspace.ThemeWorkspace.saveAs") : pendingApply && pendingApplyTarget.current ? uiText("themeWorkspace.ThemeWorkspace.saveAs2", { value: targetLabel(pendingApplyTarget.current) }) : uiText("themeWorkspace.ThemeWorkspace.saveAs3"));
    } catch (cause) {
      setError(themeSaveErrorMessage(cause, uiText("themeWorkspace.ThemeWorkspace.saveAs4")));
    } finally {
      setSavingThemes(current => { const next = new Set(current); next.delete(themeId); return next; });
    }
  };
  const editThemeInfo = async () => {
    if (!session || !themeInfoDraft?.name.trim()) return;
    sessionHost.updateThemeDraft(session, document => ({ ...document, metadata: { ...document.metadata, name: themeInfoDraft.name.trim(), author: themeInfoDraft.author.trim(), version: themeInfoDraft.version.trim() } }));
    setSession(session);
    setThemeInfoDraft(null);
  };
  const deleteTheme = async () => {
    if (!deleteTarget) return;
    const references = listThemeReferences(deleteTarget.themeId, await loadThemeBindings());
    if (references.length) {
      setError(uiText("themeWorkspace.ThemeWorkspace.deleteTheme", { name: deleteTarget.name, value: references.map(item => item.label).join("、") }));
      setDeleteTarget(null);
      return;
    }
    if (!sessionHost.getDraftThemeDocument(deleteTarget.themeId)) await repository.deleteCustomTheme(deleteTarget.themeId);
    sessionHost.discardThemeSession(deleteTarget.themeId);
    const cleaned = await removeDraftRecord(deleteTarget.themeId);
    if (session?.themeId === deleteTarget.themeId) setSession(null);
    setDeleteTarget(null); await refresh(); setError(cleaned ? uiText("themeWorkspace.ThemeWorkspace.deleteTheme2") : uiText("themeWorkspace.ThemeWorkspace.deleteTheme3"));
  };
  const updateCustomCss = (customCss: string) => {
    if (!session) return;
    sessionHost.updateThemeCustomCssDraft(session, customCss, css => {
      if (!css.trim()) return null;
      try { postcss.parse(css); return null; }
      catch (cause) { return cause instanceof Error ? cause.message : uiText("themeWorkspace.ThemeWorkspace.updateCustomCss"); }
    });
    setSession(session);
  };
  const updateVisualCss = (visualCss: string): string => {
    if (!session) return uiText("themeWorkspace.ThemeWorkspace.updateVisualCss");
    const outcome = sessionHost.updateThemeVisualCssDraft(session, visualCss, document => {
      const compatibleSurface = document.mode === "native" ? undefined : getCompatibleThemeEditingSurface(document.mode);
      if (compatibleSurface) {
        const settings = document.settings as CompatibleVisualSettings;
        const result = reverseSyncCompatibleCss(visualCss, compatibleSurface.capability, settings.visualModel ?? {}, settings.visualAuthored);
        if (result.error) return { error: result.error };
        return {
          document: { ...document, settings: { ...settings, visualModel: result.model, visualAuthored: result.authored }, styles: { ...document.styles, visualCss: result.unmanagedCss } },
          diagnostics: result.diagnostics,
        };
      }
      const settings = document.settings as NativeThemeSettings;
      let price;
      try { price = reverseSyncPriceGradientCss(visualCss, themePriceGradient(settings.priceGradient, document.styles.baseCss), settings.display.usePriceGradient); }
      catch (cause) { return { error: cause instanceof Error ? cause.message : uiText("themeWorkspace.updateVisualCss.outcome.error") }; }
      const result = reverseSyncNativeVisualCss(price.css, settings.visualModel ?? {}, { display: settings.display });
      if (result.error) return { error: result.error };
      return {
        document: { ...document, settings: { ...settings, visualModel: result.model, ...(price.model ? { priceGradient: price.model } : {}) }, styles: { ...document.styles, visualCss: result.unmanagedCss } },
        diagnostics: result.diagnostics,
        cssControlled: result.cssControlled,
      };
    });
    setSession(session);
    if (outcome.error) return outcome.error;
    return outcome.diagnostics?.length ? uiText("themeWorkspace.ThemeWorkspace.updateVisualCss2", { value: outcome.diagnostics.join("；") }) : "";
  };
  const importTheme = async (paths: string[]) => {
    setError("");
    const knownThemeIds = new Set(summaries.map(item => item.themeId));
    const conflicts: Array<{ document: ThemeDocument; assets: Record<string, Uint8Array> }> = [];
    const results: string[] = [];
    for (const path of paths) {
      const pathParts = path.split(/[\\/]/);
      const fileName = pathParts[pathParts.length - 1] ?? path;
      try {
        const entries = await importThemeEntriesBytesAsync(await readThemePackageFile(path));
        for (const entry of entries) {
        if (!entry.value) { results.push(`${entry.name || fileName}：${entry.error}`); continue; }
        const importedPackage = entry.value;
        const imported = importedPackage.document;
        const importedAt = formatThemeTimestamp();
        const document = { ...imported, metadata: { ...imported.metadata, importedAt, localModifiedAt: importedAt }, origin: "custom" as const, permissions: permissionsForOrigin("custom") };
        conflicts.push({ document, assets: importedPackage.assets });
        results.push(uiText("themeWorkspace.ThemeWorkspace.importTheme", { fileName: fileName, value: knownThemeIds.has(document.themeId) ? uiText("themeWorkspace.ThemeWorkspace.importTheme.value") : "" }));
      }
      } catch (cause) { results.push(`${fileName}：${cause instanceof Error ? cause.message : uiText("themeWorkspace.ThemeWorkspace.importTheme2")}`); }
      }
    setImportResults(results);
    setPendingImports(current => [...current, ...conflicts]);
    await refresh();
  };
  const installImportedTheme = async (document: ThemeDocument, assets: Record<string, Uint8Array>, action: ThemeImportConflictAction = "update", consumeConflict = true, refreshAfter = true) => {
    await installImportedThemePackage({ document, assets }, {
      load: themeId => repository.loadThemeDocument(themeId),
      save: (next, options) => repository.saveThemeDocument(next, options),
      discardSession: themeId => sessionHost.discardThemeSession(themeId, true),
      createId: () => crypto.randomUUID(),
    }, action);
    setError("");
    if (consumeConflict) setPendingImports(current => current.slice(1));
    if (refreshAfter) await refresh();
    if (action === "update") setError(uiText("themeWorkspace.ThemeWorkspace.installImportedTheme"));
  };
  const importCss = async (mode: ThemeDocument["mode"], path: string, name: string, signal?: AbortSignal) => {
    let css: string;
    try {
      css = new TextDecoder().decode(await readThemePackageFile(path));
    } catch { throw new Error(uiText("themeWorkspace.ThemeWorkspace.importCss")); }
    let document: ThemeDocument;
    try {
      document = createThemeFromCss({ themeId: crypto.randomUUID(), mode, name, css, importedAt: formatThemeTimestamp() });
    } catch { throw new Error(uiText("themeWorkspace.ThemeWorkspace.importCss2")); }
    const fileUrl = new URL(`file:///${path.replace(/\\/g, "/")}`).href;
    const localized = await localizeThemeResources(document, fileUrl, themeDependencyLoader(false,signal),"preserve");
    await installImportedTheme(localized.document, localized.assets, "update");
  };
  const previewLaplaceUrl = async () => {
    if (!laplaceUrlDraft?.url.trim()) return;
    const generation = ++laplacePreviewGenerationRef.current;
    const url = laplaceUrlDraft.url.trim();
    setLaplaceUrlDraft(current => current ? { ...current, loading: true, error: "" } : current);
    try {
      const loaded = await laplaceSourceCoordinatorRef.current!.preview(url);
      if (loaded.url !== url || loaded.loading || loaded.error) throw new Error(loaded.error || uiText("themeWorkspace.ThemeWorkspace.previewLaplaceUrl"));
      const draft = createLaplaceRemoteTheme({ id: crypto.randomUUID(), url, css: loaded.css, metadata: loaded.metadata, fetchedAt: formatThemeTimestamp() });
      draft.styles.baseCss = loaded.css;
      const main = await invoke<{finalUrl:string}>("load_theme_resource",{url,refresh:false,css:true});
      const document = (await localizeThemeResources(draft, main.finalUrl, themeDependencyLoader(),"preserve")).document;
      if (generation === laplacePreviewGenerationRef.current) setLaplaceUrlDraft({ url, document, loading: false, error: "" });
    } catch (cause) {
      if (generation === laplacePreviewGenerationRef.current) setLaplaceUrlDraft(current => current ? { ...current, document: null, loading: false, error: cause instanceof Error ? cause.message : uiText("themeWorkspace.ThemeWorkspace.previewLaplaceUrl.error") } : current);
    }
  };
  const saveLaplaceUrlTheme = async () => {
    if (!laplaceUrlDraft?.document || laplaceReadyDocument !== laplaceUrlDraft.document) return;
    try {
      await confirmLaplaceRemoteTheme(laplaceUrlDraft.document.origin === "builtin" ? createLaplaceSavedCopy(laplaceUrlDraft.document) : laplaceUrlDraft.document, repository);
      setLaplaceUrlDraft(null);
      await refresh();
    } catch { setLaplaceUrlDraft(current => current ? { ...current, error: uiText("themeWorkspace.ThemeWorkspace.saveLaplaceUrlTheme.error") } : current); }
  };
  const previewBlivechatHtml = async () => {
    if (!blivechatHtmlDraft?.url.trim()) return;
    const generation = ++blivechatPreviewGenerationRef.current;
    setBlivechatHtmlDraft(current => current ? { ...current, loading: true, ready: false, error: "", document: null } : current);
    try {
      const url = normalizeBlivechatExternalHtmlUrl(blivechatHtmlDraft.url.trim());
      const base = getThemeModeAdapter("blivechat").createBuiltinTheme();
      const document: ThemeDocument = { ...structuredClone(base), themeId: crypto.randomUUID(), origin: "custom", permissions: permissionsForOrigin("custom"), metadata: { name: uiText("themeWorkspace.document.metadata.name"), author: "", version: "", updatedAt: "", sourceUrl: url, externalHtml: { url, sdk: "blivechat-1.0.1", verified: false } }, revision: 1 };
      if (generation === blivechatPreviewGenerationRef.current) setBlivechatHtmlDraft({ url, document, loading: true, ready: false, error: "" });
    } catch (cause) { if (generation === blivechatPreviewGenerationRef.current) setBlivechatHtmlDraft(current => current ? { ...current, loading: false, ready: false, error: cause instanceof Error ? cause.message : uiText("themeWorkspace.ThemeWorkspace.previewBlivechatHtml.error"), document: null } : current); }
  };
  const saveBlivechatHtmlTheme = async () => {
    if (!blivechatHtmlDraft?.document || !blivechatHtmlDraft.ready) return;
    try { await repository.saveThemeDocument(blivechatHtmlDraft.document); setBlivechatHtmlDraft(null); await refresh(); }
    catch { setBlivechatHtmlDraft(current => current ? { ...current, error: uiText("themeWorkspace.ThemeWorkspace.saveBlivechatHtmlTheme.error") } : current); }
  };
  const updateLaplaceUrlTheme = async (item: ThemeSummary) => {
    try {
      const current = await repository.loadThemeDocument(item.themeId);
      const result = await updateLaplaceRemoteTheme(current, async url => {
        const loaded = await loadRemoteCss(url, undefined, undefined, true);
        return { css: loaded.css, metadata: loaded.metadata, finalUrl:loaded.finalUrl };
      });
      if (result.error) { setError(uiText("themeWorkspace.ThemeWorkspace.updateLaplaceUrlTheme", { error: result.error })); return; }
      const main = await invoke<{finalUrl:string}>("load_theme_resource",{url:current.metadata.sourceUrl!,refresh:false,css:true});
      const localized = await localizeThemeResources(result.document, main.finalUrl, themeDependencyLoader(true),"preserve");
      await repository.saveThemeDocument(localized.document, {assetChanges:localized.assets,updateSource:true});
      sessionHost.discardThemeSession(current.themeId, true);
      await refresh();
      setError(uiText("themeWorkspace.ThemeWorkspace.updateLaplaceUrlTheme2"));
    } catch { setError(uiText("themeWorkspace.ThemeWorkspace.updateLaplaceUrlTheme3")); }
  };
  const createTheme = (mode: ThemeDocument["mode"]) => {
    setCreatePanelOpen(false);
    const base = getThemeModeAdapter(mode).createBuiltinTheme();
    const document: ThemeDocument = { ...structuredClone(base), themeId: crypto.randomUUID(), origin: "custom", permissions: permissionsForOrigin("custom"), metadata: { ...base.metadata, name: uiText("themeWorkspace.document.metadata.name2", { label: getThemeModeDefinition(mode).label }), author: "", version: "", updatedAt: formatThemeTimestamp() }, revision: 1 };
    setSession(prepareEditorSession(sessionHost.createNewThemeSession(document, base.themeId)));
    setView("editor");
  };
  const exportTheme = async (item: ThemeSummary) => {
    const path = await saveFile({ defaultPath: `${item.name}.zip`, filters: [{ name: uiText("themeWorkspace.path.filters.name"), extensions: ["zip"] }] });
    if (!path) return;
    try {
      const document = await repository.loadThemeDocument(item.themeId);
      await writeThemePackageFile(path, await completeThemePackage(document)); setError(uiText("themeWorkspace.ThemeWorkspace.exportTheme"));
    } catch (cause) { setError((cause instanceof Error && (cause.name === "AbortError" || cause.message === "aborted") || cause instanceof UiMessageError && cause.messageKey === "themeResourceDependencies.checkSignal") ? uiText("themeWorkspace.ThemeWorkspace.exportTheme2") : cause instanceof UiMessageError && THEME_ASSET_ERROR_KEYS.has(cause.messageKey) ? uiText("themeWorkspace.ThemeWorkspace.exportTheme3", { message: cause.message }) : uiText("themeWorkspace.ThemeWorkspace.exportTheme4")); }
  };
  const exportSelected = async () => {
    const selected = summaries.filter(item => selectedThemeIds.has(item.themeId));
    if (!selected.length) return;
    const path = await saveFile({ defaultPath: "主题合集.zip", filters: [{ name: uiText("themeWorkspace.path.filters.name2"), extensions: ["zip"] }] });
    if (!path) return;
    try {
      const entries: Record<string, Uint8Array> = {};
      for (const item of selected) {
        const document = await repository.loadThemeDocument(item.themeId);
        entries[`${item.name}-${item.themeId}.zip`] = await completeThemePackage(document);
      }
      await writeThemePackageFile(path, await zipEntriesBytesAsync(entries)); setError(uiText("themeWorkspace.ThemeWorkspace.exportSelected"));
    } catch (cause) { setError((cause instanceof Error && (cause.name === "AbortError" || cause.message === "aborted") || cause instanceof UiMessageError && cause.messageKey === "themeResourceDependencies.checkSignal") ? uiText("themeWorkspace.ThemeWorkspace.exportSelected2") : cause instanceof UiMessageError && THEME_ASSET_ERROR_KEYS.has(cause.messageKey) ? uiText("themeWorkspace.ThemeWorkspace.exportSelected3", { message: cause.message }) : uiText("themeWorkspace.ThemeWorkspace.exportSelected4")); }
  };
  const exportAll = async () => {
    const path = await saveFile({ defaultPath: "全部主题.zip", filters: [{ name: uiText("themeWorkspace.path.filters.name2"), extensions: ["zip"] }] });
    if (!path) return;
    try {
      const entries: Record<string, Uint8Array> = {};
      for (const item of summaries) {
        const document = await repository.loadThemeDocument(item.themeId);
        entries[`${item.name}-${item.themeId}.zip`] = await completeThemePackage(document);
      }
      await writeThemePackageFile(path, await zipEntriesBytesAsync(entries)); setError(uiText("themeWorkspace.ThemeWorkspace.exportAll"));
    } catch (cause) { setError((cause instanceof Error && (cause.name === "AbortError" || cause.message === "aborted") || cause instanceof UiMessageError && cause.messageKey === "themeResourceDependencies.checkSignal") ? uiText("themeWorkspace.ThemeWorkspace.exportAll2") : cause instanceof UiMessageError && THEME_ASSET_ERROR_KEYS.has(cause.messageKey) ? uiText("themeWorkspace.ThemeWorkspace.exportAll3", { message: cause.message }) : uiText("themeWorkspace.ThemeWorkspace.exportAll4")); }
  };
  const exportCss = async (scope: NativeThemeCssExportScope) => {
    if (!session) return;
    if (session.visualCssError || session.customCssError) { setError(uiText("themeWorkspace.ThemeWorkspace.exportCss")); return; }
    const suffix = { complete: "完整", "base-visual": "基础与可视化", visual: "可视化", custom: "自定义" }[scope];
    const path = await saveFile({ defaultPath: `${session.document.metadata.name}-${suffix}.css`, filters: [{ name: "CSS", extensions: ["css"] }] });
    if (!path) return;
    try {
      const local = {...session.document,assets:session.document.assets.filter(asset=>!asset.sourceUrl||!/^https?:/i.test(asset.sourceUrl))};
      const inlined = await inlineThemeAssetUrls(local, path => readThemeAssetDraft(path, session.assetChanges, savedPath => repository.readThemeAsset(session.document.themeId, savedPath)));
      const resolved = applyThemeAssetUrls(inlined,new Map(session.document.assets.filter(asset=>asset.sourceUrl&&/^https?:/i.test(asset.sourceUrl)).map(asset=>[asset.path,asset.sourceUrl!])));
      const bytes = new TextEncoder().encode(getThemeModeAdapter(session.document.mode).exportCss(resolved, scope));
      await writeThemePackageFile(path, bytes); setError(uiText("themeWorkspace.ThemeWorkspace.exportCss2"));
    } catch (cause) { setError((cause instanceof Error && (cause.name === "AbortError" || cause.message === "aborted") || cause instanceof UiMessageError && cause.messageKey === "themeResourceDependencies.checkSignal") ? uiText("themeWorkspace.ThemeWorkspace.exportCss3") : cause instanceof UiMessageError && THEME_ASSET_ERROR_KEYS.has(cause.messageKey) ? uiText("themeWorkspace.ThemeWorkspace.exportCss4", { message: cause.message }) : uiText("themeWorkspace.ThemeWorkspace.exportCss5")); }
  };
  const addAsset = async (replacementId?: string, imageOnly = false) => {
    if (!session) return;
    const replaced = session.document.assets.find(asset => asset.id === replacementId);
    const extensions = imageOnly ? ["png","apng","jpg","jpeg","webp","gif","svg"] : replaced ? replaced.mediaType.startsWith("image/") ? ["png","apng","jpg","jpeg","webp","gif","svg"] : ["woff","woff2","ttf","otf"] : ["png","apng","jpg","jpeg","webp","gif","svg","woff","woff2","ttf","otf"];
    const path = await open({ multiple: false, filters: [{ name: replaced ? replaced.mediaType.startsWith("image/") ? uiText("themeWorkspace.path.filters.name3") : uiText("common.font") : uiText("themeWorkspace.path.filters.name4"), extensions }] });
    if (!path) return;
    try {
      const fileName = path.split(/[\\/]/).pop() ?? "asset";
      const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
      const mediaType = ({ png: "image/png", apng: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml", woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf" } as Record<string, string>)[extension] ?? "application/octet-stream";
      const previous = session.document.assets.find(asset => asset.id === replacementId);
      if(previous && previous.mediaType.startsWith("image/") !== mediaType.startsWith("image/")) throw new Error(uiText("themeWorkspace.ThemeWorkspace.addAsset"));
      const next = previous ? {...session.document,assets:session.document.assets.map(asset => asset === previous ? {...asset,name:fileName,mediaType,sharedResourceId:undefined,cacheResourceId:undefined,sourceUrl:undefined,resourceFileName:undefined} : asset)} : addThemeAsset(session.document, { id: crypto.randomUUID(), name: fileName, fileName, mediaType });
      const asset = previous ? next.assets.find(asset => asset.id === previous.id)! : next.assets[next.assets.length - 1]!;
      const bytes = await readThemePackageFile(path);
      asset.size = bytes.length;
      sessionHost.updateThemeAsset(session, document => ({ ...document, assets: next.assets }), asset.path, bytes);
      setSession(session);
      return asset.path;
    } catch { setError(uiText("themeWorkspace.ThemeWorkspace.addAsset2")); }
  };
  const deleteAsset = async (assetId: string) => {
    if (!session) return;
    const asset = session.document.assets.find(item => item.id === assetId);
    if (!asset) return;
    sessionHost.updateThemeAsset(session, document => removeThemeAsset(document, assetId), asset.path, null);
    setSession(session);
  };
  const deleteSelected = async () => {
    const selected = summaries.filter(item => selectedThemeIds.has(item.themeId) && item.origin === "custom");
    const bindings = await loadThemeBindings();
    const referenced = selected.flatMap(item => listThemeReferences(item.themeId, bindings).map(reference => ({ theme: item.name, reference })));
    if (referenced.length) {
      setError(uiText("themeWorkspace.ThemeWorkspace.deleteSelected", { value: referenced.map(item => uiText("themeWorkspace.ThemeWorkspace.deleteSelected.value", { theme: item.theme, label: item.reference.label })).join("；") }));
      setDeleteSelectionOpen(false);
      return;
    }
    let cleaned = true;
    for (const item of selected) {
      await repository.deleteCustomTheme(item.themeId);
      sessionHost.discardThemeSession(item.themeId);
      cleaned = await removeDraftRecord(item.themeId) && cleaned;
    }
    setSelectedThemeIds(new Set()); setManageMode(false); await refresh(); setError(cleaned ? uiText("themeWorkspace.ThemeWorkspace.deleteSelected2") : uiText("themeWorkspace.ThemeWorkspace.deleteSelected3"));
  };
  const toggleThemeSelection = (themeId: string) => setSelectedThemeIds(current => {
    const next = new Set(current); if (next.has(themeId)) next.delete(themeId); else next.add(themeId); return next;
  });
  const selectCurrentCategory = () => setSelectedThemeIds(current => new Set([...current,...selectableVisible.map(item => item.themeId)]));
  const invertCurrentCategory = () => setSelectedThemeIds(current => {const next=new Set(current);for(const item of selectableVisible){if(next.has(item.themeId))next.delete(item.themeId);else next.add(item.themeId);}return next;});

  const publishToTarget = async (document: ThemeDocument, targetId: string, displayScale = scaleAt(targetId)) => {
    const targetKind = targetId === "live" ? "live" : "windows";
    if (!canApplyThemeMode(document.mode, targetKind)) throw new Error(uiText("themeWorkspace.ThemeWorkspace.publishToTarget"));
    const resolved = await withThemeResources(uiText("themeWorkspace.ThemeWorkspace.publishToTarget.resolved"), options => resolveThemeAssets(document, {}, true, options));
    const result = await getThemeModeAdapter(document.mode).publishTarget(resolved, {
      target: targetKind, targetId, roomId: String(useConnection.getState().state.roomId ?? ""), displayScale,
    }, targetKind === "live" ? applyThemeProjection : undefined);
    if (!result.rendered) throw new Error(result.message || uiText("themeWorkspace.ThemeWorkspace.publishToTarget2"));
    setAppliedThemeIds(current => ({ ...current, [targetId]: document.themeId }));
    setDisplayScales(current => ({ ...current, [targetId]: displayScale }));
  };
  const applySummary = async (item: ThemeSummary, targetId: string) => {
    try {
      await publishToTarget(await repository.loadThemeDocument(item.themeId), targetId);
      setError(uiText("themeWorkspace.ThemeWorkspace.applySummary", { value: targetLabel(targetId) }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : uiText("themeWorkspace.ThemeWorkspace.applySummary2")); }
  };
  const saveObsConfiguration = async (configuration: ObsDraft) => {
    if (savingObs) return;
    setSavingObs(true);
    setError(uiText("themeWorkspace.ThemeWorkspace.saveObsConfiguration"));
    try {
      const document = await repository.loadThemeDocument(configuration.themeId);
      const resolved = await withThemeResources(uiText("themeWorkspace.ThemeWorkspace.saveObsConfiguration.resolved"), options => resolveThemeAssets(document, {}, true, options));
      const saved = { ...configuration, themeName: document.metadata.name, themeRevision: document.revision };
      const previous = persistedObsConfigurations.current.get(saved.id);
      await commitObsConfiguration({
        previous,
        next: saved,
        save: nativeObsConfigurationStore.save,
        remove: nativeObsConfigurationStore.remove,
        publish: async () => {
          const binding = { targetId: saved.id, targetKind: "obs" as const, themeId: document.themeId, revision: document.revision, displayScale: displayScales[saved.id] ?? 1 };
          const context = getThemeModeAdapter(document.mode).createRenderContext(binding, saved.roomId);
          await getThemeModeAdapter(document.mode).publishTarget(resolved, context);
        },
      });
      setObsDrafts(current => current.map(item => item.id === saved.id && item === configuration ? saved : item));
      persistedObsConfigurations.current.set(saved.id, saved);
      await refreshObsConfigurations();
      setError(uiText("themeWorkspace.ThemeWorkspace.saveObsConfiguration2"));
      const adapter = getThemeModeAdapter(document.mode);
      setError(adapter.rendererReady ? uiText("themeWorkspace.ThemeWorkspace.saveObsConfiguration2") : uiText("themeWorkspace.ThemeWorkspace.saveObsConfiguration3", { label: getThemeModeDefinition(document.mode).label }));
    } catch { setError(""); setError(uiText("themeWorkspace.ThemeWorkspace.saveObsConfiguration4")); }
    finally { setSavingObs(false); }
  };
  const deleteObsConfiguration = async (configuration: ObsDraft) => {
    try {
      const bindings = await loadThemeBindings();
      const adapter = getThemeModeAdapter(await resolvePublishedThemeMode(configuration.id, bindings, repository.loadThemeDocument));
      await deleteObsConfigurationTransaction({
        cleanupPublished: () => adapter.removeTarget(configuration.id, "obs"),
        removeConfiguration: () => nativeObsConfigurationStore.remove(configuration.id),
      });
      persistedObsConfigurations.current.delete(configuration.id);
      await refreshObsConfigurations();
      setObsDrafts(current => current.filter(item => item.id !== configuration.id));
      setSelectedObsId(null);
      setDeleteObsOpen(false); setError(uiText("themeWorkspace.ThemeWorkspace.deleteObsConfiguration"));
    } catch (cause) {
      setError(cause instanceof ObsConfigurationDeleteError && !cause.restored
        ? uiText("themeWorkspace.ThemeWorkspace.deleteObsConfiguration2")
        : uiText("themeWorkspace.ThemeWorkspace.deleteObsConfiguration3"));
    }
  };
  const appliedSummary = (target: string) => summaries.find(item => item.themeId === themeIdAt(target));
  const updateDisplayScale = async (targetId: string, value: number) => {
    const displayScale = Math.max(0.5, Math.min(3, value));
    try {
      const bindings = await loadThemeBindings();
      const ownBinding = bindings.find(item => item.targetId === targetId);
      const binding = ownBinding ?? (targetId.startsWith("windows:") ? bindings.find(item => item.targetId === "windows") : undefined);
      if (!binding) throw new Error(uiText("themeWorkspace.ThemeWorkspace.updateDisplayScale"));
      const document = await repository.loadThemeDocument(binding.themeId);
      const adapter = getThemeModeAdapter(document.mode);
      if (!adapter.rendererReady) throw new Error(uiText("themeWorkspace.ThemeWorkspace.updateDisplayScale2"));
      if (!ownBinding) await publishToTarget(document, targetId, displayScale);
      else await adapter.updateScale(binding.targetId, binding.targetKind, displayScale, binding.targetKind === "live" ? applyThemeProjection : undefined);
      setDisplayScales(current => ({ ...current, [targetId]: displayScale }));
    } catch { setError(uiText("themeWorkspace.ThemeWorkspace.updateDisplayScale3")); }
  };
  useEffect(()=>{
    const panel=document.querySelector<HTMLElement>(".theme-info-dialog");
    if(!themeInfoDraft || !panel)return;
    return bindUiDismissableLayer(panel,()=>{if(!savingThemeInfo){setThemeInfoDraft(null);setPendingApply(false);}},{modal:true});
  },[Boolean(themeInfoDraft),savingThemeInfo]);
  useEffect(()=>{
    if(!pendingImport || resourceProgress)return;
    const panel=document.querySelector<HTMLElement>('.theme-import-confirmation .theme-name-dialog');
    return panel?bindUiDismissableLayer(panel,()=>setPendingImports([]),{modal:true}):undefined;
  },[Boolean(pendingImport),Boolean(resourceProgress)]);
  useEffect(()=>{
    if(!laplaceUrlDraft && !blivechatHtmlDraft)return;
    const panel=document.querySelector<HTMLElement>(".theme-url-dialog");
    return panel?bindUiDismissableLayer(panel,()=>{laplaceSourceCoordinatorRef.current?.cancel();setLaplaceUrlDraft(null);setBlivechatHtmlDraft(null);},{modal:true}):undefined;
  },[Boolean(laplaceUrlDraft),Boolean(blivechatHtmlDraft)]);
  const builtinInfoReadonly = Boolean(themeInfoDraft && themeInfoDraft.mode !== "save" && (themeInfoDraft.target?.origin ?? session?.document.origin) === "builtin");
  const selectedObs = obsDrafts.find(item => item.id === selectedObsId) ?? null;
  const compatibleEditingSurface = session?.document.mode === "native" ? undefined : session ? getCompatibleThemeEditingSurface(session.document.mode) : undefined;
  const savedObs = selectedObs ? persistedObsConfigurations.current.get(selectedObs.id) : undefined;
  const selectedObsTheme = selectedObs ? summaries.find(item => item.themeId === selectedObs.themeId) : undefined;
  const selectedObsThemeOptions = selectedObs ? obsThemeOptions(selectedObs, summaries.filter(item => canApplyThemeMode(item.mode, "obs"))) : [];

  const openObsAddress = async (copy = false, configuration = savedObs) => {
    if (!configuration) return;
    try { const status = await obsServiceStatus(); if (!status.running) throw new Error(status.error || uiText("themeWorkspace.ThemeWorkspace.openObsAddress")); const url = obsOutputUrl(status.port, configuration); if(copy){await navigator.clipboard.writeText(url);setError(uiText("themeWorkspace.ThemeWorkspace.openObsAddress2"));}else await openUrl(url); } catch(cause){setError(cause instanceof Error?cause.message:String(cause));}
  };
  const selectedObsAnchor = selectedObs ? anchors.find(anchor => String(anchor.realRoomId) === selectedObs.roomId) : undefined;

  return <ThemeImageAssetsContext.Provider value={{ images: (session?.document.assets ?? []).filter(asset => asset.mediaType.startsWith("image/")).map(asset => ({path:asset.path,name:asset.name,ready:assetPreviewUrls.has(asset.path)||Boolean(asset.sourceUrl),url:assetPreviewUrls.get(asset.path) ?? asset.sourceUrl ?? asset.path})), add: () => addAsset(undefined, true) }}><section className="theme-workspace-page" aria-label={uiText("common.styles")} data-active={active || undefined} data-view={view}>
    {view === "home" && <header className="theme-workspace-page-header">
      <>
        <div><h1>{uiText("common.styles")}</h1><p>{uiText("themeWorkspace.ThemeWorkspace5")}</p></div>
        <div className="theme-workspace-header-actions"><button type="button" className="theme-obs-entry theme-editor-action" onClick={() => setView("obs")}>{uiText("themeWorkspace.ThemeWorkspace6")}</button></div>
      </>
    </header>}
    <WorkspaceNotice key={notice.revision} message={error} onDismiss={() => {setError("");}} />
    {pendingDraftCleanup.length > 0 && <button type="button" className="ui-btn" onClick={() => void retryDraftCleanup()}>{uiText("themeWorkspace.ThemeWorkspace7")}</button>}
    {draftLoadError && <button type="button" className="ui-btn" onClick={() => void restoreStoredDrafts().then(refresh)}>{uiText("themeWorkspace.ThemeWorkspace8")}</button>}
    {(failedPublication || externalThemeState) && <div className="theme-workspace-recovery">
      {failedPublication && <button type="button" disabled={retryingPublication} onClick={() => void retryFailedPublication()}>{retryingPublication ? uiText("themeWorkspace.ThemeWorkspace9") : uiText("themeWorkspace.ThemeWorkspace10")}</button>}
      {externalThemeState === "deleted" && session && <button type="button" onClick={() => setThemeInfoDraft({mode:"save",name:uiText("themeWorkspace.onClick.name", { name: session.document.metadata.name }),author:session.document.metadata.author,version:session.document.metadata.version})}>{uiText("themeWorkspace.ThemeWorkspace11")}</button>}
      {externalThemeState === "changed" && <><button type="button" disabled={applyingThemes.has(session?.themeId ?? "")} onClick={() => void apply(editorApplyTarget, true)}>{uiText("themeWorkspace.ThemeWorkspace12")}</button><button type="button" onClick={() => setReloadExternalOpen(true)}>{uiText("themeWorkspace.ThemeWorkspace13")}</button></>}
    </div>}
    {reloadExternalOpen && <ConfirmDialog title={uiText("themeWorkspace.title")} description={uiText("themeWorkspace.description")} confirmLabel={uiText("themeWorkspace.confirmLabel")} onCancel={() => setReloadExternalOpen(false)} onConfirm={() => { setReloadExternalOpen(false); void reloadExternalTheme(); }} />}
    {restoreScope && session && <ConfirmDialog title={uiText("themeWorkspace.title2")} description={uiText("themeWorkspace.description2", { name: session.document.metadata.name, value: ({basic:uiText("themeWorkspace.description.value.basic"),visual:uiText("themeWorkspace.description.value.visual"),custom:uiText("themeWorkspace.description.value.custom"),all:uiText("themeWorkspace.description.value.all")} as Record<string,string>)[restoreScope] })} confirmLabel={uiText("common.restoreDefaults")} onCancel={() => setRestoreScope(null)} onConfirm={() => restoreDefaults(restoreScope)} />}
    {resourceProgress && <div className="theme-name-overlay" role="dialog" aria-modal="true" aria-label={uiText("themeWorkspace.aria_label2")}><div className="theme-name-dialog"><h3>{resourceProgress.label}</h3><p role="status">{uiText("themeWorkspace.ThemeWorkspace14")}{resourceProgress.completed} {uiText("themeWorkspace.ThemeWorkspace15")}</p><button type="button" onClick={()=>resourceAbort.current?.abort()}>{uiText("common.cancel")}</button></div></div>}
    {view === "home" ? <main className="theme-workspace-home">
      <section className="theme-workspace-current-uses" aria-labelledby="current-theme-heading">
        <div className="theme-workspace-section-heading theme-current-use-heading">
          <div><h2 id="current-theme-heading">{uiText("themeWorkspace.ThemeWorkspace16")}</h2><p>{uiText("themeWorkspace.ThemeWorkspace17")}</p></div>
          <div className="theme-window-mode"><span>{uiText("themeWorkspace.ThemeWorkspace18")}</span><SettingsChoiceControl label={uiText("themeWorkspace.label")} value={windowThemes.mode} options={[{ value: "unified", label: uiText("themeWorkspace.options.label") }, { value: "separate", label: uiText("themeWorkspace.options.label2") }]} onChange={value => void changeWindowThemeMode(value as WindowThemeMode)} /></div>
        </div>
        <div className="theme-current-use-cards" role="group" aria-label={uiText("themeWorkspace.aria_label3")}>
          {destinations.map(({ id: target, label }) => {
            const summary = appliedSummary(target);
            const Icon = themeTargetIcon(target);
            return <PopoverPrimitive.Root key={target}>
              <PopoverPrimitive.Trigger asChild>
                <button type="button" className="theme-current-use-card" aria-label={`${label}：${summary?.name ?? uiText("themeWorkspace.aria_label4")}，${Math.round(scaleAt(target) * 100)}%`} title={`${label} · ${summary?.name ?? uiText("themeWorkspace.title3")} · ${Math.round(scaleAt(target) * 100)}%`} onFocus={event => event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" })}>
                  <Icon size={16} aria-hidden="true" /><span>{label}</span><strong>{summary?.name ?? uiText("themeWorkspace.ThemeWorkspace19")}</strong><span className="theme-current-use-scale">{Math.round(scaleAt(target) * 100)}%</span>
                </button>
              </PopoverPrimitive.Trigger>
              <PopoverPrimitive.Portal>
                <PopoverPrimitive.Content className="theme-current-use-popover" align="start" sideOffset={8} collisionPadding={12} aria-label={uiText("themeWorkspace.aria_label5", { label: label })}>
                  <h3><Icon size={16} aria-hidden="true" />{label}</h3>
                  <label><span>{uiText("themeWorkspace.ThemeWorkspace20")}</span><UiSelect ariaLabel={uiText("themeWorkspace.ariaLabel", { label: label })} size="standard" value={themeIdAt(target)} options={obsThemeOptions({ themeId: themeIdAt(target) }, summaries.filter(item => canApplyThemeMode(item.mode, target === "live" ? "live" : "windows") && !(target === "live" && item.externalHtml)))} onValueChange={value => { const item = summaries.find(item => item.themeId === value); if (item) void applySummary(item, target); }} /></label>
                  <label><span>{uiText("themeWorkspace.ThemeWorkspace21")}</span><span className="theme-unit-input"><input aria-label={uiText("themeWorkspace.aria_label6", { label: label })} type="number" min="50" max="300" step="5" value={Math.round(scaleAt(target) * 100)} onChange={event => void updateDisplayScale(target, Number(event.target.value) / 100)} /><span>%</span></span></label>
                  <PopoverPrimitive.Close asChild><button type="button" className="theme-current-use-edit" onClick={() => void openTheme(themeIdAt(target), target)}><Pencil size={16} aria-hidden="true" />{uiText("themeWorkspace.ThemeWorkspace22")}</button></PopoverPrimitive.Close>
                </PopoverPrimitive.Content>
              </PopoverPrimitive.Portal>
            </PopoverPrimitive.Root>;
          })}
        </div>
      </section>
      <section className="theme-workspace-library" aria-label={uiText("themeWorkspace.aria_label7")} aria-labelledby="native-library-heading">
        <div className="theme-workspace-section-heading"><div><h2 id="native-library-heading">{uiText("themeWorkspace.ThemeWorkspace23")}</h2><p>{uiText("themeWorkspace.ThemeWorkspace24")}</p></div><div className="theme-library-heading-actions"><span>{visible.length} {uiText("themeWorkspace.ThemeWorkspace25")}</span><button type="button" onClick={() => themeCategory === "all" ? setCreatePanelOpen(true) : createTheme(themeCategory)}>{uiText("themeWorkspace.ThemeWorkspace26")}</button><button type="button" onClick={() => setImportPanelOpen(true)}>{uiText("common.import")}</button>{importResults.length > 0 && <PopoverPrimitive.Root><PopoverPrimitive.Trigger asChild><button type="button">{uiText("themeWorkspace.ThemeWorkspace27")}</button></PopoverPrimitive.Trigger><PopoverPrimitive.Portal><PopoverPrimitive.Content className="theme-import-results-popover" align="end" sideOffset={6} collisionPadding={12} aria-label={uiText("themeWorkspace.aria_label8")}><strong>{uiText("themeWorkspace.ThemeWorkspace27")}</strong>{importResults.map((result,index)=><p key={index}>{result}</p>)}</PopoverPrimitive.Content></PopoverPrimitive.Portal></PopoverPrimitive.Root>}<button type="button" onClick={() => void exportAll()}>{uiText("themeWorkspace.ThemeWorkspace28")}</button><button type="button" onClick={() => { setManageMode(value => !value); setSelectedThemeIds(new Set()); }}>{manageMode ? uiText("themeWorkspace.ThemeWorkspace29") : uiText("themeWorkspace.ThemeWorkspace30")}</button></div></div>
        <div className="theme-library-controls"><div className="theme-library-toolbar"><div className="theme-category-tabs" role="tablist" aria-label={uiText("themeWorkspace.aria_label9")}>{THEME_CATEGORIES.map(([id, label]) => <button type="button" role="tab" aria-selected={themeCategory === id} className={themeCategory === id ? "is-active" : ""} onClick={() => { setThemeCategory(id); }} key={id}>{label}</button>)}</div><UiSearchInput className="theme-library-search" aria-label={uiText("themeWorkspace.aria_label10")} placeholder={uiText("themeWorkspace.placeholder")} value={themeSearch} onValueChange={setThemeSearch} /></div>
        {manageMode && <div className="theme-selection-bar"><span>{uiText("themeWorkspace.ThemeWorkspace31")}{selectedThemeIds.size} {uiText("themeWorkspace.ThemeWorkspace32")}</span><button type="button" disabled={!selectableVisible.length} onClick={selectCurrentCategory}>{uiText("themeWorkspace.ThemeWorkspace33")}</button><button type="button" disabled={!selectableVisible.length} onClick={invertCurrentCategory}>{uiText("themeWorkspace.ThemeWorkspace34")}</button><button type="button" disabled={!selectedThemeIds.size} onClick={() => void exportSelected()}>{uiText("themeWorkspace.ThemeWorkspace35")}</button><button type="button" className="is-danger" disabled={!selectedThemeIds.size} onClick={() => { if (!summaries.some(item => selectedThemeIds.has(item.themeId) && item.origin === "custom")) { setError(uiText("themeWorkspace.onClick")); return; } setDeleteSelectionOpen(true); }}>{uiText("themeWorkspace.ThemeWorkspace36")}</button></div>}
        </div>
        <div className="theme-library-grid">
          {visible.map(item => { const draftDocument = sessionHost.getDraftThemeDocument(item.themeId); return <article className={`theme-library-card${selectedThemeIds.has(item.themeId) ? " is-selected" : ""}`} key={item.themeId} tabIndex={0} aria-label={manageMode ? uiText("themeWorkspace.aria_label11", { name: item.name }) : uiText("themeWorkspace.aria_label12", { name: item.name })} onClick={event => {
              if ((event.target as Element).closest("button,input,label,a") || window.getSelection()?.toString()) return;
              if(manageMode){if(!draftThemeIds.has(item.themeId))toggleThemeSelection(item.themeId);}else void openTheme(item.themeId);
            }} onKeyDown={event => {if(event.target!==event.currentTarget || ![" ","Enter"].includes(event.key))return;event.preventDefault();if(manageMode){if(!draftThemeIds.has(item.themeId))toggleThemeSelection(item.themeId);}else void openTheme(item.themeId);}}>
            {!draftThemeIds.has(item.themeId) && manageMode && <label className="theme-library-select"><input type="checkbox" aria-label={uiText("themeWorkspace.aria_label11", { name: item.name })} checked={selectedThemeIds.has(item.themeId)} onChange={() => toggleThemeSelection(item.themeId)} /></label>}
            <ThemeModeThumbnail mode={item.mode} themeId={item.themeId} revision={item.revision} displayPreferences={displayPreferences} load={draftDocument ? async () => resolveThemeAssets(structuredClone(draftDocument), sessionHost.getDraftThemeAssetChanges(item.themeId)) : resolveSavedThemeForObsPreview} />
            <div className="theme-library-card-copy"><div><strong>{item.name}</strong><span>{draftThemeIds.has(item.themeId) ? uiText("themeWorkspace.ThemeWorkspace37") : item.origin === "builtin" ? uiText("themeWorkspace.ThemeWorkspace38") : uiText("themeWorkspace.ThemeWorkspace39")}</span></div><div className="theme-library-tags"><span className="theme-library-format-label">{item.mode === "native" ? uiText("themeWorkspace.ThemeWorkspace40") : getThemeModeDefinition(item.mode).label}</span>{item.adjusted&&<span>{uiText("themeWorkspace.ThemeWorkspace41")}</span>}{appliedThemeIds.live===item.themeId&&<span>{uiText("themeWorkspace.ThemeWorkspace42")}</span>}{destinations.some(target=>target.id!=="live"&&themeIdAt(target.id)===item.themeId)&&<span>{uiText("themeWorkspace.ThemeWorkspace43")}</span>}</div><p>{uiText("themeWorkspace.ThemeWorkspace44")}{item.author || uiText("themeWorkspace.ThemeWorkspace45")}<span aria-hidden="true"> · </span>{uiText("themeWorkspace.ThemeWorkspace46")}{item.version || uiText("themeWorkspace.ThemeWorkspace45")}</p></div>
            <div className="theme-library-card-actions" hidden={manageMode}>
              {!draftThemeIds.has(item.themeId) && getThemeModeDefinition(item.mode).targets.length > 0 && <ThemeActionMenu label={uiText("themeWorkspace.label2", { name: item.name })} className="theme-library-use-trigger" items={destinations.filter(target => canApplyThemeMode(item.mode, target.id === "live" ? "live" : "windows")).map(target => {
                const Icon = themeTargetIcon(target.id);
                const unsupported = target.id === "live" && Boolean(item.externalHtml);
                return { label: unsupported ? uiText("themeWorkspace.items.label") : uiText("themeWorkspace.items.label2", { label: target.label }), icon: <Icon size={16} aria-hidden="true" />, current: !unsupported && themeIdAt(target.id) === item.themeId, disabled: unsupported, title: unsupported ? uiText("themeWorkspace.items.title") : undefined, action: () => void applySummary(item, target.id) };
              })}><Check size={16} aria-hidden="true" />{uiText("themeWorkspace.ThemeWorkspace47")}<ChevronDown size={14} aria-hidden="true" /></ThemeActionMenu>}
              {getThemeModeDefinition(item.mode).editable && <button type="button" onClick={() => void openTheme(item.themeId)}>{uiText("common.edit")}</button>}
              {!draftThemeIds.has(item.themeId) && <button type="button" onClick={() => void exportTheme(item)}>{uiText("common.export")}</button>}
              {draftThemeIds.has(item.themeId) && <button type="button" className="is-danger" onClick={() => setDeleteTarget(item)}>{uiText("common.delete")}</button>}
              {!draftThemeIds.has(item.themeId) && item.origin === "custom" && <>{item.mode === "laplace" && item.sourceUrl && <button type="button" onClick={() => void updateLaplaceUrlTheme(item)}>{uiText("themeWorkspace.ThemeWorkspace48")}</button>}<button type="button" onClick={() => setThemeInfoDraft({ mode: "rename", name: item.name, author: item.author, version: item.version, target: item })}>{uiText("themeWorkspace.ThemeWorkspace49")}</button><button type="button" className="is-danger" onClick={() => setDeleteTarget(item)}>{uiText("common.delete")}</button></>}
            </div>
          </article>})}
          {!visible.length && <div className="theme-workspace-empty"><p>{themeSearch.trim() ? uiText("themeWorkspace.ThemeWorkspace50") : uiText("themeWorkspace.ThemeWorkspace51")}</p>{themeSearch.trim() ? <button type="button" onClick={() => setThemeSearch("")}>{uiText("themeWorkspace.ThemeWorkspace52")}</button> : <p>{uiText("themeWorkspace.ThemeWorkspace53")}</p>}</div>}
        </div>
      </section>
    </main> : view === "obs" ? <main className="theme-obs-page">
      <header className="theme-obs-page-nav"><button type="button" className="theme-obs-back" onClick={() => { setError(""); setView("home"); }}><ChevronLeftIcon /><span>{uiText("themeWorkspace.ThemeWorkspace54")}</span></button></header>
      <div className="theme-obs-page-heading"><div><h1>{uiText("themeWorkspace.ThemeWorkspace55")}</h1><p>{uiText("themeWorkspace.ThemeWorkspace56")}</p></div><button type="button" className="is-primary" onClick={() => { const themeId=summaries.find(theme=>canApplyThemeMode(theme.mode,"obs"))?.themeId ?? defaultThemeId("obs"); const item:ObsDraft={id:createObsConfigurationId(obsDrafts.map(item=>item.id)),name:uiText("themeWorkspace.onClick.item.name"),roomId:"",themeId,themeRevision:summaries.find(theme=>theme.themeId===themeId)?.revision??1}; setObsDrafts(current=>[...current,item]); setSelectedObsId(item.id); }}>{uiText("themeWorkspace.ThemeWorkspace57")}</button></div>
      <ObsServiceSettings configurations={obsDrafts} onNotice={setError}/>
      <div className="theme-obs-layout"><section className="theme-obs-list">{obsDrafts.map(item=>{const anchorName=item.anchorName || anchors.find(anchor=>String(anchor.realRoomId)===item.roomId)?.uname;return <div className="theme-obs-list-entry" key={item.id}><button type="button" className={selectedObsId===item.id?"is-active":""} onClick={()=>{ setSelectedObsId(item.id); setError(""); }}><strong className="theme-obs-list-name">{item.name}</strong><span className="theme-obs-list-meta">{anchorName ? `${anchorName}${item.roomId ? uiText("themeWorkspace.ThemeWorkspace58", { roomId: item.roomId }) : ""}` : uiText("themeWorkspace.ThemeWorkspace59")}</span><span>{summaries.find(theme=>theme.themeId===item.themeId)?.name || item.themeName || uiText("themeWorkspace.ThemeWorkspace60")} · {getThemeModeDefinition(summaries.find(theme=>theme.themeId===item.themeId)?.mode ?? "native").label}</span></button><button type="button" className="theme-obs-list-copy" disabled={!persistedObsConfigurations.current.has(item.id)} onClick={()=>void openObsAddress(true,persistedObsConfigurations.current.get(item.id))} aria-label={uiText("themeWorkspace.aria_label13", { name: item.name })}>{uiText("themeWorkspace.ThemeWorkspace61")}</button></div>;})}{!obsDrafts.length&&<div className="theme-workspace-empty"><p>{uiText("themeWorkspace.ThemeWorkspace62")}</p><p>{uiText("themeWorkspace.ThemeWorkspace63")}</p></div>}</section>
      <section className="theme-obs-detail-panel">{selectedObs ? <><div className="theme-obs-detail"><label className="theme-obs-name-field">{uiText("themeWorkspace.ThemeWorkspace64")}<input value={selectedObs.name} onChange={event=>{namedObsDrafts.current.add(selectedObs.id);setObsDrafts(current=>current.map(item=>item.id===selectedObs.id?{...item,name:event.target.value}:item));}}/></label>
        <label className="theme-obs-room-field">{uiText("themeWorkspace.ThemeWorkspace65")}<input aria-label={uiText("themeWorkspace.aria_label14")} inputMode="numeric" value={selectedObs.roomId} onChange={event=>setObsDrafts(current=>current.map(item=>item.id===selectedObs.id?{...item,roomId:event.target.value.trim(),anchorName:anchors.find(anchor=>String(anchor.realRoomId)===event.target.value.trim())?.uname}:item))}/></label><div className="theme-obs-anchor-picker"><span>{uiText("themeWorkspace.ThemeWorkspace66")}</span><PopoverPrimitive.Root open={obsAnchorOpen} onOpenChange={setObsAnchorOpen}><PopoverPrimitive.Trigger asChild><button type="button" className="theme-obs-anchor-trigger theme-obs-anchor-card" aria-label={uiText("themeWorkspace.aria_label15")}>{selectedObsAnchor?.face?<img src={selectedObsAnchor.face} alt=""/>:<span className="theme-obs-anchor-fallback">{(selectedObs.anchorName || selectedObsAnchor?.uname || uiText("themeWorkspace.ThemeWorkspace67")).slice(0,1)}</span>}<span><strong>{selectedObs.anchorName || selectedObsAnchor?.uname || uiText("themeWorkspace.ThemeWorkspace68")}</strong><small>{selectedObs.roomId ? uiText("themeWorkspace.ThemeWorkspace69", { roomId: selectedObs.roomId }) : uiText("themeWorkspace.ThemeWorkspace70")}</small></span></button></PopoverPrimitive.Trigger><PopoverPrimitive.Portal><PopoverPrimitive.Content className="theme-obs-anchor-popover" sideOffset={6} align="start" collisionPadding={12}><div className="theme-obs-anchor-list">{anchors.map(anchor=><button type="button" className={`theme-obs-anchor-card${selectedObs.roomId===String(anchor.realRoomId)?" is-active":""}`} onClick={()=>{setObsDrafts(current=>current.map(item=>item.id===selectedObs.id?{...item,roomId:String(anchor.realRoomId),anchorName:anchor.uname}:item));setObsAnchorOpen(false);}} key={anchor.realRoomId}>{anchor.face?<img src={anchor.face} alt=""/>:<span className="theme-obs-anchor-fallback">{anchor.uname.slice(0,1)}</span>}<span><strong>{anchor.uname}</strong><small>{uiText("themeWorkspace.ThemeWorkspace71")}{anchor.realRoomId}</small></span></button>)}{!anchors.length&&<p>{uiText("themeWorkspace.ThemeWorkspace72")}</p>}</div></PopoverPrimitive.Content></PopoverPrimitive.Portal></PopoverPrimitive.Root></div>
        <label>{uiText("themeWorkspace.ThemeWorkspace20")}<UiSelect ariaLabel={uiText("themeWorkspace.ariaLabel2")} value={selectedObs.themeId} onValueChange={themeId=>setObsDrafts(current=>current.map(item=>item.id===selectedObs.id?{...item,themeId,themeName:summaries.find(theme=>theme.themeId===themeId)?.name}:item))} options={selectedObsThemeOptions}/></label>{!selectedObsTheme&&<p className="theme-obs-unavailable">{uiText("themeWorkspace.ThemeWorkspace73")}</p>}<div className="theme-obs-choice-field"><span>{uiText("themeWorkspace.ThemeWorkspace74")}</span><SettingsChoiceControl label={uiText("themeWorkspace.label3")} value={selectedObs.scheme ?? "follow"} onChange={value=>setObsDrafts(current=>current.map(item=>item.id===selectedObs.id?{...item,scheme:value as "follow"|"light"|"dark"}:item))} options={[{value:"follow",label:uiText("themeWorkspace.options.label3")},{value:"light",label:uiText("common.light")},{value:"dark",label:uiText("common.dark")}]} /></div><label>{uiText("themeWorkspace.ThemeWorkspace21")}<span className="theme-unit-input"><input aria-label={uiText("themeWorkspace.aria_label16")} type="number" min="50" max="300" step="5" value={Math.round((displayScales[selectedObs.id] ?? 1) * 100)} onChange={event=>setDisplayScales(current=>({...current,[selectedObs.id]:Number(event.target.value)/100}))}/><span>%</span></span></label><div className="obs-link-actions"><button type="button" disabled={!savedObs} onClick={()=>void openObsAddress(true)}>{uiText("themeWorkspace.ThemeWorkspace61")}</button><button type="button" disabled={!savedObs} onClick={()=>void openObsAddress()}>{uiText("themeWorkspace.ThemeWorkspace75")}</button><small>{savedObs?uiText("themeWorkspace.ThemeWorkspace76"):uiText("themeWorkspace.ThemeWorkspace77")}</small></div></div><div className="theme-obs-detail-actions"><button type="button" className="is-primary" disabled={savingObs || !selectedObsTheme || !/^\d+$/.test(selectedObs.roomId) || Number(selectedObs.roomId)<=0} onClick={()=>void saveObsConfiguration(selectedObs)}>{uiText("themeWorkspace.ThemeWorkspace78")}</button><button type="button" className="is-danger" onClick={()=>setDeleteObsOpen(true)}>{uiText("themeWorkspace.ThemeWorkspace79")}</button></div></>:<p>{uiText("themeWorkspace.ThemeWorkspace80")}</p>}</section></div>
      {active && previewTarget && selectedObs && createPortal(<ObsManagementPreview previewHeaderTarget={previewHeaderTarget} configuration={selectedObs} saved={savedObs} displayScale={displayScales[selectedObs.id] ?? 1} loadDocument={resolveSavedThemeForObsPreview} geometry={previewGeometry}/>, previewTarget)}
    </main> : <div className="theme-editor-stage">
        {session && getThemeModeAdapter(session.document.mode).editor === "native" ? <NativeThemeEditor
          previewActive={active && view === "editor" && Boolean(previewTarget)}
          document={session.document}
          previewDocument={editorPreviewDocument?.source === session.document ? editorPreviewDocument.resolved : session.document}
          visualCss={session.visualCssDraft}
          customCss={session.customCssDraft}
          cssMessageKind={session.customCssError || session.visualCssError ? "error" : "notice"}
          cssMessage={session.customCssError || session.visualCssError || (session.visualCssDiagnostics.length ? uiText("themeWorkspace.cssMessage", { value: session.visualCssDiagnostics.join("；") }) : "")}
          visualCssControlled={session.visualCssControlled}
          previewTarget={previewTarget}
          previewHeaderTarget={previewHeaderTarget}
          previewGeometry={previewGeometry}
          displayPreferences={displayPreferences}
          onSettingsChange={updateSettings}
          onCustomCssChange={updateCustomCss}
          onVisualCssChange={updateVisualCss}
          onExportCss={scope => void exportCss(scope)}
          onAddAsset={() => void addAsset()}
          onReplaceAsset={assetId => void addAsset(assetId)}
          assetPreviewUrls={assetPreviewUrls}
          onRemoveAsset={assetId => void deleteAsset(assetId)}
          onBack={() => returnHome()}
          dirty={session.dirty || !session.persisted}
          saving={savingThemes.has(session.document.themeId) || applyingThemes.has(session.document.themeId)}
          draftStatus={draftStatus}
          onRetryDraft={() => void persistDraft()}
          onSave={() => void persistDraft()}
          onSaveAs={() => setThemeInfoDraft({mode:"save",name:uiText("themeWorkspace.onSaveAs.name", { name: session.document.metadata.name }),author:session.document.metadata.author,version:session.document.metadata.version})}
          onRestore={scope => setRestoreScope(scope)}
          onEditMetadata={() => session && setThemeInfoDraft({ mode: "edit", name: session.document.metadata.name, author: session.document.metadata.author, version: session.document.metadata.version })}
          onApply={() => void apply()}
          applyLabel={editorApplyTarget ? uiText("themeWorkspace.applyLabel", { value: targetLabel(editorApplyTarget) }) : uiText("common.apply")}
          applyTargets={editorApplyTarget ? undefined : destinations.filter(target => canApplyThemeMode(session.document.mode, target.id === "live" ? "live" : "windows") && !(target.id === "live" && session.document.metadata.externalHtml)).map(target => ({ label: uiText("themeWorkspace.applyTargets.label", { label: target.label }), action: () => void apply(target.id) }))}
          fontFamilyOptions={fontFamilyOptions}
          onOpenFonts={onOpenFonts}
        /> : session && compatibleEditingSurface ? <CompatibleThemeEditor
          previewActive={active && view === "editor" && Boolean(previewTarget)}
          document={session.document}
          previewDocument={editorPreviewDocument?.source === session.document ? editorPreviewDocument.resolved : session.document}
          capability={compatibleEditingSurface.capability}
          renderer={compatibleEditingSurface.renderer}
          composeCss={compatibleEditingSurface.composeCss}
          visualCss={session.visualCssDraft}
          customCss={session.customCssDraft}
          cssMessageKind={session.customCssError || session.visualCssError ? "error" : "notice"}
          cssMessage={session.customCssError || session.visualCssError || (session.visualCssDiagnostics.length ? uiText("themeWorkspace.cssMessage", { value: session.visualCssDiagnostics.join("；") }) : "")}
          fontFamilyOptions={fontFamilyOptions}
          basicControls={compatibleEditingSurface.renderBasicControls?.({ document: session.document, onSettingsChange: updateCompatibleSettings })}
          advancedControls={session.document.mode === "blivechat" ? <div className="native-advanced-option"><div><h3>{uiText("themeWorkspace.advancedControls")}</h3><p>{uiText("themeWorkspace.advancedControls2")}</p></div><button type="button" onClick={() => { blivechatPreviewGenerationRef.current += 1; setBlivechatHtmlDraft({ url: "", document: null, loading: false, ready: false, error: "" }); }}>{uiText("themeWorkspace.advancedControls3")}</button></div> : session.document.mode === "laplace" ? <div className="native-advanced-option native-scene-option"><label htmlFor="theme-scene-name">{uiText("themeWorkspace.advancedControls4")}</label><input id="theme-scene-name" aria-label={uiText("themeWorkspace.aria_label17")} placeholder={uiText("themeWorkspace.placeholder2")} value={String(session.document.settings.sceneName ?? "")} onChange={event => updateCompatibleSettings({ ...session.document.settings, sceneName: event.target.value })} /><details className="native-advanced-help"><summary>{uiText("themeWorkspace.advancedControls5")}</summary><p>{uiText("themeWorkspace.advancedControls6")}</p></details></div> : undefined}
          previewTarget={previewTarget}
          previewHeaderTarget={previewHeaderTarget}
          previewGeometry={previewGeometry}
          onOpenFonts={onOpenFonts}
          onSettingsChange={updateCompatibleSettings}
          onCustomCssChange={updateCustomCss}
          onVisualCssChange={updateVisualCss}
          onExportCss={scope => void exportCss(scope)}
          onAddAsset={() => void addAsset()}
          onReplaceAsset={assetId => void addAsset(assetId)}
          assetPreviewUrls={assetPreviewUrls}
          onRemoveAsset={assetId => void deleteAsset(assetId)}
          onBack={() => returnHome()}
          dirty={session.dirty || !session.persisted}
          saving={savingThemes.has(session.document.themeId) || applyingThemes.has(session.document.themeId)}
          draftStatus={draftStatus}
          onRetryDraft={() => void persistDraft()}
          onSave={() => void persistDraft()}
          onSaveAs={() => setThemeInfoDraft({mode:"save",name:uiText("themeWorkspace.onSaveAs.name", { name: session.document.metadata.name }),author:session.document.metadata.author,version:session.document.metadata.version})}
          onRestore={scope => setRestoreScope(scope)}
          onEditMetadata={() => setThemeInfoDraft({ mode: "edit", name: session.document.metadata.name, author: session.document.metadata.author, version: session.document.metadata.version })}
          onApply={() => void apply()}
          applyLabel={editorApplyTarget ? uiText("themeWorkspace.applyLabel", { value: targetLabel(editorApplyTarget) }) : uiText("common.apply")}
          applyTargets={editorApplyTarget ? undefined : destinations.filter(target => canApplyThemeMode(session.document.mode, target.id === "live" ? "live" : "windows") && !(target.id === "live" && session.document.metadata.externalHtml)).map(target => ({ label: uiText("themeWorkspace.applyTargets.label", { label: target.label }), action: () => void apply(target.id) }))}
        /> : session ? <section className="theme-editor-empty" aria-label={uiText("themeWorkspace.aria_label18", { label: getThemeModeDefinition(session.document.mode).label })}><h2>{session.document.metadata.name}</h2><p>{uiText("themeWorkspace.ThemeWorkspace81")}</p><div><button type="button" onClick={() => returnHome()}>{uiText("themeWorkspace.ThemeWorkspace54")}</button><button type="button" onClick={() => setThemeInfoDraft({ mode: "edit", name: session.document.metadata.name, author: session.document.metadata.author, version: session.document.metadata.version })}>{uiText("themeWorkspace.ThemeWorkspace49")}</button><button type="button" className="is-primary" onClick={() => void save()}>{session.document.origin === "builtin" ? uiText("themeWorkspace.ThemeWorkspace82") : uiText("common.save")}</button></div></section> : <div className="theme-editor-empty">{uiText("themeWorkspace.ThemeWorkspace83")}</div>}
      </div>}
    {themeInfoDraft && <div className="theme-name-overlay" role="dialog" aria-modal="true" aria-label={uiText("themeWorkspace.aria_label19")}><div className="theme-name-dialog theme-info-dialog">
      <h3>{uiText("themeWorkspace.ThemeWorkspace49")}</h3>{savingThemeInfo && <p role="status">{uiText("themeWorkspace.ThemeWorkspace84")}</p>}
      <ThemeMetadataDetails document={themeInfoDraft.mode === "rename" ? undefined : session?.document} themeId={themeInfoDraft.target?.themeId} load={repository.loadThemeDocument} />
      {builtinInfoReadonly ? <dl className="theme-metadata-details">{([[uiText("themeWorkspace.ThemeWorkspace64"), themeInfoDraft.name], [uiText("themeWorkspace.ThemeWorkspace85"), themeInfoDraft.author], [uiText("themeWorkspace.ThemeWorkspace86"), themeInfoDraft.version]] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || uiText("themeWorkspace.ThemeWorkspace45")}</dd></div>)}</dl> : <>
        <label>{uiText("themeWorkspace.ThemeWorkspace64")}<input disabled={savingThemeInfo} value={themeInfoDraft.name} onChange={event => setThemeInfoDraft(current => current ? { ...current, name: event.target.value } : current)} aria-label={uiText("themeWorkspace.aria_label20")} /></label>
        <label>{uiText("themeWorkspace.ThemeWorkspace85")}<input disabled={savingThemeInfo} value={themeInfoDraft.author} onChange={event => setThemeInfoDraft(current => current ? { ...current, author: event.target.value } : current)} aria-label={uiText("themeWorkspace.aria_label21")} /></label>
        <label>{uiText("themeWorkspace.ThemeWorkspace86")}<input disabled={savingThemeInfo} value={themeInfoDraft.version} onChange={event => setThemeInfoDraft(current => current ? { ...current, version: event.target.value } : current)} aria-label={uiText("themeWorkspace.aria_label22")} /></label>
      </>}
      <div><button type="button" disabled={savingThemeInfo} onClick={() => { setThemeInfoDraft(null); setPendingApply(false); }}>{builtinInfoReadonly ? uiText("common.close") : uiText("common.cancel")}</button>
        {!builtinInfoReadonly && <button type="button" className="is-primary" disabled={savingThemeInfo || !themeInfoDraft.name.trim()} aria-busy={savingThemeInfo} onClick={() => {
          void (themeInfoDraft.mode === "save" ? saveAs() : themeInfoDraft.mode === "edit" ? editThemeInfo() : (async () => {
            const target = await repository.loadThemeDocument(themeInfoDraft.target!.themeId);
            await repository.saveThemeDocument({ ...target, revision: target.revision + 1, metadata: { ...target.metadata, name: themeInfoDraft.name.trim(), author: themeInfoDraft.author.trim(), version: themeInfoDraft.version.trim(), localModifiedAt: formatThemeTimestamp() } });
            setThemeInfoDraft(null); await refresh();
          })());
        }}>{themeInfoDraft.mode === "edit" ? uiText("themeWorkspace.ThemeWorkspace87") : uiText("common.save")}</button>}
      </div>
    </div></div>}
    {deleteTarget && <ConfirmDialog title={uiText("themeWorkspace.title4", { name: deleteTarget.name })} description={uiText("themeWorkspace.description3")} confirmLabel={uiText("themeWorkspace.confirmLabel2")} confirmTone="danger" onCancel={() => setDeleteTarget(null)} onConfirm={deleteTheme} />}
    {deleteSelectionOpen && <ConfirmDialog title={uiText("themeWorkspace.title5")} description={uiText("themeWorkspace.description4", { length: summaries.filter(item=>selectedThemeIds.has(item.themeId)&&item.origin==="custom").length, value: summaries.filter(item=>selectedThemeIds.has(item.themeId)&&item.origin==="custom").map(item=>item.name).join("、") })} confirmLabel={uiText("themeWorkspace.confirmLabel3")} confirmTone="danger" onCancel={() => setDeleteSelectionOpen(false)} onConfirm={deleteSelected} />}
    {deleteObsOpen && selectedObs && <ConfirmDialog title={uiText("themeWorkspace.title4", { name: selectedObs.name })} description={uiText("themeWorkspace.description5")} confirmLabel={uiText("themeWorkspace.confirmLabel4")} confirmTone="danger" onCancel={() => setDeleteObsOpen(false)} onConfirm={() => deleteObsConfiguration(selectedObs)} />}
    {pendingImport && <div className="theme-name-overlay theme-import-confirmation" role="dialog" aria-modal="true" aria-label={uiText("themeWorkspace.aria_label23")}><div className="theme-name-dialog"><h3>{uiText("themeWorkspace.ThemeWorkspace88")}</h3>{error && <p role="alert">{error}</p>}<p className="ui-type-control text-t2">{summaries.some(item => item.themeId === pendingImport.document.themeId && item.origin === "builtin") ? uiText("themeWorkspace.ThemeWorkspace89") : summaries.some(item => item.themeId === pendingImport.document.themeId) ? uiText("themeWorkspace.ThemeWorkspace90", { themeId: pendingImport.document.themeId }) : uiText("themeWorkspace.ThemeWorkspace91", { name: pendingImport.document.metadata.name, label: getThemeModeDefinition(pendingImport.document.mode).label })}</p><div><button type="button" onClick={() => { setError(""); setImportResults(current => [...current, uiText("themeWorkspace.onClick2", { name: pendingImport.document.metadata.name })]); setPendingImports(current => current.slice(1)); }}>{uiText("themeWorkspace.ThemeWorkspace92")}</button><button type="button" onClick={() => void installImportedTheme({ ...pendingImport.document, metadata: { ...pendingImport.document.metadata, name: uiText("themeWorkspace.onClick.metadata.name", { name: pendingImport.document.metadata.name }) } }, pendingImport.assets, "copy").then(() => setImportResults(current => [...current, uiText("themeWorkspace.onClick3", { name: pendingImport.document.metadata.name })])).catch(cause => setError(cause instanceof Error ? cause.message : uiText("themeWorkspace.onClick4")))}>{uiText("themeWorkspace.ThemeWorkspace93")}</button><button type="button" className="is-primary" disabled={summaries.some(item => item.themeId === pendingImport.document.themeId && item.origin === "builtin")} onClick={() => void installImportedTheme(pendingImport.document, pendingImport.assets, "update").then(() => setImportResults(current => [...current, `${pendingImport.document.metadata.name}：${summaries.some(item => item.themeId === pendingImport.document.themeId) ? uiText("themeWorkspace.onClick5") : uiText("themeWorkspace.onClick6")}`])).catch(cause => setError(cause instanceof Error ? cause.message : uiText("themeWorkspace.onClick4")))}>{summaries.some(item => item.themeId === pendingImport.document.themeId) ? uiText("themeWorkspace.ThemeWorkspace94") : uiText("themeWorkspace.ThemeWorkspace95")}</button></div></div></div>}
    {createPanelOpen && <ThemeCreateDialog onClose={() => setCreatePanelOpen(false)} onCreate={createTheme} />}
    {importPanelOpen && <ThemeImportDialog onClose={() => setImportPanelOpen(false)} onTheme={importTheme} onCss={importCss} onUrl={url => { setImportPanelOpen(false); laplaceSourceCoordinatorRef.current?.cancel(); setLaplaceUrlDraft({ url, document: null, loading: false, error: "" }); }} />}
    {laplaceUrlDraft && <div className="theme-name-overlay" role="dialog" aria-modal="true" aria-label={uiText("themeWorkspace.aria_label24")}><div className="theme-name-dialog theme-url-dialog">
      <h3>{uiText("themeWorkspace.ThemeWorkspace96")}</h3>
      <div className="theme-url-dialog-body">
        <label>{uiText("themeWorkspace.ThemeWorkspace97")}<input value={laplaceUrlDraft.url} onChange={event => { laplacePreviewGenerationRef.current += 1; laplaceSourceCoordinatorRef.current?.cancel(); setLaplaceUrlDraft(current => current ? { ...current, url: event.target.value, document: null, loading: false, error: "" } : current); }} placeholder="https://example.com/theme.css" /></label>
        {laplaceUrlDraft.error && <p role="alert">{laplaceUrlDraft.error}</p>}
        {laplaceUrlDraft.document && <><dl><div><dt>{uiText("themeWorkspace.ThemeWorkspace64")}</dt><dd>{laplaceUrlDraft.document.metadata.name}</dd></div><div><dt>{uiText("themeWorkspace.ThemeWorkspace85")}</dt><dd>{laplaceUrlDraft.document.metadata.author || uiText("themeWorkspace.ThemeWorkspace45")}</dd></div><div><dt>{uiText("themeWorkspace.ThemeWorkspace86")}</dt><dd>{laplaceUrlDraft.document.metadata.version || uiText("themeWorkspace.ThemeWorkspace45")}</dd></div></dl><CompatibleThemeThumbnail mode="laplace" themeId={laplaceUrlDraft.document.themeId} revision={1} load={loadLaplacePreviewDocument} onPreviewReady={laplacePreviewReady} onPreviewFailure={laplacePreviewFailure} /></>}
      </div>
      <div className="theme-url-dialog-actions"><button type="button" onClick={() => { laplacePreviewGenerationRef.current += 1; laplaceSourceCoordinatorRef.current?.cancel(); setLaplaceUrlDraft(null); }}>{uiText("common.cancel")}</button><button type="button" disabled={laplaceUrlDraft.loading || !laplaceUrlDraft.url.trim()} onClick={() => void previewLaplaceUrl()}>{laplaceUrlDraft.loading ? uiText("themeWorkspace.ThemeWorkspace98") : uiText("themeWorkspace.ThemeWorkspace99")}</button><button type="button" className="is-primary" disabled={!laplaceUrlDraft.document || laplaceReadyDocument !== laplaceUrlDraft.document} onClick={() => void saveLaplaceUrlTheme()}>{laplaceUrlDraft.document?.origin === "builtin" ? uiText("themeWorkspace.ThemeWorkspace100") : uiText("themeWorkspace.ThemeWorkspace101")}</button></div>
    </div></div>}
    {blivechatHtmlDraft && <div className="theme-name-overlay" role="dialog" aria-modal="true" aria-label={uiText("themeWorkspace.aria_label25")}><div className="theme-name-dialog theme-url-dialog"><h3>{uiText("themeWorkspace.ThemeWorkspace102")}</h3><div className="theme-url-dialog-body"><p>{uiText("themeWorkspace.ThemeWorkspace103")}</p><label>{uiText("themeWorkspace.ThemeWorkspace104")}<input value={blivechatHtmlDraft.url} onChange={event => { blivechatPreviewGenerationRef.current += 1; setBlivechatHtmlDraft(current => current ? { ...current, url: event.target.value, document: null, loading: false, ready: false, error: "" } : current); }} placeholder="https://example.com/index.html" /></label>{blivechatHtmlDraft.error && <p role="alert">{blivechatHtmlDraft.error}</p>}{blivechatHtmlDraft.document && <><p role="status">{blivechatHtmlDraft.ready ? uiText("themeWorkspace.ThemeWorkspace105") : uiText("themeWorkspace.ThemeWorkspace106")}</p><div className="theme-external-html-preview"><BlivechatExternalHtmlSurface descriptor={{ url: blivechatHtmlDraft.url, target: "windows", targetId: "blivechat-preview", css: getThemeModeAdapter("blivechat").exportCss(blivechatHtmlDraft.document, "complete"), config: { showGiftName: true, mergeSimilarDanmaku: false, mergeGift: false, maxNumber: 50 } }} events={createStylePreviewEvents("混合流")} fallback={<div>{uiText("themeWorkspace.fallback")}</div>} onReady={() => { const generation = blivechatPreviewGenerationRef.current; setBlivechatHtmlDraft(current => current && current.document && !current.ready ? { ...current, loading: false, ready: true, document: { ...current.document, metadata: { ...current.document.metadata, externalHtml: { url: current.url, sdk: "blivechat-1.0.1", verified: true } } } } : current); void generation; }} onFailure={message => setBlivechatHtmlDraft(current => current ? { ...current, loading: false, ready: false, error: message } : current)} /></div></>}</div><div className="theme-url-dialog-actions"><button type="button" onClick={() => { blivechatPreviewGenerationRef.current += 1; setBlivechatHtmlDraft(null); }}>{uiText("common.cancel")}</button><button type="button" disabled={blivechatHtmlDraft.loading || !blivechatHtmlDraft.url.trim()} onClick={() => void previewBlivechatHtml()}>{blivechatHtmlDraft.loading ? uiText("themeWorkspace.ThemeWorkspace107") : uiText("themeWorkspace.ThemeWorkspace108")}</button><button type="button" className="is-primary" disabled={!blivechatHtmlDraft.ready} onClick={() => void saveBlivechatHtmlTheme()}>{uiText("themeWorkspace.ThemeWorkspace100")}</button></div></div></div>}
  </section></ThemeImageAssetsContext.Provider>;
}
