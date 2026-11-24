import { DEFAULT_BLIVECHAT_SETTINGS, type BlivechatSettings } from "./settings.ts";
import { normalizeNativeEventVisibility } from "../../themes/nativeComponentAppearance.ts";

/** 来源公开配置与宿主事件准入分别传递，产品外观由主题 CSS 控制。 */
export function createBlivechatSourceConfig(options: Pick<BlivechatSettings, "showGiftName"> & { eventVisibility?: unknown }): BlivechatSettings & Record<string, unknown> {
  const visibility = normalizeNativeEventVisibility(options.eventVisibility);
  return {
    ...DEFAULT_BLIVECHAT_SETTINGS,
    minGiftPrice: 0,
    showDanmaku: visibility.categories.danmaku !== false,
    showGift: visibility.categories.gift !== false,
    hostEventFilter: true,
    hostShowSuperChat: visibility.categories.superchat !== false,
    hostShowGuard: visibility.categories.guard !== false,
    hostShowFreeGift: visibility.children.free !== false,
    hostShowNormalGift: visibility.children.normal !== false,
    showGiftName: options.showGiftName,
    mergeSimilarDanmaku: false,
    mergeGift: false,
    maxNumber: DEFAULT_BLIVECHAT_SETTINGS.maxNumber,
    blockGiftDanmaku: false,
    blockMirrorMessages: false,
    blockLevel: 0,
    blockNewbie: false,
    blockNotMobileVerified: false,
    blockMedalLevel: 0,
    showDebugMessages: false,
    importPresetCss: false,
    templateUrl: "",
  };
}
