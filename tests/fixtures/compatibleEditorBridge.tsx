import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { createCatalogThemes } from "../../src/themes/builtinThemeCatalog.ts";
import { createRoot } from "react-dom/client";
import { useMemo, useReducer, useState } from "react";
import { CompatibleThemeEditor } from "../../src/components/CompatibleThemeEditor.tsx";
import {
  CompatibleThemeThumbnail,
  getCompatibleThemeEditingSurface,
} from "../../src/components/CompatibleThemePreview.tsx";
import { createCompatibleThemeModeAdapter } from "../../src/themes/themeModeAdapters.ts";
import type { ThemeDocument, ThemeMode } from "../../src/themes/themeTypes.ts";
import type { CompatibleVisualSettings } from "../../src/themes/compatThemeSettings.ts";
import { createThemeSessionHost } from "../../src/themes/themeEditorSession.ts";
import { normalizeNativeVisualModel } from "../../src/themes/nativeComponentAppearance.ts";
import { patchCompatibleManagedCss } from "../../src/themes/compatManagedCss.ts";
import { reverseSyncCompatibleCss } from "../../src/themes/compatCssReverseSync.ts";
import "../../src/shadcn.css";
import "../../src/compat/blivechat/register.tsx";
import "../../src/compat/openlive/register.tsx";
import "../../src/compat/laplace/register.tsx";

mockWindows("main");
mockIPC(() => null);

const mode = (new URLSearchParams(location.search).get("mode") ||
  "blivechat") as ThemeMode;
const thumbnail = new URLSearchParams(location.search).get("thumbnail") === "1";
const requestedTheme = new URLSearchParams(location.search).get("theme");
const catalogTheme = createCatalogThemes().find(
  (theme) => theme.themeId === requestedTheme,
);
async function loadCatalogTheme(theme: ThemeDocument): Promise<ThemeDocument> {
  const manifests = import.meta.glob("/src-tauri/style/**/theme.json", {
    query: "?raw",
    import: "default",
    eager: true,
  });
  const entry = Object.entries(manifests).find(
    ([, raw]) => JSON.parse(raw as string).themeId === theme.themeId,
  );
  if (!entry) throw new Error("主题文件缺失");
  const directory = entry[0].slice(0, -"theme.json".length);
  const [settings, baseCss, visualCss, customCss] = await Promise.all(
    ["settings.json", "base.css", "visual.css", "custom.css"].map((name) =>
      fetch(directory + name).then((response) => {
        if (!response.ok) throw new Error(name);
        return response.text();
      }),
    ),
  );
  return {
    ...JSON.parse(entry[1] as string),
    permissions: theme.permissions,
    settings: JSON.parse(settings),
    styles: { baseCss, visualCss, customCss },
  };
}
const initial = {
  ...(catalogTheme
    ? await loadCatalogTheme(catalogTheme)
    : createCompatibleThemeModeAdapter(mode).createBuiltinTheme()),
  origin: "custom" as const,
};

function App() {
  const [previewTarget, setPreviewTarget] = useState<HTMLElement | null>(null);
  const surface = getCompatibleThemeEditingSurface(mode)!;
  const [, redraw] = useReducer((value) => value + 1, 0);
  const host = useMemo(
    () =>
      createThemeSessionHost({
        loadThemeDocument: async () => initial,
        saveThemeDocument: async () => {},
      }),
    [],
  );
  const session = useMemo(() => host.createNewThemeSession(initial), [host]);
  const document = session.document;
  const updateSettings = (settings: CompatibleVisualSettings) => {
    const previous = session.document.settings as CompatibleVisualSettings;
    const css = patchCompatibleManagedCss(
      session.visualCssValid,
      surface.capability,
      normalizeNativeVisualModel(previous.visualModel),
      normalizeNativeVisualModel(settings.visualModel),
    );
    host.updateThemeDraft(session, (current) => ({ ...current, settings }));
    host.updateThemeVisualCssFromControls(session, css);
    redraw();
  };
  const updateVisualCss = (visualCss: string) => {
    const result = host.updateThemeVisualCssDraft(
      session,
      visualCss,
      (current) => {
        const settings = current.settings as CompatibleVisualSettings;
        const reversed = reverseSyncCompatibleCss(
          visualCss,
          surface.capability,
          settings.visualModel ?? {},
          settings.visualAuthored,
        );
        if (reversed.error) return { error: reversed.error };
        return {
          document: {
            ...current,
            settings: {
              ...settings,
              visualModel: reversed.model,
              visualAuthored: reversed.authored,
            },
            styles: { ...current.styles, visualCss: reversed.unmanagedCss },
          },
          diagnostics: reversed.diagnostics,
        };
      },
    );
    redraw();
    return (
      result.error ??
      (result.diagnostics?.length
        ? `提示：${result.diagnostics.join("；")}`
        : "")
    );
  };
  const updateCustomCss = (css: string) => {
    host.updateThemeCustomCssDraft(session, css, () => null);
    redraw();
  };
  if (thumbnail)
    return (
      <div style={{ width: 420, height: 160 }}>
        <CompatibleThemeThumbnail
          mode={mode}
          themeId={document.themeId}
          revision={document.revision}
          load={async () => document}
        />
      </div>
    );
  return (
    <>
      <output data-testid="qa-state" hidden>
        {JSON.stringify({
          model: (document.settings as CompatibleVisualSettings).visualModel,
          authored: (document.settings as CompatibleVisualSettings)
            .visualAuthored,
          visualCss: session.visualCssDraft,
          customCss: session.customCssDraft,
          css: surface.composeCss?.(document) ?? "",
        })}
      </output>
      <div data-testid="qa-actions">
        <button
          type="button"
          onClick={() =>
            updateVisualCss(
              session.visualCssDraft.replace(
                /font-size:\s*24px/,
                "font-size: calc(12px + 1vw)",
              ),
            )
          }
        >
          写入手写可视化 CSS
        </button>
        <button
          type="button"
          onClick={() =>
            updateCustomCss("#author-name { font-size: 33px !important; }")
          }
        >
          写入自定义 CSS
        </button>
        <button type="button" onClick={() => updateCustomCss("")}>
          清空自定义 CSS
        </button>
      </div>
      <div
        style={{ display: "flex", height: "calc(100vh - 36px)", minHeight: 0 }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <CompatibleThemeEditor
            previewTarget={previewTarget}
            document={document}
            previewDocument={document}
            capability={surface.capability}
            renderer={surface.renderer}
            composeCss={surface.composeCss}
            visualCss={session.visualCssDraft}
            customCss={session.customCssDraft}
            cssMessage={session.visualCssError}
            fontFamilyOptions={["MiSans", "Arial"]}
            basicControls={surface.renderBasicControls?.({
              document,
              onSettingsChange: updateSettings,
            })}
            onSettingsChange={updateSettings}
            onCustomCssChange={updateCustomCss}
            onVisualCssChange={updateVisualCss}
            onExportCss={() => {}}
            onAddAsset={() => {}}
            onRemoveAsset={() => {}}
            onBack={() => {}}
            onSave={() => {}}
            onEditMetadata={() => {}}
            onApply={() => {}}
          />
        </div>
        <aside
          ref={setPreviewTarget}
          style={{ width: 420, minWidth: 420, height: "100%" }}
        />
      </div>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
