import { zhCN } from "./zh-CN.ts";

export type UiMessageKey = keyof typeof zhCN;
type MessageParameters = Readonly<Record<string, unknown>>;

/** 界面目前固定使用简体中文，翻译审核完成后再接入其他语言。 */
export function uiText(key: UiMessageKey, parameters?: MessageParameters): string {
  const text = zhCN[key];
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
