import { useGeneralSettings } from '../generalSettings'
import type { RankUser } from '../protocol/roomInsights'
import type { GuardIdentityDisplayMode } from '../eventDisplaySettings'
import { FanMedalBadge } from './FanMedalBadge'
import { GuardIdentityBadge } from './GuardIdentityBadge'
import { UserAvatar } from './UserAvatar'

export function RankAvatar({ user, size = 28 }: { user?: Pick<RankUser, 'uid' | 'name' | 'face' | 'guardLevel' | 'guardMilestone' | 'guardIconSet'>; size?: number }) {
  const showAvatarFrame = useGeneralSettings(state => state.eventDisplayPreferences.showAvatarFrame)
  const className = 'rounded-full bg-raised ui-type-control text-t2 ring-2 ring-surface'
  if (!user) return <span className={`inline-flex shrink-0 items-center justify-center ${className}`} style={{ width: size, height: size }}><span aria-hidden="true">—</span></span>
  const guardLevel = user.guardLevel === 1 ? 3 : user.guardLevel === 2 ? 2 : user.guardLevel === 3 ? 1 : 0
  return <UserAvatar user={{ avatar: user.face, guardLevel, guardMilestone: user.guardMilestone, guardIconSet: user.guardIconSet }} size={size} showAvatarFrame={showAvatarFrame} className={className} />
}

export function RankUserRow({ user, kind, guardIdentityDisplayMode = 'icon', showGuardIdentity = true, onUserFilter }: {
  user: RankUser
  kind: 'contribution' | 'guard'
  guardIdentityDisplayMode?: GuardIdentityDisplayMode
  showGuardIdentity?: boolean
  onUserFilter?: (user: Pick<RankUser, 'uid' | 'name'>) => void
}) {
  // 榜单保留线上等级：1总督、2提督、3舰长；现有主题token为模型等级，方向相反。
  const guard = user.guardLevel
  // 官方贡献榜对零贡献用户显示未排名；保留接口顺序和原始rank，大航海不套用此规则。
  const ranked = user.rank > 0 && !(kind === 'contribution' && user.score === 0)
  const identity = guard === 1 ? '总督' : guard === 2 ? '提督' : guard === 3 ? '舰长' : ''
  const tone = guard === 1 ? 'text-ev-guard3' : guard === 2 ? 'text-ev-guard2' : guard === 3 ? 'text-ev-guard1' : 'text-t1'
  const userName = onUserFilter ? <button
    type="button"
    onPointerDown={(event) => event.stopPropagation()}
    onClick={() => onUserFilter(user)}
    aria-label={`筛选用户：${user.name}`}
    title={`按用户筛选：${user.name}`}
    className="block w-full cursor-pointer truncate text-left ui-type-event font-medium hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-ring"
  >{user.name}</button> : <div className="truncate ui-type-event font-medium" title={user.name}>{user.name}</div>
  return <div className="flex h-14 min-w-0 items-center gap-2.5 border-b border-line/50 px-3">
    <span className="w-6 shrink-0 text-center font-mono ui-type-meta text-t2" aria-label={ranked ? `第${user.rank}名` : '未排名'}>{ranked ? user.rank : '—'}</span>
    <RankAvatar user={user} size={30} />
    <div className="min-w-0 flex-1">
      <div className={tone}>{userName}</div>
      <div className="flex min-w-0 items-center gap-1.5 ui-type-meta">
        {identity && showGuardIdentity && <GuardIdentityBadge
          label={identity}
          iconUrl={user.guardIconUrl}
          iconSet={user.guardIconSet}
          guardLevel={identity === '舰长' ? 1 : identity === '提督' ? 2 : 3}
          mode={guardIdentityDisplayMode}
          textClassName={`shrink-0 ${tone}`}
        />}
        {user.medal && <FanMedalBadge medal={user.medal} />}
      </div>
    </div>
    <span className="shrink-0 font-mono ui-type-section-title tabular-nums text-t1">
      {kind === 'guard' ? <>{user.accompany?.toLocaleString('zh-CN') ?? '—'}<span className="ml-0.5 font-ui ui-type-meta text-t2">天</span></> : user.score?.toLocaleString('zh-CN') ?? '—'}
    </span>
  </div>
}

export function RankList({ users, kind, guardIdentityDisplayMode = 'icon', showGuardIdentity = true, onUserFilter }: {
  users: RankUser[]
  kind: 'contribution' | 'guard'
  guardIdentityDisplayMode?: GuardIdentityDisplayMode
  showGuardIdentity?: boolean
  onUserFilter?: (user: Pick<RankUser, 'uid' | 'name'>) => void
}) {
  return <ol aria-label={kind === 'guard' ? '大航海陪伴总榜' : '观众榜'}>
    {users.map(user => <li key={user.uid}><RankUserRow user={user} kind={kind} guardIdentityDisplayMode={guardIdentityDisplayMode} showGuardIdentity={showGuardIdentity} onUserFilter={onUserFilter} /></li>)}
  </ol>
}

export interface OverviewMetricsProps {
  viewers?: string; watched?: number; likes?: number; fansClub?: number; guards?: number
  medalName?: string; duration: string
}
export function OverviewMetrics({ viewers, watched, likes, fansClub, guards, medalName, duration }: OverviewMetricsProps) {
  const number = (value?: number) => value?.toLocaleString('zh-CN') ?? '—'
  const metrics = [
    ['观众', viewers ?? '—', 'B站房间观众数'],
    ['看过', number(watched), '本场累计看过'],
    ['点赞', number(likes), '本场点赞数'],
    [medalName || '粉丝团', number(fansClub), '粉丝团人数'],
    ['大航海', number(guards), '大航海人数'],
    ['时长', duration, '自本场开播起的时长；断开连接不等于下播'],
  ]
  return <dl className="flex min-w-0 flex-nowrap items-center gap-x-3 overflow-hidden py-1.5 ui-type-meta">
    {metrics.map(([label, value, title]) => <div key={title} className="inline-flex shrink-0 items-center gap-1.5" title={title}>
      <dt className="max-w-20 truncate text-t2">{label}</dt>
      <dd className="font-mono tabular-nums text-t1 ui-type-overview-value">{value}</dd>
    </div>)}
  </dl>
}
