import type { WindowAppearanceSettings } from '../windowAppearance.ts';

export const EVENT_WINDOW_NAMES = { display:'弹幕窗', gift:'收益窗', 'gift-only':'礼物窗', superchat:'醒目留言窗', guard:'大航海窗' };

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
