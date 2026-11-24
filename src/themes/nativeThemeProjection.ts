import { normalizeEventStyleSettings, type EventStyleSettings } from "../eventStyleSettings.ts";
import type { ThemeDocument } from "./themeTypes.ts";
import { composeNativeThemeCss } from "./nativeThemeCascade.ts";
import { normalizeNativeThemeDisplaySettings, normalizeNativeEventVisibility, type NativeThemeDisplaySettings, type NativeThemeSettings, type NativeVisualLayer, type NativeVisualScheme } from "./nativeComponentAppearance.ts";
import { projectNativeVisualModel } from "./nativeThemeDefaults.ts";
import { themePriceGradient } from './nativePriceGradient.ts';

export interface NativeThemeProjection {
  settings: EventStyleSettings;
  eventVisibility?: import("./nativeComponentAppearance.ts").NativeEventVisibility;
  display: NativeThemeDisplaySettings;
  scheme: NativeVisualScheme;
  visual: NativeVisualLayer;
  css: string;
  displayScale: number;
}

export interface NativeThemeProjectionOptions { scheme?: NativeVisualScheme }
export interface NativeThemeEditorSchemes { editingScheme: NativeVisualScheme; previewScheme: "system" | "light" | "dark" }

export function projectNativeTheme(document: ThemeDocument, options: NativeThemeProjectionOptions = {}): NativeThemeProjection {
  if (document.mode !== "native") throw new Error("该主题不是原生样式");
  const settings = { ...document.settings, ...normalizeEventStyleSettings(document.settings) };
  (settings as NativeThemeSettings).priceGradient = themePriceGradient((document.settings as NativeThemeSettings).priceGradient, document.styles.baseCss);
  const display = normalizeNativeThemeDisplaySettings((document.settings as { display?: unknown }).display);
  const scheme = options.scheme ?? "common";
  settings.rolePriority = [...display.identityPriority];
  return {
    settings,
    eventVisibility: normalizeNativeEventVisibility((document.settings as NativeThemeSettings).eventVisibility),
    display,
    scheme,
    visual: projectNativeVisualModel((document.settings as NativeThemeSettings).visualModel, scheme),
    css: composeNativeThemeCss(document),
    displayScale: 1,
  };
}
