import { useRoomInsights } from '../hooks/useRoomInsights'
import { insightsDuration, resolveMetric } from '../protocol/roomInsights'
import { OverviewMetrics } from './RoomInsightsView'

export function RoomOverviewBar() {
  const { roomId, stats, overview, guardFirst, viewers, timing, title, area, enabled, observedAt, refreshOverview } = useRoomInsights()
  if (!roomId) return <span className="py-2 ui-type-control text-t2">连接直播间后显示概览</span>
  const base = overview.data
  const watched = resolveMetric(base?.watched, overview.dataUpdatedAt, stats.watched, stats.watchedUpdatedAt)
  const likes = resolveMetric(base?.likes, overview.dataUpdatedAt, stats.likes, stats.likesUpdatedAt)
  const fansClub = resolveMetric(base?.fansClub, overview.dataUpdatedAt, stats.fansClub, stats.fansClubUpdatedAt)
  const guards = resolveMetric(base?.guards, overview.dataUpdatedAt, guardFirst.data?.total, guardFirst.dataUpdatedAt)
  const duration = insightsDuration(timing.startedAt, timing.endedAt, observedAt)
  const number = (value?: number) => value?.toLocaleString('zh-CN') ?? '—'
  const summary = [`观众 ${viewers.text ?? '—'}`, `看过 ${number(watched)}`, `点赞 ${number(likes)}`, `${base?.medalName || '粉丝团'} ${number(fansClub)}`, `大航海 ${number(guards)}`, `时长 ${duration}`].join(' · ')
  return <div className="flex w-max min-w-full flex-nowrap items-center gap-x-2" aria-label="直播间概览" title={[title, area, summary].filter(Boolean).join('\n')}>
    <OverviewMetrics
      viewers={viewers.text}
      watched={watched}
      likes={likes}
      fansClub={fansClub} medalName={base?.medalName}
      guards={guards}
      duration={duration}
    />
    {!enabled ? <span className="ui-type-meta text-t2">未连接 · 暂停更新</span> : overview.isError ? <button type="button" onClick={refreshOverview} disabled={overview.isFetching}
      className="cursor-pointer rounded px-1 ui-type-meta text-warning enabled:hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring disabled:cursor-wait"
      title="更新失败，已保留上次数据。点击重试。">重试</button>
      : overview.isPending && <span role="status" className="ui-type-meta text-t2">读取中…</span>}
  </div>
}
