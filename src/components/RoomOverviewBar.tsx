import { Button } from "./shadcn/button";
import { formatUiNumber } from "../i18n/format.ts";
import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";
import { useRoomInsights } from '../hooks/useRoomInsights'
import { insightsDuration, resolveMetric } from '../protocol/roomInsights'
import { OverviewMetrics } from './RoomInsightsView'

export function RoomOverviewBar() {
  useUiLanguage();
  const { roomId, stats, overview, guardFirst, viewers, timing, title, area, enabled, observedAt, refreshOverview } = useRoomInsights()
  if (!roomId) return <span className="py-2 ui-type-control text-t2">{uiText("roomOverviewBar.RoomOverviewBar")}</span>
  const base = overview.data
  const watched = resolveMetric(base?.watched, overview.dataUpdatedAt, stats.watched, stats.watchedUpdatedAt)
  const likes = resolveMetric(base?.likes, overview.dataUpdatedAt, stats.likes, stats.likesUpdatedAt)
  const fansClub = resolveMetric(base?.fansClub, overview.dataUpdatedAt, stats.fansClub, stats.fansClubUpdatedAt)
  const guards = resolveMetric(base?.guards, overview.dataUpdatedAt, guardFirst.data?.total, guardFirst.dataUpdatedAt)
  const duration = insightsDuration(timing.startedAt, timing.endedAt, observedAt)
  const number = (value?: number) => formatUiNumber(value)
  const summary = [uiText("roomOverviewBar.RoomOverviewBar.summary", { value: viewers.text ?? '—' }), uiText("roomOverviewBar.RoomOverviewBar.summary2", { value: number(watched) }), uiText("roomOverviewBar.RoomOverviewBar.summary3", { value: number(likes) }), `${base?.medalName || uiText("roomOverviewBar.RoomOverviewBar.summary4")} ${number(fansClub)}`, uiText("roomOverviewBar.RoomOverviewBar.summary5", { value: number(guards) }), uiText("roomOverviewBar.RoomOverviewBar.summary6", { duration: duration })].join(' · ')
  return <div className="flex w-max min-w-full flex-nowrap items-center gap-x-2" aria-label={uiText("roomOverviewBar.aria_label")} title={[title, area, summary].filter(Boolean).join('\n')}>
    <OverviewMetrics
      viewers={viewers.text}
      watched={watched}
      likes={likes}
      fansClub={fansClub} medalName={base?.medalName}
      guards={guards}
      duration={duration}
    />
    {!enabled ? <span className="ui-type-meta text-t2">{uiText("roomOverviewBar.RoomOverviewBar2")}</span> : overview.isError ? <Button variant="ghost" size={null} type="button" onClick={refreshOverview} disabled={overview.isFetching}
      className="cursor-pointer rounded px-1 ui-type-meta text-warning enabled:hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring disabled:cursor-wait"
      title={uiText("roomOverviewBar.title")}>{uiText("common.retry")}</Button>
      : overview.isPending && <span role="status" className="ui-type-meta text-t2">{uiText("roomOverviewBar.RoomOverviewBar3")}</span>}
  </div>
}
