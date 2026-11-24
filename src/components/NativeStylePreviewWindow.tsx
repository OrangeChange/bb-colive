import { createPreviewResourceReceiver } from "../preview/stylePreviewResources.ts";
import { useEffect, useState } from "react";
import { flushSync } from 'react-dom';
import { StylePreviewContent } from "./StylePreviewContent.tsx";
import {
  announceNativeStylePreviewReady,
  listenNativeStylePreviewUpdates,
} from "../windows/nativeStylePreviewBridge.ts";
import type { StylePreviewSnapshot } from "../preview/stylePreviewState.ts";
import { applyPreviewMessage } from "../preview/stylePreviewProtocol.ts";
import { applyThemeToDocument } from "../theme.ts";
import "./nativeThemeEditor.css";
export function NativeStylePreviewWindow() {
  const [state, setState] = useState<StylePreviewSnapshot | null>(null);
  useEffect(() => {
    let stop: (() => void) | undefined;
    let active = true;
    const decode = createPreviewResourceReceiver();
    void listenNativeStylePreviewUpdates((value) => {
      if (active)
        flushSync(() => setState((previous) => applyPreviewMessage(previous, decode(value))));
    }).then((unlisten) => {
      stop = unlisten;
      if (!active) unlisten();
      else void announceNativeStylePreviewReady();
    });
    return () => {
      active = false;
      stop?.();
    };
  }, []);
  useEffect(() => {
    if (state) applyThemeToDocument(state.palette, state.scheme, state.customColor);
  }, [state?.palette, state?.scheme, state?.customColor]);
  return state ? (
    <div className="native-style-preview-window" style={{ overflow: "hidden" }}>
      <StylePreviewContent state={state} />
    </div>
  ) : (
    <div role="status">请在软件中打开样式预览</div>
  );
}
