import type { DanmakuEvent } from './types'

/** 收集指定房间的实测大航海图标；无新数据时保持 Map 引用，避免榜单无关重渲染。 */
export function mergeObservedGuardIdentityIcons(
  previous: ReadonlyMap<string, string>,
  events: readonly Pick<DanmakuEvent, 'roomId' | 'user'>[],
  roomId?: number,
): ReadonlyMap<string, string> {
  if (roomId == null) return previous
  let next: Map<string, string> | undefined
  for (const event of events) {
    const user = event.user
    const iconUrl = user?.guardLevel && event.roomId === roomId ? user.guardIconUrl : undefined
    if (!user || !iconUrl || (next ?? previous).get(user.uid) === iconUrl) continue
    next ??= new Map(previous)
    next.set(user.uid, iconUrl)
  }
  return next ?? previous
}

export function guardIdentityIconsFromEvents(
  events: readonly Pick<DanmakuEvent, 'roomId' | 'user'>[],
  roomId?: number,
): ReadonlyMap<string, string> {
  return mergeObservedGuardIdentityIcons(new Map(), events, roomId)
}
