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
  minGiftPrice: '最低礼物价格（元）', showDanmaku: '显示弹幕', showGift: '显示礼物',
  showGiftName: '显示礼物名称与数量', mergeSimilarDanmaku: '合并相似弹幕', mergeGift: '合并礼物',
  maxNumber: '最多显示消息数', blockGiftDanmaku: '屏蔽礼物弹幕', blockMirrorMessages: '屏蔽跨房弹幕',
  blockLevel: '屏蔽用户等级低于', blockNewbie: '屏蔽新注册用户', blockNotMobileVerified: '屏蔽非正式会员',
  blockMedalLevel: '屏蔽粉丝牌等级低于', showDebugMessages: '显示调试消息', importPresetCss: '导入预设 CSS',
  templateUrl: '模板地址',
};
/** Extension UI validates explicitly; upstream URL parsing stays a separate reference contract. */
export function validateSetting(key: SettingKey, value: unknown): string | null {
  const defaultValue = DEFAULT_BLIVECHAT_SETTINGS[key];
  if (typeof defaultValue === 'boolean') return typeof value === 'boolean' ? null : '请选择开关状态';
  if (key === 'templateUrl') {
    if (typeof value !== 'string') return '请输入模板地址';
    if (!value) return null;
    try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? null : '模板地址须为 HTTP 或 HTTPS'; }
    catch { return '请输入完整的 HTTP 或 HTTPS 模板地址'; }
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return '请输入有效数字';
  if (value < (key === 'maxNumber' ? 1 : 0)) return key === 'maxNumber' ? '消息数至少为 1' : '数值不能小于 0';
  if (key !== 'minGiftPrice' && !Number.isSafeInteger(value)) return '请输入整数';
  if (key === 'blockLevel' && value > 60) return '用户等级范围为 0–60';
  if (key === 'blockMedalLevel' && value > 120) return '粉丝牌等级范围为 0–120';
  return null;
}
