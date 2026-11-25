import "../../src/compat/openlive/register.tsx";
import { StrictMode, useState } from "react";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { createBuiltinNativeTheme } from "../../src/themes/nativeBuiltinThemes";
import { permissionsForOrigin, toThemeSummary } from "../../src/themes/themeTypes";
import { createRoot } from "react-dom/client";
import { IsolatedPreviewFrame } from "../../src/components/IsolatedPreviewFrame";
import { StylePreviewArea } from "../../src/components/StylePreviewArea";
import { createDefaultEventStyleSettings } from "../../src/eventStyleSettings";
import { DEFAULT_EVENT_DISPLAY_PREFERENCES } from "../../src/eventDisplaySettings";
import { createStylePreviewEvents } from "../../src/components/stylePreviewEvents";
import { NativeObsRenderer } from "../../src/obs/NativeObsRenderer";
import { buildNativeObsThemeSnapshot } from "../../src/obs/nativeObsTheme";
import { projectNativeTheme } from "../../src/themes/nativeThemeProjection";
import "../../src/shadcn.css";
import "../../src/components/nativeThemeEditor.css";

function Fixture() {
  const [size, setSize] = useState(20.5);
  const [open, setOpen] = useState(true);
  const fixedCss = new URLSearchParams(location.search).has("fixed") ? ".message{font-size:14px}.avatar{width:14px;height:14px}" : "";
  return <><button onClick={() => setOpen(false)}>关闭</button>{[20.5, 32, 16].map(value => <button key={value} onClick={() => { setSize(value); setOpen(true); }}>{value}</button>)}
    {open && <div style={{ width: 400, height: 600 }}><IsolatedPreviewFrame title="切换预览" previewCss={fixedCss}>
      <StylePreviewArea context="live" mode="all" events={createStylePreviewEvents("混合流")} eventStyleSettings={createDefaultEventStyleSettings()}
        displayPreferences={DEFAULT_EVENT_DISPLAY_PREFERENCES} eventFontSize={size} windowEventFontSize={size} />
    </IsolatedPreviewFrame></div>}</>;
}
const documents = [20.5, 32].map((size, index) => {
  const theme = createBuiltinNativeTheme("native-default");
  theme.themeId = index ? "test-b" : "test-a";
  theme.origin = "custom";
  theme.permissions = permissionsForOrigin("custom");
  theme.metadata.name = index ? "测试B" : "测试A";
  theme.settings.display.baseFontSize = size;
  theme.styles.customCss = `.message{color:${index ? "rgb(0, 180, 0)" : "rgb(180, 0, 0)"};}`;
  if (index) theme.assets = [{ id: "image", name: "image", path: "assets/image.png", mediaType: "image/png" }];
  return theme;
});
mockWindows("main");
const obsTheme = createBuiltinNativeTheme("native-default");
obsTheme.settings.display.baseFontSize = 24;
obsTheme.settings.visualModel = { common: { "all|all|message": { fontSize: { source: "custom", value: { mode: "base-relative", ratio: 1 } } } }, light: {}, dark: {} };
mockIPC(async (command, args: any) => {
  if (command === "list_theme_summaries") return documents.map(toThemeSummary);
  if (command === "read_theme_document") return structuredClone(documents.find(item => item.themeId === args.themeId));
  if (command === "write_theme_document") { documents[documents.findIndex(item => item.themeId === args.document.themeId)] = structuredClone(args.document); return; }
  if (command === "read_theme_asset_bytes") {
    if (new URLSearchParams(location.search).get("asset") !== "delay") throw new Error("测试资源不可用");
    await new Promise(resolve => setTimeout(resolve, 1000));
    return "AA==";
  }
  if (command === "plugin:store|load") return 1;
  if (command === "plugin:store|get") return new URLSearchParams(location.search).has("obs") ? [buildNativeObsThemeSnapshot(obsTheme, "default", projectNativeTheme(obsTheme)), true] : [null, false];
  if (command === "plugin:event|listen") return 1;
  if (command.startsWith("plugin:")) return null;
  console.log("IPC", command, args);
  return null;
});
const { ThemeWorkspace } = await import("../../src/components/ThemeWorkspace");
const noop = () => {};
function WorkspaceFixture() {
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [header, setHeader] = useState<HTMLDivElement | null>(null);
  return <div style={{display:"flex", height:800}}><div style={{width:900,overflow:"auto"}}><ThemeWorkspace active displayPreferences={DEFAULT_EVENT_DISPLAY_PREFERENCES} applyThemeProjection={noop} previewTarget={target} previewHeaderTarget={header} previewGeometry={null} onEditingChange={setEditing} onPreviewTitleChange={noop} fontFamilyOptions={[]} onOpenFonts={noop}/></div>{editing && <aside><div ref={setHeader}/><div ref={setTarget} style={{width:400,height:800}}/></aside>}</div>;
}
createRoot(document.getElementById("root")!).render(<StrictMode>{new URLSearchParams(location.search).has("obs") ? <NativeObsRenderer events={createStylePreviewEvents("混合流")}/> : new URLSearchParams(location.search).has("leaf") ? <Fixture/> : <WorkspaceFixture/>}</StrictMode>);
