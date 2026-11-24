import type { ThemeDocument } from "../themes/themeTypes.ts";
import { projectNativeTheme } from "../themes/nativeThemeProjection.ts";
import {
  buildNativeObsThemeSnapshot,
  type ObsThemeSnapshot,
} from "./nativeObsTheme.ts";
import { buildBlivechatObsSnapshot } from "../compat/blivechat/obs.ts";
import { buildOpenLiveObsSnapshot } from "../compat/openlive/obs.ts";
import { buildLaplaceObsSnapshot } from "../compat/laplace/obs.ts";
import type { StickyEventSettings } from "../windows/stickyEventModel.ts";
export function createObsSnapshot(
  document: ThemeDocument,
  targetId: string,
  roomId: string,
  displayScale: number,
  sticky: StickyEventSettings,
): ObsThemeSnapshot {
  const context = { target: "obs" as const, targetId, roomId, displayScale };
  const display = {
    showTimestamp: document.settings.showTimestamp === true,
    maskUsername: document.settings.maskUsername === true,
  };
  if (document.mode === "blivechat")
    return buildBlivechatObsSnapshot(document, context, display, sticky);
  if (document.mode === "blivechat-open")
    return buildOpenLiveObsSnapshot(document, context, display, sticky);
  if (document.mode === "laplace")
    return buildLaplaceObsSnapshot(document, context, sticky);
  return {
    ...buildNativeObsThemeSnapshot(
      document,
      targetId,
      projectNativeTheme(document),
      undefined,
      sticky,
      roomId,
    ),
    displayScale,
  };
}
