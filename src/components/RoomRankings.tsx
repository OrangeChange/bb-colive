import { Button } from "./shadcn/button";
import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";
import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useRoomInsights } from '../hooks/useRoomInsights'
import { applyObservedGuardIcons, type RankUser } from '../protocol/roomInsights'
import { useConnection } from '../stores/connection'
import { RankList, RankUserRow } from './RoomInsightsView'
import { RankTopThree } from './RankTopThree'
import { useGeneralSettings } from '../generalSettings'
import type { GuardIdentityDisplayMode } from '../eventDisplaySettings'

const focusClass = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring'

function RankRows({
  users,
  kind,
  hasMore,
  loadingMore,
  loadMoreError,
  onLoadMore,
  guardIdentityDisplayMode,
  showGuardIdentity,
  onUserFilter,
}: {
  users: RankUser[]
  kind: 'contribution' | 'guard'
  hasMore: boolean
  loadingMore: boolean
  loadMoreError: boolean
  onLoadMore?: () => void
  guardIdentityDisplayMode: GuardIdentityDisplayMode
  showGuardIdentity: boolean
  onUserFilter?: (user: Pick<RankUser, 'uid' | 'name'>) => void
}) {
  useUiLanguage();
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef(onLoadMore)
  const virtual = useVirtualizer({ count: users.length, getScrollElement: () => scrollRef.current, estimateSize: () => 56, overscan: 6 })
  useEffect(() => { loadMoreRef.current = onLoadMore }, [onLoadMore])
  useEffect(() => {
    const root = scrollRef.current
    const sentinel = sentinelRef.current
    if (!root || !sentinel || !hasMore || !onLoadMore || loadMoreError) return
    const observer = new IntersectionObserver(
      entries => { if (entries.some(entry => entry.isIntersecting)) loadMoreRef.current?.() },
      { root, rootMargin: '96px 0px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loadMoreError, onLoadMore])
  return <div ref={scrollRef} tabIndex={0} aria-label={uiText("roomRankings.aria_label")} className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${focusClass}`} style={{ scrollbarGutter: 'stable' }}>
    {users.length <= 100 ? <RankList users={users} kind={kind} guardIdentityDisplayMode={guardIdentityDisplayMode} showGuardIdentity={showGuardIdentity} onUserFilter={onUserFilter} /> : <ol aria-label={kind === 'guard' ? uiText("roomRankings.aria_label2") : uiText("roomRankings.aria_label3")} className="relative" style={{ height: virtual.getTotalSize() }}>
      {virtual.getVirtualItems().map(row => <li key={users[row.index].uid} aria-posinset={row.index + 1} aria-setsize={users.length}
        className="absolute left-0 top-0 w-full" style={{ height: row.size, transform: `translateY(${row.start}px)` }}>
        <RankUserRow user={users[row.index]} kind={kind} guardIdentityDisplayMode={guardIdentityDisplayMode} showGuardIdentity={showGuardIdentity} onUserFilter={onUserFilter} />
      </li>)}
    </ol>}
    {(hasMore || loadingMore || loadMoreError) && <div ref={sentinelRef} role={loadMoreError ? 'alert' : 'status'} className="flex min-h-8 items-center justify-center border-t border-line/50 px-3 py-2 ui-type-meta text-t3">
      {loadingMore ? uiText("roomRankings.RankRows") : loadMoreError ? <Button variant="outline" type="button" onClick={() => loadMoreRef.current?.()} className={`cursor-pointer rounded px-2 py-1 ui-type-control text-accent-text hover:bg-accent-subtle ${focusClass}`}>{uiText("common.retry")}</Button> : uiText("roomRankings.RankRows2")}
    </div>}
  </div>
}

function Ranking({ kind, onUserFilter }: { kind: 'contribution' | 'guard'; onUserFilter?: (user: Pick<RankUser, 'uid' | 'name'>) => void }) {
  useUiLanguage();
  const { roomId, enabled, refreshRank, overview, contribution, guardFirst, guardRest, guardUsers, guardSort, setGuardSort, openRank, open, dismiss, hasMoreGuards, loadingMore, loadMoreGuards } = useRoomInsights()
  const guardIdentityDisplayMode = useGeneralSettings(state => state.eventDisplayPreferences.guardIdentityDisplayMode)
  const showGuardIdentity = useGeneralSettings(state => state.eventDisplayPreferences.showGuardIdentity)
  const observedGuardIconUrls = useConnection(state => state.guardIconUrlsByUid)
  const roomGuardProfile = useConnection(state => state.state.roomGuardProfile)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [pinned, setPinned] = useState(false)
  const expanded = openRank === kind
  const guard = kind === 'guard'
  const query = guard ? guardFirst : contribution
  const sourceUsers = guard ? guardUsers : contribution.data?.users ?? []
  const users = useMemo(() => applyObservedGuardIcons(sourceUsers, observedGuardIconUrls, roomGuardProfile), [sourceUsers, observedGuardIconUrls, roomGuardProfile])
  const top3 = applyObservedGuardIcons(guard ? guardUsers.slice(0, 3) : contribution.data?.users.slice(0, 3) ?? overview.data?.topContributors ?? [], observedGuardIconUrls, roomGuardProfile)
  const label = guard ? uiText("roomRankings.Ranking.label") : uiText("roomRankings.Ranking.label2")
  const ready = !!overview.data?.anchorUid
  const error = query.isError || overview.isError && !ready
  const pending = enabled && (overview.isPending || ready && query.isPending)
  const cancelClose = () => { clearTimeout(closeTimer.current) }
  const close = (restoreFocus = false) => {
    cancelClose()
    dismiss(kind)
    setPinned(false)
    if (restoreFocus) trigger.current?.focus()
  }
  useEffect(() => () => clearTimeout(closeTimer.current), [])
  useEffect(() => { setPinned(false) }, [roomId])
  useEffect(() => { if (!expanded) setPinned(false) }, [expanded])
  useEffect(() => {
    if (!expanded) return
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) close() }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); close(true) } }
    window.addEventListener('pointerdown', outside)
    window.addEventListener('keydown', escape)
    return () => { window.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', escape) }
  })
  const refresh = () => refreshRank(kind)
  const filterUser = (user: Pick<RankUser, 'uid' | 'name'>) => {
    onUserFilter?.(user)
    close(true)
  }

  return <div ref={root} className="relative min-w-0"
    onMouseEnter={() => { cancelClose(); if (roomId) open(kind) }}
    onMouseLeave={() => {
      if (!pinned && !root.current?.contains(document.activeElement)) closeTimer.current = setTimeout(() => dismiss(kind), 180)
    }}>
    <Button variant="outline" ref={trigger} type="button" aria-label={uiText("roomRankings.aria_label4", { label: label })} aria-expanded={expanded} aria-haspopup="dialog" aria-controls={`room-rank-${kind}`}
      disabled={!roomId}
      onClick={() => { cancelClose(); setPinned(true); open(kind) }}
      onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setPinned(true); open(kind) } }}
      className={`inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border px-2 transition-colors disabled:cursor-default disabled:opacity-50 ${focusClass} ${expanded ? 'border-accent/50 bg-accent-subtle' : 'border-transparent enabled:hover:border-line enabled:hover:bg-raised'}`}>
      <span className="whitespace-nowrap ui-type-control text-t2">{label}</span>
      <RankTopThree users={top3} pending={pending} />
    </Button>
    {expanded && <div className="ui-motion-enter absolute right-0 top-full z-50 pt-2">
      <section id={`room-rank-${kind}`} role="dialog" aria-label={guard ? uiText("roomRankings.aria_label2") : uiText("roomRankings.aria_label3")}
        className="flex h-[400px] max-h-[calc(100dvh-110px)] w-[360px] max-w-[calc(100vw-100px)] flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-xl shadow-black/20">
        <header className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 whitespace-nowrap">
            <h2 className="ui-type-section-title font-semibold text-t1">{label}</h2>
            <span className="ui-type-meta tabular-nums text-t3">{uiText("roomRankings.Ranking")}{users.length}{guard && guardFirst.data?.total !== undefined ? ` / ${guardFirst.data.total}` : ''} {uiText("roomRankings.Ranking2")}</span>
            </div>
          </div>
              <Button variant="outline" type="button" onClick={refresh} disabled={!enabled || query.isFetching || overview.isFetching} className={`cursor-pointer rounded px-2 py-1 ui-type-control text-t2 enabled:hover:bg-raised disabled:cursor-wait disabled:opacity-50 ${focusClass}`}>{uiText("roomRankings.Ranking3")}</Button>
        </header>
        {guard ? <div role="group" aria-label={uiText("roomRankings.aria_label5")} className="flex shrink-0 gap-1 border-b border-line px-3 py-2">
          {(['intimacy', 'accompany'] as const).map(sort => <Button variant="outline" key={sort} type="button" aria-pressed={guardSort === sort}
            onPointerDown={event => { event.stopPropagation(); cancelClose(); setPinned(true) }}
            onClick={() => { cancelClose(); setPinned(true); setGuardSort(sort) }} className={`cursor-pointer rounded px-2.5 py-1 ui-type-control ${focusClass} ${guardSort === sort ? 'bg-accent-subtle text-accent-text' : 'text-t2 hover:bg-raised'}`}>
            {sort === 'intimacy' ? uiText("roomRankings.Ranking4") : uiText("roomRankings.Ranking5")}
          </Button>)}
        </div> : <p className="shrink-0 border-b border-line px-3 py-2 ui-type-meta text-t3">{uiText("roomRankings.Ranking6")}</p>}
        {error && <div role="status" className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-2 ui-type-control text-warning">
          <span>{users.length ? uiText("roomRankings.Ranking7") : uiText("roomRankings.Ranking8")}</span>
          <Button variant="outline" type="button" onClick={refresh} disabled={!enabled || query.isFetching || overview.isFetching} className={`cursor-pointer rounded px-2 py-1 enabled:hover:bg-raised ${focusClass}`}>{uiText("common.retry")}</Button>
        </div>}
        {users.length ? <RankRows
          key={guard ? guardSort : kind}
          users={users}
          kind={kind}
          hasMore={guard && enabled && hasMoreGuards}
          loadingMore={guard && loadingMore}
          loadMoreError={guard && enabled && guardRest.isError}
          onLoadMore={guard && enabled ? loadMoreGuards : undefined}
          guardIdentityDisplayMode={guardIdentityDisplayMode}
          showGuardIdentity={showGuardIdentity}
          onUserFilter={onUserFilter ? filterUser : undefined}
              /> : <div role="status" className="flex min-h-0 flex-1 items-center justify-center ui-type-control text-t2">
          {!enabled ? uiText("roomRankings.Ranking9") : pending ? uiText("roomRankings.Ranking10") : error ? uiText("roomRankings.Ranking11") : guard ? uiText("roomRankings.Ranking12") : uiText("roomRankings.Ranking13")}
        </div>}
      </section>
    </div>}
  </div>
}

export function RoomRankings({ onUserFilter }: { onUserFilter?: (user: Pick<RankUser, 'uid' | 'name'>) => void }) {
  useUiLanguage();
  const { roomId } = useRoomInsights()
  return <div className="ml-auto flex shrink-0 items-center gap-1" key={roomId ?? 'none'}>
    <Ranking kind="contribution" onUserFilter={onUserFilter} />
    <span className="h-5 w-px bg-line" aria-hidden="true" />
    <Ranking kind="guard" onUserFilter={onUserFilter} />
  </div>
}
