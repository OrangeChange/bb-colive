import { redPocketWinnerAvatar } from "./redPocketWinnerAvatar.ts";
/**
 * 统一弹幕模型 adapter：@laplace.live/ws 的 'msg' 裸事件 -> DanmakuEvent
 *
 * 关键规则（danmu_tool/architecture.md §三 / requirements.md §五）：
 * - cmd 归一化：`cmd.split(':')[0]`（DANMU_MSG:4:0:2:2:2:0 与 DANMU_MSG 同路径；
 *   注意不能 includes('DANMU_MSG')，会误吞 RECALL_DANMU_MSG）
 * - guard_level 线上原始语义全网统一 0无 1总督 2提督 3舰长（blivedm 权威确认），
 *   模型语义 0无 1舰长 2提督 3总督，此处完成换算
 * - 主播身份：消息不携带主播标记，用 uid === ctx.anchorUid（room_init 的 uid）判断
 * - 房管身份：DANMU_MSG info[2][2] === 1（userType，blivedm: admin=info[2][2]）
 * - 超长 UID 一律 string
 *
 * V2 命令：部分房间（如 21696950）只下发 V2 版，data.pb 为 base64 protobuf。
 *   SEND_GIFT_V2 / INTERACT_WORD_V2 现已解码复用对应 V1 分支。
 *   ONLINE_RANK_V2/V3 仍不转为事件（榜单快照，非事件流）；V3 的 Laplace 兼容状态输出
 *   在 laplaceCompatibility.ts 独立解析，避免改变现有事件时间线。
 * 字段来源：blivedm models/web.py + @laplace.live/internal bilibili.d.ts + 真机抓包解码
 */
import { MsgType, DanmakuEvent, DanmakuUser, AdapterContext, AdapterRuntime, GuardLevel, GiftInfo, GuardAction, InteractKind, FanMedalInfo, LotteryAward } from './types'
import { InteractWordV2, SendGiftV2, b64ToBytes } from './proto'
import { getGiftIcon } from './gifts'
import { onlineRankStats } from './roomInsights'
import { captureLaplaceSourceMetadata } from '../compat/laplace/sourceMetadata'
import { NON_EVENT_PROTOCOL_COMMANDS } from './nonEventCommands'
import { parseRoomLockExpiry } from './roomLock.ts'
import { activityTimingFromPayload } from '../events/activityTiming'
import { GUARD_HONOR_TIERS, guardHonorThreshold } from './guardHonor.ts'

/** 线上原始 guard_level/privilege_type -> 模型语义 */
export const wireToModelGuard = (wire: number | undefined): GuardLevel => {
  const v = Number(wire) || 0
  if (v <= 0) return 0
  if (v > 3) return 3
  return (4 - v) as GuardLevel // 1总督->3 2提督->2 3舰长->1
}

/** 事件时间：线上存在秒/毫秒/微秒/纳秒多种精度（ENTRY_EFFECT trigger_time 实测为纳秒），统一到毫秒 */
const toMs = (t: number | undefined, now: () => number = Date.now): number => {
  const v = Number(t) || 0
  if (v <= 0) return now()
  if (v < 1e12) return v * 1000                 // 秒
  if (v > 1e17) return Math.round(v / 1e6)      // 纳秒
  if (v > 1e15) return Math.round(v / 1e3)      // 微秒
  return v                                      // 毫秒
}

const optionalNumber = (value: unknown): number | undefined => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN
  return Number.isFinite(parsed) ? parsed : undefined
}

type UserWealthInfo = Pick<DanmakuUser, 'wealthLevel' | 'wealthIconKey' | 'wealthIconUrl'>

function wealthInfoFromPayload(raw: any): UserWealthInfo | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const level = optionalNumber(raw.level)
  const iconKey = typeof (raw.dm_icon_key ?? raw.dmIconKey) === 'string'
    ? String(raw.dm_icon_key ?? raw.dmIconKey).trim()
    : ''
  const iconUrl = typeof (raw.url ?? raw.icon_url) === 'string'
    ? String(raw.url ?? raw.icon_url).trim()
    : ''
  const wealth: UserWealthInfo = {
    ...(level !== undefined && level > 0 ? { wealthLevel: level } : {}),
    ...(iconKey ? { wealthIconKey: iconKey } : {}),
    ...(iconUrl ? { wealthIconUrl: iconUrl } : {}),
  }
  return Object.keys(wealth).length > 0 ? wealth : undefined
}

function rememberUserWealth(
  ctx: AdapterContext,
  uid: number | string | undefined,
  incoming?: UserWealthInfo,
): UserWealthInfo | undefined {
  if (uid === undefined || uid === null || uid === '') return undefined
  const uidStr = String(uid)
  const previous = ctx.wealthByUid?.get(uidStr)
  if (!incoming && !previous) return undefined

  const wealthByUid = ctx.wealthByUid ?? (ctx.wealthByUid = new Map())
  const iconUrlsByLevel = ctx.wealthIconUrlsByLevel ?? (ctx.wealthIconUrlsByLevel = new Map())
  const incomingLevel = incoming?.wealthLevel
  const levelChanged = incomingLevel !== undefined
    && previous?.wealthLevel !== undefined
    && incomingLevel !== previous.wealthLevel
  const wealthLevel = incomingLevel ?? previous?.wealthLevel
  if (wealthLevel !== undefined && wealthLevel > 0 && incoming?.wealthIconUrl) {
    iconUrlsByLevel.set(wealthLevel, incoming.wealthIconUrl)
  }

  const wealth: UserWealthInfo = {
    ...(wealthLevel !== undefined ? { wealthLevel } : {}),
    ...((incoming?.wealthIconKey || (!levelChanged && previous?.wealthIconKey))
      ? { wealthIconKey: incoming?.wealthIconKey || previous?.wealthIconKey }
      : {}),
    ...((incoming?.wealthIconUrl
      || (wealthLevel !== undefined && iconUrlsByLevel.get(wealthLevel))
      || (!levelChanged && previous?.wealthIconUrl))
      ? { wealthIconUrl: incoming?.wealthIconUrl
        || (wealthLevel !== undefined ? iconUrlsByLevel.get(wealthLevel) : undefined)
        || previous?.wealthIconUrl }
      : {}),
  }
  if (Object.keys(wealth).length === 0) return undefined
  wealthByUid.set(uidStr, wealth)
  return wealth
}

let seq = 0
const genId = (prefix: string) => `${prefix}-${Date.now()}-${seq++}`

/** 原始粉丝牌的 is_light / is_lighted 统一为模型布尔值。 */
function medalLighted(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'boolean') return value
  const n = Number(value)
  return Number.isFinite(n) ? n === 1 : undefined
}

function medalBelongsToCurrentRoom(raw: any, currentAnchorUid?: string): boolean | undefined {
  if (!currentAnchorUid) return undefined
  const rawAnchorUid = raw?.anchorUid ?? raw?.anchor_uid ?? raw?.ruid ?? raw?.target_id
  if (rawAnchorUid == null || rawAnchorUid === '') return undefined
  return String(rawAnchorUid) === currentAnchorUid
}

function currentRoomGuardIconUrl(raw: any, currentAnchorUid?: string): string | undefined {
  if (!currentAnchorUid) return undefined
  const rawAnchorUid = raw?.anchorUid ?? raw?.anchor_uid ?? raw?.ruid ?? raw?.target_id
  if (rawAnchorUid === undefined || rawAnchorUid === null || rawAnchorUid === ''
    || String(rawAnchorUid) !== currentAnchorUid) return undefined
  const icon = raw?.guard_icon ?? raw?.guardIconUrl
  const iconUrl = typeof icon === 'string' ? icon.trim() : ''
  return iconUrl || undefined
}

function currentRoomMedalGuardLevel(raw: any, currentAnchorUid?: string): number | undefined {
  if (medalBelongsToCurrentRoom(raw, currentAnchorUid) !== true) return undefined
  return optionalNumber(raw?.guard_level ?? raw?.guardLevel)
}

/** 兼容 V1 JSON、V2 protobuf 和不同事件命名的粉丝牌字段。 */
function medalFromPayload(raw: any, currentAnchorUid?: string): FanMedalInfo | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const name = raw.name ?? raw.medal_name
  const level = raw.level ?? raw.medal_level
  const guardIconUrl = currentRoomGuardIconUrl(raw, currentAnchorUid)
  if (!name && (level === undefined || level === null) && !guardIconUrl) return undefined
  const rawAnchorUid = raw.anchorUid ?? raw.anchor_uid ?? raw.ruid ?? raw.target_id
  const anchorUid = rawAnchorUid !== undefined && rawAnchorUid !== null && rawAnchorUid !== ''
    ? String(rawAnchorUid)
    : undefined
  const isLighted = medalLighted(raw.isLighted ?? raw.is_light ?? raw.is_lighted)
  const rawGuardLevel = optionalNumber(raw.guardLevel ?? raw.guard_level)
  const guardLevel = rawGuardLevel === undefined ? undefined : wireToModelGuard(rawGuardLevel)
  const type = optionalNumber(raw.type ?? raw.typ)
  return {
    name: String(name ?? ''),
    level: Number(level ?? 0),
    ...(guardLevel !== undefined ? { guardLevel } : {}),
    ...(type !== undefined ? { type } : {}),
    ...((raw.anchorName || raw.anchor_uname) ? { anchorName: String(raw.anchorName || raw.anchor_uname) } : {}),
    ...(Number(raw.anchorRoomId ?? raw.anchor_roomid) > 0 ? { anchorRoomId: Number(raw.anchorRoomId ?? raw.anchor_roomid) } : {}),
    ...(guardIconUrl ? { guardIconUrl } : {}),
    ...(anchorUid ? { anchorUid } : {}),
    ...(currentAnchorUid && medalBelongsToCurrentRoom(raw, currentAnchorUid) !== undefined
      ? { isCurrentRoom: medalBelongsToCurrentRoom(raw, currentAnchorUid) }
      : {}),
    ...(isLighted !== undefined ? { isLighted } : {}),
  }
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'boolean') return value
  const n = Number(value)
  return Number.isFinite(n) ? n !== 0 : undefined
}

type UserProfileInfo = Pick<DanmakuUser, 'currentRank' | 'phoneVerified' | 'sendType' | 'userLevel' | 'userLevelBorder'>

/** 从用户资料块保留 Laplace 兼容所需的原始资料；缺失时不猜测。 */
function userProfileFromPayload(raw: any, fallback: UserProfileInfo = {}): UserProfileInfo | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const currentRank = optionalNumber(raw.currentRank ?? raw.current_rank)
  const phoneVerified = optionalBoolean(raw.phoneVerified ?? raw.phone_verified)
  const sendType = optionalNumber(raw.sendType ?? raw.send_type)
  const userLevel = optionalNumber(raw.userLevel ?? raw.user_level ?? raw.userLvl ?? raw.user_lvl)
  const userLevelBorder = optionalNumber(raw.userLevelBorder ?? raw.user_level_border ?? raw.userLvlBorder ?? raw.user_lvl_border)
  const profile: UserProfileInfo = {
    ...fallback,
    ...(currentRank !== undefined ? { currentRank } : {}),
    ...(phoneVerified !== undefined ? { phoneVerified } : {}),
    ...(sendType !== undefined ? { sendType } : {}),
    ...(userLevel !== undefined ? { userLevel } : {}),
    ...(userLevelBorder !== undefined ? { userLevelBorder } : {}),
  }
  return Object.keys(profile).length > 0 ? profile : undefined
}

/** 瓜子价格 -> 人民币元（金瓜子 1000=1元）；银瓜子返回 0 */
const toRmb = (price: number | undefined, coinType?: string): number => {
  if (coinType === 'silver') return 0
  const v = Number(price) || 0
  // 金瓜子 1000=1元，保留两位分（粉丝团灯牌 100 金瓜子=0.1元，不能被整数除成 0 误判免费）
  return Math.round(v / 10) / 100
}

/**
 * 大航海最终动作以服务端 toast_msg 为准。
 * op_type 在真机样本中出现过「1 + 续费」，不能单独作为显示文案来源。
 */
const extractGuardAction = (text: unknown): GuardAction | undefined => {
  if (typeof text !== 'string') return undefined
  const action = text.match(/开通|续费|升级|降级/)?.[0]
  return action as GuardAction | undefined
}

/** INTERACT_WORD V1/V2 的 msg_type -> 稳定业务子类型。 */
export const interactKindFromWireType = (value: unknown): InteractKind | undefined => {
  switch (Number(value)) {
    case 1: return 'entry'
    case 2: return 'follow'
    case 3: return 'share'
    case 4: return 'specialFollow'
    case 5: return 'mutualFollow'
    default: return undefined
  }
}

/** 构造带人民币换算字段的 GiftInfo */
function makeGift(
  id: number, name: string, count: number,
  price: number, coinType: string, total: number,
  opts: Partial<Pick<GiftInfo,
    'icon' | 'webp' | 'gif'
    | 'effect' | 'effectId' | 'comboStayTime' | 'broadcastId' | 'hasImagedGift'
    | 'blindGiftName' | 'blindWebp' | 'blindGif' | 'blindIcon'
    | 'blindPriceRmb' | 'blindHitPriceRmb' | 'paymentRmb'
  >> = {},
): GiftInfo {
  const isFree = coinType === 'silver' || (!coinType && !price)
  return {
    id, name, count, price, coinType, total,
    icon: opts.icon,
    webp: opts.webp,
    gif: opts.gif,
    effect: opts.effect,
    effectId: opts.effectId,
    comboStayTime: opts.comboStayTime,
    broadcastId: opts.broadcastId,
    hasImagedGift: opts.hasImagedGift,
    blindGiftName: opts.blindGiftName,
    blindWebp: opts.blindWebp,
    blindGif: opts.blindGif,
    blindIcon: opts.blindIcon,
    isFree,
    priceRmb: toRmb(price, coinType),
    totalRmb: toRmb(total, coinType),
    blindPriceRmb: opts.blindPriceRmb,
    blindHitPriceRmb: opts.blindHitPriceRmb,
    paymentRmb: opts.paymentRmb,
  }
}

/** 红包开始事件的奖励清单；当前报文只保证名称和数量，不臆造奖励单价。 */
function normalizeRedPocketAwards(raw: unknown): LotteryAward[] | undefined {
  const items = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? Object.values(raw)
      : []
  const awards = items.map((item: any) => {
    const name = String(item?.gift_name ?? item?.award_name ?? item?.name ?? '').trim()
    const count = Number(item?.num ?? item?.award_num ?? item?.count ?? 0)
    const id = Number(item?.gift_id ?? item?.award_id ?? item?.id ?? 0)
    if (!name || !Number.isFinite(count) || count <= 0) return null
    return { id: Number.isFinite(id) ? id : 0, name, count }
  }).filter((award): award is LotteryAward => award !== null)
  return awards.length > 0 ? awards : undefined
}

/** 解码 INTERACT_WORD_V2 的 pb -> 适配用字段 */
function decodeInteractWordV2(pbB64: string, currentAnchorUid?: string) {
  const msg = InteractWordV2.decode(b64ToBytes(pbB64)) as any
  const uinfo = msg.uinfo ?? {}
  const base = uinfo.base ?? {}
  // 大航海：顶层字段16（optional），uinfo.guard 兜底；均缺失即普通用户
  const guard = msg.guardLevel ?? uinfo.guard?.level
  const medal = msg.medal ?? uinfo.medalInfo
  const medalWithGuard = medal && guard !== undefined ? { ...medal, guard_level: guard } : medal
  return {
    uid: String(msg.uid ?? uinfo.uid ?? ''),
    uname: msg.uname ?? base.name ?? '',
    face: base.face || undefined,
    msgType: msg.msgType ?? 1,
    // 字段 7 秒级 ts（可靠）；字段 8 是 score 积分非时间戳，勿用
    tsSec: msg.tsSec ? Number(msg.tsSec) : undefined,
    // 字段 15 纳秒级时间保持字符串，避免超过 JS 安全整数范围后丢精度
    tsNano: msg.tsNano ? String(msg.tsNano) : undefined,
    guardLevel: guard,
    wealth: wealthInfoFromPayload(uinfo.wealth),
    medal: medalFromPayload(medalWithGuard, currentAnchorUid),
  }
}

/** INTERACT_WORD_V2 的稳定去重键；无时间字段时返回 undefined，避免误吞合法事件。 */
export function interactWordV2DedupeKey(value: {
  uid: string
  msgType: number
  tsSec?: number
  tsNano?: string
}): string | undefined {
  const uid = value.uid.trim()
  const timestamp = value.tsNano?.trim() || (Number.isFinite(value.tsSec) ? String(value.tsSec) : '')
  if (!uid || !timestamp) return undefined
  return `interact-v2:${uid}:${value.msgType}:${timestamp}`
}

/** 解码 SEND_GIFT_V2 的 pb -> 适配用字段
 *  字段映射（80397 + 22625027 真机，共 33323 条样本顶层结构一致）：
 *    1=uid  2=uname(string)  3=face  8=粉丝勋章块(非礼物!)  9=盲盒信息  10=重复礼物块
 *  礼物块：5=单价 6=单价副本候选 7=支付总金额 8=coinType 35=icon{1:png 2:webp 5:gif}
 *  普通与盲盒支付样本依据见 docs/research/gift-price-fields-analysis.md。
 *  银瓜子礼物(粉丝团灯牌等)无 field 7，总价按 0 处理（免费） */
function decodeSendGiftV2(pbB64: string, currentAnchorUid?: string) {
  const msg = SendGiftV2.decode(b64ToBytes(pbB64)) as any
  const gifts = (Array.isArray(msg.gift) ? msg.gift : msg.gift ? [msg.gift] : []).map((g: any) => {
    const icon = g.icon ?? {}
    return {
      giftId: Number(g.giftId ?? 0),
      giftName: g.name ?? '',
      num: Number(g.num ?? 1),
      price: Number(g.price ?? 0),
      totalCoin: Number(g.totalCoin ?? 0),
      paymentCoin: Object.prototype.hasOwnProperty.call(g, 'totalCoin') ? Number(g.totalCoin) : undefined,
      coinType: g.coinType ?? 'gold',
      itemId: g.itemId ? String(g.itemId) : undefined,
      timestamp: g.timestamp != null ? Number(g.timestamp) : undefined,
      icon: icon.png || undefined,
      webp: icon.webp || undefined,
      gif: icon.gif || undefined,
      effect: optionalNumber(g.effect),
      effectId: optionalNumber(g.effectId ?? g.effect_id),
      comboStayTime: optionalNumber(g.comboStayTime ?? g.combo_stay_time),
      broadcastId: optionalNumber(g.broadcastId ?? g.broadcast_id),
      hasImagedGift: optionalNumber(g.hasImagedGift ?? g.has_imaged_gift),
    }
  })
  const blind = msg.blindGift
  const medalPayload = msg.userInfo?.medal?.name ? msg.userInfo.medal : msg.medalBlock
  const medal = medalFromPayload(medalPayload, currentAnchorUid)
  return {
    uid: String(msg.uid ?? ''),
    uname: msg.uname ?? '',
    face: msg.face || undefined,
    // 粉丝牌保留实际归属；只有确认属于当前主播的牌才能补充大航海身份。
    // 少数真机样本 field 5=0，但当前房间牌仍带 guardLevel；仅在归属当前房间时使用其兜底。
    guardLevel: Number(msg.guardLevel) || currentRoomMedalGuardLevel(medalPayload, currentAnchorUid) || undefined,
    medal,
    wealth: wealthInfoFromPayload(msg.userInfo?.wealth) ?? wealthInfoFromPayload(msg.wealth),
    blindGift: blind
      ? {
          giftId: Number(blind.giftId ?? 0),
          name: blind.name ?? '',
          price: Number(blind.price ?? 0),
        }
      : undefined,
    gifts,
  }
}

function makeUser(
  ctx: AdapterContext,
  uid: number | string | undefined,
  uname: string | undefined,
  face?: string,
  wireGuard?: number,
  medal?: FanMedalInfo,
  isAdmin?: boolean,
  wealth?: UserWealthInfo,
  profile?: UserProfileInfo,
): DanmakuUser | undefined {
  if (uid === undefined || uid === null || uid === '') return undefined
  const uidStr = String(uid)
  const userWealth = rememberUserWealth(ctx, uidStr, wealth)
  const avatarsByUid = ctx.avatarsByUid ?? (ctx.avatarsByUid = new Map())
  if (face) avatarsByUid.set(uidStr, face)
  const guardLevel = wireToModelGuard(wireGuard)
  const guardIconUrlsByUid = ctx.guardIconUrlsByUid ?? (ctx.guardIconUrlsByUid = new Map())
  const observedIconUrl = guardLevel > 0 && medal?.isCurrentRoom === true ? medal.guardIconUrl : undefined
  if (observedIconUrl) guardIconUrlsByUid.set(uidStr, observedIconUrl)
  const guardIconUrl = guardLevel > 0 ? observedIconUrl ?? guardIconUrlsByUid.get(uidStr) : undefined
  const roomGuardProfile = guardLevel > 0 ? ctx.roomGuardProfile : undefined
  return {
    uid: uidStr,
    uname: uname ?? '',
    avatar: face || avatarsByUid.get(uidStr),
    guardLevel,
    ...(guardIconUrl ? { guardIconUrl } : {}),
    ...(roomGuardProfile ? {
      guardMilestone: roomGuardProfile.milestone,
      guardIconSet: roomGuardProfile.iconSet,
    } : {}),
    ...userWealth,
    ...profile,
    isAnchor: uidStr === ctx.anchorUid || undefined,
    isAdmin: isAdmin || undefined,
    medal,
  }
}

/** DANMU_MSG.extra 中的结构化 reply 目标；没有 UID 和昵称时不生成伪用户。 */
function replyUserFromExtra(ctx: AdapterContext, extra: any): DanmakuUser | undefined {
  const replyInfo = extra?.reply_uinfo && typeof extra.reply_uinfo === 'object' ? extra.reply_uinfo : {}
  const replyBase = replyInfo.base && typeof replyInfo.base === 'object' ? replyInfo.base : {}
  const uid = replyInfo.uid ?? extra?.reply_mid
  const uname = replyBase.name ?? extra?.reply_uname
  if (uid === undefined || uid === null || uid === '' || typeof uname !== 'string' || !uname.trim()) return undefined
  return makeUser(ctx, uid, uname, typeof replyBase.face === 'string' ? replyBase.face : undefined)
}

function medalFromInfo(info3: any[], payload?: any, currentAnchorUid?: string): DanmakuUser['medal'] | undefined {
  if (!info3 || info3.length === 0) return undefined
  return medalFromPayload({
    ...payload,
    level: info3[0] ?? payload?.level ?? 0,
    name: info3[1] ?? payload?.name ?? '',
    anchorName: info3[2] || payload?.anchorName || undefined,
    anchorRoomId: info3[3] || payload?.anchorRoomId,
    anchorUid: info3[12] || payload?.anchorUid,
    is_light: payload?.is_light ?? payload?.is_lighted ?? info3[11],
  }, currentAnchorUid)
}

/** 事件诊断和 UI 日志共用的稳定显示键；React 冲突键优先于业务 id。 */
export function getEventId(event: Pick<DanmakuEvent, 'id' | 'reactKey'>): string {
  return event.reactKey ?? event.id
}

/** msg 总线事件 -> DanmakuEvent；无法识别/不处理返回 null */
export function adapt(msg: any, ctx: AdapterContext, runtime?: AdapterRuntime): DanmakuEvent | DanmakuEvent[] | null {
  const result = adaptCanonical(msg, ctx, runtime)
  if (!result) return result
  const captured = captureLaplaceSourceMetadata(msg, ctx, runtime?.now())
  const sources = Array.isArray(captured) ? captured : captured ? [captured] : []
  const events = Array.isArray(result) ? result : [result]
  if (sources.length !== events.length) return result
  events.forEach((event, index) => {
    const source = sources[index]
    if (!source.event && !source.deleteIds) return
    if (source.event) {
      const original = source.event
      if (event.gift && Number(original.giftId) !== event.gift.id) return
      const user = event.user
      source.event = { ...original, timestampNormalized: event.ts,
        ...(user ? { uid: user.uid, username: user.uname,
          avatar: user.avatar || original.avatar,
          guardType: user.guardLevel ? 4 - user.guardLevel : 0,
          ...(user.medal ? { medal: { ...original.medal, name: user.medal.name, level: user.medal.level,
            guardType: user.medal.guardLevel ? 4 - user.medal.guardLevel : 0,
            lightened: user.medal.isLighted, uid: user.medal.anchorUid, room: 0,
            type: user.medal.type ?? 0 } } : source.sourceCommand === 'SEND_GIFT_V2' ? { medal: { name: '', level: 0, guardType: 0, room: 0, type: 0 } } : {}) } : {}) }
    }
    event.laplace = JSON.parse(JSON.stringify(source))
  })
  return result
}

function adaptCanonical(msg: any, ctx: AdapterContext, runtime?: AdapterRuntime): DanmakuEvent | DanmakuEvent[] | null {
  const now = runtime?.now ?? Date.now
  const createId = runtime?.createId ?? genId
  const giftIcon = runtime?.getGiftIcon ?? getGiftIcon
  if (!msg || typeof msg !== 'object') return null
  const rawCmd: string = msg.cmd || msg.msg?.cmd || ''
  const cmd = rawCmd.split(':')[0]

  const base = (over: Partial<DanmakuEvent>): DanmakuEvent => ({
    id: createId(cmd),
    msgType: MsgType.Unknown,
    roomId: ctx.roomId,
    ts: now(),
    ...(ctx.keepRaw ? { raw: msg } : {}),
    ...over,
  } as DanmakuEvent)

  switch (cmd) {
    // ---------- 弹幕 ----------
    case 'DANMU_MSG': {
      const info = msg.info
      if (!Array.isArray(info)) return null
      const dmMeta = info[0] ?? []
      const text = typeof info[1] === 'string' ? info[1] : String(info[1] ?? '')
      // extra 是 JSON 字符串：content=完整内容（大表情=表情名、小表情=含 [xx] 占位符全文）、emots=小表情映射
      let extra: any = {}
      try { extra = JSON.parse(dmMeta[15]?.extra ?? '{}') } catch { /* 保持空对象 */ }
      const rawWealth = wealthInfoFromPayload(dmMeta[15]?.user?.wealth)
      const danmuWealthLevel = optionalNumber(info[16]?.[0])
      const danmuWealthIconKey = typeof extra.icon?.prefix?.resource === 'string'
        ? extra.icon.prefix.resource
        : undefined
      const danmuWealth: UserWealthInfo | undefined = rawWealth || (danmuWealthLevel !== undefined && danmuWealthLevel > 0) || danmuWealthIconKey
        ? {
            ...(rawWealth ?? {}),
            ...(danmuWealthLevel !== undefined && danmuWealthLevel > 0 ? { wealthLevel: danmuWealthLevel } : {}),
            ...(danmuWealthIconKey ? { wealthIconKey: danmuWealthIconKey } : {}),
          }
        : undefined

      // 大表情：info[0][13]（判定不依赖 dm_type，字段有货即真，协议异常可自然降级）
      const emo = dmMeta[13]
      const emoticon = emo?.url && typeof emo.url === 'string'
        ? {
            url: emo.url,
            width: Number(emo.width) || 0,
            height: Number(emo.height) || 0,
            unique: emo.emoticon_unique || undefined,
          }
        : undefined

      // 小表情：extra.emots（"[dog]": {url, width, height}）
      let emotes: Record<string, { url: string; width: number; height: number }> | undefined
      if (extra.emots && typeof extra.emots === 'object') {
        const out: Record<string, { url: string; width: number; height: number }> = {}
        for (const [k, v] of Object.entries(extra.emots)) {
          const e = v as any
          if (e?.url) out[k] = { url: e.url, width: Number(e.width) || 20, height: Number(e.height) || 20 }
        }
        if (Object.keys(out).length > 0) emotes = out
      }

      // 表情弹幕的 text 是占位符 "1"（真机 7777 十三条样本确认），真实内容以 extra.content 为准
      const content = typeof extra.content === 'string' && extra.content ? extra.content : ''
      const finalText = emoticon
        ? (content || '[表情]')
        : emotes
          ? (content || text)
          : text
      const replyTo = replyUserFromExtra(ctx, extra)
      const userLevel = optionalNumber(info[4]?.[0])
      const userLevelBorder = optionalNumber(info[4]?.[1])
      const currentRank = optionalNumber(info[4]?.[4])
      const phoneVerified = info[2]?.[6] === 1 ? true : info[2]?.[6] === 0 ? false : undefined

      // id 用 rnd（撤回配对依赖它）；去重键在复合键后追加原始消息时间戳：
      // 服务器重推可能换 id_str，而 rnd 也并非每条唯一（同用户短时间连发可能共享 rnd）。
      // 同一用户后来发送相同内容时，原始消息时间会变化，必须保留为新弹幕；
      // 同一消息实例的重推若保留原始消息时间，则作为重复过滤。
      const rnd = String(dmMeta[5] ?? createId('danmu'))
      const uid = String(info[2]?.[0] ?? '')
      const messageTs = toMs(dmMeta[4], now)
      return base({
        id: rnd,
        dedupe: `${rnd}|${uid}|${finalText}|${messageTs}`,
        msgType: MsgType.Danmu,
        ts: messageTs,
        // 头像在 info[0][15].user.base.face（V2 uinfo 风格内嵌，510 真机样本确认）
        user: makeUser(
          ctx,
          info[2]?.[0],
          info[2]?.[1],
          dmMeta[15]?.user?.base?.face,
          info[7],
          medalFromInfo(info[3], dmMeta[15]?.user?.medal, ctx.anchorUid),
          info[2]?.[2] === 1,
          danmuWealth,
          {
            ...userProfileFromPayload(dmMeta[15]?.user, {
            ...(currentRank !== undefined ? { currentRank } : {}),
            ...(userLevel !== undefined ? { userLevel } : {}),
            ...(userLevelBorder !== undefined ? { userLevelBorder } : {}),
            }),
            ...(phoneVerified !== undefined ? { phoneVerified } : {}),
          },
        ),
        ...(replyTo ? { replyTo } : {}),
        text: finalText,
        danmakuSendType: typeof dmMeta[9] === 'number' ? dmMeta[9] : undefined,
        isAutoDanmaku: typeof dmMeta[9] === 'number' && dmMeta[9] !== 0,
        emoticon,
        emotes,
      })
    }

    case 'RECALL_DANMU_MSG': {
      const d = msg.data ?? {}
      return base({
        msgType: MsgType.Recall,
        recallType: optionalNumber(d.recall_type),
        user: makeUser(ctx, d.target_id, d.user_info?.uname, d.user_info?.face),
        recallTarget: d.msg_id !== undefined ? String(d.msg_id) : undefined,
        text: '撤回了一条弹幕',
      })
    }

    // ---------- 礼物 / SC / 上舰 ----------
    case 'SEND_GIFT': {
      const d = msg.data ?? {}
      // medal_info 可能是别的主播/收礼侧牌；sender_uinfo.medal 才是发送者在当前房间的牌。
      const senderMedal = d.sender_uinfo?.medal
      const medal = medalFromPayload(senderMedal, ctx.anchorUid)
      const wireGuard = Number(d.guard_level) || currentRoomMedalGuardLevel(senderMedal, ctx.anchorUid) || undefined
      const configuredGift = giftIcon(Number(d.giftId ?? 0))
      return base({
        msgType: MsgType.Gift,
        ts: toMs(d.timestamp ?? d.ts, now),
        comboId: d.combo_send?.combo_id || undefined,
        user: makeUser(ctx, d.uid, d.uname, d.face, wireGuard, medal, undefined, undefined, userProfileFromPayload(d.sender_uinfo)),
        gift: makeGift(
          d.giftId ?? 0, d.giftName ?? '', d.num ?? 1,
          d.price ?? 0, d.coin_type ?? 'gold', d.total_coin ?? 0,
          {
            icon: d.gift_info?.img_basic ?? (d.gift_icon || undefined),
            webp: d.gift_info?.webp || undefined,
            gif: d.gift_info?.gif || undefined,
            effect: optionalNumber(d.gift_info?.effect ?? configuredGift?.effect),
            effectId: optionalNumber(d.gift_info?.effect_id ?? configuredGift?.effectId),
            comboStayTime: optionalNumber(d.combo_stay_time),
            broadcastId: optionalNumber(d.broadcast_id),
            hasImagedGift: optionalNumber(d.gift_info?.has_imaged_gift ?? configuredGift?.hasImagedGift),
            blindGiftName: d.blind_gift?.original_gift_name || undefined,
            // 盲盒本体图标：报文不带 URL，按 original_gift_id 查 giftConfig 缓存
            //（缓存未就绪则 undefined，EventRow 退化为纯文字标注）
            ...(d.blind_gift?.original_gift_id != null
              ? (b => b ? { blindWebp: b.webp, blindGif: b.gif, blindIcon: b.icon } : {})(giftIcon(d.blind_gift.original_gift_id))
              : {}),
            // 盲盒本身价格 + 爆出礼物价格（单位金瓜子，换算人民币）
            blindPriceRmb: d.blind_gift?.original_gift_price != null ? toRmb(d.blind_gift.original_gift_price, 'gold') : undefined,
            blindHitPriceRmb: d.blind_gift?.gift_tip_price != null ? toRmb(d.blind_gift.gift_tip_price, 'gold') : undefined,
            paymentRmb: d.total_coin != null ? toRmb(d.total_coin, d.coin_type ?? 'gold') : undefined,
          },
        ),
      })
    }

    // SEND_GIFT_V2：pb base64 载荷，部分房间（如 22625027）只下发此版本
    case 'SEND_GIFT_V2': {
      const d = msg.data ?? {}
      const pb = d.pb
      if (typeof pb !== 'string' || !pb) return null
      const decoded = decodeSendGiftV2(pb, ctx.anchorUid)
      if (decoded.gifts.length === 0) return null
      const medal = decoded.medal
      const events = decoded.gifts.map((g: any) => {
        const configuredGift = giftIcon(g.giftId)
        const blindConfiguredGift = decoded.blindGift ? giftIcon(decoded.blindGift.giftId) : undefined
        return base({
          id: g.itemId ? `gift-v2:${g.itemId}` : createId('SEND_GIFT_V2'),
          msgType: MsgType.Gift,
          ts: toMs(g.timestamp, now),
          user: makeUser(ctx, decoded.uid, decoded.uname, decoded.face, decoded.guardLevel, medal, undefined, decoded.wealth),
          gift: makeGift(g.giftId, g.giftName, g.num, g.price, g.coinType, g.totalCoin, {
            icon: g.icon, webp: g.webp, gif: g.gif,
            effect: g.effect ?? configuredGift?.effect,
            effectId: g.effectId ?? configuredGift?.effectId,
            comboStayTime: g.comboStayTime,
            broadcastId: g.broadcastId,
            hasImagedGift: g.hasImagedGift ?? configuredGift?.hasImagedGift,
            blindGiftName: decoded.blindGift?.name || undefined,
            blindWebp: blindConfiguredGift?.webp,
            blindGif: blindConfiguredGift?.gif,
            blindIcon: blindConfiguredGift?.icon,
            blindPriceRmb: decoded.blindGift ? toRmb(decoded.blindGift.price, 'gold') : undefined,
            blindHitPriceRmb: decoded.blindGift ? toRmb(g.price, g.coinType) : undefined,
            paymentRmb: g.paymentCoin !== undefined ? toRmb(g.paymentCoin, g.coinType) : undefined,
          }),
        })
      })
      return events.length === 1 ? events[0] : events
    }

    // COMBO_SEND：连击进度，不单独成行，由消费端合并进同 uid+giftId 的最近礼物行
    case 'COMBO_SEND': {
      const d = msg.data ?? {}
      const senderMedal = d.sender_uinfo?.medal
      const medal = medalFromPayload(senderMedal, ctx.anchorUid)
      const wireGuard = currentRoomMedalGuardLevel(senderMedal, ctx.anchorUid)
      return base({
        // combo_id 标识一次连击（含时间戳），同一连击会多次下发（combo_num 递增），
        // 配 combo_num 才是每条进度的唯一键。早期用 combo-${uid}-${giftId} 会在
        // 同用户第二次送同礼物时被去重表误杀（真机 2026-08-26 发现）
        id: d.combo_id ? `${d.combo_id}:${d.combo_num ?? d.total_num ?? 0}` : createId('combo'),
        msgType: MsgType.Gift,
        comboId: d.combo_id || undefined,
        // 报文无时间戳字段，toMs 兜底 Date.now()
        ts: toMs(d.timestamp ?? d.ts, now),
        user: makeUser(ctx, d.uid, d.uname, d.sender_uinfo?.base?.face, wireGuard, medal),
        gift: makeGift(
          d.gift_id ?? 0, d.gift_name ?? '', d.combo_num ?? d.total_num ?? 1,
          // 报文顶层无 price/total_coin（历史 bug：填 0 致降级行显示「免费」），
          // 连击累计总价在 combo_total_coin
          0, d.coin_type ?? 'gold', d.combo_total_coin ?? 0,
          { icon: d.gift_info?.img_basic ?? undefined, webp: d.gift_info?.webp || undefined, gif: d.gift_info?.gif || undefined },
        ),
        // 标记为连击更新，消费端据此合并而非新增
        isComboUpdate: true,
      } as DanmakuEvent)
    }

    case 'SUPER_CHAT_MESSAGE': {
      const d = msg.data ?? {}
      // 登录态下会收到两条同 id 的 SC（一条不带 dmscore，为审核状态回显），由消费端按 id 去重
      return base({
        id: d.id !== undefined ? String(d.id) : createId('sc'),
        msgType: MsgType.SuperChat,
        ts: toMs(d.start_time, now),
        user: makeUser(ctx, d.uid, d.user_info?.uname, d.user_info?.face, d.user_info?.guard_level,
          medalFromPayload(d.medal_info, ctx.anchorUid), undefined, undefined,
          userProfileFromPayload(d.user_info)),
        text: d.message ?? '',
        sc: {
          price: d.price ?? 0,
          message: d.message ?? '',
          duration: d.time ?? 0,
          trans: d.message_trans || undefined,
        },
      })
    }

    // SC 删除：载荷 {ids:[...]}，回溯给已渲染的 SC 行打删除标记（store flush 处理），本事件不入列
    case 'SUPER_CHAT_MESSAGE_DELETE': {
      const ids = (msg.data?.data?.ids ?? msg.data?.ids ?? []) as any[]
      return base({
        msgType: MsgType.ScDeleted,
        scDeleteIds: ids.map((id) => String(id)),
      })
    }

    // GUARD_BUY / USER_TOAST_MSG 与 USER_TOAST_MSG_V2 同源并发推送（实测三命令同时到达），
    // GUARD_BUY 的 price 是原价、USER_TOAST 系列是实付折扣价；V2 字段最全（含头像/op_type/主播信息）。
    // 只保留 V2 单条渲染，另两个丢弃，避免一次开通显示三行（详见日志实证）。
    case 'GUARD_BUY':
    case 'USER_TOAST_MSG':
      return null

    case 'USER_TOAST_MSG_V2': {
      const d = msg.data ?? {}
      const text = typeof d.toast_msg === 'string' ? d.toast_msg : undefined
      const uid = d.sender_uinfo?.uid ?? d.uid
      const uname = d.sender_uinfo?.base?.name ?? d.username
      const face = d.sender_uinfo?.base?.face
      const senderMedal = d.sender_uinfo?.medal
      const wireGuard = d.guard_info?.guard_level ?? d.guard_level
      const price = d.pay_info?.price ?? d.price
      return base({
        msgType: MsgType.GuardBuy,
        ts: toMs(d.guard_info?.start_time ?? d.start_time, now),
        user: makeUser(ctx, uid, uname, face, wireGuard, medalFromPayload(senderMedal, ctx.anchorUid), undefined, undefined,
          userProfileFromPayload(d.sender_uinfo)),
        guard: {
          level: wireToModelGuard(wireGuard) || 1,
          count: d.pay_info?.num ?? d.num ?? 1,
          unit: d.pay_info?.unit,
          price,
          priceRmb: toRmb(price, 'gold'),
          roomGuardCount: optionalNumber(d.guard_info?.room_guard_count ?? d.target_guard_count),
          effect: {
            roomEffectId: optionalNumber(d.effect_info?.room_effect_id ?? d.room_effect_id),
            shipEffectId: optionalNumber(d.effect_info?.ship_effect_id ?? d.ship_effect_id),
            roomGiftEffectId: optionalNumber(d.effect_info?.room_gift_effect_id ?? d.room_gift_effect_id),
            roomGroupEffectId: optionalNumber(d.effect_info?.room_group_effect_id ?? d.room_group_effect_id),
            effectId: optionalNumber(d.effect_info?.effect_id ?? d.effect_id),
            source: optionalNumber(d.option?.source ?? d.source),
            isGroup: Boolean(d.option?.is_group ?? d.is_group),
            blocked: Boolean(d.option?.svga_block ?? d.svga_block),
            isSelf: d.sender_uinfo?.isSelf ?? (ctx.viewerUid !== undefined && String(uid) === ctx.viewerUid),
            groupName: d.group_guard_info?.group_name,
          },
          opType: d.guard_info?.op_type ?? d.op_type,
          action: extractGuardAction(text),
        },
        text,
      })
    }

    case 'GUARD_FAME_GLORY_EVENT':
    case 'GUARD_ACHIEVEMENT_ROOM': {
      const d = msg.data ?? {}
      const monthly = cmd === 'GUARD_FAME_GLORY_EVENT'
      // 官方成就提示仅展示 event_type 为 1 的通知；其他类型仍保留原始采集记录。
      if (!monthly && d.event_type !== 1) return null
      const effectId = optionalNumber(d.effect_id)
      const tier = GUARD_HONOR_TIERS.find(tier => tier.effectId === effectId)
      const firstLine = monthly
        ? `恭喜主播${ctx.anchorName ? `<%${ctx.anchorName}%>` : ''}`
        : d.first_line_content ?? ''
      const secondLine = monthly
        ? tier ? `舰队规模突破<%${tier.count}%>` : '舰队达成新成就'
        : d.second_line_content ?? ''
      const threshold = monthly ? tier?.count : guardHonorThreshold({ firstLine, secondLine })
        ?? optionalNumber(d.anchor_guard_achieve_level)
      const now = Date.now()
      if (threshold !== undefined) {
        const seen = ctx.guardHonorSeen ?? (ctx.guardHonorSeen = new Map())
        const previous = seen.get(threshold)
        if (previous !== undefined && now - previous < 10000) return null
        seen.set(threshold, now)
      }
      const face = d.danmu_area?.face ?? d.face
      return base({
        msgType: MsgType.GuardHonor,
        ...(face ? { broadcaster: { uid: String(d.ruid ?? ctx.anchorUid), uname: ctx.anchorName ?? firstLine.match(/<%([^%]+)%>/)?.[1] ?? '', avatar: face, guardLevel: 0, isAnchor: true } } : {}),
        honor: {
          firstLine,
          secondLine,
          threshold,
          effectId: effectId ?? GUARD_HONOR_TIERS.find(tier => tier.count === threshold)?.effectId,
          headmapUrl: d.danmu_area?.headmap_url ?? d.headmap_url,
          reachUrl: d.danmu_area?.guard_reach_url,
          achievementLevel: optionalNumber(d.current_achievement_level),
        },
        text: `${firstLine} ${secondLine}`.replace(/<%|%>/g, '').trim(),
      })
    }

    // ---------- 天选 / 红包 ----------
    case 'ANCHOR_LOT_START': {
      const d = msg.data ?? {}
      return base({
        ...(d.id != null ? { id: `anchor-start:${d.id}` } : {}),
        msgType: MsgType.AnchorLotStart,
        lottery: {
          id: d.id,
          awardName: d.award_name ?? '',
          awardNum: d.award_num ?? 1,
          danmu: d.danmu ?? d.danmu_new?.[0]?.danmu,
          maxTime: d.max_time,
          timing: activityTimingFromPayload('anchor', d),
          giftName: d.gift_name,
          requireText: d.require_text,
        },
      })
    }

    case 'ANCHOR_LOT_AWARD': {
      const d = msg.data ?? {}
      const winners: { uid: string; uname: string; awardName?: string; avatar?: string }[] = (d.award_users ?? []).map((u: any) => ({
        uid: String(u.uid ?? ''),
        uname: u.uname ?? '',
        ...(typeof u.face === 'string' && u.face ? {avatar:u.face} : {}),
      }))
      return base({
        msgType: MsgType.AnchorLotAward,
        user: winners.length > 0 ? makeUser(ctx, winners[0].uid, winners[0].uname) : undefined,
        lottery: {
          id: d.id,
          awardName: d.award_name ?? '',
          awardNum: d.award_num ?? winners.length,
          winners: winners.length > 0 ? winners : undefined,
        },
      })
    }

    // 红包开始：开始行只显示发起人+金额+口令+等待时长，奖品清单留给开奖行（用户指定格式）
    // V1/V2_START 同 lot_id 异时到达（V1 发起时、V2 快开奖时），顶层 id 用 lot_id 去重
    case 'POPULARITY_RED_POCKET_START':
    case 'POPULARITY_RED_POCKET_V2_START': {
      const d = msg.data ?? {}
      const senderMedal = d.sender_info?.medal ?? d.medal_info
      const roomBoundSenderMedal = d.sender_info?.medal
      const awards = normalizeRedPocketAwards(d.awards)
      return base({
        id: `pocket-start:${d.lot_id ?? 0}`,
        msgType: MsgType.RedPocketStart,
        ts: toMs(d.start_time ?? d.current_time, now),
        user: makeUser(ctx, d.sender_uid, d.sender_name, d.sender_face,
          currentRoomMedalGuardLevel(roomBoundSenderMedal, ctx.anchorUid), medalFromPayload(senderMedal, ctx.anchorUid)),
        pocket: { lotId: d.lot_id ?? 0, danmu: d.danmu, ...(d.rp_type != null ? { rpType: Number(d.rp_type) } : {}) },
        lottery: {
          id: d.lot_id,
          awardName: '',
          awardNum: 0,
          awards,
          totalPrice: d.total_price,
          waitTime: d.last_time,
          timing: activityTimingFromPayload('red-pocket', d),
        },
      })
    }

    // V1/V2_WINNER_LIST 同 lot_id 同秒到达（真重复），顶层 id 用 lot_id 去重
    case 'POPULARITY_RED_POCKET_WINNER_LIST':
    case 'POPULARITY_RED_POCKET_V2_WINNER_LIST': {
      const d = msg.data ?? {}
      const awards: Record<string, any> = d.awards ?? {}
      const winners: { uid: string; uname: string; awardName?: string; avatar?: string }[] = (d.winner_info ?? []).map((w: any) => {
        const avatar = redPocketWinnerAvatar(w)
        // 支持扩展元组与对象；元组第4项为礼物ID。
        if (Array.isArray(w)) {
          const award = awards[String(w[3])]
          return { uid: String(w[0] ?? ''), uname: w[1] ?? '', awardName: award?.award_name, ...(avatar ? {avatar} : {}) }
        }
        return { uid: String(w.uid ?? ''), uname: w.uname ?? '', awardName: w.award_name, ...(avatar ? {avatar} : {}) }
      })
      return base({
        id: `pocket-win:${d.lot_id ?? 0}`,
        msgType: MsgType.RedPocketWinner,
        user: winners.length > 0 ? makeUser(ctx, winners[0].uid, winners[0].uname) : undefined,
        pocket: { lotId: d.lot_id ?? 0, danmu: d.hit_danmu },
        lottery: {
          id: d.lot_id,
          awardName: [...new Set(winners.map(w => w.awardName).filter(Boolean))].join('、'),
          awardNum: d.total_num ?? winners.length,
          winners: winners.length > 0 ? winners : undefined,
        },
      })
    }

    // 送出红包的提示与 START 描述同一活动，事件流只保留开始和开奖。
    case 'POPULARITY_RED_POCKET_NEW':
    case 'POPULARITY_RED_POCKET_V2_NEW':
      return null

    // ---------- 互动 / 进场 ----------
    case 'INTERACT_WORD': {
      const d = msg.data ?? {}
      const interactText = ['', '进入直播间', '关注了主播', '分享了直播间', '特别关注了主播', '互相关注了'][d.msg_type] ?? '互动'
      return base({
        msgType: MsgType.Interact,
        interactKind: interactKindFromWireType(d.msg_type),
        ts: toMs(d.timestamp ?? d.trigger_time, now),
        user: makeUser(ctx, d.uid ?? d.uinfo?.uid, d.uname ?? d.uinfo?.base?.name, d.uinfo?.base?.face, d.privilege_type,
          medalFromPayload(d.uinfo?.medal ?? d.medal_info ?? d.fans_medal, ctx.anchorUid), undefined,
          wealthInfoFromPayload(d.uinfo?.wealth), userProfileFromPayload(d.uinfo ?? d.user_info)),
        text: interactText,
      })
    }

    // INTERACT_WORD_V2：pb base64 载荷，部分房间只下发此版本
    case 'INTERACT_WORD_V2': {
      const d = msg.data ?? {}
      const pb = d.pb
      if (typeof pb !== 'string' || !pb) return null
      const v = decodeInteractWordV2(pb, ctx.anchorUid)
      const interactText = ['', '进入直播间', '关注了主播', '分享了直播间', '特别关注了主播', '互相关注了'][v.msgType] ?? '互动'
      return base({
        msgType: MsgType.Interact,
        interactKind: interactKindFromWireType(v.msgType),
        ts: v.tsSec ? v.tsSec * 1000 : now(),
        dedupe: interactWordV2DedupeKey(v),
        user: makeUser(ctx, v.uid, v.uname, v.face, v.guardLevel, v.medal, undefined, v.wealth),
        text: interactText,
      })
    }

    // 点赞：纯 JSON，复用 Interact 类型（「xx 为主播点赞了」）
    case 'LIKE_INFO_V3_CLICK': {
      const d = msg.data ?? {}
      const base2 = d.uinfo?.base ?? {}
      const medal = d.fans_medal
      return base({
        msgType: MsgType.Interact,
        interactKind: 'like',
        ts: now(),
        user: makeUser(ctx, d.uid, base2.name, base2.face, currentRoomMedalGuardLevel(medal, ctx.anchorUid),
          medalFromPayload(medal, ctx.anchorUid)),
        likeCount: Number.isSafeInteger(d.click_count) && d.click_count >= 0 ? d.click_count : undefined,
        text: d.like_text || '为主播点赞了',
      })
    }

    // ---------- 数值 ----------
    case 'WATCHED_CHANGE':
      return base({ msgType: MsgType.WatchedChange, stats: { watched: msg.data?.num, watchedUpdatedAt: now() } })

    case 'ONLINE_RANK_COUNT':
      return base({ msgType: MsgType.OnlineRank, stats: onlineRankStats(msg.data ?? {}, now()) })

    case 'LIKE_INFO_V3_UPDATE':
      return base({ msgType: MsgType.LikeUpdate, stats: { likes: msg.data?.click_count, likesUpdatedAt: now() } })

    case 'ROOM_REAL_TIME_MESSAGE_UPDATE':
    case 'ROOM_REAL_TIME_MESSAGE_UPDATE_V2':
      return base({
        msgType: MsgType.FansUpdate,
        stats: { fans: msg.data?.fans, fansClub: msg.data?.fans_club, fansClubUpdatedAt: now() },
      })

    // ---------- 管理 ----------
    case 'ROOM_SILENT_ON':
    case 'ROOM_SILENT_OFF': {
      const d = msg.data ?? {}
      const payload = d.data && typeof d.data === 'object' ? d.data : d
      const action = cmd === 'ROOM_SILENT_ON' ? 'on' : 'off'
      return base({
        msgType: MsgType.RoomSilent,
        text: typeof payload.msg === 'string' ? payload.msg : cmd,
        roomSilent: {
          action,
          type: typeof payload.type === 'string' ? payload.type : undefined,
          level: Number.isFinite(Number(payload.level)) ? Number(payload.level) : undefined,
          second: Number.isFinite(Number(payload.second)) ? Number(payload.second) : undefined,
        },
      })
    }

    case 'ROOM_BLOCK_MSG': {
      const d = msg.data ?? {}
      const payload = d.data && typeof d.data === 'object' ? d.data : d
      const expiresAt = Number(payload.block_expired)
      const operator = Number(payload.operator)
      return base({
        msgType: MsgType.RoomBlock,
        user: makeUser(ctx, payload.uid ?? d.uid ?? msg.uid, payload.uname ?? d.uname ?? msg.uname),
        text: '被禁言/封禁',
        roomBlock: {
          validPeriod: typeof payload.vaild_period === 'string' ? payload.vaild_period : undefined,
          expiresAt: Number.isFinite(expiresAt) ? expiresAt : undefined,
          operator: Number.isFinite(operator) ? operator : undefined,
        },
      })
    }

    case 'ROOM_ADMINS': {
      const uids: number[] = msg.uids ?? []
      return base({
        msgType: MsgType.AdminChange,
        adminAction: "list",
        text: `房管名单更新（${uids.length} 人）`,
        raw: ctx.keepRaw ? msg : { cmd, uids },
      })
    }

    case 'room_admin_entrance': {
      const d = msg
      return base({
        msgType: MsgType.AdminChange,
        adminAction: "appoint",
        user: makeUser(ctx, d.uid, undefined),
        text: '被设为房管',
      })
    }

    case 'ROOM_ADMIN_REVOKE': {
      const d = msg
      return base({
        msgType: MsgType.AdminChange,
        adminAction: "revoke",
        user: makeUser(ctx, d.uid, undefined),
        text: '房管被撤销',
      })
    }

    case 'ROOM_CHANGE': {
      const d = msg.data ?? {}
      return base({
        msgType: MsgType.RoomChange,
        text: `标题改为「${d.title ?? ''}」/ 分区「${d.area_name ?? ''}」`,
        stats: { roomTitle: d.title, roomArea: d.area_name, roomParentArea: d.parent_area_name, roomChangedAt: now() },
      })
    }

    // ---------- 开播状态 ----------
    case 'LIVE': {
      // B站报文可能同时带 live_key/sub_session_key；它们仅保留在原始事件和诊断资料中，
      // 档案场次判断统一使用标准化 live_time，避免把不稳定的服务端 key 当成合并依据。
      const liveKey = typeof msg.live_key === 'string' && msg.live_key.trim() !== '' ? msg.live_key.trim() : undefined
      const subSessionKey = typeof msg.sub_session_key === 'string' && msg.sub_session_key.trim() !== '' ? msg.sub_session_key.trim() : undefined
      const sourceLiveStartedAt = Number(msg.live_time) > 0 ? toMs(msg.live_time, now) : undefined
      const liveSession = liveKey || subSessionKey ||
        (msg.live_time ? `${msg.roomid ?? ctx.roomId}:${msg.live_time}` : '')
      return base({
        ...(liveSession ? { id: `live:${liveSession}` } : {}),
        msgType: MsgType.LiveStart,
        ts: toMs(msg.live_time, now),
        text: '直播开始',
        liveIdentity: {
          ...(liveKey ? { liveKey } : {}),
          ...(subSessionKey ? { subSessionKey } : {}),
          ...(sourceLiveStartedAt ? { sourceLiveStartedAt } : {}),
        },
        stats: { liveStartedAt: sourceLiveStartedAt, liveEndedAt: undefined, liveStatusChangedAt: now() },
      })
    }

    case 'PREPARING':
      return base({ msgType: MsgType.LiveEnd, text: '直播结束', stats: { liveEndedAt: now(), liveStatusChangedAt: now() } })

    case 'WARNING':
      return base({ msgType: MsgType.Warning, text: msg.msg ?? '直播间被超管警告' })

    case 'ROOM_LOCK': {
      const roomId = Number(msg.roomid ?? msg.room_id)
      if (roomId !== ctx.roomId) return null
      const endsAt = parseRoomLockExpiry(msg.expire)
      return base({ msgType: MsgType.RoomLock, text: typeof msg.msg === 'string' && msg.msg.trim() ? msg.msg : '直播间被封禁',
        roomLock: { endsAt, ...(endsAt ? { source: 'expire' as const } : {}) } })
    }

    case 'CUT_OFF':
      return base({ msgType: MsgType.CutOff, text: msg.msg ?? '直播间被超管切断' })

    case 'ROOM_CONTENT_AUDIT_REPORT': {
      // 该命令可能在连接切换/过渡期间携带其他房间的 room_id；没有明确归属时不进入当前房间事件流。
      const d = msg.data && typeof msg.data === 'object' ? msg.data : msg
      const payloadRoomId = Number(d.room_id ?? d.roomid ?? msg.room_id ?? msg.roomid)
      if (!Number.isFinite(payloadRoomId) || payloadRoomId !== ctx.roomId) return null
      return base({ msgType: MsgType.CoverAudit, text: '直播间内容审核状态发生变化' })
    }

    case 'COVER_AUDIT_STATUS_CHANGED':
      // audit_status 的枚举含义尚未被多样本确认，先只播报“状态发生变化”，不误判审核结果。
      return base({ msgType: MsgType.CoverAudit, text: '直播封面状态发生变化' })

    // 进场特效本身不进入事件流，但会携带财富等级与官方徽章图，供同连接其他事件补全用户资料。
    case 'ENTRY_EFFECT':
    case 'ENTRY_EFFECT_MUST_RECEIVE': {
      const d = msg.data ?? {}
      const wealth: UserWealthInfo = {
        ...(wealthInfoFromPayload(d.uinfo?.wealth) ?? {}),
        ...(wealthInfoFromPayload(d.wealthy_info) ?? {}),
        ...(typeof d.wealth_style_info?.url === 'string' && d.wealth_style_info.url.trim()
          ? { wealthIconUrl: d.wealth_style_info.url.trim() }
          : {}),
      }
      rememberUserWealth(ctx, d.uid, Object.keys(wealth).length > 0 ? wealth : undefined)
      return null
    }

    // ---------- 其他：记为 Unknown 便于发现新事件 ----------
    default: {
      // 高频噪音/平台内部信令直接丢弃（真机 21696950 / 31999413 实测）
      if (
        NON_EVENT_PROTOCOL_COMMANDS.includes(cmd) ||
        cmd.startsWith('LIVE_INTERACTIVE_GAME') ||
        cmd.startsWith('ONLINE_RANK') ||       // V2/V3/COUNT 榜单快照，非事件流
        cmd === 'STOP_LIVE_ROOM_LIST' ||       // 平台级下播房间推送，与本房间无关
        cmd === 'POPULAR_RANK_CHANGED' ||      // 人气榜名次变化心跳
        cmd === 'HOT_ROOM_NOTIFY' ||           // 热门房推荐配置
        cmd === 'POPULARITY_CHANGE' ||         // 人气值变化（连接条数值已有看过/粉丝/点赞）
        cmd === 'PLAY_TAG' ||                  // 播放标签配置
        cmd === 'NOTICE_MSG' ||                // 全区广播，暂不展示（后续按需开启）
        cmd === 'SYS_MSG' ||                  // 平台系统/活动提示，不进入现场事件流
        cmd === 'DM_INTERACTION' ||            // 「N人正在点赞」聚合心跳（type 106），无用户信息，官方端约每秒1-2条
        cmd === 'DANMU_AGGREGATION' ||         // 活动聚合播报（如「千票榜专属感谢语音」），高频无用户，1716079620 实测
        cmd === 'RANK_REM' ||                  // 榜单提醒 burst（同秒5条，系统推送），1716079620 实测
        cmd === 'HOT_BUY_NUM' ||               // 带货房热门购买数，26774400 实测
        cmd === 'SHOPPING_CART_SHOW' ||        // 带货房购物车展示，26774400 实测
        cmd === 'RANK_CHANGED' ||              // 榜单变化心跳，26774400 实测
        cmd === 'RANK_CHANGED_V2' ||           // 榜单变化心跳 V2（7777/德云色 实测）
        cmd === 'VOICE_JOIN_ROOM_COUNT_INFO' || // 语音连麦人数播报，26774400 实测
        cmd === 'VOICE_JOIN_LIST' ||           // 语音连麦成员列表，26774400 实测
        cmd === 'VOICE_JOIN_SWITCH' ||         // 语音连麦开关信令，只有状态字段，无用户行为
        cmd === 'VOICE_JOIN_SWITCH_V2' ||      // 同上，V2 兼容信令
        // 以下 21696950（阿萨Aza）实测：平台信令/UI 装饰/重复推送，无事件价值
        cmd === 'SUPER_CHAT_MESSAGE_JPN' ||    // SC 日文翻译版，与 SC 同 id 100% 重复；备选不显示，留 message_jpn 字段供后续按需接入
        cmd === 'WIDGET_BANNER' ||             // 活动 banner 配置（团战应援赛等），无用户
        cmd === 'GOTO_BUY_FLOW' ||             // 带货房「XX正在去买」播报
        cmd === 'WIDGET_GIFT_STAR_PROCESS_V2' || // 礼物星球活动进度
        cmd === 'FLOW_REWARD_CARD' ||          // 人气榜推荐卡片（推别的主播）
        cmd === 'PLAYURL_RELOAD' ||            // 直播流地址重载信令
        cmd === 'PLAYURL_RELOAD_MASTER' ||     // 主播流地址重载信令（技术事件）
        cmd === 'SUPER_CHAT_ENTRANCE' ||       // SC 入口图标显示开关
        cmd === 'CHG_RANK_REFRESH' ||          // 榜单刷新心跳
        cmd === 'POPULARITY_RANK_TAB_CHG' ||   // 人气榜 tab 切换
        cmd === 'COMMON_NOTICE_DANMAKU' ||  // 系统公告弹幕（「恭喜XX荣耀等级升级」），结构特殊价值低，暂不展示
        // 以下 80397（阿梓）2026-08-28 实测：玩法信令/平台推送/装饰播报，无用户行为价值
        cmd === 'INTERACTIVE_USER' ||       // 预言玩法提示心跳（无用户）
        cmd === 'PANEL_INTERACTIVE_NOTIFY_CHANGE' || // 预言玩法面板状态/倒计时心跳，无用户行为
        cmd.startsWith('LIVE_OPEN_PLATFORM_GAME') || // 开放平台小游戏生命周期（game_end 等）
        cmd === 'LIVE_INTERACT_GAME_STATE_CHANGE' || // 互动玩法状态切换（无用户）
        cmd === 'LIVE_MULTI_VIEW_NEW_INFO' || // 多视角解说（王者赛事，推别的直播间，跨房）
        cmd === 'LIKE_GUIDE_USER' ||        // 「主播@你点点赞」引导播报
        cmd === 'DANMU_ACTIVITY_CONFIG' ||  // 弹幕活动资源配置（技术信令）
        cmd === 'ROOM_SKIN_MSG' ||          // 房间皮肤切换（装饰）
        cmd === 'COMMON_ANIMATION' ||       // 通用动画播报
        cmd === 'OTHER_SLICE_LOADING_RESULT' || // 直播回放切片加载结果（技术信令）
        cmd === 'REVENUE_DISPLAY_EFFECT' || // 投喂特效礼物横幅（effect-gift 文档已决策暂不实现）
        cmd === 'ANCHOR_LOT_CHECKSTATUS' || // 天选状态查询心跳（lot_status 轮询）
        cmd === 'ANCHOR_LOT_NOTICE' ||      // 主播端「发天选有助于人气累积」提示卡，非天选事件
        cmd === 'ANCHOR_LOT_END' ||         // 天选结束收尾播报（开始/开奖已覆盖生命周期，结束无展示价值）
        cmd === 'GUARD_HONOR_THOUSAND' || // 千舰名单变更（与 ACHIEVEMENT_ROOM 同源冗余，数据型）
        // 以下 645306（星瞳）2026-09-06 实测：房间配置/平台 UI 信令，无用户行为价值
        cmd === 'CHANGE_ROOM_INFO' ||      // 房间背景/皮肤配置变更
        cmd === 'CUSTOM_NOTICE_CARD' ||    // 开放平台自定义通知卡配置
        cmd === 'GIFT_PANEL_PLAN' ||       // 礼物面板礼物列表配置
        cmd === 'LIVE_PANEL_CHANGE_CONTENT' || // 直播间控制面板配置
        cmd === 'OPENPLATFORM_GAME_BUTTON_STATUS_CHANGE' || // 开放平台游戏入口状态
        cmd === 'TIP_CARD' ||              // 平台提示卡配置
        // 以下 645306（星瞳）2026-09-06 实测：辅助/营销/连击收尾消息，只保留原始日志供后续分析
        cmd === 'PK_USER_REC' ||            // 随机 PK 对手推荐/撤销，不是 PK 对战生命周期
        cmd === 'VOICE_REPORT_LIKE' ||      // 连麦相关点赞汇总，暂不能确认具体业务含义
        cmd === 'ANCHOR_HELPER_DANMU' ||    // 直播小助手操作引导，不是观众弹幕
        cmd === 'LIKE_INFO_V3_NOTICE' ||    // 点赞里程碑营销提示，无用户行为
        cmd === 'COMBO_END' ||              // 连击结束摘要，与 SEND_GIFT 结果重复
        // 以下 22625027（乃琳Queen）2026-08-29 实测：玩法信令/特效/装饰，无用户行为价值
        cmd === 'GIFT_COMBO' ||            // 批量投喂预告（先于 SEND_GIFT 0.5s，num/total_coin 完全冗余；暴击倍率独有但未见过触发，见 effect-gift 文档）
        cmd === 'FULL_SCREEN_SPECIAL_EFFECT' || // 全屏特效信令 {type,ids:[effect_id],queue}，动画由客户端自渲染（effect-gift 文档已决策暂不实现）
        cmd === 'TRADING_SCORE' ||          // 玩法/交易积分更新，无可展示的用户行为
        cmd === 'BENEFIT_CARD_CLEAN' ||    // 权益卡清理（装饰信令）
        cmd === 'VOICE_CHAT_UPDATE'        // 连麦状态更新（无用户行为）
      ) return null
      return base({ msgType: MsgType.Unknown, text: cmd })
    }
  }
}
