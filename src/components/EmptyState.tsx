import { uiText } from "../i18n/index.ts";
/**
 * 空状态（已登录未连接，ui-design §四/§七）：行动邀请 + 弹幕漂移背景
 */
import { DriftBackground } from "./DriftBackground";

export function EmptyState() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-bg">
      <DriftBackground />
      <p className="relative ui-type-display font-display text-t2">{uiText("emptyState.EmptyState")}</p>
    </div>
  );
}
