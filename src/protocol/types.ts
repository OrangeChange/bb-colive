/**
 * 统一弹幕模型（architecture.md §三）
 *
 * 线上原始报文 -> adapter.ts -> 本文件类型 -> 三路分发（store / SQLite / emit）
 */
import { MsgType } from "./eventTypeCodes.ts";
import type { GiftIconInfo } from './gifts';
export { MsgType } from "./eventTypeCodes.ts";

/** 舰队等级统一语义：0 无 1 舰长 2 提督 3 总督（线上原始值 1=总督，adapter 已转换） */
export type GuardLevel = 0 | 1 | 2 | 3

/** adapter 的可选运行时；历史恢复用它固定时间、ID 与礼物快照，现场调用沿用默认值。 */
export interface AdapterRuntime {
  now(): number
  createId(prefix: string): string
  getGiftIcon(giftId: number): GiftIconInfo | undefined
}

export type GuardMilestone = 'standard' | 'thousand' | 'tenThousand' | 'unknown'
export type GuardIconSet = 'base' | 'enhanced'
export type GuardProfileSource = 'room-info' | 'guard-ranking' | 'achievement-event' | 'unknown'

/** 当前直播间主播的大航海档位；同一房间内所有身份标记共用。 */
export interface RoomGuardProfile {
  roomId?: number
  anchorUid?: string
  anchorGuardAchieveLevel?: number
  /** 当前直播间的大航海总人数；与主播档位同属房间级资料。 */
  guardCount?: number
  milestone: GuardMilestone
  iconSet: GuardIconSet
  source: GuardProfileSource
}

/** 互动事件的稳定业务子类型；协议版本只影响来源格式，不影响这里的语义。 */
export type InteractKind =
  | 'entry'
  | 'follow'
  | 'share'
  | 'specialFollow'
  | 'mutualFollow'
  | 'like'

/** 礼物主分类下的现场筛选子类型。 */
export type GiftKind = 'free' | 'normal' | 'blind' | 'redPocket' | 'anchorLot'

export interface FanMedalInfo {
  name: string
  level: number
  /** 粉丝牌对应的当前直播间大航海等级，使用模型语义：1 舰长、2 提督、3 总督。 */
  guardLevel?: GuardLevel
  /** B 站粉丝牌原始类型，供兼容层保留。 */
  type?: number
  anchorName?: string
  /** 大航海图标 URL；仅在原始粉丝牌明确绑定当前主播时保留。 */
  guardIconUrl?: string
  /** 粉丝牌所属主播 UID；部分旧载荷没有此字段。 */
  anchorUid?: string
  /** 适配器基于房间上下文判断的归属；未提供时不猜测。 */
  isCurrentRoom?: boolean
  /** 原始 is_light / is_lighted：1 为点亮，0 为未点亮。 */
  isLighted?: boolean
}

export interface DanmakuUser {
  uid: string                 // 超长 UID 一律 string
  uname: string
  avatar?: string
  guardLevel: GuardLevel
  /** 当前直播间大航海标记原始图片；缺失或归属无法确认时不推断。 */
  guardIconUrl?: string
  /** 当前房间统一解析出的图标套系，随事件保存以供回看复用。 */
  guardMilestone?: GuardMilestone
  guardIconSet?: GuardIconSet
  /** B 站互动用户资料中的财富/荣耀等级；缺失时不推断。 */
  wealthLevel?: number
  /** 财富等级徽章资源键（例如 ChronosWealth_4.png）。 */
  wealthIconKey?: string
  /** B 站推送的财富等级徽章图片 URL。 */
  wealthIconUrl?: string
  /** 用户当前榜单名次；没有榜单信息时不推断。 */
  currentRank?: number
  /** 原始用户资料中的手机号验证状态。 */
  phoneVerified?: boolean
  /** 原始用户资料中的发送类型。 */
  sendType?: number
  /** 平台用户等级及其边框值；不等同于荣耀等级。 */
  userLevel?: number
  userLevelBorder?: number
  isAnchor?: boolean          // 主播（uid === room_init 的 anchorUid，消息本身不携带）
  isAdmin?: boolean           // 房管（DANMU_MSG info[2][2] === 1）
  medal?: FanMedalInfo
}

export interface GiftInfo {
  id: number
  name: string
  count: number
  price: number          // 单价瓜子数
  coinType: 'gold' | 'silver' | string
  total: number          // 总价瓜子数（V1 为 total_coin；V2 当前映射 field 7，语义待验证）
  /** B 站礼物特效元数据；仅用于匹配官方独立特效资源，不改变礼物渲染。 */
  effect?: number
  effectId?: number
  comboStayTime?: number
  broadcastId?: number
  hasImagedGift?: number
  icon?: string          // 礼物图标 URL（静态 PNG，gift_info.img_basic）
  /** 动图 URL（优先 webp，其次 gif）；渲染时优先于 icon 显示 */
  webp?: string          // gift_info.webp
  gif?: string           // gift_info.gif
  blindGiftName?: string // 盲盒名
  /** 盲盒本体图标（报文不带，取自 giftPanel/giftConfig 缓存按 original_gift_id 查） */
  blindWebp?: string
  blindGif?: string
  blindIcon?: string
  /** 单价换算的人民币元（金瓜子 /1000）；银瓜子为 0 */
  priceRmb?: number
  /** 总价换算的人民币元 */
  totalRmb?: number
  /** 已确认的用户实际支付总额；来源不明确时不填写。 */
  paymentRmb?: number
  /** 是否免费礼物（银瓜子） */
  isFree?: boolean
  /** 盲盒实付价格（人民币元，若为盲盒礼物） */
  blindPriceRmb?: number
  /** 盲盒爆出礼物的价格（人民币元） */
  blindHitPriceRmb?: number
}

export interface ScInfo {
  price: number          // 人民币
  message: string
  duration: number       // 持续秒数
  trans?: string         // 日文翻译
  /** 原始 SC 载荷提供时保存大航海背景图地址。 */
  guardBackgroundUrl?: string
}

/** 大航海动作：服务端 toast_msg 中实际播报的动作词。 */
export type GuardAction = "开通" | "续费" | "升级" | "降级"

export interface GuardEffectInfo {
  roomEffectId?: number
  shipEffectId?: number
  roomGiftEffectId?: number
  roomGroupEffectId?: number
  effectId?: number
  source?: number
  isGroup?: boolean
  blocked?: boolean
  isSelf?: boolean
  groupName?: string
}

export interface GuardInfo {
  roomGuardCount?: number
  effect?: GuardEffectInfo
  level: 1 | 2 | 3       // 模型语义：1 舰长 2 提督 3 总督
  count: number
  unit?: string          // 通常为 "月"
  /** 单价瓜子数（GUARD_BUY.price / USER_TOAST.price） */
  price?: number
  /** 换算的人民币元 */
  priceRmb?: number
  /** 服务端内部 op_type 原值；当前样本不能据此单独判断最终动作。 */
  opType?: number
  /** 从服务端 toast_msg 提取的动作，渲染优先使用此字段。 */
  action?: GuardAction
}

export interface LotteryAward {
  id: number
  name: string
  count: number
}

export interface ActivityTiming {
  startsAt?: number
  endsAt?: number
  serverNow?: number
  observedAt: number
  source: 'end-time' | 'remaining' | 'start-duration'
}

export interface LotteryInfo {
  id?: number            // 天选/红包唯一 ID
  awardName: string
  awardNum: number
  awards?: LotteryAward[] // 红包开始事件提供的奖励礼物清单
  danmu?: string         // 参与口令弹幕
  maxTime?: number       // 天选持续时间(秒)
  waitTime?: number      // 红包等待开奖时长(秒，POPULARITY_RED_POCKET last_time)
  timing?: ActivityTiming // Unix 毫秒；只保留来源明确的时间事实
  giftName?: string      // 天选参与条件礼物
  requireText?: string   // 天选资格文案
  totalPrice?: number    // 红包总金额(金瓜子)
  winners?: { uid: string; uname: string; awardName?: string; avatar?: string }[] // 中奖名单（多个中奖人时 user 取第一个）
}

export interface PocketInfo {
  rpType?: number
  lotId: number
  danmu?: string
}

/** 大航海荣誉：月度舰队荣耀与历史成就共用两行富文本。 */
export interface HonorInfo {
  firstLine: string    // 如「恭喜主播<%阿梓从小就很可爱%>」
  secondLine: string   // 如「舰队规模突破<%1000%>」
  threshold?: number
  effectId?: number
  headmapUrl?: string
  reachUrl?: string
  achievementLevel?: number
}

/** 房间范围禁言状态变化（ROOM_SILENT_ON/OFF）。 */
export interface RoomSilentInfo {
  action: 'on' | 'off'
  type?: string
  level?: number
  second?: number
}

/** 单个用户禁言/封禁信息（ROOM_BLOCK_MSG）。 */
export interface RoomBlockInfo {
  validPeriod?: string
  expiresAt?: number
  operator?: number
}

export interface StatsInfo {
  watched?: number
  watchedUpdatedAt?: number
  /** 新版在线榜计数；不与旧榜 count 兜底混用。 */
  online?: number
  onlineText?: string
  onlineUpdatedAt?: number
  rankCount?: number
  rankCountText?: string
  rankCountUpdatedAt?: number
  fans?: number
  fansClub?: number
  fansClubUpdatedAt?: number
  likes?: number
  likesUpdatedAt?: number
  liveStartedAt?: number
  liveEndedAt?: number
  liveStatusChangedAt?: number
  roomTitle?: string
  roomParentArea?: string
  roomArea?: string
  roomChangedAt?: number
}

/** 大表情（dm_type=1）：整条弹幕就是一张图，text 无意义（占位 "1"），真实表情名在 extra.content */
export interface EmoticonInfo {
  url: string
  width: number
  height: number
  /** emoticon_unique：来源标识（emoji_/official_/room_/upower_ 前缀） */
  unique?: string
}

/** 小表情（extra.emots）：占位符 "[dog]" -> 图片，与文字混排 */
export interface EmoteInfo {
  url: string
  width: number
  height: number
}

export interface LiveIdentity {
  liveKey?: string
  subSessionKey?: string
  sourceLiveStartedAt?: number
}

export interface DanmakuEvent {
  /** 输出投影携带的活动事实；不改写原始时间和来源结构。 */
  activity?: import('../events/activityLifecycle').ActivityFacts
  id: string             // 去重主键：DANMU msg_id / SC id / 生成
  msgType: MsgType
  roomId: number
  ts: number             // 事件时间(ms)
  /** 合并礼物行首条事件的发生时间；ts 继续表示最后一次更新。 */
  firstOccurredAt?: number
  /** 互动子类型；INTERACT_WORD 的 msg_type 和点赞命令在适配层归一化。 */
  interactKind?: InteractKind
  /** 点赞事件自身携带的次数；仅保留非负安全整数，缺失时兼容主题不显示该事件。 */
  likeCount?: number
  /** 去重键覆盖（默认用 id）：弹幕用 rnd|uid|text|原始消息时间复合键。
   *  rnd 不是每条唯一；用户后来重发相同内容时因消息时间不同而保留，
   *  同一消息实例的重推若保留原始消息时间则被过滤。 */
  dedupe?: string
  /** React key 覆盖（默认用 id）：缓冲内出现同 id 事件（如共享 rnd 的真消息）时，
   *  入列前加序号后缀保证 key 唯一，防止重复 key 导致列表协调错乱（克隆行） */
  reactKey?: string
  /** 合并行沿用首次显示时的标记与收藏身份。 */
  annotationIdentity?: { markKey: string; bookmarkKey: string }
  user?: DanmakuUser
  /** 事件所属房间的主播资料；与发送用户独立。 */
  broadcaster?: DanmakuUser
  /** 结构化 reply 元数据中的被 @ 用户；普通正文 @ 不保证有此字段。 */
  replyTo?: DanmakuUser
  text?: string          // 弹幕内容 / 撤回事件的说明文本（表情弹幕时为 extra.content：大表情=表情名、小表情=含占位符全文）
  isAutoDanmaku?: boolean // 原始弹幕自动发送标记；旧记录缺失时不推断
  danmakuSendType?: number // DANMU_MSG info[0][9]，保留原始数值用于兼容输出
  emoticon?: EmoticonInfo // 大表情（独占通道，有则整条按图渲染）
  emotes?: Record<string, EmoteInfo> // 小表情映射（key=占位符文本）
  gift?: GiftInfo
  sc?: ScInfo
  guard?: GuardInfo
  lottery?: LotteryInfo
  pocket?: PocketInfo
  honor?: HonorInfo
  /** 房管任命、撤销或名单更新；由对应协议命令确定。 */
  adminAction?: "appoint" | "revoke" | "list"
  roomSilent?: RoomSilentInfo
  roomBlock?: RoomBlockInfo
  stats?: StatsInfo
  /** B站生命周期消息携带的直播身份；用于区分断线重连和重新开播。 */
  liveIdentity?: LiveIdentity
  recallType?: number
  danmuDeleted?: boolean
  recallTarget?: string  // 被撤回的弹幕 msg_id
  /** SC 删除回溯标记：被 SUPER_CHAT_MESSAGE_DELETE 命中的 SC 行由 store 后置置 true，
   *  EventRow 据此给 SC 内容加删除线 + 「已删除」标记 */
  scDeleted?: boolean
  /** ScDeleted 触发事件携带：要删除的 SC id 列表（store flush 回溯匹配用） */
  scDeleteIds?: string[]
  /** COMBO_SEND 适配标记：服务端连击累计值，优先按 comboId 合并并覆盖原礼物行 */
  isComboUpdate?: boolean
  /** 服务端连击 ID：SEND_GIFT.combo_send.combo_id / COMBO_SEND.combo_id。
   *  有值时用它精确关联同一轮连送，不受事件行数和 8 秒兜底窗口影响。 */
  comboId?: string
  /** 已收到 COMBO_SEND 最终校正；后续同用户同礼物必须另起一行。 */
  comboFinalized?: boolean
  /** 副窗口内相同弹幕合并后的显示次数；不写入原始日志。 */
  danmuRepeatCount?: number
  raw?: unknown          // 原始报文（设置项控制，默认关）
  /** Laplace 兼容渲染所需的来源事实；不进入原生显示或归档派生。 */
  laplace?: import("../compat/laplace/types.ts").LaplaceSourceMetadata
}

/** adapter 需要的房间上下文（连接时从 room_init 拿到） */
export interface AdapterContext {
  /** Laplace 来源序号，仅用于保持来源事件顺序。 */
  laplaceOriginIdx?: number
  roomId: number
  anchorUid: string      // 主播 UID（判断 isAnchor）
  anchorName?: string
  viewerUid?: string
  /** 同房同档并发的月度荣耀与历史成就合并为一条。 */
  guardHonorSeen?: Map<number, number>
  keepRaw?: boolean      // 是否在事件上保留原始报文，默认 false
  /** 当前直播间统一的大航海档位与图标套系。 */
  roomGuardProfile?: RoomGuardProfile
  /** 当前连接内捕获到的用户财富等级资料。 */
  wealthByUid?: Map<string, Pick<DanmakuUser, 'wealthLevel' | 'wealthIconKey' | 'wealthIconUrl'>>
  avatarsByUid?: Map<string, string>
  /** 当前房间内按用户 UID 捕获的大航海图标 URL；不按身份等级推断。 */
  guardIconUrlsByUid?: Map<string, string>
  /** ENTRY_EFFECT 提供的等级到官方徽章图片 URL 映射。 */
  wealthIconUrlsByLevel?: Map<number, string>
}

/** 连接状态（主窗口 <-> 弹幕窗/礼物窗通过 emit('danmu:status') 同步） */
export type ConnStatus =
  | 'idle'        // 未连接
  | 'connecting'  // 连接中（登录/房间解析/WS 握手）
  | 'connected'   // 已进入房间
  | 'reconnecting'// 断线重连中
  | 'closed'      // 手动关闭
  | 'error'       // 出错

export interface ConnState {
  status: ConnStatus
  roomId?: number
  shortId?: number
  title?: string
  anchorName?: string
  anchorFace?: string        // 主播头像 URL
  /** 用户输入原样（主播列表重连/upsert 用） */
  roomIdInput?: string
  liveStatus?: 0 | 1 | 2   // 0 未开播 1 开播中 2 轮播
  /** 当前直播开播时间（Unix 毫秒），用于现场时长和回看场次判断。 */
  liveStartedAt?: number
  /** 当前直播间统一的大航海档位与图标套系。 */
  roomGuardProfile?: RoomGuardProfile
  /** 当前直播间封面 URL；只保存地址，不保存图片内容。 */
  coverUrl?: string
  message?: string         // 状态附加说明（错误信息等）
}

/** MsgType 可读名（UI 展示用） */
export const MsgTypeName: Record<MsgType, string> = {
  [MsgType.Danmu]: '弹幕',
  [MsgType.Gift]: '礼物',
  [MsgType.SuperChat]: '醒目留言',
  [MsgType.GuardBuy]: '上舰',
  [MsgType.AnchorLotStart]: '天选开始',
  [MsgType.AnchorLotAward]: '天选中奖',
  [MsgType.RedPocketStart]: '红包开始',
  [MsgType.RedPocketWinner]: '红包中奖',
  [MsgType.RedPocketGift]: '已停用事件',
  [MsgType.GuardHonor]: '大航海荣誉',
  [MsgType.Interact]: '进出场',
  [MsgType.EntryEffect]: '进场特效',
  [MsgType.WatchedChange]: '看过数',
  [MsgType.OnlineRank]: '高能榜',
  [MsgType.LikeUpdate]: '点赞数',
  [MsgType.FansUpdate]: '粉丝数',
  [MsgType.Recall]: '弹幕撤回',
  [MsgType.ScDeleted]: 'SC删除',
  [MsgType.RoomBlock]: '禁言',
  [MsgType.RoomSilent]: '房间禁言',
  [MsgType.AdminChange]: '房管任免',
  [MsgType.RoomChange]: '房间变更',
  [MsgType.LiveStart]: '开播',
  [MsgType.LiveEnd]: '下播',
  [MsgType.Warning]: '超管警告',
  [MsgType.CutOff]: '直播切断',
  [MsgType.CoverAudit]: '直播封面状态',
  [MsgType.Unknown]: '未识别',
}

/** 礼物窗及后续高亮播报关注的事件 */
export const HIGHLIGHT_TYPES: MsgType[] = [
  MsgType.Gift,
  MsgType.SuperChat,
  MsgType.GuardBuy,
  MsgType.GuardHonor,        // 大航海荣誉：千舰达成等，突出播报
  MsgType.AnchorLotStart,
  MsgType.AnchorLotAward,
  MsgType.RedPocketStart,
  MsgType.RedPocketWinner,
]
