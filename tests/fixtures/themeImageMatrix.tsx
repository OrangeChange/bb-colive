import { useState } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { NativeThemeEditor } from "../../src/components/NativeThemeEditor.tsx";
import { CompatibleThemeEditor } from "../../src/components/CompatibleThemeEditor.tsx";
import { getCompatibleThemeEditingSurface } from "../../src/components/CompatibleThemePreview.tsx";
import { ThemeImageAssetsContext } from "../../src/components/ThemeImageAssets.tsx";
import { createBuiltinNativeTheme } from "../../src/themes/nativeBuiltinThemes.ts";
import { createCompatibleThemeModeAdapter } from "../../src/themes/themeModeAdapters.ts";
import { DEFAULT_EVENT_DISPLAY_PREFERENCES } from "../../src/eventDisplaySettings.ts";
import type { ThemeDocument, ThemeMode } from "../../src/themes/themeTypes.ts";
import "../../src/App.css";
import "../../src/compat/blivechat/register.tsx";
import "../../src/compat/openlive/register.tsx";
import "../../src/compat/laplace/register.tsx";

mockWindows("main");
mockIPC(() => null);
const params = new URLSearchParams(location.search);
const mode = (params.get("mode") ?? "native") as ThemeMode;
const source =
  mode === "native"
    ? createBuiltinNativeTheme(params.get("theme") ?? "native-default")
    : createCompatibleThemeModeAdapter(mode).createBuiltinTheme();
const image =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect x="2" y="2" width="76" height="36" rx="8" fill="none" stroke="teal" stroke-width="4"/></svg>',
  );
const initial = {
  ...source,
  origin: "custom",
  assets: [
    {
      id: "sample",
      name: "示例图片",
      path: "assets/example.svg",
      mediaType: "image/svg+xml",
    },
  ],
} as ThemeDocument;
const urls = new Map([["assets/example.svg", image]]);
function Fixture() {
  const [document, setDocument] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [previewTarget, setPreviewTarget] = useState<HTMLElement | null>(null);
  (window as any).nativeVisualAcceptance = {
    getDocument: () => document,
    setSettings: (settings: ThemeDocument["settings"]) => setDocument(current => ({ ...current, settings })),
  };
  const callbacks = {
    document,
    previewDocument: document,
    visualCss: document.styles.visualCss,
    customCss: document.styles.customCss,
    dirty: document !== saved,
    cssMessage: "",
    fontFamilyOptions: ["MiSans", "Arial"],
    onOpenFonts: () => {},
    onBack: () => {},
    onEditMetadata: () => {},
    onApply: () => setSaved(structuredClone(document)),
    onSave: () => setSaved(structuredClone(document)),
    onExportCss: () => {},
    onAddAsset: () => {},
    onRemoveAsset: () => {},
    onReplaceAsset: () => {},
    assetPreviewUrls: urls,
    onSettingsChange: (settings: ThemeDocument["settings"]) =>
      setDocument((current) => ({ ...current, settings })),
    onCustomCssChange: (css: string) =>
      setDocument((current) => ({
        ...current,
        styles: { ...current.styles, customCss: css },
      })),
    onVisualCssChange: (css: string) => {
      setDocument((current) => ({
        ...current,
        styles: { ...current.styles, visualCss: css },
      }));
      return "";
    },
    previewTarget,
  };
  const surface =
    mode === "native" ? undefined : getCompatibleThemeEditingSurface(mode)!;
  return (
    <ThemeImageAssetsContext.Provider
      value={{
        images: [{ path: "assets/example.svg", name: "示例图片", url: image }],
        add: async () => {},
      }}
    >
      <button onClick={() => setDocument(structuredClone(saved))}>
        重新载入已保存主题
      </button>
      <output data-testid="image-state" hidden>
        {JSON.stringify(document.settings)}
      </output>
      <div style={{ display: "flex", height: "calc(100vh - 36px)" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {mode === "native" ? (
            <NativeThemeEditor
              {...callbacks}
              onSettingsChange={callbacks.onSettingsChange}
              visualCssControlled={[]}
              previewHeaderTarget={null}
              previewGeometry={null}
              displayPreferences={DEFAULT_EVENT_DISPLAY_PREFERENCES}
            />
          ) : (
            <CompatibleThemeEditor
              {...callbacks}
              capability={surface!.capability}
              renderer={surface!.renderer}
              composeCss={surface!.composeCss}
              basicControls={surface!.renderBasicControls?.({
                document,
                onSettingsChange: callbacks.onSettingsChange,
              })}
            />
          )}
        </div>
        <aside
          ref={setPreviewTarget}
          style={{ width: 420, minWidth: 420, height: "100%" }}
        />
      </div>
    </ThemeImageAssetsContext.Provider>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
