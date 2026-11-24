import { createAllNativeEventVisibility, type NativeEventVisibility } from './nativeComponentAppearance.ts';
import { DEFAULT_EVENT_FILTERS, type EventFilterState } from '../events/eventView.ts';
import { MsgType, type DanmakuEvent } from '../protocol/types.ts';

export type EventVisibilityTarget = 'live' | 'windows' | 'obs';

/** 现场不读取主题开关；副窗口读取细项；OBS 读取大类和细项。 */
export function resolveThemeEventVisibility(value: Partial<NativeEventVisibility> | undefined, target: EventVisibilityTarget): NativeEventVisibility {
  const all = createAllNativeEventVisibility();
  return {
    categories: target === 'obs' ? { ...all.categories, ...value?.categories } : all.categories,
    children: target === 'live' ? Object.fromEntries(Object.keys({ ...all.children, ...value?.children }).map(key => [key, true])) : { ...all.children, ...value?.children },
  };
}

/** 副窗口只跟随现场大类，细项由主题控制。 */
export function sceneCategoryFilters(filters: EventFilterState = DEFAULT_EVENT_FILTERS): EventFilterState {
  return {
    left: { ...filters.left, interactKinds: { ...DEFAULT_EVENT_FILTERS.left.interactKinds } },
    right: { ...filters.right, giftKinds: { ...DEFAULT_EVENT_FILTERS.right.giftKinds } },
  };
}

export function sceneCategoryAllows(event: DanmakuEvent, filters?: EventFilterState): boolean {
  if (!filters) return true;
  switch (event.msgType) {
    case MsgType.Danmu: return filters.left.danmu;
    case MsgType.Interact: case MsgType.EntryEffect: return filters.left.interact;
    case MsgType.Gift: case MsgType.RedPocketStart: case MsgType.RedPocketWinner:
    case MsgType.AnchorLotStart: case MsgType.AnchorLotAward: return filters.right.gift;
    case MsgType.SuperChat: return filters.right.superChat;
    case MsgType.GuardBuy: case MsgType.GuardHonor: return filters.right.guard;
    default: return true;
  }
}
