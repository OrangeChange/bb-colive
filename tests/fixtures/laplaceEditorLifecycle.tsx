import { createRoot } from "react-dom/client";
import { useState } from "react";
import { CompatibleThemeEditor } from "../../src/components/CompatibleThemeEditor.tsx";
import { getCompatibleThemeEditingSurface } from "../../src/components/CompatibleThemePreview.tsx";
import { createThemeRepository } from "../../src/themes/themeRepository.ts";
import { createThemeSessionHost } from "../../src/themes/themeEditorSession.ts";
import { createCompatibleThemeModeAdapter } from "../../src/themes/themeModeAdapters.ts";
import type { ThemeDocument } from "../../src/themes/themeTypes.ts";
import type { CompatibleVisualSettings } from "../../src/themes/compatThemeSettings.ts";
import "../../src/compat/laplace/register.tsx";
import "../../src/App.css";

const documents = new Map<string, ThemeDocument>();
const port = {
  async list() { return []; },
  async read(themeId: string) { const value = documents.get(themeId); return value ? structuredClone(value) : undefined; },
  async write(document: ThemeDocument) { documents.set(document.themeId, structuredClone(document)); },
  async remove(themeId: string) { documents.delete(themeId); },
};
const source = createCompatibleThemeModeAdapter("laplace").createBuiltinTheme();
const initial = { ...structuredClone(source), themeId: "laplace-lifecycle", origin: "custom" as const };
documents.set(initial.themeId, structuredClone(initial));
const repository = createThemeRepository(port, []);
const host = createThemeSessionHost(repository, { now: () => "2026-10-25T08:00:00.000Z" });
let session = await host.openThemeSession(initial.themeId);
const surface = getCompatibleThemeEditingSurface("laplace")!;

declare global { interface Window { laplaceLifecycleQa: { reopen(): Promise<void>; snapshot(): unknown } } }

function App() {
  const [, refresh] = useState(0);
  const [previewTarget, setPreviewTarget] = useState<HTMLDivElement | null>(null);
  const updateSettings = (settings: CompatibleVisualSettings) => {
    host.updateThemeDraft(session, document => ({ ...document, settings }));
    refresh(value => value + 1);
  };
  window.laplaceLifecycleQa = {
    async reopen() {
      host.discardThemeSession(session.themeId);
      session = await host.openThemeSession(initial.themeId);
      refresh(value => value + 1);
    },
    snapshot() { return structuredClone(session.document); },
  };
  return <><div ref={setPreviewTarget} style={{ position: 'fixed', right: 0, top: 0, width: 420, height: '100vh', zIndex: 2 }} /><div style={{ width: 'calc(100% - 420px)' }}><CompatibleThemeEditor
    previewTarget={previewTarget}
    document={session.document}
    previewDocument={session.document}
    capability={surface.capability}
    renderer={surface.renderer}
    composeCss={surface.composeCss}
    visualCss={session.document.styles.visualCss}
    customCss={session.document.styles.customCss}
    cssMessage=""
    fontFamilyOptions={[]}
    basicControls={surface.renderBasicControls?.({ document: session.document, onSettingsChange: updateSettings })}
    onSettingsChange={updateSettings}
    onCustomCssChange={() => {}}
    onVisualCssChange={value => {
      host.updateThemeDraft(session, document => ({ ...document, styles: { ...document.styles, visualCss: value } }));
      refresh(current => current + 1);
    }}
    onExportCss={() => {}}
    onAddAsset={() => {}}
    onRemoveAsset={() => {}}
    onBack={() => {}}
    onSave={() => { void host.saveThemeSession(session).then(() => refresh(value => value + 1)); }}
    onEditMetadata={() => {}}
    onApply={() => { void host.saveThemeSession(session).then(() => refresh(value => value + 1)); }}
  /></div></>;
}

createRoot(document.getElementById("root")!).render(<App />);
