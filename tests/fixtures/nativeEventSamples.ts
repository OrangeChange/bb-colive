import type { DanmakuEvent } from "../../src/protocol/types.ts";

export const EVENT_CODES = [
  "Danmu", "Gift", "SuperChat", "GuardBuy", "AnchorLotStart", "AnchorLotAward",
  "RedPocketStart", "RedPocketWinner", "RedPocketGift", "GuardHonor", "Interact",
  "EntryEffect", "WatchedChange", "OnlineRank", "LikeUpdate", "FansUpdate", "Recall",
  "ScDeleted", "RoomBlock", "RoomSilent", "AdminChange", "RoomChange", "LiveStart",
  "LiveEnd", "Warning", "CutOff", "Unknown",
] as const;

export const SAMPLE_SOURCE = {
  kind: "synthetic",
  model: "src/protocol/types.ts",
  resources: "src/components/stylePreviewEvents.ts 的已认可静态资源",
  semantics: ["tests/danmuReplyMentions.test.mjs", "tests/giftMerge.test.mjs", "src/components/EventRow.tsx"],
  note: "模型层合成固定样本，不是原始协议捕获；横幅 unique 为合成 official_ 标识，复用已认可表情图片。",
} as const;

const small = "/media/style-preview-small-emote.png";
const big = "/media/native-preview/asset-020.png";
const giftImage = "https://i0.hdslb.com/bfs/live/1a58587ade058d840ed583b6b00e4ba7ce576f0c.webp";
const freeImage = "https://i0.hdslb.com/bfs/live/32b799120e1614fa6275b6d15da7a52b21dd019d.webp";
const blindImage = "https://i0.hdslb.com/bfs/live/36d30796ec582c5bc4f83badd5a59a11e5e4d956.webp";
const hitImage = "https://i0.hdslb.com/bfs/live/0aa76c0b4ab72cc93a7e28012088fac1f53baf0d.webp";
const user = { uid: "sample-user", uname: "固定用户", guardLevel: 1 as const, guardMilestone: "standard" as const, guardIconSet: "base" as const };
const ordinaryGift = { id: 35768, name: "亲密之旅", count: 1, price: 50000, total: 50000, coinType: "gold", priceRmb: 50, totalRmb: 50, isFree: false, webp: giftImage, icon: giftImage };
const winners = [{ uid: "sample-winner", uname: "中奖用户", awardName: "限定礼物" }, { uid: "sample-winner-2", uname: "另一位中奖者", awardName: "限定礼物" }];
const pocketWinners = [{ uid: "sample-winner", uname: "中奖用户", awardName: "瓜子红包" }, { uid: "sample-winner-2", uname: "另一位中奖者", awardName: "瓜子红包" }];

export interface NativeEventSample {
  key: string;
  source: typeof SAMPLE_SOURCE;
  handling: "row" | "stats" | "update" | "ignored";
  primaryCategory: string | null;
  secondaryCategory: string | null;
  event: DanmakuEvent;
}

function sample(key: string, msgType: number, payload: Partial<DanmakuEvent>, primaryCategory: string | null, secondaryCategory: string | null = null): NativeEventSample {
  return {
    key, source: SAMPLE_SOURCE,
    handling: [8, 16].includes(msgType) ? "ignored" : [12, 13, 14, 15].includes(msgType) ? "stats" : msgType === 17 ? "update" : "row",
    primaryCategory, secondaryCategory,
    event: { id: `fixed-${key}`, roomId: 6431492, ts: 1700000000000 + msgType, msgType, ...payload },
  };
}

export const nativeEventSamples: NativeEventSample[] = [
  sample("text", 0, { user, text: "固定弹幕文字" }, "danmu"),
  sample("normal-gift", 1, { user, gift: ordinaryGift, comboId: "fixed-combo", dedupe: "fixed-gift-source", reactKey: "fixed-gift-row" }, "gift", "normal"),
  sample("sc", 2, { user, sc: { price: 30, message: "固定醒目留言", duration: 30 } }, "superChat"),
  sample("guard", 3, { user, guard: { level: 1, count: 1, unit: "月", action: "开通", priceRmb: 198 }, text: "今天是TA陪伴主播的第30天" }, "guard"),
  sample("lottery-start", 4, { lottery: { id: 10002, awardName: "限定礼物", awardNum: 3, danmu: "好运来", maxTime: 600, giftName: "小心心", requireText: "关注主播" } }, "lottery"),
  sample("lottery-result", 5, { user: { uid: winners[0].uid, uname: winners[0].uname, guardLevel: 0 }, lottery: { id: 10002, awardName: "限定礼物", awardNum: 3, winners } }, "lottery"),
  sample("pocket-start", 6, { user, text: "发出红包", pocket: { lotId: 10001, danmu: "老板大气！" }, lottery: { id: 10001, awardName: "瓜子红包", awardNum: 8, totalPrice: 10000, waitTime: 600, awards: [{ id: 35768, name: "亲密之旅", count: 1 }] } }, "redPocket"),
  sample("pocket-result", 7, { user: { uid: pocketWinners[0].uid, uname: pocketWinners[0].uname, guardLevel: 0 }, lottery: { id: 10001, awardName: "瓜子红包", awardNum: 2, winners: pocketWinners } }, "redPocket"),
  sample("pocket-gift", 8, { user, gift: ordinaryGift, pocket: { lotId: 10001 } }, "redPocket"),
  sample("honor", 9, { honor: { firstLine: "恭喜主播<%固定主播%>", secondLine: "舰队规模突破<%1000%>" } }, "guard"),
  sample("entry", 10, { user, interactKind: "entry", text: "进入直播间" }, "interact", "entry"),
  sample("historical-entry-effect", 11, { user, text: "进入直播间" }, "interact"),
  sample("watched", 12, { stats: { watched: 12345, watchedUpdatedAt: 1700000000012 } }, null),
  sample("online", 13, { stats: { online: 456, onlineUpdatedAt: 1700000000013 } }, null),
  sample("likes", 14, { stats: { likes: 789, likesUpdatedAt: 1700000000014 } }, null),
  sample("fans", 15, { stats: { fans: 1000, fansClub: 100, fansClubUpdatedAt: 1700000000015 } }, null),
  sample("recall", 16, { user, text: "撤回了一条弹幕", recallTarget: "fixed-text" }, "system"),
  sample("sc-delete", 17, { scDeleteIds: ["fixed-sc"] }, null),
  sample("block", 18, { user, text: "被禁言", roomBlock: { validPeriod: "1小时" } }, "system"),
  sample("silent", 19, { text: "房间开启禁言", roomSilent: { action: "on", type: "level", level: 10, second: 3600 } }, "system"),
  sample("admin", 20, { user, text: "成为房管" }, "system"),
  sample("room-change", 21, { text: "房间信息发生变化", stats: { roomTitle: "固定标题", roomArea: "聊天", roomChangedAt: 1700000000021 } }, "system"),
  sample("live-start", 22, { text: "直播开始", stats: { liveStartedAt: 1700000000022 } }, "system"),
  sample("live-end", 23, { text: "直播结束", stats: { liveEndedAt: 1700000000023 } }, "system"),
  sample("warning", 24, { text: "固定警告内容" }, "system"),
  sample("cutoff", 25, { text: "直播被切断" }, "system"),
  sample("unknown", 27, { text: "FIXED_UNKNOWN" }, "system"),
  sample("reply", 0, { user, text: "这期神了", replyTo: { uid: "sample-target", uname: "目标用户", guardLevel: 0 } }, "danmu"),
  sample("inline-reply", 0, { user, text: "@目标用户，欢迎", replyTo: { uid: "sample-target", uname: "目标用户", guardLevel: 0 } }, "danmu"),
  sample("plain-at", 0, { user, text: "@普通文本" }, "danmu"),
  sample("mixed-emote", 0, { user, text: "文字[热]结尾", emotes: { "[热]": { url: small, width: 20, height: 20 } } }, "danmu"),
  sample("big-emote", 0, { user, text: "666", emoticon: { url: big, width: 162, height: 162, unique: "room_545068_9735" } }, "danmu"),
  sample("banner-emote", 0, { user, text: "横幅", emoticon: { url: "/media/native-preview/asset-080.png", width: 195, height: 60, unique: "official_fixed_banner" } }, "danmu"),
  sample("free-gift", 1, { user, gift: { id: 31738, name: "粉丝团灯牌", count: 1, price: 1000, total: 1000, coinType: "silver", isFree: true, priceRmb: 0, totalRmb: 0, webp: freeImage } }, "gift", "free"),
  sample("blind-gift", 1, { user, gift: { id: 35311, name: "好运柚叶", count: 2, price: 2500, total: 5000, coinType: "gold", priceRmb: 2.5, totalRmb: 5, isFree: false, webp: hitImage, blindGiftName: "幸运盲盒", blindPriceRmb: 5, blindHitPriceRmb: 2.5, blindWebp: blindImage } }, "gift", "blind"),
  sample("guard-special", 3, { user, guard: { level: 1, count: 1, unit: "*5天", action: "续费", priceRmb: 0 }, text: "今天是TA陪伴主播的第30天" }, "guard"),
  sample("guard-admiral", 3, { user: { ...user, guardLevel: 2, guardMilestone: "thousand", guardIconSet: "enhanced" }, guard: { level: 2, count: 3, unit: "月", action: "续费", priceRmb: 5994 }, text: "今天是TA陪伴主播的第365天" }, "guard"),
  sample("guard-governor", 3, { user: { ...user, guardLevel: 3, guardMilestone: "tenThousand", guardIconSet: "enhanced" }, guard: { level: 3, count: 1, unit: "月", action: "升级", priceRmb: 19998 }, text: "今天是TA陪伴主播的第1000天" }, "guard"),
  sample("identity", 0, { user: { ...user, isAnchor: true, isAdmin: true, wealthLevel: 57, wealthIconKey: "ChronosWealth_8.png", currentRank: 1, medal: { name: "样例牌", level: 12, isCurrentRoom: true, isLighted: true } }, text: "多个身份共存" }, "danmu"),
  sample("deleted-sc", 2, { user, sc: { price: 30, message: "固定留言正文", duration: 30 }, scDeleted: true }, "superChat"),
  sample("translated-sc", 2, { user, sc: { price: 30, message: "带翻译留言", duration: 30, trans: "翻訳" } }, "superChat"),
  ...([
    ["follow", "关注了主播"], ["share", "分享了直播间"], ["specialFollow", "特别关注了主播"], ["mutualFollow", "互相关注了"], ["like", "为主播点赞了"],
  ] as const).map(([interactKind, text]) => sample(interactKind, 10, { user, interactKind, text }, "interact", interactKind)),
];

export function getNativeEventSample(key: string): DanmakuEvent {
  const item = nativeEventSamples.find((sample) => sample.key === key);
  if (!item) throw new Error(`没有固定样本：${key}`);
  return structuredClone(item.event);
}

export const comboUpdateSample: DanmakuEvent = {
  id: "fixed-combo-update", roomId: 6431492, ts: 1700000001000, msgType: 1,
  user, comboId: "fixed-combo", isComboUpdate: true,
  gift: { ...ordinaryGift, count: 3, total: 150000, totalRmb: 150 },
};

export const browserAcceptanceAreas = ["live", "review", "window-chat", "window-pay"] as const;
