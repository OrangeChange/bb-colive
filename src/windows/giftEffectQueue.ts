export interface GiftEffectQueue<T> {
  readonly current: T | null
  readonly pendingCount: number
  enqueue(item: T): boolean
  finishCurrent(): T | null
  clearPending(predicate?: (item: T) => boolean): void
  cancelAll(): void
}

const DEFAULT_PENDING_LIMIT = 32

/** 单个显示目标的 FIFO 特效队列；current 永远不受 clearPending 影响。 */
export function createGiftEffectQueue<T>(pendingLimit = DEFAULT_PENDING_LIMIT): GiftEffectQueue<T> {
  let current: T | null = null
  let pending: T[] = []
  const limit = Math.max(0, Math.floor(pendingLimit))

  return {
    get current() {
      return current
    },
    get pendingCount() {
      return pending.length
    },
    enqueue(item) {
      if (current === null) {
        current = item
        return true
      }
      if (limit === 0) return false
      if (pending.length >= limit) pending = pending.slice(-(limit - 1))
      pending.push(item)
      return false
    },
    finishCurrent() {
      current = pending.shift() ?? null
      return current
    },
    clearPending(predicate) {
      pending = predicate ? pending.filter(item => !predicate(item)) : []
    },
    cancelAll() {
      current = null
      pending = []
    },
  }
}
