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
export const LAPLACE_SETTING_LABELS: Record<LaplaceSettingKey, string> = {
  "showDanmaku": "显示弹幕",
  "showGift": "显示礼物",
  "showSuperChat": "显示醒目留言",
  "showToast": "显示大航海事件",
  "showRedEnvelop": "显示红包",
  "showLottery": "显示天选时刻",
  "showSystemMessage": "显示系统消息",
  "showEnterEvent": "显示用户进入",
  "showFollowEvent": "显示关注等互动",
  "showPhoneNotVerified": "显示未手机验证用户",
  "showAutoDanmaku": "显示自动弹幕",
  "showGiftFree": "显示免费礼物",
  "showEnterEventCurrentGuardOnly": "只显示大航海用户进入",
  "showUsername": "用户名",
  "showAvatar": "用户头像",
  "showAvatarFrame": "头像框",
  "showGuardBadge": "大航海标记",
  "showMedal": "粉丝勋章",
  "showMedalLightenedOnly": "只显已点亮粉丝勋章",
  "showWealthMedal": "荣耀勋章",
  "showCurrentRank": "当前榜单名次",
  "showModBadge": "房管标记",
  "showSpoiler": "剧透内容处理",
  "showStickyBar": "显示置顶栏",
  "showGiftPriceAbove": "最低显示金额",
  "showGiftHighlightAbove": "礼物高亮金额",
  "showGiftStickyAbove": "置顶最低金额",
  "limitEventAmount": "最大显示数量",
  "limitStickyAmount": "最大置顶数量",
  "baseFontSize": "基础字号",
  "colorScheme": "浅色和深色",
  "sceneName": "场景名称",
  "roomIds": "房间列表",
  "cloudTheme": "内置模板名称",
  "remoteTheme": "远程模板地址"
};
/** Source UI constraints, not upstream URL/runtime coercion constraints. Step is a
 * spinner increment, not an integer validator. Number(value) preserves decimals. */
export const LAPLACE_NUMERIC_RULES = {
  showGiftPriceAbove: { min: 0, max: 99999999, step: 1, unit: '元' },
  showGiftHighlightAbove: { min: 0, max: 99999999, step: 1, unit: '元' },
  showGiftStickyAbove: { min: 0, max: 99999999, step: 1, unit: '元' },
  limitEventAmount: { min: 1, max: 80, step: 1, unit: '条' },
  limitStickyAmount: { min: 1, max: 100, step: 1, unit: '条' },
  // Host-approved editor policy: finite 12–64, including decimals. Original UI uses step=1.
  baseFontSize: { min: 12, max: 64, step: 'any', unit: 'px' },
} as const;
export type LaplaceNumericKey = keyof typeof LAPLACE_NUMERIC_RULES;
export function validateLaplaceSetting(key: LaplaceSettingKey, value: unknown): string | null {
  if (key in LAPLACE_NUMERIC_RULES) {
    const { min, max } = LAPLACE_NUMERIC_RULES[key as LaplaceNumericKey];
    if (typeof value !== 'number' || !Number.isFinite(value)) return '请输入有效数字';
    return value < min || value > max ? `请输入 ${min}–${max} 范围内的数值` : null;
  }
  if (typeof DEFAULT_LAPLACE_SETTINGS[key] === 'boolean') return typeof value === 'boolean' ? null : '请选择开关状态';
  if (key === 'colorScheme') return value === 'light' || value === 'dark' ? null : '请选择浅色或深色';
  if (key === 'roomIds') return Array.isArray(value) && value.length <= 100 && value.every(id => typeof id === 'string' && id.length <= 100) ? null : '来源列表无效';
  if (key === 'remoteTheme' && value === undefined) return null;
  return typeof value === 'string' && value.length <= 8192 ? null : '请输入有效文本';
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
