import { useEffect, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { load } from "../appData.ts";
import { loadThemeBindings, THEME_BINDINGS_EVENT, type ThemeBinding } from "./themeBindings.ts";

import type { WindowThemeMode } from "./windowThemeTargets.ts";
export { resolveWindowThemeTarget } from "./windowThemeTargets.ts";
export const WINDOW_THEME_MODE_EVENT = "window-theme-mode-changed";

export async function saveWindowThemeMode(mode: WindowThemeMode): Promise<void> {
  const store = await load("native-theme-bindings.local.json", { autoSave: false, defaults: {} });
  await store.set("windowThemeMode", mode);
  await store.save();
  await emit(WINDOW_THEME_MODE_EVENT, mode);
}

export function useWindowThemeSettings() {
  const [mode, setMode] = useState<WindowThemeMode>("unified");
  const [bindings, setBindings] = useState<ThemeBinding[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let disposed = false;
    let modeChanged = false;
    let bindingsChanged = false;
    const stops: Array<() => void> = [];
    const setup = async () => {
      const stopMode = await listen<WindowThemeMode>(WINDOW_THEME_MODE_EVENT, event => {
        modeChanged = true; if (!disposed) setMode(event.payload);
      });
      const stopBindings = await listen<ThemeBinding[]>(THEME_BINDINGS_EVENT, event => {
        bindingsChanged = true; if (!disposed) setBindings(event.payload);
      });
      if (disposed) { stopMode(); stopBindings(); return; }
      stops.push(stopMode, stopBindings);
      const store = await load("native-theme-bindings.local.json", { autoSave: false, defaults: {} });
      const [savedMode, savedBindings] = await Promise.all([store.get<WindowThemeMode>("windowThemeMode"), loadThemeBindings()]);
      if (disposed) return;
      if (!modeChanged) setMode(savedMode === "separate" ? "separate" : "unified");
      if (!bindingsChanged) setBindings(savedBindings);
      setReady(true);
    };
    void setup();
    return () => { disposed = true; stops.forEach(stop => stop()); };
  }, []);
  return { mode, bindings, ready };
}
