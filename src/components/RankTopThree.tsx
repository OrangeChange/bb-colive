import { useEffect, useRef } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { RankUser } from '../protocol/roomInsights'
import { RankAvatar } from './RoomInsightsView'

/** UID 固定身份，名次只决定位置；升名次向左，降名次及离榜向右。 */
export function RankTopThree({ users, pending }: { users: RankUser[]; pending: boolean }) {
  const reducedMotion = useReducedMotion()
  const previous = useRef<RankUser[]>([])
  const shown = pending && !users.length ? previous.current : users.slice(0, 3)
  useEffect(() => { if (!pending || users.length) previous.current = users.slice(0, 3) }, [users, pending])
  return <span className="relative inline-block h-7 w-[66px] shrink-0 overflow-clip" style={{ overflowClipMargin: 'calc(24px * .1)' }} aria-hidden="true">
    {[0, 1, 2].map(index => <span key={index} className="absolute top-0.5" style={{ left: 2 + index * 18 }}><RankAvatar size={24} /></span>)}
    <AnimatePresence initial={false}>
      {shown.map((user, index) => <motion.span key={user.uid} data-rank-uid={user.uid}
        className="absolute left-0.5 top-0.5" style={{ zIndex: 3 - index }}
        initial={{ x: 60, opacity: 0 }} animate={{ x: index * 18, opacity: 1 }} exit={{ x: 60, opacity: 0 }}
        transition={{ duration: reducedMotion ? 0 : 0.3, ease: 'easeInOut' }}>
        <RankAvatar user={user} size={24} />
      </motion.span>)}
    </AnimatePresence>
  </span>
}
