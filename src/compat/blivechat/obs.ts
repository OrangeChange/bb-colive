import {compatibleFallbackDisplay} from "../../themes/compatThemeSettings.ts";
import { DEFAULT_EVENT_DISPLAY_PREFERENCES, type EventDisplayPreferences } from "../../eventDisplaySettings.ts";
import type { ThemeDocument } from "../../themes/themeTypes.ts";
import type { BlivechatRenderContext } from "./runtime.tsx";
import { createDefaultEventStyleSettings, type EventStyleSettings } from "../../eventStyleSettings.ts";
import { DEFAULT_STICKY_EVENT_SETTINGS, normalizeStickyEventSettings, type StickyEventSettings } from "../../windows/stickyEventModel.ts";

export interface BlivechatObsSnapshot {
  mode: "blivechat";
  publicationId?: string;
  targetId: string;
  roomId: number | null;
  displayScale: number;
  display: EventDisplayPreferences & { showTimestamp: boolean; maskUsername: boolean };
  settings: EventStyleSettings & { display?: ReturnType<typeof compatibleFallbackDisplay> };
  stickyEvents: StickyEventSettings;
  document: ThemeDocument;
}

export function buildBlivechatObsSnapshot(document: ThemeDocument, context: BlivechatRenderContext, display: Partial<EventDisplayPreferences & { showTimestamp: boolean; maskUsername: boolean }> = {}, stickyEvents: StickyEventSettings = DEFAULT_STICKY_EVENT_SETTINGS): BlivechatObsSnapshot {
  return { mode: "blivechat", publicationId: crypto.randomUUID(), targetId: context.targetId, roomId: context.roomId === "" ? null : Number(context.roomId), displayScale: context.displayScale, display: { ...DEFAULT_EVENT_DISPLAY_PREFERENCES, ...compatibleFallbackDisplay("blivechat",document.settings), ...display }, settings: {...createDefaultEventStyleSettings(),display:compatibleFallbackDisplay("blivechat",document.settings)}, stickyEvents: normalizeStickyEventSettings(stickyEvents), document: structuredClone(document) };
}
