import { getUiLanguage } from './index.ts';

/** 五级时长：精简格式最多两个非零单位，完整格式保留全部非零单位。年按365天换算。 */
export function formatRemainingDuration(milliseconds: number, full = false, locale = getUiLanguage()): string {
  let seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const units = [['year', 365 * 86400], ['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1]] as const;
  const parts: string[] = [];
  for (const [unit, length] of units) {
    const value = Math.floor(seconds / length);
    seconds %= length;
    if (value > 0) parts.push(new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: locale.startsWith('zh') ? 'short' : 'long', useGrouping: false }).format(value));
    if (!full && parts.length === 2) break;
  }
  return parts.join(/^(zh|ja)/.test(locale) ? '' : ', ');
}
