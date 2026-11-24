import { createBuiltinNativeTheme } from "./nativeBuiltinThemes.ts";
import { createDefaultCompatibleThemeSettings } from "./compatThemeSettings.ts";
import type { ThemeDocument, ThemeMode } from "./themeTypes.ts";

export function createInitialThemeSettings(mode: ThemeMode): ThemeDocument["settings"] {
  return mode === "native"
    ? { ...createBuiltinNativeTheme("native-default").settings }
    : createDefaultCompatibleThemeSettings(mode);
}
