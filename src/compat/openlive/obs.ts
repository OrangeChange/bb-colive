import {compatibleFallbackDisplay} from "../../themes/compatThemeSettings.ts";
import { DEFAULT_EVENT_DISPLAY_PREFERENCES, type EventDisplayPreferences } from "../../eventDisplaySettings.ts";
import { createDefaultEventStyleSettings, type EventStyleSettings } from "../../eventStyleSettings.ts";
import type { ThemeDocument } from "../../themes/themeTypes.ts";
import { DEFAULT_STICKY_EVENT_SETTINGS, normalizeStickyEventSettings, type StickyEventSettings } from "../../windows/stickyEventModel.ts";
import type { OpenLiveRenderContext } from "./runtime.tsx";

export interface OpenLiveObsSnapshot {
  mode: "blivechat-open";
  targetId: string;
  roomId: number | null;
  displayScale: number;
  display: EventDisplayPreferences & { showTimestamp: boolean; maskUsername: boolean };
  settings: EventStyleSettings & { display?: ReturnType<typeof compatibleFallbackDisplay> };
  stickyEvents: StickyEventSettings;
  document: ThemeDocument;
}
export function buildOpenLiveObsSnapshot(document: ThemeDocument, context: OpenLiveRenderContext, display: Partial<EventDisplayPreferences & { showTimestamp: boolean; maskUsername: boolean }> = {}, stickyEvents: StickyEventSettings = DEFAULT_STICKY_EVENT_SETTINGS): OpenLiveObsSnapshot {
  return { mode: "blivechat-open", targetId: context.targetId, roomId: context.roomId === "" ? null : Number(context.roomId), displayScale: context.displayScale, display: { ...DEFAULT_EVENT_DISPLAY_PREFERENCES, ...compatibleFallbackDisplay("blivechat-open",document.settings), ...display }, settings: {...createDefaultEventStyleSettings(),display:compatibleFallbackDisplay("blivechat-open",document.settings)}, stickyEvents: normalizeStickyEventSettings(stickyEvents), document: structuredClone(document) };
}
