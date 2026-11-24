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
      if (!status.running) throw Error(status.error || "本机服务未启动");
      await navigator.clipboard.writeText(stylePreviewUrl(status.port));
      setCopied(true);
      copiedTimer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      notifyWorkspace("无法复制预览链接，请确认本机服务及剪贴板权限后重试");
    } finally {
      setCopying(false);
    }
  };
  return (
    <div className="native-preview-header-actions shared-preview-actions">
      <button
        type="button"
        className="native-preview-open-button ui-type-control"
        title="打开独立预览"
        aria-label="打开独立预览"
        onClick={() => void openNativeStylePreviewWindow()}
      >
        <ExternalLink size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="native-preview-open-button ui-type-control"
        title={copied ? "预览链接已复制" : "复制预览链接"}
        aria-label="复制预览链接"
        disabled={copying}
        onClick={() => void copy()}
      >
        {copied ? <Check size={16} aria-hidden="true" /> : <Link size={16} aria-hidden="true" />}
      </button>
      <span role="status" className="sr-only">{copied ? "预览链接已复制" : ""}</span>
      {onRealtimeChange && (
        <button
          type="button"
          className={`native-preview-open-button ui-type-control preview-live-toggle${realtime ? " is-active" : ""}`}
          title={
            realtimeDisabled
              ? "保存配置后可查看实时事件"
              : realtime
                ? "实时事件已开启，点击返回样例"
                : "查看实时事件"
          }
          aria-label="实时事件"
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
