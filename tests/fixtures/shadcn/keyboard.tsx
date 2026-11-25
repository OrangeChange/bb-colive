import { RoomInsightsProvider } from "../../../src/hooks/useRoomInsights";
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { EventContextMenu } from "../../../src/components/EventContextMenu";
import { ConnectBar } from "../../../src/components/ConnectBar";
import { useConnection } from "../../../src/stores/connection";
import { ThemeColorField } from "../../../src/components/ThemeColorField";
import { ThemeBackgroundField } from "../../../src/components/ThemeBackgroundField";
import samples from "../../../src/preview/nativeStaticSamples.json";
import type { DanmakuEvent } from "../../../src/protocol/types";
import "../../../src/shadcn.css";
const event = samples.samples[0].event as DanmakuEvent;
useConnection.setState({
  anchors: [
    { uname: "主播一", roomIdInput: "1", realRoomId: 1, lastConnectedAt: 1 },
    { uname: "主播二", roomIdInput: "2", realRoomId: 2, lastConnectedAt: 0 },
  ],
  refreshAnchors: () => {},
});
function App() {
  const [color, setColor] = useState("#fb7299"),
    [background, setBackground] = useState(
      "linear-gradient(90deg, #fb7299 0%, #4c9a8d 100%)",
    );
  return (
    <main style={{ padding: 40, display: "grid", gap: 24, maxWidth: 700 }}>
      <RoomInsightsProvider>
        <ConnectBar />
      </RoomInsightsProvider>
      <div className="event-row-with-menu">
        <EventContextMenu
          event={event}
          shortcutActions={[]}
          handlers={{
            regionKey: "live",
            onSpeakEvent: () => {},
            isFavorite: () => false,
            onToggleFavorite: () => {},
          }}
        />
      </div>
      <ThemeColorField value={color} onChange={setColor} label="颜色" />
      <output id="color-value">{color}</output>
      <ThemeBackgroundField
        value={background}
        onChange={setBackground}
        onPreviewChange={() => {}}
        label="背景填充"
      />
      <output id="background-value">{background}</output>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
