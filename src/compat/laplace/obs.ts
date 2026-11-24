import type { ThemeDocument } from "../../themes/themeTypes.ts";
import { DEFAULT_EVENT_DISPLAY_PREFERENCES } from "../../eventDisplaySettings.ts";
import { createDefaultEventStyleSettings } from "../../eventStyleSettings.ts";
import { DEFAULT_STICKY_EVENT_SETTINGS, normalizeStickyEventSettings, type StickyEventSettings } from "../../windows/stickyEventModel.ts";
import type { ThemeRenderContext } from "../../themes/themeModeAdapters.ts";
export interface LaplaceObsSnapshot { mode: "laplace"; targetId: string; roomId: number | null; displayScale: number; display: typeof DEFAULT_EVENT_DISPLAY_PREFERENCES; settings: ReturnType<typeof createDefaultEventStyleSettings>; stickyEvents: typeof DEFAULT_STICKY_EVENT_SETTINGS; document: ThemeDocument }
export function buildLaplaceObsSnapshot(document: ThemeDocument, context: ThemeRenderContext, stickyEvents: StickyEventSettings = DEFAULT_STICKY_EVENT_SETTINGS): LaplaceObsSnapshot { return { mode: "laplace", targetId: context.targetId, roomId: context.roomId === "" ? null : Number(context.roomId), displayScale: context.displayScale, display: DEFAULT_EVENT_DISPLAY_PREFERENCES, settings: createDefaultEventStyleSettings(), stickyEvents: normalizeStickyEventSettings(stickyEvents), document: structuredClone(document) }; }
