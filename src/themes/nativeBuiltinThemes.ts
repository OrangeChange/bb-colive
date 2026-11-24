import { createDefaultEventStyleSettings } from "../eventStyleSettings.ts";
import { permissionsForOrigin, type ThemeDocument } from "./themeTypes.ts";
import { createDefaultNativeComponentAppearance, createDefaultNativeEventVisibility, createDefaultNativeThemeDisplaySettings, createDefaultNativeVisualModel, type NativeThemeSettings } from "./nativeComponentAppearance.ts";
import { NATIVE_CARD_THEME_CSS } from "./nativeCardThemeSource.generated.ts";
import { NATIVE_BUBBLE_THEME_CSS } from "./nativeBubbleThemeSource.generated.ts";

const NATIVE_DEFAULT_ID = "native-default";

export function createBuiltinNativeTheme(themeId: string): ThemeDocument<NativeThemeSettings> {
  if (themeId !== NATIVE_DEFAULT_ID && themeId !== "native-card" && themeId !== "native-bubble") throw new Error(`未知的内置原生主题：${themeId}`);
  const card = themeId === "native-card";
  const bubble = themeId === "native-bubble";
  return {
    themeId,
    mode: "native",
    origin: "builtin",
    metadata: {
      name: card ? "浅映卡片" : bubble ? "轻语气泡" : "原生默认",
      author: "橙橙子君",
      version: "1.1.0",
      updatedAt: card || bubble ? "2026-11-22" : "2026-11-16",
    },
    permissions: permissionsForOrigin("builtin"),
    settings: { ...createDefaultEventStyleSettings(), avatarSize: card ? 32 : 24, display: createDefaultNativeThemeDisplaySettings(), componentAppearance: createDefaultNativeComponentAppearance(), eventVisibility: createDefaultNativeEventVisibility(), visualModel: createDefaultNativeVisualModel() },
    styles: { baseCss: card ? NATIVE_CARD_THEME_CSS : bubble ? NATIVE_BUBBLE_THEME_CSS : "", visualCss: "", customCss: "" },
    assets: [],
    revision: 1,
  };
}

export function createBuiltinNativeThemes(): ThemeDocument<NativeThemeSettings>[] {
  return [createBuiltinNativeTheme(NATIVE_DEFAULT_ID),createBuiltinNativeTheme("native-card"),createBuiltinNativeTheme("native-bubble")];
}
