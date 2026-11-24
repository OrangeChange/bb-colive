import type { DanmakuEvent } from "../protocol/types.ts";

export function compatibleEventId(event: Pick<DanmakuEvent, "id" | "reactKey">): string {
  return event.reactKey ?? event.id;
}

