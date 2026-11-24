import type { DanmakuEvent, DanmakuUser } from "../protocol/types.ts";
import { compatibleEventId } from "./compatibleEventProjection.ts";

export type CompatibleLiveAction =
  | "filter-user"
  | "favorite"
  | "copy"
  | "locate"
  | "open-user"
  | "gift-effect"
  | { type: "filter-user"; uid: string }
  | { type: "open-link"; href: string };

export interface CompatibleLiveHandlers {
  onFilterUser?(user: DanmakuUser): void;
  onFavorite?(event: DanmakuEvent): void;
  onCopy?(event: DanmakuEvent): void;
  onLocate?(event: DanmakuEvent): void;
  onOpenUser?(user: DanmakuUser): void;
  onGiftEffect?(event: DanmakuEvent): void;
  onOpenLink?(event: DanmakuEvent, href: string): void;
}

export interface CompatibleLiveBridge {
  replace(events: readonly DanmakuEvent[]): void;
  has(eventId: string): boolean;
  get(eventId: string): DanmakuEvent | undefined;
  dispatch(eventId: string, action: CompatibleLiveAction): boolean;
}

export const stableCompatibleEventId = compatibleEventId;

export function dispatchCompatibleLiveAction(
  event: DanmakuEvent,
  action: CompatibleLiveAction,
  handlers: CompatibleLiveHandlers,
): boolean {
  if (typeof action === "object") {
    if (action.type === "filter-user") {
      const user = compatibleEventUser(event, action.uid);
      if (!user || !handlers.onFilterUser) return false;
      handlers.onFilterUser(user);
      return true;
    }
    if (!handlers.onOpenLink) return false;
    handlers.onOpenLink(event, action.href);
    return true;
  }
  if (action === "filter-user") {
    if (!event.user || !handlers.onFilterUser) return false;
    handlers.onFilterUser(event.user);
    return true;
  } else if (action === "open-user") {
    if (!event.user || !handlers.onOpenUser) return false;
    handlers.onOpenUser(event.user);
    return true;
  } else if (action === "favorite" && handlers.onFavorite) handlers.onFavorite(event);
  else if (action === "copy" && handlers.onCopy) handlers.onCopy(event);
  else if (action === "locate" && handlers.onLocate) handlers.onLocate(event);
  else if (action === "gift-effect" && handlers.onGiftEffect) handlers.onGiftEffect(event);
  else return false;
  return true;
}

export function compatibleEventUser(event: DanmakuEvent, uid: string): DanmakuUser | undefined {
  const source = event.laplace?.event as Record<string, any> | undefined;
  const users = [event.user, event.replyTo, event.broadcaster, ...(event.lottery?.winners ?? []),
    source?.reply, source?.receiver, ...(Array.isArray(source?.list) ? source.list : [])];
  for (const value of users) {
    if (!value) continue;
    const user = Array.isArray(value) ? { uid: value[0], uname: value[1], avatar: value[2] } : value;
    if (String(user.uid) !== uid) continue;
    return { ...user, uid, uname: user.uname ?? user.username ?? "", guardLevel: user.guardLevel ?? 0 };
  }
  return undefined;
}

/** 兼容 DOM 只持有稳定 ID；软件继续持有事件对象和全部现场动作。 */
export function createCompatibleLiveBridge(handlers: CompatibleLiveHandlers): CompatibleLiveBridge {
  let eventsById = new Map<string, DanmakuEvent>();
  return {
    replace(events) {
      eventsById = new Map(events.map((event) => [stableCompatibleEventId(event), event]));
    },
    has(eventId) {
      return eventsById.has(eventId);
    },
    get(eventId) {
      return eventsById.get(eventId);
    },
    dispatch(eventId, action) {
      const event = eventsById.get(eventId);
      if (!event) return false;
      return dispatchCompatibleLiveAction(event, action, handlers);
    },
  };
}
