import { localized, uiText } from "../i18n/index.ts";
import { THEME_MODE_VALUES, type ThemeMode, type ThemeTarget } from "./themeTypes.ts";

export const THEME_MODES = [...THEME_MODE_VALUES];

export interface ThemeModeDefinition {
  mode: ThemeMode;
  label: string;
  editable: boolean;
  targets: ThemeTarget[];
}

const definitions: Record<ThemeMode, ThemeModeDefinition> = localized(() => ({
  native: { mode: "native", label: uiText("themeModes.definitions.native.label"), editable: true, targets: ["live", "windows", "obs"] },
  blivechat: { mode: "blivechat", label: uiText("themeModes.definitions.blivechat.label"), editable: true, targets: ["live", "windows", "obs"] },
  "blivechat-open": { mode: "blivechat-open", label: uiText("themeModes.definitions.blivechatopen.label"), editable: true, targets: ["live", "windows", "obs"] },
  laplace: { mode: "laplace", label: "LAPLACE", editable: true, targets: ["live", "windows", "obs"] },
}));

export function getThemeModeDefinition(mode: ThemeMode): ThemeModeDefinition {
  return definitions[mode];
}

export function canApplyThemeMode(mode: ThemeMode, target: ThemeTarget): boolean {
  return definitions[mode].targets.includes(target as ThemeTarget);
}
