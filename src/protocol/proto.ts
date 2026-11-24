/**
 * B 站直播 V2 命令的 protobuf 定义（JSON descriptor 形态，供 protobufjs Root.fromJSON 内联使用）。
 *
 * 仅定义我们需要的字段，不追求与官方 .proto 完全一致。
 * 字段编号依据真机抓包（通用 pb 解码器）解码结果确认，各命令族版本来源不同：
 *   INTERACT_WORD_V2: 依据 21696950（阿萨Aza）抓包样本
 *   INTERACT_WORD_V2: 1=uid 2=uname 5=msg_type 6=room_id 7=秒级ts(可靠)
 *                     8=score积分(非时间戳！曾误当毫秒ts导致约三成时间错乱)
 *                     9=粉丝勋章{1:主播uid 2:等级 3:勋章名} 15=纳秒ts
 *                     16=guard_level大航海(1总督/2提督/3舰长，optional，普通用户无此字段)
 *                     22=uinfo{1:uid 2:base{1:uname 2:face} 3:勋章 4:财富等级 6:guard}
 *   16 与 22.6 均经真机验证：13 个已知舰长/提督 100% 吻合，77 个普通用户均无此字段
 *
 * 字段来源：bilibili-API-collect issue#1332（社区逆向文档，见
 * reference/bili-live-hime/protos/InteractWordV2.proto）+ 真机 21696950 抓包验证
 *   SEND_GIFT_V2: 1=uid 2=uname(string) 5=大航海等级 8=其他粉丝勋章块
 *                 9=盲盒信息 10=重复礼物块
 *                 15=当前房间用户资料{3:当前房间粉丝勋章{1:勋章名 2:等级 10:主播uid 11:大航海等级}}
 *   礼物块(field10): 1=giftId 2=name 3=num 5=单价 6=单价副本候选 7=总价候选
 *                     8=coinType 18=动作(投喂) 29=收礼主播 35=icon{1:png 2:webp 5:gif}
 *   真机来源：阿梓 80397 + 乃琳Queen 22625027（2026-08-29），两房共 33323 条样本
 *     顶层结构 100% 一致：field 2 始终是 string(uname)，绝非嵌套 message。
 *   【历史错误记录】
 *     1) 早期把 field 8 当礼物块 → 勋章名被显示成礼物名（80397 复现）
 *     2) 又一度把 field 2 改成 uinfo{9:uname} 嵌套 message → protobufjs 把 string
 *        字节当 message 解析时 98% 抛 invalid tag encoding，整条礼物事件丢失
 *        （22625027 全场礼物行渲染成「🎁送出×1免费」，2026-08-30 修正）
 *     3) totalCoin 误标 field 6（实为单价副本候选）后导致 ×N 礼物少算；当前改用
 *        field 7，但 2026-09-01/02 真机仍有 46 条 field7 != field5×num，金额语义待确认，
 *        详见 docs/gift-price-fields-analysis.md
 *
 * 未知字段会被 protobufjs 静默跳过，因此后续若发现新字段可直接在此追加。
 * 各命令族 V1/V2/V3 的分发规律与 adapter 覆盖情况见 docs/protocol-versions.md。
 */
import protobuf from 'protobufjs'

const { Root } = protobuf

const root = Root.fromJSON({
  nested: {
    InteractWordV2: {
      fields: {
        uid: { id: 1, type: 'int64' },
        uname: { id: 2, type: 'string' },
        msgType: { id: 5, type: 'int32' },
        roomId: { id: 6, type: 'int64' },
        // 7=秒级 ts（可靠）；字段 8 为 score 积分，非时间戳
        tsSec: { id: 7, type: 'int64' },
        // 15=纳秒级事件时间；用于区分同一用户同一秒内的多次互动
        tsNano: { id: 15, type: 'int64' },
        // 9=粉丝勋章（顶层字段）
        medal: { id: 9, type: 'MedalInfo' },
        // 16=大航海等级（optional，1总督/2提督/3舰长；普通用户不携带）
        guardLevel: { id: 16, type: 'int32' },
        uinfo: {
          id: 22,
          type: 'Uinfo',
        },
      },
    },
    Uinfo: {
      fields: {
        uid: { id: 1, type: 'int64' },
        base: { id: 2, type: 'UinfoBase' },
        // 3=勋章 4=财富等级（曾误判为大航海）6=guard（与顶层字段16互为冗余，兜底用）
        medalInfo: { id: 3, type: 'MedalInfo' },
        wealth: { id: 4, type: 'WealthInfo' },
        guard: { id: 6, type: 'GuardInfo' },
      },
    },
    WealthInfo: {
      fields: {
        level: { id: 1, type: 'int32' },
        dmIconKey: { id: 2, type: 'string' },
      },
    },
    UinfoBase: {
      fields: {
        name: { id: 1, type: 'string' },
        face: { id: 2, type: 'string' },
      },
    },
    MedalInfo: {
      fields: {
        anchorUid: { id: 1, type: 'int64' },
        level: { id: 2, type: 'int32' },
        name: { id: 3, type: 'string' },
        // 8=是否点亮粉丝牌；9=线上大航海等级。
        guardLevel: { id: 9, type: 'int32' },
        isLighted: { id: 8, type: 'int32', options: { proto3_optional: true, features: { field_presence: 'EXPLICIT' } } },
      },
    },
    GuardInfo: {
      fields: {
        level: { id: 1, type: 'int32' },
        expiredStr: { id: 2, type: 'string' },
      },
    },
    // field 2 是 uname 字符串（两房 33323 条样本 100% wire type 2，绝非嵌套 message）；
    // field 3 是 face URL；field 8 是粉丝勋章块（非礼物）；礼物块在 field 10
    SendGiftV2: {
      fields: {
        uid: { id: 1, type: 'int64' },
        uname: { id: 2, type: 'string' },
        face: { id: 3, type: 'string' },
        // field 5 与 field 15.medal.guardLevel 同源，均为线上值：1总督/2提督/3舰长
        guardLevel: { id: 5, type: 'int32' },
        // field 8 可能是用户在其他主播处的粉丝牌，不能当作当前房间粉丝牌
        medalBlock: { id: 8, type: 'SendGiftMedalBlock' },
        // field 9 是盲盒本体信息；没有该字段时才是普通礼物报文
        blindGift: { id: 9, type: 'BlindGiftInfo' },
        // 一个 V2 报文可能包含多个盲盒结果，必须保留原始顺序
        gift: { id: 10, type: 'GiftItem', rule: 'repeated' },
        wealth: { id: 13, type: 'WealthInfo' },
        // field 15 是发送者资料；粉丝牌按主播UID判断归属
        userInfo: { id: 15, type: 'SendGiftUserInfo' },
      },
    },
    SendGiftUserInfo: {
      fields: {
        uid: { id: 1, type: 'int64' },
        base: { id: 2, type: 'SendGiftUserBase' },
        medal: { id: 3, type: 'SendGiftMedal' },
        wealth: { id: 4, type: 'WealthInfo' },
      },
    },
    SendGiftUserBase: {
      fields: {
        name: { id: 1, type: 'string' },
        face: { id: 2, type: 'string' },
      },
    },
    SendGiftMedal: {
      fields: {
        name: { id: 1, type: 'string' },
        level: { id: 2, type: 'int32' },
        type: { id: 8, type: 'int32' },
        guardIconUrl: { id: 13, type: 'string' },
        // field 9=是否点亮；10=主播 UID；11=大航海等级
        isLighted: { id: 9, type: 'int32', options: { proto3_optional: true, features: { field_presence: 'EXPLICIT' } } },
        ruid: { id: 10, type: 'int64' },
        guardLevel: { id: 11, type: 'int32' },
      },
    },
    SendGiftMedalBlock: {
      fields: {
        anchorUid: { id: 1, type: 'int64' },
        level: { id: 5, type: 'int32' },
        name: { id: 6, type: 'string' },
        guardLevel: { id: 12, type: 'int32' },
        isLighted: { id: 11, type: 'int32', options: { proto3_optional: true, features: { field_presence: 'EXPLICIT' } } },
      },
    },
    BlindGiftInfo: {
      fields: {
        giftId: { id: 2, type: 'int64' },
        name: { id: 3, type: 'string' },
        action: { id: 5, type: 'string' },
        price: { id: 6, type: 'int64' },
      },
    },
    // 礼物图标：field 35 为嵌套 message，1=png 2=webp 5=gif（真机 80397/22625027 验证）
    GiftIcon: {
      fields: {
        png: { id: 1, type: 'string' },
        webp: { id: 2, type: 'string' },
        gif: { id: 5, type: 'string' },
      },
    },
    GiftItem: {
      fields: {
        giftId: { id: 1, type: 'int64' },
        name: { id: 2, type: 'string' },
        num: { id: 3, type: 'int32' },
        price: { id: 5, type: 'int64' },          // 单价瓜子数
        // field 7 为支付总金额；盲盒按本体价格，不按开出礼物单价。
        // 普通、批量和盲盒样本依据见 docs/research/gift-price-fields-analysis.md。
        totalCoin: { id: 7, type: 'int64' },
        coinType: { id: 8, type: 'string' },      // gold/silver
        timestamp: { id: 10, type: 'int64' },
        itemId: { id: 12, type: 'string' },       // 单个礼物结果 UUID，用于去重
        icon: { id: 35, type: 'GiftIcon' },
      },
    },
    // ONLINE_RANK_V3：榜单快照只进入 Laplace 兼容状态通路，不转成普通事件。
    OnlineRankBase: {
      fields: {
        name: { id: 1, type: 'string' },
        face: { id: 2, type: 'string' },
        nameColor: { id: 3, type: 'int64' },
        isMystery: { id: 4, type: 'bool' },
        nameColorStr: { id: 8, type: 'string' },
      },
    },
    OnlineRankMedal: {
      fields: {
        name: { id: 1, type: 'string' },
        level: { id: 2, type: 'int64' },
        colorStart: { id: 3, type: 'int64' },
        colorEnd: { id: 4, type: 'int64' },
        colorBorder: { id: 5, type: 'int64' },
        color: { id: 6, type: 'int64' },
        id: { id: 7, type: 'int64' },
        typ: { id: 8, type: 'int32' },
        isLight: { id: 9, type: 'int64' },
        ruid: { id: 10, type: 'int64' },
        guardLevel: { id: 11, type: 'int64' },
        score: { id: 12, type: 'int64' },
        guardIcon: { id: 13, type: 'string' },
        honorIcon: { id: 14, type: 'string' },
        v2MedalColorStart: { id: 15, type: 'string' },
        v2MedalColorEnd: { id: 16, type: 'string' },
        v2MedalColorBorder: { id: 17, type: 'string' },
        v2MedalColorText: { id: 18, type: 'string' },
        v2MedalColorLevel: { id: 19, type: 'string' },
        userReceiveCount: { id: 20, type: 'int64' },
      },
    },
    OnlineRankWealth: {
      fields: {
        level: { id: 1, type: 'int64' },
        dmIconKey: { id: 2, type: 'string' },
      },
    },
    OnlineRankTitle: {
      fields: {
        oldTitleCssId: { id: 1, type: 'string' },
        titleCssId: { id: 2, type: 'string' },
      },
    },
    OnlineRankGuard: {
      fields: {
        level: { id: 1, type: 'int64' },
        expiredStr: { id: 2, type: 'string' },
      },
    },
    OnlineRankUserHeadFrame: {
      fields: {
        id: { id: 1, type: 'int64' },
        frameImg: { id: 2, type: 'string' },
      },
    },
    OnlineRankGuardLeader: {
      fields: {
        isGuardLeader: { id: 1, type: 'bool' },
      },
    },
    OnlineRankUserInfo: {
      fields: {
        uid: { id: 1, type: 'int64' },
        base: { id: 2, type: 'OnlineRankBase' },
        medal: { id: 3, type: 'OnlineRankMedal' },
        wealth: { id: 4, type: 'OnlineRankWealth' },
        title: { id: 5, type: 'OnlineRankTitle' },
        guard: { id: 6, type: 'OnlineRankGuard' },
        uheadFrame: { id: 7, type: 'OnlineRankUserHeadFrame' },
        guardLeader: { id: 8, type: 'OnlineRankGuardLeader' },
      },
    },
    GoldRankBroadcastItem: {
      fields: {
        uid: { id: 1, type: 'int64' },
        face: { id: 2, type: 'string' },
        score: { id: 3, type: 'string' },
        uname: { id: 4, type: 'string' },
        rank: { id: 5, type: 'int64' },
        guardLevel: { id: 6, type: 'int64' },
        isMystery: { id: 7, type: 'bool' },
        uinfo: { id: 8, type: 'OnlineRankUserInfo' },
      },
    },
    GoldRankBroadcast: {
      fields: {
        rankType: { id: 1, type: 'string' },
        list: { id: 2, type: 'GoldRankBroadcastItem', rule: 'repeated' },
        onlineList: { id: 3, type: 'GoldRankBroadcastItem', rule: 'repeated' },
      },
    },
  },
})

export const InteractWordV2 = root.lookupType('InteractWordV2')
export const SendGiftV2 = root.lookupType('SendGiftV2')
export const GoldRankBroadcast = root.lookupType('GoldRankBroadcast')

/** base64 -> Uint8Array */
export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}
