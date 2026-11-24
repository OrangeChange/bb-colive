import { resolveThemeEventVisibility } from "../../themes/themeEventVisibility.ts";
import { normalizeCompatibleEventVisibility } from "../../themes/compatibleEventVisibility.ts";
import { maskLaplaceNames } from "../../events/displayNameProjection.ts";
import { memoizeCompatibleEventDecision } from "../CompatibleEventRenderer.tsx";
import { isCompatibleThemeEventVisible, isLaplaceThemeSampleVisible, laplaceThemeVisibilitySettings } from "../../themes/compatibleEventVisibility.ts";
import { load } from "../../appData.ts";
import { emit, listen } from "@tauri-apps/api/event";
import type { ThemeDocument, ThemeTarget } from "../../themes/themeTypes.ts";
import type { ThemeRenderContext } from "../../themes/themeModeAdapters.ts";
import type { ThemeBinding } from "../../themes/themeBindings.ts";
import {
  themeBindingRegistry,
  THEME_BINDINGS_EVENT,
  type ThemeBindingRegistry,
} from "../../themes/themeBindings.ts";
import { materializeCompatibleVisualCss } from "../../themes/compatManagedCss.ts";
import type { LaplaceThemeSettings } from "../../themes/compatThemeSettings.ts";
import type {
  CompatibleEventSurfaceContext,
  CompatibleEventRenderWithRoot,
} from "../CompatibleEventRenderer.tsx";
import { notifyCompatibleEventRenderChanged } from "../CompatibleEventRenderer.tsx";
import { captureCompatibleWindowThemeProjection, publishCompatibleWindowThemeProjection, restoreCompatibleWindowThemeProjection, restoreStoredNativeThemeTargetOutput, type CompatibleWindowProjectionSnapshot } from "../../themes/nativeThemeRuntime.ts";
import { createLaplaceBaseCss, LAPLACE_CAPABILITY } from "./theme.ts";
import { buildLaplaceObsSnapshot } from "./obs.ts";
import { commitThemePublication, commitThemeRemoval, ThemeOutputRollbackError } from "../../themes/themeWorkspaceTransactions.ts";
import laplaceSourceCss from "./source.css?raw";
import { composeLaplaceCssLayers, composeLaplaceExportCss } from "./cssCascade.ts";
import {
  persistObsThemeSnapshot,
  emitObsThemeSnapshot,
  loadObsThemeSnapshot,
  removeNativeObsThemeSnapshot,
  type ObsThemeSnapshot,
} from "../../obs/nativeObsTheme.ts";
import type { NativeThemeProjection } from "../../themes/nativeThemeProjection.ts";
import { createDefaultEventStyleSettings } from "../../eventStyleSettings.ts";
import { createDefaultNativeThemeDisplaySettings } from "../../themes/nativeComponentAppearance.ts";
import { projectLaplaceEvent } from "./projection.ts";
import { MsgType } from "../../protocol/eventTypeCodes.ts";
import type { DanmakuEvent } from "../../protocol/types.ts";
import { DEFAULT_LAPLACE_SETTINGS } from "./settings.ts";
import { stableCompatibleEventId } from "../compatibleLiveBridge.ts";
import { publishCompatibleRuntimeSnapshot, removeCompatibleRuntimeOutput } from "../compatibleRuntimePublication.ts";
import { useGeneralSettings } from "../../generalSettings.ts";

export function maskLaplaceProductEvent<T extends Record<string, any>>(event: T): T {
  return maskLaplaceNames(event);
}

const STORE = "compatible-theme-runtime.local.json";
const EVENT = "compatible-theme-publication:laplace";
export type PublishedLaplaceTarget = {
  document: ThemeDocument;
  context: ThemeRenderContext;
};
type Published = PublishedLaplaceTarget;
function settingsOf(document: ThemeDocument): LaplaceThemeSettings {
  const value = document.settings as Partial<LaplaceThemeSettings>;
  return {
    ...value,
    showSpoiler: value.showSpoiler !== false,
    showGiftHighlightAbove:
      typeof value.showGiftHighlightAbove === "number"
        ? value.showGiftHighlightAbove
        : 30,
    classicElementScope: value.classicElementScope === true,
    showAvatar: value.showAvatar !== false,
    showUsername: value.showUsername !== false,
    showMedal: value.showMedal !== false,
    showAvatarFrame: value.showAvatarFrame !== false,
    showGuardBadge: value.showGuardBadge !== false,
    showMedalLightenedOnly: value.showMedalLightenedOnly !== false,
    showMedalCurrentRoomOnly: value.showMedalCurrentRoomOnly === true,
    showWealthMedal: value.showWealthMedal === true,
    showCurrentRank: value.showCurrentRank === true,
    showModBadge: value.showModBadge !== false,
    showAnchorBadge: value.showAnchorBadge !== false,
    baseFontSize:
      typeof value.baseFontSize === "number" ? value.baseFontSize : 20,
    colorScheme: value.colorScheme === "dark" ? "dark" : "light",
    sceneName:
      typeof value.sceneName === "string" ? value.sceneName : "",
    showTimestamp: value.showTimestamp === true,
    maskUsername: value.maskUsername === true,
    ...(value.visualModel ? { visualModel: value.visualModel } : {}),
  };
}
function createLaplaceConfigCss(document: ThemeDocument): string {
  const settings = settingsOf(document);
  return [
    `@layer config {${createLaplaceBaseCss(settings)}}`,
    materializeCompatibleVisualCss(
      document as ThemeDocument & { settings: LaplaceThemeSettings },
      LAPLACE_CAPABILITY,
    ),
    settings.showTimestamp ? ".timestamp{display:inline-flex!important}" : ".timestamp:not(.inline){display:none!important}",
  ].filter(Boolean).join("\n\n");
}
export function composeLaplaceRendererCssSources(document: ThemeDocument): { cloud: string; remote: string; custom: string } {
  return composeLaplaceCssLayers(laplaceSourceCss, document.styles.baseCss, createLaplaceConfigCss(document), document.styles.customCss);
}
export function composeLaplaceThemeCss(document: ThemeDocument): string {
  return composeLaplaceExportCss(laplaceSourceCss, document.styles.baseCss, createLaplaceConfigCss(document), document.styles.customCss);
}
export interface LaplaceRuntimePorts {
  load(): Promise<Published[]>;
  loadTarget(targetId: string): Promise<Published | undefined>;
  save(value: Published): Promise<void>;
  remove(targetId: string): Promise<void>;
  publish(
    value: Published | { type: "remove"; targetId: string },
  ): Promise<void>;
  removeOutput?(targetId: string): Promise<void>;
  restoreOutput?(value: Published): Promise<void>;
  publishModeOutput?(value: Published): Promise<void>;
  restoreTargetOutput?(binding: ThemeBinding): Promise<void>;
  subscribe(
    listener: (value: Published | { type: "remove"; targetId: string }) => void,
  ): (() => void) | Promise<() => void>;
  loadBindings?(): Promise<ThemeBinding[]>;
  subscribeBindings?(
    listener: (bindings: ThemeBinding[]) => void,
  ): (() => void) | Promise<() => void>;
  loadObsSnapshot?(targetId: string): Promise<ObsThemeSnapshot | undefined>;
  removeObsSnapshot?(targetId: string): Promise<void>;
  persistObsSnapshot?(snapshot: ObsThemeSnapshot): Promise<void>;
  emitObsSnapshot?(snapshot: ObsThemeSnapshot): Promise<void>;
  publishWindowProjection?(value: {
    targetId: string;
    themeId: string;
    revision: number;
    projection: NativeThemeProjection;
  }): Promise<void>;
  captureWindowProjection?(targetId: string): Promise<CompatibleWindowProjectionSnapshot>;
  restoreWindowProjection?(snapshot: CompatibleWindowProjectionSnapshot, publication: { themeId: string; revision: number }): Promise<void>;
}
const runtimePorts: LaplaceRuntimePorts = {
  async load() {
    const store = await load(STORE, { autoSave: false, defaults: {} });
    return (await store.values<Published>()).filter(
      (value) => value.document.mode === "laplace",
    );
  },
  async loadTarget(targetId) {
    const store = await load(STORE, { autoSave: false, defaults: {} });
    return await store.get<Published>(targetId) ?? undefined;
  },
  async save(value) {
    const store = await load(STORE, { autoSave: false, defaults: {} });
    await store.set(value.context.targetId, value);
    await store.save();
  },
  async remove(targetId) {
    const store = await load(STORE, { autoSave: false, defaults: {} });
    await store.delete(targetId);
    await store.save();
  },
  publish: (value) => emit(EVENT, value),
  removeOutput: targetId => removeCompatibleRuntimeOutput("laplace", targetId),
  restoreOutput: value => publishCompatibleRuntimeSnapshot(value),
  publishModeOutput: value => publishCompatibleRuntimeSnapshot(value),
  restoreTargetOutput: binding => restoreStoredNativeThemeTargetOutput(binding),
  loadObsSnapshot: loadObsThemeSnapshot,
  removeObsSnapshot: removeNativeObsThemeSnapshot,
  persistObsSnapshot: persistObsThemeSnapshot,
  emitObsSnapshot: emitObsThemeSnapshot,
  subscribe: (listener) =>
    listen<Published | { type: "remove"; targetId: string }>(EVENT, (event) =>
      listener(event.payload),
    ),
  loadBindings: () => themeBindingRegistry.load(),
  subscribeBindings: (listener) =>
    listen<ThemeBinding[]>(THEME_BINDINGS_EVENT, (event) =>
      listener(event.payload),
    ),
  publishWindowProjection: (value) =>
    publishCompatibleWindowThemeProjection(value.targetId, value.themeId, value.revision, value.projection),
  captureWindowProjection: targetId => captureCompatibleWindowThemeProjection(targetId),
  restoreWindowProjection: (snapshot, publication) => restoreCompatibleWindowThemeProjection(snapshot, publication),
};
function projectionFor(
  document: ThemeDocument,
  context: ThemeRenderContext,
): NativeThemeProjection {
  const settings = settingsOf(document);
  const display = createDefaultNativeThemeDisplaySettings();
  display.showTimestamp = settings.showTimestamp;
  display.maskUsername = settings.maskUsername;
  return {
    settings: createDefaultEventStyleSettings(),
    display,
    scheme: "common",
    visual: {},
    css: "",
    displayScale: context.displayScale,
  };
}
export function createLaplaceThemeRuntime(
  registry: ThemeBindingRegistry = themeBindingRegistry,
  ports: LaplaceRuntimePorts = runtimePorts,
) {
  const published = new Map<string, Published>();
  const bindings = new Map<string, ThemeBinding>();
  let stop: (() => void) | undefined;
  const api = {
    async start() {
      if (stop) return stop;
      for (const value of await ports.load())
        if (value.document.mode === "laplace")
          published.set(value.context.targetId, structuredClone(value));
      for (const binding of await (ports.loadBindings?.() ?? registry.load()))
        bindings.set(binding.targetId, structuredClone(binding));
      const unpub = await ports.subscribe((value) => {
        if ("type" in value) published.delete(value.targetId);
        else if (value.document.mode === "laplace")
          published.set(value.context.targetId, structuredClone(value));
        else published.delete(value.context.targetId);
        notifyCompatibleEventRenderChanged();
      });
      const unbind = ports.subscribeBindings
        ? await ports.subscribeBindings((next) => {
            bindings.clear();
            next.forEach((value) =>
              bindings.set(value.targetId, structuredClone(value)),
            );
            notifyCompatibleEventRenderChanged();
          })
        : registry.subscribe((value) => {
            bindings.set(value.targetId, structuredClone(value));
            notifyCompatibleEventRenderChanged();
          });
      stop = () => {
        unpub();
        unbind();
        published.clear();
        bindings.clear();
        stop = undefined;
        notifyCompatibleEventRenderChanged();
      };
      return stop;
    },
    async publish(
      document: ThemeDocument,
      requested: ThemeRenderContext,
      applyProjection?: (projection: NativeThemeProjection) => void,
    ) {
      const existing = (await registry.load()).find(
        (value) => value.targetId === requested.targetId,
      );
      const context = {
        ...requested,
        displayScale: requested.target === "obs" ? requested.displayScale : existing?.displayScale ?? requested.displayScale,
      };
      const value = { document: structuredClone(document), context };
      const previousObsSnapshot = context.target === "obs" ? await (ports.loadObsSnapshot?.(context.targetId) ?? loadObsThemeSnapshot(context.targetId)) : undefined;
      const previousWindowProjection = context.target === "windows" ? await ports.captureWindowProjection?.(context.targetId) : undefined;
      const nextBinding = {
        targetId: context.targetId,
        targetKind: context.target,
        themeId: document.themeId,
        revision: document.revision,
        displayScale: context.displayScale,
      };
      await commitThemePublication({
        loadSnapshot: () => ports.loadTarget(context.targetId), nextSnapshot: value,
        previousBinding: existing, nextBinding,
        saveSnapshot: ports.save, removeSnapshot: () => ports.remove(context.targetId),
        saveBinding: binding => registry.bind(binding), removeBinding: () => registry.remove(context.targetId),
        publish: async snapshot => {
          await ports.publish(snapshot);
          if (snapshot.context.target === "obs") {
            const obsSnapshot = buildLaplaceObsSnapshot(snapshot.document, snapshot.context, useGeneralSettings.getState().stickyEvents);
            await persistObsThemeSnapshot(obsSnapshot);
            await emitObsThemeSnapshot(obsSnapshot);
          } else if (snapshot.context.target === "windows") {
            await ports.publishWindowProjection?.({
              targetId: snapshot.context.targetId,
              themeId: snapshot.document.themeId,
              revision: snapshot.document.revision,
              projection: projectionFor(snapshot.document, snapshot.context),
            });
          } else applyProjection?.(projectionFor(snapshot.document, snapshot.context));
        },
        removeOutput: () => ports.removeOutput?.(context.targetId) ?? ports.publish({ type: "remove", targetId: context.targetId }),
        restoreOutput: async snapshot => {
          const restoreOperations: Array<Promise<unknown>> = [];
          if (snapshot) restoreOperations.push(ports.publishModeOutput?.(snapshot) ?? ports.restoreOutput?.(snapshot) ?? ports.publish(snapshot));
          else if (existing && ports.restoreTargetOutput && (
            context.target !== "windows" || !previousWindowProjection || !ports.restoreWindowProjection
          )) restoreOperations.push(ports.restoreTargetOutput(existing));
          if (context.target === "obs") restoreOperations.push(previousObsSnapshot
            ? Promise.all([
              ports.persistObsSnapshot?.(previousObsSnapshot) ?? persistObsThemeSnapshot(previousObsSnapshot),
              ports.emitObsSnapshot?.(previousObsSnapshot) ?? emitObsThemeSnapshot(previousObsSnapshot),
            ])
            : ports.removeObsSnapshot?.(context.targetId) ?? removeNativeObsThemeSnapshot(context.targetId));
          const previousWindowIdentity = snapshot
            ? { themeId: snapshot.document.themeId, revision: snapshot.document.revision }
            : existing
              ? { themeId: existing.themeId, revision: existing.revision }
              : undefined;
          if (context.target === "windows" && previousWindowProjection && previousWindowIdentity && ports.restoreWindowProjection) {
            restoreOperations.push(ports.restoreWindowProjection(previousWindowProjection, previousWindowIdentity));
          }
          const results = await Promise.allSettled(restoreOperations);
          const failures = results.filter(result => result.status === "rejected");
          if (failures.length) throw new ThemeOutputRollbackError(failures.map(result => result.reason));
        },
      });
      published.set(context.targetId, value);
      bindings.set(context.targetId, nextBinding);
      notifyCompatibleEventRenderChanged();
    },
    async remove(targetId: string, target: ThemeTarget) {
      const previous = published.get(targetId);
      const binding = (await registry.load()).find(
        (value) => value.targetId === targetId,
      );
      const previousObsSnapshot = target === "obs" ? await (ports.loadObsSnapshot?.(targetId) ?? loadObsThemeSnapshot(targetId)) : undefined;
      const restore = await commitThemeRemoval({
        removeSnapshot: () => ports.remove(targetId), removeBinding: () => registry.remove(targetId),
        removeOutput: async () => { if (target === "obs") await (ports.removeObsSnapshot?.(targetId) ?? removeNativeObsThemeSnapshot(targetId)); await ports.publish({ type: "remove", targetId }); },
        restoreSnapshot: async () => { if (previous) await ports.save(previous); }, restoreBinding: async () => { if (binding) await registry.bind(binding); },
        restoreOutput: async () => {
          if (!previous) return;
          await ports.publish(previous);
          if (previous.context.target === "obs" && previousObsSnapshot) { await (ports.persistObsSnapshot?.(previousObsSnapshot) ?? persistObsThemeSnapshot(previousObsSnapshot)); await (ports.emitObsSnapshot?.(previousObsSnapshot) ?? emitObsThemeSnapshot(previousObsSnapshot)); }
          else if (previous.context.target === "windows") await ports.publishWindowProjection?.({ targetId, themeId: previous.document.themeId, revision: previous.document.revision, projection: projectionFor(previous.document, previous.context) });
        },
      });
      published.delete(targetId); bindings.delete(targetId);
      notifyCompatibleEventRenderChanged();
      return async () => {
        await restore();
        if (previous) published.set(targetId, previous);
        if (binding) bindings.set(targetId, binding);
        notifyCompatibleEventRenderChanged();
      };
    },
    async updateScale(
      targetId: string,
      _target: ThemeTarget,
      displayScale: number,
      applyProjection?: (projection: NativeThemeProjection) => void,
    ) {
      await registry.setDisplayScale(targetId, displayScale);
      const current = published.get(targetId);
      if (current) {
        const value = {
          ...current,
          context: { ...current.context, displayScale },
        };
        await ports.save(value);
        published.set(targetId, value);
        await ports.publish(value);
        if (value.context.target === "obs") {
          const snapshot = buildLaplaceObsSnapshot(value.document, value.context, useGeneralSettings.getState().stickyEvents);
          await persistObsThemeSnapshot(snapshot);
          await emitObsThemeSnapshot(snapshot);
        } else if (value.context.target === "windows") {
          await ports.publishWindowProjection?.({
            targetId: value.context.targetId,
            themeId: value.document.themeId,
            revision: value.document.revision,
            projection: projectionFor(value.document, value.context),
          });
        } else applyProjection?.(projectionFor(value.document, value.context));
      }
      const binding = bindings.get(targetId);
      if (binding) bindings.set(targetId, { ...binding, displayScale });
      notifyCompatibleEventRenderChanged();
    },
    resolve(context: CompatibleEventSurfaceContext) {
      const current = published.get(context.targetId);
      const binding = bindings.get(context.targetId);
      if (
        !current ||
        !binding ||
        current.document.mode !== "laplace" ||
        binding.themeId !== current.document.themeId ||
        binding.revision !== current.document.revision ||
        binding.targetKind !== context.target
      )
        return undefined;
      return resolvePublishedLaplaceRender(current, context);
    },
    snapshot(targetId: string): Published | undefined {
      const value = published.get(targetId);
      return value ? structuredClone(value) : undefined;
    },
  };
  return api;
}
export const laplaceThemeRuntime = createLaplaceThemeRuntime();

export function resolvePublishedLaplaceRender(current: PublishedLaplaceTarget, context: CompatibleEventSurfaceContext) {
      const roomMatches = !current.context.roomId || context.roomId == null || Number(current.context.roomId) === context.roomId;
      const settings = { ...settingsOf(current.document), eventVisibility: resolveThemeEventVisibility(normalizeCompatibleEventVisibility("laplace", current.document.settings.eventVisibility), context.target) };
      const mode = context.target === "live" ? "dashboard" : "obs";
      const render = (() => null) as unknown as CompatibleEventRenderWithRoot & {
        laplaceMode: "dashboard" | "obs";
      };
      render.laplaceMode = mode;
      const projections = new WeakMap<DanmakuEvent, ReturnType<typeof projectLaplaceEvent>>();
      const projectEvent = (event: DanmakuEvent) => {
        if (projections.has(event)) return projections.get(event)!;
        const projected = projectLaplaceEvent(event, { roomId: context.roomId ?? event.roomId, generation: 0 }, 1, event.ts);
        projections.set(event, projected);
        return projected;
      };
      render.eventDecision = memoizeCompatibleEventDecision((event: DanmakuEvent) => {
        const source = event.laplace;
        const sourceType = source?.event?.type;
        const eventRoomMatches = context.roomId == null || event.roomId === context.roomId;
        if (
          !roomMatches ||
          !eventRoomMatches ||
          event.msgType === MsgType.ScDeleted ||
          event.isComboUpdate ||
          source?.sourceCommand === "COMBO_SEND" ||
          source?.deleteIds != null ||
          (source != null && !source.event && !source.deleteIds) ||
          sourceType === "notice" ||
          sourceType === "mvp" ||
          sourceType === "superchat-delete"
        ) return "omit";
        if (!(isCompatibleThemeEventVisible("laplace", settings.eventVisibility, event) && (!source?.event || isLaplaceThemeSampleVisible(settings.eventVisibility, source.event)))) return "omit";
        if (projectEvent(event)) return "render";
        return context.target === "obs" ? "omit" : "fallback";
      });
      render.listSurface = {
        maskUsername: context.target !== "live" && settings.maskUsername,
        renderer: "laplace",
        url: "/laplace/product/index.html",
        protocol: "bb-laplace",
        title: "LAPLACE 事件列表",
        css: composeLaplaceThemeCss(current.document),
        cssSources: composeLaplaceRendererCssSources(current.document),
        productElements: { classicScope: settings.classicElementScope },
        config: {
          ...DEFAULT_LAPLACE_SETTINGS,
          ...settings,
          ...laplaceThemeVisibilitySettings(settings.eventVisibility),
          showGiftStickyAbove: 29.99,
          maskUsername: context.target !== "live" && settings.maskUsername,
        },
        eventDecision: render.eventDecision,
        project(event: DanmakuEvent, sequence: number) {
          if (render.eventDecision?.(event) === "omit") return null;
          const projected = projectEvent(event);
          if (!projected) return null;
          const sourceEvent = context.target !== "live" && settings.maskUsername ? maskLaplaceProductEvent(projected.event) : projected.event;
          return { ...sourceEvent, id: stableCompatibleEventId(event), originIdx: sequence };
        },
      };
      render.rootProps = { rendererMode: "laplace-product", showTimestamp: context.target !== "live" && settings.showTimestamp, placement: context.placement };
      return render;
}
