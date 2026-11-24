import { uiText } from "../../i18n/index.ts";
/** 开放版的既有设置默认值，与 BLC 原版独立。 */
export const DEFAULT_OPENLIVE_SETTINGS = Object.freeze({
  skin: 'none',
  minGiftPrice: 0,
  minTickerPrice: 0.1,
  showDanmaku: true,
  showSuperchat: true,
  showNewMember: true,
  showGift: true,
  showGiftInfo: true,
  mergeSimilarDanmaku: false,
  mergeGift: true,
  danmakuAtBottom: true,
  tickerAtButtom: false,
  maxNumber: 30,
  fadeOutNum: 3,
  pinTime: 0,
  showLike: false,
  blockMedalLevel: 0,
  minDanmakuInterval: 400,
  maxDanmakuInterval: 1200,
  emoticonSize: 80,
});
export type OpenLiveSettings = { -readonly [K in keyof typeof DEFAULT_OPENLIVE_SETTINGS]:
  typeof DEFAULT_OPENLIVE_SETTINGS[K] extends boolean ? boolean : typeof DEFAULT_OPENLIVE_SETTINGS[K] extends number ? number : string };
export type OpenLiveSettingKey = keyof OpenLiveSettings;
export const OPENLIVE_SETTING_KEYS = Object.freeze(Object.keys(DEFAULT_OPENLIVE_SETTINGS) as OpenLiveSettingKey[]);
export const OPENLIVE_SETTING_LABELS: Record<OpenLiveSettingKey, string> = {
  skin: uiText("settings.OPENLIVE_SETTING_LABELS.skin"), minGiftPrice: uiText("settings.OPENLIVE_SETTING_LABELS.minGiftPrice"), minTickerPrice: uiText("settings.OPENLIVE_SETTING_LABELS.minTickerPrice"),
  showDanmaku: uiText("settings.OPENLIVE_SETTING_LABELS.showDanmaku"), showSuperchat: uiText("settings.OPENLIVE_SETTING_LABELS.showSuperchat"), showNewMember: uiText("settings.OPENLIVE_SETTING_LABELS.showNewMember"),
  showGift: uiText("settings.OPENLIVE_SETTING_LABELS.showGift"), showGiftInfo: uiText("settings.OPENLIVE_SETTING_LABELS.showGiftInfo"), mergeSimilarDanmaku: uiText("settings.OPENLIVE_SETTING_LABELS.mergeSimilarDanmaku"),
  mergeGift: uiText("settings.OPENLIVE_SETTING_LABELS.mergeGift"), danmakuAtBottom: uiText("settings.OPENLIVE_SETTING_LABELS.danmakuAtBottom"), tickerAtButtom: uiText("settings.OPENLIVE_SETTING_LABELS.tickerAtButtom"),
  maxNumber: uiText("settings.OPENLIVE_SETTING_LABELS.maxNumber"), fadeOutNum: uiText("settings.OPENLIVE_SETTING_LABELS.fadeOutNum"), pinTime: uiText("settings.OPENLIVE_SETTING_LABELS.pinTime"),
  showLike: uiText("settings.OPENLIVE_SETTING_LABELS.showLike"), blockMedalLevel: uiText("settings.OPENLIVE_SETTING_LABELS.blockMedalLevel"),
  minDanmakuInterval: uiText("settings.OPENLIVE_SETTING_LABELS.minDanmakuInterval"), maxDanmakuInterval: uiText("settings.OPENLIVE_SETTING_LABELS.maxDanmakuInterval"),
  emoticonSize: uiText("settings.OPENLIVE_SETTING_LABELS.emoticonSize"),
};

/** The upstream bool parser does not trim strings. */
export function coerceOpenLiveBoolean(value: unknown): boolean {
  return typeof value === 'string'
    ? !['false', 'no', 'off', '0', ''].includes(value.toLowerCase())
    : Boolean(value);
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function parseStorage(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string') return record(value);
  try { return record(JSON.parse(value)); } catch { return {}; }
}
export type OpenLiveQuery = URLSearchParams | Record<string, unknown>;

/** Room precedence: localStorage.config, then nonempty query, then default
 * whitelist/type coercion. No UI clamp is applied, including negative values,
 * numeric prefixes, fractional integer inputs or float Infinity.
 * D05: approved size fix consumes this setting rather than reading URL again. */
export function parseOpenLiveSettings(localConfig: unknown = {}, query: OpenLiveQuery = {}): OpenLiveSettings {
  const values = { ...parseStorage(localConfig) };
  const entries = query instanceof URLSearchParams ? query.entries() : Object.entries(record(query));
  for (const [key, value] of entries) if (value !== '') values[key] = value;
  const settings: OpenLiveSettings = { ...DEFAULT_OPENLIVE_SETTINGS };
  for (const key of OPENLIVE_SETTING_KEYS) {
    const fallback = DEFAULT_OPENLIVE_SETTINGS[key];
    const value = Object.prototype.hasOwnProperty.call(values, key) ? values[key] : fallback;
    let parsed: unknown;
    if (typeof fallback === 'boolean') parsed = coerceOpenLiveBoolean(value);
    else if (typeof fallback === 'number') {
      const number = key === 'minGiftPrice' || key === 'minTickerPrice'
        ? Number.parseFloat(String(value)) : Number.parseInt(String(value));
      parsed = Number.isNaN(number) ? fallback : number;
    } else parsed = value == null ? fallback : String(value);
    (settings as Record<string, unknown>)[key] = parsed;
  }
  return settings;
}
export const coerceOpenLiveSettings = parseOpenLiveSettings;

/** Host controls validate separately. This never changes Room URL parsing. */
export function validateOpenLiveSetting(key: OpenLiveSettingKey, value: unknown): string | null {
  const fallback = DEFAULT_OPENLIVE_SETTINGS[key];
  if (typeof fallback === 'boolean') return typeof value === 'boolean' ? null : uiText("settings.validateOpenLiveSetting");
  if (key === 'skin') return value === 'none' || value === 'default' ? null : uiText("settings.validateOpenLiveSetting2");
  if (typeof value !== 'number' || !Number.isFinite(value)) return uiText("settings.validateOpenLiveSetting3");
  if (value < 0) return uiText("settings.validateOpenLiveSetting4");
  if (key !== 'minGiftPrice' && key !== 'minTickerPrice' && !Number.isSafeInteger(value)) return uiText("settings.validateOpenLiveSetting5");
  if ((key === 'maxNumber' || key === 'emoticonSize') && value < 1) return uiText("settings.validateOpenLiveSetting6");
  return null;
}

/** Preview constructor boundary only; does not clamp stored/query settings. */
export function openLivePreviewIntervals(settings: Pick<OpenLiveSettings, 'minDanmakuInterval' | 'maxDanmakuInterval'>) {
  return { min: settings.minDanmakuInterval, max: Math.max(settings.minDanmakuInterval, settings.maxDanmakuInterval) };
}
