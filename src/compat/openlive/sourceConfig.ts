import type { BlivechatOpenThemeSettings } from "../../themes/compatThemeSettings.ts";
import { DEFAULT_OPENLIVE_SETTINGS, type OpenLiveSettings } from "./settings.ts";
import { normalizeNativeEventVisibility } from "../../themes/nativeComponentAppearance.ts";

export function createOpenLiveSourceConfig(
  settings: Partial<BlivechatOpenThemeSettings>,
  host: { direction?: "top" | "bottom"; maxNumber?: number } = {},
): OpenLiveSettings & Record<string, unknown> {
  const visibility = normalizeNativeEventVisibility(settings.eventVisibility);
  return {
    ...DEFAULT_OPENLIVE_SETTINGS,
    skin: settings.skin === "default" ? "default" : "none",
    minGiftPrice: 0,
    minTickerPrice: 0,
    showDanmaku: visibility.categories.danmaku !== false,
    showSuperchat: visibility.categories.superchat !== false,
    showNewMember: visibility.categories.guard !== false,
    showGift: visibility.categories.gift !== false,
    hostShowFreeGift: visibility.children.free !== false,
    hostShowNormalGift: visibility.children.normal !== false,
    showGiftInfo: settings.showGiftInfo !== false,
    mergeSimilarDanmaku: false,
    mergeGift: false,
    danmakuAtBottom: host.direction !== "top",
    tickerAtButtom: false,
    maxNumber: Math.max(20, Math.floor(host.maxNumber ?? 60)),
    fadeOutNum: 0,
    pinTime: 0,
    showLike: visibility.categories.interaction !== false && visibility.children.like !== false,
    blockMedalLevel: 0,
    minDanmakuInterval: DEFAULT_OPENLIVE_SETTINGS.minDanmakuInterval,
    maxDanmakuInterval: DEFAULT_OPENLIVE_SETTINGS.maxDanmakuInterval,
    emoticonSize: Number.isFinite(settings.emoticonSize) && Number(settings.emoticonSize) > 0 ? Math.floor(Number(settings.emoticonSize)) : DEFAULT_OPENLIVE_SETTINGS.emoticonSize,
  };
}
