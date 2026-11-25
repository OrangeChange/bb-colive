import { zhCN } from "./zh-CN.ts";
import zhHant from "./zh-Hant.json" with { type: "json" };
import en from "./en.json" with { type: "json" };
import ja from "./ja.json" with { type: "json" };

export type UiMessageKey = keyof typeof zhCN;
type MessageParameters = Readonly<Record<string, unknown>>;
export type UiLanguage = "zh-CN" | "zh-Hant" | "en" | "ja";
export const UI_LANGUAGE_OPTIONS = [
  { value: "zh-CN", label: "简体中文" },
  { value: "zh-Hant", label: "繁體中文" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
] as const;
export const UI_LANGUAGE_STORAGE_KEY = "bb-colive-ui-language";
const catalogs: Record<UiLanguage, Partial<Record<UiMessageKey, string>>> = { "zh-CN": zhCN, "zh-Hant": zhHant, en, ja };
const listeners = new Set<() => void>();
let language: UiLanguage = "zh-CN";

export function normalizeUiLanguage(value: unknown): UiLanguage {
  return UI_LANGUAGE_OPTIONS.some(option => option.value === value) ? value as UiLanguage : "zh-CN";
}

export function getUiLanguage(): UiLanguage { return language; }

export function subscribeUiLanguage(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function setUiLanguage(value: unknown): void {
  const next = normalizeUiLanguage(value);
  if (next === language) return;
  language = next;
  for (const listener of listeners) listener();
}

/** 固定选项就地更新文案，保留已有引用和注册后的能力数据。 */
export function localized<T extends object>(create: () => T): T {
  const value = create();
  const snapshot = (object: object) => object instanceof Map ? new Map(object) : JSON.parse(JSON.stringify(object));
  let previous = snapshot(value);
  const update = (target: any, before: any, after: any) => {
    if (after instanceof Map) {
      for (const [key, text] of after) if (text !== before.get(key)) target.set(key, text);
      return;
    }
    for (const [key, next] of Object.entries(after)) {
      if (typeof next === "string" && next !== before?.[key]) target[key] = next;
      else if (next && typeof next === "object" && target[key] && before?.[key]) update(target[key], before[key], next);
    }
  };
  subscribeUiLanguage(() => {
    const next = create();
    update(value, previous, next);
    previous = snapshot(next);
  });
  return value;
}

export function uiText(key: UiMessageKey, parameters?: MessageParameters): string {
  const text = catalogs[language][key] ?? zhCN[key];
  if (!parameters) return text;
  return text.replace(/\{([A-Za-z_$][\w$]*)\}/g, (placeholder, name: string) =>
    Object.prototype.hasOwnProperty.call(parameters, name) ? String(parameters[name]) : placeholder,
  );
}

/** 需要分支处理的本地错误按稳定标识识别，不依赖显示语言。 */
export class UiMessageError extends Error {
  constructor(readonly messageKey: UiMessageKey, readonly parameters?: MessageParameters) {
    super(uiText(messageKey, parameters));
    this.name = "UiMessageError";
  }
}
