import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { setUiLanguage, uiText } from "../../src/i18n/index.ts";
import { useUiLanguage } from "../../src/i18n/react.ts";
import { applyThemeToDocument } from "../../src/theme.ts";
import "../../src/App.css";
import "../../src/components/nativeThemeEditor.css";
mockWindows("main");
mockIPC(
  async (c) =>
    c === "plugin:store|load"
      ? 1
      : c === "plugin:store|get"
        ? [null, false]
        : null,
  { shouldMockEvents: true },
);
setUiLanguage(new URLSearchParams(location.search).get("lang") || "zh-CN");
applyThemeToDocument(
  "sakura",
  new URLSearchParams(location.search).has("dark") ? "dark" : "light",
);
window.auditLanguage = setUiLanguage;
const { ThemeBackgroundField } =
  await import("../../src/components/ThemeBackgroundField.tsx");
const { ColorSlider } = await import("../../src/components/ColorSlider.tsx");
const { GiftThresholdInput } =
  await import("../../src/components/GiftThresholdInput.tsx");
const { SettingsPanel } =
  await import("../../src/components/SettingsPanel.tsx");
const { createDefaultSceneSettings } =
  await import("../../src/components/sceneSettings.ts");
const { RoomInsightsProvider } =
  await import("../../src/hooks/useRoomInsights.tsx");
const { NativePriceGradientControls } =
  await import("../../src/components/NativePriceGradientControls.tsx");
const { normalizePriceGradient } =
  await import("../../src/themes/nativePriceGradient.ts");
const params = new URLSearchParams(location.search);
function Audit() {
  useUiLanguage();
  const [s, set] = useState(createDefaultSceneSettings());
  const [color, setColor] = useState(
    "linear-gradient(180deg, #fb7299 0%, transparent 100%)",
  );
  const [gradient, setGradient] = useState(() =>
    normalizePriceGradient(undefined),
  );
  const [tier, setTier] = useState(gradient.bands[0].id);
  if (params.get("mode") === "tiers")
    return (
      <NativePriceGradientControls
        event="normal"
        model={gradient}
        selected={tier}
        onSelect={setTier}
        onChange={setGradient}
        applied
      />
    );
  return params.get("mode") === "settings" ? (
    <SettingsPanel
      sceneSettings={s}
      setSceneSettings={set}
      displayOpen={false}
      giftOpen={false}
      displayLocked={false}
      giftLocked={false}
      onToggleDisplay={() => {}}
      onToggleDisplayLock={() => {}}
      onToggleGift={() => {}}
      onToggleGiftLock={() => {}}
      onResetWindowLayout={() => {}}
      onResetDisplayWindowLayout={() => {}}
      onResetGiftWindowLayout={() => {}}
      onResetAllWindowLayout={() => {}}
      diagnosticStatus={null}
      diagnosticMarkers={[]}
      onMarkDiagnosticIssue={() => {}}
      onExportDiagnosticBundle={async () => {}}
      onDiagnosticExportStateChange={() => {}}
      onOpenDiagnosticDirectory={() => {}}
    />
  ) : (
    <div
      style={{
        padding: 12,
        width: 400,
        maxWidth: "100%",
        boxSizing: "border-box",
      }}
    >
      <ThemeBackgroundField
        value={color}
        label={uiText("settingsPanel.SurfaceColorInput")}
        onChange={setColor}
        onPreviewChange={() => {}}
      />
      <GiftThresholdInput
        value={123.45}
        mode="cumulative"
        compact
        onChange={() => {}}
      />
      <ColorSlider
        value={{ r: 123, g: 45, b: 67, a: 0.75 }}
        onChange={() => {}}
      />
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <RoomInsightsProvider>
    <Audit />
  </RoomInsightsProvider>,
);
document.documentElement.dataset.auditReady = "true";
