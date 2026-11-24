import { uiText } from "../i18n/index.ts";
import { ExternalLink, Link, Radio, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { notifyWorkspace } from "./WorkspaceNotice.tsx";
import { invoke } from "@tauri-apps/api/core";
import { openNativeStylePreviewWindow } from "../windows/nativeStylePreviewBridge.ts";
import { obsServiceStatus, type ObsServiceStatus } from "../obs/obsService.ts";
import { stylePreviewUrl } from "../preview/stylePreviewActions.ts";
export function StylePreviewActions({
  realtime = false,
  onRealtimeChange,
  realtimeDisabled = false,
}: {
  realtime?: boolean;
  onRealtimeChange?: () => void;
  realtimeDisabled?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);
  const copy = async () => {
    if (copying) return;
    clearTimeout(copiedTimer.current);
    setCopied(false); setCopying(true);
    try {
      let status = await obsServiceStatus();
      if (!status.running)
        status = await invoke<ObsServiceStatus>("obs_start_service");
      if (!status.running) throw Error(status.error || uiText("stylePreviewActions.StylePreviewActions.copy"));
      await navigator.clipboard.writeText(stylePreviewUrl(status.port));
      setCopied(true);
      copiedTimer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      notifyWorkspace(uiText("stylePreviewActions.StylePreviewActions.copy2"));
    } finally {
      setCopying(false);
    }
  };
  return (
    <div className="native-preview-header-actions shared-preview-actions">
      <button
        type="button"
        className="native-preview-open-button ui-type-control"
        title={uiText("stylePreviewActions.title")}
        aria-label={uiText("stylePreviewActions.aria_label")}
        onClick={() => void openNativeStylePreviewWindow()}
      >
        <ExternalLink size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="native-preview-open-button ui-type-control"
        title={copied ? uiText("stylePreviewActions.title2") : uiText("stylePreviewActions.title3")}
        aria-label={uiText("stylePreviewActions.aria_label2")}
        disabled={copying}
        onClick={() => void copy()}
      >
        {copied ? <Check size={16} aria-hidden="true" /> : <Link size={16} aria-hidden="true" />}
      </button>
      <span role="status" className="sr-only">{copied ? uiText("stylePreviewActions.StylePreviewActions") : ""}</span>
      {onRealtimeChange && (
        <button
          type="button"
          className={`native-preview-open-button ui-type-control preview-live-toggle${realtime ? " is-active" : ""}`}
          title={
            realtimeDisabled
              ? uiText("stylePreviewActions.title4")
              : realtime
                ? uiText("stylePreviewActions.title5")
                : uiText("stylePreviewActions.title6")
          }
          aria-label={uiText("stylePreviewActions.aria_label3")}
          aria-pressed={realtime}
          disabled={realtimeDisabled}
          onClick={onRealtimeChange}
        >
          <Radio size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
