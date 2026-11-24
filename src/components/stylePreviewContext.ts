import type { StylePreviewPolicySettings } from "../preview/stylePreviewPolicy.ts";
import { shouldShowAutoDanmaku, shouldShowPhoneNotVerified, type EventDisplayPreferences } from "../eventDisplaySettings";
import { isDisplayEvent } from "../windows/displayWindowModel";
import { isGiftWindowEvent } from "../windows/giftWindowModel";
import type { DanmakuEvent } from "../protocol/types";
import { isAllowedByOnlyGuardEntry } from "../events/eventView";

export type StylePreviewContext = "live" | "review" | "window-chat" | "window-pay" | "obs";
export type StylePreviewMode = "all" | "current";
export type StylePreviewSettings = {
  previewPolicy?: StylePreviewPolicySettings;
  previewMotion?: "static" | "design" | "simulation";
  previewNow?: number;
  previewMainEventIds?: string[];
  displayPreferences: EventDisplayPreferences;
  eventFontSize: number;
  windowEventFontSize: number;
  scrollDirection?: "top" | "bottom";
  contentAlignment?: "top" | "bottom";
};

export function resolveStylePreviewContext(context: StylePreviewContext, mode: StylePreviewMode, input: StylePreviewSettings) {
  const windowLayout = context === "window-chat" || context === "window-pay";
  const review = context === "review";
  const fontSize = review ? 14 : windowLayout ? input.windowEventFontSize : input.eventFontSize;
  const displayPreferences = input.displayPreferences;
  return {
    areaClass: windowLayout ? `event-area theme-target-windows window ${context}` : `event-area theme-target-${context} ${context}`,
    layout: review ? "review" as const : windowLayout ? "window" as const : "live" as const,
    fontSize,
    displayPreferences,
    accepts: (event: DanmakuEvent) => (context === "window-chat" ? isDisplayEvent(event) : context === "window-pay" ? isGiftWindowEvent(event) : true)
      && (mode === "all" || (shouldShowAutoDanmaku(event, displayPreferences.showAutoDanmaku)
      && shouldShowPhoneNotVerified(event, displayPreferences.showPhoneNotVerified)
      && (review || isAllowedByOnlyGuardEntry(event, displayPreferences.onlyGuardEntry)))),
  };
}
