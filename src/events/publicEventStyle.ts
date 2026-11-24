import { MsgType, type DanmakuEvent, type DanmakuUser } from "../protocol/types";
import { getGiftKind, getInteractKind } from "./eventView";

export function publicGuardLevel(level: number): number {
  return level === 1 ? 3 : level === 3 ? 1 : level;
}

export function publicGuardPurchaseLevel(event: DanmakuEvent): number | undefined {
  const level = event.msgType === MsgType.GuardBuy ? event.guard?.level : undefined;
  return level === 1 || level === 2 || level === 3 ? publicGuardLevel(level) : undefined;
}

export function publicGuardPurchaseClass(event: DanmakuEvent): string {
  const level = publicGuardPurchaseLevel(event);
  return level === undefined ? "" : `guard-purchase-level-${level}`;
}

export function publicIdentityClasses(user?: Pick<DanmakuUser, "guardLevel" | "isAnchor" | "isAdmin">): string {
  return [
    user?.guardLevel ? `guard-level-${publicGuardLevel(user.guardLevel)}` : "",
    user?.isAnchor ? "streamer" : "",
    user?.isAdmin ? "mod" : "",
  ].filter(Boolean).join(" ");
}

export function publicEventClass(event: DanmakuEvent): string {
  switch (event.msgType) {
    case MsgType.Danmu:
      return `type-chat${event.isAutoDanmaku === true ? " chat-auto" : ""}${event.user?.phoneVerified === false ? " chat-phone-unverified" : ""}`;
    case MsgType.Gift:
      return `type-gift gift-${getGiftKind(event)}`;
    case MsgType.SuperChat:
      return "type-superchat";
    case MsgType.GuardBuy:
      return "type-guard";
    case MsgType.GuardHonor:
      return "type-guard-honor";
    case MsgType.Interact: {
      const kind = getInteractKind(event);
      const suffix = kind === "specialFollow" ? "special-follow" : kind === "mutualFollow" ? "mutual-follow" : kind;
      return `type-interaction${suffix ? ` interact-${suffix}` : ""}`;
    }
    case MsgType.EntryEffect:
      return "type-interaction interact-entry-effect";
    case MsgType.AnchorLotStart:
      return "type-lottery lottery-start";
    case MsgType.AnchorLotAward:
      return "type-lottery lottery-result";
    case MsgType.RedPocketStart:
      return "type-redpocket redpocket-start";
    case MsgType.RedPocketWinner:
      return "type-redpocket redpocket-result";
    case MsgType.Recall:
      return "";
    case MsgType.RoomBlock:
      return "type-system system-user-block";
    case MsgType.RoomSilent: {
      const action = event.roomSilent?.action;
      return `type-system system-room-silent${action === "on" || action === "off" ? ` system-room-silent-${action}` : ""}`;
    }
    case MsgType.AdminChange: {
      const state = event.adminAction && { appoint: "appointed", revoke: "revoked", list: "list-updated" }[event.adminAction];
      return `type-system system-admin-change${state ? ` system-admin-${state}` : ""}`;
    }
    case MsgType.RoomChange:
      return "type-system system-room-change";
    case MsgType.CoverAudit:
      return "type-system system-cover-audit";
    case MsgType.LiveStart:
      return "type-live-status live-start";
    case MsgType.LiveEnd:
      return "type-live-status live-end";
    case MsgType.Warning:
      return "type-live-status live-warning";
    case MsgType.CutOff:
      return "type-live-status live-cutoff";
    case MsgType.Unknown:
      return "type-unknown";
    default:
      return "";
  }
}

export function publicWindowAreaClass(kind: "display" | "gift" | "gift-only" | "superchat" | "guard"): string {
  return `theme-surface theme-target-windows event-area window ${kind === "display" ? "window-chat" : "window-pay"}`;
}
