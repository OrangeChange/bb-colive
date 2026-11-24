import { uiText } from "../../i18n/index.ts";
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
    avatarFrame: {label:uiText("theme.parts.avatarFrame.label"),selector:"#author-photo",properties:[],placements:["main","sticky","detail"]},
    modBadge: {label:uiText("theme.parts.modBadge.label"),selector:"yt-live-chat-author-badge-renderer #image > yt-icon",properties:["visible","width","height","marginX","marginY"],events:["danmaku"],placements:["main"]},
    guardBadge: {label:uiText("theme.parts.guardBadge.label"),selector:"yt-live-chat-author-badge-renderer #image > img",properties:["visible","width","height","marginX","marginY"],placements:["main","detail"]},
    smallEmote: { label: uiText("theme.parts.smallEmote.label2"), selector: "#message img.emoji:not(#emoticon):not(.blc-large-emoji):not(.openlive-large-emote), #image-and-message img.emoji:not(#emoticon):not(.blc-large-emoji):not(.openlive-large-emote)", events: ["danmaku"], placements: ["main"], properties: ["visible", "width", "height", "marginX", "marginY"], codeDefaults: { visible: true, width: 24, height: 24, marginX: 0, marginY: 0 } },
    imageAndMessage: {label:uiText("theme.parts.imageAndMessage.label"),selector:"#image-and-message",properties:box,codeDefaults:boxDefaults,events:["danmaku","like"],placements:["main"]},

    eventArea: { scope: "global", label: uiText("theme.parts.eventArea.label"), selector: "yt-live-chat-renderer", properties: box, placements: ["main"], codeDefaults: boxDefaults },
    eventList: { scope: "global", label: uiText("theme.parts.eventList.label"), selector: "yt-live-chat-item-list-renderer #items.yt-live-chat-item-list-renderer", properties: box, placements: ["main"], codeDefaults: boxDefaults },
    event: {
      label: uiText("theme.parts.event.label"),
      selector:
        "yt-live-chat-text-message-renderer, yt-live-chat-paid-message-renderer, yt-live-chat-membership-item-renderer",
      selectorsByPlacement: { sticky: "yt-live-chat-ticker-paid-message-item-renderer" },
      properties: box,
      placements: ["main", "sticky", "detail"],
      codeDefaults: { ...boxDefaults, paddingX: 4, paddingY: 4 },
    },
    username: {
      label: uiText("theme.parts.username.label"),
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
    contentArea: { label: uiText("theme.parts.contentArea.label"), selector: "#content", properties: box, placements: ["main", "detail"], codeDefaults: boxDefaults },
    card: { label: uiText("theme.parts.card.label"), selector: "#card", events: ["danmaku", "like", "gift", "gift-normal",  "superchat", "guard"], properties: box, placements: ["main", "detail"], codeDefaults: boxDefaults },
    cardHeader: { label: uiText("theme.parts.cardHeader.label"), selector: "#header", events: ["gift", "gift-normal",  "superchat", "guard"], properties: box, placements: ["main", "detail"], codeDefaults: boxDefaults },
    cardHeaderContent: { label: uiText("theme.parts.cardHeaderContent.label"), selector: "#header-content", events: ["gift", "gift-normal",  "superchat", "guard"], properties: box, placements: ["main", "detail"], codeDefaults: boxDefaults },
    cardPrimaryColumn: { label: uiText("theme.parts.cardPrimaryColumn.label"), selector: "#header-content-primary-column", events: ["gift", "gift-normal",  "superchat", "guard"], properties: box, placements: ["main", "detail"], codeDefaults: boxDefaults },
    membershipInfoRow: { label: uiText("theme.parts.membershipInfoRow.label"), selector: "#header-content-inner-column", events: ["guard"], properties: box, placements: ["main", "detail"], codeDefaults: boxDefaults },
    paidContent: { label: uiText("theme.parts.paidContent.label"), selector: "#content", events: ["gift", "gift-normal",  "superchat"], properties: box, placements: ["main", "detail"], codeDefaults: boxDefaults },
    avatarWrap: { label: uiText("theme.parts.avatarWrap.label"), selector: "#author-photo", selectorsByPlacement: { sticky: "#author-photo" }, properties: box, placements: ["main", "sticky", "detail"], codeDefaults: boxDefaults },
    userInfo: { label: uiText("theme.parts.userInfo.label"), selector: "yt-live-chat-author-chip", properties: box, placements: ["main", "detail"], codeDefaults: boxDefaults },
    message: {
      label: uiText("theme.parts.message.label"),
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
      label: uiText("theme.parts.avatar.label"),
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
      label: uiText("theme.parts.largeEmote.label"),
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
      label: uiText("theme.parts.fanMedal.label"),
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
    fanMedalWrap: { label: uiText("theme.parts.fanMedalWrap.label"), selector: "#chat-medal", events: ["danmaku", "like"], placements: ["main"], properties: box, codeDefaults: boxDefaults },
    fanMedalName: { label: uiText("theme.parts.fanMedalName.label"), selector: "#medal-name", events: ["danmaku", "like"], placements: ["main"], properties: text, units: pxLineHeight, codeDefaults: textDefaults },
    fanMedalLevel: { label: uiText("theme.parts.fanMedalLevel.label"), selector: "#medal-level", events: ["danmaku", "like"], placements: ["main"], properties: text, units: pxLineHeight, codeDefaults: textDefaults },
    identity: {
      label: uiText("theme.parts.identity.label"),
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
      label: uiText("theme.parts.amount.label"),
      selector: "#purchase-amount",
      selectorsByPlacement: { sticky: "#text" },
      events: ["gift", "gift-normal",  "superchat"],
      placements: ["main", "sticky", "detail"],
      properties: text,
      units: pxLineHeight,
      codeDefaults: { ...textDefaults, color: "#ffffff" },
    },
    membershipSubtext: {
      label: uiText("theme.parts.membershipSubtext.label"),
      selector: "#header-subtext",
      events: ["guard"],
      placements: ["main", "detail"],
      properties: text,
      units: pxLineHeight,
      codeDefaults: { ...textDefaults, color: "#ffffff" },
    },
    timestamp: {
      label: uiText("theme.parts.timestamp.label"),
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
      label: uiText("theme.parts.paidCard.label"),
      selector: "#card",
      events: ["gift", "gift-normal",  "superchat"],
      placements: ["main", "detail"],
      properties: box,
      codeDefaults: { ...boxDefaults, borderRadius: 4 },
    },
    membership: {
      label: uiText("theme.parts.membership.label"),
      selector: "#card",
      events: ["guard"],
      placements: ["main", "detail"],
      properties: box,
      codeDefaults: { ...boxDefaults, background: "#0f9d58", borderRadius: 4 },
    },
    ticker: {
      scope: "global",
      label: uiText("theme.parts.ticker.label"),
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
    tickerItem: { scope: "event", label: uiText("theme.parts.tickerItem.label"), selector: "yt-live-chat-ticker-paid-message-item-renderer", placements: ["sticky"], properties: box, codeDefaults: boxDefaults },
    tickerItemContent: { label: uiText("theme.parts.tickerItemContent.label"), selector: "#content", placements: ["sticky"], properties: box, codeDefaults: boxDefaults },
    tickerList: { scope: "global", label: uiText("theme.parts.tickerList.label"), selector: "yt-live-chat-ticker-renderer #items.yt-live-chat-ticker-renderer", placements: ["sticky"], properties: box, codeDefaults: boxDefaults },
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
    interaction: uiText("theme.OPENLIVE_CAPABILITY.eventLabels.interaction"),

    all: uiText("theme.OPENLIVE_CAPABILITY.eventLabels.all"),
    danmaku: uiText("theme.OPENLIVE_CAPABILITY.eventLabels.danmaku"),
    like: uiText("theme.OPENLIVE_CAPABILITY.eventLabels.like"),
    gift: uiText("theme.OPENLIVE_CAPABILITY.eventLabels.gift"),
    "gift-normal": uiText("theme.OPENLIVE_CAPABILITY.eventLabels.giftnormal"),

    superchat: uiText("theme.OPENLIVE_CAPABILITY.eventLabels.superchat"),
    guard: uiText("theme.OPENLIVE_CAPABILITY.eventLabels.guard"),
  },
  identityLabels: {
    normal: uiText("theme.OPENLIVE_CAPABILITY.identityLabels.normal"),
    captain:uiText("theme.OPENLIVE_CAPABILITY.identityLabels.captain"), admiral:uiText("theme.OPENLIVE_CAPABILITY.identityLabels.admiral"), governor:uiText("theme.OPENLIVE_CAPABILITY.identityLabels.governor"),
    all: uiText("theme.OPENLIVE_CAPABILITY.identityLabels.all"),
    streamer: uiText("theme.OPENLIVE_CAPABILITY.identityLabels.streamer"),
    moderator: uiText("theme.OPENLIVE_CAPABILITY.identityLabels.moderator"),
    guard: uiText("theme.OPENLIVE_CAPABILITY.identityLabels.guard"),
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
