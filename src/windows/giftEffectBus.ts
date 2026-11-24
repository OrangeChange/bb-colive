import type { DanmakuEvent } from "../protocol/types.ts"
import type { GiftEffectResource } from "../protocol/giftEffects.ts"

export interface GiftEffectNotice {
  event: DanmakuEvent
  resource: GiftEffectResource
  /** 用户点击礼物、大航海或成就图标触发。 */
  manual?: boolean
}

const listeners = new Set<(notice: GiftEffectNotice) => void>()

export function subscribeGiftEffect(listener: (notice: GiftEffectNotice) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function emitGiftEffect(notice: GiftEffectNotice): void {
  for (const listener of listeners) listener(notice)
}
