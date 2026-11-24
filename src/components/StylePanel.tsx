import { useCallback, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useGeneralSettings } from "../generalSettings.ts";
import { DEFAULT_EVENT_FONT_FAMILY } from "../eventStyleSettings.ts";
import type { NativeThemeProjection } from "../themes/nativeThemeProjection.ts";
import { setLiveNativeThemeProjection } from "../themes/nativeThemeRuntimeState.ts";
import { ThemeWorkspace } from "./ThemeWorkspace.tsx";
import { ConnectBar } from "./ConnectBar.tsx";
import type { NativePreviewGeometry } from "./nativePreviewGeometry.ts";

export function StylePanel({ active, previewTarget, previewHeaderTarget, previewGeometry, onEditingChange, onPreviewTitleChange }: {
  active: boolean;
  previewTarget: HTMLElement | null;
  previewHeaderTarget: HTMLElement | null;
  previewGeometry: NativePreviewGeometry | null;
  onEditingChange: (editing: boolean) => void;
  onPreviewTitleChange: (title: string) => void;
}) {
  const eventDisplayPreferences = useGeneralSettings((state) => state.eventDisplayPreferences);
  const eventStyleSettings = useGeneralSettings((state) => state.eventStyleSettings);
  const [installedFontFamilies, setInstalledFontFamilies] = useState<string[]>([]);
  const fontLoadPromiseRef = useRef<Promise<void> | null>(null);
  const ensureInstalledFonts = useCallback(() => {
    if (fontLoadPromiseRef.current) return;
    const request = invoke<string[]>("list_installed_fonts")
      .then(fonts => setInstalledFontFamilies(Array.from(new Set(fonts.filter(font => font.trim().length > 0)))))
      .catch(() => { fontLoadPromiseRef.current = null; });
    fontLoadPromiseRef.current = request;
  }, []);
  const fontFamilyOptions = useMemo(() => Array.from(new Set([
    DEFAULT_EVENT_FONT_FAMILY, eventStyleSettings.fontFamily, ...installedFontFamilies,
  ])).sort((left, right) => left.localeCompare(right, "zh-CN", { sensitivity: "base" })), [eventStyleSettings.fontFamily, installedFontFamilies]);

  const applyThemeProjection = (projection: NativeThemeProjection) => setLiveNativeThemeProjection(projection);

  return <div className="flex h-full min-h-0 flex-col">
    <ConnectBar />
    <div className="min-h-0 flex-1"><ThemeWorkspace
      active={active}
      previewTarget={previewTarget}
      previewHeaderTarget={previewHeaderTarget}
      previewGeometry={previewGeometry}
      onEditingChange={onEditingChange}
      onPreviewTitleChange={onPreviewTitleChange}
      applyThemeProjection={applyThemeProjection}
      displayPreferences={eventDisplayPreferences}
      fontFamilyOptions={fontFamilyOptions}
      onOpenFonts={ensureInstalledFonts}
    /></div>
  </div>;
}
