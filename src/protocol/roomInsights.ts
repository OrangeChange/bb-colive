/** 官方房间快照与榜单映射。保持与事件解析分离；这里不创建弹幕事件。 */
import type { GuardIconSet, GuardMilestone, RoomGuardProfile } from './types'

export interface RankUser {
  uid: string
  name: string
  face?: string
  rank: number
  score?: number
  accompany?: number
  guardLevel?: number
  guardIconUrl?: string
  guardMilestone?: GuardMilestone
  guardIconSet?: GuardIconSet
  medal?: { name: string; level: number }
}

/** 榜单 API 缺少当前用户图标时，复用当前连接在同房间、同 UID 观测到的 URL，并套用房间级图标体系。 */
export function applyObservedGuardIcons(
  users: RankUser[],
  iconUrlsByUid: ReadonlyMap<string, string>,
  roomGuardProfile?: RoomGuardProfile,
): RankUser[] {
  return users.map(user => {
    const profile = roomGuardProfile && user.guardLevel ? {
      guardMilestone: roomGuardProfile.milestone,
      guardIconSet: roomGuardProfile.iconSet,
    } : {}
    const guardIconUrl = iconUrlsByUid.get(user.uid)
    if (user.guardIconUrl && Object.keys(profile).length === 0) return user
    return { ...user, ...profile, ...(user.guardIconUrl || !guardIconUrl ? {} : { guardIconUrl }) }
  })
}

export type GuardSort = 'intimacy' | 'accompany'
export function guardSortType(sort: GuardSort): string {
  return sort === 'accompany' ? '1' : '0'
}

export interface RawRankUser {
  uid?: number | string; name?: string; face?: string; rank?: number; score?: number; accompany?: number; guard_level?: number
  medal_info?: { medal_name?: string; level?: number; guard_level?: number }
  uinfo?: {
    uid?: number | string
    base?: { name?: string; face?: string }
    guard?: { level?: number } | null
    medal?: { name?: string; level?: number; guard_level?: number; ruid?: number | string; guard_icon?: string } | null
  }
}

export interface RawContribution {
  count?: number; count_text?: string; item?: RawRankUser[] | null
  list_end_prompt?: string; non_expandable?: boolean
}
export interface ContributionRank {
  users: RankUser[]; total?: number; countText?: string; endPrompt?: string
}
export interface RawGuardPage {
  info?: { num?: number; page?: number; now?: number }
  top3?: RawRankUser[] | null; list?: RawRankUser[] | null
}
export interface GuardPage {
  top3: RankUser[]; users: RankUser[]; total?: number; page: number; nextPage?: number
}

export interface RawRoomOverview {
  room_info?: { room_id?: number; uid?: number; title?: string; area_name?: string; parent_area_name?: string; live_status?: number; live_start_time?: number }
  anchor_info?: { base_info?: { uname?: string; face?: string }; medal_info?: { medal_name?: string; fansclub?: number } }
  watched_show?: { num?: number }
  like_info_v3?: { total_likes?: number }
  guard_info?: { count?: number }
  room_rank_info?: { user_rank_entry?: { user_contribution_rank_entry?: RawContribution } }
}

export interface RoomOverview {
  roomId: number; anchorUid: number; name?: string; face?: string
  title?: string; area?: string; liveStatus?: number; startedAt?: number
  watched?: number; likes?: number; fansClub?: number; medalName?: string; guards?: number
  viewers?: number; viewerText?: string; newRank: boolean
  topContributors: RankUser[]
}

export interface ViewerStats {
  online?: number; onlineText?: string; onlineUpdatedAt?: number
  rankCount?: number; rankCountText?: string; rankCountUpdatedAt?: number
}

function normalizeRankUser(row: RawRankUser, currentAnchorUid?: number | string): RankUser {
  const medal = row.uinfo?.medal
  const medalName = medal?.name ?? row.medal_info?.medal_name
  const iconUrl = typeof medal?.guard_icon === 'string' ? medal.guard_icon.trim() : ''
  const guardIconUrl = currentAnchorUid !== undefined && medal?.ruid !== undefined
    && String(medal.ruid) === String(currentAnchorUid) && iconUrl
    ? iconUrl
    : undefined
  return {
    uid: String(row.uinfo?.uid ?? row.uid ?? ''),
    name: row.uinfo?.base?.name ?? row.name ?? '未知用户',
    face: row.uinfo?.base?.face ?? row.face,
    rank: row.rank ?? 0,
    score: row.score,
    accompany: row.accompany,
    guardLevel: row.uinfo?.guard?.level || row.guard_level || medal?.guard_level || row.medal_info?.guard_level,
    ...(guardIconUrl ? { guardIconUrl } : {}),
    medal: medalName ? { name: medalName, level: medal?.level ?? row.medal_info?.level ?? 0 } : undefined,
  }
}

export function normalizeOverview(data: RawRoomOverview): RoomOverview {
  const room = data.room_info
  const rank = data.room_rank_info?.user_rank_entry?.user_contribution_rank_entry
  return {
    roomId: room?.room_id ?? 0, anchorUid: room?.uid ?? 0,
    name: data.anchor_info?.base_info?.uname, face: data.anchor_info?.base_info?.face,
    title: room?.title, area: room?.area_name, liveStatus: room?.live_status,
    startedAt: room?.live_start_time ? room.live_start_time * 1000 : undefined,
    watched: data.watched_show?.num, likes: data.like_info_v3?.total_likes,
    fansClub: data.anchor_info?.medal_info?.fansclub, medalName: data.anchor_info?.medal_info?.medal_name,
    guards: data.guard_info?.count,
    viewers: rank?.count, viewerText: rank?.count_text, newRank: rank != null,
    topContributors: (rank?.item ?? []).slice(0, 3).map(row => normalizeRankUser(row, room?.uid)),
  }
}

export function normalizeContribution(data: RawContribution, currentAnchorUid?: number | string): ContributionRank {
  return {
    users: (data.item ?? []).map(row => normalizeRankUser(row, currentAnchorUid)), total: data.count,
    countText: data.count_text, endPrompt: data.list_end_prompt,
  }
}

export function normalizeGuardPage(data: RawGuardPage, currentAnchorUid?: number | string): GuardPage {
  const page = data.info?.now ?? 1
  const users = (data.list ?? []).map(row => normalizeRankUser(row, currentAnchorUid))
  return {
    top3: (data.top3 ?? []).map(row => normalizeRankUser(row, currentAnchorUid)), users, total: data.info?.num, page,
    nextPage: users.length > 0 && page < (data.info?.page ?? page) ? page + 1 : undefined,
  }
}

export function mergeGuardPages(pages: GuardPage[]): RankUser[] {
  const seen = new Set<string>()
  const result: RankUser[] = []
  for (const row of [...(pages[0]?.top3 ?? []), ...pages.flatMap(p => p.users)]) {
    if (seen.has(row.uid)) continue
    seen.add(row.uid)
    result.push(row)
  }
  // 两种排序都由服务端分页；保留其顺序及同天数时的排名，不局部重排。
  return result
}

/** 使用B站提供的缩略文本；没有文本时显示原始整数，不自行发明“万”的舍入规则。 */
export function resolveViewers(overview: Pick<RoomOverview, 'viewers' | 'viewerText' | 'newRank'> | undefined, receivedAt: number, stats: ViewerStats): { value?: number; text?: string } {
  const newRank = overview?.newRank !== false
  const value = newRank ? stats.online : stats.rankCount
  const text = newRank ? stats.onlineText : stats.rankCountText
  const updatedAt = (newRank ? stats.onlineUpdatedAt : stats.rankCountUpdatedAt) ?? 0
  if (value !== undefined && updatedAt > receivedAt) return { value, text: text || String(value) }
  return { value: overview?.viewers, text: overview?.viewerText || (overview?.viewers === undefined ? undefined : String(overview.viewers)) }
}

export function formatLiveDuration(startedAt: number | undefined, endedAt: number | undefined, now: number): string {
  if (!startedAt || startedAt <= 0) return '—'
  // 旧场次的结束事件不能冻结后一次开播。
  const end = endedAt !== undefined && endedAt >= startedAt ? endedAt : now
  const seconds = Math.max(0, Math.floor((end - startedAt) / 1000))
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(n => String(n).padStart(2, '0')).join(':')
}

export function onlineRankStats(data: { count?: number; count_text?: string; online_count?: number; online_count_text?: string }, now: number): ViewerStats {
  return {
    ...(data.count === undefined ? {} : { rankCount: data.count, rankCountText: data.count_text, rankCountUpdatedAt: now }),
    ...(data.online_count === undefined ? {} : { online: data.online_count, onlineText: data.online_count_text, onlineUpdatedAt: now }),
  }
}

export function resolveLiveTiming(overview: Pick<RoomOverview, 'startedAt' | 'liveStatus'> | undefined, stats: { liveStartedAt?: number; liveEndedAt?: number; liveStatusChangedAt?: number }, receivedAt = Infinity) {
  const startedAt = Math.max(overview?.startedAt ?? 0, stats.liveStartedAt ?? 0) || undefined
  const endedAt = startedAt && stats.liveEndedAt !== undefined && stats.liveEndedAt >= startedAt ? stats.liveEndedAt : undefined
  if (overview?.liveStatus !== 1 && !endedAt && (stats.liveStatusChangedAt ?? 0) <= receivedAt) return { startedAt: undefined, endedAt: undefined }
  return { startedAt, endedAt }
}

export type RankKind = 'contribution' | 'guard'

export function canUpdateInsights(status: string, roomId: number | undefined, cookie: string | undefined): boolean {
  return status === 'connected' && !!roomId && !!cookie
}

export function insightsDuration(startedAt: number | undefined, endedAt: number | undefined, observedAt: number | undefined): string {
  return observedAt === undefined ? '—' : formatLiveDuration(startedAt, endedAt, observedAt)
}

/** 重连保留旧统计，但有较新的同字段快照时优先更新。 */
export function resolveMetric(snapshot: number | undefined, receivedAt: number, pushed: number | undefined, pushedAt = 0): number | undefined {
  return pushed !== undefined && (snapshot === undefined || pushedAt > receivedAt) ? pushed : snapshot
}

/** 关闭只针对发起它的弹层，防止旧的悬停计时器关闭新展开的榜单。 */
export function dismissRank(current: RankKind | null, owner: RankKind): RankKind | null {
  return current === owner ? null : current
}
