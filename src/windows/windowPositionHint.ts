import { localized, uiText } from "../i18n/index.ts";
import type { WindowAppearanceSettings } from '../windowAppearance.ts';

export const EVENT_WINDOW_NAMES = localized(() => ({ display:uiText("common.chatWindow"), gift:uiText("common.revenueWindow"), 'gift-only':uiText("windowPositionHint.EVENT_WINDOW_NAMES.giftonly"), superchat:uiText("windowPositionHint.EVENT_WINDOW_NAMES.superchat"), guard:uiText("windowPositionHint.EVENT_WINDOW_NAMES.guard") }));

export function shouldShowWindowPositionHint(material: WindowAppearanceSettings['material'], locked: boolean | null, locating: boolean) {
  return locating || (material === 'transparent' && locked === false);
}

export function createWindowPositionHint(onChange: (visible: boolean) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };
  return {
    locate() { cancel(); onChange(true); timer = setTimeout(() => { timer = undefined; onChange(false); }, 3000); },
    clear() { cancel(); onChange(false); },
    dispose: cancel,
  };
}
