import {
  clampEventFontSize,
  DEFAULT_EVENT_DISPLAY_PREFERENCES,
  type EventDisplayPreferences,
} from "./eventDisplaySettings.ts";
import { normalizePriceGradient, priceBandColor } from "./themes/nativePriceGradient.ts";

export const REVIEW_PRICE_GRADIENT = normalizePriceGradient();
export const REVIEW_PRICE_GRADIENT_CSS = REVIEW_PRICE_GRADIENT.bands.flatMap(band =>
  (["light", "dark"] as const).map(scheme =>
    `${scheme === "dark" ? ".dark " : ""}.event.event-surface-archive.price-gradient-active.price-tier-${band.id} {\n`
    + `  --review-tone: ${priceBandColor(REVIEW_PRICE_GRADIENT, "common", band.id, scheme, "color")};\n`
    + `  --review-fill: ${priceBandColor(REVIEW_PRICE_GRADIENT, "common", band.id, scheme, "background")};\n}`,
  ),
).join("\n");

export type ReviewStyleSettings = {
  fontSize: number;
  identityDisplayMode: "icon" | "text";
  showAvatar: boolean;
  showAvatarFrame: boolean;
  showGuardIdentity: boolean;
  showAnchorIdentity: boolean;
  showAdminIdentity: boolean;
  showFanMedal: boolean;
  showLevelAndRank: boolean;
  showIcons: boolean;
  uniformTextColor: boolean;
  usePriceGradient: boolean;
};

export const DEFAULT_REVIEW_STYLE_SETTINGS: ReviewStyleSettings = {
  fontSize: 14,
  identityDisplayMode: "icon",
  showAvatar: true,
  showAvatarFrame: true,
  showGuardIdentity: true,
  showAnchorIdentity: true,
  showAdminIdentity: true,
  showFanMedal: true,
  showLevelAndRank: true,
  showIcons: true,
  uniformTextColor: false,
  usePriceGradient: false,
};

export function normalizeReviewStyleSettings(
  input?: Partial<ReviewStyleSettings> | null,
): ReviewStyleSettings {
  const result = { ...DEFAULT_REVIEW_STYLE_SETTINGS };
  if (!input) return result;
  for (const key of Object.keys(result) as (keyof ReviewStyleSettings)[]) {
    if (key === "fontSize") {
      if (typeof input.fontSize === "number" && Number.isFinite(input.fontSize))
        result.fontSize = clampEventFontSize(input.fontSize);
    } else if (key === "identityDisplayMode") {
      if (input[key] === "icon" || input[key] === "text") result[key] = input[key];
    } else if (typeof input[key] === "boolean") result[key] = input[key];
  }
  return result;
}

export function reviewDisplayPreferences(
  settings: ReviewStyleSettings,
): EventDisplayPreferences {
  return {
    ...DEFAULT_EVENT_DISPLAY_PREFERENCES,
    guardIdentityDisplayMode: settings.identityDisplayMode,
    anchorIdentityDisplayMode: settings.identityDisplayMode,
    adminIdentityDisplayMode: settings.identityDisplayMode,
    honorLevelDisplayMode: settings.identityDisplayMode,
    eventSpacing: 0,
    eventPadding: 6,
    eventAnimationPreset: "none",
    showAvatar: settings.showAvatar,
    showAvatarFrame: settings.showAvatarFrame,
    showGuardIdentity: settings.showGuardIdentity,
    showAnchorIdentity: settings.showAnchorIdentity,
    showAdminIdentity: settings.showAdminIdentity,
    showFanMedal: settings.showFanMedal,
    showHonorLevel: settings.showLevelAndRank,
    showCurrentRank: settings.showLevelAndRank,
    showGiftImage: settings.showIcons,
    showEventIcon: settings.showIcons,
  };
}
