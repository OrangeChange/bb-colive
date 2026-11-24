import type { ThemeBinding } from "./themeBindings.ts";

export type WindowThemeMode = "unified" | "separate";
export const WINDOW_THEME_TARGETS = [
  { id: "windows:display", label: "弹幕窗" },
  { id: "windows:gift", label: "收益窗" },
  { id: "windows:gift-only", label: "礼物窗" },
  { id: "windows:superchat", label: "醒目留言窗" },
  { id: "windows:guard", label: "大航海窗" },
] as const;

export function windowThemeLabel(targetId: string): string {
  return WINDOW_THEME_TARGETS.find(target => target.id === targetId)?.label ?? "所有副窗口";
}

export function windowThemeTargets(mode: WindowThemeMode, revenueMode: "combined" | "split") {
  if (mode === "unified") return [{ id: "windows", label: "所有副窗口" }];
  return WINDOW_THEME_TARGETS.filter(target => target.id === "windows:display"
    || (revenueMode === "combined" ? target.id === "windows:gift"
      : ["windows:gift-only", "windows:superchat", "windows:guard"].includes(target.id)));
}

export function resolveWindowThemeTarget(mode: WindowThemeMode, kind: string, bindings: readonly ThemeBinding[]): string {
  const targetId = `windows:${kind}`;
  return mode === "separate" && bindings.some(binding => binding.targetId === targetId) ? targetId : "windows";
}
