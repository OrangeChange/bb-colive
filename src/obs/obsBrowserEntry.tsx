import { setUiLanguage, getUiLanguage, uiText } from "../i18n/index.ts";
import { resolveOutputScheme } from "./obsConfigurationIdentity.ts";
import { subscribeLaplaceObsScene, parseLaplaceObsScene } from "./laplaceObsScene.ts";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { StylePreviewPage } from "../preview/StylePreviewPage.tsx";
import { applyThemeToDocument } from "../theme.ts";
import { ObsStateView } from "./ObsStateView.tsx";
import { installObsCustomCssBridge } from "./obsCustomCssBridge.ts";
import { GiftEffectOverlay } from "../components/GiftEffectOverlay.tsx";
import type { GiftEffectNotice } from "../windows/giftEffectBus.ts";
import {
  createObsGiftEffectGate,
  obsGiftEffectResource,
  createObsMessageGate,
} from "./obsBrowserState.ts";
import { obsSampleDisplay } from "./obsSamples.ts";
import { rebaseThemeResourceOrigin } from "../themes/themeResourceOrigin.ts";
import type { ObsMessage, ObsWireState } from "./obsProtocol.ts";
import "../compat/blivechat/register.tsx";
import "../compat/openlive/register.tsx";
import "../compat/laplace/register.tsx";
import "../App.css";
import "../components/themeWorkspace.css";
import "../components/nativeThemeEditor.css";
import "./obs.css";
document.documentElement.dataset.obsBrowser = "true";
const stopCustomCssBridge = installObsCustomCssBridge(document);
if (import.meta.hot) import.meta.hot.dispose(stopCustomCssBridge);
function BrowserOutput() {
  const [status, setStatus] = useState("");
  const [scene, setScene] = useState<ReturnType<typeof parseLaplaceObsScene>>();
  useEffect(() => subscribeLaplaceObsScene(window, setScene), []);
  const [notices, setNotices] = useState<GiftEffectNotice[]>([]);
  const socketRef = useRef<WebSocket | undefined>(undefined),
    [state, setState] = useState<ObsWireState>();
  useLayoutEffect(() => {
    if (state) applyThemeToDocument(state.palette ?? "sakura", state.scheme, state.customColor);
  }, [state?.palette, state?.scheme, state?.customColor]);
  useEffect(() => {
    let socket: WebSocket,
      retry: ReturnType<typeof setTimeout>,
      disposed = false;
    const gate = createObsMessageGate();
    const effectGate = createObsGiftEffectGate();
    let roomId: string | number | null | undefined;
    const connect = () => {
      gate.reset();
      effectGate.reset();
      setNotices([]);
      socket = socketRef.current = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws${location.search}`,
      );
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data) as ObsMessage & { uiLanguage?: string; type: string };
        if (message.uiLanguage) {
          setUiLanguage(message.uiLanguage);
          document.documentElement.lang = getUiLanguage();
          document.title = uiText("obs.pageTitle");
        }
        if (
          message.type === "state" &&
          gate.accept(message.identity, message.sequence)
        ) {
          if (roomId !== message.snapshot.roomId) {
            roomId = message.snapshot.roomId;
            setNotices([]);
          }
          if (message.giftEffectSession)
            effectGate.baseline(
              message.giftEffectSession,
              message.giftEffectSequence ?? 0,
            );
          setState({ ...message, snapshot: rebaseThemeResourceOrigin(message.snapshot, location.origin) });
          setStatus("");
        } else if (
          message.type === "gift-effect" &&
          effectGate.accept(message.session, message.sequence)
        ) {
          const notice = {
            event: message.notice.event,
            resource: obsGiftEffectResource(
              message.notice.resource,
              location.origin,
            ),
          };
          setNotices((previous) => [...previous.slice(-32), notice]);
        } else if (message.type === "status") {
          setState(undefined);
          setStatus(message.message);
        }
      };
      socket.onclose = () => {
        if (!disposed) retry = setTimeout(connect, 1500);
      };
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      socket?.close();
    };
  }, []);
  const displayed =
    state && new URLSearchParams(location.search).get("preview") === "sample"
      ? obsSampleDisplay(state, true)
      : state;
  return (
    <div className="obs-output-root">
      {status && <p role="status" className="ui-type-control text-t2" style={{margin:0,padding:8}}>{status}</p>}
      {displayed && (
        <GiftEffectOverlay
          key={displayed.snapshot.roomId}
          enabled={displayed?.preferences.showGiftEffect ?? false}
          guardEnabled={displayed?.preferences.showGuardEffect ?? false}
          notices={notices}
          roomKey={displayed.snapshot.roomId ?? null}
        />
      )}
      {displayed && (
        <ObsStateView
          key={displayed.identity}
          scheme={resolveOutputScheme(displayed.scheme, displayed.outputScheme, undefined, displayed.snapshot.mode === "laplace" ? scene : undefined)}
          sceneName={displayed.snapshot.mode === "laplace" ? scene?.sceneName : undefined}
          state={displayed}
          onRenderStatus={(message) =>
            socketRef.current?.send(JSON.stringify(message))
          }
        />
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  location.pathname === "/preview" ? <StylePreviewPage /> : <BrowserOutput />,
);
