import { installCompatiblePropertyCapabilities } from "../../themes/compatThemeCapabilities.ts";
import { installCompatibleEventGroups } from "../../themes/compatThemeCapabilities.ts";
import type { CompatibleThemeCapabilityMap } from "../../themes/compatThemeCapabilities.ts";
import type { BlivechatOpenThemeSettings } from "../../themes/compatThemeSettings.ts";
import { renderCompatibleManagedCss } from "../../themes/compatManagedCss.ts";

export interface OpenLiveRuntimeSettings extends BlivechatOpenThemeSettings {
  showTimestamp: boolean;
  maskUsername: boolean;
}

export const DEFAULT_OPENLIVE_THEME_SETTINGS: OpenLiveRuntimeSettings = {
  skin: "none",
  emoticonSize: 80,
  showGiftInfo: true,
  showTimestamp: false,
  maskUsername: false,
  showAvatar: true,
  showUsername: true,
  showGuardBadge: true,
  showModBadge: true,
  showMedal: true,
  showMedalLightenedOnly: true,
  showMedalCurrentRoomOnly: false,
};

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
  fontFamily: '"Imprima", "Microsoft YaHei", sans-serif',
  fontSize: 18,
  lineHeight: 18,
  marginX: 0,
  marginY: 0,
};
const boxDefaults = {
  visible: true,
  background: "transparent",
  paddingX: 0,
  paddingY: 0,
  marginX: 0,
  marginY: 0,
  gap: 0,
  borderWidth: 0,
  borderColor: "transparent",
  borderRadius: 0,
};
const pxLineHeight = { lineHeight: "px" } as const;

export const OPENLIVE_CAPABILITY: CompatibleThemeCapabilityMap = {
  mode: "blivechat-open",
  parts: {
    avatarFrame: {label:"头像框",selector:"#author-photo",properties:[],placements:["main","sticky","detail"]},
    modBadge: {label:"房管徽章",selector:"yt-live-chat-author-badge-renderer #image > yt-icon",properties:["visible","width","height","marginX","marginY"],events:["danmaku"],placements:["main"]},
    guardBadge: {label:"大航海徽章",selector:"yt-live-chat-author-badge-renderer #image > img",properties:["visible","width","height","marginX","marginY"],placements:["main","detail"]},
    smallEmote: { label: "行内表情", selector: "#message img.emoji:not(#emoticon):not(.blc-large-emoji):not(.openlive-large-emote), #image-and-message img.emoji:not(#emoticon):not(.blc-large-emoji):not(.openlive-large-emote)", events: ["danmaku"], placements: ["main"], properties: ["visible", "width", "height", "marginX", "marginY"], codeDefaults: { visible: true, width: 24, height: 24, marginX: 0, marginY: 0 } },
    imageAndMessage: {label:"图文区域",selector:"#image-and-message",properties:box,codeDefaults:boxDefaults,events:["danmaku","like"],placements:["main"]},

    eventArea: { scope: "global", label: "事件区", selector: "yt-live-chat-renderer", properties: box, placements: ["main"], codeDefaults: boxDefaults },
    eventList: { scope: "global", label: "事件列表", selector: "yt-live-chat-item-list-renderer #items.yt-live-chat-item-list-renderer", properties: box, placements: ["main"], codeDefaults: boxDefaults },
    event: {
      label: "事件容器",
      selector:
        "yt-live-chat-text-message-renderer, yt-live-chat-paid-message-renderer, yt-live-chat-membership-item-renderer",
      selectorsByPlacement: { sticky: "yt-live-chat-ticker-paid-message-item-renderer" },
      properties: box,
      placements: ["main", "sticky", "detail"],
      codeDefaults: { ...boxDefaults, paddingX: 4, paddingY: 4 },
    },
    username: {
      label: "用户名",
      selector: "#author-name",
      events: [
        "danmaku",
        "like",
        "gift",
        "gift-normal",

        "superchat",
        "guard",
      ],
      placements: ["main", "detail"],
      properties: text,
      units: pxLineHeight,
      codeDefaults: {
        ...textDefaults,
        color: "#cccccc",
        fontSize: 20,
        lineHeight: 20,
      },
    },
    contentArea: { label: "内容区域", selector: "#content", properties: box, placements: ["main", "detail"], codeDefaults: boxDefaults },
    card: { label: "卡片", selector: "#card", events: ["danmaku", "like", "gift", "gift-normal",  "superchat", "guard"], properties: box, placements: ["main", "detail"], codeDefaults: boxDefaults },
    cardHeader: { label: "头部", selector: "#header", events: ["gift", "gift-normal",  "superchat", "guard"], properties: box, placements: ["main", "detail"], codeDefaults: boxDefaults },
    cardHeaderContent: { label: "头部信息区", selector: "#header-content", events: ["gift", "gift-normal",  "superchat", "guard"], properties: box, placements: ["main", "detail"], codeDefaults: boxDefaults },
    cardPrimaryColumn: { label: "主信息列", selector: "#header-content-primary-column", events: ["gift", "gift-normal",  "superchat", "guard"], properties: box, placements: ["main", "detail"], codeDefaults: boxDefaults },
    membershipInfoRow: { label: "用户信息行", selector: "#header-content-inner-column", events: ["guard"], properties: box, placements: ["main", "detail"], codeDefaults: boxDefaults },
    paidContent: { label: "正文区域", selector: "#content", events: ["gift", "gift-normal",  "superchat"], properties: box, placements: ["main", "detail"], codeDefaults: boxDefaults },
    avatarWrap: { label: "头像区域", selector: "#author-photo", selectorsByPlacement: { sticky: "#author-photo" }, properties: box, placements: ["main", "sticky", "detail"], codeDefaults: boxDefaults },
    userInfo: { label: "用户信息块", selector: "yt-live-chat-author-chip", properties: box, placements: ["main", "detail"], codeDefaults: boxDefaults },
    message: {
      label: "正文",
      selector: "#message",
      events: [
        "danmaku",
        "like",
        "gift",
        "gift-normal",

        "superchat",
      ],
      placements: ["main", "detail"],
      properties: text,
      units: pxLineHeight,
      codeDefaults: { ...textDefaults, color: "#ffffff" },
    },
    avatar: {
      label: "头像",
      selector: "#author-photo img#img",
      selectorsByPlacement: { sticky: "#author-photo img#img" },
      events: [
        "danmaku",
        "like",
        "gift",
        "gift-normal",

        "superchat",
        "guard",
      ],
      placements: ["main", "sticky", "detail"],
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
        width: 24,
        height: 24,
        marginX: 6,
        marginY: 0,
        borderRadius: 24,
      },
      codeDefaultsByContext: {
        "gift|main": { width: 40, height: 40 },
        "gift-normal|main": { width: 40, height: 40 },

        "superchat|main": { width: 40, height: 40 },
        "guard|main": { width: 40, height: 40 },
        "gift|detail": { width: 40, height: 40 },
        "gift-normal|detail": { width: 40, height: 40 },

        "superchat|detail": { width: 40, height: 40 },
        "guard|detail": { width: 40, height: 40 },
      },
    },
    largeEmote: {
      label: "大表情",
      selector: "#image-and-message > img#emoticon, #message img.emoji.blc-large-emoji, #image-and-message img.emoji.blc-large-emoji, #message img.openlive-large-emote",
      events: ["danmaku"],
      placements: ["main"],
      properties: ["visible", "width", "height", "marginX", "marginY"],
      codeDefaults: {
        visible: true,
        width: 80,
        height: 80,
        marginX: 2,
        marginY: 0,
      },
      settingByProperty: { width: "emoticonSize", height: "emoticonSize" },
    },
    fanMedal: {
      label: "粉丝牌",
      selector: "yt-live-chat-author-medal-renderer",
      events: ["danmaku", "like"],
      placements: ["main"],
      properties: [
        "visible",
        "color",
        "background",
        "fontSize",
        "borderWidth",
        "borderColor",
        "borderRadius",
        "paddingX",
        "paddingY",
        "marginX",
        "marginY",
      ],
      codeDefaults: {
        visible: true,
        color: "#ffffff",
        background: "#5c968e",
        fontSize: 18,
        borderWidth: 1,
        borderColor: "#5c968e",
        borderRadius: 2,
        paddingX: 2,
        paddingY: 0,
        marginX: 2,
        marginY: 0,
      },
    },
    fanMedalWrap: { label: "粉丝牌区域", selector: "#chat-medal", events: ["danmaku", "like"], placements: ["main"], properties: box, codeDefaults: boxDefaults },
    fanMedalName: { label: "名称", selector: "#medal-name", events: ["danmaku", "like"], placements: ["main"], properties: text, units: pxLineHeight, codeDefaults: textDefaults },
    fanMedalLevel: { label: "等级", selector: "#medal-level", events: ["danmaku", "like"], placements: ["main"], properties: text, units: pxLineHeight, codeDefaults: textDefaults },
    identity: {
      label: "身份",
      selector: "yt-live-chat-author-badge-renderer",
      events: ["danmaku", "like", "guard"],
      placements: ["main"],
      properties: ["visible", "width", "height", "marginX", "marginY"],
      codeDefaults: {
        visible: true,
        width: 16,
        height: 16,
        marginX: 2,
        marginY: 0,
      },
    },
    amount: {
      label: "金额",
      selector: "#purchase-amount",
      selectorsByPlacement: { sticky: "#text" },
      events: ["gift", "gift-normal",  "superchat"],
      placements: ["main", "sticky", "detail"],
      properties: text,
      units: pxLineHeight,
      codeDefaults: { ...textDefaults, color: "#ffffff" },
    },
    membershipSubtext: {
      label: "大航海说明",
      selector: "#header-subtext",
      events: ["guard"],
      placements: ["main", "detail"],
      properties: text,
      units: pxLineHeight,
      codeDefaults: { ...textDefaults, color: "#ffffff" },
    },
    timestamp: {
      label: "时间",
      selector: "#timestamp",
      events: [
        "danmaku",
        "like",
        "gift",
        "gift-normal",

        "superchat",
        "guard",
      ],
      placements: ["main", "detail"],
      properties: text,
      units: pxLineHeight,
      codeDefaults: {
        ...textDefaults,
        visible: false,
        color: "#999999",
        fontSize: 11,
        lineHeight: 11,
      },
    },
    paidCard: {
      label: "付费卡片",
      selector: "#card",
      events: ["gift", "gift-normal",  "superchat"],
      placements: ["main", "detail"],
      properties: box,
      codeDefaults: { ...boxDefaults, borderRadius: 4 },
    },
    membership: {
      label: "大航海卡片",
      selector: "#card",
      events: ["guard"],
      placements: ["main", "detail"],
      properties: box,
      codeDefaults: { ...boxDefaults, background: "#0f9d58", borderRadius: 4 },
    },
    ticker: {
      scope: "global",
      label: "置顶栏",
      selector: "yt-live-chat-ticker-renderer",
      events: ["gift", "gift-normal",  "superchat", "guard"],
      placements: ["sticky"],
      properties: box,
      codeDefaults: {
        ...boxDefaults,
        borderRadius: 4,
        paddingX: 4,
        paddingY: 2,
      },
    },
    tickerItem: { scope: "event", label: "单项背景", selector: "yt-live-chat-ticker-paid-message-item-renderer", placements: ["sticky"], properties: box, codeDefaults: boxDefaults },
    tickerItemContent: { label: "单项内容", selector: "#content", placements: ["sticky"], properties: box, codeDefaults: boxDefaults },
    tickerList: { scope: "global", label: "横向项目列表", selector: "yt-live-chat-ticker-renderer #items.yt-live-chat-ticker-renderer", placements: ["sticky"], properties: box, codeDefaults: boxDefaults },
  },
  eventSelectorsByPlacement: {
    main: {
      danmaku:
        "yt-live-chat-text-message-renderer[data-openlive-kind='danmaku'][data-openlive-placement='main']",
      like: "yt-live-chat-text-message-renderer[data-openlive-kind='like'][data-openlive-placement='main']",
      gift: "yt-live-chat-paid-message-renderer[data-openlive-kind='gift'][data-openlive-placement='main']",
      "gift-normal":
        "yt-live-chat-paid-message-renderer[data-openlive-kind='gift'][data-openlive-gift-kind='normal'][data-openlive-placement='main']",

      superchat:
        "yt-live-chat-paid-message-renderer[data-openlive-kind='superchat'][data-openlive-placement='main']",
      guard:
        "yt-live-chat-membership-item-renderer[data-openlive-kind='guard'][data-openlive-placement='main']",
    },
    sticky: {
      gift: "yt-live-chat-ticker-paid-message-item-renderer[data-openlive-kind='gift'][data-openlive-placement='sticky']",
      "gift-normal":
        "yt-live-chat-ticker-paid-message-item-renderer[data-openlive-kind='gift'][data-openlive-gift-kind='normal'][data-openlive-placement='sticky']",

      superchat:
        "yt-live-chat-ticker-paid-message-item-renderer[data-openlive-kind='superchat'][data-openlive-placement='sticky']",
      guard:
        "yt-live-chat-ticker-paid-message-item-renderer[data-openlive-kind='guard'][data-openlive-placement='sticky']",
    },
    detail: {
      gift: "yt-live-chat-paid-message-renderer[data-openlive-kind='gift'][data-openlive-placement='detail']",
      "gift-normal":
        "yt-live-chat-paid-message-renderer[data-openlive-kind='gift'][data-openlive-gift-kind='normal'][data-openlive-placement='detail']",

      superchat:
        "yt-live-chat-paid-message-renderer[data-openlive-kind='superchat'][data-openlive-placement='detail']",
      guard:
        "yt-live-chat-membership-item-renderer[data-openlive-kind='guard'][data-openlive-placement='detail']",
    },
  },
  eventGroups: { interaction: ["like"], gift: ["gift", "gift-normal"] },
  identitySelectors: {
    normal: ":not([is-owner='true']):not([is-admin='true']):not([privilegeType='1']):not([privilegeType='2']):not([privilegeType='3'])",
    captain: "[privilegeType='3']", admiral: "[privilegeType='2']", governor: "[privilegeType='1']",
    all: "",
    streamer: "[is-owner='true']",
    moderator: "[is-admin='true']",
    guard: "[privilegeType]:not([privilegeType='0'])",
  },
  eventLabels: {
    interaction: "互动",

    all: "全部事件",
    danmaku: "弹幕",
    like: "点赞",
    gift: "礼物",
    "gift-normal": "普通与免费礼物",

    superchat: "醒目留言",
    guard: "大航海",
  },
  identityLabels: {
    normal: "普通用户",
    captain:"舰长", admiral:"提督", governor:"总督",
    all: "全部身份",
    streamer: "主播",
    moderator: "房管",
    guard: "大航海",
  },
  identityPriority: ["governor", "admiral", "captain", "guard", "streamer", "moderator"],
  schemeSelectors: {
    light: "[data-theme='light']",
    dark: "[data-theme='dark']",
  },
};

export function createOpenLiveBaseCss(
  settings: OpenLiveRuntimeSettings,
): string {
  return renderCompatibleManagedCss(
    OPENLIVE_CAPABILITY,
    settings.visualModel ?? {},
  );
}

installCompatibleEventGroups(OPENLIVE_CAPABILITY);

installCompatiblePropertyCapabilities(OPENLIVE_CAPABILITY);

OPENLIVE_CAPABILITY.parts.fanMedal.properties = [...new Set([...OPENLIVE_CAPABILITY.parts.fanMedal.properties, ...text, ...(["background", "paddingX", "paddingY", "borderWidth", "borderColor", "borderRadius"] as const)])];
OPENLIVE_CAPABILITY.parts.fanMedal.units = { lineHeight: "px" };
