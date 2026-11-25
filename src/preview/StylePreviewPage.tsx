import { useUiLanguage } from "../i18n/react.ts";
import { setUiLanguage, getUiLanguage, uiText } from "../i18n/index.ts";
import {
  createPreviewResourceReceiver,
  type StylePreviewWireMessage,
} from "./stylePreviewResources.ts";
import { useEffect, useState } from "react";
import { StylePreviewContent } from "../components/StylePreviewContent.tsx";
import { applyThemeToDocument } from "../theme.ts";
import type { StylePreviewSnapshot } from "./stylePreviewState.ts";
import { applyPreviewMessage } from "./stylePreviewProtocol.ts";
import { rebaseThemeResourceOrigin } from "../themes/themeResourceOrigin.ts";
export function StylePreviewPage() {
  useUiLanguage();
  const [state, setState] = useState<StylePreviewSnapshot | null>(null),
    [status, setStatus] = useState(uiText("stylePreviewPage.StylePreviewPage.statussetStatus")),
    [disconnected, setDisconnected] = useState(false);
  useEffect(() => {
    if (location.search) history.replaceState(null, "", location.pathname);
    let socket: WebSocket,
      retry: ReturnType<typeof setTimeout>,
      closed = false;
    const connect = () => {
      const decode = createPreviewResourceReceiver();
      socket = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws?preview=current`,
      );
      socket.onmessage = (event) => {
        setDisconnected(false);
        const payload = JSON.parse(event.data);
        if (payload.uiLanguage) {
          setUiLanguage(payload.uiLanguage);
          document.documentElement.lang = getUiLanguage();
          document.title = uiText("nativeStylePreviewBridge.openNativeStylePreviewWindow.title");
        }
        if (payload.type === "ui-language") return;
        const message = decode(payload as StylePreviewWireMessage);
        if (!message.type.startsWith("preview:")) return;
        const configured = message.type === "preview:replace" || message.type === "preview:configure"
          ? rebaseThemeResourceOrigin(message, location.origin) : message;
        setState((previous) => applyPreviewMessage(previous, configured));
        setStatus(uiText("stylePreviewPage.StylePreviewPage.connect"));
      };
      socket.onclose = () => {
        setDisconnected(true);
        setStatus(uiText("stylePreviewPage.StylePreviewPage.connect2"));
        if (!closed) retry = setTimeout(connect, 1500);
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      socket?.close();
    };
  }, []);
  useEffect(() => {
    if (state) applyThemeToDocument(state.palette, state.scheme, state.customColor);
  }, [state?.palette, state?.scheme, state?.customColor]);
  return state ? (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", background: "transparent" }}>
      <StylePreviewContent state={state} transparent />
      {disconnected && <p role="status" className="ui-type-control text-t3" style={{ position: "absolute", top: 0, margin: 0 }}>{status}</p>}
    </div>
  ) : (
    <p role="status" className="ui-type-control text-t3" style={{ margin: 0 }}>
      {status}
    </p>
  );
}
