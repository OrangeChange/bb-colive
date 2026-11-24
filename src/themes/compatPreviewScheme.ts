import type { ThemeDocument } from "./themeTypes.ts";
import { useGeneralSettings } from "../generalSettings.ts";
import { isEventWindowKind } from "../windows/eventWindowChannels.ts";
import { useTheme } from "../theme.ts";
import { createContext, useContext, useEffect, useState } from "react";

export const CompatibleOutputSchemeContext = createContext<"light" | "dark" | undefined>(undefined);

export function useCompatibleOutputScheme(): "light" | "dark" {
  const explicitScheme = useContext(CompatibleOutputSchemeContext);
  const mode = useTheme(state => state.mode);
  const windowScheme = useGeneralSettings(state => state.windowScheme);
  const [systemDark, setSystemDark] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    if (explicitScheme) return;
    const syncMode = (event: StorageEvent) => {
      if (event.key === useTheme.persist.getOptions().name) void useTheme.persist.rehydrate();
    };
    void useTheme.persist.rehydrate();
    window.addEventListener("storage", syncMode);
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(query.matches);
    update(); query.addEventListener("change", update);
    return () => { query.removeEventListener("change", update); window.removeEventListener("storage", syncMode); };
  }, [explicitScheme]);
  const output = typeof document === "undefined" ? undefined : document.documentElement.dataset.window;
  const contentScheme = output && isEventWindowKind(output) && windowScheme !== "follow" ? windowScheme : undefined;
  return explicitScheme ?? contentScheme ?? (mode === "system" ? systemDark ? "dark" : "light" : mode);
}

export function resolveCompatiblePreviewScheme(_document: Pick<ThemeDocument, "settings">, requested: "system" | "light" | "dark"): "light" | "dark" {
  if (requested !== "system") return requested;
  const applicationMode = useTheme.getState().mode;
  if (applicationMode === "light" || applicationMode === "dark") return applicationMode;
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) return "dark";
  return "light";
}
