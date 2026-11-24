import { uiText } from "../../i18n/index.ts";
/** The retained original Home configuration, not BB's common settings mapping. */
export const DEFAULT_BLIVECHAT_SETTINGS = {
  minGiftPrice: 0.1, showDanmaku: true, showGift: true, showGiftName: false,
  mergeSimilarDanmaku: false, mergeGift: true, maxNumber: 60,
  blockGiftDanmaku: true, blockMirrorMessages: false, blockLevel: 0,
  blockNewbie: false, blockNotMobileVerified: false, blockMedalLevel: 0,
  showDebugMessages: false, importPresetCss: false, templateUrl: "",
};
export type BlivechatSettings = typeof DEFAULT_BLIVECHAT_SETTINGS;
export type SettingKey = keyof BlivechatSettings;
export const SETTING_LABELS: Record<SettingKey, string> = {
  minGiftPrice: uiText("settings.SETTING_LABELS.minGiftPrice"), showDanmaku: uiText("settings.SETTING_LABELS.showDanmaku"), showGift: uiText("settings.SETTING_LABELS.showGift"),
  showGiftName: uiText("settings.SETTING_LABELS.showGiftName"), mergeSimilarDanmaku: uiText("settings.SETTING_LABELS.mergeSimilarDanmaku"), mergeGift: uiText("settings.SETTING_LABELS.mergeGift"),
  maxNumber: uiText("settings.SETTING_LABELS.maxNumber"), blockGiftDanmaku: uiText("settings.SETTING_LABELS.blockGiftDanmaku"), blockMirrorMessages: uiText("settings.SETTING_LABELS.blockMirrorMessages"),
  blockLevel: uiText("settings.SETTING_LABELS.blockLevel"), blockNewbie: uiText("settings.SETTING_LABELS.blockNewbie"), blockNotMobileVerified: uiText("settings.SETTING_LABELS.blockNotMobileVerified"),
  blockMedalLevel: uiText("settings.SETTING_LABELS.blockMedalLevel"), showDebugMessages: uiText("settings.SETTING_LABELS.showDebugMessages"), importPresetCss: uiText("settings.SETTING_LABELS.importPresetCss"),
  templateUrl: uiText("settings.SETTING_LABELS.templateUrl"),
};
/** Extension UI validates explicitly; upstream URL parsing stays a separate reference contract. */
export function validateSetting(key: SettingKey, value: unknown): string | null {
  const defaultValue = DEFAULT_BLIVECHAT_SETTINGS[key];
  if (typeof defaultValue === 'boolean') return typeof value === 'boolean' ? null : uiText("settings.validateSetting");
  if (key === 'templateUrl') {
    if (typeof value !== 'string') return uiText("settings.validateSetting2");
    if (!value) return null;
    try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? null : uiText("settings.validateSetting3"); }
    catch { return uiText("settings.validateSetting4"); }
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return uiText("settings.validateSetting5");
  if (value < (key === 'maxNumber' ? 1 : 0)) return key === 'maxNumber' ? uiText("settings.validateSetting6") : uiText("settings.validateSetting7");
  if (key !== 'minGiftPrice' && !Number.isSafeInteger(value)) return uiText("settings.validateSetting8");
  if (key === 'blockLevel' && value > 60) return uiText("settings.validateSetting9");
  if (key === 'blockMedalLevel' && value > 120) return uiText("settings.validateSetting10");
  return null;
}
