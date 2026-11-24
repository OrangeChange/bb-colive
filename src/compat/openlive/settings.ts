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
  skin: '普通皮肤', minGiftPrice: '主列表最低礼物 / 上舰 / SC 价格（元）', minTickerPrice: '置顶条最低价格（元）',
  showDanmaku: '显示弹幕', showSuperchat: '显示醒目留言', showNewMember: '显示上舰消息',
  showGift: '显示礼物', showGiftInfo: '显示礼物名称与数量', mergeSimilarDanmaku: '合并相似弹幕',
  mergeGift: '合并礼物', danmakuAtBottom: '弹幕置底', tickerAtButtom: '置顶条置底',
  maxNumber: '显示消息数', fadeOutNum: '渐隐保留条数', pinTime: '主列表停留时间（秒，0 不定时移除）',
  showLike: '显示点赞', blockMedalLevel: '屏蔽粉丝牌等级低于',
  minDanmakuInterval: '预览最短间隔（毫秒）', maxDanmakuInterval: '预览最长间隔（毫秒）',
  emoticonSize: '大表情大小（像素）',
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
  if (typeof fallback === 'boolean') return typeof value === 'boolean' ? null : '请选择开关状态';
  if (key === 'skin') return value === 'none' || value === 'default' ? null : '请选择已纳入的普通皮肤';
  if (typeof value !== 'number' || !Number.isFinite(value)) return '请输入有效数字';
  if (value < 0) return '数值不能小于 0';
  if (key !== 'minGiftPrice' && key !== 'minTickerPrice' && !Number.isSafeInteger(value)) return '请输入整数';
  if ((key === 'maxNumber' || key === 'emoticonSize') && value < 1) return '数值至少为 1';
  return null;
}

/** Preview constructor boundary only; does not clamp stored/query settings. */
export function openLivePreviewIntervals(settings: Pick<OpenLiveSettings, 'minDanmakuInterval' | 'maxDanmakuInterval'>) {
  return { min: settings.minDanmakuInterval, max: Math.max(settings.minDanmakuInterval, settings.maxDanmakuInterval) };
}
