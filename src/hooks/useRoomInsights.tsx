import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { useConnection } from '../stores/connection'
import { useSession } from '../stores/session'
import { getContributionRank, getGuardPage, getRoomOverview } from '../protocol/roomInsightsApi'
import { canUpdateInsights, dismissRank, mergeGuardPages, resolveLiveTiming, resolveViewers, type RankKind, type GuardSort } from '../protocol/roomInsights'
import { InsightsContext } from './roomInsightsContext'

function useInsightsState() {
  const roomId = useConnection(s => s.state.roomId)
  const client = useQueryClient()
  const status = useConnection(s => s.state.status)
  const stats = useConnection(s => s.stats)
  const cookie = useSession(s => s.session?.cookie)
  const [openRank, setOpenRank] = useState<RankKind | null>(null)
  const [guardSort, setGuardSort] = useState<GuardSort>('intimacy')
  const active = status === 'connected'
  const enabled = canUpdateInsights(status, roomId, cookie)
  // 按房间保留最后观测时刻，断开/切走后不继续走秒。
  const clocks = useRef(new Map<number, number>())
  const [, tick] = useState(0)
  useLayoutEffect(() => {
    if (!enabled || !roomId) return
    const update = () => { clocks.current.set(roomId, Date.now()); tick(n => n + 1) }
    update()
    const timer = setInterval(update, 1000)
    return () => {
      clearInterval(timer)
      clocks.current.set(roomId, Date.now())
    }
  }, [enabled, roomId])
  useLayoutEffect(() => {
    // enabled=false并不会取消正在执行的请求；断开、换房、退出时显式取消。
    return () => {
      for (const family of ['room-overview', 'room-contribution', 'room-guard-first', 'room-guard-rest']) {
        void client.cancelQueries({ queryKey: [family, roomId] })
      }
    }
  }, [client, roomId, enabled])
  const overview = useQuery({
    queryKey: ['room-overview', roomId],
    queryFn: ({ signal }) => getRoomOverview(roomId!, cookie!, signal),
    enabled, staleTime: 60_000, refetchInterval: active ? 60_000 : false,
  })
  const uid = overview.data?.anchorUid
  const contribution = useQuery({
    queryKey: ['room-contribution', roomId, uid],
    queryFn: ({ signal }) => getContributionRank(roomId!, uid!, cookie!, signal),
    enabled: enabled && !!uid, staleTime: 10_000,
    refetchInterval: active ? (openRank === 'contribution' ? 10_000 : 30_000) : false,
  })
  const guardFirst = useQuery({
    queryKey: ['room-guard-first', roomId, uid, guardSort],
    queryFn: ({ signal }) => getGuardPage(roomId!, uid!, 1, cookie!, signal, guardSort),
    enabled: enabled && !!uid, staleTime: 60_000, refetchInterval: active && openRank !== 'guard' ? 60_000 : false,
  })
  // 第一页更新后重新开始后续分页，避免新排名与旧分页拼接。
  const guardRest = useInfiniteQuery({
    queryKey: ['room-guard-rest', roomId, uid, guardSort, guardFirst.dataUpdatedAt],
    queryFn: ({ pageParam, signal }) => getGuardPage(roomId!, uid!, pageParam, cookie!, signal, guardSort),
    initialPageParam: 2,
    getNextPageParam: page => page.nextPage,
    enabled: false,
    staleTime: Infinity,
    gcTime: Infinity,
  })
  useEffect(() => { setOpenRank(null) }, [roomId])
  useEffect(() => () => {
    void client.cancelQueries({ queryKey: ['room-guard-first', roomId, uid, guardSort] })
    void client.cancelQueries({ queryKey: ['room-guard-rest', roomId, uid, guardSort] })
  }, [client, roomId, uid, guardSort])
  useEffect(() => {
    if (enabled && active) void overview.refetch()
    // 连接/重连以及LIVE/PREPARING事件触发一次更新，非每条弹幕更新。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, status, stats.liveStatusChangedAt])
  const open = (kind: RankKind | null) => {
    setOpenRank(kind)
    if (!enabled || !uid || kind === null) return
    if (kind === 'contribution' && Date.now() - contribution.dataUpdatedAt >= 10_000 && !contribution.isFetching) void contribution.refetch()
    if (kind === 'guard' && Date.now() - guardFirst.dataUpdatedAt >= 60_000 && !guardFirst.isFetching) void guardFirst.refetch()
  }
  const guardUsers = useMemo(() => mergeGuardPages([
    ...(guardFirst.data ? [guardFirst.data] : []), ...(guardRest.data?.pages ?? []),
  ]), [guardFirst.data, guardRest.data])
  const hasMoreGuards = guardRest.data ? guardRest.hasNextPage : !!guardFirst.data?.nextPage
  const loadingMore = guardRest.isFetching
  const loadMoreGuards = () => {
    if (enabled && !loadingMore && !guardFirst.isFetching && hasMoreGuards) void guardRest.fetchNextPage()
  }
  const refreshOverview = () => { if (enabled) void overview.refetch() }
  const refreshRank = (kind: RankKind) => {
    if (!enabled) return
    if (!uid) void overview.refetch()
    else if (kind === 'guard') void guardFirst.refetch()
    else void contribution.refetch()
  }

  const base = overview.data
  const countFromRank = contribution.data && contribution.dataUpdatedAt > overview.dataUpdatedAt
    ? { ...base, viewers: contribution.data.total, viewerText: contribution.data.countText, newRank: true }
    : base
  const viewers = resolveViewers(countFromRank, Math.max(overview.dataUpdatedAt, contribution.dataUpdatedAt), stats)
  const timing = resolveLiveTiming(base, stats, overview.dataUpdatedAt)
  return {
    roomId, status, active, enabled, observedAt: roomId ? clocks.current.get(roomId) : undefined,
    refreshOverview, refreshRank, stats, overview, contribution, guardFirst, guardRest,
    openRank, open, dismiss: (owner: RankKind) => setOpenRank(current => dismissRank(current, owner)),
    guardUsers, guardSort, setGuardSort, hasMoreGuards, loadingMore, loadMoreGuards, viewers, timing,
    title: (stats.roomChangedAt ?? 0) > overview.dataUpdatedAt ? stats.roomTitle ?? base?.title : base?.title,
    area: (stats.roomChangedAt ?? 0) > overview.dataUpdatedAt ? stats.roomArea ?? base?.area : base?.area,
  }
}

/** 独立Context只引用此类型，不反向加载Provider的运行时代码。 */
export type RoomInsightsState = ReturnType<typeof useInsightsState>
function InsightsSession({ children }: { children: ReactNode }) {
  const state = useInsightsState()
  return <InsightsContext.Provider value={state}>{children}</InsightsContext.Provider>
}

export function RoomInsightsProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: {
    retry: 1, refetchOnWindowFocus: false, gcTime: Infinity,
  } } }))
  return <QueryClientProvider client={client}><InsightsSession>{children}</InsightsSession></QueryClientProvider>
}

export function useRoomInsights() {
  const value = useContext(InsightsContext)
  if (!value) throw new Error('RoomInsightsProvider 未挂载')
  return value
}
