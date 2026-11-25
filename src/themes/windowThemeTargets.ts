import { localized, uiText } from "../i18n/index.ts";
import type { ThemeBinding } from "./themeBindings.ts";

export type WindowThemeMode = "unified" | "separate";
export const WINDOW_THEME_TARGETS = localized(() => ([
  { id: "windows:display", label: uiText("common.chatWindow") },
  { id: "windows:gift", label: uiText("common.revenueWindow") },
  { id: "windows:gift-only", label: uiText("windowThemeTargets.WINDOW_THEME_TARGETS.label") },
  { id: "windows:superchat", label: uiText("windowThemeTargets.WINDOW_THEME_TARGETS.label2") },
  { id: "windows:guard", label: uiText("windowThemeTargets.WINDOW_THEME_TARGETS.label3") },
] as const));

export function windowThemeLabel(targetId: string): string {
  return WINDOW_THEME_TARGETS.find(target => target.id === targetId)?.label ?? uiText("windowThemeTargets.windowThemeLabel");
}

export function windowThemeTargets(mode: WindowThemeMode, revenueMode: "combined" | "split") {
  if (mode === "unified") return [{ id: "windows", label: uiText("windowThemeTargets.windowThemeTargets.label") }];
  return WINDOW_THEME_TARGETS.filter(target => target.id === "windows:display"
    || (revenueMode === "combined" ? target.id === "windows:gift"
      : ["windows:gift-only", "windows:superchat", "windows:guard"].includes(target.id)));
}

export function resolveWindowThemeTarget(mode: WindowThemeMode, kind: string, bindings: readonly ThemeBinding[]): string {
  const targetId = `windows:${kind}`;
  return mode === "separate" && bindings.some(binding => binding.targetId === targetId) ? targetId : "windows";
}
