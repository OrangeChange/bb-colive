import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { SettingsPanel } from "../../src/components/SettingsPanel.tsx";
import { createDefaultSceneSettings, loadSceneSettings, saveSceneSettings } from "../../src/components/sceneSettings.ts";
import { useGeneralSettings } from "../../src/generalSettings.ts";
import "../../src/App.css";
const noop = () => {};
function App() {
  const persistence = new URLSearchParams(location.search).has("persist");
  const [scene, setScene] = useState(() => {
    if (persistence) return loadSceneSettings();
    const value = createDefaultSceneSettings();
    value.filters.left.danmu = false;
    value.filters.right.guard = false;
    value.giftThreshold = 99;
    useGeneralSettings.setState({ eventFontSize: 22, windowEventFontSize: 24, eventWindowCapacity: 12,
      eventDisplayPreferences: { ...useGeneralSettings.getState().eventDisplayPreferences, showAvatar: false, eventAnimationDurationMs: 800 } });
    return value;
  });
  const settings = useGeneralSettings();
  useEffect(() => { if (persistence) saveSceneSettings(scene); }, [scene, persistence]);
  return <><output hidden>{JSON.stringify({ scene, eventFontSize: settings.eventFontSize, windowEventFontSize: settings.windowEventFontSize,
    display: settings.eventDisplayPreferences, capacity: settings.eventWindowCapacity,
    alignment: settings.liveContentAlignment, direction: settings.liveScrollDirection, obsEffects: settings.showObsGiftEffect })}</output>
    <div style={{ width: 420, height: 850 }}><SettingsPanel sceneSettings={scene} setSceneSettings={setScene}
      displayOpen={false} displayLocked={false} giftOpen={false} giftLocked={false}
      onToggleDisplay={noop} onToggleDisplayLock={noop} onToggleGift={noop} onToggleGiftLock={noop}
      onResetWindowLayout={noop} onResetDisplayWindowLayout={noop} onResetGiftWindowLayout={noop} onResetAllWindowLayout={noop}
      diagnosticStatus={null} diagnosticMarkers={[]} onMarkDiagnosticIssue={noop} onExportDiagnosticBundle={noop}
      onDiagnosticExportStateChange={noop} onOpenDiagnosticDirectory={noop} /></div></>;
}
createRoot(document.getElementById("root")!).render(<App />);
