import { installCompatiblePropertyCapabilities } from "../../themes/compatThemeCapabilities.ts";
import { installCompatibleEventGroups } from "../../themes/compatThemeCapabilities.ts";
import type { CompatibleThemeCapabilityMap } from "../../themes/compatThemeCapabilities.ts";
import type { LaplaceThemeSettings } from "../../themes/compatThemeSettings.ts";
import { renderCompatibleManagedCss } from "../../themes/compatManagedCss.ts";

const text = [
  "visible",
  "color",
  "fontFamily",
  "fontSize",
  "lineHeight",
  "marginX",
  "marginY",
] as const;
const box = [
  "visible",
  "background",
  "paddingX",
  "paddingY",
  "marginX",
  "marginY",
  "gap",
  "borderWidth",
  "borderColor",
  "borderRadius",
] as const;
const textDefaults = {
  visible: true,
  color: "inherit",
  fontFamily:
    'ui-sans-serif, system-ui, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif',
  fontSize: 20,
  lineHeight: 1.5,
  marginX: 0,
  marginY: 0,
};
const boxDefaults = {
  visible: true,
  background: "transparent",
  paddingX: 10,
  paddingY: 2.5,
  marginX: 0,
  marginY: 0,
  gap: 4,
  borderWidth: 0,
  borderColor: "transparent",
  borderRadius: 0,
};
const events = {
  danmaku: ".event--message",
  interaction: ".event--interaction",
  like: ".event--like-click",
  entry: ".event--interaction.event-action--enter, .event--entry-effect",
  follow: ".event--interaction.event-action--follow",
  share: ".event--interaction.event-action--share",
  "special-follow": ".event--interaction.event-action--follow-special",
  "mutual-follow": ".event--interaction.event-action--follow-mutual",
  "live-status": ".event--live-start, .event--live-end",
  "user-block": ".event--user-block",
  "room-mute": ".event--room-mute-on, .event--room-mute-off",
  "room-change": ".event--room-name-update",
  warning: ".event--live-warning, .event--live-cutoff",
  gift: ".event--gift",
  superchat: ".event--superchat",
  guard: ".event--toast",
  redStart: ".event--red-envelope-start",
  redResult: ".event--red-envelope-result",
  lotteryStart: ".event--lottery-start",
  lotteryResult: ".event--lottery-result",
  system:
    ".event--system, .event--live-start, .event--live-end, .event--user-block, .event--room-mute-on, .event--room-mute-off, .event--room-name-update, .event--live-warning, .event--live-cutoff",
};
export const LAPLACE_CAPABILITY: CompatibleThemeCapabilityMap = {
  mode: "laplace",
  parts: {
    guardType: {label:"大航海类型",selector:".toast-details-type",properties:text,codeDefaults:textDefaults,placements:["main"],events:["guard"],units:{lineHeight:"number"}},
    guardSymbol: {label:"乘号",selector:".toast-details-symbol",properties:text,codeDefaults:textDefaults,placements:["main"],events:["guard"],units:{lineHeight:"number"}},
    guardFigure: {label:"数量",selector:".toast-details-figure",properties:text,codeDefaults:textDefaults,placements:["main"],events:["guard"],units:{lineHeight:"number"}},
    guardUnit: {label:"单位",selector:".toast-details-unit",properties:text,codeDefaults:textDefaults,placements:["main"],events:["guard"],units:{lineHeight:"number"}},
    guardDaysBefore: {label:"前缀",selector:".toast-details-total-days-text-before",properties:text,codeDefaults:textDefaults,placements:["main"],events:["guard"],units:{lineHeight:"number"}},
    guardDays: {label:"天数",selector:".toast-details-total-days",properties:text,codeDefaults:textDefaults,placements:["main"],events:["guard"],units:{lineHeight:"number"}},
    guardDaysAfter: {label:"后缀",selector:".toast-details-total-days-text-after",properties:text,codeDefaults:textDefaults,placements:["main"],events:["guard"],units:{lineHeight:"number"}},
    winnerTitle: {label:"名单标题（含人数）",selector:".details-name",properties:text,codeDefaults:textDefaults,placements:["main"],events:["redResult", "lotteryResult"],units:{lineHeight:"number"}},
    winnerToggle: {previewTarget:"live",label:"展开按钮",selector:".toggle-button",properties:text,codeDefaults:textDefaults,placements:["main"],events:["redResult", "lotteryResult"],units:{lineHeight:"number"}},
    redTitle: {label:"活动标题",selector:".red-envelope-start-details-name",properties:text,codeDefaults:textDefaults,placements:["main"],events:["redStart"],units:{lineHeight:"number"}},
    rewardCount: {label:"数量",selector:".rewards-item-count",properties:text,codeDefaults:textDefaults,placements:["main"],events:["redStart"],units:{lineHeight:"number"}},
    lotteryMessage: {label:"标题与奖品",selector:".lottery-start-details-message",properties:text,codeDefaults:textDefaults,placements:["main"],events:["lotteryStart"],units:{lineHeight:"number"}},
    lotteryPrize: {label:"奖品",selector:".lottery-start-details-message b",properties:text,codeDefaults:textDefaults,placements:["main"],events:["lotteryStart"],units:{lineHeight:"number"}},
    lotteryRequirements: {label:"参与条件",selector:".lottery-start-details-requirements",properties:text,codeDefaults:textDefaults,placements:["main"],events:["lotteryStart"],units:{lineHeight:"number"}},
    lotteryGiftName: {label:"礼物名称",selector:".lottery-start-details-requirements b",properties:text,codeDefaults:textDefaults,placements:["main"],events:["lotteryStart"],units:{lineHeight:"number"}},
    lotteryGiftPrice: {label:"价格",selector:".lottery-start-details-requirements .price",properties:text,codeDefaults:textDefaults,placements:["main"],events:["lotteryStart"],units:{lineHeight:"number"}},
    muteOperator: {label:"禁言操作者",selector:".block-operator",properties:text,codeDefaults:textDefaults,placements:["main"],events:["system"],units:{lineHeight:"number"}},
    muteDuration: {label:"禁言时长",selector:".block-duration",properties:text,codeDefaults:textDefaults,placements:["main"],events:["system"],units:{lineHeight:"number"}},
    wealthText: {label:"等级文字",selector:".wealth-medal-text",properties:text,codeDefaults:textDefaults,placements:["main"],units:{lineHeight:"number"}},
    header: {label:"头部",selector:".top",properties:box,codeDefaults:boxDefaults,placements:["main"]},
    meta: {label:"元信息区域",selector:".meta",properties:box,codeDefaults:boxDefaults,placements:["main"]},
    usernameWrap: {label:"用户名区域",selector:".username-wrap",properties:box,codeDefaults:boxDefaults,placements:["main"]},
    timestampWrap: {previewTarget:"live",label:"时间区域",selector:".timestamp-wrap",properties:box,codeDefaults:boxDefaults,placements:["main"],events:["superchat"]},
    body: {label:"正文容器",selector:".message",events:["superchat"],properties:box,codeDefaults:boxDefaults,placements:["main"]},
    winnerContent: {label:"中奖内容",selector:".event--red-envelope-result > .content, .event--lottery-result > .content",selectorsByPlacement:{main:"> .content"},properties:box,codeDefaults:boxDefaults,placements:["main"],events:["redResult", "lotteryResult"]},
    winnerMask: {label:"名单遮罩",selector:".rewards-items-mask",properties:box,codeDefaults:boxDefaults,placements:["main"],events:["redResult", "lotteryResult"]},
    winnerList: {label:"中奖列表",selector:".rewards-items-wrap",properties:box,codeDefaults:boxDefaults,placements:["main"],events:["redResult", "lotteryResult"]},
    winnerItem: {label:"中奖项",selector:".list-item-wrap",properties:box,codeDefaults:boxDefaults,placements:["main"],events:["redResult", "lotteryResult"]},
    rewardList: {label:"奖励列表",selector:".red-envelope-start-rewards",properties:box,codeDefaults:boxDefaults,placements:["main"],events:["redStart"]},
    rewardItem: {label:"奖励项",selector:".rewards-item-wrap",properties:box,codeDefaults:boxDefaults,placements:["main"],events:["redStart"]},
    rewardPicture: {label:"图片区域",selector:".rewards-item-picture-wrap",properties:box,codeDefaults:boxDefaults,placements:["main"],events:["redStart"]},
    deleted: {previewTarget:"live",label:"删除状态",selector:".deleted-badge",properties:["visible","width","height","paddingX","paddingY","marginX","marginY","borderWidth","borderColor","borderRadius"],codeDefaults:{visible:true},placements:["main"],events:["superchat"]},
    winnerAvatar: {label:"中奖头像",selector:".list-item-wrap img.avatar",properties:["visible","width","height","marginX","marginY","borderRadius"],codeDefaults:{visible:true},placements:["main"],events:["redResult", "lotteryResult"]},
    rewardImage: {label:"图片",selector:".rewards-item-picture-wrap img",properties:["visible","width","height","marginX","marginY","borderRadius"],codeDefaults:{visible:true},placements:["main"],events:["redStart"]},
    streamerBadgeIcon: {label:"主播徽章",selector:".streamer-badge-wrap svg",properties:["visible","width","height","marginX","marginY","borderRadius"],codeDefaults:{visible:true},placements:["main"]},
    modBadgeIcon: {label:"房管徽章",selector:".mod-badge-wrap svg",properties:["visible","width","height","marginX","marginY","borderRadius"],codeDefaults:{visible:true},placements:["main"]},
    wealthImage: {label:"图像",selector:".wealth-medal img",properties:["visible","width","height","marginX","marginY","borderRadius"],codeDefaults:{visible:true},placements:["main"]},

    allEvents: { label: "所有事件", scope: "event", selector: ".event-list .event, .gift-sticky-bar .event", properties: box, codeDefaults: boxDefaults, placements: ["main"] },
    ticker: { label: "置顶栏", scope: "global", selector: ".gift-sticky-bar", properties: box, codeDefaults: boxDefaults, placements: ["sticky"] },
    eventArea: { scope: "global", label: "事件区", selector: ".events-list-wrap", properties: box, codeDefaults: boxDefaults, placements: ["main"] },
    eventList: { scope: "global", label: "事件列表", selector: ".event-list", properties: box, codeDefaults: boxDefaults, placements: ["main"] },
    event: {
      label: "事件容器",
      selector: ".event",
      properties: box,
      codeDefaults: boxDefaults,
      codeDefaultsByEvent: { danmaku: { paddingX: 10, paddingY: 2.5 } },
      scaleByProperty: { paddingX: "base-font", paddingY: "base-font" },
      placements: ["main", "sticky"],
    },
    username: {
      label: "用户名",
      selector: ".username",
      properties: text,
      units: { lineHeight: "number" },
      codeDefaults: textDefaults,
      scaleByProperty: { fontSize: "base-font" },
      placements: ["main"],
    },
    contentArea: { label: "内容区域", selector: ".event > .content", selectorsByPlacement: { main: "> .content", sticky: "> .content" }, properties: box, codeDefaults: boxDefaults, placements: ["main", "sticky"] },
    avatarWrap: { label: "头像区域", selector: ".avatar-wrap:not(.reply .avatar-wrap):not(.gift-receiver .avatar-wrap):not(.list-item-wrap .avatar-wrap)", properties: box, codeDefaults: boxDefaults, placements: ["main", "sticky"] },
    avatarFrame: { label: "头像框", selector: ".avatar-frame:not(.reply *):not(.gift-receiver *):not(.list-item-wrap *)", properties: ["visible", "width", "height", "marginX", "marginY"], codeDefaults: { visible: true, width: 40, height: 40, marginX: 0, marginY: 0 }, placements: ["main", "sticky"] },
    avatarImageWrap: { label: "头像图片区域", selector: ".avatar-img-wrap:not(.reply *):not(.gift-receiver *):not(.list-item-wrap *)", properties: box, codeDefaults: boxDefaults, placements: ["main", "sticky"] },
    action: { label: "动作文字", selector: ".toast-details-action, .red-envelope-start-details-action", properties: text, units: { lineHeight: "number" }, codeDefaults: textDefaults, placements: ["main"] },
    eventIcon: { events: ["redStart", "lotteryStart"], label: "事件图标", selector: ".gift-icon-wrap:not(.gift-image-wrap), .toast-icon-wrap, .red-envelope-start-icon-wrap, .lottery-start-icon-wrap", properties: ["visible", "width", "height", "marginX", "marginY"], codeDefaults: { visible: true, width: 48, height: 48, marginX: 0, marginY: 0 }, placements: ["main", "sticky"] },
    message: {
      label: "正文",
      selector: ".message-text, .message:not(:has(.message-text))",
      properties: text,
      units: { lineHeight: "number" },
      codeDefaults: textDefaults,
      scaleByProperty: { fontSize: "base-font" },
      placements: ["main"],
    },
    translation: {
      label: "译文",
      selector: ".message-translation",
      properties: text,
      units: { lineHeight: "number" },
      codeDefaults: textDefaults,
      events: ["superchat"],
      placements: ["main"],
    },
    reply: { label: "回复信息", selector: ".reply", events: ["danmaku"], properties: box, codeDefaults: boxDefaults, placements: ["main"] },
    replyAvatar: { label: "回复头像", selector: ".reply .avatar-wrap", events: ["danmaku"], properties: ["visible", "width", "height", "marginX", "marginY", "borderRadius"], codeDefaults: { visible: true, width: 30, height: 30, marginX: 0, marginY: 0, borderRadius: 30 }, placements: ["main"] },
    replyUsername: { label: "回复用户名", selector: ".reply-username", events: ["danmaku"], properties: text, units: { lineHeight: "number" }, codeDefaults: textDefaults, placements: ["main"] },
    spoiler: { label: "剧透片段", selector: ".spoiler", events: ["danmaku", "superchat"], properties: text, units: { lineHeight: "number" }, codeDefaults: textDefaults, placements: ["main"] },
    giftImageWrap: { label: "礼物图片区域", selector: ".gift-image-wrap", events: ["gift"], properties: box, codeDefaults: boxDefaults, placements: ["main", "sticky"] },
    giftImage: { label: "礼物图片", selector: ".gift-image-wrap img", events: ["gift"], properties: ["visible", "width", "height", "marginX", "marginY"], codeDefaults: { visible: true, width: 64, height: 64, marginX: 0, marginY: 0 }, placements: ["main", "sticky"] },
    giftName: { label: "礼物名称", selector: ".gift-details-name", events: ["gift"], properties: text, units: { lineHeight: "number" }, codeDefaults: textDefaults, placements: ["main"] },
    giftDetails: { label: "礼物详情", selector: ".gift-details", events: ["gift"], properties: text, units: { lineHeight: "number" }, codeDefaults: textDefaults, placements: ["main"] },
    giftSymbol: { label: "乘号", selector: ".gift-details-symbol", events: ["gift"], properties: text, units: { lineHeight: "number" }, codeDefaults: textDefaults, placements: ["main"] },
    giftCount: { label: "数量", selector: ".gift-details-figure", events: ["gift"], properties: text, units: { lineHeight: "number" }, codeDefaults: textDefaults, placements: ["main"] },
    giftDetailPrice: { label: "描述内金额", selector: ".gift-details-price", events: ["gift"], properties: text, units: { lineHeight: "number" }, codeDefaults: textDefaults, placements: ["main"] },
    giftBlind: { label: "盲盒信息", selector: ".gift-blind", events: ["gift"], properties: text, units: { lineHeight: "number" }, codeDefaults: textDefaults, placements: ["main"] },
    giftBlindName: { label: "盲盒名称", selector: ".gift-blind-name", events: ["gift"], properties: text, units: { lineHeight: "number" }, codeDefaults: textDefaults, placements: ["main"] },
    giftBlindAction: { label: "动作文字", selector: ".gift-blind-action", events: ["gift"], properties: text, units: { lineHeight: "number" }, codeDefaults: textDefaults, placements: ["main"] },
    giftPaidPrice: { label: "支付金额", selector: ".price-actual", events: ["gift"], properties: text, units: { lineHeight: "number" }, codeDefaults: textDefaults, placements: ["main"] },
    giftResultPrice: { label: "开出价值", selector: ".price > .price-currency, .price > .price-figure", events: ["gift"], properties: text, units: { lineHeight: "number" }, codeDefaults: textDefaults, placements: ["main"] },
    giftTrend: { label: "涨跌图标", selector: ".price-blind-result svg", events: ["gift"], properties: ["visible", "width", "height", "marginX", "marginY"], codeDefaults: { visible: true, width: 20, height: 20, marginX: 0, marginY: 0 }, placements: ["main"] },
    giftReceiver: { label: "收礼对象", selector: ".gift-receiver", events: ["gift"], properties: box, codeDefaults: boxDefaults, placements: ["main"] },
    giftReceiverAction: { label: "动作文字", selector: ".gift-receiver-action", events: ["gift"], properties: text, units: { lineHeight: "number" }, codeDefaults: textDefaults, placements: ["main"] },
    giftReceiverAvatar: { label: "收礼者头像", selector: ".gift-receiver .avatar-wrap", events: ["gift"], properties: ["visible", "width", "height", "marginX", "marginY", "borderRadius"], codeDefaults: { visible: true, width: 30, height: 30, marginX: 0, marginY: 0, borderRadius: 30 }, placements: ["main"] },
    giftReceiverUsername: { label: "收礼者用户名", selector: ".gift-receiver-username", events: ["gift"], properties: text, units: { lineHeight: "number" }, codeDefaults: textDefaults, placements: ["main"] },
    priceCurrency: { label: "货币符号", selector: ".price-currency", properties: text, units: { lineHeight: "number" }, codeDefaults: textDefaults, placements: ["main", "sticky"] },
    priceFigure: { label: "金额数值", selector: ".price-figure", properties: text, units: { lineHeight: "number" }, codeDefaults: textDefaults, placements: ["main", "sticky"] },
    smallEmoteWrap: { label: "行内表情区域", selector: ".bmote-wrap, .emote-wrap:not(.emote-wrap--large)", events: ["danmaku"], properties: box, codeDefaults: boxDefaults, placements: ["main"] },
    largeEmoteWrap: { label: "大表情区域", selector: ".emote-wrap--large", events: ["danmaku"], properties: box, codeDefaults: boxDefaults, placements: ["main"] },
    guardContent: { label: "大航海内容", selector: ".event--toast > .content", selectorsByPlacement:{main:"> .content",sticky:"> .content"}, events: ["guard"], properties: box, codeDefaults: boxDefaults, placements: ["main", "sticky"] },
    avatar: {
      label: "头像",
      selector: ".avatar-wrap:not(.reply .avatar-wrap):not(.gift-receiver .avatar-wrap):not(.list-item-wrap .avatar-wrap) img.avatar",
      properties: [
        "visible",
        "width",
        "height",
        "marginX",
        "marginY",
        "borderRadius",
      ],
      codeDefaults: {
        visible: true,
        width: 30,
        height: 30,
        marginX: 4,
        marginY: 0,
        borderRadius: 30,
      },
      codeDefaultsByEvent: {
        gift: { width: 40, height: 40, borderRadius: 40 },
        superchat: { width: 50, height: 50, borderRadius: 50 },
        guard: { width: 50, height: 50, borderRadius: 50 },
      },
      scaleByProperty: {
        width: "base-font",
        height: "base-font",
        borderRadius: "base-font",
      },
      placements: ["main", "sticky"],
    },
    fanMedal: {
      label: "粉丝牌",
      selector: ".fans-medal",
      properties: [
        "visible",
        "fontSize",
        "color",
        "background",
        "marginX",
        "marginY",
      ],
      codeDefaults: {
        visible: true,
        fontSize: 14,
        color: "#fff",
        background: "#a0a2a8",
        marginX: 2,
        marginY: 0,
      },
      placements: ["main"],
    },
    fanMedalContent: { label: "名称内容区", selector: ".fans-medal-content", properties: text, units: { lineHeight: "number" }, codeDefaults: textDefaults, placements: ["main"] },
    fanMedalGuard: { label: "牌内大航海徽章", selector: ".guard-badge-in-fans-medal", properties: ["visible", "width", "height", "marginX", "marginY"], codeDefaults: { visible: true, width: 18, height: 18, marginX: 0, marginY: 0 }, placements: ["main"] },
    fanMedalLevel: { label: "等级", selector: ".fans-medal-level", properties: text, units: { lineHeight: "number" }, codeDefaults: textDefaults, placements: ["main"] },
    guardBadge: { label: "大航海徽章", selector: ".guard-badge-in-meta", properties: ["visible", "width", "height", "marginX", "marginY"], codeDefaults: { visible: true, width: 18, height: 18, marginX: 0, marginY: 0 }, placements: ["main"] },
    streamerBadge: { label: "主播徽章", selector: ".streamer-badge-wrap", properties: box, codeDefaults: boxDefaults, placements: ["main"] },
    modBadge: { label: "房管徽章", selector: ".mod-badge-wrap", properties: box, codeDefaults: boxDefaults, placements: ["main"] },
    wealthMedal: { label: "荣耀勋章", selector: ".wealth-medal", properties: box, codeDefaults: boxDefaults, placements: ["main"] },
    currentRank: { label: "当前排行", selector: ".current-rank", properties: text, units: { lineHeight: "number" }, codeDefaults: textDefaults, placements: ["main"] },
    badge: {
      label: "徽章",
      selector:
        ".guard-badge, .mod-badge-wrap, .streamer-badge-wrap, .wealth-medal, .current-rank",
      properties: [
        "visible",
        "fontSize",
        "color",
        "background",
        "marginX",
        "marginY",
      ],
      codeDefaults: { visible: true, fontSize: 14, marginX: 2, marginY: 0 },
      placements: ["main"],
    },
    smallEmote: {
      label: "小表情",
      selector: ".bmote, .emote:not(.emote--large)",
      properties: ["visible", "width", "height", "marginX", "marginY"],
      codeDefaults: {
        visible: true,
        width: 20,
        height: 20,
        marginX: 2,
        marginY: 0,
      },
      events: ["danmaku"],
      placements: ["main"],
    },
    largeEmote: {
      label: "大表情",
      selector: ".emote--large",
      properties: ["visible", "width", "height", "marginX", "marginY"],
      codeDefaults: {
        visible: true,
        width: 120,
        height: 120,
        marginX: 0,
        marginY: 0,
      },
      events: ["danmaku"],
      placements: ["main"],
    },
    amount: {
      label: "金额",
      selector: ".price",
      properties: text,
      units: { lineHeight: "number" },
      codeDefaults: { ...textDefaults, fontSize: 12 },
      scaleByProperty: { fontSize: "base-font" },
      events: ["gift", "superchat", "guard", "redStart"],
      placements: ["main", "sticky"],
    },
    activity: {
      label: "红包与天选信息",
      selector:
        ".red-envelope-start-details, .red-envelope-start-details-action, .lottery-start-details-message, .lottery-start-details-requirements, .details-name, .rewards-items-wrap",
      properties: box,
      codeDefaults: boxDefaults,
      events: ["redStart", "redResult", "lotteryStart", "lotteryResult"],
      placements: ["main", "sticky"],
    },
    timestamp: {
      label: "时间",
      selector: ".timestamp",
      properties: text,
      units: { lineHeight: "number" },
      codeDefaults: { ...textDefaults, fontSize: 12 },
      events: [
        "danmaku",
        "interaction",
        "like",
        "gift",
        "redStart",
        "redResult",
        "lotteryStart",
        "lotteryResult",
        "system",
      ],
      placements: ["main"],
    },
  },
  eventSelectorsByPlacement: {
    main: Object.fromEntries(
      Object.entries({...events,winners:".event--red-envelope-result, .event--lottery-result"}).map(([key, value]) => [
        key,
        value
          .split(",")
          .map((branch) => `.event-list ${branch.trim()}`)
          .join(", "),
      ]),
    ),
    sticky: Object.fromEntries(
      Object.entries(events)
        .filter(([key]) =>
          ["gift", "superchat", "guard", "redStart", "lotteryStart"].includes(
            key,
          ),
        )
        .map(([key, value]) => [
          key,
          value
            .split(",")
            .map(
              (branch) =>
                `.gift-sticky-bar ${branch.trim()}.event-show-as--sticky`,
            )
            .join(", "),
        ]),
    ),
  },
  eventGroups: { system: ["system", "live-status", "user-block", "room-mute", "room-change", "warning"], interaction: ["interaction", "entry", "follow", "share", "special-follow", "mutual-follow", "like"], "gift-regular": ["gift"], redpocket: ["redStart", "redResult"], lottery: ["lotteryStart", "lotteryResult"], gift: ["gift", "redStart", "redResult", "lotteryStart", "lotteryResult"] },
  identitySelectors: {
    normal: ":not(.guard-level--1):not(.guard-level--2):not(.guard-level--3):not(.user-type--streamer):not(.user-type--mod)",
    captain: ".guard-level--3", admiral: ".guard-level--2", governor: ".guard-level--1",
    all: "",
    guard: ".guard-level--1, .guard-level--2, .guard-level--3",
    streamer: ".user-type--streamer",
    moderator: ".user-type--mod",
  },
  eventLabels: {
    entry: "进入直播间", follow: "关注", share: "分享", "special-follow": "特别关注", "mutual-follow": "互相关注",
    "live-status": "开播与下播", "user-block": "用户禁言", "room-mute": "全员禁言", "room-change": "房间信息变更", warning: "直播警告",
    interaction: "互动",
    "gift-regular": "普通礼物", redpocket: "红包", lottery: "天选",

    all: "全部事件",
    danmaku: "弹幕",
    like: "点赞",
    gift: "礼物",
    superchat: "醒目留言",
    guard: "大航海",
    redStart: "红包开始",
    winners: "全部中奖",
    redResult: "红包结果",
    lotteryStart: "天选开始",
    lotteryResult: "天选结果",
    system: "系统",
  },
  identityLabels: {
    normal: "普通用户",
    captain:"舰长", admiral:"提督", governor:"总督",
    all: "全部身份",
    guard: "大航海",
    streamer: "主播",
    moderator: "房管",
  },
  identityPriority: ["governor", "admiral", "captain", "guard", "streamer", "moderator"],
  schemeSelectors: {
    light: "[data-theme='light']",
    dark: "[data-theme='dark']",
  },
};

installCompatiblePropertyCapabilities(LAPLACE_CAPABILITY);

for (const definition of Object.values(LAPLACE_CAPABILITY.parts)) {
  const dimensions = definition.properties.filter(property => ["fontSize","paddingX","paddingY","marginX","marginY","gap","width","height","borderWidth","borderRadius"].includes(property));
  definition.scaleByProperty = { ...Object.fromEntries(dimensions.map(property => [property,"base-font" as const])), ...definition.scaleByProperty };
}

export function createLaplaceManagedCss(
  settings: LaplaceThemeSettings,
): string {
  return renderCompatibleManagedCss(
    LAPLACE_CAPABILITY,
    settings.visualModel ?? {},
  );
}

export function createLaplaceBaseCss(settings: LaplaceThemeSettings): string {
  const b = Number.isFinite(settings.baseFontSize) ? settings.baseFontSize : 20;
  return `@layer custom-css{:root{--event-font-size:${b}px;--event-base-size:${b}px}:root[data-show-timestamp="true"] .timestamp{display:inline-flex!important}}`;
}

for (const definition of Object.values(LAPLACE_CAPABILITY.parts)) {
  if (definition.events) definition.events = [...new Set(definition.events.flatMap(event =>
    event === "interaction" || event === "system" ? LAPLACE_CAPABILITY.eventGroups?.[event] ?? [event] : [event]))];
}
installCompatibleEventGroups(LAPLACE_CAPABILITY);

LAPLACE_CAPABILITY.parts.fanMedal.properties = [...new Set([...LAPLACE_CAPABILITY.parts.fanMedal.properties, ...text, ...(["background", "paddingX", "paddingY", "borderWidth", "borderColor", "borderRadius"] as const)])];
LAPLACE_CAPABILITY.parts.fanMedal.units = { lineHeight: "number" };

LAPLACE_CAPABILITY.parts.giftPaidPrice.eventFilter = ":has(.gift-blind)";

LAPLACE_CAPABILITY.parts.giftResultPrice.eventFilter = ":has(.gift-blind)";

LAPLACE_CAPABILITY.parts.giftTrend.eventFilter = ":has(.gift-blind)";

LAPLACE_CAPABILITY.parts.fanMedal.scaleByProperty = { ...LAPLACE_CAPABILITY.parts.fanMedal.scaleByProperty, paddingX: "base-font", paddingY: "base-font", borderWidth: "base-font", borderRadius: "base-font" };
