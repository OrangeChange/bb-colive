import { MsgType, type DanmakuEvent } from "../protocol/types.ts";
import { isAllowedByOnlyGuardEntry } from "../events/eventView.ts";
import type { VoiceEventCategory, VoiceSettings } from "./voiceTypes.ts";

const SYSTEM_EVENT_TYPES = new Set<MsgType>([
  MsgType.Recall,
  MsgType.ScDeleted,
  MsgType.RoomBlock,
  MsgType.RoomSilent,
  MsgType.AdminChange,
  MsgType.RoomChange,
  MsgType.LiveStart,
  MsgType.LiveEnd,
  MsgType.Warning,
  MsgType.CutOff,
  MsgType.RoomLock,
  MsgType.CoverAudit,
  MsgType.GuardHonor,
]);

export function getVoiceCategory(event: DanmakuEvent): VoiceEventCategory | null {
  switch (event.msgType) {
    case MsgType.Danmu:
      return "danmu";
    case MsgType.Gift:
      return event.gift?.blindGiftName ? "blindBox" : "gift";
    case MsgType.SuperChat:
      return "superChat";
    case MsgType.GuardBuy:
      return "guard";
    case MsgType.Interact:
      return "interact";
    case MsgType.AnchorLotStart:
    case MsgType.AnchorLotAward:
      return "anchorLottery";
    case MsgType.RedPocketStart:
    case MsgType.RedPocketWinner:
      return "redPocket";
    default:
      return SYSTEM_EVENT_TYPES.has(event.msgType) ? "system" : null;
  }
}

export function isVoiceEventEligible(
  event: DanmakuEvent,
  settings: Pick<VoiceSettings, "eventEnabled" | "blockBigEmoteDanmu" | "blockLowPriceSuperChat" | "blockLowPriceGuard">,
  onlyGuardEntry: boolean,
): boolean {
  const category = getVoiceCategory(event);
  if (!category || settings.eventEnabled?.[category] !== true) return false;
  if (event.msgType === MsgType.Danmu && event.emoticon && settings.blockBigEmoteDanmu) return false;
  if (event.msgType === MsgType.SuperChat && settings.blockLowPriceSuperChat && event.sc?.price === 2) return false;
  if (event.msgType === MsgType.GuardBuy && settings.blockLowPriceGuard && event.guard?.unit?.includes("天") === true) return false;
  return isAllowedByOnlyGuardEntry(event, onlyGuardEntry);
}
