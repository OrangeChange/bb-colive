import { localized, uiText } from "../../i18n/index.ts";
/** Fixed Stable #238 defaults, restricted to the approved 35-setting contract.
 * roomIds is supplied by BB; the upstream sample room must never start a connection.
 */
export const DEFAULT_LAPLACE_SETTINGS = {
  showDanmaku: true,
  showGift: true,
  showSuperChat: true,
  showToast: true,
  showRedEnvelop: true,
  showLottery: true,
  showSystemMessage: true,
  showEnterEvent: false,
  showFollowEvent: false,
  showPhoneNotVerified: false,
  showAutoDanmaku: false,
  showGiftFree: false,
  showEnterEventCurrentGuardOnly: false,
  showUsername: true,
  showAvatar: true,
  showAvatarFrame: true,
  showGuardBadge: true,
  showMedal: false,
  showMedalLightenedOnly: true,
  showWealthMedal: false,
  showCurrentRank: false,
  showModBadge: true,
  showSpoiler: true,
  showStickyBar: true,
  showGiftPriceAbove: 1,
  showGiftHighlightAbove: 30,
  showGiftStickyAbove: 29.99,
  limitEventAmount: 50,
  limitStickyAmount: 10,
  baseFontSize: 20,
  colorScheme: 'light' as 'light' | 'dark',
  sceneName: "",
  roomIds: [] as string[],
  cloudTheme: "",
  remoteTheme: undefined as string | undefined,
};
export type LaplaceSettings = typeof DEFAULT_LAPLACE_SETTINGS;
export type LaplaceSettingKey = keyof LaplaceSettings;
export const LAPLACE_SETTING_KEYS = Object.keys(DEFAULT_LAPLACE_SETTINGS) as LaplaceSettingKey[];
export const EXCLUDED_LAPLACE_SETTING_KEYS = ["showNotice", "useCst", "uiLang", "roomSearchHistory", "connectionMode", "danmakuFetcherApi", "eventFetcherAuth", "loginSyncToken", "remoteEmotesApi", "enableCloudTheme", "showGiftEffect", "showGiftEffectAbove"] as const;
export const LAPLACE_SETTING_LABELS: Record<LaplaceSettingKey, string> = localized(() => ({
  "showDanmaku": uiText("settings.LAPLACE_SETTING_LABELS.showDanmaku"),
  "showGift": uiText("settings.LAPLACE_SETTING_LABELS.showGift"),
  "showSuperChat": uiText("settings.LAPLACE_SETTING_LABELS.showSuperChat"),
  "showToast": uiText("settings.LAPLACE_SETTING_LABELS.showToast"),
  "showRedEnvelop": uiText("settings.LAPLACE_SETTING_LABELS.showRedEnvelop"),
  "showLottery": uiText("settings.LAPLACE_SETTING_LABELS.showLottery"),
  "showSystemMessage": uiText("settings.LAPLACE_SETTING_LABELS.showSystemMessage"),
  "showEnterEvent": uiText("settings.LAPLACE_SETTING_LABELS.showEnterEvent"),
  "showFollowEvent": uiText("settings.LAPLACE_SETTING_LABELS.showFollowEvent"),
  "showPhoneNotVerified": uiText("settings.LAPLACE_SETTING_LABELS.showPhoneNotVerified"),
  "showAutoDanmaku": uiText("settings.LAPLACE_SETTING_LABELS.showAutoDanmaku"),
  "showGiftFree": uiText("settings.LAPLACE_SETTING_LABELS.showGiftFree"),
  "showEnterEventCurrentGuardOnly": uiText("settings.LAPLACE_SETTING_LABELS.showEnterEventCurrentGuardOnly"),
  "showUsername": uiText("settings.LAPLACE_SETTING_LABELS.showUsername"),
  "showAvatar": uiText("settings.LAPLACE_SETTING_LABELS.showAvatar"),
  "showAvatarFrame": uiText("settings.LAPLACE_SETTING_LABELS.showAvatarFrame"),
  "showGuardBadge": uiText("settings.LAPLACE_SETTING_LABELS.showGuardBadge"),
  "showMedal": uiText("settings.LAPLACE_SETTING_LABELS.showMedal"),
  "showMedalLightenedOnly": uiText("settings.LAPLACE_SETTING_LABELS.showMedalLightenedOnly"),
  "showWealthMedal": uiText("settings.LAPLACE_SETTING_LABELS.showWealthMedal"),
  "showCurrentRank": uiText("settings.LAPLACE_SETTING_LABELS.showCurrentRank"),
  "showModBadge": uiText("settings.LAPLACE_SETTING_LABELS.showModBadge"),
  "showSpoiler": uiText("settings.LAPLACE_SETTING_LABELS.showSpoiler"),
  "showStickyBar": uiText("settings.LAPLACE_SETTING_LABELS.showStickyBar"),
  "showGiftPriceAbove": uiText("settings.LAPLACE_SETTING_LABELS.showGiftPriceAbove"),
  "showGiftHighlightAbove": uiText("settings.LAPLACE_SETTING_LABELS.showGiftHighlightAbove"),
  "showGiftStickyAbove": uiText("settings.LAPLACE_SETTING_LABELS.showGiftStickyAbove"),
  "limitEventAmount": uiText("settings.LAPLACE_SETTING_LABELS.limitEventAmount"),
  "limitStickyAmount": uiText("settings.LAPLACE_SETTING_LABELS.limitStickyAmount"),
  "baseFontSize": uiText("settings.LAPLACE_SETTING_LABELS.baseFontSize"),
  "colorScheme": uiText("settings.LAPLACE_SETTING_LABELS.colorScheme"),
  "sceneName": uiText("settings.LAPLACE_SETTING_LABELS.sceneName"),
  "roomIds": uiText("settings.LAPLACE_SETTING_LABELS.roomIds"),
  "cloudTheme": uiText("settings.LAPLACE_SETTING_LABELS.cloudTheme"),
  "remoteTheme": uiText("settings.LAPLACE_SETTING_LABELS.remoteTheme")
}));
/** Source UI constraints, not upstream URL/runtime coercion constraints. Step is a
 * spinner increment, not an integer validator. Number(value) preserves decimals. */
export const LAPLACE_NUMERIC_RULES = localized(() => ({
  showGiftPriceAbove: { min: 0, max: 99999999, step: 1, unit: uiText("settings.LAPLACE_NUMERIC_RULES.showGiftPriceAbove.unit") },
  showGiftHighlightAbove: { min: 0, max: 99999999, step: 1, unit: uiText("settings.LAPLACE_NUMERIC_RULES.showGiftHighlightAbove.unit") },
  showGiftStickyAbove: { min: 0, max: 99999999, step: 1, unit: uiText("settings.LAPLACE_NUMERIC_RULES.showGiftStickyAbove.unit") },
  limitEventAmount: { min: 1, max: 80, step: 1, unit: uiText("settings.LAPLACE_NUMERIC_RULES.limitEventAmount.unit") },
  limitStickyAmount: { min: 1, max: 100, step: 1, unit: uiText("settings.LAPLACE_NUMERIC_RULES.limitStickyAmount.unit") },
  // Host-approved editor policy: finite 12–64, including decimals. Original UI uses step=1.
  baseFontSize: { min: 12, max: 64, step: 'any', unit: 'px' },
} as const));
export type LaplaceNumericKey = keyof typeof LAPLACE_NUMERIC_RULES;
export function validateLaplaceSetting(key: LaplaceSettingKey, value: unknown): string | null {
  if (key in LAPLACE_NUMERIC_RULES) {
    const { min, max } = LAPLACE_NUMERIC_RULES[key as LaplaceNumericKey];
    if (typeof value !== 'number' || !Number.isFinite(value)) return uiText("settings.validateLaplaceSetting");
    return value < min || value > max ? uiText("settings.validateLaplaceSetting2", { min: min, max: max }) : null;
  }
  if (typeof DEFAULT_LAPLACE_SETTINGS[key] === 'boolean') return typeof value === 'boolean' ? null : uiText("settings.validateLaplaceSetting3");
  if (key === 'colorScheme') return value === 'light' || value === 'dark' ? null : uiText("settings.validateLaplaceSetting4");
  if (key === 'roomIds') return Array.isArray(value) && value.length <= 100 && value.every(id => typeof id === 'string' && id.length <= 100) ? null : uiText("settings.validateLaplaceSetting5");
  if (key === 'remoteTheme' && value === undefined) return null;
  return typeof value === 'string' && value.length <= 8192 ? null : uiText("settings.validateLaplaceSetting6");
}
/** Explicit field pick. Excluded or future settings can never cross the frame bridge. */
export function pickLaplaceSettings(input: Partial<LaplaceSettings>): LaplaceSettings {
  const result = { ...DEFAULT_LAPLACE_SETTINGS, roomIds: [...DEFAULT_LAPLACE_SETTINGS.roomIds] };
  for (const key of LAPLACE_SETTING_KEYS) {
    if (Object.prototype.hasOwnProperty.call(input, key) && validateLaplaceSetting(key, input[key]) === null) {
      Object.assign(result, { [key]: key === 'roomIds' ? [...input.roomIds!] : input[key] });
    }
  }
  return result;
}
export function parseLaplaceNumericDraft(raw: string): number {
  return raw.trim() === '' ? Number.NaN : Number(raw);
}
export const LAPLACE_SETTINGS_STORAGE_KEY = 'bb.laplace.settings.v1';
export function readLaplaceSettings(storage: Pick<Storage, 'getItem'>): LaplaceSettings {
  try { const value = JSON.parse(storage.getItem(LAPLACE_SETTINGS_STORAGE_KEY) || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? pickLaplaceSettings(value) : pickLaplaceSettings({}); }
  catch { return pickLaplaceSettings({}); }
}
