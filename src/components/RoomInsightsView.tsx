import { Button } from "./shadcn/button";
import { formatUiNumber } from "../i18n/format.ts";
import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";
import { useGeneralSettings } from '../generalSettings'
import type { RankUser } from '../protocol/roomInsights'
import type { GuardIdentityDisplayMode } from '../eventDisplaySettings'
import { FanMedalBadge } from './FanMedalBadge'
import { GuardIdentityBadge } from './GuardIdentityBadge'
import { UserAvatar } from './UserAvatar'

export function RankAvatar({ user, size = 28 }: { user?: Pick<RankUser, 'uid' | 'name' | 'face' | 'guardLevel' | 'guardMilestone' | 'guardIconSet'>; size?: number }) {
  useUiLanguage();
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
  useUiLanguage();
  // 榜单保留线上等级：1总督、2提督、3舰长；现有主题token为模型等级，方向相反。
  const guard = user.guardLevel
  // 官方贡献榜对零贡献用户显示未排名；保留接口顺序和原始rank，大航海不套用此规则。
  const ranked = user.rank > 0 && !(kind === 'contribution' && user.score === 0)
  const identity = guard === 1 ? uiText("roomInsightsView.RankUserRow.identity") : guard === 2 ? '提督' : guard === 3 ? '舰长' : ''
  const tone = guard === 1 ? 'text-ev-guard3' : guard === 2 ? 'text-ev-guard2' : guard === 3 ? 'text-ev-guard1' : 'text-t1'
  const userName = onUserFilter ? <Button variant="outline"
    type="button"
    onPointerDown={(event) => event.stopPropagation()}
    onClick={() => onUserFilter(user)}
    aria-label={uiText("roomInsightsView.aria_label", { name: user.name })}
    title={uiText("roomInsightsView.title", { name: user.name })}
    className="block w-full cursor-pointer truncate text-left ui-type-event font-medium hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-ring"
  >{user.name}</Button> : <div className="truncate ui-type-event font-medium" title={user.name}>{user.name}</div>
  return <div className="flex h-14 min-w-0 items-center gap-2.5 border-b border-line/50 px-3">
    <span className="w-6 shrink-0 text-center font-mono ui-type-meta text-t2" aria-label={ranked ? uiText("roomInsightsView.aria_label2", { rank: user.rank }) : uiText("roomInsightsView.aria_label3")}>{ranked ? user.rank : '—'}</span>
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
      {kind === 'guard' ? <>{formatUiNumber(user.accompany)}<span className="ml-0.5 font-ui ui-type-meta text-t2">{uiText("roomInsightsView.RankUserRow")}</span></> : formatUiNumber(user.score)}
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
  useUiLanguage();
  return <ol aria-label={kind === 'guard' ? uiText("roomInsightsView.aria_label4") : uiText("roomInsightsView.aria_label5")}>
    {users.map(user => <li key={user.uid}><RankUserRow user={user} kind={kind} guardIdentityDisplayMode={guardIdentityDisplayMode} showGuardIdentity={showGuardIdentity} onUserFilter={onUserFilter} /></li>)}
  </ol>
}

export interface OverviewMetricsProps {
  viewers?: string; watched?: number; likes?: number; fansClub?: number; guards?: number
  medalName?: string; duration: string
}
export function OverviewMetrics({ viewers, watched, likes, fansClub, guards, medalName, duration }: OverviewMetricsProps) {
  useUiLanguage();
  const number = (value?: number) => formatUiNumber(value)
  const metrics = [
    [uiText("roomInsightsView.OverviewMetrics.metrics"), viewers ?? '—', uiText("roomInsightsView.OverviewMetrics.metrics2")],
    [uiText("roomInsightsView.OverviewMetrics.metrics3"), number(watched), uiText("roomInsightsView.OverviewMetrics.metrics4")],
    [uiText("roomInsightsView.OverviewMetrics.metrics5"), number(likes), uiText("roomInsightsView.OverviewMetrics.metrics6")],
    [medalName || uiText("roomInsightsView.OverviewMetrics.metrics7"), number(fansClub), uiText("roomInsightsView.OverviewMetrics.metrics8")],
    [uiText("roomInsightsView.OverviewMetrics.metrics9"), number(guards), uiText("roomInsightsView.OverviewMetrics.metrics10")],
    [uiText("roomInsightsView.OverviewMetrics.metrics11"), duration, uiText("roomInsightsView.OverviewMetrics.metrics12")],
  ]
  return <dl className="flex min-w-0 flex-nowrap items-center gap-x-3 overflow-hidden py-1.5 ui-type-meta">
    {metrics.map(([label, value, title]) => <div key={title} className="inline-flex shrink-0 items-center gap-1.5" title={title}>
      <dt className="max-w-20 truncate text-t2">{label}</dt>
      <dd className="font-mono tabular-nums text-t1 ui-type-overview-value">{value}</dd>
    </div>)}
  </dl>
}
