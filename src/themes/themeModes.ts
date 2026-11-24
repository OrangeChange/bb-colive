import { THEME_MODE_VALUES, type ThemeMode, type ThemeTarget } from "./themeTypes.ts";

export const THEME_MODES = [...THEME_MODE_VALUES];

export interface ThemeModeDefinition {
  mode: ThemeMode;
  label: string;
  editable: boolean;
  targets: ThemeTarget[];
}

const definitions: Record<ThemeMode, ThemeModeDefinition> = {
  native: { mode: "native", label: "原生样式", editable: true, targets: ["live", "windows", "obs"] },
  blivechat: { mode: "blivechat", label: "BLC 原版", editable: true, targets: ["live", "windows", "obs"] },
  "blivechat-open": { mode: "blivechat-open", label: "BLC 开放版", editable: true, targets: ["live", "windows", "obs"] },
  laplace: { mode: "laplace", label: "LAPLACE", editable: true, targets: ["live", "windows", "obs"] },
};

export function getThemeModeDefinition(mode: ThemeMode): ThemeModeDefinition {
  return definitions[mode];
}

export function canApplyThemeMode(mode: ThemeMode, target: ThemeTarget): boolean {
  return definitions[mode].targets.includes(target as ThemeTarget);
}
