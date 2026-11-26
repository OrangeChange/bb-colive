import { resolveThemeEventVisibility } from "../../themes/themeEventVisibility.ts";
import { normalizeCompatibleEventVisibility } from "../../themes/compatibleEventVisibility.ts";
import { projectCallbackNames } from "../../events/displayNameProjection.ts";
import { memoizeCompatibleEventDecision } from "../CompatibleEventRenderer.tsx";
import { compatibleFallbackDisplay } from "../../themes/compatThemeSettings.ts";
import { renderManagedNativeCss } from "../../themes/nativeManagedCss.ts";
import { isCompatibleThemeEventVisible } from "../../themes/compatibleEventVisibility.ts";
import type { CSSProperties } from "react";
import { load } from "../../appData.ts";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { notifyCompatibleEventRenderChanged, type CompatibleEventRender, type CompatibleEventRenderWithRoot, type CompatibleEventSurfaceContext } from "../CompatibleEventRenderer.tsx";
import { THEME_BINDINGS_EVENT, themeBindingRegistry, type ThemeBinding, type ThemeBindingRegistry } from "../../themes/themeBindings.ts";
import type { ThemeDocument, ThemeTarget } from "../../themes/themeTypes.ts";
import type { NativeThemeProjection } from "../../themes/nativeThemeProjection.ts";
import { createDefaultEventStyleSettings } from "../../eventStyleSettings.ts";
import { emitObsThemeSnapshot, loadObsThemeSnapshot, persistObsThemeSnapshot, removeNativeObsThemeSnapshot, type ObsThemeSnapshot } from "../../obs/nativeObsTheme.ts";
import { DEFAULT_OPENLIVE_THEME_SETTINGS, type OpenLiveRuntimeSettings } from "./theme.ts";
import { buildOpenLiveObsSnapshot } from "./obs.ts";
import { createOpenLiveDocumentCss } from "./css.ts";
import { commitThemePublication, commitThemeRemoval, ThemeOutputRollbackError } from "../../themes/themeWorkspaceTransactions.ts";
import { projectOpenLiveCallback, projectOpenLiveEvent } from "./projection.ts";
import { createOpenLiveSourceConfig } from "./sourceConfig.ts";
import { MsgType } from "../../protocol/eventTypeCodes.ts";
import type { DanmakuEvent } from "../../protocol/types.ts";
import { publishCompatibleRuntimeSnapshot, removeCompatibleRuntimeOutput } from "../compatibleRuntimePublication.ts";
import { useGeneralSettings } from "../../generalSettings.ts";
import { captureCompatibleWindowThemeProjection, publishCompatibleWindowThemeProjection, restoreCompatibleWindowThemeProjection, restoreStoredNativeThemeTargetOutput, type CompatibleWindowProjectionSnapshot } from "../../themes/nativeThemeRuntime.ts";

export interface OpenLiveRenderContext { target: ThemeTarget; targetId: string; roomId: string; displayScale: number }
export interface PublishedOpenLiveTarget { document: ThemeDocument; context: OpenLiveRenderContext }
const RUNTIME_STORE = "compatible-theme-runtime.local.json";
const PUBLICATION_EVENT = "compatible-theme-publication:openlive";

export interface OpenLiveRuntimePorts {
  load(): Promise<PublishedOpenLiveTarget[]>;
  loadTarget(targetId: string): Promise<PublishedOpenLiveTarget | undefined>;
  save(value: PublishedOpenLiveTarget): Promise<void>;
  remove(targetId: string): Promise<void>;
  publish(value: PublishedOpenLiveTarget | { type: "remove"; targetId: string }): Promise<void>;
  removeOutput?(targetId: string): Promise<void>;
  restoreOutput?(value: PublishedOpenLiveTarget): Promise<void>;
  publishModeOutput?(value: PublishedOpenLiveTarget): Promise<void>;
  restoreTargetOutput?(binding: ThemeBinding): Promise<void>;
  subscribe(listener: (value: PublishedOpenLiveTarget | { type: "remove"; targetId: string }) => void): (() => void) | Promise<() => void>;
  loadBindings?(): Promise<ThemeBinding[]>;
  subscribeBindings?(listener: (bindings: ThemeBinding[]) => void): (() => void) | Promise<() => void>;
  loadObsSnapshot?(targetId: string): Promise<ObsThemeSnapshot | undefined>;
  removeObsSnapshot?(targetId: string): Promise<void>;
  persistObsSnapshot?(snapshot: ObsThemeSnapshot): Promise<void>;
  emitObsSnapshot?(snapshot: ObsThemeSnapshot): Promise<void>;
  publishWindowProjection?(value: { targetId: string; themeId: string; revision: number; projection: NativeThemeProjection }): Promise<void>;
  captureWindowProjection?(targetId: string): Promise<CompatibleWindowProjectionSnapshot>;
  restoreWindowProjection?(snapshot: CompatibleWindowProjectionSnapshot, publication: { themeId: string; revision: number }): Promise<void>;
}

const runtimePorts: OpenLiveRuntimePorts = {
  async load() { const store = await load(RUNTIME_STORE, { autoSave: false, defaults: {} }); return (await store.values<PublishedOpenLiveTarget>()).filter(value => value.document.mode === "blivechat-open"); },
  async loadTarget(targetId) { const store = await load(RUNTIME_STORE, { autoSave: false, defaults: {} }); return await store.get<PublishedOpenLiveTarget>(targetId) ?? undefined; },
  async save(value) { const store = await load(RUNTIME_STORE, { autoSave: false, defaults: {} }); await store.set(value.context.targetId, value); await store.save(); },
  async remove(targetId) { const store = await load(RUNTIME_STORE, { autoSave: false, defaults: {} }); await store.delete(targetId); await store.save(); },
  publish: value => emit(PUBLICATION_EVENT, value),
  removeOutput: targetId => removeCompatibleRuntimeOutput("blivechat-open", targetId),
  restoreOutput: value => publishCompatibleRuntimeSnapshot(value),
  publishModeOutput: value => publishCompatibleRuntimeSnapshot(value),
  restoreTargetOutput: binding => restoreStoredNativeThemeTargetOutput(binding),
  subscribe: listener => listen<PublishedOpenLiveTarget>(PUBLICATION_EVENT, event => listener(event.payload)) as Promise<UnlistenFn>,
  loadBindings: () => themeBindingRegistry.load(),
  subscribeBindings: listener => listen<ThemeBinding[]>(THEME_BINDINGS_EVENT, event => listener(event.payload)) as Promise<UnlistenFn>,
  loadObsSnapshot: loadObsThemeSnapshot, removeObsSnapshot: removeNativeObsThemeSnapshot,
  persistObsSnapshot: persistObsThemeSnapshot, emitObsSnapshot: emitObsThemeSnapshot,
  publishWindowProjection: value => publishCompatibleWindowThemeProjection(value.targetId, value.themeId, value.revision, value.projection),
  captureWindowProjection: captureCompatibleWindowThemeProjection,
  restoreWindowProjection: restoreCompatibleWindowThemeProjection,
};

function settingsOf(document: ThemeDocument): OpenLiveRuntimeSettings {
  const input = document.settings as Partial<OpenLiveRuntimeSettings>;
  return { ...DEFAULT_OPENLIVE_THEME_SETTINGS, ...input, skin: input.skin === "default" ? "default" : "none", emoticonSize: Number.isFinite(input.emoticonSize) ? Number(input.emoticonSize) : 80, showGiftInfo: input.showGiftInfo !== false, showTimestamp: input.showTimestamp === true, maskUsername: input.maskUsername === true, showAvatar: input.showAvatar !== false, showUsername: input.showUsername !== false, showMedal: input.showMedal !== false, showGuardBadge: input.showGuardBadge !== false, showModBadge: input.showModBadge !== false, showMedalLightenedOnly: input.showMedalLightenedOnly !== false, showMedalCurrentRoomOnly: input.showMedalCurrentRoomOnly === true, ...(input.visualModel ? { visualModel: input.visualModel } : {}) };
}
export { composeOpenLiveThemeCss } from "./css.ts";
function projectionFor(document: ThemeDocument, context: OpenLiveRenderContext): NativeThemeProjection {
  const display = compatibleFallbackDisplay("blivechat-open", settingsOf(document));
  const settings = {...createDefaultEventStyleSettings(),display};
  return { settings, display, scheme: "common", visual: {}, css: renderManagedNativeCss(settings), displayScale: context.displayScale };
}

export function createOpenLiveThemeRuntime(bindings: ThemeBindingRegistry = themeBindingRegistry, ports: OpenLiveRuntimePorts = runtimePorts) {
  const published = new Map<string, PublishedOpenLiveTarget>();
  const formalBindings = new Map<string, ThemeBinding>();
  let stop: (() => void) | undefined;
  const api = {
    async start(): Promise<() => void> {
      if (stop) return stop;
      for (const value of await ports.load()) published.set(value.context.targetId, structuredClone(value));
      for (const binding of await (ports.loadBindings?.() ?? bindings.load())) formalBindings.set(binding.targetId, structuredClone(binding));
      const unsubscribe = await ports.subscribe(value => {
        if ("type" in value) published.delete(value.targetId);
        else if (value.document.mode === "blivechat-open") { published.set(value.context.targetId, structuredClone(value)); formalBindings.set(value.context.targetId, { targetId: value.context.targetId, targetKind: value.context.target, themeId: value.document.themeId, revision: value.document.revision, displayScale: value.context.displayScale }); }
        else published.delete(value.context.targetId);
        notifyCompatibleEventRenderChanged();
      });
      const unsubscribeBindings = ports.subscribeBindings ? await ports.subscribeBindings(next => { formalBindings.clear(); next.forEach(binding => formalBindings.set(binding.targetId, structuredClone(binding))); notifyCompatibleEventRenderChanged(); }) : bindings.subscribe(binding => { formalBindings.set(binding.targetId, structuredClone(binding)); notifyCompatibleEventRenderChanged(); });
      stop = () => {
        unsubscribe(); unsubscribeBindings();
        published.clear(); formalBindings.clear();
        stop = undefined;
        notifyCompatibleEventRenderChanged();
      };
      return stop;
    },
    async publish(document: ThemeDocument, requested: OpenLiveRenderContext, applyProjection?: (projection: NativeThemeProjection) => void): Promise<void> {
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
          await ports.publish(snapshot);
          if (snapshot.context.target === "obs") {
            const obsSnapshot = buildOpenLiveObsSnapshot(snapshot.document, snapshot.context, settingsOf(snapshot.document), useGeneralSettings.getState().stickyEvents);
            await (ports.persistObsSnapshot?.(obsSnapshot) ?? persistObsThemeSnapshot(obsSnapshot));
            await (ports.emitObsSnapshot?.(obsSnapshot) ?? emitObsThemeSnapshot(obsSnapshot));
          } else if (snapshot.context.target === "windows") {
            await ports.publishWindowProjection?.({ targetId: snapshot.context.targetId, themeId: snapshot.document.themeId, revision: snapshot.document.revision, projection: projectionFor(snapshot.document, snapshot.context) });
          } else if (snapshot.context.target === "live") {
            applyProjection?.(projectionFor(snapshot.document, snapshot.context));
          }
        },
        removeOutput: () => ports.removeOutput?.(context.targetId) ?? ports.publish({ type: "remove", targetId: context.targetId }),
        restoreOutput: async snapshot => {
          const restoreOperations: Promise<unknown>[] = [];
          if (snapshot) restoreOperations.push(ports.publishModeOutput?.(snapshot) ?? ports.restoreOutput?.(snapshot) ?? ports.publish(snapshot));
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
      published.set(context.targetId, value); formalBindings.set(context.targetId, nextBinding);
      notifyCompatibleEventRenderChanged();
    },
    async remove(targetId: string, target: ThemeTarget): Promise<() => Promise<void>> {
      const previous = published.get(targetId); const binding = (await bindings.load()).find(item => item.targetId === targetId);
      const previousObsSnapshot = target === "obs" ? await (ports.loadObsSnapshot?.(targetId) ?? loadObsThemeSnapshot(targetId)) : undefined;
      const restore = await commitThemeRemoval({
        removeSnapshot: () => ports.remove(targetId), removeBinding: () => bindings.remove(targetId),
        removeOutput: async () => { if (target === "obs") await (ports.removeObsSnapshot?.(targetId) ?? removeNativeObsThemeSnapshot(targetId)); await ports.publish({ type: "remove", targetId }); },
        restoreSnapshot: async () => { if (previous) await ports.save(previous); }, restoreBinding: async () => { if (binding) await bindings.bind(binding); },
        restoreOutput: async () => { if (!previous) return; await ports.publish(previous); if (previous.context.target === "obs" && previousObsSnapshot) { await (ports.persistObsSnapshot?.(previousObsSnapshot) ?? persistObsThemeSnapshot(previousObsSnapshot)); await (ports.emitObsSnapshot?.(previousObsSnapshot) ?? emitObsThemeSnapshot(previousObsSnapshot)); } else if (previous.context.target === "windows") await ports.publishWindowProjection?.({ targetId, themeId: previous.document.themeId, revision: previous.document.revision, projection: projectionFor(previous.document, previous.context) }); },
      });
      published.delete(targetId); formalBindings.delete(targetId); notifyCompatibleEventRenderChanged();
      return async () => { await restore(); if (previous) published.set(targetId, previous); if (binding) formalBindings.set(targetId, binding); notifyCompatibleEventRenderChanged(); };
    },
    async updateScale(targetId: string, _target: ThemeTarget, displayScale: number, applyProjection?: (projection: NativeThemeProjection) => void): Promise<void> {
      const current = published.get(targetId); const previousBinding = (await bindings.load()).find(item => item.targetId === targetId); const previousWindowProjection = current?.context.target === "windows" ? await ports.captureWindowProjection?.(targetId) : undefined;
      try {
        await bindings.setDisplayScale(targetId, displayScale);
        if (current) { const value = { ...current, context: { ...current.context, displayScale } }; await ports.save(value); published.set(targetId, value); await ports.publish(value); if (value.context.target === "obs") { const snapshot = buildOpenLiveObsSnapshot(value.document, value.context, settingsOf(value.document), useGeneralSettings.getState().stickyEvents); await (ports.persistObsSnapshot?.(snapshot) ?? persistObsThemeSnapshot(snapshot)); await (ports.emitObsSnapshot?.(snapshot) ?? emitObsThemeSnapshot(snapshot)); } else if (value.context.target === "windows") await ports.publishWindowProjection?.({ targetId, themeId: value.document.themeId, revision: value.document.revision, projection: projectionFor(value.document, value.context) }); else applyProjection?.(projectionFor(value.document, value.context)); }
      } catch (cause) {
        const operations: Promise<unknown>[] = [];
        if (previousBinding) operations.push(bindings.bind(previousBinding));
        if (current) { operations.push(ports.save(current), ports.publish(current)); published.set(targetId, current); }
        if (previousWindowProjection && previousBinding && ports.restoreWindowProjection) operations.push(ports.restoreWindowProjection(previousWindowProjection, { themeId: previousBinding.themeId, revision: previousBinding.revision }));
        const failures = (await Promise.allSettled(operations)).filter(result => result.status === "rejected");
        if (failures.length) throw new ThemeOutputRollbackError([cause, ...failures.map(result => result.reason)]);
        throw cause;
      }
      const binding = formalBindings.get(targetId); if (binding) formalBindings.set(targetId, { ...binding, displayScale }); notifyCompatibleEventRenderChanged();
    },
    resolve(context: CompatibleEventSurfaceContext): CompatibleEventRender | undefined {
      const current = published.get(context.targetId); if (!current || current.document.mode !== "blivechat-open") return undefined;
      const binding = formalBindings.get(context.targetId); if (!binding || binding.targetKind !== context.target || binding.themeId !== current.document.themeId || binding.revision !== current.document.revision) return undefined;
      return resolvePublishedOpenLiveRender(current, context);
    },
    snapshot(targetId: string): PublishedOpenLiveTarget | undefined { const value = published.get(targetId); return value ? structuredClone(value) : undefined; },
  };
  return api;
}
export const openLiveThemeRuntime = createOpenLiveThemeRuntime();

export function resolvePublishedOpenLiveRender(current: PublishedOpenLiveTarget, context: CompatibleEventSurfaceContext) {
      const roomMatches = context.target !== "obs" || !current.context.roomId || context.roomId == null || current.context.roomId === String(context.roomId);
      const scopeId = `blivechat-open:${context.target}:${context.targetId}`;
      const settings = { ...settingsOf(current.document), eventVisibility: resolveThemeEventVisibility(normalizeCompatibleEventVisibility("blivechat-open", current.document.settings.eventVisibility), context.target) }; const auxiliary = context.target !== "live";
      const render = (() => null) as CompatibleEventRenderWithRoot;
      render.eventDecision = memoizeCompatibleEventDecision((event: DanmakuEvent) => {
        const invalidLike = event.msgType === MsgType.Interact && event.interactKind === "like"
          && (!Number.isSafeInteger(event.likeCount) || Number(event.likeCount) < 0);
        const eventRoomMatches = context.roomId == null || event.roomId === context.roomId;
        if (!roomMatches || !eventRoomMatches || event.isComboUpdate || invalidLike) return "omit";
        if (!(isCompatibleThemeEventVisible("blivechat-open", settings.eventVisibility, event))) return "omit";
        if (projectOpenLiveEvent(event, { roomId: context.roomId ?? event.roomId, generation: 0 }, 1, event.ts)) return "render";
        return context.target === "obs" ? "omit" : "fallback";
      });
      const timestampDisplay = auxiliary && settings.showTimestamp ? "inline" : "none";
      render.rootProps = { rendererMode: "openlive-source-document", scopeId, showTimestamp: timestampDisplay === "inline", surfaceStyle: { backgroundColor: "var(--yt-live-chat-background-color)" }, style: { "--yt-live-chat-item-timestamp-display": timestampDisplay, "--yt-live-chat-paid-message-timestamp-display": timestampDisplay } as CSSProperties };
      if (context.placement === "main") {
        const sourceCss = createOpenLiveDocumentCss(current.document);
        const auxiliaryCss = [
          sourceCss.appearanceCss,
          auxiliary && settings.showTimestamp ? ":where(#timestamp){display:inline!important}" : "",
          settings.showAvatar ? "" : ":where(#author-photo){display:none!important}",
          settings.showUsername ? "" : ":where(#author-name){display:none!important}",
          settings.showMedal ? "" : ":where(yt-live-chat-author-medal-renderer){display:none!important}",
        ].filter(Boolean).join("\n");
        render.listSurface = {
          maskUsername: auxiliary && settings.maskUsername,
          url: "/openlive/renderer.html",
          protocol: "bb-openlive",
          title: "BLC 开放版事件列表",
          css: sourceCss.css,
          appearanceCss: auxiliaryCss,
          config: createOpenLiveSourceConfig(settings, { maxNumber: 60 }),
          eventDecision: render.eventDecision,
          project: (event, sequence) => {
            const eventRoomMatches = context.roomId == null || event.roomId === context.roomId;
          if (!roomMatches || !eventRoomMatches || render.eventDecision?.(event) === "omit") return null;
            const record = projectOpenLiveCallback(event, sequence);
          return record ? projectCallbackNames(record, auxiliary && settings.maskUsername) : null;
          },
        };
      }
      return render;
}
