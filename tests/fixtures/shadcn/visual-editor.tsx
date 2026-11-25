import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  NativeThemeVisualEditor,
  type NativeVisualSelection,
} from "../../../src/components/NativeThemeVisualEditor";
import { createBuiltinNativeTheme } from "../../../src/themes/nativeBuiltinThemes";
import { NativeStylePreviewSurface } from "../../../src/components/NativeStylePreviewSurface";
import { createStylePreviewDesignEvents } from "../../../src/components/stylePreviewEvents";
import { tryComposeNativePreviewCss } from "../../../src/themes/nativeThemeCascade";
import { DEFAULT_EVENT_DISPLAY_PREFERENCES } from "../../../src/eventDisplaySettings";
import { DEFAULT_STYLE_PREVIEW_POLICY } from "../../../src/preview/stylePreviewPolicy";
import "../../../src/shadcn.css";
import "../../../src/components/nativeThemeEditor.css";
import "./editor.css";
const theme = createBuiltinNativeTheme("native-default");
const query = new URLSearchParams(location.search);
document.documentElement.classList.toggle(
  "dark",
  query.get("scheme") === "dark",
);
function App() {
  const [previewRoot, setPreviewRoot] = useState<HTMLElement | null>(null);
  const [settings, setSettings] = useState(theme.settings);
  const [selection, setSelection] = useState<NativeVisualSelection>({
    event: "all",
    identity: "all",
    part: query.get("part") === "avatar" ? "avatar" : "row",
  });
  return (
    <main className="editor-screenshot">
      <header className="editor-screenshot-heading">
        <h1>原生默认 · 可视化编辑</h1>
        <p>shadcn/ui 试作 · 所选部件的适用属性全部展开</p>
      </header>
      <div ref={setPreviewRoot} className="editor-inspection-preview">
        <NativeStylePreviewSurface
          title="属性检查预览"
          previewScheme={query.get("scheme") === "dark" ? "dark" : "light"}
          payload={{
            previewCss: tryComposeNativePreviewCss(
              { ...theme, settings },
              ".native-theme-preview",
            ).css,
            previewPolicy: DEFAULT_STYLE_PREVIEW_POLICY,
            previewMotion: "design",
            context: "obs",
            mode: "all",
            events: createStylePreviewDesignEvents("混合流"),
            eventStyleSettings: settings,
            displayPreferences: DEFAULT_EVENT_DISPLAY_PREFERENCES,
            eventFontSize: 16,
            windowEventFontSize: 16,
            scrollDirection: "top",
            contentAlignment: "top",
            previewScheme: query.get("scheme") === "dark" ? "dark" : "light",
            previewBackground: "transparent",
          }}
        />
      </div>
      <NativeThemeVisualEditor
        previewRoot={previewRoot}
        settings={settings}
        selection={selection}
        baseCss={theme.styles.baseCss}
        cssControlled={[]}
        fontFamilyOptions={[settings.fontFamily, "Arial", "system-ui"]}
        onOpenFonts={() => {}}
        onSelectionChange={setSelection}
        onChange={(visualModel, imageDecorations) =>
          setSettings((s) => ({
            ...s,
            visualModel,
            ...(imageDecorations ? { imageDecorations } : {}),
          }))
        }
        onPreviewChange={() => {}}
        onDisplayChange={(display) => setSettings((s) => ({ ...s, display }))}
        onGradientChange={(priceGradient) =>
          setSettings((s) => ({ ...s, priceGradient }))
        }
        onDecorationsChange={(imageDecorations) =>
          setSettings((s) => ({ ...s, imageDecorations }))
        }
      />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
