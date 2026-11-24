import { createEventDelivery, type EventDeliveryOutputs } from "./eventDelivery.ts";
import { publishDisplayEvent, switchDisplayRoom } from "../windows/displayBridge";
import { publishGiftEvent, publishGiftEffectEvent, switchGiftWindowRoom } from "../windows/giftBridge";
import { publishVoiceEvent, switchVoiceRoom, clearVoiceRuntime } from "../voice/voiceRuntime";
import { getEventEffect } from "../protocol/giftEffects";
import { emitGiftEffect } from "../windows/giftEffectBus";

export function createLiveEventDelivery(observe: EventDeliveryOutputs["observe"]) {
  return createEventDelivery({
    display: publishDisplayEvent,
    gift: publishGiftEvent,
    voice: publishVoiceEvent,
    observe,
    effect(event) {
      const resource = getEventEffect(event);
      if (!resource) return;
      const notice = { event, resource };
      emitGiftEffect(notice);
      publishGiftEffectEvent(notice);
    },
    switchRoom(roomId) {
      switchDisplayRoom(roomId);
      switchGiftWindowRoom(roomId);
      switchVoiceRoom(roomId);
    },
    clearVoice: clearVoiceRuntime,
  });
}
