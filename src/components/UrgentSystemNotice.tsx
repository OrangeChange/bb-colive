import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";
import { TriangleAlert as LucideTriangleAlert } from "lucide-react";
import { MsgType, type DanmakuEvent } from "../protocol/types";

function IconAlert() {
  return (
    <LucideTriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
  );
}

export function UrgentSystemNotice({ event, onDismiss }: { event: DanmakuEvent | null; onDismiss: () => void }) {
  useUiLanguage();
  if (!event) return null;
  const label = event.msgType === MsgType.CutOff ? "直播切断" : "直播警告";
  return (
    <div role="alert" aria-live="assertive" className="ui-motion-enter flex shrink-0 items-start gap-2 border-b border-danger/30 bg-danger/10 px-3 py-2 ui-type-control text-danger">
      <IconAlert />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{label}</div>
        <div className="break-words text-danger/90">{event.text || label}</div>
      </div>
      <button
        type="button"
        aria-label={uiText("uiControls.closeNotice")}
        onClick={onDismiss}
        className="shrink-0 rounded px-1 text-danger/70 hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
      >
        ×
      </button>
    </div>
  );
}
