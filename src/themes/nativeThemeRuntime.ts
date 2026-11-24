import type { ThemeDocument } from "./themeTypes.ts";
import { projectNativeTheme, type NativeThemeProjection } from "./nativeThemeProjection.ts";
import { load } from "../appData.ts";
import { buildNativeObsThemeSnapshot, emitNativeObsThemeSnapshot, loadNativeObsThemeSnapshot, loadObsThemeSnapshot, persistNativeObsThemeSnapshot, persistObsThemeSnapshot, emitObsThemeSnapshot, removeNativeObsThemeSnapshot, type ObsThemeSnapshot } from "../obs/nativeObsTheme.ts";
import type { ThemeTarget } from "./themeTypes.ts";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { themeBindingRegistry, type ThemeBinding, type ThemeBindingRegistry } from "./themeBindings.ts";
import { readManagedNativeEventVisibility, scopeNativePreviewCss, scopeNativeEventVisibilityCss } from "./nativeManagedCss.ts";
import { useGeneralSettings } from "../generalSettings.ts";

const STYLE_ID = "danmu-active-native-theme";
const THEME_RUNTIME_STORE = "native-theme-runtime.local.json";
export const ACTIVE_NATIVE_THEME_CSS_KEY = "activeCss";
const targetCssKey = (target: ThemeTarget) => `${ACTIVE_NATIVE_THEME_CSS_KEY}:${target}`;
const targetIdCssKey = (targetId: string) => `${ACTIVE_NATIVE_THEME_CSS_KEY}:target:${targetId}`;
const targetIdProjectionKey = (targetId: string) => `projection:target:${targetId}`;
const PUBLICATION_EVENT = "native-theme-publication";

export interface NativeThemePublication {
  targetId: string;
  targetKind: ThemeTarget;
  themeId: string;
  revision: number;
  projection: NativeThemeProjection;
}

interface NativeThemeRuntimeStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<unknown>;
  delete(key: string): Promise<unknown>;
  save(): Promise<unknown>;
}

export interface NativeThemeDetachPorts {
  loadRuntimeStore(): Promise<NativeThemeRuntimeStore>;
  bindings: ThemeBindingRegistry;
  loadObsSnapshot(targetId: string): Promise<ObsThemeSnapshot | undefined>;
  removeObsSnapshot(targetId: string): Promise<void>;
  persistObsSnapshot(snapshot: ObsThemeSnapshot): Promise<void>;
  emitObsSnapshot(snapshot: ObsThemeSnapshot): Promise<void>;
}

export interface NativeThemePublishPorts extends NativeThemeDetachPorts {
  emitPublication(publication: NativeThemePublication): Promise<void>;
  installCss(css: string, targetKind: Exclude<ThemeTarget, "obs">, displayScale?: number): void;
  emitNativeObsSnapshot(snapshot: ObsThemeSnapshot): Promise<void>;
}

export interface CompatibleWindowProjectionSnapshot {
  targetId: string;
  css?: string;
  projection?: NativeThemeProjection;
  targetCss?: string;
}

export interface CompatibleWindowProjectionPorts {
  loadRuntimeStore(): Promise<NativeThemeRuntimeStore>;
  installCss(css: string, targetKind: "windows", displayScale?: number): void;
  emitPublication(publication: NativeThemePublication): Promise<void>;
}

export class CompatibleWindowProjectionRestoreError extends Error {
  constructor(
    readonly restored: { storage: boolean; css: boolean; notification: boolean },
    readonly rollbackErrors: Partial<Record<"storage" | "css" | "notification", unknown>>,
  ) {
    super("副窗口主题投影恢复不完整");
    this.name = "CompatibleWindowProjectionRestoreError";
  }
}

const nativeThemeDetachPorts: NativeThemeDetachPorts = {
  loadRuntimeStore: () => load(THEME_RUNTIME_STORE, { autoSave: false, defaults: {} }),
  bindings: themeBindingRegistry,
  loadObsSnapshot: loadObsThemeSnapshot,
  removeObsSnapshot: removeNativeObsThemeSnapshot,
  persistObsSnapshot: persistObsThemeSnapshot,
  emitObsSnapshot: emitObsThemeSnapshot,
};

const nativeThemePublishPorts: NativeThemePublishPorts = {
  ...nativeThemeDetachPorts,
  emitPublication: publication => emit(PUBLICATION_EVENT, publication),
  installCss,
  emitNativeObsSnapshot: emitNativeObsThemeSnapshot,
};

const compatibleWindowProjectionPorts: CompatibleWindowProjectionPorts = {
  loadRuntimeStore: () => load(THEME_RUNTIME_STORE, { autoSave: false, defaults: {} }),
  installCss,
  emitPublication: publication => emit(PUBLICATION_EVENT, publication),
};

export type NativeThemeRollbackPart = "runtime" | "binding" | "output";

export class NativeThemePublicationError extends Error {
  readonly cause: unknown;
  constructor(
    cause: unknown,
    readonly restored: Record<NativeThemeRollbackPart, boolean>,
    readonly rollbackErrors: Partial<Record<NativeThemeRollbackPart, unknown>>,
  ) {
    super(`主题发布失败：${String(cause)}`);
    this.name = "NativeThemePublicationError";
    this.cause = cause;
  }
}

export class PublishedThemeCleanupError extends Error {
  readonly cause: unknown;
  constructor(message: string, readonly restored: boolean, cause: unknown) {
    super(message);
    this.name = "PublishedThemeCleanupError";
    this.cause = cause;
  }
}

export async function commitNativeThemePublication(steps: {
  persist: () => Promise<void>;
  bind: () => Promise<void>;
  activate: () => void | Promise<void>;
  rollback: Record<NativeThemeRollbackPart, () => Promise<void>>;
}): Promise<void> {
  try {
    await steps.persist();
    await steps.bind();
    await steps.activate();
  } catch (cause) {
    const parts: NativeThemeRollbackPart[] = ["runtime", "binding", "output"];
    const results = await Promise.allSettled(parts.map(part => steps.rollback[part]()));
    const restored = { runtime: false, binding: false, output: false };
    const rollbackErrors: Partial<Record<NativeThemeRollbackPart, unknown>> = {};
    results.forEach((result, index) => {
      const part = parts[index];
      if (result.status === "fulfilled") restored[part] = true;
      else rollbackErrors[part] = result.reason;
    });
    throw new NativeThemePublicationError(cause, restored, rollbackErrors);
  }
}

export function resolveRecoverableThemeId(
  themeId: string | undefined,
): string {
  return themeId ?? "native-default";
}

export function targetDisplayScaleCss(targetKind: Exclude<ThemeTarget, "obs">, displayScale: number): string {
  const scale = Number.isFinite(displayScale) ? Math.max(0.5, Math.min(3, displayScale)) : 1;
  return targetKind === "live"
    ? ""
    : `.event-area.window .event-list:not(.compatible-event-list), .event-area.window .sticky-area { zoom: ${scale}; }`;
}

export function withNativeThemeDisplayScale(
  projection: NativeThemeProjection,
  displayScale: number,
): NativeThemeProjection {
  const scale = Number.isFinite(displayScale) ? Math.max(0.5, Math.min(3, displayScale)) : 1;
  return { ...projection, displayScale: scale };
}

export async function updatePublishedNativeThemeScale(
  targetId: string,
  targetKind: ThemeTarget,
  displayScale: number,
  applyProjection?: (projection: NativeThemeProjection) => void,
): Promise<void> {
  const store = await load(THEME_RUNTIME_STORE, { autoSave: false, defaults: {} });
  const current = await store.get<NativeThemeProjection>(targetIdProjectionKey(targetId));
  if (!current) throw new Error("目标尚未发布主题");
  const projection = withNativeThemeDisplayScale(current, displayScale);
  await store.set(targetIdProjectionKey(targetId), projection);
  await store.save();
  await themeBindingRegistry.setDisplayScale(targetId, projection.displayScale);
  if (targetKind === "live") { applyProjection?.(projection); installCss(projection.css, "live", projection.displayScale); }
  if (targetKind === "obs") {
    const snapshot = await loadNativeObsThemeSnapshot(targetId);
    if (snapshot) {
      const scaledSnapshot = { ...snapshot, displayScale: projection.displayScale, savedAt: new Date().toISOString() };
      await persistNativeObsThemeSnapshot(scaledSnapshot);
      await emitNativeObsThemeSnapshot(scaledSnapshot);
    }
  }
  await emit(PUBLICATION_EVENT, {
    targetId,
    targetKind,
    themeId: (await themeBindingRegistry.load()).find(binding => binding.targetId === targetId)?.themeId ?? "",
    revision: (await themeBindingRegistry.load()).find(binding => binding.targetId === targetId)?.revision ?? 0,
    projection,
  } satisfies NativeThemePublication);
}

function installCss(css: string, targetKind: Exclude<ThemeTarget, "obs">, displayScale = 1): void {
  css = scopeNativeEventVisibilityCss(css);
  let element = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!element) {
    element = document.createElement("style");
    element.id = STYLE_ID;
    document.head.appendChild(element);
  }
  const themeCss = targetKind === "live"
    ? scopeNativePreviewCss(css, '.theme-surface.theme-target-live')
    : scopeNativePreviewCss(css, '.theme-surface.theme-target-windows');
  element.textContent = [themeCss, targetDisplayScaleCss(targetKind, displayScale)].filter(Boolean).join("\n\n");
}

export async function applyNativeTheme(theme: ThemeDocument, applyProjection: (projection: NativeThemeProjection) => void): Promise<void> {
  await Promise.all((["live", "windows", "obs"] as ThemeTarget[]).map(target => applyNativeThemeTarget(theme, target, applyProjection)));
}

export async function applyNativeThemeTarget(theme: ThemeDocument, target: ThemeTarget, applyProjection: (projection: NativeThemeProjection) => void): Promise<void> {
  await publishNativeThemeTarget(theme, target, target, applyProjection);
}

export async function publishNativeThemeTarget(theme: ThemeDocument, targetId: string, targetKind: ThemeTarget, applyProjection?: (projection: NativeThemeProjection) => void, roomId: string | number | null = null, ports: NativeThemePublishPorts = nativeThemePublishPorts, displayScale?: number): Promise<void> {
  const currentBinding = (await ports.bindings.load()).find(binding => binding.targetId === targetId);
  const projection = withNativeThemeDisplayScale(projectNativeTheme(theme), displayScale ?? currentBinding?.displayScale ?? 1);
  const store = await ports.loadRuntimeStore();
  const publication: NativeThemePublication = { targetId, targetKind, themeId: theme.themeId, revision: theme.revision, projection };
  const obsSnapshot = targetKind === "obs"
    ? buildNativeObsThemeSnapshot(theme, targetId, projection, new Date().toISOString(), useGeneralSettings.getState().stickyEvents, roomId)
    : undefined;
  const previousCss = await store.get<string>(targetIdCssKey(targetId));
  const previousProjection = await store.get<NativeThemeProjection>(targetIdProjectionKey(targetId));
  const previousTargetCss = targetId === targetKind ? await store.get<string>(targetCssKey(targetKind)) : undefined;
  const previousActiveCss = targetKind === "live" ? await store.get<string>(ACTIVE_NATIVE_THEME_CSS_KEY) : undefined;
  const previousObsSnapshot = targetKind === "obs" ? await ports.loadObsSnapshot(targetId) : undefined;
  const restore = async <T,>(key: string, value: T | undefined) => {
    if (value === undefined) await store.delete(key);
    else await store.set(key, value);
  };
  await commitNativeThemePublication({
    persist: async () => {
      await store.set(targetIdCssKey(targetId), projection.css);
      await store.set(targetIdProjectionKey(targetId), projection);
      if (targetId === targetKind) await store.set(targetCssKey(targetKind), projection.css);
      if (targetKind === "live") await store.set(ACTIVE_NATIVE_THEME_CSS_KEY, projection.css);
      await store.save();
      if (obsSnapshot) await ports.persistObsSnapshot(obsSnapshot);
    },
    bind: () => ports.bindings.bind({ targetId, targetKind, themeId: theme.themeId, revision: theme.revision, displayScale: projection.displayScale }),
    rollback: {
      runtime: async () => {
        await restore(targetIdCssKey(targetId), previousCss);
        await restore(targetIdProjectionKey(targetId), previousProjection);
        if (targetId === targetKind) await restore(targetCssKey(targetKind), previousTargetCss);
        if (targetKind === "live") await restore(ACTIVE_NATIVE_THEME_CSS_KEY, previousActiveCss);
        await store.save();
      },
      binding: async () => {
        if (currentBinding) await ports.bindings.bind(currentBinding);
        else await ports.bindings.remove(targetId);
      },
      output: async () => {
        if (targetKind === "obs") {
          if (previousObsSnapshot) { await ports.persistObsSnapshot(previousObsSnapshot); await ports.emitObsSnapshot(previousObsSnapshot); }
          else await ports.removeObsSnapshot(targetId);
          return;
        }
        if (previousProjection) {
          if (targetKind === "live") {
            applyProjection?.(previousProjection);
            ports.installCss(previousProjection.css, "live", previousProjection.displayScale);
          }
          if (currentBinding) await ports.emitPublication({ targetId, targetKind, themeId: currentBinding.themeId, revision: currentBinding.revision, projection: previousProjection });
        } else if (targetKind === "live") {
          ports.installCss("", "live", 1);
        }
      },
    },
    activate: async () => {
      if (targetKind === "live") { applyProjection?.(projection); ports.installCss(projection.css, "live", projection.displayScale); }
      if (obsSnapshot) await ports.emitNativeObsSnapshot(obsSnapshot);
      await ports.emitPublication(publication);
    },
  });
}

export async function reconcileNativeThemeTarget(
  targetId: string,
  targetKind: Exclude<ThemeTarget, "obs">,
  fallbackTheme: ThemeDocument,
  applyProjection?: (projection: NativeThemeProjection) => void,
): Promise<void> {
  const binding = (await themeBindingRegistry.load()).find(item => item.targetId === targetId);
  if (resolveRecoverableThemeId(binding?.themeId) === binding?.themeId) return;
  await publishNativeThemeTarget(fallbackTheme, targetId, targetKind, applyProjection);
}

export async function removePublishedNativeThemeTarget(targetId: string, targetKind: ThemeTarget): Promise<void> {
  const store = await load(THEME_RUNTIME_STORE, { autoSave: false, defaults: {} });
  await store.delete(targetIdCssKey(targetId));
  await store.delete(targetIdProjectionKey(targetId));
  if (targetId === targetKind) await store.delete(targetCssKey(targetKind));
  if (targetKind === "live") await store.delete(ACTIVE_NATIVE_THEME_CSS_KEY);
  await store.save();
  if (targetKind === "obs") await removeNativeObsThemeSnapshot(targetId);
}

export async function detachPublishedThemeState(steps: {
  removeRuntime(): Promise<unknown>;
  removeSnapshot(): Promise<unknown>;
  removeBinding(): Promise<unknown>;
  restoreRuntime(): Promise<unknown>;
  restoreSnapshot(): Promise<unknown>;
  restoreBinding(): Promise<unknown>;
}): Promise<() => Promise<void>> {
  const restore = async () => {
    const results = await Promise.allSettled([steps.restoreRuntime(), steps.restoreSnapshot(), steps.restoreBinding()]);
    const failed = results.find(result => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
  };
  try {
    await steps.removeRuntime();
    await steps.removeSnapshot();
    await steps.removeBinding();
  } catch (cause) {
    try { await restore(); }
    catch (rollbackCause) { throw new PublishedThemeCleanupError(`已发布主题清理失败，且无法恢复：${String(cause)}；${String(rollbackCause)}`, false, cause); }
    throw new PublishedThemeCleanupError(`已发布主题清理失败，原有状态已恢复：${String(cause)}`, true, cause);
  }
  return restore;
}

export async function detachPublishedNativeThemeTarget(targetId: string, targetKind: ThemeTarget, ports: NativeThemeDetachPorts = nativeThemeDetachPorts): Promise<() => Promise<void>> {
  const store = await ports.loadRuntimeStore();
  const binding = (await ports.bindings.load()).find(item => item.targetId === targetId);
  const css = await store.get<string>(targetIdCssKey(targetId));
  const projection = await store.get<NativeThemeProjection>(targetIdProjectionKey(targetId));
  const targetCss = targetId === targetKind ? await store.get<string>(targetCssKey(targetKind)) : undefined;
  const activeCss = targetKind === "live" ? await store.get<string>(ACTIVE_NATIVE_THEME_CSS_KEY) : undefined;
  const obsSnapshot = targetKind === "obs" ? await ports.loadObsSnapshot(targetId) : undefined;
  return detachPublishedThemeState({
    removeRuntime: async () => {
      await store.delete(targetIdCssKey(targetId));
      await store.delete(targetIdProjectionKey(targetId));
      if (targetId === targetKind) await store.delete(targetCssKey(targetKind));
      if (targetKind === "live") await store.delete(ACTIVE_NATIVE_THEME_CSS_KEY);
      await store.save();
    },
    removeSnapshot: async () => { if (targetKind === "obs") await ports.removeObsSnapshot(targetId); },
    removeBinding: () => ports.bindings.remove(targetId),
    restoreRuntime: async () => {
      if (css !== undefined) await store.set(targetIdCssKey(targetId), css);
      if (projection !== undefined) await store.set(targetIdProjectionKey(targetId), projection);
      if (targetCss !== undefined) await store.set(targetCssKey(targetKind), targetCss);
      if (activeCss !== undefined) await store.set(ACTIVE_NATIVE_THEME_CSS_KEY, activeCss);
      await store.save();
    },
    restoreSnapshot: async () => {
      if (obsSnapshot) {
        await ports.persistObsSnapshot(obsSnapshot);
        await ports.emitObsSnapshot(obsSnapshot);
      }
    },
    restoreBinding: async () => { if (binding) await ports.bindings.bind(binding); },
  });
}

export async function installAppliedNativeThemeCss(target: Exclude<ThemeTarget, "obs"> = "live"): Promise<void> {
  const store = await load(THEME_RUNTIME_STORE, { autoSave: false, defaults: {} });
  const css = await store.get<string>(targetCssKey(target));
  const projection = await store.get<NativeThemeProjection>(targetIdProjectionKey(target));
  installCss(css ?? "", target, projection?.displayScale);
}

export async function subscribeNativeThemeTarget(targetId: string, targetKind: Exclude<ThemeTarget, "obs">, onProjection?: (projection: NativeThemeProjection) => void, install = true): Promise<UnlistenFn> {
  let receivedPublication = false;
  const stop = await listen<NativeThemePublication>(PUBLICATION_EVENT, event => {
    if (event.payload.targetId !== targetId) return;
    receivedPublication = true;
    const projection = event.payload.projection;
    if (install) installCss(projection.css, targetKind, projection.displayScale);
    onProjection?.({ ...projection, eventVisibility: projection.eventVisibility ?? readManagedNativeEventVisibility(projection.css) });
  });
  try {
    const store = await load(THEME_RUNTIME_STORE, { autoSave: false, defaults: {} });
    const css = await store.get<string>(targetIdCssKey(targetId));
    const projection = await store.get<NativeThemeProjection>(targetIdProjectionKey(targetId));
    if (!receivedPublication) {
      if (install) installCss(css ?? "", targetKind, projection?.displayScale);
      if (projection) onProjection?.({ ...projection, eventVisibility: projection.eventVisibility ?? readManagedNativeEventVisibility(projection.css) });
    }
    return stop;
  } catch (error) {
    stop();
    throw error;
  }
}

export async function publishCompatibleWindowThemeProjection(
  targetId: string,
  themeId: string,
  revision: number,
  projection: NativeThemeProjection,
  ports: CompatibleWindowProjectionPorts = compatibleWindowProjectionPorts,
): Promise<void> {
  const store = await ports.loadRuntimeStore();
  await store.set(targetIdCssKey(targetId), projection.css);
  await store.set(targetIdProjectionKey(targetId), projection);
  if (targetId === "windows") await store.set(targetCssKey("windows"), projection.css);
  await store.save();
  await ports.emitPublication({ targetId, targetKind: "windows", themeId, revision, projection });
}

export async function captureCompatibleWindowThemeProjection(
  targetId: string,
  ports: CompatibleWindowProjectionPorts = compatibleWindowProjectionPorts,
): Promise<CompatibleWindowProjectionSnapshot> {
  const store = await ports.loadRuntimeStore();
  return {
    targetId,
    css: await store.get<string>(targetIdCssKey(targetId)),
    projection: await store.get<NativeThemeProjection>(targetIdProjectionKey(targetId)),
    targetCss: targetId === "windows" ? await store.get<string>(targetCssKey("windows")) : undefined,
  };
}

export async function restoreCompatibleWindowThemeProjection(
  snapshot: CompatibleWindowProjectionSnapshot,
  publication: Pick<NativeThemePublication, "themeId" | "revision">,
  ports: CompatibleWindowProjectionPorts = compatibleWindowProjectionPorts,
): Promise<void> {
  const operations = {
    storage: async () => {
      const store = await ports.loadRuntimeStore();
      const restoreValue = async <T,>(key: string, value: T | undefined) => {
        if (value === undefined) await store.delete(key);
        else await store.set(key, value);
      };
      await restoreValue(targetIdCssKey(snapshot.targetId), snapshot.css);
      await restoreValue(targetIdProjectionKey(snapshot.targetId), snapshot.projection);
      if (snapshot.targetId === "windows") await restoreValue(targetCssKey("windows"), snapshot.targetCss);
      await store.save();
    },
    css: async () => ports.installCss(snapshot.projection?.css ?? snapshot.css ?? "", "windows", snapshot.projection?.displayScale),
    notification: async () => {
      if (!snapshot.projection) return;
      await ports.emitPublication({ targetId: snapshot.targetId, targetKind: "windows", themeId: publication.themeId, revision: publication.revision, projection: snapshot.projection });
    },
  };
  const keys = ["storage", "css", "notification"] as const;
  const results = await Promise.allSettled(keys.map(key => operations[key]()));
  const restored = { storage: false, css: false, notification: false };
  const rollbackErrors: Partial<Record<typeof keys[number], unknown>> = {};
  results.forEach((result, index) => {
    const key = keys[index];
    if (result.status === "fulfilled") restored[key] = true;
    else rollbackErrors[key] = result.reason;
  });
  if (results.some(result => result.status === "rejected")) throw new CompatibleWindowProjectionRestoreError(restored, rollbackErrors);
}

export async function restoreStoredNativeThemeTargetOutput(
  binding: ThemeBinding,
  applyProjection?: (projection: NativeThemeProjection) => void,
): Promise<void> {
  const { targetId, targetKind } = binding;
  if (targetKind === "obs") {
    const snapshot = await loadObsThemeSnapshot(targetId);
    if (snapshot) await emitObsThemeSnapshot(snapshot);
    return;
  }
  const store = await load(THEME_RUNTIME_STORE, { autoSave: false, defaults: {} });
  const projection = await store.get<NativeThemeProjection>(targetIdProjectionKey(targetId));
  if (!projection) return;
  installCss(projection.css, targetKind, projection.displayScale);
  applyProjection?.(projection);
  await emit(PUBLICATION_EVENT, {
    targetId,
    targetKind,
    themeId: binding.themeId,
    revision: binding.revision,
    projection,
  } satisfies NativeThemePublication);
}
