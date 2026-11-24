import { themePriceGradient } from './nativePriceGradient.ts';
import { builtinDetails, createBuiltinCompatibleTheme } from './builtinThemeDefaults.ts';
import type { NativeThemeProjection } from "./nativeThemeProjection.ts";
import {
  applyNativeThemeTarget,
  detachPublishedNativeThemeTarget,
  publishNativeThemeTarget,
  updatePublishedNativeThemeScale,
} from "./nativeThemeRuntime.ts";
import { buildNativeThemeCssExport, type NativeThemeCssExportScope } from "./themeCssExport.ts";
import { createBuiltinNativeTheme, createBuiltinNativeThemes } from "./nativeBuiltinThemes.ts";
import { createCatalogThemes } from "./builtinThemeCatalog.ts";
import { renderManagedNativeCss } from "./nativeManagedCss.ts";
import type { NativeThemeSettings } from "./nativeComponentAppearance.ts";
import { themeBindingRegistry, type ThemeBinding, type ThemeBindingRegistry } from "./themeBindings.ts";
import { type CompatibleThemeMode, type CompatibleVisualSettings } from "./compatThemeSettings.ts";
import { getCompatibleThemeCapability } from "./compatThemeCapabilities.ts";
import { materializeCompatibleVisualCss } from "./compatManagedCss.ts";
import { type ThemeDocument, type ThemeMode, type ThemeSummary, type ThemeTarget } from "./themeTypes.ts";
import { canApplyThemeMode } from "./themeModes.ts";
import { blivechatThemeRenderer } from "../compat/blivechat/adapterRuntime.ts";
import { composeBlivechatThemeCss } from "../compat/blivechat/css.ts";
import { openLiveThemeRenderer } from "../compat/openlive/adapterRuntime.ts";
import { composeOpenLiveThemeCss } from "../compat/openlive/css.ts";
import { composeRegisteredLaplaceThemeCss, laplaceThemeRenderer } from "../compat/laplace/adapterRuntime.ts";

export const COMPATIBLE_THEME_MODES: CompatibleThemeMode[] = ["blivechat", "blivechat-open", "laplace"];

export interface ThemeRenderContext {
  target: ThemeTarget;
  targetId: string;
  roomId: string;
  displayScale: number;
}

export interface ThemeModeOperationResult {
  rendered: boolean;
  message?: string;
}

export interface ThemeModeAdapter {
  mode: ThemeMode;
  rendererReady: boolean;
  editor: "native" | "placeholder";
  thumbnail: "native" | "placeholder";
  createBuiltinTheme(): ThemeDocument;
  createRenderContext(binding: ThemeBinding, roomId?: string): ThemeRenderContext;
  initializeVisualCss(document: ThemeDocument): string;
  exportCss(document: ThemeDocument, scope: NativeThemeCssExportScope): string;
  applyTarget(document: ThemeDocument, target: ThemeTarget, applyProjection?: (projection: NativeThemeProjection) => void): Promise<ThemeModeOperationResult>;
  publishTarget(document: ThemeDocument, context: ThemeRenderContext, applyProjection?: (projection: NativeThemeProjection) => void): Promise<ThemeModeOperationResult>;
  removeTarget(targetId: string, target: ThemeTarget): Promise<() => Promise<void>>;
  updateScale(targetId: string, target: ThemeTarget, displayScale: number, applyProjection?: (projection: NativeThemeProjection) => void): Promise<void>;
}

function createRenderContext(binding: ThemeBinding, roomId = ""): ThemeRenderContext {
  return {
    target: binding.targetKind,
    targetId: binding.targetId,
    roomId,
    displayScale: binding.displayScale ?? 1,
  };
}

function buildCompatibleCssExport(document: ThemeDocument, scope: NativeThemeCssExportScope): string {
  if (document.mode === "blivechat-open") {
    if (scope === "custom") return document.styles.customCss;
    if (scope === "visual") return materializeCompatibleVisualCss(document as ThemeDocument & { settings: CompatibleVisualSettings }, getCompatibleThemeCapability("blivechat-open")!);
    const target = scope === "base-visual" ? { ...document, styles: { ...document.styles, customCss: "" } } : document;
    return composeOpenLiveThemeCss(target);
  }
  if (document.mode === "laplace") {
    if (scope === "custom") return document.styles.customCss;
    if (scope === "visual") return materializeCompatibleVisualCss(document as ThemeDocument & { settings: CompatibleVisualSettings }, getCompatibleThemeCapability("laplace")!);
    const target = scope === "base-visual" ? { ...document, styles: { ...document.styles, customCss: "" } } : document;
    return composeRegisteredLaplaceThemeCss(target);
  }
  const capability = getCompatibleThemeCapability(document.mode as CompatibleThemeMode);
  const visualCss = capability ? materializeCompatibleVisualCss(document as ThemeDocument & { settings: CompatibleVisualSettings }, capability) : document.styles.visualCss;
  const layer = (name: string, css: string) => `/* ${name} */${css.trim() ? `\n${css.trim()}` : ""}`;
  if (scope === "custom") return document.styles.customCss;
  if (scope === "visual") return layer("可视化层", visualCss);
  const target = scope === "base-visual" ? { ...document, styles: { ...document.styles, customCss: "" } } : document;
  return composeBlivechatThemeCss(target);
}

export interface CompatibleThemeRenderer {
  publish(document: ThemeDocument, context: ThemeRenderContext, applyProjection?: (projection: NativeThemeProjection) => void): Promise<void>;
  remove(targetId: string, target: ThemeTarget): Promise<() => Promise<void>>;
  updateScale(targetId: string, target: ThemeTarget, displayScale: number, applyProjection?: (projection: NativeThemeProjection) => void): Promise<void>;
}

export function createCompatibleThemeModeAdapter(mode: CompatibleThemeMode, options: {
  bindings?: ThemeBindingRegistry;
  renderer?: CompatibleThemeRenderer;
} = {}): ThemeModeAdapter {
  const bindings = options.bindings ?? themeBindingRegistry;
  const renderer = options.renderer;
  const pending = `${builtinDetails[mode].name.replace("默认", "")}当前可以编辑和保存；预览暂不可用，原有显示保持不变。`;
  const currentContext = async (requested: ThemeRenderContext): Promise<ThemeRenderContext> => {
    const existing = (await bindings.load()).find(item => item.targetId === requested.targetId);
    const context = createRenderContext(existing ?? {
      targetId: requested.targetId,
      targetKind: requested.target,
      themeId: "",
      revision: 0,
      displayScale: requested.displayScale,
    }, requested.roomId);
    return requested.target === "obs" ? { ...context, displayScale: requested.displayScale } : context;
  };
  const publish = async (document: ThemeDocument, requested: ThemeRenderContext, applyProjection?: (projection: NativeThemeProjection) => void): Promise<ThemeModeOperationResult> => {
    if (!renderer) return { rendered: false, message: pending };
    await renderer.publish(document, await currentContext(requested), applyProjection);
    return { rendered: true };
  };
  return {
    mode,
    rendererReady: renderer !== undefined,
    editor: "placeholder",
    thumbnail: "placeholder",
    createBuiltinTheme: () => createBuiltinCompatibleTheme(mode),
    createRenderContext,
    initializeVisualCss: document => {
      const capability = getCompatibleThemeCapability(mode);
      return capability ? materializeCompatibleVisualCss(document as ThemeDocument & { settings: CompatibleVisualSettings }, capability) : document.styles.visualCss;
    },
    exportCss: buildCompatibleCssExport,
    applyTarget: async (document, target, applyProjection) => publish(document, createRenderContext({ targetId: target, targetKind: target, themeId: document.themeId, revision: document.revision }), applyProjection),
    publishTarget: publish,
    removeTarget: renderer ? renderer.remove : async () => async () => undefined,
    updateScale: renderer ? renderer.updateScale : async () => undefined,
  };
}

const adapters: Record<ThemeMode, ThemeModeAdapter> = {
  native: {
    mode: "native",
    rendererReady: true,
    editor: "native",
    thumbnail: "native",
    createBuiltinTheme: () => createBuiltinNativeTheme("native-default"),
    createRenderContext,
    initializeVisualCss: document => [document.styles.visualCss, renderManagedNativeCss({ ...document.settings, priceGradient: themePriceGradient((document.settings as NativeThemeSettings).priceGradient, document.styles.baseCss) } as NativeThemeSettings)].filter(Boolean).join("\n\n"),
    exportCss: buildNativeThemeCssExport,
    async applyTarget(document, target, applyProjection) {
      await applyNativeThemeTarget(document, target, applyProjection ?? (() => undefined));
      return { rendered: true };
    },
    async publishTarget(document, context, applyProjection) {
      await publishNativeThemeTarget(document, context.targetId, context.target, applyProjection, context.roomId, undefined, context.displayScale);
      return { rendered: true };
    },
    removeTarget: detachPublishedNativeThemeTarget,
    updateScale: updatePublishedNativeThemeScale,
  },
  blivechat: createCompatibleThemeModeAdapter("blivechat", { renderer: blivechatThemeRenderer }),
  "blivechat-open": createCompatibleThemeModeAdapter("blivechat-open", { renderer: openLiveThemeRenderer }),
  laplace: createCompatibleThemeModeAdapter("laplace", { renderer: laplaceThemeRenderer }),
};

export function getThemeModeAdapter(mode: ThemeMode): ThemeModeAdapter {
  return adapters[mode];
}

export function resolveRegisteredBuiltinThemeId(themes: ReadonlyArray<ThemeSummary | ThemeDocument>, target: ThemeTarget): string | undefined {
  return themes.find(theme => theme.origin === "builtin" && canApplyThemeMode(theme.mode, target))?.themeId;
}

export async function resolvePublishedThemeMode(
  targetId: string,
  bindings: ReadonlyArray<ThemeBinding>,
  loadDocument: (themeId: string) => Promise<ThemeDocument>,
): Promise<ThemeMode> {
  const binding = bindings.find(item => item.targetId === targetId);
  if (!binding) return "native";
  try { return (await loadDocument(binding.themeId)).mode; }
  catch { return "native"; }
}

export function createBuiltinCompatibleThemes(): ThemeDocument[] {
  return [...COMPATIBLE_THEME_MODES.map(mode => getThemeModeAdapter(mode).createBuiltinTheme()), ...createCatalogThemes()];
}

export function createBuiltinThemes(): ThemeDocument[] {
  return [...createBuiltinNativeThemes(), ...createBuiltinCompatibleThemes()];
}
