import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { NativeThemeVisualEditor, type NativeVisualSelection } from "../../src/components/NativeThemeVisualEditor.tsx";
import { createBuiltinNativeTheme } from "../../src/themes/nativeBuiltinThemes.ts";
import "../../src/components/nativeThemeEditor.css";

const theme = createBuiltinNativeTheme("native-default");

function App() {
  const [settings, setSettings] = useState(theme.settings);
  const [selection, setSelection] = useState<NativeVisualSelection>({ event: "superchat", identity: "captain", part: "message" });
  return <NativeThemeVisualEditor settings={settings} selection={selection} cssControlled={[]} fontFamilyOptions={[settings.fontFamily]} onOpenFonts={() => undefined} onSelectionChange={setSelection} onChange={visualModel => setSettings(current => ({ ...current, visualModel }))} onDisplayChange={display => setSettings(current => ({ ...current, display }))} />;
}

createRoot(document.getElementById("root")!).render(<App />);
