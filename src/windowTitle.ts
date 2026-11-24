import { uiText } from "./i18n/index.ts";
import type { ConnState } from "./protocol/types";

const APP_NAME = "BB CoLive";

type WindowTitleState = Pick<ConnState, "status" | "anchorName" | "roomId" | "liveStatus">;

function subjectLabel(state: WindowTitleState): string | null {
  const name = state.anchorName?.trim();
  if (name) return name;
  if (state.roomId) return uiText("windowTitle.subjectLabel", { roomId: state.roomId });
  return null;
}

function connectedLabel(liveStatus: WindowTitleState["liveStatus"]): string {
  if (liveStatus === 1) return uiText("windowTitle.connectedLabel");
  if (liveStatus === 2) return uiText("windowTitle.connectedLabel2");
  if (liveStatus === 0) return uiText("windowTitle.connectedLabel3");
  return uiText("windowTitle.connectedLabel4");
}

/** 生成 Windows 原生窗口标题；只反映连接生命周期，不随事件流刷新。 */
export function getWindowTitle(state: WindowTitleState): string {
  // 手动断开后 store 可能保留 roomId 作为会话定位，但它不是当前标题主体；
  // 只有仍有主播身份时才保留“主播 · 未连接”，避免显示残留房间号。
  if (state.status === "idle" || (state.status === "closed" && !state.anchorName?.trim())) return APP_NAME;

  const subject = subjectLabel(state);
  if (!subject) return APP_NAME;

  const status =
    state.status === "connecting"
      ? uiText("windowTitle.getWindowTitle.status")
      : state.status === "reconnecting"
        ? uiText("windowTitle.getWindowTitle.status2")
        : state.status === "error"
          ? uiText("windowTitle.getWindowTitle.status3")
          : state.status === "closed"
            ? uiText("windowTitle.getWindowTitle.status4")
            : connectedLabel(state.liveStatus);

  return `${subject} · ${status} · ${APP_NAME}`;
}
