const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable="true"]';
const EVENT_SELECTOR = ".event-row";
const EVENT_ACTION_SELECTOR = "button, a";

type ClosestTarget = {
  closest?: (selector: string) => unknown;
};

/** 只有事件正文和可编辑控件允许保留浏览器的文字交互。 */
export function isTextInteractionTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as ClosestTarget).closest !== "function") return false;
  const element = target as ClosestTarget;
  const closest = element.closest as (selector: string) => unknown;
  if (closest.call(element, EDITABLE_SELECTOR)) return true;
  if (closest.call(element, EVENT_ACTION_SELECTOR)) return false;
  return Boolean(closest.call(element, EVENT_SELECTOR));
}

/** 屏蔽非事件/非编辑控件的 WebView 默认右键菜单。 */
export function installInteractionPolicy(documentRef: Document): () => void {
  const handleContextMenu = (event: MouseEvent) => {
    if (!isTextInteractionTarget(event.target)) event.preventDefault();
  };
  documentRef.addEventListener("contextmenu", handleContextMenu);
  return () => documentRef.removeEventListener("contextmenu", handleContextMenu);
}
