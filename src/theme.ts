/**
 * 主题状态：配色主题（樱花粉默认 / 青瓷绿 / 自定义）× 深浅色（默认跟随系统）
 *
 * 写入 <html data-theme="..."> 与 .dark class；localStorage 持久化。
 * 设置入口位于右侧工作台；Sidebar 同时保留配色与深浅模式快捷切换。
 */
import { create } from "zustand";
import { useGeneralSettings } from "./generalSettings.ts";
import { persist } from "zustand/middleware";
import { isEventWindowKind } from './windows/eventWindowChannels';
import { applyCustomPalette, DEFAULT_CUSTOM_COLOR, normalizeCustomColor } from './customPalette.ts';

export type Palette = "pine" | "sakura" | "custom";
export const PALETTE_OPTIONS = [{ value: "sakura" as const, label: "樱花粉" }, { value: "pine" as const, label: "青瓷绿" }, { value: "custom" as const, label: "自定义" }];
export type Mode = "system" | "light" | "dark";

interface ThemeState {
  palette: Palette;
  mode: Mode;
  customColor: string;
  setCustomColor: (color: string) => void;
  setPalette: (p: Palette) => void;
  cyclePalette: () => void;
  setMode: (m: Mode) => void;
}

export const useTheme = create<ThemeState>()(
  persist(
    (set, get) => ({
      palette: "sakura",
      customColor: DEFAULT_CUSTOM_COLOR,
      setCustomColor: color => set({ customColor: normalizeCustomColor(color) }),
      mode: "system",
      setPalette: (palette) => set({ palette }),
      cyclePalette: () => set({ palette: PALETTE_OPTIONS[(PALETTE_OPTIONS.findIndex(p=>p.value===get().palette)+1)%PALETTE_OPTIONS.length].value }),
      setMode: (mode) => set({ mode }),
    }),
    { name: "danmu-theme" },
  ),
);

function applyTheme() {
  const { palette, mode, customColor } = useTheme.getState();
  const dark =
    mode === "dark" ||
    (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.softwareScheme = dark ? 'dark' : 'light';
  const output = document.documentElement.dataset.window;
  const override = output && isEventWindowKind(output) ? useGeneralSettings.getState().windowScheme : "follow";
  applyThemeToDocument(palette, override === "follow" ? dark ? "dark" : "light" : override, customColor);
}

/** App 挂载时调用一次：立即应用 + 订阅变更 + 跟随系统深浅色变化 */
export function initTheme(): void {
  applyTheme();
  useTheme.subscribe(applyTheme);
  useGeneralSettings.subscribe((state, previous)=>{if(state.windowScheme!==previous.windowScheme)applyTheme();});
  window.addEventListener("storage", (event) => {
    if (event.key === useGeneralSettings.persist.getOptions().name) void Promise.resolve(useGeneralSettings.persist.rehydrate()).then(applyTheme);
    if (event.key === useTheme.persist.getOptions().name) void useTheme.persist.rehydrate();
  });
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", applyTheme);
}

/** 软件窗口和浏览器输出共用的文档主题入口。 */
export function applyThemeToDocument(palette: Palette, scheme: "light" | "dark", customColor = useTheme.getState().customColor): void {
  applyCustomPalette(document, customColor);
  document.documentElement.dataset.theme = palette;
  document.documentElement.classList.toggle("dark", scheme === "dark");
  document.documentElement.classList.toggle("light", scheme === "light");
}
