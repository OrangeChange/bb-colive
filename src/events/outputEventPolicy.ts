import { MsgType, type DanmakuEvent } from '../protocol/types.ts';
import type { EventWindowPreferences } from '../windows/eventWindowPreferences.ts';
import { isStatisticsEvent, isHiddenEvent } from './eventView.ts';
import { isAllowedByAudienceFilters } from './audienceFilters.ts';
import { shouldShowAutoDanmaku, shouldShowPhoneNotVerified } from '../eventDisplaySettings.ts';
import { isDisplayWindowEventVisible } from '../eventFilterSettings.ts';
import { isGiftWindowEventVisible } from '../windows/giftWindowModel.ts';
import { sceneCategoryAllows } from '../themes/themeEventVisibility.ts';
import { DEFAULT_EVENT_FILTERS } from './eventView.ts';

export interface OutputEventContext {
  preferences: EventWindowPreferences;
  roomId: number;
  allowsMain?: (event: DanmakuEvent) => boolean;
  allowsSticky?: (event: DanmakuEvent) => boolean;
}

export function resolveOutputEventNeeds(event: DanmakuEvent, context: OutputEventContext) {
  const { preferences: p, roomId } = context;
  const categoryAllowed = sceneCategoryAllows(event, p.sceneFilters);
  const shared = event.roomId === roomId && !isStatisticsEvent(event) && !isHiddenEvent(event)
    && categoryAllowed
    && isAllowedByAudienceFilters(event, p.audienceFilters, roomId)
    && shouldShowAutoDanmaku(event, p.display.showAutoDanmaku)
    && shouldShowPhoneNotVerified(event, p.display.showPhoneNotVerified)
    && isGiftWindowEventVisible(event, 0, p.giftThresholdMode, p.display.onlyGuardEntry);
  return {
    main: shared && (context.allowsMain?.(event) ?? true)
      && ((event.msgType !== MsgType.Danmu && event.msgType !== MsgType.Interact)
        || isDisplayWindowEventVisible(event, { ...p.displayFilters, interactKinds: DEFAULT_EVENT_FILTERS.left.interactKinds }, p.display.showPhoneNotVerified))
      && isGiftWindowEventVisible(event, p.giftThreshold, p.giftThresholdMode, p.display.onlyGuardEntry),
    sticky: shared && (context.allowsSticky?.(event) ?? true),
    effect: shared && ((p.showGiftEffect && event.msgType === MsgType.Gift) || (!!p.showGuardEffect && (event.msgType === MsgType.GuardBuy || event.msgType === MsgType.GuardHonor))),
  };
}
import { getGiftKind, getInteractKind } from './eventView.ts';
import type { NativeEventVisibility } from '../themes/nativeComponentAppearance.ts';

/** 原生事件级开关；部件显隐和手写 CSS 不参与容量判断。 */
export function createNativeEventVisibilityPredicate(visibility?: Partial<NativeEventVisibility>) {
  const categories = visibility?.categories ?? {}, children = visibility?.children ?? {};
  return (event: DanmakuEvent): boolean => {
    let category: string | undefined, child: string | undefined;
    switch (event.msgType) {
      case MsgType.Danmu: category = 'danmaku'; break;
      case MsgType.Interact: category = 'interaction'; child = getInteractKind(event); if (child === 'entry') child = 'enter'; break;
      case MsgType.EntryEffect: category = 'interaction'; child = 'enter'; break;
      case MsgType.Gift: category = 'gift'; child = getGiftKind(event) ?? undefined; break;
      case MsgType.SuperChat: category = 'superchat'; break;
      case MsgType.GuardBuy: case MsgType.GuardHonor: category = 'guard'; break;
      case MsgType.RedPocketStart: case MsgType.RedPocketWinner: category = 'gift'; child = 'redpocket'; break;
      case MsgType.AnchorLotStart: case MsgType.AnchorLotAward: category = 'gift'; child = 'lottery'; break;
      case MsgType.LiveStart: case MsgType.LiveEnd: category = 'system'; child = 'liveStatus'; if (children[event.msgType === MsgType.LiveStart ? 'liveStart' : 'liveEnd'] === false) return false; break;
      case MsgType.RoomBlock: category = 'system'; child = 'userMute'; break;
      case MsgType.RoomSilent: category = 'system'; child = 'roomMute'; break;
      case MsgType.AdminChange: category = 'system'; child = 'admin'; break;
      case MsgType.RoomChange: category = 'system'; child = 'roomChange'; break;
      case MsgType.Warning: case MsgType.CutOff: case MsgType.RoomLock: category = 'system'; child = 'warning'; break;
      case MsgType.Recall: return false;
    }
    return (!category || categories[category] !== false) && (!child || children[child] !== false);
  };
}
