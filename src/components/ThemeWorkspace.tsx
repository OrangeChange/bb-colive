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
import { invoke } from "@tauri-apps/api/core";
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
const THEME_CATEGORIES = [["all", "所有样式"], ["native", "原生"], ["blivechat", "BLC 原版"], ["blivechat-open", "BLC 开放版"], ["laplace", "LAPLACE"]] as const;
type ThemeCategory = typeof THEME_CATEGORIES[number][0];
type ObsDraft = NativeObsConfiguration;
type ThemeInfoDraft = { mode: "save" | "rename" | "edit"; name: string; author: string; version: string; target?: ThemeSummary };

function themeTargetIcon(label: string) {
  return getSettingsIcon(label === "所有副窗口" ? "副窗口" : label);
}

function ThemeModeThumbnail(props: Parameters<typeof NativeThemeThumbnail>[0] & { mode: ThemeDocument["mode"] }) {
  if (getThemeModeAdapter(props.mode).thumbnail === "native") {
    const { mode: _mode, ...nativeProps } = props;
    return <NativeThemeThumbnail {...nativeProps} />;
  }
  if (props.mode !== "native") return <CompatibleThemeThumbnail mode={props.mode} themeId={props.themeId} revision={props.revision} load={props.load} />;
  return <div className="theme-library-thumbnail is-error" aria-label={`${getThemeModeDefinition(props.mode).label}预览暂不可用`}><span>{getThemeModeDefinition(props.mode).label}<small>预览暂不可用</small></span></div>;
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
        const anchor=item.anchorName||anchors.find(anchor=>String(anchor.realRoomId)===item.roomId)?.uname||`直播间 ${item.roomId}`;
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
  const destinations = [{ id: "live", label: "现场" }, ...windowThemeTargets(windowThemes.mode, revenueSelection.mode)];
  const themeIdAt = (targetId: string) => appliedThemeIds[targetId] ?? appliedThemeIds.windows;
  const scaleAt = (targetId: string) => displayScales[targetId] ?? displayScales.windows ?? 1;
  const targetLabel = (targetId: string) => targetId === "live" ? "现场" : windowThemeLabel(targetId);
  useEffect(() => {
    setAppliedThemeIds(current => ({ ...current, ...Object.fromEntries(windowThemes.bindings.map(binding => [binding.targetId, binding.themeId])) }));
    setDisplayScales(current => ({ ...current, ...Object.fromEntries(windowThemes.bindings.map(binding => [binding.targetId, binding.displayScale ?? 1])) }));
  }, [windowThemes.bindings]);
  const changeWindowThemeMode = async (mode: WindowThemeMode) => {
    try { await saveWindowThemeMode(mode); }
    catch { setError("无法保存副窗口样式设置，请重试"); }
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
    if(resourceAbort.current)throw new Error("正在准备主题，请稍候");
    const controller=new AbortController();resourceAbort.current=controller;setError("");setResourceProgress({label,completed:0});
    try{return await operation({signal:controller.signal,onProgress:completed=>setResourceProgress({label,completed})})}
    finally{resourceAbort.current=null;setResourceProgress(null)}
  };
  const completeThemePackage=async(document:ThemeDocument)=>withThemeResources("正在准备完整主题包",async options=>{
    const complete=await localizeThemeResources(document,document.metadata.resourceBaseUrl||document.metadata.sourceUrl||"file:///theme.css",themeDependencyLoader(false,options.signal,options.onProgress));
    const status=await obsServiceStatus();
    const assets:Record<string,Uint8Array>={...complete.assets};
    for(const asset of complete.document.assets){
      if(options.signal.aborted)throw new Error("素材加载已取消");
      if(assets[asset.path])continue;
      const id=asset.cacheResourceId??asset.sharedResourceId;
      if(id){
        const response=await fetch(`http://127.0.0.1:${status.port}/theme-resources/${asset.cacheResourceId?"remote":"shared"}/${encodeURIComponent(id)}/${encodeURIComponent(asset.resourceFileName??asset.path.split("/").pop()!)}`,{signal:options.signal});
        if(!response.ok)throw new Error(`素材无法读取：${asset.name}`);
        assets[asset.path]=new Uint8Array(await response.arrayBuffer());
      }else assets[asset.path]=await repository.readThemeAsset(document.themeId,asset.path);
    }
    if(options.signal.aborted)throw new Error("素材加载已取消");
    const bytes=await exportThemeDocumentBytesAsync(complete.document,assets);
    if(options.signal.aborted)throw new Error("素材加载已取消");
    return bytes;
  });
  const [importResults, setImportResults] = useState<string[]>([]);
  useEffect(() => {
    if (!importResults.length || pendingImports.length) return;
    const failed=importResults.some(result=>!/已读取|已导入|已更新|已跳过/.test(result));
    setError(failed ? "部分主题未导入，请查看导入结果后重试" : "导入处理已完成");
  }, [importResults,pendingImports.length]);
  const [importPanelOpen, setImportPanelOpen] = useState(false);
  const [createPanelOpen, setCreatePanelOpen] = useState(false);
  const [laplaceUrlDraft, setLaplaceUrlDraft] = useState<{ url: string; document: ThemeDocument | null; loading: boolean; error: string } | null>(null);
  const [laplaceReadyDocument, setLaplaceReadyDocument] = useState<ThemeDocument | null>(null);
  const laplacePreviewDocument = laplaceUrlDraft?.document;
  const loadLaplacePreviewDocument = useCallback(async () => {
    if (!laplacePreviewDocument) throw new Error("请先加载主题");
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
    setError(result.every(Boolean) ? "草稿记录已清理" : "部分草稿记录未能清理，请重试");
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
        setError("草稿未能保留，请重试。关闭软件前请确认草稿已保留，或点击应用保存主题。");
      }
    }
  };
  useEffect(() => { if (session) void persistDraft(session); }, [session, session?.document, session?.saved, session?.assetChanges, session?.visualCssDraft, session?.customCssDraft, session?.visualCssError, session?.customCssError]);
  const restoreStoredDrafts = async () => {
    try { sessionHost.restoreThemeDrafts(await drafts().list()); setDraftLoadError(false); }
    catch { setDraftLoadError(true); setError("无法读取已保留的草稿，请重试。正式主题仍可使用。"); }
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
        if (state === "deleted") { setExternalThemeState("deleted"); setError("主题文件已被移除，当前草稿仍然保留"); }
        else if (state === "changed") { setExternalThemeState("changed"); setError("主题文件已在外部更新，当前草稿尚未覆盖它"); }
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
    catch { setError("无法读取主题，请稍后重试"); }
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
    onPreviewTitleChange(previewMode === "obs" ? "OBS 预览" : "样式预览");
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
      setError(external === "changed" ? "主题文件已在外部更新，当前草稿尚未覆盖它" : external === "deleted" ? "主题文件已被移除，当前草稿仍然保留" : "");
    }
    catch (cause) { setError(cause instanceof Error && /不存在|已被移除/.test(cause.message) ? cause.message : "无法打开主题，请检查主题文件是否完整，恢复文件或重新导入后重试"); }
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
          setError("主题文件已被移除，尚未应用。当前内容已保留，请另存为恢复。");
          return;
        }
        if (external === "reloaded") setSession(prepareEditorSession(session));
      }
      const savedDocument = session.dirty || keepDraft ? await save(keepDraft) : session.saved;
      if (!savedDocument) return;
      if (!session.dirty) {
        try { await drafts().remove(themeId); }
        catch { throw new Error("主题已保存，但草稿记录未能更新，请重试应用。"); }
      }
      const references = await loadThemeBindings();
      await saveAndUpdateThemeReferences(savedDocument, {save: async () => savedDocument, bindings: async () => references, publish: publishSavedReference});
      setFailedPublication(null);
      if (targetId) await publishToTarget(savedDocument, targetId);
      setError(targetId ? `已应用到${targetLabel(targetId)}` : listThemeReferences(themeId, references).length ? "已更新所有使用此主题的输出" : "主题已保存，目前没有输出使用此主题");
    } catch (cause) {
      if (cause instanceof ThemeReferenceUpdateError) setFailedPublication(cause);
      setError(themeSaveErrorMessage(cause, "主题应用失败，请重试"));
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
        await adapter.publishTarget(await withThemeResources("正在准备主题", options => resolveThemeAssets(document, {}, true, options)), adapter.createRenderContext(binding, room), binding.targetKind === "live" ? applyThemeProjection : undefined);
      };
  const retryFailedPublication = async () => {
    if (!failedPublication || retryingPublication) return;
    setRetryingPublication(true);
    try {
      const skipped = await retryThemeReferences(failedPublication, { bindings: loadThemeBindings, publish: publishSavedReference });
      setFailedPublication(null);
      setError(skipped.length ? `${skipped.join("、")}已变更主题，已取消对应更新` : "输出已更新");
      await refresh();
    } catch (cause) {
      if (cause instanceof ThemeReferenceUpdateError) setFailedPublication(cause);
      setError(cause instanceof Error ? cause.message : "输出更新失败，请重试");
    } finally { setRetryingPublication(false); }
  };
  const save = async (keepDraft = false): Promise<ThemeDocument | null> => {
    if (!session) return null;
    if (!session.persisted) {
      setThemeInfoDraft({ mode: "save", name: session.persisted ? `${session.document.metadata.name} 副本` : session.document.metadata.name, author: session.document.metadata.author, version: session.document.metadata.version });
      return null;
    }
    const themeId = session.document.themeId;
    setSavingThemes(current => new Set(current).add(themeId));
    try {
    if (!keepDraft) {
      const external = await sessionHost.checkThemeSessionForExternalChange(session);
      if (external === "changed" || external === "deleted") {
        setExternalThemeState(external);
        setError(external === "changed" ? "主题文件已变化，尚未应用。当前草稿已保留，请选择保留修改并应用，或载入文件中的版本。" : "主题文件已被移除，尚未应用。当前草稿已保留，请另存为恢复。");
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
      const message = cause instanceof Error ? cause.message : String(cause);
      if (cause instanceof ThemeReferenceUpdateError) { setFailedPublication(cause); setError(cause.message); setSession(session); await refresh(); return cause.saved; }
      setError(message.includes("其他位置更新") ? "主题文件已变化，尚未应用。当前草稿已保留，请选择保留修改并应用，或载入文件中的版本。" : themeSaveErrorMessage(cause, "主题未能保存，尚未应用。当前草稿已保留，请重试。"));
      if (message.includes("其他位置更新")) setExternalThemeState("changed");
      return null;
    } finally {
      setSavingThemes(current => { const next = new Set(current); next.delete(themeId); return next; });
    }
  };
  const restoreDefaults = async (scope: string) => {
    if (!session) return;
    try {
      const defaults = session.persisted ? await invoke<ThemeDocument | null>("read_theme_defaults", {themeId:session.themeId}) : session.saved;
      if (!defaults) throw new Error("主题默认文件不存在，请恢复文件后重试");
      sessionHost.restoreThemeDraft(session, defaults, scope);
      setFailedPublication(current => current?.saved.themeId === session.themeId ? null : current);
      setError("默认设置已恢复到草稿，应用后更新输出");
    } catch (cause) {
      if (cause instanceof ThemeReferenceUpdateError) setFailedPublication(cause);
      setError(cause instanceof Error ? cause.message : "无法恢复默认，请重试");
    } finally { setRestoreScope(null); setSession(session); await refresh(); }
  };
  const reloadExternalTheme = async () => {
    if (!session) return;
    try { setSession(prepareEditorSession(await sessionHost.reloadThemeSession(session))); setExternalThemeState(null); setError(""); }
    catch { setError("无法载入主题文件，当前草稿已保留。请检查文件后重试。"); }
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
      setError(!cleaned ? "主题已保存，但旧草稿记录未能清理，请重试清理草稿" : pendingApply && pendingApplyTarget.current ? `已应用到${targetLabel(pendingApplyTarget.current)}` : "主题已另存");
    } catch (cause) {
      setError(themeSaveErrorMessage(cause, "主题另存失败，请稍后重试"));
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
      setError(`“${deleteTarget.name}”正在用于${references.map(item => item.label).join("、")}，请先更换这些位置的主题`);
      setDeleteTarget(null);
      return;
    }
    if (!sessionHost.getDraftThemeDocument(deleteTarget.themeId)) await repository.deleteCustomTheme(deleteTarget.themeId);
    sessionHost.discardThemeSession(deleteTarget.themeId);
    const cleaned = await removeDraftRecord(deleteTarget.themeId);
    if (session?.themeId === deleteTarget.themeId) setSession(null);
    setDeleteTarget(null); await refresh(); setError(cleaned ? "主题已删除" : "主题已删除，但草稿记录未能清理，请重试清理草稿");
  };
  const updateCustomCss = (customCss: string) => {
    if (!session) return;
    sessionHost.updateThemeCustomCssDraft(session, customCss, css => {
      if (!css.trim()) return null;
      try { postcss.parse(css); return null; }
      catch (cause) { return cause instanceof Error ? cause.message : "CSS 语法有误"; }
    });
    setSession(session);
  };
  const updateVisualCss = (visualCss: string): string => {
    if (!session) return "主题尚未打开";
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
      catch (cause) { return { error: cause instanceof Error ? cause.message : 'CSS 语法有误' }; }
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
    return outcome.diagnostics?.length ? `提示：${outcome.diagnostics.join("；")}` : "";
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
        results.push(`${fileName}：已读取，等待确认${knownThemeIds.has(document.themeId) ? "主题标识冲突" : ""}`);
      }
      } catch (cause) { results.push(`${fileName}：${cause instanceof Error ? cause.message : "无法导入，请检查主题文件"}`); }
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
    if (action === "update") setError("主题已更新，重新应用后生效");
  };
  const importCss = async (mode: ThemeDocument["mode"], path: string, name: string, signal?: AbortSignal) => {
    let css: string;
    try {
      css = new TextDecoder().decode(await readThemePackageFile(path));
    } catch { throw new Error("无法读取 CSS 文件，请重新选择。"); }
    let document: ThemeDocument;
    try {
      document = createThemeFromCss({ themeId: crypto.randomUUID(), mode, name, css, importedAt: formatThemeTimestamp() });
    } catch { throw new Error("CSS 语法有误，请修改文件后重新导入。"); }
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
      if (loaded.url !== url || loaded.loading || loaded.error) throw new Error(loaded.error || "网址主题载入已取消");
      const draft = createLaplaceRemoteTheme({ id: crypto.randomUUID(), url, css: loaded.css, metadata: loaded.metadata, fetchedAt: formatThemeTimestamp() });
      draft.styles.baseCss = loaded.css;
      const main = await invoke<{finalUrl:string}>("load_theme_resource",{url,refresh:false,css:true});
      const document = (await localizeThemeResources(draft, main.finalUrl, themeDependencyLoader(),"preserve")).document;
      if (generation === laplacePreviewGenerationRef.current) setLaplaceUrlDraft({ url, document, loading: false, error: "" });
    } catch (cause) {
      if (generation === laplacePreviewGenerationRef.current) setLaplaceUrlDraft(current => current ? { ...current, document: null, loading: false, error: cause instanceof Error ? cause.message : "网址主题载入失败" } : current);
    }
  };
  const saveLaplaceUrlTheme = async () => {
    if (!laplaceUrlDraft?.document || laplaceReadyDocument !== laplaceUrlDraft.document) return;
    try {
      await confirmLaplaceRemoteTheme(laplaceUrlDraft.document.origin === "builtin" ? createLaplaceSavedCopy(laplaceUrlDraft.document) : laplaceUrlDraft.document, repository);
      setLaplaceUrlDraft(null);
      await refresh();
    } catch { setLaplaceUrlDraft(current => current ? { ...current, error: "网址主题保存失败，请稍后重试" } : current); }
  };
  const previewBlivechatHtml = async () => {
    if (!blivechatHtmlDraft?.url.trim()) return;
    const generation = ++blivechatPreviewGenerationRef.current;
    setBlivechatHtmlDraft(current => current ? { ...current, loading: true, ready: false, error: "", document: null } : current);
    try {
      const url = normalizeBlivechatExternalHtmlUrl(blivechatHtmlDraft.url.trim());
      const base = getThemeModeAdapter("blivechat").createBuiltinTheme();
      const document: ThemeDocument = { ...structuredClone(base), themeId: crypto.randomUUID(), origin: "custom", permissions: permissionsForOrigin("custom"), metadata: { name: "BLC 外部 HTML", author: "", version: "", updatedAt: "", sourceUrl: url, externalHtml: { url, sdk: "blivechat-1.0.1", verified: false } }, revision: 1 };
      if (generation === blivechatPreviewGenerationRef.current) setBlivechatHtmlDraft({ url, document, loading: true, ready: false, error: "" });
    } catch (cause) { if (generation === blivechatPreviewGenerationRef.current) setBlivechatHtmlDraft(current => current ? { ...current, loading: false, ready: false, error: cause instanceof Error ? cause.message : "外部 HTML 预览失败", document: null } : current); }
  };
  const saveBlivechatHtmlTheme = async () => {
    if (!blivechatHtmlDraft?.document || !blivechatHtmlDraft.ready) return;
    try { await repository.saveThemeDocument(blivechatHtmlDraft.document); setBlivechatHtmlDraft(null); await refresh(); }
    catch { setBlivechatHtmlDraft(current => current ? { ...current, error: "外部 HTML 另存失败，请稍后重试" } : current); }
  };
  const updateLaplaceUrlTheme = async (item: ThemeSummary) => {
    try {
      const current = await repository.loadThemeDocument(item.themeId);
      const result = await updateLaplaceRemoteTheme(current, async url => {
        const loaded = await loadRemoteCss(url, undefined, undefined, true);
        return { css: loaded.css, metadata: loaded.metadata, finalUrl:loaded.finalUrl };
      });
      if (result.error) { setError(`更新失败：${result.error}。已保留当前主题。`); return; }
      const main = await invoke<{finalUrl:string}>("load_theme_resource",{url:current.metadata.sourceUrl!,refresh:false,css:true});
      const localized = await localizeThemeResources(result.document, main.finalUrl, themeDependencyLoader(true),"preserve");
      await repository.saveThemeDocument(localized.document, {assetChanges:localized.assets,updateSource:true});
      sessionHost.discardThemeSession(current.themeId, true);
      await refresh();
      setError("主题已更新；正在使用的位置不会自动切换版本，请重新使用该主题后生效。");
    } catch { setError("更新失败，已保留当前主题，请稍后重试"); }
  };
  const createTheme = (mode: ThemeDocument["mode"]) => {
    setCreatePanelOpen(false);
    const base = getThemeModeAdapter(mode).createBuiltinTheme();
    const document: ThemeDocument = { ...structuredClone(base), themeId: crypto.randomUUID(), origin: "custom", permissions: permissionsForOrigin("custom"), metadata: { ...base.metadata, name: `新建${getThemeModeDefinition(mode).label}主题`, author: "", version: "", updatedAt: formatThemeTimestamp() }, revision: 1 };
    setSession(prepareEditorSession(sessionHost.createNewThemeSession(document, base.themeId)));
    setView("editor");
  };
  const exportTheme = async (item: ThemeSummary) => {
    const path = await saveFile({ defaultPath: `${item.name}.zip`, filters: [{ name: "主题包", extensions: ["zip"] }] });
    if (!path) return;
    try {
      const document = await repository.loadThemeDocument(item.themeId);
      await writeThemePackageFile(path, await completeThemePackage(document)); setError("主题已导出");
    } catch (cause) { setError(cause instanceof Error && /已取消|aborted/i.test(cause.message) ? "已取消导出" : cause instanceof Error && /素材|资源/.test(cause.message) ? `${cause.message}。请恢复素材后重新导出。` : "无法导出主题，请检查保存位置的写入权限后重试"); }
  };
  const exportSelected = async () => {
    const selected = summaries.filter(item => selectedThemeIds.has(item.themeId));
    if (!selected.length) return;
    const path = await saveFile({ defaultPath: "主题合集.zip", filters: [{ name: "主题合集", extensions: ["zip"] }] });
    if (!path) return;
    try {
      const entries: Record<string, Uint8Array> = {};
      for (const item of selected) {
        const document = await repository.loadThemeDocument(item.themeId);
        entries[`${item.name}-${item.themeId}.zip`] = await completeThemePackage(document);
      }
      await writeThemePackageFile(path, await zipEntriesBytesAsync(entries)); setError("主题已导出");
    } catch (cause) { setError(cause instanceof Error && /已取消|aborted/i.test(cause.message) ? "已取消导出" : cause instanceof Error && /素材|资源/.test(cause.message) ? `${cause.message}。请恢复素材后重新导出。` : "无法导出所选主题，请检查保存位置的写入权限后重试"); }
  };
  const exportAll = async () => {
    const path = await saveFile({ defaultPath: "全部主题.zip", filters: [{ name: "主题合集", extensions: ["zip"] }] });
    if (!path) return;
    try {
      const entries: Record<string, Uint8Array> = {};
      for (const item of summaries) {
        const document = await repository.loadThemeDocument(item.themeId);
        entries[`${item.name}-${item.themeId}.zip`] = await completeThemePackage(document);
      }
      await writeThemePackageFile(path, await zipEntriesBytesAsync(entries)); setError("主题已导出");
    } catch (cause) { setError(cause instanceof Error && /已取消|aborted/i.test(cause.message) ? "已取消导出" : cause instanceof Error && /素材|资源/.test(cause.message) ? `${cause.message}。请恢复素材后重新导出。` : "无法导出全部主题，请检查保存位置的写入权限后重试"); }
  };
  const exportCss = async (scope: NativeThemeCssExportScope) => {
    if (!session) return;
    if (session.visualCssError || session.customCssError) { setError("请先修正 CSS 错误再导出，当前草稿仍然保留"); return; }
    const suffix = { complete: "完整", "base-visual": "基础与可视化", visual: "可视化", custom: "自定义" }[scope];
    const path = await saveFile({ defaultPath: `${session.document.metadata.name}-${suffix}.css`, filters: [{ name: "CSS", extensions: ["css"] }] });
    if (!path) return;
    try {
      const local = {...session.document,assets:session.document.assets.filter(asset=>!asset.sourceUrl||!/^https?:/i.test(asset.sourceUrl))};
      const inlined = await inlineThemeAssetUrls(local, path => readThemeAssetDraft(path, session.assetChanges, savedPath => repository.readThemeAsset(session.document.themeId, savedPath)));
      const resolved = applyThemeAssetUrls(inlined,new Map(session.document.assets.filter(asset=>asset.sourceUrl&&/^https?:/i.test(asset.sourceUrl)).map(asset=>[asset.path,asset.sourceUrl!])));
      const bytes = new TextEncoder().encode(getThemeModeAdapter(session.document.mode).exportCss(resolved, scope));
      await writeThemePackageFile(path, bytes); setError("CSS 已导出");
    } catch (cause) { setError(cause instanceof Error && /已取消|aborted/i.test(cause.message) ? "已取消导出" : cause instanceof Error && /素材|资源/.test(cause.message) ? `${cause.message}。请恢复素材后重新导出。` : "无法导出 CSS，请检查保存位置的写入权限后重试"); }
  };
  const addAsset = async (replacementId?: string, imageOnly = false) => {
    if (!session) return;
    const replaced = session.document.assets.find(asset => asset.id === replacementId);
    const extensions = imageOnly ? ["png","apng","jpg","jpeg","webp","gif","svg"] : replaced ? replaced.mediaType.startsWith("image/") ? ["png","apng","jpg","jpeg","webp","gif","svg"] : ["woff","woff2","ttf","otf"] : ["png","apng","jpg","jpeg","webp","gif","svg","woff","woff2","ttf","otf"];
    const path = await open({ multiple: false, filters: [{ name: replaced ? replaced.mediaType.startsWith("image/") ? "图片" : "字体" : "图片或字体", extensions }] });
    if (!path) return;
    try {
      const fileName = path.split(/[\\/]/).pop() ?? "asset";
      const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
      const mediaType = ({ png: "image/png", apng: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml", woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf" } as Record<string, string>)[extension] ?? "application/octet-stream";
      const previous = session.document.assets.find(asset => asset.id === replacementId);
      if(previous && previous.mediaType.startsWith("image/") !== mediaType.startsWith("image/")) throw new Error("请选择同类型的图片或字体");
      const next = previous ? {...session.document,assets:session.document.assets.map(asset => asset === previous ? {...asset,name:fileName,mediaType,sharedResourceId:undefined,cacheResourceId:undefined,sourceUrl:undefined,resourceFileName:undefined} : asset)} : addThemeAsset(session.document, { id: crypto.randomUUID(), name: fileName, fileName, mediaType });
      const asset = previous ? next.assets.find(asset => asset.id === previous.id)! : next.assets[next.assets.length - 1]!;
      const bytes = await readThemePackageFile(path);
      asset.size = bytes.length;
      sessionHost.updateThemeAsset(session, document => ({ ...document, assets: next.assets }), asset.path, bytes);
      setSession(session);
      return asset.path;
    } catch { setError("无法添加主题资源，请重新选择文件"); }
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
      setError(`无法删除：${referenced.map(item => `“${item.theme}”正在用于${item.reference.label}`).join("；")}`);
      setDeleteSelectionOpen(false);
      return;
    }
    let cleaned = true;
    for (const item of selected) {
      await repository.deleteCustomTheme(item.themeId);
      sessionHost.discardThemeSession(item.themeId);
      cleaned = await removeDraftRecord(item.themeId) && cleaned;
    }
    setSelectedThemeIds(new Set()); setManageMode(false); await refresh(); setError(cleaned ? "所选自定义主题已删除" : "主题已删除，但部分草稿记录未能清理，请重试清理草稿");
  };
  const toggleThemeSelection = (themeId: string) => setSelectedThemeIds(current => {
    const next = new Set(current); if (next.has(themeId)) next.delete(themeId); else next.add(themeId); return next;
  });
  const selectCurrentCategory = () => setSelectedThemeIds(current => new Set([...current,...selectableVisible.map(item => item.themeId)]));
  const invertCurrentCategory = () => setSelectedThemeIds(current => {const next=new Set(current);for(const item of selectableVisible){if(next.has(item.themeId))next.delete(item.themeId);else next.add(item.themeId);}return next;});

  const publishToTarget = async (document: ThemeDocument, targetId: string, displayScale = scaleAt(targetId)) => {
    const targetKind = targetId === "live" ? "live" : "windows";
    if (!canApplyThemeMode(document.mode, targetKind)) throw new Error("当前主题不支持此位置");
    const resolved = await withThemeResources("正在准备主题", options => resolveThemeAssets(document, {}, true, options));
    const result = await getThemeModeAdapter(document.mode).publishTarget(resolved, {
      target: targetKind, targetId, roomId: String(useConnection.getState().state.roomId ?? ""), displayScale,
    }, targetKind === "live" ? applyThemeProjection : undefined);
    if (!result.rendered) throw new Error(result.message || "当前主题暂不可用");
    setAppliedThemeIds(current => ({ ...current, [targetId]: document.themeId }));
    setDisplayScales(current => ({ ...current, [targetId]: displayScale }));
  };
  const applySummary = async (item: ThemeSummary, targetId: string) => {
    try {
      await publishToTarget(await repository.loadThemeDocument(item.themeId), targetId);
      setError(`已应用到${targetLabel(targetId)}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "无法应用主题，请稍后重试"); }
  };
  const saveObsConfiguration = async (configuration: ObsDraft) => {
    if (savingObs) return;
    setSavingObs(true);
    setError("正在保存配置");
    try {
      const document = await repository.loadThemeDocument(configuration.themeId);
      const resolved = await withThemeResources("正在准备主题", options => resolveThemeAssets(document, {}, true, options));
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
      setError("配置已保存");
      const adapter = getThemeModeAdapter(document.mode);
      setError(adapter.rendererReady ? "配置已保存" : `${getThemeModeDefinition(document.mode).label}配置已保存；当前预览暂不可用，原有输出保持不变。`);
    } catch { setError(""); setError("无法保存 OBS 配置，请稍后重试"); }
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
      setDeleteObsOpen(false); setError("OBS 配置已删除");
    } catch (cause) {
      setError(cause instanceof ObsConfigurationDeleteError && !cause.restored
        ? "无法删除 OBS 配置，部分输出状态可能未恢复，请重新应用主题后再试"
        : "无法删除 OBS 配置，原有输出已恢复，请稍后重试");
    }
  };
  const appliedSummary = (target: string) => summaries.find(item => item.themeId === themeIdAt(target));
  const updateDisplayScale = async (targetId: string, value: number) => {
    const displayScale = Math.max(0.5, Math.min(3, value));
    try {
      const bindings = await loadThemeBindings();
      const ownBinding = bindings.find(item => item.targetId === targetId);
      const binding = ownBinding ?? (targetId.startsWith("windows:") ? bindings.find(item => item.targetId === "windows") : undefined);
      if (!binding) throw new Error("目标尚未绑定主题");
      const document = await repository.loadThemeDocument(binding.themeId);
      const adapter = getThemeModeAdapter(document.mode);
      if (!adapter.rendererReady) throw new Error("当前主题预览暂不可用");
      if (!ownBinding) await publishToTarget(document, targetId, displayScale);
      else await adapter.updateScale(binding.targetId, binding.targetKind, displayScale, binding.targetKind === "live" ? applyThemeProjection : undefined);
      setDisplayScales(current => ({ ...current, [targetId]: displayScale }));
    } catch { setError("请先为该位置选择主题，再设置显示缩放"); }
  };
  useEffect(()=>{
    const panel=document.querySelector<HTMLElement>(".theme-info-dialog");
    if(!themeInfoDraft || !panel)return;
    return bindUiDismissableLayer(panel,()=>{if(!savingThemeInfo){setThemeInfoDraft(null);setPendingApply(false);}},{modal:true});
  },[Boolean(themeInfoDraft),savingThemeInfo]);
  useEffect(()=>{
    if(!pendingImport || resourceProgress)return;
    const panel=document.querySelector<HTMLElement>('[aria-label="确认导入主题"] .theme-name-dialog');
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
    try { const status = await obsServiceStatus(); if (!status.running) throw new Error(status.error || "请先启动 OBS 服务"); const url = obsOutputUrl(status.port, configuration); if(copy){await navigator.clipboard.writeText(url);setError("地址已复制");}else await openUrl(url); } catch(cause){setError(cause instanceof Error?cause.message:String(cause));}
  };
  const selectedObsAnchor = selectedObs ? anchors.find(anchor => String(anchor.realRoomId) === selectedObs.roomId) : undefined;

  return <ThemeImageAssetsContext.Provider value={{ images: (session?.document.assets ?? []).filter(asset => asset.mediaType.startsWith("image/")).map(asset => ({path:asset.path,name:asset.name,ready:assetPreviewUrls.has(asset.path)||Boolean(asset.sourceUrl),url:assetPreviewUrls.get(asset.path) ?? asset.sourceUrl ?? asset.path})), add: () => addAsset(undefined, true) }}><section className="theme-workspace-page" aria-label="样式" data-active={active || undefined} data-view={view}>
    {view === "home" && <header className="theme-workspace-page-header">
      <>
        <div><h1>样式</h1><p>管理现场、副窗口和 OBS 使用的事件主题</p></div>
        <div className="theme-workspace-header-actions"><button type="button" className="theme-obs-entry theme-editor-action" onClick={() => setView("obs")}>OBS 设置</button></div>
      </>
    </header>}
    <WorkspaceNotice key={notice.revision} message={error} onDismiss={() => {setError("");}} />
    {pendingDraftCleanup.length > 0 && <button type="button" className="ui-btn" onClick={() => void retryDraftCleanup()}>重试清理草稿</button>}
    {draftLoadError && <button type="button" className="ui-btn" onClick={() => void restoreStoredDrafts().then(refresh)}>重试读取草稿</button>}
    {(failedPublication || externalThemeState) && <div className="theme-workspace-recovery">
      {failedPublication && <button type="button" disabled={retryingPublication} onClick={() => void retryFailedPublication()}>{retryingPublication ? "正在更新" : "重试更新"}</button>}
      {externalThemeState === "deleted" && session && <button type="button" onClick={() => setThemeInfoDraft({mode:"save",name:`${session.document.metadata.name} 恢复`,author:session.document.metadata.author,version:session.document.metadata.version})}>另存为恢复</button>}
      {externalThemeState === "changed" && <><button type="button" disabled={applyingThemes.has(session?.themeId ?? "")} onClick={() => void apply(editorApplyTarget, true)}>保留我的修改并应用</button><button type="button" onClick={() => setReloadExternalOpen(true)}>载入文件中的版本</button></>}
    </div>}
    {reloadExternalOpen && <ConfirmDialog title="载入文件中的版本？" description="当前未保存的修改将被文件中的内容替换。" confirmLabel="载入文件" onCancel={() => setReloadExternalOpen(false)} onConfirm={() => { setReloadExternalOpen(false); void reloadExternalTheme(); }} />}
    {restoreScope && session && <ConfirmDialog title="恢复默认设置？" description={`将恢复“${session.document.metadata.name}”的${({basic:"基础设置",visual:"可视化 CSS",custom:"自定义 CSS",all:"全部设置"} as Record<string,string>)[restoreScope]}，放弃该范围未保存的修改，应用后才更新使用此主题的输出。其他范围的草稿保留。`} confirmLabel="恢复默认" onCancel={() => setRestoreScope(null)} onConfirm={() => restoreDefaults(restoreScope)} />}
    {resourceProgress && <div className="theme-name-overlay" role="dialog" aria-modal="true" aria-label="准备主题"><div className="theme-name-dialog"><h3>{resourceProgress.label}</h3><p role="status">已准备 {resourceProgress.completed} 项素材</p><button type="button" onClick={()=>resourceAbort.current?.abort()}>取消</button></div></div>}
    {view === "home" ? <main className="theme-workspace-home">
      <section className="theme-workspace-current-uses" aria-labelledby="current-theme-heading">
        <div className="theme-workspace-section-heading theme-current-use-heading">
          <div><h2 id="current-theme-heading">当前使用</h2><p>现场和副窗口可分别进入设置；主题编辑不会自动应用。</p></div>
          <div className="theme-window-mode"><span>副窗口样式</span><SettingsChoiceControl label="副窗口样式" value={windowThemes.mode} options={[{ value: "unified", label: "全部一样" }, { value: "separate", label: "分别设置" }]} onChange={value => void changeWindowThemeMode(value as WindowThemeMode)} /></div>
        </div>
        <div className="theme-current-use-cards" role="group" aria-label="当前使用的主题">
          {destinations.map(({ id: target, label }) => {
            const summary = appliedSummary(target);
            const Icon = themeTargetIcon(label);
            return <PopoverPrimitive.Root key={target}>
              <PopoverPrimitive.Trigger asChild>
                <button type="button" className="theme-current-use-card" aria-label={`${label}：${summary?.name ?? "主题文件缺失"}，${Math.round(scaleAt(target) * 100)}%`} title={`${label} · ${summary?.name ?? "主题文件缺失"} · ${Math.round(scaleAt(target) * 100)}%`} onFocus={event => event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" })}>
                  <Icon size={16} aria-hidden="true" /><span>{label}</span><strong>{summary?.name ?? "主题文件缺失"}</strong><span className="theme-current-use-scale">{Math.round(scaleAt(target) * 100)}%</span>
                </button>
              </PopoverPrimitive.Trigger>
              <PopoverPrimitive.Portal>
                <PopoverPrimitive.Content className="theme-current-use-popover" align="start" sideOffset={8} collisionPadding={12} aria-label={`${label}主题设置`}>
                  <h3><Icon size={16} aria-hidden="true" />{label}</h3>
                  <label><span>主题</span><UiSelect ariaLabel={`${label}主题`} size="standard" value={themeIdAt(target)} options={obsThemeOptions({ themeId: themeIdAt(target) }, summaries.filter(item => canApplyThemeMode(item.mode, target === "live" ? "live" : "windows") && !(target === "live" && item.externalHtml)))} onValueChange={value => { const item = summaries.find(item => item.themeId === value); if (item) void applySummary(item, target); }} /></label>
                  <label><span>显示缩放</span><span className="theme-unit-input"><input aria-label={`${label}显示缩放`} type="number" min="50" max="300" step="5" value={Math.round(scaleAt(target) * 100)} onChange={event => void updateDisplayScale(target, Number(event.target.value) / 100)} /><span>%</span></span></label>
                  <PopoverPrimitive.Close asChild><button type="button" className="theme-current-use-edit" onClick={() => void openTheme(themeIdAt(target), target)}><Pencil size={16} aria-hidden="true" />编辑主题</button></PopoverPrimitive.Close>
                </PopoverPrimitive.Content>
              </PopoverPrimitive.Portal>
            </PopoverPrimitive.Root>;
          })}
        </div>
      </section>
      <section className="theme-workspace-library" aria-label="主题库" aria-labelledby="native-library-heading">
        <div className="theme-workspace-section-heading"><div><h2 id="native-library-heading">主题库</h2><p>选择已保存主题使用或编辑。</p></div><div className="theme-library-heading-actions"><span>{visible.length} 个主题</span><button type="button" onClick={() => themeCategory === "all" ? setCreatePanelOpen(true) : createTheme(themeCategory)}>新建主题</button><button type="button" onClick={() => setImportPanelOpen(true)}>导入</button>{importResults.length > 0 && <PopoverPrimitive.Root><PopoverPrimitive.Trigger asChild><button type="button">导入结果</button></PopoverPrimitive.Trigger><PopoverPrimitive.Portal><PopoverPrimitive.Content className="theme-import-results-popover" align="end" sideOffset={6} collisionPadding={12} aria-label="导入结果"><strong>导入结果</strong>{importResults.map((result,index)=><p key={index}>{result}</p>)}</PopoverPrimitive.Content></PopoverPrimitive.Portal></PopoverPrimitive.Root>}<button type="button" onClick={() => void exportAll()}>导出全部主题</button><button type="button" onClick={() => { setManageMode(value => !value); setSelectedThemeIds(new Set()); }}>{manageMode ? "完成" : "管理"}</button></div></div>
        <div className="theme-library-controls"><div className="theme-library-toolbar"><div className="theme-category-tabs" role="tablist" aria-label="主题类型">{THEME_CATEGORIES.map(([id, label]) => <button type="button" role="tab" aria-selected={themeCategory === id} className={themeCategory === id ? "is-active" : ""} onClick={() => { setThemeCategory(id); }} key={id}>{label}</button>)}</div><UiSearchInput className="theme-library-search" aria-label="搜索主题名称或作者" placeholder="搜索主题名称或作者" value={themeSearch} onValueChange={setThemeSearch} /></div>
        {manageMode && <div className="theme-selection-bar"><span>已选 {selectedThemeIds.size} 项</span><button type="button" disabled={!selectableVisible.length} onClick={selectCurrentCategory}>全选当前结果</button><button type="button" disabled={!selectableVisible.length} onClick={invertCurrentCategory}>反选当前结果</button><button type="button" disabled={!selectedThemeIds.size} onClick={() => void exportSelected()}>导出所选</button><button type="button" className="is-danger" disabled={!selectedThemeIds.size} onClick={() => { if (!summaries.some(item => selectedThemeIds.has(item.themeId) && item.origin === "custom")) { setError("内置主题不能删除"); return; } setDeleteSelectionOpen(true); }}>删除所选</button></div>}
        </div>
        <div className="theme-library-grid">
          {visible.map(item => { const draftDocument = sessionHost.getDraftThemeDocument(item.themeId); return <article className={`theme-library-card${selectedThemeIds.has(item.themeId) ? " is-selected" : ""}`} key={item.themeId} tabIndex={0} aria-label={manageMode ? `选择 ${item.name}` : `编辑 ${item.name}`} onClick={event => {
              if ((event.target as Element).closest("button,input,label,a") || window.getSelection()?.toString()) return;
              if(manageMode){if(!draftThemeIds.has(item.themeId))toggleThemeSelection(item.themeId);}else void openTheme(item.themeId);
            }} onKeyDown={event => {if(event.target!==event.currentTarget || ![" ","Enter"].includes(event.key))return;event.preventDefault();if(manageMode){if(!draftThemeIds.has(item.themeId))toggleThemeSelection(item.themeId);}else void openTheme(item.themeId);}}>
            {!draftThemeIds.has(item.themeId) && manageMode && <label className="theme-library-select"><input type="checkbox" aria-label={`选择 ${item.name}`} checked={selectedThemeIds.has(item.themeId)} onChange={() => toggleThemeSelection(item.themeId)} /></label>}
            <ThemeModeThumbnail mode={item.mode} themeId={item.themeId} revision={item.revision} displayPreferences={displayPreferences} load={draftDocument ? async () => resolveThemeAssets(structuredClone(draftDocument), sessionHost.getDraftThemeAssetChanges(item.themeId)) : resolveSavedThemeForObsPreview} />
            <div className="theme-library-card-copy"><div><strong>{item.name}</strong><span>{draftThemeIds.has(item.themeId) ? "未保存草稿" : item.origin === "builtin" ? "内置主题" : "自定义主题"}</span></div><div className="theme-library-tags"><span className="theme-library-format-label">{item.mode === "native" ? "原生" : getThemeModeDefinition(item.mode).label}</span>{item.adjusted&&<span>已调整</span>}{appliedThemeIds.live===item.themeId&&<span>现场使用中</span>}{destinations.some(target=>target.id!=="live"&&themeIdAt(target.id)===item.themeId)&&<span>副窗口使用中</span>}</div><p>作者：{item.author || "未标注"}<span aria-hidden="true"> · </span>版本：{item.version || "未标注"}</p></div>
            <div className="theme-library-card-actions" hidden={manageMode}>
              {!draftThemeIds.has(item.themeId) && getThemeModeDefinition(item.mode).targets.length > 0 && <ThemeActionMenu label={`使用 ${item.name}`} className="theme-library-use-trigger" items={destinations.filter(target => canApplyThemeMode(item.mode, target.id === "live" ? "live" : "windows")).map(target => {
                const Icon = themeTargetIcon(target.label);
                const unsupported = target.id === "live" && Boolean(item.externalHtml);
                return { label: unsupported ? "外部 HTML 不支持现场" : `用于${target.label}`, icon: <Icon size={16} aria-hidden="true" />, current: !unsupported && themeIdAt(target.id) === item.themeId, disabled: unsupported, title: unsupported ? "外部 HTML 仅支持弹幕窗、收益窗和 OBS" : undefined, action: () => void applySummary(item, target.id) };
              })}><Check size={16} aria-hidden="true" />使用<ChevronDown size={14} aria-hidden="true" /></ThemeActionMenu>}
              {getThemeModeDefinition(item.mode).editable && <button type="button" onClick={() => void openTheme(item.themeId)}>编辑</button>}
              {!draftThemeIds.has(item.themeId) && <button type="button" onClick={() => void exportTheme(item)}>导出</button>}
              {draftThemeIds.has(item.themeId) && <button type="button" className="is-danger" onClick={() => setDeleteTarget(item)}>删除</button>}
              {!draftThemeIds.has(item.themeId) && item.origin === "custom" && <>{item.mode === "laplace" && item.sourceUrl && <button type="button" onClick={() => void updateLaplaceUrlTheme(item)}>更新</button>}<button type="button" onClick={() => setThemeInfoDraft({ mode: "rename", name: item.name, author: item.author, version: item.version, target: item })}>主题信息</button><button type="button" className="is-danger" onClick={() => setDeleteTarget(item)}>删除</button></>}
            </div>
          </article>})}
          {!visible.length && <div className="theme-workspace-empty"><p>{themeSearch.trim() ? "没有找到匹配的主题" : "这个分类还没有主题"}</p>{themeSearch.trim() ? <button type="button" onClick={() => setThemeSearch("")}>清除搜索</button> : <p>可使用上方的新建或导入按钮添加主题。</p>}</div>}
        </div>
      </section>
    </main> : view === "obs" ? <main className="theme-obs-page">
      <header className="theme-obs-page-nav"><button type="button" className="theme-obs-back" onClick={() => { setError(""); setView("home"); }}><ChevronLeftIcon /><span>返回样式</span></button></header>
      <div className="theme-obs-page-heading"><div><h1>OBS 配置</h1><p>为直播间配置浏览器输出，房间与主题分别保存。</p></div><button type="button" className="is-primary" onClick={() => { const themeId=summaries.find(theme=>canApplyThemeMode(theme.mode,"obs"))?.themeId ?? defaultThemeId("obs"); const item:ObsDraft={id:createObsConfigurationId(obsDrafts.map(item=>item.id)),name:"新配置",roomId:"",themeId,themeRevision:summaries.find(theme=>theme.themeId===themeId)?.revision??1}; setObsDrafts(current=>[...current,item]); setSelectedObsId(item.id); }}>新建配置</button></div>
      <ObsServiceSettings configurations={obsDrafts} onNotice={setError}/>
      <div className="theme-obs-layout"><section className="theme-obs-list">{obsDrafts.map(item=>{const anchorName=item.anchorName || anchors.find(anchor=>String(anchor.realRoomId)===item.roomId)?.uname;return <div className="theme-obs-list-entry" key={item.id}><button type="button" className={selectedObsId===item.id?"is-active":""} onClick={()=>{ setSelectedObsId(item.id); setError(""); }}><strong className="theme-obs-list-name">{item.name}</strong><span className="theme-obs-list-meta">{anchorName ? `${anchorName}${item.roomId ? ` · 直播间 ${item.roomId}` : ""}` : "未选择主播"}</span><span>{summaries.find(theme=>theme.themeId===item.themeId)?.name || item.themeName || "未选择主题"} · {getThemeModeDefinition(summaries.find(theme=>theme.themeId===item.themeId)?.mode ?? "native").label}</span></button><button type="button" className="theme-obs-list-copy" disabled={!persistedObsConfigurations.current.has(item.id)} onClick={()=>void openObsAddress(true,persistedObsConfigurations.current.get(item.id))} aria-label={`复制 ${item.name} 的 OBS 地址`}>复制 OBS 地址</button></div>;})}{!obsDrafts.length&&<div className="theme-workspace-empty"><p>还没有 OBS 配置</p><p>使用上方“新建配置”添加直播间和主题，保存后可复制 OBS 地址。</p></div>}</section>
      <section className="theme-obs-detail-panel">{selectedObs ? <><div className="theme-obs-detail"><label className="theme-obs-name-field">名称<input value={selectedObs.name} onChange={event=>{namedObsDrafts.current.add(selectedObs.id);setObsDrafts(current=>current.map(item=>item.id===selectedObs.id?{...item,name:event.target.value}:item));}}/></label>
        <label className="theme-obs-room-field">房间号<input aria-label="OBS 房间号" inputMode="numeric" value={selectedObs.roomId} onChange={event=>setObsDrafts(current=>current.map(item=>item.id===selectedObs.id?{...item,roomId:event.target.value.trim(),anchorName:anchors.find(anchor=>String(anchor.realRoomId)===event.target.value.trim())?.uname}:item))}/></label><div className="theme-obs-anchor-picker"><span>主播</span><PopoverPrimitive.Root open={obsAnchorOpen} onOpenChange={setObsAnchorOpen}><PopoverPrimitive.Trigger asChild><button type="button" className="theme-obs-anchor-trigger theme-obs-anchor-card" aria-label="选择主播">{selectedObsAnchor?.face?<img src={selectedObsAnchor.face} alt=""/>:<span className="theme-obs-anchor-fallback">{(selectedObs.anchorName || selectedObsAnchor?.uname || "未").slice(0,1)}</span>}<span><strong>{selectedObs.anchorName || selectedObsAnchor?.uname || "选择主播"}</strong><small>{selectedObs.roomId ? `直播间 ${selectedObs.roomId}` : "尚未选择"}</small></span></button></PopoverPrimitive.Trigger><PopoverPrimitive.Portal><PopoverPrimitive.Content className="theme-obs-anchor-popover" sideOffset={6} align="start" collisionPadding={12}><div className="theme-obs-anchor-list">{anchors.map(anchor=><button type="button" className={`theme-obs-anchor-card${selectedObs.roomId===String(anchor.realRoomId)?" is-active":""}`} onClick={()=>{setObsDrafts(current=>current.map(item=>item.id===selectedObs.id?{...item,roomId:String(anchor.realRoomId),anchorName:anchor.uname}:item));setObsAnchorOpen(false);}} key={anchor.realRoomId}>{anchor.face?<img src={anchor.face} alt=""/>:<span className="theme-obs-anchor-fallback">{anchor.uname.slice(0,1)}</span>}<span><strong>{anchor.uname}</strong><small>直播间 {anchor.realRoomId}</small></span></button>)}{!anchors.length&&<p>连接过直播间后，可在这里选择主播。</p>}</div></PopoverPrimitive.Content></PopoverPrimitive.Portal></PopoverPrimitive.Root></div>
        <label>主题<UiSelect ariaLabel="OBS 主题" value={selectedObs.themeId} onValueChange={themeId=>setObsDrafts(current=>current.map(item=>item.id===selectedObs.id?{...item,themeId,themeName:summaries.find(theme=>theme.themeId===themeId)?.name}:item))} options={selectedObsThemeOptions}/></label>{!selectedObsTheme&&<p className="theme-obs-unavailable">原主题已删除，请选择其他主题后保存。已保存的预览仍可查看。</p>}<div className="theme-obs-choice-field"><span>明暗</span><SettingsChoiceControl label="OBS 输出明暗" value={selectedObs.scheme ?? "follow"} onChange={value=>setObsDrafts(current=>current.map(item=>item.id===selectedObs.id?{...item,scheme:value as "follow"|"light"|"dark"}:item))} options={[{value:"follow",label:"跟随软件"},{value:"light",label:"浅色"},{value:"dark",label:"深色"}]} /></div><label>显示缩放<span className="theme-unit-input"><input aria-label="OBS 显示缩放" type="number" min="50" max="300" step="5" value={Math.round((displayScales[selectedObs.id] ?? 1) * 100)} onChange={event=>setDisplayScales(current=>({...current,[selectedObs.id]:Number(event.target.value)/100}))}/><span>%</span></span></label><div className="obs-link-actions"><button type="button" disabled={!savedObs} onClick={()=>void openObsAddress(true)}>复制 OBS 地址</button><button type="button" disabled={!savedObs} onClick={()=>void openObsAddress()}>浏览器打开</button><small>{savedObs?"地址使用已保存配置；修改后请保存配置。":"保存配置后即可生成地址。"}</small></div></div><div className="theme-obs-detail-actions"><button type="button" className="is-primary" disabled={savingObs || !selectedObsTheme || !/^\d+$/.test(selectedObs.roomId) || Number(selectedObs.roomId)<=0} onClick={()=>void saveObsConfiguration(selectedObs)}>保存配置</button><button type="button" className="is-danger" onClick={()=>setDeleteObsOpen(true)}>删除配置</button></div></>:<p>选择或新建一项配置</p>}</section></div>
      {active && previewTarget && selectedObs && createPortal(<ObsManagementPreview previewHeaderTarget={previewHeaderTarget} configuration={selectedObs} saved={savedObs} displayScale={displayScales[selectedObs.id] ?? 1} loadDocument={resolveSavedThemeForObsPreview} geometry={previewGeometry}/>, previewTarget)}
    </main> : <div className="theme-editor-stage">
        {session && getThemeModeAdapter(session.document.mode).editor === "native" ? <NativeThemeEditor
          previewActive={active && view === "editor" && Boolean(previewTarget)}
          document={session.document}
          previewDocument={editorPreviewDocument?.source === session.document ? editorPreviewDocument.resolved : session.document}
          visualCss={session.visualCssDraft}
          customCss={session.customCssDraft}
          cssMessage={session.customCssError || session.visualCssError || (session.visualCssDiagnostics.length ? `提示：${session.visualCssDiagnostics.join("；")}` : "")}
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
          onSaveAs={() => setThemeInfoDraft({mode:"save",name:`${session.document.metadata.name} 副本`,author:session.document.metadata.author,version:session.document.metadata.version})}
          onRestore={scope => setRestoreScope(scope)}
          onEditMetadata={() => session && setThemeInfoDraft({ mode: "edit", name: session.document.metadata.name, author: session.document.metadata.author, version: session.document.metadata.version })}
          onApply={() => void apply()}
          applyLabel={editorApplyTarget ? `应用到${targetLabel(editorApplyTarget)}` : "应用"}
          applyTargets={editorApplyTarget ? undefined : destinations.filter(target => canApplyThemeMode(session.document.mode, target.id === "live" ? "live" : "windows") && !(target.id === "live" && session.document.metadata.externalHtml)).map(target => ({ label: `应用到${target.label}`, action: () => void apply(target.id) }))}
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
          cssMessage={session.customCssError || session.visualCssError || (session.visualCssDiagnostics.length ? `提示：${session.visualCssDiagnostics.join("；")}` : "")}
          fontFamilyOptions={fontFamilyOptions}
          basicControls={compatibleEditingSurface.renderBasicControls?.({ document: session.document, onSettingsChange: updateCompatibleSettings })}
          advancedControls={session.document.mode === "blivechat" ? <div className="native-advanced-option"><div><h3>外部 HTML</h3><p>用于副窗口和 OBS。</p></div><button type="button" onClick={() => { blivechatPreviewGenerationRef.current += 1; setBlivechatHtmlDraft({ url: "", document: null, loading: false, ready: false, error: "" }); }}>加载外部 HTML</button></div> : session.document.mode === "laplace" ? <div className="native-advanced-option native-scene-option"><label htmlFor="theme-scene-name">场景</label><input id="theme-scene-name" aria-label="场景" placeholder="例如 blue" value={String(session.document.settings.sceneName ?? "")} onChange={event => updateCompatibleSettings({ ...session.document.settings, sceneName: event.target.value })} /><details className="native-advanced-help"><summary>OBS 场景联动</summary><p>预览主题已有的场景样式，例如 blue、spring。OBS 浏览器源页面权限需设为“读取用户信息”，修改后刷新该源。场景名支持 [scene:blue] 和 [scene: blue]；添加 [dark] 启用深色模式。</p></details></div> : undefined}
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
          onSaveAs={() => setThemeInfoDraft({mode:"save",name:`${session.document.metadata.name} 副本`,author:session.document.metadata.author,version:session.document.metadata.version})}
          onRestore={scope => setRestoreScope(scope)}
          onEditMetadata={() => setThemeInfoDraft({ mode: "edit", name: session.document.metadata.name, author: session.document.metadata.author, version: session.document.metadata.version })}
          onApply={() => void apply()}
          applyLabel={editorApplyTarget ? `应用到${targetLabel(editorApplyTarget)}` : "应用"}
          applyTargets={editorApplyTarget ? undefined : destinations.filter(target => canApplyThemeMode(session.document.mode, target.id === "live" ? "live" : "windows") && !(target.id === "live" && session.document.metadata.externalHtml)).map(target => ({ label: `应用到${target.label}`, action: () => void apply(target.id) }))}
        /> : session ? <section className="theme-editor-empty" aria-label={`${getThemeModeDefinition(session.document.mode).label}编辑`}><h2>{session.document.metadata.name}</h2><p>当前可以修改主题信息并保存为自定义主题；可视化编辑和预览暂不可用。</p><div><button type="button" onClick={() => returnHome()}>返回样式</button><button type="button" onClick={() => setThemeInfoDraft({ mode: "edit", name: session.document.metadata.name, author: session.document.metadata.author, version: session.document.metadata.version })}>主题信息</button><button type="button" className="is-primary" onClick={() => void save()}>{session.document.origin === "builtin" ? "另存为" : "保存"}</button></div></section> : <div className="theme-editor-empty">正在准备主题…</div>}
      </div>}
    {themeInfoDraft && <div className="theme-name-overlay" role="dialog" aria-modal="true" aria-label="主题信息"><div className="theme-name-dialog theme-info-dialog">
      <h3>主题信息</h3>{savingThemeInfo && <p role="status">保存中…</p>}
      <ThemeMetadataDetails document={themeInfoDraft.mode === "rename" ? undefined : session?.document} themeId={themeInfoDraft.target?.themeId} load={repository.loadThemeDocument} />
      {builtinInfoReadonly ? <dl className="theme-metadata-details">{([['名称', themeInfoDraft.name], ['作者', themeInfoDraft.author], ['版本', themeInfoDraft.version]] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "未标注"}</dd></div>)}</dl> : <>
        <label>名称<input disabled={savingThemeInfo} value={themeInfoDraft.name} onChange={event => setThemeInfoDraft(current => current ? { ...current, name: event.target.value } : current)} aria-label="主题名称" /></label>
        <label>作者<input disabled={savingThemeInfo} value={themeInfoDraft.author} onChange={event => setThemeInfoDraft(current => current ? { ...current, author: event.target.value } : current)} aria-label="主题作者" /></label>
        <label>版本<input disabled={savingThemeInfo} value={themeInfoDraft.version} onChange={event => setThemeInfoDraft(current => current ? { ...current, version: event.target.value } : current)} aria-label="主题版本" /></label>
      </>}
      <div><button type="button" disabled={savingThemeInfo} onClick={() => { setThemeInfoDraft(null); setPendingApply(false); }}>{builtinInfoReadonly ? "关闭" : "取消"}</button>
        {!builtinInfoReadonly && <button type="button" className="is-primary" disabled={savingThemeInfo || !themeInfoDraft.name.trim()} aria-busy={savingThemeInfo} onClick={() => {
          void (themeInfoDraft.mode === "save" ? saveAs() : themeInfoDraft.mode === "edit" ? editThemeInfo() : (async () => {
            const target = await repository.loadThemeDocument(themeInfoDraft.target!.themeId);
            await repository.saveThemeDocument({ ...target, revision: target.revision + 1, metadata: { ...target.metadata, name: themeInfoDraft.name.trim(), author: themeInfoDraft.author.trim(), version: themeInfoDraft.version.trim(), localModifiedAt: formatThemeTimestamp() } });
            setThemeInfoDraft(null); await refresh();
          })());
        }}>{themeInfoDraft.mode === "edit" ? "确认修改" : "保存"}</button>}
      </div>
    </div></div>}
    {deleteTarget && <ConfirmDialog title={`删除“${deleteTarget.name}”？`} description="删除后无法恢复；正在使用的主题不能删除。" confirmLabel="删除主题" confirmTone="danger" onCancel={() => setDeleteTarget(null)} onConfirm={deleteTheme} />}
    {deleteSelectionOpen && <ConfirmDialog title="删除所选自定义主题？" description={`将删除 ${summaries.filter(item=>selectedThemeIds.has(item.themeId)&&item.origin==="custom").length} 个自定义主题：${summaries.filter(item=>selectedThemeIds.has(item.themeId)&&item.origin==="custom").map(item=>item.name).join("、")}。内置主题保留，删除后无法恢复。`} confirmLabel="删除所选" confirmTone="danger" onCancel={() => setDeleteSelectionOpen(false)} onConfirm={deleteSelected} />}
    {deleteObsOpen && selectedObs && <ConfirmDialog title={`删除“${selectedObs.name}”？`} description="只删除这项 OBS 配置，不会删除主播记录或主题。" confirmLabel="删除配置" confirmTone="danger" onCancel={() => setDeleteObsOpen(false)} onConfirm={() => deleteObsConfiguration(selectedObs)} />}
    {pendingImport && <div className="theme-name-overlay" role="dialog" aria-modal="true" aria-label="确认导入主题"><div className="theme-name-dialog"><h3>确认导入主题</h3>{error && <p role="alert">{error}</p>}<p className="ui-type-control text-t2">{summaries.some(item => item.themeId === pendingImport.document.themeId && item.origin === "builtin") ? "内置主题不能覆盖，请导入为副本。" : summaries.some(item => item.themeId === pendingImport.document.themeId) ? `主题标识 ${pendingImport.document.themeId} 已存在。选择更新、复制为新主题或跳过。` : `导入“${pendingImport.document.metadata.name}”（${getThemeModeDefinition(pendingImport.document.mode).label}）。`}</p><div><button type="button" onClick={() => { setError(""); setImportResults(current => [...current, `${pendingImport.document.metadata.name}：已跳过`]); setPendingImports(current => current.slice(1)); }}>跳过导入</button><button type="button" onClick={() => void installImportedTheme({ ...pendingImport.document, metadata: { ...pendingImport.document.metadata, name: `${pendingImport.document.metadata.name} 副本` } }, pendingImport.assets, "copy").then(() => setImportResults(current => [...current, `${pendingImport.document.metadata.name}：已导入为副本`])).catch(cause => setError(cause instanceof Error ? cause.message : "无法导入主题，请检查程序目录写入权限后重试"))}>导入为副本</button><button type="button" className="is-primary" disabled={summaries.some(item => item.themeId === pendingImport.document.themeId && item.origin === "builtin")} onClick={() => void installImportedTheme(pendingImport.document, pendingImport.assets, "update").then(() => setImportResults(current => [...current, `${pendingImport.document.metadata.name}：${summaries.some(item => item.themeId === pendingImport.document.themeId) ? "已更新" : "已导入"}`])).catch(cause => setError(cause instanceof Error ? cause.message : "无法导入主题，请检查程序目录写入权限后重试"))}>{summaries.some(item => item.themeId === pendingImport.document.themeId) ? "更新现有主题" : "导入主题"}</button></div></div></div>}
    {createPanelOpen && <ThemeCreateDialog onClose={() => setCreatePanelOpen(false)} onCreate={createTheme} />}
    {importPanelOpen && <ThemeImportDialog onClose={() => setImportPanelOpen(false)} onTheme={importTheme} onCss={importCss} onUrl={url => { setImportPanelOpen(false); laplaceSourceCoordinatorRef.current?.cancel(); setLaplaceUrlDraft({ url, document: null, loading: false, error: "" }); }} />}
    {laplaceUrlDraft && <div className="theme-name-overlay" role="dialog" aria-modal="true" aria-label="导入 LAPLACE 远程主题"><div className="theme-name-dialog theme-url-dialog">
      <h3>导入 LAPLACE 远程主题</h3>
      <div className="theme-url-dialog-body">
        <label>CSS 网址<input value={laplaceUrlDraft.url} onChange={event => { laplacePreviewGenerationRef.current += 1; laplaceSourceCoordinatorRef.current?.cancel(); setLaplaceUrlDraft(current => current ? { ...current, url: event.target.value, document: null, loading: false, error: "" } : current); }} placeholder="https://example.com/theme.css" /></label>
        {laplaceUrlDraft.error && <p role="alert">{laplaceUrlDraft.error}</p>}
        {laplaceUrlDraft.document && <><dl><div><dt>名称</dt><dd>{laplaceUrlDraft.document.metadata.name}</dd></div><div><dt>作者</dt><dd>{laplaceUrlDraft.document.metadata.author || "未标注"}</dd></div><div><dt>版本</dt><dd>{laplaceUrlDraft.document.metadata.version || "未标注"}</dd></div></dl><CompatibleThemeThumbnail mode="laplace" themeId={laplaceUrlDraft.document.themeId} revision={1} load={loadLaplacePreviewDocument} onPreviewReady={laplacePreviewReady} onPreviewFailure={laplacePreviewFailure} /></>}
      </div>
      <div className="theme-url-dialog-actions"><button type="button" onClick={() => { laplacePreviewGenerationRef.current += 1; laplaceSourceCoordinatorRef.current?.cancel(); setLaplaceUrlDraft(null); }}>取消</button><button type="button" disabled={laplaceUrlDraft.loading || !laplaceUrlDraft.url.trim()} onClick={() => void previewLaplaceUrl()}>{laplaceUrlDraft.loading ? "正在加载" : "加载预览"}</button><button type="button" className="is-primary" disabled={!laplaceUrlDraft.document || laplaceReadyDocument !== laplaceUrlDraft.document} onClick={() => void saveLaplaceUrlTheme()}>{laplaceUrlDraft.document?.origin === "builtin" ? "另存主题" : "确认保存"}</button></div>
    </div></div>}
    {blivechatHtmlDraft && <div className="theme-name-overlay" role="dialog" aria-modal="true" aria-label="添加 BLC 外部 HTML"><div className="theme-name-dialog theme-url-dialog"><h3>添加 BLC 外部 HTML</h3><div className="theme-url-dialog-body"><p>外部 HTML 仅支持弹幕窗、收益窗和 OBS。</p><label>HTML 网址<input value={blivechatHtmlDraft.url} onChange={event => { blivechatPreviewGenerationRef.current += 1; setBlivechatHtmlDraft(current => current ? { ...current, url: event.target.value, document: null, loading: false, ready: false, error: "" } : current); }} placeholder="https://example.com/index.html" /></label>{blivechatHtmlDraft.error && <p role="alert">{blivechatHtmlDraft.error}</p>}{blivechatHtmlDraft.document && <><p role="status">{blivechatHtmlDraft.ready ? "预览已就绪，可以另存为主题。" : "正在连接主题预览…"}</p><div className="theme-external-html-preview"><BlivechatExternalHtmlSurface descriptor={{ url: blivechatHtmlDraft.url, target: "windows", targetId: "blivechat-preview", css: getThemeModeAdapter("blivechat").exportCss(blivechatHtmlDraft.document, "complete"), config: { showGiftName: true, mergeSimilarDanmaku: false, mergeGift: false, maxNumber: 50 } }} events={createStylePreviewEvents("混合流")} fallback={<div>正在连接主题预览…</div>} onReady={() => { const generation = blivechatPreviewGenerationRef.current; setBlivechatHtmlDraft(current => current && current.document && !current.ready ? { ...current, loading: false, ready: true, document: { ...current.document, metadata: { ...current.document.metadata, externalHtml: { url: current.url, sdk: "blivechat-1.0.1", verified: true } } } } : current); void generation; }} onFailure={message => setBlivechatHtmlDraft(current => current ? { ...current, loading: false, ready: false, error: message } : current)} /></div></>}</div><div className="theme-url-dialog-actions"><button type="button" onClick={() => { blivechatPreviewGenerationRef.current += 1; setBlivechatHtmlDraft(null); }}>取消</button><button type="button" disabled={blivechatHtmlDraft.loading || !blivechatHtmlDraft.url.trim()} onClick={() => void previewBlivechatHtml()}>{blivechatHtmlDraft.loading ? "正在预览" : "预览"}</button><button type="button" className="is-primary" disabled={!blivechatHtmlDraft.ready} onClick={() => void saveBlivechatHtmlTheme()}>另存主题</button></div></div></div>}
  </section></ThemeImageAssetsContext.Provider>;
}
