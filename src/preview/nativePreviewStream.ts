import { MsgType, type DanmakuEvent } from "../protocol/types.ts";
import { mergeGiftInto } from "../events/giftMerge.ts";
import { mergeSameDanmuEvent, type SameDanmuMergeSettings } from "../windows/danmuMerge.ts";
import { isEventExpired, type EventExpirySettings } from "../windows/windowEventExpiry.ts";

export function appendNativePreviewEvent(events: readonly DanmakuEvent[], incoming: DanmakuEvent,
  options: SameDanmuMergeSettings & { target: "live" | "windows" | "obs"; expiry: EventExpirySettings },
  retiredIds: ReadonlySet<string> = new Set(),
): DanmakuEvent[] {
  const event = { ...incoming, firstOccurredAt: incoming.firstOccurredAt ?? incoming.ts };
  const inactive: DanmakuEvent[] = [], active: DanmakuEvent[] = [];
  for (const row of events) {
    const retired = retiredIds.has(row.id) || (options.target !== "live" && isEventExpired(row.firstOccurredAt ?? row.ts, event.ts, options.expiry));
    (retired ? inactive : active).push(row);
  }
  if (event.msgType === MsgType.Gift) {
    if (mergeGiftInto(active, event)) return [...inactive, ...active].slice(-2000);
    if (event.isComboUpdate) {
      if (event.comboId && inactive.some(row => row.comboId === event.comboId && row.user?.uid === event.user?.uid && row.gift?.id === event.gift?.id)) return [...events];
      event.isComboUpdate = false;
      event.comboFinalized = true;
    }
  }
  const merged = options.target !== "live" ? mergeSameDanmuEvent(active, event, options) : null;
  return [...inactive, ...(merged ?? [...active, event])].slice(-2000);
}
