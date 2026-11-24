import { installCompatiblePropertyCapabilities } from "../../themes/compatThemeCapabilities.ts";
import type { CompatibleThemeCapabilityMap } from "../../themes/compatThemeCapabilities.ts";
import type { BlivechatThemeSettings } from "../../themes/compatThemeSettings.ts";

export interface BlivechatRuntimeSettings extends BlivechatThemeSettings {
  globalScale: number;
  fontScale: number;
}

export const DEFAULT_BLIVECHAT_THEME_SETTINGS: BlivechatRuntimeSettings = {
  showGiftName: false,
  globalScale: 1,
  fontScale: 1,
  showTimestamp: false,
  maskUsername: false,
  showAvatar: true,
  showUsername: true,
  showGuardBadge: true,
  showModBadge: true,
};

const textProperties = [
  "visible",
  "color",
  "fontFamily",
  "fontSize",
  "lineHeight",
  "marginX",
  "marginY",
] as const;
const boxProperties = [
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
const textStructureDefaults = { visible: true, marginX: 0, marginY: 0 };
const inheritedTextDefaults = {
  fontFamily: "Roboto, Arial, sans-serif",
  lineHeight: "normal",
};
const pxLineHeight = { lineHeight: "px" as const };
const transparentBoxDefaults = {
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
const textScale = {
  fontSize: "global-font" as const,
  marginX: "global" as const,
  marginY: "global" as const,
};
const boxScale = {
  paddingX: "global" as const,
  paddingY: "global" as const,
  marginX: "global" as const,
  marginY: "global" as const,
  gap: "global" as const,
  borderWidth: "global" as const,
  borderRadius: "global" as const,
};

export const BLIVECHAT_CAPABILITY: CompatibleThemeCapabilityMap = {
  mode: "blivechat",
  parts: {
    avatarFrame: {label:"头像框",selector:"#author-photo",properties:[],placements:["main","sticky","detail"]},
    modBadge: {label:"房管徽章",selector:"yt-live-chat-author-badge-renderer[type='moderator'] #image > yt-icon, yt-live-chat-author-badge-renderer[is-admin='true'] #image > yt-icon",properties:["visible","width","height","marginX","marginY"],events:["danmaku"],placements:["main"]},
    guardBadge: {label:"大航海徽章",selector:"yt-live-chat-author-badge-renderer[type='member'] #image > img",properties:["visible","width","height","marginX","marginY"],placements:["main","detail"]},

    eventArea: { scope: "global", label: "事件区", selector: "yt-live-chat-renderer", properties: boxProperties, placements: ["main"], codeDefaults: transparentBoxDefaults, scaleByProperty: boxScale },
    eventList: { scope: "global", label: "事件列表", selector: "yt-live-chat-item-list-renderer #items.yt-live-chat-item-list-renderer", properties: boxProperties, placements: ["main"], codeDefaults: transparentBoxDefaults, scaleByProperty: boxScale },
    event: {
      label: "事件容器",
      selector:
        "yt-live-chat-text-message-renderer, yt-live-chat-paid-message-renderer, yt-live-chat-membership-item-renderer",
      selectorsByPlacement: { sticky: "yt-live-chat-ticker-paid-message-item-renderer" },
      properties: boxProperties,
      placements: ["main", "sticky", "detail"],
      codeDefaults: { ...transparentBoxDefaults, paddingX: 24, paddingY: 4 },
      codeDefaultsByEvent: {
        gift: { paddingX: 24, paddingY: 4 },
        superchat: { paddingX: 24, paddingY: 4 },
        guard: { paddingX: 24, paddingY: 4 },
      },
      scaleByProperty: boxScale,
    },
    username: {
      label: "用户名",
      selector: "#author-name",
      selectorsByEvent: {
        danmaku: "yt-live-chat-author-chip #author-name",
        gift: "#author-name",
        superchat: "#author-name",
        guard: "yt-live-chat-author-chip #author-name",
      },
      events: [
        "danmaku",
        "gift",
        "gift-normal",

        "superchat",
        "guard",
      ],
      placements: ["main", "detail"],
      properties: textProperties,
      units: pxLineHeight,
      codeDefaults: { ...textStructureDefaults, fontSize: 13 },
      codeDefaultsByEvent: {
        gift: { fontSize: 14 },
        "gift-normal": { fontSize: 14 },

        superchat: { fontSize: 14 },
        guard: { fontSize: 14 },
      },
      inheritedDefaults: {
        ...inheritedTextDefaults,
        color: "rgba(17,17,17,.6)",
      },
      inheritedDefaultsByContext: { "guard|main": { color: "#ffffff" } },
      scaleByProperty: textScale,
    },
    contentArea: { label: "内容区域", selector: "#content", properties: boxProperties, placements: ["main", "detail"], codeDefaults: transparentBoxDefaults, scaleByProperty: boxScale },
    card: { label: "卡片", selector: "#card", events: ["gift", "gift-normal",  "superchat", "guard"], properties: boxProperties, placements: ["main", "detail"], codeDefaults: transparentBoxDefaults, scaleByProperty: boxScale },
    cardHeader: { label: "头部", selector: "#header", events: ["gift", "gift-normal",  "superchat", "guard"], properties: boxProperties, placements: ["main", "detail"], codeDefaults: transparentBoxDefaults, scaleByProperty: boxScale },
    cardHeaderContent: { label: "头部信息区", selector: "#header-content", events: ["gift", "gift-normal",  "superchat", "guard"], properties: boxProperties, placements: ["main", "detail"], codeDefaults: transparentBoxDefaults, scaleByProperty: boxScale },
    cardPrimaryColumn: { label: "主信息列", selector: "#header-content-primary-column", events: ["gift", "gift-normal",  "superchat", "guard"], properties: boxProperties, placements: ["main", "detail"], codeDefaults: transparentBoxDefaults, scaleByProperty: boxScale },
    membershipInfoRow: { label: "用户信息行", selector: "#header-content-inner-column", events: ["guard"], properties: boxProperties, placements: ["main", "detail"], codeDefaults: transparentBoxDefaults, scaleByProperty: boxScale },
    paidContent: { label: "正文区域", selector: "#content", events: ["gift", "gift-normal",  "superchat"], properties: boxProperties, placements: ["main", "detail"], codeDefaults: transparentBoxDefaults, scaleByProperty: boxScale },
    avatarWrap: { label: "头像区域", selector: "#author-photo", selectorsByPlacement: { sticky: "#author-photo" }, properties: boxProperties, placements: ["main", "sticky", "detail"], codeDefaults: transparentBoxDefaults, scaleByProperty: boxScale },
    userInfo: { label: "用户信息块", selector: "yt-live-chat-author-chip", properties: boxProperties, placements: ["main", "detail"], codeDefaults: transparentBoxDefaults, scaleByProperty: boxScale },
    message: {
      label: "正文",
      selector: "#message",
      events: ["danmaku", "gift", "gift-normal",  "superchat"],
      placements: ["main", "detail"],
      properties: textProperties,
      units: pxLineHeight,
      codeDefaults: {
        ...textStructureDefaults,
        color: "rgba(17,17,17,.87)",
        fontSize: 13,
        lineHeight: 16,
      },
      codeDefaultsByEvent: {
        gift: { fontSize: 15, lineHeight: "normal" },
        "gift-normal": { color: "#000000", fontSize: 15, lineHeight: "normal" },

        superchat: { color: "#ffffff", fontSize: 15, lineHeight: "normal" },
      },
      inheritedDefaults: { fontFamily: inheritedTextDefaults.fontFamily },
      scaleByProperty: { ...textScale, lineHeight: "global-font" },
    },
    avatar: {
      label: "头像",
      selector: "#author-photo img#img",
      selectorsByContext: {
        "gift|sticky":
        "#author-photo img#img",
        "superchat|sticky":
        "#author-photo img#img",
        "guard|sticky":
        "#author-photo img#img",
      },
      events: [
        "danmaku",
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
        marginX: 16,
        marginY: 0,
        borderRadius: "50%",
      },
      codeDefaultsByContext: {
        "gift|main": { width: 40, height: 40, marginX: 16 },
        "gift-normal|main": { width: 40, height: 40, marginX: 16 },

        "superchat|main": { width: 40, height: 40, marginX: 16 },
        "guard|main": { width: 40, height: 40, marginX: 16 },
        "gift|sticky": { marginX: -4 },
        "superchat|sticky": { marginX: -4 },
        "guard|sticky": { marginX: -4 },
      },
      scaleByProperty: {
        width: "global",
        height: "global",
        marginX: "global",
        marginY: "global",
      },
    },
    smallEmote: {
      label: "小表情",
      selector: "#message .emoji:not(.blc-large-emoji)",
      events: ["danmaku"],
      placements: ["main"],
      properties: ["visible", "width", "height", "marginX", "marginY"],
      codeDefaults: {
        visible: true,
        width: 24,
        height: 24,
        marginX: 2,
        marginY: 0,
      },
      scaleByProperty: {
        width: "global-font",
        height: "global-font",
        marginX: "global",
        marginY: "global",
      },
    },
    largeEmote: {
      label: "大表情",
      selector: "#message .emoji.blc-large-emoji",
      events: ["danmaku"],
      placements: ["main"],
      properties: ["visible", "width", "height", "marginX", "marginY"],
      codeDefaults: {
        visible: true,
        width: 24,
        height: 24,
        marginX: 2,
        marginY: 0,
      },
      scaleByProperty: {
        width: "global-font",
        height: "global-font",
        marginX: "global",
        marginY: "global",
      },
    },
    amount: {
      label: "金额",
      selector: "#purchase-amount",
      selectorsByEvent: {
        gift: "#purchase-amount",
        superchat: "#purchase-amount",
        guard: "#header-subtext",
      },
      selectorsByPlacement: { sticky: "#text" },
      events: ["gift", "gift-normal",  "superchat", "guard"],
      placements: ["main", "sticky", "detail"],
      properties: textProperties,
      units: pxLineHeight,
      codeDefaults: {
        ...textStructureDefaults,
        color: "#ffffff",
        fontSize: 15,
      },
      codeDefaultsByContext: {
        "gift|sticky": { fontSize: 14, marginX: 8 },
        "superchat|sticky": { fontSize: 14, marginX: 8 },
        "guard|sticky": { fontSize: 14, marginX: 8 },
      },
      inheritedDefaults: inheritedTextDefaults,
      scaleByProperty: textScale,
    },
    timestamp: {
      label: "时间",
      selector: "#timestamp",
      events: [
        "danmaku",
        "gift",
        "gift-normal",

        "superchat",
        "guard",
      ],
      placements: ["main", "detail"],
      properties: textProperties,
      units: pxLineHeight,
      codeDefaults: {
        ...textStructureDefaults,
        visible: false,
        color: "rgba(17,17,17,.4)",
        fontSize: 11,
        marginX: 8,
      },
      inheritedDefaults: inheritedTextDefaults,
      scaleByProperty: textScale,
    },
    identity: {
      label: "身份",
      selector: "#chat-badges yt-live-chat-author-badge-renderer",
      events: ["danmaku", "guard"],
      placements: ["main", "detail"],
      properties: ["visible", "width", "height", "marginX", "marginY"],
      codeDefaults: {
        visible: true,
        width: 16,
        height: 16,
        marginX: 0,
        marginY: 0,
      },
      scaleByProperty: {
        width: "global",
        height: "global",
        marginX: "global",
        marginY: "global",
      },
    },
    paidCard: {
      label: "付费卡片",
      selector: "#card",
      events: ["gift", "gift-normal",  "superchat"],
      placements: ["main", "detail"],
      properties: boxProperties,
      codeDefaults: {
        ...transparentBoxDefaults,
        background: undefined,
        borderRadius: 4,
      },
      inheritedDefaults: { background: "rgba(30,136,229,1)" },
      scaleByProperty: boxScale,
    },
    membership: {
      label: "大航海卡片",
      selector: "#card",
      events: ["guard"],
      placements: ["main", "detail"],
      properties: boxProperties,
      codeDefaults: {
        ...transparentBoxDefaults,
        background: undefined,
        borderRadius: 4,
      },
      inheritedDefaults: { background: "rgba(15,157,88,1)" },
      scaleByProperty: boxScale,
    },
    membershipSubtext: { label: "大航海说明", selector: "#header-subtext", events: ["guard"], placements: ["main", "detail"], properties: textProperties, units: pxLineHeight, codeDefaults: { ...textStructureDefaults, color: "#ffffff", fontSize: 15 }, inheritedDefaults: inheritedTextDefaults, scaleByProperty: textScale },
    ticker: {
      scope: "global",
      label: "置顶栏",
      selector: "yt-live-chat-ticker-renderer",
      events: ["gift", "superchat", "guard"],
      placements: ["sticky"],
      properties: boxProperties,
      codeDefaults: {
        ...transparentBoxDefaults,
        paddingX: 4,
        paddingY: 4,
        borderRadius: 999,
      },
      scaleByProperty: boxScale,
    },
    tickerItem: { scope: "event", label: "单项背景", selector: "yt-live-chat-ticker-paid-message-item-renderer", placements: ["sticky"], properties: boxProperties, codeDefaults: transparentBoxDefaults, scaleByProperty: boxScale },
    tickerItemContent: { label: "单项内容", selector: "#content", placements: ["sticky"], properties: boxProperties, codeDefaults: transparentBoxDefaults, scaleByProperty: boxScale },
    tickerList: { scope: "global", label: "横向项目列表", selector: "yt-live-chat-ticker-renderer #items.yt-live-chat-ticker-renderer", events: ["gift", "superchat", "guard"], placements: ["sticky"], properties: boxProperties, codeDefaults: transparentBoxDefaults, scaleByProperty: boxScale },
  },
  eventSelectors: {
    danmaku: "yt-live-chat-text-message-renderer",
    gift: "yt-live-chat-paid-message-renderer[data-blc-kind='gift'], yt-live-chat-ticker-paid-message-item-renderer[data-blc-kind='gift']",
    "gift-normal":
      "yt-live-chat-paid-message-renderer[data-blc-gift-kind='normal']",

    superchat:
      "yt-live-chat-paid-message-renderer[data-blc-kind='superchat'], yt-live-chat-ticker-paid-message-item-renderer[data-blc-kind='superchat']",
    guard:
      "yt-live-chat-membership-item-renderer, yt-live-chat-ticker-paid-message-item-renderer[data-blc-kind='membership']",
  },
  eventSelectorsByPlacement: {
    main: {
      danmaku: "yt-live-chat-text-message-renderer[data-blc-placement='main']",
      gift: "yt-live-chat-paid-message-renderer[data-blc-kind='gift'][data-blc-placement='main']",
      "gift-normal":
        "yt-live-chat-paid-message-renderer[data-blc-gift-kind='normal'][data-blc-placement='main']",

      superchat:
        "yt-live-chat-paid-message-renderer[data-blc-kind='superchat'][data-blc-placement='main']",
      guard: "yt-live-chat-membership-item-renderer[data-blc-placement='main']",
    },
    sticky: {
      gift: "yt-live-chat-ticker-paid-message-item-renderer[data-blc-kind='gift'][data-blc-placement='sticky']",
      superchat:
        "yt-live-chat-ticker-paid-message-item-renderer[data-blc-kind='superchat'][data-blc-placement='sticky']",
      guard:
        "yt-live-chat-ticker-paid-message-item-renderer[data-blc-kind='membership'][data-blc-placement='sticky']",
    },
    detail: {
      gift:
        "yt-live-chat-ticker-renderer > yt-live-chat-paid-message-renderer[data-blc-kind='gift'][data-blc-placement='detail']",
      superchat:
        "yt-live-chat-ticker-renderer > yt-live-chat-paid-message-renderer[data-blc-kind='superchat'][data-blc-placement='detail']",
      guard:
        "yt-live-chat-ticker-renderer > yt-live-chat-membership-item-renderer[data-blc-kind='membership'][data-blc-placement='detail']",
    },
  },
  eventGroups: { gift: ["gift", "gift-normal"] },
  eventLabels: {
    danmaku: "弹幕",
    gift: "全部礼物",
    "gift-normal": "普通与免费礼物",

    superchat: "醒目留言",
    guard: "大航海",
  },
  identitySelectors: {
    normal: "[author-type='']",
    captain: "[blc-guard-level='3']",
    admiral: "[blc-guard-level='2']",
    governor: "[blc-guard-level='1']",
    moderator: "[author-type='moderator']",
    anchor: "[author-type='owner']",
  },
  identityLabels: {
    normal: "普通用户",
    captain: "舰长",
    admiral: "提督",
    governor: "总督",
    moderator: "房管",
    anchor: "主播",
  },
  identityPriority: [
    "governor",
    "admiral",
    "captain",
    "anchor",
    "moderator",
    "normal",
  ],
  schemeSelectors: {
    light: "[data-theme='light']",
    dark: "[data-theme='dark']",
  },
};

const scaled = (value: number, scale: number) =>
  Number((value * scale).toFixed(3));

/** 来源默认以 G/F 两条独立链表达；重复标记 12px 是上游固定例外。 */
export function createBlivechatBaseCss(
  settings: Pick<
    BlivechatRuntimeSettings,
    "globalScale" | "fontScale" | "showGiftName"
  >,
  sourceCss = "",
): string {
  const global =
    Number.isFinite(settings.globalScale) && settings.globalScale > 0
      ? settings.globalScale
      : 1;
  const font =
    Number.isFinite(settings.fontScale) && settings.fontScale > 0
      ? settings.fontScale
      : 1;
  const scaledLayoutOverrides =
    global === 1
      ? ""
      : `
:where(yt-live-chat-text-message-renderer yt-live-chat-author-chip) { margin-right: var(--blc-inline-gap); }
:where(yt-live-chat-ticker-renderer #items) { padding: 0 var(--blc-row-padding-inline) var(--blc-inline-gap); }`;
  const hostCss = `html, body, #app { background: transparent; }
yt-live-chat-renderer {
  --yt-live-chat-background-color: transparent;
  background: transparent;
}
yt-live-chat-renderer #chat,
yt-live-chat-renderer #contents,
yt-live-chat-item-list-renderer,
yt-live-chat-item-list-renderer #item-scroller,
yt-live-chat-item-list-renderer #items { background: transparent; }
yt-live-chat-item-list-renderer #item-scroller {
  scrollbar-color: rgba(125, 143, 137, .72) transparent;
  scrollbar-width: thin;
}
yt-live-chat-item-list-renderer #item-scroller::-webkit-scrollbar { width: 6px; height: 6px; }
yt-live-chat-item-list-renderer #item-scroller::-webkit-scrollbar-thumb { background: rgba(125, 143, 137, .72); border-radius: 3px; }
yt-live-chat-item-list-renderer #item-scroller::-webkit-scrollbar-track { background: transparent; }
body[data-bb-host-render-mode="output"] #item-scroller.yt-live-chat-item-list-renderer { scrollbar-width: none; }
body[data-bb-host-render-mode="output"] #item-scroller.yt-live-chat-item-list-renderer::-webkit-scrollbar { display: none; width: 0; height: 0; }
yt-live-chat-ticker-renderer { width: var(--bb-list-content-width, 100%) !important; max-width: 100%; }
yt-live-chat-ticker-renderer,
yt-live-chat-ticker-renderer > #container { background: transparent; }
yt-live-chat-ticker-renderer .el-scrollbar__wrap {
  overflow-x: auto !important;
  overflow-y: hidden !important;
  margin-bottom: 0 !important;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
yt-live-chat-ticker-renderer .el-scrollbar__wrap::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}
yt-live-chat-ticker-renderer #items {
  width: max-content;
  min-width: 100%;
  overflow: visible !important;
}
yt-live-chat-ticker-renderer .el-scrollbar__bar.is-horizontal,
yt-live-chat-ticker-renderer .el-scrollbar__bar.is-vertical { display: none !important; }
:where(#items.yt-live-chat-item-list-renderer > [data-event-motion]) { animation: none; }
`;
  // 来源主题的尺寸变量保持原有依赖关系，固定像素仍由主题自行控制。
  if (/--base-size\s*:/.test(sourceCss) && /--font-base-size\s*:/.test(sourceCss)) {
    return hostCss + `yt-live-chat-renderer { --blc-g: ${global}; --blc-f: ${font}; --base-size: ${global}px; --font-base-size: calc(${font} * var(--base-size)); }\n`;
  }
  const variables = `
:root {
  --blc-g: ${global};
  --blc-f: ${font};
  --blc-avatar-text: ${scaled(24, global)}px;
  --blc-avatar-paid: ${scaled(40, global)}px;
  --blc-paid-avatar: ${scaled(40, global)}px;
  --blc-emote-size: ${scaled(24, global * font)}px;
  --blc-large-emote-size: ${scaled(24, global * font)}px;
  --blc-text-font-size: ${scaled(13, global * font)}px;
  --blc-timestamp-font-size: ${scaled(11, global * font)}px;
  --blc-paid-font-size: ${scaled(15, global * font)}px;
  --blc-membership-font-size: ${scaled(14, global * font)}px;
  --blc-ticker-font-size: ${scaled(14, global * font)}px;
  --blc-message-spacing: ${scaled(4, global)}px;
  --blc-row-padding-block: ${scaled(4, global)}px;
  --blc-row-padding-inline: ${scaled(24, global)}px;
  --blc-card-padding-block: ${scaled(8, global)}px;
  --blc-card-padding-inline: ${scaled(16, global)}px;
  --blc-avatar-gap: ${scaled(16, global)}px;
  --blc-inline-gap: ${scaled(8, global)}px;
  --blc-card-radius: ${scaled(4, global)}px;
  --blc-ticker-height: ${scaled(32, global)}px;
  --blc-ticker-avatar: ${scaled(24, global)}px;
}
`;
  if (global === 1 && font === 1) return hostCss + variables;
  return hostCss + variables + `
:where(yt-live-chat-text-message-renderer #author-photo) { width: var(--blc-avatar-text); height: var(--blc-avatar-text); }
:where(yt-live-chat-paid-message-renderer #author-photo),
:where(yt-live-chat-membership-item-renderer #author-photo) { width: var(--blc-paid-avatar); height: var(--blc-paid-avatar); }
:where(#author-photo > img) { width: 100%; height: 100%; }
:where(yt-live-chat-text-message-renderer #author-photo > img) { width: var(--blc-avatar-text); height: var(--blc-avatar-text); }
:where(yt-live-chat-text-message-renderer) { font-size: var(--blc-text-font-size); }
:where(yt-live-chat-paid-message-renderer #author-name) { font-size: ${scaled(14, global * font)}px; }
:where(#timestamp) { font-size: var(--blc-timestamp-font-size); }
:where(yt-live-chat-paid-message-renderer) { font-size: var(--blc-paid-font-size); }
:where(yt-live-chat-membership-item-renderer #card) { font-size: var(--blc-membership-font-size); }
:where(#header-subtext) { font-size: var(--blc-paid-font-size); }
:where(yt-live-chat-ticker-paid-message-item-renderer) { font-size: var(--blc-ticker-font-size); }
:where(yt-live-chat-text-message-renderer), :where(yt-live-chat-paid-message-renderer), :where(yt-live-chat-membership-item-renderer) { padding: var(--blc-row-padding-block) var(--blc-row-padding-inline); }
:where(yt-live-chat-paid-message-renderer #header), :where(yt-live-chat-paid-message-renderer:not([show-only-header]) #content), :where(yt-live-chat-membership-item-renderer #header) { padding: var(--blc-card-padding-block) var(--blc-card-padding-inline); }
:where(yt-live-chat-text-message-renderer #author-photo),
:where(yt-live-chat-paid-message-renderer #author-photo),
:where(yt-live-chat-membership-item-renderer #author-photo) { margin-right: var(--blc-avatar-gap); }
:where(#timestamp) { margin-right: var(--blc-inline-gap); }
:where(yt-live-chat-paid-message-renderer #card), :where(yt-live-chat-membership-item-renderer #card) { border-radius: var(--blc-card-radius); }
:where(yt-live-chat-ticker-renderer #items) { height: var(--blc-ticker-height); }
${scaledLayoutOverrides}
:where(yt-live-chat-ticker-paid-message-item-renderer #author-photo) { width: var(--blc-ticker-avatar); height: var(--blc-ticker-avatar); }
:where(yt-live-chat-ticker-paid-message-item-renderer #text) { margin: 0 var(--blc-inline-gap); }
:where(#message .emoji) { margin: ${scaled(-1, global)}px ${scaled(2, global)}px ${scaled(1, global)}px; }
:where(#message .emoji:not(.blc-large-emoji)) { width: auto; height: var(--blc-emote-size); }
:where(#message .emoji.blc-large-emoji) { width: auto; height: var(--blc-large-emote-size); }
#message .el-badge__content { font-size: 12px !important;/* source-fixed */ line-height: 18px !important; }
`;
}

installCompatiblePropertyCapabilities(BLIVECHAT_CAPABILITY);
