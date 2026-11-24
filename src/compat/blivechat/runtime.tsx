import { resolveThemeEventVisibility } from "../../themes/themeEventVisibility.ts";
import { normalizeCompatibleEventVisibility } from "../../themes/compatibleEventVisibility.ts";
import { projectCallbackNames } from "../../events/displayNameProjection.ts";
import { memoizeCompatibleEventDecision } from "../CompatibleEventRenderer.tsx";
import { composeBlivechatThemeCss } from "./css.ts";
export { composeBlivechatThemeCss } from "./css.ts";
import { compatibleFallbackDisplay } from "../../themes/compatThemeSettings.ts";
import { renderManagedNativeCss } from "../../themes/nativeManagedCss.ts";
import { isCompatibleThemeEventVisible } from "../../themes/compatibleEventVisibility.ts";
import type { CSSProperties } from "react";
import { notifyCompatibleEventRenderChanged, type CompatibleEventRender, type CompatibleEventRenderWithRoot, type CompatibleEventSurfaceContext } from "../CompatibleEventRenderer.tsx";
import { THEME_BINDINGS_EVENT, themeBindingRegistry, type ThemeBindingRegistry } from "../../themes/themeBindings.ts";
import type { ThemeDocument, ThemeTarget } from "../../themes/themeTypes.ts";
import type { NativeThemeProjection } from "../../themes/nativeThemeProjection.ts";
import { type BlivechatRuntimeSettings } from "./theme.ts";
import { load } from "../../appData.ts";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ThemeBinding } from "../../themes/themeBindings.ts";
import { buildBlivechatObsSnapshot } from "./obs.ts";
import { emitObsThemeSnapshot, loadObsThemeSnapshot, persistObsThemeSnapshot, removeNativeObsThemeSnapshot, type ObsThemeSnapshot } from "../../obs/nativeObsTheme.ts";
import { createDefaultEventStyleSettings } from "../../eventStyleSettings.ts";
import { blivechatExternalHtmlUrlOf } from "./externalHtmlBridge.ts";
import type { CompatibleExternalHtmlDescriptor } from "../CompatibleEventRenderer.tsx";
import { commitThemePublication, commitThemeRemoval, ThemeOutputRollbackError } from "../../themes/themeWorkspaceTransactions.ts";
import { projectBlivechatCallback, projectBlivechatEvent } from "./projection.ts";
import { MsgType } from "../../protocol/eventTypeCodes.ts";
import type { DanmakuEvent } from "../../protocol/types.ts";
import { createBlivechatSourceConfig } from "./sourceConfig.ts";
import { publishCompatibleRuntimeSnapshot, removeCompatibleRuntimeOutput } from "../compatibleRuntimePublication.ts";
import { useGeneralSettings } from "../../generalSettings.ts";
import { captureCompatibleWindowThemeProjection, publishCompatibleWindowThemeProjection, restoreCompatibleWindowThemeProjection, restoreStoredNativeThemeTargetOutput, type CompatibleWindowProjectionSnapshot } from "../../themes/nativeThemeRuntime.ts";

function projectionFor(document: ThemeDocument, context: BlivechatRenderContext): NativeThemeProjection {
  const display = compatibleFallbackDisplay("blivechat", settingsOf(document));
  const settings = {...createDefaultEventStyleSettings(),display};
  return { settings, display, scheme: "common", visual: {}, css: renderManagedNativeCss(settings), displayScale: context.displayScale };
}

export interface BlivechatRenderContext {
  target: ThemeTarget;
  targetId: string;
  roomId: string;
  displayScale: number;
}

export interface PublishedBlivechatTarget { document: ThemeDocument; context: BlivechatRenderContext }

const RUNTIME_STORE = "compatible-theme-runtime.local.json";
const PUBLICATION_EVENT = "compatible-theme-publication:blivechat";
const EXTERNAL_PREPARE_EVENT = "compatible-theme-external-prepare:blivechat";
const EXTERNAL_READY_EVENT = "compatible-theme-external-ready:blivechat";
const EXTERNAL_CANCEL_EVENT = "compatible-theme-external-cancel:blivechat";
interface ExternalPrepareRequest { requestId: string; document: ThemeDocument; context: BlivechatRenderContext }

export interface BlivechatRuntimePorts {
  load(): Promise<PublishedBlivechatTarget[]>;
  loadTarget(targetId: string): Promise<PublishedBlivechatTarget | undefined>;
  save(value: PublishedBlivechatTarget): Promise<void>;
  remove(targetId: string): Promise<void>;
  publish(value: PublishedBlivechatTarget | { type: "remove"; targetId: string }): Promise<void>;
  removeOutput?(targetId: string): Promise<void>;
  restoreOutput?(value: PublishedBlivechatTarget): Promise<void>;
  publishModeOutput?(value: PublishedBlivechatTarget): Promise<void>;
  restoreTargetOutput?(binding: ThemeBinding, applyProjection?: (projection: NativeThemeProjection) => void): Promise<void>;
  subscribe(listener: (value: PublishedBlivechatTarget | { type: "remove"; targetId: string }) => void): (() => void) | Promise<() => void>;
  loadBindings?(): Promise<ThemeBinding[]>;
  subscribeBindings?(listener: (bindings: ThemeBinding[]) => void): (() => void) | Promise<() => void>;
  prepareExternalHtml?(request: ExternalPrepareRequest): Promise<void>;
  cancelPendingExternal?(requestId: string): Promise<void>;
  subscribeExternalPrepare?(listener: (request: ExternalPrepareRequest) => void): (() => void) | Promise<() => void>;
  subscribeExternalCancel?(listener: (requestId: string) => void): (() => void) | Promise<() => void>;
  publishExternalReady?(requestId: string): Promise<void>;
  loadObsSnapshot?(targetId: string): Promise<ObsThemeSnapshot | undefined>;
  removeObsSnapshot?(targetId: string): Promise<void>;
  persistObsSnapshot?(snapshot: ObsThemeSnapshot): Promise<void>;
  emitObsSnapshot?(snapshot: ObsThemeSnapshot): Promise<void>;
  publishWindowProjection?(value: { targetId: string; themeId: string; revision: number; projection: NativeThemeProjection }): Promise<void>;
  captureWindowProjection?(targetId: string): Promise<CompatibleWindowProjectionSnapshot>;
  restoreWindowProjection?(snapshot: CompatibleWindowProjectionSnapshot, publication: { themeId: string; revision: number }): Promise<void>;
}

const runtimePorts: BlivechatRuntimePorts = {
  async load() {
    const store = await load(RUNTIME_STORE, { autoSave: false, defaults: {} });
    return (await store.values<PublishedBlivechatTarget>()).filter(value => value.document.mode === "blivechat");
  },
  async loadTarget(targetId) {
    const store = await load(RUNTIME_STORE, { autoSave: false, defaults: {} });
    return await store.get<PublishedBlivechatTarget>(targetId) ?? undefined;
  },
  async save(value) {
    const store = await load(RUNTIME_STORE, { autoSave: false, defaults: {} });
    await store.set(value.context.targetId, value);
    await store.save();
  },
  async remove(targetId) {
    const store = await load(RUNTIME_STORE, { autoSave: false, defaults: {} });
    await store.delete(targetId);
    await store.save();
  },
  publish: value => emit(PUBLICATION_EVENT, value),
  removeOutput: targetId => removeCompatibleRuntimeOutput("blivechat", targetId),
  restoreOutput: value => publishCompatibleRuntimeSnapshot(value),
  publishModeOutput: value => publishCompatibleRuntimeSnapshot(value),
  restoreTargetOutput: (binding, applyProjection) => restoreStoredNativeThemeTargetOutput(binding, applyProjection),
  subscribe: listener => listen<PublishedBlivechatTarget>(PUBLICATION_EVENT, event => listener(event.payload)) as Promise<UnlistenFn>,
  loadBindings: () => themeBindingRegistry.load(),
  subscribeBindings: listener => listen<ThemeBinding[]>(THEME_BINDINGS_EVENT, event => listener(event.payload)) as Promise<UnlistenFn>,
  publishWindowProjection: value => publishCompatibleWindowThemeProjection(value.targetId, value.themeId, value.revision, value.projection),
  captureWindowProjection: captureCompatibleWindowThemeProjection,
  restoreWindowProjection: restoreCompatibleWindowThemeProjection,
  async prepareExternalHtml(request) {
    await new Promise<void>(async (resolve, reject) => {
      const stop = await listen<string>(EXTERNAL_READY_EVENT, event => { if (event.payload === request.requestId) { stop(); clearTimeout(timer); resolve(); } });
      const timer = window.setTimeout(() => { stop(); void emit(EXTERNAL_CANCEL_EVENT, request.requestId); reject(new Error("外部 HTML 未能在目标窗口加载，原输出已保留。请重试或更换主题。")); }, 10_000);
      await emit(EXTERNAL_PREPARE_EVENT, request);
    });
  },
  cancelPendingExternal: requestId => emit(EXTERNAL_CANCEL_EVENT, requestId),
  subscribeExternalPrepare: listener => listen<ExternalPrepareRequest>(EXTERNAL_PREPARE_EVENT, event => listener(event.payload)) as Promise<UnlistenFn>,
  subscribeExternalCancel: listener => listen<string>(EXTERNAL_CANCEL_EVENT, event => listener(event.payload)) as Promise<UnlistenFn>,
  publishExternalReady: requestId => emit(EXTERNAL_READY_EVENT, requestId),
  loadObsSnapshot: loadObsThemeSnapshot,
  removeObsSnapshot: removeNativeObsThemeSnapshot,
  persistObsSnapshot: persistObsThemeSnapshot,
  emitObsSnapshot: emitObsThemeSnapshot,
};

function settingsOf(document: ThemeDocument): BlivechatRuntimeSettings {
  const settings = document.settings as Partial<BlivechatRuntimeSettings>;
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


export function createBlivechatAuxiliaryDisplayCss(settings: Pick<BlivechatRuntimeSettings, "showTimestamp" | "maskUsername" | "showAvatar" | "showUsername" | "showGuardBadge" | "showModBadge">): string {
  return [
    settings.showTimestamp ? ":where(#timestamp) { display: inline !important; }\n@layer config { :where(#timestamp) { font-size: var(--time-size, var(--blc-timestamp-font-size)); } }" : "",
    settings.showAvatar ? "" : ":where(#author-photo) { display: none !important; }",
    settings.showUsername ? "" : ":where(#author-name) { display: none !important; }",
    settings.showGuardBadge === false ? ":where(yt-live-chat-author-badge-renderer[type=member]) { display:none!important; }" : "",
    settings.showModBadge === false ? ":where(yt-live-chat-author-badge-renderer[type=moderator]) { display:none!important; }" : "",
  ].filter(Boolean).join("\n");
}

export function createBlivechatThemeRuntime(bindings: ThemeBindingRegistry = themeBindingRegistry, ports: BlivechatRuntimePorts = runtimePorts) {
  const published = new Map<string, PublishedBlivechatTarget>();
  const pendingExternal = new Map<string, ExternalPrepareRequest>();
  const committedExternalIdentity = new Map<string, string>();
  const formalBindings = new Map<string, ThemeBinding>();
  let stop: (() => void) | undefined;
  const api = {
    async start(): Promise<() => void> {
      if (stop) return stop;
      for (const value of await ports.load()) published.set(value.context.targetId, structuredClone(value));
      for (const binding of await (ports.loadBindings?.() ?? bindings.load())) formalBindings.set(binding.targetId, structuredClone(binding));
      const unsubscribe = await ports.subscribe(value => {
        if ("type" in value && value.type === "remove") published.delete(value.targetId);
        else if (!("type" in value) && value.document.mode === "blivechat") {
          const pending = pendingExternal.get(value.context.targetId);
          if (pending) committedExternalIdentity.set(value.context.targetId, pending.requestId);
          published.set(value.context.targetId, structuredClone(value));
          pendingExternal.delete(value.context.targetId);
          formalBindings.set(value.context.targetId, { targetId: value.context.targetId, targetKind: value.context.target, themeId: value.document.themeId, revision: value.document.revision, displayScale: value.context.displayScale });
        } else if (!("type" in value)) published.delete(value.context.targetId);
        notifyCompatibleEventRenderChanged();
      });
      const unsubscribeBindings = ports.subscribeBindings ? await ports.subscribeBindings(next => {
        formalBindings.clear(); next.forEach(binding => formalBindings.set(binding.targetId, structuredClone(binding)));
        notifyCompatibleEventRenderChanged();
      }) : bindings.subscribe(binding => { formalBindings.set(binding.targetId, structuredClone(binding)); notifyCompatibleEventRenderChanged(); });
      const unsubscribePrepare = ports.subscribeExternalPrepare ? await ports.subscribeExternalPrepare(request => { pendingExternal.set(request.context.targetId, structuredClone(request)); notifyCompatibleEventRenderChanged(); }) : () => {};
      const unsubscribeCancel = ports.subscribeExternalCancel ? await ports.subscribeExternalCancel(requestId => {
        for (const [targetId, pending] of pendingExternal) if (pending.requestId === requestId) pendingExternal.delete(targetId);
        notifyCompatibleEventRenderChanged();
      }) : () => {};
      stop = () => {
        unsubscribe(); unsubscribeBindings(); unsubscribePrepare(); unsubscribeCancel();
        published.clear(); formalBindings.clear(); pendingExternal.clear(); committedExternalIdentity.clear();
        stop = undefined;
        notifyCompatibleEventRenderChanged();
      };
      return stop;
    },
    async publish(document: ThemeDocument, requested: BlivechatRenderContext, _applyProjection?: (projection: NativeThemeProjection) => void): Promise<void> {
      const externalUrl = blivechatExternalHtmlUrlOf(document);
      let preparedRequestId = "";
      if (externalUrl && requested.target === "live") throw new Error("此外部 HTML 不支持现场所需的菜单和阅读操作，请选择原生或 BLC CSS 主题。");
      if (externalUrl) {
        if (!ports.prepareExternalHtml) throw new Error("当前运行环境不能准备外部 HTML");
        preparedRequestId = crypto.randomUUID();
        await ports.prepareExternalHtml({ requestId: preparedRequestId, document: structuredClone(document), context: structuredClone(requested) });
      }
      let completed = false;
      try {
        const existing = (await bindings.load()).find(item => item.targetId === requested.targetId);
        const context = { ...requested, displayScale: requested.target === "obs" ? requested.displayScale : existing?.displayScale ?? requested.displayScale };
        const value = { document: structuredClone(document), context };
        const previousObsSnapshot = context.target === "obs" ? await (ports.loadObsSnapshot?.(context.targetId) ?? loadObsThemeSnapshot(context.targetId)) : undefined;
        const previousWindowProjection = context.target === "windows" ? await ports.captureWindowProjection?.(context.targetId) : undefined;
        const nextBinding = { targetId: context.targetId, targetKind: context.target, themeId: document.themeId, revision: document.revision, displayScale: context.displayScale };
        await commitThemePublication({
        loadSnapshot: () => ports.loadTarget(context.targetId), nextSnapshot: value,
        previousBinding: existing, nextBinding,
        saveSnapshot: ports.save, removeSnapshot: () => ports.remove(context.targetId),
        saveBinding: binding => bindings.bind(binding), removeBinding: () => bindings.remove(context.targetId),
        publish: async snapshot => {
          if (snapshot.context.target === "obs") {
            const settings = settingsOf(snapshot.document);
            const obsSnapshot = buildBlivechatObsSnapshot(snapshot.document, snapshot.context, { showTimestamp: settings.showTimestamp, maskUsername: settings.maskUsername }, useGeneralSettings.getState().stickyEvents);
            await persistObsThemeSnapshot(obsSnapshot);
            await emitObsThemeSnapshot(obsSnapshot);
          } else if (snapshot.context.target === "windows") {
            await ports.publishWindowProjection?.({ targetId: snapshot.context.targetId, themeId: snapshot.document.themeId, revision: snapshot.document.revision, projection: projectionFor(snapshot.document, snapshot.context) });
          } else if (snapshot.context.target === "live") {
            _applyProjection?.(projectionFor(snapshot.document, snapshot.context));
          }
          await ports.publish(snapshot);
        },
        removeOutput: () => ports.removeOutput?.(context.targetId) ?? ports.publish({ type: "remove", targetId: context.targetId }),
        restoreOutput: async snapshot => {
          const restoreOperations: Promise<unknown>[] = [];
          if (snapshot) {
            restoreOperations.push(ports.publishModeOutput?.(snapshot) ?? ports.restoreOutput?.(snapshot) ?? ports.publish(snapshot));
            if (context.target === "live") {
              if (snapshot.document.mode === "blivechat") _applyProjection?.(projectionFor(snapshot.document, snapshot.context));
              else if (existing) restoreOperations.push(ports.restoreTargetOutput?.(existing, _applyProjection) ?? Promise.resolve());
            }
          }
          else if (existing) restoreOperations.push(ports.restoreTargetOutput?.(existing) ?? Promise.resolve());
          if (context.target === "obs") {
            if (previousObsSnapshot) restoreOperations.push((async () => { await (ports.persistObsSnapshot?.(previousObsSnapshot) ?? persistObsThemeSnapshot(previousObsSnapshot)); await (ports.emitObsSnapshot?.(previousObsSnapshot) ?? emitObsThemeSnapshot(previousObsSnapshot)); })());
            else restoreOperations.push(ports.removeObsSnapshot?.(context.targetId) ?? removeNativeObsThemeSnapshot(context.targetId));
          }
          if (context.target === "windows" && previousWindowProjection && existing && ports.restoreWindowProjection) {
            restoreOperations.push(ports.restoreWindowProjection(previousWindowProjection, { themeId: existing.themeId, revision: existing.revision }));
          }
          const failures = (await Promise.allSettled(restoreOperations)).filter(result => result.status === "rejected");
          if (failures.length) throw new ThemeOutputRollbackError(failures.map(result => result.reason));
        },
        });
        formalBindings.set(context.targetId, nextBinding);
        published.set(context.targetId, value);
        if (preparedRequestId) committedExternalIdentity.set(context.targetId, preparedRequestId);
        notifyCompatibleEventRenderChanged();
        completed = true;
      } finally {
        if (preparedRequestId && !completed) {
          try { await ports.cancelPendingExternal?.(preparedRequestId); }
          finally {
            for (const [targetId, pending] of pendingExternal) if (pending.requestId === preparedRequestId) pendingExternal.delete(targetId);
            for (const [targetId, identity] of committedExternalIdentity) if (identity === preparedRequestId) committedExternalIdentity.delete(targetId);
          }
        }
      }
    },
    async remove(targetId: string, _target: ThemeTarget): Promise<() => Promise<void>> {
      const previous = published.get(targetId);
      const binding = (await bindings.load()).find(item => item.targetId === targetId);
      const previousObsSnapshot = _target === "obs" ? await (ports.loadObsSnapshot?.(targetId) ?? loadObsThemeSnapshot(targetId)) : undefined;
      const restore = await commitThemeRemoval({
        removeSnapshot: () => ports.remove(targetId),
        removeBinding: () => bindings.remove(targetId),
        removeOutput: async () => { if (_target === "obs") await (ports.removeObsSnapshot?.(targetId) ?? removeNativeObsThemeSnapshot(targetId)); await ports.publish({ type: "remove", targetId }); },
        restoreSnapshot: async () => { if (previous) await ports.save(previous); },
        restoreBinding: async () => { if (binding) await bindings.bind(binding); },
        restoreOutput: async () => {
          if (!previous) return;
          await ports.publish(previous);
          if (previous.context.target === "obs" && previousObsSnapshot) { await (ports.persistObsSnapshot?.(previousObsSnapshot) ?? persistObsThemeSnapshot(previousObsSnapshot)); await (ports.emitObsSnapshot?.(previousObsSnapshot) ?? emitObsThemeSnapshot(previousObsSnapshot)); }
          else if (previous.context.target === "windows") await ports.publishWindowProjection?.({ targetId, themeId: previous.document.themeId, revision: previous.document.revision, projection: projectionFor(previous.document, previous.context) });
        },
      });
      published.delete(targetId); formalBindings.delete(targetId);
      notifyCompatibleEventRenderChanged();
      return async () => {
        await restore();
        if (previous) published.set(targetId, previous);
        if (binding) formalBindings.set(targetId, binding);
        notifyCompatibleEventRenderChanged();
      };
    },
    async updateScale(targetId: string, _target: ThemeTarget, displayScale: number, _applyProjection?: (projection: NativeThemeProjection) => void): Promise<void> {
      const current = published.get(targetId);
      const previousBinding = (await bindings.load()).find(item => item.targetId === targetId);
      const previousWindowProjection = current?.context.target === "windows" ? await ports.captureWindowProjection?.(targetId) : undefined;
      try {
        await bindings.setDisplayScale(targetId, displayScale);
        if (current) {
        const value = { ...current, context: { ...current.context, displayScale } };
        await ports.save(value);
        published.set(targetId, value);
        await ports.publish(value);
        if (value.context.target === "obs") { const settings = settingsOf(value.document); const snapshot = buildBlivechatObsSnapshot(value.document, value.context, { showTimestamp: settings.showTimestamp, maskUsername: settings.maskUsername }, useGeneralSettings.getState().stickyEvents); await (ports.persistObsSnapshot?.(snapshot) ?? persistObsThemeSnapshot(snapshot)); await (ports.emitObsSnapshot?.(snapshot) ?? emitObsThemeSnapshot(snapshot)); }
      }
      const binding = formalBindings.get(targetId); if (binding) formalBindings.set(targetId, { ...binding, displayScale });
      if (current) {
        const context = { ...current.context, displayScale };
        if (context.target === "windows") await ports.publishWindowProjection?.({ targetId, themeId: current.document.themeId, revision: current.document.revision, projection: projectionFor(current.document, context) });
        else _applyProjection?.(projectionFor(current.document, context));
        }
      } catch (cause) {
        const operations: Promise<unknown>[] = [];
        if (previousBinding) operations.push(bindings.bind(previousBinding));
        if (current) { operations.push(ports.save(current), ports.publish(current)); published.set(targetId, current); }
        if (previousWindowProjection && previousBinding && ports.restoreWindowProjection) operations.push(ports.restoreWindowProjection(previousWindowProjection, { themeId: previousBinding.themeId, revision: previousBinding.revision }));
        const failures = (await Promise.allSettled(operations)).filter(result => result.status === "rejected");
        if (failures.length) throw new ThemeOutputRollbackError([cause, ...failures.map(result => result.reason)]);
        throw cause;
      }
      notifyCompatibleEventRenderChanged();
    },
    resolve(context: CompatibleEventSurfaceContext): CompatibleEventRender | undefined {
      const current = published.get(context.targetId);
      if (!current || current.document.mode !== "blivechat") return undefined;
      const binding = formalBindings.get(context.targetId);
      if (!binding || binding.targetKind !== context.target || binding.themeId !== current.document.themeId || binding.revision !== current.document.revision) return undefined;
      return resolvePublishedBlivechatRender(current, context, committedExternalIdentity.get(context.targetId));
    },
    resolvePendingExternal(context: CompatibleEventSurfaceContext): CompatibleExternalHtmlDescriptor | undefined {
      const pending = pendingExternal.get(context.targetId);
      const url = pending && blivechatExternalHtmlUrlOf(pending.document);
      if (!pending || !url || pending.context.target !== context.target || context.target === "live" || context.placement !== "main") return undefined;
      const settings = settingsOf(pending.document);
      return { instanceId: pending.requestId, url, target: context.target, targetId: context.targetId, css: composeBlivechatThemeCss(pending.document), config: { showGiftName: settings.showGiftName, mergeSimilarDanmaku: false, mergeGift: false, maxNumber: 50 } };
    },
    async markPendingExternalReady(targetId: string): Promise<void> {
      const pending = pendingExternal.get(targetId); if (!pending) return;
      await ports.publishExternalReady?.(pending.requestId);
    },
    snapshot(targetId: string): PublishedBlivechatTarget | undefined {
      const value = published.get(targetId);
      return value ? structuredClone(value) : undefined;
    },
  };
  return api;
}

export const blivechatThemeRuntime = createBlivechatThemeRuntime();


export function resolvePublishedBlivechatRender(current: PublishedBlivechatTarget, context: CompatibleEventSurfaceContext, externalInstanceId?: string) {
      const roomMatches = !current.context.roomId || context.roomId == null || current.context.roomId === String(context.roomId);
      const settings = { ...settingsOf(current.document), eventVisibility: resolveThemeEventVisibility(normalizeCompatibleEventVisibility("blivechat", current.document.settings.eventVisibility), context.target) };
      const scopeId = `blivechat:${context.target}:${context.targetId}`;
      const auxiliaryDisplay = context.target !== "live";
      const render = (() => null) as CompatibleEventRenderWithRoot;
      render.eventDecision = memoizeCompatibleEventDecision((event: DanmakuEvent) => {
        const eventRoomMatches = context.roomId == null || event.roomId === context.roomId;
        if (event.gift?.blindGiftName || !roomMatches || !eventRoomMatches || event.msgType === MsgType.ScDeleted || event.isComboUpdate) return "omit";
        if (!(isCompatibleThemeEventVisible("blivechat", settings.eventVisibility, event))) return "omit";
        if (projectBlivechatEvent(event, { roomId: context.roomId ?? event.roomId, generation: 0 }, 1, event.ts)) return "render";
        return context.target === "obs" ? "omit" : "fallback";
      });
      render.rootProps = {
        rendererMode: "blivechat-source-document",
        scopeId,
        surfaceStyle: { backgroundColor: "var(--yt-live-chat-background-color)" },
        ...(auxiliaryDisplay && settings.showTimestamp
          ? { style: { "--yt-live-chat-paid-message-timestamp-display": "inline" } as CSSProperties }
          : {}),
      };
      if (context.placement === "main") render.listSurface = {
        maskUsername: auxiliaryDisplay && settings.maskUsername,
        url: "/blivechat/renderer.html",
        protocol: "bb-blivechat",
        title: "BLC 原版事件列表",
        css: [composeBlivechatThemeCss(current.document), createBlivechatAuxiliaryDisplayCss({
          ...settings,
          showTimestamp: auxiliaryDisplay && settings.showTimestamp,
          maskUsername: auxiliaryDisplay && settings.maskUsername,
        })].filter(Boolean).join("\n\n"),
        config: createBlivechatSourceConfig(settings),
        eventDecision: render.eventDecision,
        project: (event, sequence) => {
          const eventRoomMatches = context.roomId == null || event.roomId === context.roomId;
          if (event.gift?.blindGiftName || !roomMatches || !eventRoomMatches || render.eventDecision?.(event) === "omit") return null;
          const record = projectBlivechatCallback(event, sequence);
          return record ? projectCallbackNames(record, auxiliaryDisplay && settings.maskUsername) : null;
        },
      };
      const externalUrl = blivechatExternalHtmlUrlOf(current.document);
      if (externalUrl && context.target !== "live" && context.placement === "main") render.externalHtml = {
        instanceId: externalInstanceId ?? `${current.document.themeId}:${current.document.revision}`,
        url: externalUrl,
        target: context.target,
        targetId: context.targetId,
        css: composeBlivechatThemeCss(current.document),
        config: { showGiftName: settings.showGiftName, mergeSimilarDanmaku: false, mergeGift: false, maxNumber: 50 },
      };
      return render;
}
