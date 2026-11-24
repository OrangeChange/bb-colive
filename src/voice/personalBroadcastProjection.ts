import { MsgType, type DanmakuEvent } from "../protocol/types.ts";
import type { PersonalBroadcastRuleKey } from "./personalBroadcastTypes.ts";

export function getPersonalBroadcastRuleKey(
  event: DanmakuEvent,
  onlyGuardEntry: boolean,
): PersonalBroadcastRuleKey | null {
  switch (event.msgType) {
    case MsgType.Interact:
      switch (event.interactKind) {
        case "entry":
          if ((event.user?.guardLevel ?? 0) > 0) return "interact-guard-entry";
          return onlyGuardEntry ? null : "interact-entry";
        case "follow": return "interact-follow";
        case "share": return "interact-share";
        case "specialFollow": return "interact-special-follow";
        case "mutualFollow": return "interact-mutual-follow";
        case "like": return "interact-like";
        default: return null;
      }
    case MsgType.Gift:
      return event.gift?.blindGiftName ? "blind-box" : "gift";
    case MsgType.RedPocketStart:
      return "red-pocket-start";
    case MsgType.AnchorLotStart:
      return "anchor-lottery-start";
    case MsgType.SuperChat:
      return "super-chat";
    case MsgType.GuardBuy:
      switch (event.guard?.level) {
        case 1: return "guard-captain";
        case 2: return "guard-admiral";
        case 3: return "guard-governor";
        default: return null;
      }
    case MsgType.Warning:
      return "system-warning";
    case MsgType.CutOff:
      return "system-cut-off";
    default:
      return null;
  }
}
