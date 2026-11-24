import { FloatingEventWindow } from "./FloatingEventWindow";

/** 礼物窗复用独立事件窗口的完整交互，只替换为双区右侧事件范围。 */
export function GiftWindow() {
  return <FloatingEventWindow kind="gift" />;
}
