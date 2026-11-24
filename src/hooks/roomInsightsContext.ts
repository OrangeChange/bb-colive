import { createContext } from 'react'
import type { RoomInsightsState } from './useRoomInsights'

// 与可热更新的 Provider/展示组件分离，避免热更新后消费者读到另一份 Context。
export const InsightsContext = createContext<RoomInsightsState | null>(null)
