import { GoldRankBroadcast, b64ToBytes } from './proto.ts'

export interface LaplaceOnlineRankBase {
  name?: string
  face?: string
  name_color?: string
  is_mystery?: boolean
  name_color_str?: string
}

export interface LaplaceOnlineRankMedal {
  name?: string
  level?: string
  color_start?: string
  color_end?: string
  color_border?: string
  color?: string
  id?: string
  typ?: number
  is_light?: string
  ruid?: string
  guard_level?: string
  score?: string
  guard_icon?: string
  honor_icon?: string
  v2_medal_color_start?: string
  v2_medal_color_end?: string
  v2_medal_color_border?: string
  v2_medal_color_text?: string
  v2_medal_color_level?: string
  user_receive_count?: string
}

export interface LaplaceOnlineRankWealth {
  level?: string
  dm_icon_key?: string
}

export interface LaplaceOnlineRankTitle {
  old_title_css_id?: string
  title_css_id?: string
}

export interface LaplaceOnlineRankGuard {
  level?: string
  expired_str?: string
}

export interface LaplaceOnlineRankUserHeadFrame {
  id?: string
  frame_img?: string
}

export interface LaplaceOnlineRankGuardLeader {
  is_guard_leader?: boolean
}

export interface LaplaceOnlineRankUserInfo {
  uid?: string
  base?: LaplaceOnlineRankBase
  medal?: LaplaceOnlineRankMedal
  wealth?: LaplaceOnlineRankWealth
  title?: LaplaceOnlineRankTitle
  guard?: LaplaceOnlineRankGuard
  uhead_frame?: LaplaceOnlineRankUserHeadFrame
  guard_leader?: LaplaceOnlineRankGuardLeader
}

export interface LaplaceOnlineRankItem {
  uid: string
  face: string
  score: string
  uname: string
  rank: number
  guard_level: number
  is_mystery: boolean
  uinfo?: LaplaceOnlineRankUserInfo
}

export interface LaplaceOnlineRankUpdate {
  type: 'online-rank-update'
  message: '在线榜'
  list: LaplaceOnlineRankItem[]
}

export interface LaplaceOnlineUpdate {
  type: 'online-update'
  online?: number
  onlineText?: string
  count?: number
  countText?: string
}

export type LaplaceStateUpdate = LaplaceOnlineRankUpdate | LaplaceOnlineUpdate

type DecodedMessage = Record<string, any>

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function stringValue(value: unknown): string {
  if (value === undefined || value === null) return ''
  return String(value)
}

function int64String(value: unknown): string {
  return stringValue(value)
}

function numberValue(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function optionalString(value: DecodedMessage, key: string): string | undefined {
  return hasOwn(value, key) ? stringValue(value[key]) : undefined
}

function normalizeBase(value: DecodedMessage | undefined): LaplaceOnlineRankBase | undefined {
  if (!value) return undefined
  const result: LaplaceOnlineRankBase = {}
  const name = optionalString(value, 'name')
  const face = optionalString(value, 'face')
  const nameColor = hasOwn(value, 'nameColor') ? int64String(value.nameColor) : undefined
  const isMystery = hasOwn(value, 'isMystery') ? Boolean(value.isMystery) : undefined
  const nameColorStr = optionalString(value, 'nameColorStr')
  if (name !== undefined) result.name = name
  if (face !== undefined) result.face = face
  if (nameColor !== undefined) result.name_color = nameColor
  if (isMystery !== undefined) result.is_mystery = isMystery
  if (nameColorStr !== undefined) result.name_color_str = nameColorStr
  return Object.keys(result).length > 0 ? result : undefined
}

function normalizeMedal(value: DecodedMessage | undefined): LaplaceOnlineRankMedal | undefined {
  if (!value) return undefined
  const result: LaplaceOnlineRankMedal = {}
  const stringFields: Array<[keyof LaplaceOnlineRankMedal, string]> = [
    ['name', 'name'], ['level', 'level'], ['color_start', 'colorStart'], ['color_end', 'colorEnd'],
    ['color_border', 'colorBorder'], ['color', 'color'], ['id', 'id'], ['is_light', 'isLight'],
    ['ruid', 'ruid'], ['guard_level', 'guardLevel'], ['score', 'score'], ['guard_icon', 'guardIcon'],
    ['honor_icon', 'honorIcon'], ['v2_medal_color_start', 'v2MedalColorStart'],
    ['v2_medal_color_end', 'v2MedalColorEnd'], ['v2_medal_color_border', 'v2MedalColorBorder'],
    ['v2_medal_color_text', 'v2MedalColorText'], ['v2_medal_color_level', 'v2MedalColorLevel'],
    ['user_receive_count', 'userReceiveCount'],
  ]
  for (const [outputKey, inputKey] of stringFields) {
    if (hasOwn(value, inputKey)) (result as Record<string, unknown>)[outputKey] = int64String(value[inputKey])
  }
  if (hasOwn(value, 'typ')) result.typ = numberValue(value.typ)
  return Object.keys(result).length > 0 ? result : undefined
}

function normalizeWealth(value: DecodedMessage | undefined): LaplaceOnlineRankWealth | undefined {
  if (!value) return undefined
  const result: LaplaceOnlineRankWealth = {}
  const level = optionalString(value, 'level')
  const iconKey = optionalString(value, 'dmIconKey')
  if (level !== undefined) result.level = level
  if (iconKey !== undefined) result.dm_icon_key = iconKey
  return Object.keys(result).length > 0 ? result : undefined
}

function normalizeTitle(value: DecodedMessage | undefined): LaplaceOnlineRankTitle | undefined {
  if (!value) return undefined
  const result: LaplaceOnlineRankTitle = {}
  const oldTitle = optionalString(value, 'oldTitleCssId')
  const title = optionalString(value, 'titleCssId')
  if (oldTitle !== undefined) result.old_title_css_id = oldTitle
  if (title !== undefined) result.title_css_id = title
  return Object.keys(result).length > 0 ? result : undefined
}

function normalizeGuard(value: DecodedMessage | undefined): LaplaceOnlineRankGuard | undefined {
  if (!value) return undefined
  const result: LaplaceOnlineRankGuard = {}
  const level = optionalString(value, 'level')
  const expired = optionalString(value, 'expiredStr')
  if (level !== undefined) result.level = level
  if (expired !== undefined) result.expired_str = expired
  return Object.keys(result).length > 0 ? result : undefined
}

function normalizeUserHeadFrame(value: DecodedMessage | undefined): LaplaceOnlineRankUserHeadFrame | undefined {
  if (!value) return undefined
  const result: LaplaceOnlineRankUserHeadFrame = {}
  if (hasOwn(value, 'id')) result.id = int64String(value.id)
  const image = optionalString(value, 'frameImg')
  if (image !== undefined) result.frame_img = image
  return Object.keys(result).length > 0 ? result : undefined
}

function normalizeUserInfo(value: DecodedMessage | undefined): LaplaceOnlineRankUserInfo | undefined {
  if (!value) return undefined
  const result: LaplaceOnlineRankUserInfo = {}
  if (hasOwn(value, 'uid')) result.uid = int64String(value.uid)
  const base = normalizeBase(value.base)
  const medal = normalizeMedal(value.medal)
  const wealth = normalizeWealth(value.wealth)
  const title = normalizeTitle(value.title)
  const guard = normalizeGuard(value.guard)
  const headFrame = normalizeUserHeadFrame(value.uheadFrame)
  if (base) result.base = base
  if (medal) result.medal = medal
  if (wealth) result.wealth = wealth
  if (title) result.title = title
  if (guard) result.guard = guard
  if (headFrame) result.uhead_frame = headFrame
  if (value.guardLeader && hasOwn(value.guardLeader, 'isGuardLeader')) {
    result.guard_leader = { is_guard_leader: Boolean(value.guardLeader.isGuardLeader) }
  }
  return Object.keys(result).length > 0 ? result : undefined
}

function normalizeItem(value: DecodedMessage): LaplaceOnlineRankItem {
  return {
    uid: hasOwn(value, 'uid') ? int64String(value.uid) : '',
    face: hasOwn(value, 'face') ? stringValue(value.face) : '',
    score: hasOwn(value, 'score') ? stringValue(value.score) : '',
    uname: hasOwn(value, 'uname') ? stringValue(value.uname) : '',
    rank: hasOwn(value, 'rank') ? numberValue(value.rank) : 0,
    guard_level: hasOwn(value, 'guardLevel') ? numberValue(value.guardLevel) : 0,
    is_mystery: hasOwn(value, 'isMystery') ? Boolean(value.isMystery) : false,
    ...(normalizeUserInfo(value.uinfo) ? { uinfo: normalizeUserInfo(value.uinfo) } : {}),
  }
}

/** 将 ONLINE_RANK_V3 的 base64 protobuf 转为 Laplace 的 online-rank-update。 */
export function parseOnlineRankV3(pb: string): LaplaceOnlineRankUpdate | null {
  if (typeof pb !== 'string' || !pb.trim()) return null
  try {
    const decoded = GoldRankBroadcast.decode(b64ToBytes(pb)) as DecodedMessage
    const rows = decoded.rankType === 'online_rank' ? decoded.onlineList : decoded.list
    return {
      type: 'online-rank-update',
      message: '在线榜',
      list: Array.isArray(rows) ? rows.map(normalizeItem) : [],
    }
  } catch {
    return null
  }
}

function optionalNumber(value: unknown): number | undefined {
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function optionalText(value: DecodedMessage, key: string): string | undefined {
  return hasOwn(value, key) ? stringValue(value[key]) : undefined
}

function adaptOnlineRankCount(data: DecodedMessage): LaplaceOnlineUpdate {
  const online = optionalNumber(data.online_count)
  const count = optionalNumber(data.count)
  return {
    type: 'online-update',
    ...(online === undefined ? {} : { online }),
    ...(optionalText(data, 'online_count_text') === undefined ? {} : { onlineText: optionalText(data, 'online_count_text') }),
    ...(count === undefined ? {} : { count }),
    ...(optionalText(data, 'count_text') === undefined ? {} : { countText: optionalText(data, 'count_text') }),
  }
}

/**
 * 兼容 Laplace 的状态更新入口。
 * V3/VCOUNT 不进入现有事件适配器，故不会改变时间线、统计 store 或普通筛选。
 */
export function adaptLaplaceStateMessage(message: { cmd?: unknown; data?: unknown }): LaplaceStateUpdate | null {
  const command = String(message?.cmd ?? '').split(':')[0]
  if (command === 'ONLINE_RANK_V3') {
    const data = message.data
    const pb = data && typeof data === 'object' ? (data as DecodedMessage).pb : undefined
    return typeof pb === 'string' ? parseOnlineRankV3(pb) : null
  }
  if (command === 'ONLINE_RANK_COUNT') {
    return adaptOnlineRankCount(message.data && typeof message.data === 'object' ? message.data as DecodedMessage : {})
  }
  return null
}
