/** Persisted numeric code for MsgType.Unknown; keep stable for historical archive rows. */
export const UNKNOWN_MSG_TYPE_CODE = 27 as const;

export enum MsgType {
  Danmu,          // 弹幕（DANMU_MSG）
  Gift,           // 礼物（SEND_GIFT / SEND_GIFT_V2 合并）
  SuperChat,      // 醒目留言（SUPER_CHAT_MESSAGE 含 JPN 变体）
  GuardBuy,       // 上舰（GUARD_BUY / USER_TOAST_MSG / V2）
  AnchorLotStart, // 天选开始
  AnchorLotAward, // 天选中奖
  RedPocketStart, // 红包开始（V1/V2）
  RedPocketWinner,// 红包中奖
  RedPocketGift,  // 已停用；仅保留历史编号8，不生成或显示
  GuardHonor,     // 大航海荣誉（GUARD_ACHIEVEMENT_ROOM：千舰达成等，突出播报）
  Interact,       // 进出场/关注（INTERACT_WORD / V2 合并）
  EntryEffect,    // 进场特效（ENTRY_EFFECT；已在 adapter 过滤：与进场消息冗余，保留枚举供历史数据/后续按需开启）
  WatchedChange,  // 看过数（WATCHED_CHANGE）
  OnlineRank,     // 在线/高能榜数量（ONLINE_RANK_COUNT；V2/V3 快照不进入事件，V3 另有兼容输出）
  LikeUpdate,     // 点赞数（LIKE_INFO_V3_UPDATE）
  FansUpdate,     // 粉丝数（ROOM_REAL_TIME_MESSAGE_UPDATE / V2）
  Recall,         // 弹幕撤回（RECALL_DANMU_MSG）
  ScDeleted,      // SC 删除（SUPER_CHAT_MESSAGE_DELETE：触发回溯给已渲染的 SC 行打删除标记，本身不入列）
  RoomBlock,      // 房间禁言（ROOM_BLOCK_MSG）
  RoomSilent,     // 房间范围禁言开关（ROOM_SILENT_ON/OFF）
  AdminChange,    // 房管任免（ROOM_ADMINS / room_admin_entrance / ROOM_ADMIN_REVOKE）
  RoomChange,     // 标题/分区变更（ROOM_CHANGE）
  LiveStart,      // 开播（LIVE）
  LiveEnd,        // 下播（PREPARING）
  Warning,        // 警告（WARNING）
  CutOff,         // 切断（CUT_OFF）
  CoverAudit,     // 直播封面状态变化（COVER_AUDIT_STATUS_CHANGED）
  Unknown = UNKNOWN_MSG_TYPE_CODE, // 未识别 cmd（保留 raw，便于发现新事件）
  RoomLock = 28,  // 直播间封禁（ROOM_LOCK）；追加编号，保留历史事件编号
}
