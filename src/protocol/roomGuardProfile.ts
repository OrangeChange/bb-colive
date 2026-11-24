import type { DanmakuEvent, GuardIconSet, GuardMilestone, GuardProfileSource, RoomGuardProfile } from './types'

export function profileFromAchievementLevel(
  value: number | null | undefined,
  source: GuardProfileSource = 'room-info',
  guardCount?: number | null,
): RoomGuardProfile {
  const normalizedGuardCount = typeof guardCount === 'number' && Number.isFinite(guardCount) && guardCount >= 0
    ? guardCount
    : undefined
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return {
      milestone: 'unknown',
      iconSet: 'base',
      source: 'unknown',
      ...(normalizedGuardCount !== undefined ? { guardCount: normalizedGuardCount } : {}),
    }
  }

  const milestone: GuardMilestone = value >= 10000
    ? 'tenThousand'
    : value >= 1000
      ? 'thousand'
      : 'standard'
  const iconSet: GuardIconSet = milestone === 'standard' ? 'base' : 'enhanced'
  return {
    anchorGuardAchieveLevel: value,
    milestone,
    iconSet,
    source,
    ...(normalizedGuardCount !== undefined ? { guardCount: normalizedGuardCount } : {}),
  }
}

/** 档位晚于事件到达时，只回刷当前房间已有的大航海用户。 */
export function applyRoomGuardProfileToEvents(
  events: readonly DanmakuEvent[],
  roomId: number,
  profile: RoomGuardProfile,
): DanmakuEvent[] {
  let changed = false
  const next = events.map((event) => {
    if (event.roomId !== roomId || !event.user || event.user.guardLevel <= 0) return event
    if (event.user.guardMilestone === profile.milestone && event.user.guardIconSet === profile.iconSet) return event
    changed = true
    return {
      ...event,
      user: {
        ...event.user,
        guardMilestone: profile.milestone,
        guardIconSet: profile.iconSet,
      },
    }
  })
  return changed ? next : events as DanmakuEvent[]
}
