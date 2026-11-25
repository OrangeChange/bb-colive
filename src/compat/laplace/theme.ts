import { localized, uiText } from "../../i18n/index.ts";
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
export const LAPLACE_CAPABILITY: CompatibleThemeCapabilityMap = localized(() => ({
  mode: "laplace",
  parts: {
    guardType: {label:uiText("theme.parts.guardType.label"),selector:".toast-details-type",properties:text,codeDefaults:textDefaults,placements:["main"],events:["guard"],units:{lineHeight:"number"}},
    guardSymbol: {label:uiText("theme.parts.guardSymbol.label"),selector:".toast-details-symbol",properties:text,codeDefaults:textDefaults,placements:["main"],events:["guard"],units:{lineHeight:"number"}},
    guardFigure: {label:uiText("theme.parts.guardFigure.label"),selector:".toast-details-figure",properties:text,codeDefaults:textDefaults,placements:["main"],events:["guard"],units:{lineHeight:"number"}},
    guardUnit: {label:uiText("theme.parts.guardUnit.label"),selector:".toast-details-unit",properties:text,codeDefaults:textDefaults,placements:["main"],events:["guard"],units:{lineHeight:"number"}},
    guardDaysBefore: {label:uiText("theme.parts.guardDaysBefore.label"),selector:".toast-details-total-days-text-before",properties:text,codeDefaults:textDefaults,placements:["main"],events:["guard"],units:{lineHeight:"number"}},
    guardDays: {label:uiText("theme.parts.guardDays.label"),selector:".toast-details-total-days",properties:text,codeDefaults:textDefaults,placements:["main"],events:["guard"],units:{lineHeight:"number"}},
    guardDaysAfter: {label:uiText("theme.parts.guardDaysAfter.label"),selector:".toast-details-total-days-text-after",properties:text,codeDefaults:textDefaults,placements:["main"],events:["guard"],units:{lineHeight:"number"}},
    winnerTitle: {label:uiText("theme.parts.winnerTitle.label"),selector:".details-name",properties:text,codeDefaults:textDefaults,placements:["main"],events:["redResult", "lotteryResult"],units:{lineHeight:"number"}},
    winnerToggle: {previewTarget:"live",label:uiText("theme.parts.winnerToggle.label"),selector:".toggle-button",properties:text,codeDefaults:textDefaults,placements:["main"],events:["redResult", "lotteryResult"],units:{lineHeight:"number"}},
    redTitle: {label:uiText("theme.parts.redTitle.label"),selector:".red-envelope-start-details-name",properties:text,codeDefaults:textDefaults,placements:["main"],events:["redStart"],units:{lineHeight:"number"}},
    rewardCount: {label:uiText("theme.parts.rewardCount.label"),selector:".rewards-item-count",properties:text,codeDefaults:textDefaults,placements:["main"],events:["redStart"],units:{lineHeight:"number"}},
    lotteryMessage: {label:uiText("theme.parts.lotteryMessage.label"),selector:".lottery-start-details-message",properties:text,codeDefaults:textDefaults,placements:["main"],events:["lotteryStart"],units:{lineHeight:"number"}},
    lotteryPrize: {label:uiText("theme.parts.lotteryPrize.label"),selector:".lottery-start-details-message b",properties:text,codeDefaults:textDefaults,placements:["main"],events:["lotteryStart"],units:{lineHeight:"number"}},
    lotteryRequirements: {label:uiText("theme.parts.lotteryRequirements.label"),selector:".lottery-start-details-requirements",properties:text,codeDefaults:textDefaults,placements:["main"],events:["lotteryStart"],units:{lineHeight:"number"}},
    lotteryGiftName: {label:uiText("theme.parts.lotteryGiftName.label"),selector:".lottery-start-details-requirements b",properties:text,codeDefaults:textDefaults,placements:["main"],events:["lotteryStart"],units:{lineHeight:"number"}},
    lotteryGiftPrice: {label:uiText("theme.parts.lotteryGiftPrice.label"),selector:".lottery-start-details-requirements .price",properties:text,codeDefaults:textDefaults,placements:["main"],events:["lotteryStart"],units:{lineHeight:"number"}},
    muteOperator: {label:uiText("theme.parts.muteOperator.label"),selector:".block-operator",properties:text,codeDefaults:textDefaults,placements:["main"],events:["system"],units:{lineHeight:"number"}},
    muteDuration: {label:uiText("theme.parts.muteDuration.label"),selector:".block-duration",properties:text,codeDefaults:textDefaults,placements:["main"],events:["system"],units:{lineHeight:"number"}},
    wealthText: {label:uiText("theme.parts.wealthText.label"),selector:".wealth-medal-text",properties:text,codeDefaults:textDefaults,placements:["main"],units:{lineHeight:"number"}},
    header: {label:uiText("theme.parts.header.label"),selector:".top",properties:box,codeDefaults:boxDefaults,placements:["main"]},
    meta: {label:uiText("theme.parts.meta.label"),selector:".meta",properties:box,codeDefaults:boxDefaults,placements:["main"]},
    usernameWrap: {label:uiText("theme.parts.usernameWrap.label"),selector:".username-wrap",properties:box,codeDefaults:boxDefaults,placements:["main"]},
    timestampWrap: {previewTarget:"live",label:uiText("theme.parts.timestampWrap.label"),selector:".timestamp-wrap",properties:box,codeDefaults:boxDefaults,placements:["main"],events:["superchat"]},
    body: {label:uiText("theme.parts.body.label"),selector:".message",events:["superchat"],properties:box,codeDefaults:boxDefaults,placements:["main"]},
    winnerContent: {label:uiText("theme.parts.winnerContent.label"),selector:".event--red-envelope-result > .content, .event--lottery-result > .content",selectorsByPlacement:{main:"> .content"},properties:box,codeDefaults:boxDefaults,placements:["main"],events:["redResult", "lotteryResult"]},
    winnerMask: {label:uiText("theme.parts.winnerMask.label"),selector:".rewards-items-mask",properties:box,codeDefaults:boxDefaults,placements:["main"],events:["redResult", "lotteryResult"]},
    winnerList: {label:uiText("theme.parts.winnerList.label"),selector:".rewards-items-wrap",properties:box,codeDefaults:boxDefaults,placements:["main"],events:["redResult", "lotteryResult"]},
    winnerItem: {label:uiText("theme.parts.winnerItem.label"),selector:".list-item-wrap",properties:box,codeDefaults:boxDefaults,placements:["main"],events:["redResult", "lotteryResult"]},
    rewardList: {label:uiText("theme.parts.rewardList.label"),selector:".red-envelope-start-rewards",properties:box,codeDefaults:boxDefaults,placements:["main"],events:["redStart"]},
    rewardItem: {label:uiText("theme.parts.rewardItem.label"),selector:".rewards-item-wrap",properties:box,codeDefaults:boxDefaults,placements:["main"],events:["redStart"]},
    rewardPicture: {label:uiText("theme.parts.rewardPicture.label"),selector:".rewards-item-picture-wrap",properties:box,codeDefaults:boxDefaults,placements:["main"],events:["redStart"]},
    deleted: {previewTarget:"live",label:uiText("theme.parts.deleted.label"),selector:".deleted-badge",properties:["visible","width","height","paddingX","paddingY","marginX","marginY","borderWidth","borderColor","borderRadius"],codeDefaults:{visible:true},placements:["main"],events:["superchat"]},
    winnerAvatar: {label:uiText("theme.parts.winnerAvatar.label"),selector:".list-item-wrap img.avatar",properties:["visible","width","height","marginX","marginY","borderRadius"],codeDefaults:{visible:true},placements:["main"],events:["redResult", "lotteryResult"]},
    rewardImage: {label:uiText("theme.parts.rewardImage.label"),selector:".rewards-item-picture-wrap img",properties:["visible","width","height","marginX","marginY","borderRadius"],codeDefaults:{visible:true},placements:["main"],events:["redStart"]},
    streamerBadgeIcon: {label:uiText("theme.parts.streamerBadgeIcon.label"),selector:".streamer-badge-wrap svg",properties:["visible","width","height","marginX","marginY","borderRadius"],codeDefaults:{visible:true},placements:["main"]},
    modBadgeIcon: {label:uiText("theme.parts.modBadgeIcon.label"),selector:".mod-badge-wrap svg",properties:["visible","width","height","marginX","marginY","borderRadius"],codeDefaults:{visible:true},placements:["main"]},
    wealthImage: {label:uiText("theme.parts.wealthImage.label"),selector:".wealth-medal img",properties:["visible","width","height","marginX","marginY","borderRadius"],codeDefaults:{visible:true},placements:["main"]},

    allEvents: { label: uiText("theme.parts.allEvents.label"), scope: "event", selector: ".event-list .event, .gift-sticky-bar .event", properties: box, codeDefaults: boxDefaults, placements: ["main"] },
    ticker: { label: uiText("theme.parts.ticker.label"), scope: "global", selector: ".gift-sticky-bar", properties: box, codeDefaults: boxDefaults, placements: ["sticky"] },
    eventArea: { scope: "global", label: uiText("theme.parts.eventArea.label"), selector: ".events-list-wrap", properties: box, codeDefaults: boxDefaults, placements: ["main"] },
    eventList: { scope: "global", label: uiText("theme.parts.eventList.label"), selector: ".event-list", properties: box, codeDefaults: boxDefaults, placements: ["main"] },
    event: {
      label: uiText("theme.parts.event.label"),
      selector: ".event",
      properties: box,
      codeDefaults: boxDefaults,
      codeDefaultsByEvent: { danmaku: { paddingX: 10, paddingY: 2.5 } },
      scaleByProperty: { paddingX: "base-font", paddingY: "base-font" },
      placements: ["main", "sticky"],
    },
    username: {
      label: uiText("theme.parts.username.label"),
      selector: ".username",
      properties: text,
      units: { lineHeight: "number" },
      codeDefaults: textDefaults,
      scaleByProperty: { fontSize: "base-font" },
      placements: ["main"],
    },
    contentArea: { label: uiText("theme.parts.contentArea.label"), selector: ".event > .content", selectorsByPlacement: { main: "> .content", sticky: "> .content" }, properties: box, codeDefaults: boxDefaults, placements: ["main", "sticky"] },
    avatarWrap: { label: uiText("theme.parts.avatarWrap.label"), selector: ".avatar-wrap:not(.reply .avatar-wrap):not(.gift-receiver .avatar-wrap):not(.list-item-wrap .avatar-wrap)", properties: box, codeDefaults: boxDefaults, placements: ["main", "sticky"] },
    avatarFrame: { label: uiText("theme.parts.avatarFrame.label"), selector: ".avatar-frame:not(.reply *):not(.gift-receiver *):not(.list-item-wrap *)", properties: ["visible", "width", "height", "marginX", "marginY"], codeDefaults: { visible: true, width: 40, height: 40, marginX: 0, marginY: 0 }, placements: ["main", "sticky"] },
    avatarImageWrap: { label: uiText("theme.parts.avatarImageWrap.label"), selector: ".avatar-img-wrap:not(.reply *):not(.gift-receiver *):not(.list-item-wrap *)", properties: box, codeDefaults: boxDefaults, placements: ["main", "sticky"] },
    action: { label: uiText("theme.parts.action.label"), selector: ".toast-details-action, .red-envelope-start-details-action", properties: text, units: { lineHeight: "number" }, codeDefaults: textDefaults, placements: ["main"] },
    eventIcon: { events: ["redStart", "lotteryStart"], label: uiText("theme.parts.eventIcon.label"), selector: ".gift-icon-wrap:not(.gift-image-wrap), .toast-icon-wrap, .red-envelope-start-icon-wrap, .lottery-start-icon-wrap", properties: ["visible", "width", "height", "marginX", "marginY"], codeDefaults: { visible: true, width: 48, height: 48, marginX: 0, marginY: 0 }, placements: ["main", "sticky"] },
    message: {
      label: uiText("theme.parts.message.label"),
      selector: ".message-text, .message:not(:has(.message-text))",
      properties: text,
      units: { lineHeight: "number" },
      codeDefaults: textDefaults,
      scaleByProperty: { fontSize: "base-font" },
      placements: ["main"],
    },
    translation: {
      label: uiText("theme.parts.translation.label"),
      selector: ".message-translation",
      properties: text,
      units: { lineHeight: "number" },
      codeDefaults: textDefaults,
      events: ["superchat"],
      placements: ["main"],
    },
    reply: { label: uiText("theme.parts.reply.label"), selector: ".reply", events: ["danmaku"], properties: box, codeDefaults: boxDefaults, placements: ["main"] },
    replyAvatar: { label: uiText("theme.parts.replyAvatar.label"), selector: ".reply .avatar-wrap", events: ["danmaku"], properties: ["visible", "width", "height", "marginX", "marginY", "borderRadius"], codeDefaults: { visible: true, width: 30, height: 30, marginX: 0, marginY: 0, borderRadius: 30 }, placements: ["main"] },
    replyUsername: { label: uiText("theme.parts.replyUsername.label"), selector: ".reply-username", events: ["danmaku"], properties: text, units: { lineHeight: "number" }, codeDefaults: textDefaults, placements: ["main"] },
    spoiler: { label: uiText("theme.parts.spoiler.label"), selector: ".spoiler", events: ["danmaku", "superchat"], properties: text, units: { lineHeight: "number" }, codeDefaults: textDefaults, placements: ["main"] },
    giftImageWrap: { label: uiText("theme.parts.giftImageWrap.label"), selector: ".gift-image-wrap", events: ["gift"], properties: box, codeDefaults: boxDefaults, placements: ["main", "sticky"] },
    giftImage: { label: uiText("theme.parts.giftImage.label"), selector: ".gift-image-wrap img", events: ["gift"], properties: ["visible", "width", "height", "marginX", "marginY"], codeDefaults: { visible: true, width: 64, height: 64, marginX: 0, marginY: 0 }, placements: ["main", "sticky"] },
    giftName: { label: uiText("theme.parts.giftName.label"), selector: ".gift-details-name", events: ["gift"], properties: text, units: { lineHeight: "number" }, codeDefaults: textDefaults, placements: ["main"] },
    giftDetails: { label: uiText("theme.parts.giftDetails.label"), selector: ".gift-details", events: ["gift"], properties: text, units: { lineHeight: "number" }, codeDefaults: textDefaults, placements: ["main"] },
    giftSymbol: { label: uiText("theme.parts.giftSymbol.label"), selector: ".gift-details-symbol", events: ["gift"], properties: text, units: { lineHeight: "number" }, codeDefaults: textDefaults, placements: ["main"] },
    giftCount: { label: uiText("theme.parts.giftCount.label"), selector: ".gift-details-figure", events: ["gift"], properties: text, units: { lineHeight: "number" }, codeDefaults: textDefaults, placements: ["main"] },
    giftDetailPrice: { label: uiText("theme.parts.giftDetailPrice.label"), selector: ".gift-details-price", events: ["gift"], properties: text, units: { lineHeight: "number" }, codeDefaults: textDefaults, placements: ["main"] },
    giftBlind: { label: uiText("theme.parts.giftBlind.label"), selector: ".gift-blind", events: ["gift"], properties: text, units: { lineHeight: "number" }, codeDefaults: textDefaults, placements: ["main"] },
    giftBlindName: { label: uiText("theme.parts.giftBlindName.label"), selector: ".gift-blind-name", events: ["gift"], properties: text, units: { lineHeight: "number" }, codeDefaults: textDefaults, placements: ["main"] },
    giftBlindAction: { label: uiText("theme.parts.giftBlindAction.label"), selector: ".gift-blind-action", events: ["gift"], properties: text, units: { lineHeight: "number" }, codeDefaults: textDefaults, placements: ["main"] },
    giftPaidPrice: { label: uiText("theme.parts.giftPaidPrice.label"), selector: ".price-actual", events: ["gift"], properties: text, units: { lineHeight: "number" }, codeDefaults: textDefaults, placements: ["main"] },
    giftResultPrice: { label: uiText("theme.parts.giftResultPrice.label"), selector: ".price > .price-currency, .price > .price-figure", events: ["gift"], properties: text, units: { lineHeight: "number" }, codeDefaults: textDefaults, placements: ["main"] },
    giftTrend: { label: uiText("theme.parts.giftTrend.label"), selector: ".price-blind-result svg", events: ["gift"], properties: ["visible", "width", "height", "marginX", "marginY"], codeDefaults: { visible: true, width: 20, height: 20, marginX: 0, marginY: 0 }, placements: ["main"] },
    giftReceiver: { label: uiText("theme.parts.giftReceiver.label"), selector: ".gift-receiver", events: ["gift"], properties: box, codeDefaults: boxDefaults, placements: ["main"] },
    giftReceiverAction: { label: uiText("theme.parts.giftReceiverAction.label"), selector: ".gift-receiver-action", events: ["gift"], properties: text, units: { lineHeight: "number" }, codeDefaults: textDefaults, placements: ["main"] },
    giftReceiverAvatar: { label: uiText("theme.parts.giftReceiverAvatar.label"), selector: ".gift-receiver .avatar-wrap", events: ["gift"], properties: ["visible", "width", "height", "marginX", "marginY", "borderRadius"], codeDefaults: { visible: true, width: 30, height: 30, marginX: 0, marginY: 0, borderRadius: 30 }, placements: ["main"] },
    giftReceiverUsername: { label: uiText("theme.parts.giftReceiverUsername.label"), selector: ".gift-receiver-username", events: ["gift"], properties: text, units: { lineHeight: "number" }, codeDefaults: textDefaults, placements: ["main"] },
    priceCurrency: { label: uiText("theme.parts.priceCurrency.label"), selector: ".price-currency", properties: text, units: { lineHeight: "number" }, codeDefaults: textDefaults, placements: ["main", "sticky"] },
    priceFigure: { label: uiText("theme.parts.priceFigure.label"), selector: ".price-figure", properties: text, units: { lineHeight: "number" }, codeDefaults: textDefaults, placements: ["main", "sticky"] },
    smallEmoteWrap: { label: uiText("theme.parts.smallEmoteWrap.label"), selector: ".bmote-wrap, .emote-wrap:not(.emote-wrap--large)", events: ["danmaku"], properties: box, codeDefaults: boxDefaults, placements: ["main"] },
    largeEmoteWrap: { label: uiText("theme.parts.largeEmoteWrap.label"), selector: ".emote-wrap--large", events: ["danmaku"], properties: box, codeDefaults: boxDefaults, placements: ["main"] },
    guardContent: { label: uiText("theme.parts.guardContent.label"), selector: ".event--toast > .content", selectorsByPlacement:{main:"> .content",sticky:"> .content"}, events: ["guard"], properties: box, codeDefaults: boxDefaults, placements: ["main", "sticky"] },
    avatar: {
      label: uiText("theme.parts.avatar.label"),
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
      label: uiText("theme.parts.fanMedal.label"),
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
    fanMedalContent: { label: uiText("theme.parts.fanMedalContent.label"), selector: ".fans-medal-content", properties: text, units: { lineHeight: "number" }, codeDefaults: textDefaults, placements: ["main"] },
    fanMedalGuard: { label: uiText("theme.parts.fanMedalGuard.label"), selector: ".guard-badge-in-fans-medal", properties: ["visible", "width", "height", "marginX", "marginY"], codeDefaults: { visible: true, width: 18, height: 18, marginX: 0, marginY: 0 }, placements: ["main"] },
    fanMedalLevel: { label: uiText("theme.parts.fanMedalLevel.label"), selector: ".fans-medal-level", properties: text, units: { lineHeight: "number" }, codeDefaults: textDefaults, placements: ["main"] },
    guardBadge: { label: uiText("theme.parts.guardBadge.label"), selector: ".guard-badge-in-meta", properties: ["visible", "width", "height", "marginX", "marginY"], codeDefaults: { visible: true, width: 18, height: 18, marginX: 0, marginY: 0 }, placements: ["main"] },
    streamerBadge: { label: uiText("theme.parts.streamerBadge.label"), selector: ".streamer-badge-wrap", properties: box, codeDefaults: boxDefaults, placements: ["main"] },
    modBadge: { label: uiText("theme.parts.modBadge.label"), selector: ".mod-badge-wrap", properties: box, codeDefaults: boxDefaults, placements: ["main"] },
    wealthMedal: { label: uiText("theme.parts.wealthMedal.label"), selector: ".wealth-medal", properties: box, codeDefaults: boxDefaults, placements: ["main"] },
    currentRank: { label: uiText("theme.parts.currentRank.label"), selector: ".current-rank", properties: text, units: { lineHeight: "number" }, codeDefaults: textDefaults, placements: ["main"] },
    badge: {
      label: uiText("theme.parts.badge.label"),
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
      label: uiText("theme.parts.smallEmote.label"),
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
      label: uiText("theme.parts.largeEmote.label"),
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
      label: uiText("theme.parts.amount.label"),
      selector: ".price",
      properties: text,
      units: { lineHeight: "number" },
      codeDefaults: { ...textDefaults, fontSize: 12 },
      scaleByProperty: { fontSize: "base-font" },
      events: ["gift", "superchat", "guard", "redStart"],
      placements: ["main", "sticky"],
    },
    activity: {
      label: uiText("theme.parts.activity.label"),
      selector:
        ".red-envelope-start-details, .red-envelope-start-details-action, .lottery-start-details-message, .lottery-start-details-requirements, .details-name, .rewards-items-wrap",
      properties: box,
      codeDefaults: boxDefaults,
      events: ["redStart", "redResult", "lotteryStart", "lotteryResult"],
      placements: ["main", "sticky"],
    },
    timestamp: {
      label: uiText("theme.parts.timestamp.label"),
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
    entry: uiText("theme.LAPLACE_CAPABILITY.eventLabels.entry"), follow: uiText("theme.LAPLACE_CAPABILITY.eventLabels.follow"), share: uiText("theme.LAPLACE_CAPABILITY.eventLabels.share"), "special-follow": uiText("theme.LAPLACE_CAPABILITY.eventLabels.specialfollow"), "mutual-follow": uiText("theme.LAPLACE_CAPABILITY.eventLabels.mutualfollow"),
    "live-status": uiText("theme.LAPLACE_CAPABILITY.eventLabels.livestatus"), "user-block": uiText("theme.LAPLACE_CAPABILITY.eventLabels.userblock"), "room-mute": uiText("theme.LAPLACE_CAPABILITY.eventLabels.roommute"), "room-change": uiText("theme.LAPLACE_CAPABILITY.eventLabels.roomchange"), warning: uiText("theme.LAPLACE_CAPABILITY.eventLabels.warning"),
    interaction: uiText("theme.LAPLACE_CAPABILITY.eventLabels.interaction"),
    "gift-regular": uiText("theme.LAPLACE_CAPABILITY.eventLabels.giftregular"), redpocket: uiText("theme.LAPLACE_CAPABILITY.eventLabels.redpocket"), lottery: uiText("theme.LAPLACE_CAPABILITY.eventLabels.lottery"),

    all: uiText("theme.LAPLACE_CAPABILITY.eventLabels.all"),
    danmaku: uiText("theme.LAPLACE_CAPABILITY.eventLabels.danmaku"),
    like: uiText("theme.LAPLACE_CAPABILITY.eventLabels.like"),
    gift: uiText("theme.LAPLACE_CAPABILITY.eventLabels.gift"),
    superchat: uiText("theme.LAPLACE_CAPABILITY.eventLabels.superchat"),
    guard: uiText("theme.LAPLACE_CAPABILITY.eventLabels.guard"),
    redStart: uiText("theme.LAPLACE_CAPABILITY.eventLabels.redStart"),
    winners: uiText("theme.LAPLACE_CAPABILITY.eventLabels.winners"),
    redResult: uiText("theme.LAPLACE_CAPABILITY.eventLabels.redResult"),
    lotteryStart: uiText("theme.LAPLACE_CAPABILITY.eventLabels.lotteryStart"),
    lotteryResult: uiText("theme.LAPLACE_CAPABILITY.eventLabels.lotteryResult"),
    system: uiText("theme.LAPLACE_CAPABILITY.eventLabels.system"),
  },
  identityLabels: {
    normal: uiText("theme.LAPLACE_CAPABILITY.identityLabels.normal"),
    captain:uiText("theme.LAPLACE_CAPABILITY.identityLabels.captain"), admiral:uiText("theme.LAPLACE_CAPABILITY.identityLabels.admiral"), governor:uiText("theme.LAPLACE_CAPABILITY.identityLabels.governor"),
    all: uiText("theme.LAPLACE_CAPABILITY.identityLabels.all"),
    guard: uiText("theme.LAPLACE_CAPABILITY.identityLabels.guard"),
    streamer: uiText("theme.LAPLACE_CAPABILITY.identityLabels.streamer"),
    moderator: uiText("theme.LAPLACE_CAPABILITY.identityLabels.moderator"),
  },
  identityPriority: ["governor", "admiral", "captain", "guard", "streamer", "moderator"],
  schemeSelectors: {
    light: "[data-theme='light']",
    dark: "[data-theme='dark']",
  },
}));

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
