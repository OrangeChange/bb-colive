import { getUiLanguage } from "./index.ts";

/** 界面外围格式；事件、存储和导出使用各自的原始格式。 */
export function formatUiNumber(
  value: number | null | undefined,
  options?: Intl.NumberFormatOptions,
): string {
  return value == null || !Number.isFinite(value)
    ? "—"
    : new Intl.NumberFormat(getUiLanguage(), options).format(value);
}

export function formatUiCurrency(
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  const unit = uiCurrencyUnit();
  const prefix = unit === "CNY" ? "CNY " : unit;
  return (
    prefix +
    formatUiNumber(value, {
      minimumFractionDigits: value % 1 ? 2 : 0,
      maximumFractionDigits: 2,
      ...options,
    })
  );
}

export function uiCurrencyUnit(): string {
  return getUiLanguage() === "en" || getUiLanguage() === "ja" ? "CNY" : "¥";
}

export function formatUiDateTime(
  value: number | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (value == null) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  const formatter = new Intl.DateTimeFormat(getUiLanguage(), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    ...options,
  });
  if (getUiLanguage() !== "zh-CN") return formatter.format(date);
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}${parts.second ? `:${parts.second}` : ""}`;
}
