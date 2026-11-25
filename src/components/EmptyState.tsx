import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";
/**
 * 空状态（已登录未连接，ui-design §四/§七）：行动邀请 + 弹幕漂移背景
 */
import { DriftBackground } from "./DriftBackground";

export function EmptyState() {
  const language = useUiLanguage();
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-bg">
      <DriftBackground />
      <p style={language === "ja" ? { fontFamily: '"RocknRoll One", var(--font-ui)' } : language === "zh-Hant" ? { fontFamily: '"Chuan Qu", var(--font-ui)' } : undefined} className={`relative ui-type-display text-t2${language === "zh-CN" || language === "en" ? " font-display" : ""}`}>{uiText("emptyState.EmptyState")}</p>
    </div>
  );
}
