import type { DanmakuEvent } from "../protocol/types.ts";
import type { EventWindowPublishResult } from "../windows/eventWindowChannels.ts";

export interface EventDeliveryOutputs {
  display(event: DanmakuEvent): EventWindowPublishResult;
  gift(event: DanmakuEvent): EventWindowPublishResult;
  voice(event: DanmakuEvent): void;
  effect(event: DanmakuEvent): void;
  observe(event: DanmakuEvent, region: "display" | "gift", result: EventWindowPublishResult): void;
  switchRoom(roomId: number): void;
  clearVoice(): void;
}

export function createEventDelivery(outputs: EventDeliveryOutputs) {
  return {
    append(event: DanmakuEvent) {
      outputs.observe(event, "display", outputs.display(event));
      outputs.observe(event, "gift", outputs.gift(event));
      outputs.voice(event);
      outputs.effect(event);
    },
    updateGift(event: DanmakuEvent) {
      outputs.observe(event, "gift", outputs.gift(event));
      outputs.voice(event);
    },
    updateWindows(event: DanmakuEvent) {
      outputs.observe(event, "display", outputs.display(event));
      outputs.observe(event, "gift", outputs.gift(event));
    },
    switchRoom: outputs.switchRoom,
    clearVoice: outputs.clearVoice,
  };
}
