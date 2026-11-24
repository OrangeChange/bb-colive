import { MsgType, type DanmakuEvent } from "../protocol/types.ts";
import { normalizeNativeEventVisibility, type NativeEventVisibility } from "./nativeComponentAppearance.ts";
import { NATIVE_EVENT_SCOPES } from "./nativeThemeCapabilities.ts";
import type { CompatibleThemeMode } from "./compatThemeSettings.ts";

export function compatibleEventScopes(mode: CompatibleThemeMode) {
  return NATIVE_EVENT_SCOPES.filter(scope => scope.id !== "all" && (mode === "laplace" || scope.id !== "system" && (scope.id !== "interaction" || mode === "blivechat-open"))).map(scope => ({
    ...scope,
    children: scope.children?.filter(child => scope.id === "interaction" ? mode === "laplace" || child.id === "like"
      : scope.id === "gift" ? mode === "laplace" || ["free", "normal"].includes(child.id)
        : child.id !== "admin"),
  }));
}

export function normalizeCompatibleEventVisibility(mode: CompatibleThemeMode, value: unknown): NativeEventVisibility {
  const visibility = normalizeNativeEventVisibility(value);
  if (mode !== "laplace") return { ...visibility, categories: { ...visibility.categories, interaction: typeof (value as Partial<NativeEventVisibility> | undefined)?.categories?.interaction === "boolean" ? visibility.categories.interaction : true } };
  const sourceChildren = value && typeof value === "object" && !Array.isArray(value)
    ? ((value as Partial<NativeEventVisibility>).children ?? {})
    : {};
  const children = { ...visibility.children };
  for (const key of ["free"]) {
    if (typeof sourceChildren[key] !== "boolean") children[key] = false;
  }
  return { ...visibility, children };
}

export function compatibleVisibilityAllows(value: unknown, category: string, child?: string, mode: CompatibleThemeMode = "blivechat"): boolean {
  const visibility = normalizeCompatibleEventVisibility(mode, value);
  return visibility.categories[category] !== false && (!child || visibility.children[child] !== false);
}

export function isLaplaceThemeSampleVisible(visibility: unknown, event: { type: string; action?: number; coinType?: string; blindGift?: unknown }): boolean {
  const allows = (category: string, child?: string) => compatibleVisibilityAllows(visibility, category, child, "laplace");
  switch (event.type) {
    case "message": case "effect-message": return allows("danmaku");
    case "superchat": return allows("superchat");
    case "toast": return allows("guard");
    case "gift": return allows("gift", event.blindGift ? "blind" : event.coinType === "silver" ? "free" : "normal");
    case "interaction": return allows("interaction", ({ 1: "enter", 2: "follow", 3: "share", 4: "specialFollow", 5: "mutualFollow" } as Record<number, string>)[event.action ?? 0]);
    case "like-click": return allows("interaction", "like");
    case "red-envelope-start": case "red-envelope-result": return allows("gift", "redpocket");
    case "lottery-start": case "lottery-result": return allows("gift", "lottery");
    case "live-start": case "live-end": case "live": return allows("system", "liveStatus");
    case "user-block": return allows("system", "userMute");
    case "room-mute-on": case "room-mute-off": return allows("system", "roomMute");
    case "room-name-update": return allows("system", "roomChange");
    case "live-warning": case "live-cutoff": return allows("system", "warning");
    case "system": return allows("system");
    default: return true;
  }
}

export function laplaceThemeVisibilitySettings(value: unknown): Record<string, boolean> {
  const allows = (category: string, child?: string) => compatibleVisibilityAllows(value, category, child, "laplace");
  return { showDanmaku: allows("danmaku"), showGift: allows("gift"), showGiftFree: allows("gift", "free"), showSuperChat: allows("superchat"), showToast: allows("guard"), showRedEnvelop: allows("gift", "redpocket"), showLottery: allows("gift", "lottery"), showSystemMessage: allows("system"), showEnterEvent: allows("interaction", "enter"), showFollowEvent: ["follow", "share", "specialFollow", "mutualFollow", "like"].some(child => allows("interaction", child)) };
}

export function isCompatibleThemeEventVisible(mode: CompatibleThemeMode, visibility: unknown, event: DanmakuEvent): boolean {
  const allows = (category: string, child?: string) => compatibleVisibilityAllows(visibility, category, child, mode);
  switch (event.msgType) {
    case MsgType.Danmu: return allows("danmaku");
    case MsgType.SuperChat: return allows("superchat");
    case MsgType.GuardBuy: return allows("guard");
    case MsgType.Gift:
      if (mode === "blivechat" && event.gift?.blindGiftName) return false;
      return allows("gift", mode === "laplace" && event.gift?.blindGiftName ? "blind" : event.gift?.isFree || event.gift?.coinType === "silver" ? "free" : "normal");
    case MsgType.RedPocketGift: return false;
    case MsgType.Interact: {
      const child = event.interactKind === "entry" ? "enter" : event.interactKind;
      return mode === "blivechat" || mode === "blivechat-open" && child !== "like" || allows("interaction", child);
    }
    case MsgType.RedPocketStart: case MsgType.RedPocketWinner: return mode !== "laplace" || allows("gift", "redpocket");
    case MsgType.AnchorLotStart: case MsgType.AnchorLotAward: return mode !== "laplace" || allows("gift", "lottery");
    case MsgType.LiveStart: case MsgType.LiveEnd: return mode !== "laplace" || allows("system", "liveStatus");
    case MsgType.RoomBlock: return mode !== "laplace" || allows("system", "userMute");
    case MsgType.RoomSilent: return mode !== "laplace" || allows("system", "roomMute");
    case MsgType.RoomChange: return mode !== "laplace" || allows("system", "roomChange");
    case MsgType.Warning: case MsgType.CutOff: return mode !== "laplace" || allows("system", "warning");
    default: return true;
  }
}

export function setCompatibleEventGroup(value: unknown, mode: CompatibleThemeMode, group: string, checked: boolean): NativeEventVisibility {
  const visibility = normalizeCompatibleEventVisibility(mode, value);
  const scopes = compatibleEventScopes(mode);
  if (group === "categories") return { ...visibility, categories: { ...visibility.categories, ...Object.fromEntries(scopes.map(scope => [scope.id, checked])) } };
  return { ...visibility, children: { ...visibility.children, ...Object.fromEntries((scopes.find(scope => scope.id === group)?.children ?? []).map(child => [child.id, checked])) } };
}
