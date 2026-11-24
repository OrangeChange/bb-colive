import { type DanmakuEvent } from '../protocol/types.ts';
import type { NativeEventVisibility } from './nativeComponentAppearance.ts';
import { createNativeEventVisibilityPredicate } from '../events/outputEventPolicy.ts';
import { resolveThemeEventVisibility, type EventVisibilityTarget } from './themeEventVisibility.ts';

/** 先按对应场景选择事件，隐藏事件不生成虚拟行。 */
export function filterNativeFeedIndices(events: DanmakuEvent[], indices: number[], visibility?: NativeEventVisibility, target: EventVisibilityTarget = 'obs'): number[] {
  if (!visibility || target === 'live') return indices;
  const allows = createNativeEventVisibilityPredicate(resolveThemeEventVisibility(visibility, target));
  return indices.filter(index => allows(events[index]));
}
