import type { NativeThemeDisplaySettings, NativeVisualProperty } from "./nativeComponentAppearance.ts";
import type { ThemeMode } from "./themeTypes.ts";
import { NATIVE_PART_SELECTORS, type NativeSemanticPartId } from "./nativeSemanticSelectors.ts";

export interface NativeScopeChoice { id: string; label: string; children?: readonly NativeScopeChoice[] }
export interface NativeSemanticPart { id: NativeSemanticPartId; label: string; group: "common" | "identity" | "message" | "gift" | "guard" | "lottery" | "redpocket"; selector: string; capability: NativePartCapability }

export const NATIVE_EVENT_SCOPES: readonly NativeScopeChoice[] = [
  { id: "all", label: "全部事件" }, { id: "danmaku", label: "弹幕" },
  { id: "interaction", label: "互动", children: [
    { id: "enter", label: "进入直播间" }, { id: "follow", label: "关注" }, { id: "share", label: "分享" },
    { id: "specialFollow", label: "特别关注" }, { id: "mutualFollow", label: "互相关注" }, { id: "like", label: "点赞" },
  ] },
  { id: "gift", label: "礼物", children: [
    { id: "free", label: "免费礼物" }, { id: "normal", label: "普通礼物" }, { id: "blind", label: "盲盒礼物" },
    { id: "redpocket", label: "红包", children: [{id:"redpocketStart",label:"红包开始"},{id:"redpocketResult",label:"红包开奖"}] }, { id: "lottery", label: "天选", children: [{id:"lotteryStart",label:"天选开始"},{id:"lotteryResult",label:"天选开奖"}] },
  ] },
  { id: "superchat", label: "醒目留言" }, { id: "guard", label: "大航海" },
  { id: "system", label: "系统", children: [
    { id: "liveStatus", label: "开播与下播" }, { id: "userMute", label: "用户禁言" },
    { id: "roomMute", label: "全员禁言" }, { id: "admin", label: "房管变更" }, { id: "roomChange", label: "房间信息变更" },
    { id: "warning", label: "直播警告与切断" },
  ] },
] as const;

export const NATIVE_IDENTITY_SCOPES = [
  { id: "all", label: "所有用户" }, { id: "ordinary", label: "普通用户" }, { id: "captain", label: "舰长" }, { id: "admiral", label: "提督" },
  { id: "viceroy", label: "总督" }, { id: "anchor", label: "主播" }, { id: "admin", label: "房管" },
] as const;

export function nativeEventScopePath(id: string, choices: readonly NativeScopeChoice[] = NATIVE_EVENT_SCOPES): NativeScopeChoice[] {
  for (const choice of choices) {
    if (choice.id === id) return [choice];
    const nested = nativeEventScopePath(id, choice.children ?? []);
    if (nested.length) return [choice, ...nested];
  }
  return [];
}

export function nativePartSupportsEvent(part: NativeSemanticPartId, event: string): boolean {
  const root = nativeEventScopePath(event)[0]?.id;
  if (part === "card") return root !== "interaction";
  if (part === "header") return root !== "system";
  if (part === "activityStatus") return ["all", "gift", "redpocket", "redpocketStart", "lottery", "lotteryStart"].includes(event);
  return true;
}

export const NATIVE_PROPERTY_GROUPS = {
  display: ["visible"],
  typography: ["fontFamily", "fontSize", "fontWeight", "lineHeight"],
  surface: ["color", "background"],
  spacing: ["paddingX", "paddingY", "marginX", "marginY"],
  border: ["borderWidth", "borderColor", "borderRadius", "borderImage"],
  layout: ["gap"],
  media: ["width", "height"],
} as const satisfies Record<string, readonly NativeVisualProperty[]>;

export type NativePropertyGroup = keyof typeof NATIVE_PROPERTY_GROUPS;
export interface NativeVisualPropertySection {
  id: NativePropertyGroup;
  label: string;
  defaultExpanded: boolean;
  properties: readonly NativeVisualProperty[];
}
export type NativePartShape = "text" | "image" | "container" | "text-badge" | "switchable";
export interface NativePartCapability {
  shape: NativePartShape;
  groups: readonly NativePropertyGroup[];
  variants?: Partial<Record<"text" | "image", readonly NativePropertyGroup[]>>;
}

const capability = (shape: NativePartShape, ...groups: NativePropertyGroup[]): NativePartCapability => ({ shape, groups });
const text = (): NativePartCapability => capability("text", "display", "typography", "surface", "spacing", "border");
const badge = (): NativePartCapability => capability("text-badge", "display", "typography", "surface", "spacing", "border");
const image = (): NativePartCapability => capability("image", "display", "spacing", "media", "border");
const container = (...extra: NativePropertyGroup[]): NativePartCapability => capability("container", "display", "surface", "spacing", "border", ...extra);
const switchable = (): NativePartCapability => ({
  shape: "switchable",
  groups: ["display", "typography", "surface", "spacing", "border", "media"],
  variants: {
    text: ["display", "typography", "surface", "spacing", "border"],
    image: ["display", "spacing", "media", "border"],
  },
});
const roleBadge = (): NativePartCapability => ({
  ...switchable(),
  variants: {
    text: ["display", "typography", "surface", "spacing", "border"],
    image: ["display", "typography", "spacing", "media"],
  },
});

/** Property ownership follows the rendered part, including icon/text variants. */
export const NATIVE_PART_CAPABILITIES: Record<NativeSemanticPartId, NativePartCapability> = {
  quantityPrefix:text(),quantityNumber:text(),quantityUnit:text(),winnerAvatar:image(),honorHeading:text(),honorSummary:text(),honorMilestone:text(),systemTitle:text(),systemDetail:text(),
  card: container("typography", "layout"), header: container("typography", "layout"), activityStatus: text(),
  whole: container("typography", "layout"), canvas: container("typography", "layout"),
  list: container("typography", "layout"), event: container("typography", "layout"),
  row: container("typography", "layout"), sticky: container("layout"), stickyEvent: container("typography", "layout"),
  user: container("layout"), identity: container("layout"), badges: container("layout"),
  avatarWrap: container(), avatarPlaceholder: container(), avatarFrame: image(), avatar: image(), username: text(),
  medal: badge(), medalName: text(), medalLevel: text(), guardBadge: switchable(),
  anchorBadge: roleBadge(), adminBadge: roleBadge(), honor: switchable(), rank: badge(),
  reply: text(), translation: text(), message: text(), action: text(), content: container("layout"),
  price: text(), priceUnit: text(), priceValue: text(), repeatCount: badge(), blindGiftCount: text(),
  timestamp: text(), deletedStatus: text(), eventIcon: switchable(), honorWatermark: roleBadge(),
  blindGiftImage: image(), giftImage: image(), giftCount: text(), giftName: text(),
  blindGiftName: text(), giftProfitPositive: text(), giftProfitNegative: text(), giftPrice: text(), giftProfit: text(), giftSourcePrice: text(), giftValue: text(),
  giftGroup: container(), blindGiftGroup: container(), inlineEmote: image(), bigEmote: image(), bannerEmote: image(),
  guardDurationPrefix: text(), guardDurationNumber: text(), guardDurationUnit: text(), guardDaysPrefix: text(), guardDaysNumber: text(), guardDaysUnit: text(), guardDuration: text(), guardDays: text(), guardName: text(), guardContent: container(), guardHighlight: text(),
  lotteryCommandPrefix: text(), lotteryCommandText: text(), lotteryGiftPrefix: text(), lotteryGiftName: text(), lotteryPrize: text(), lotteryCount: text(), lotteryCommand: text(), lotteryGift: text(),
  lotteryRequirementPrefix: text(), lotteryRequirementText: text(), redpocketAwardsPrefix: text(), redpocketCount: text(), resultDescription: text(), winnerListCount: text(),
  lotteryWait: text(), lotteryRequirement: text(), lotteryGroup: container(),
  redpocketCommandPrefix: text(), redpocketCommandText: text(), redpocketAwards: text(), redpocketCommand: text(), redpocketWait: text(), redpocketName: text(), redpocketGroup: container(),
  winnerCount: text(), winnerUser: text(), winnerItem: container(), winnerItems: container(), winnerToggle: text(), winnerList: container(),
};

const part = (id: NativeSemanticPartId, label: string, group: NativeSemanticPart["group"]): NativeSemanticPart => ({
  id, label, group, selector: NATIVE_PART_SELECTORS[id], capability: NATIVE_PART_CAPABILITIES[id],
});
export const NATIVE_SEMANTIC_PARTS: readonly NativeSemanticPart[] = [
  part("quantityPrefix","数量符号","common"),part("quantityNumber","数量数值","common"),part("quantityUnit","数量单位","common"),part("winnerAvatar","中奖头像","redpocket"),part("honorHeading","成就标题","guard"),part("honorSummary","成就说明","guard"),part("honorMilestone","成就里程碑","guard"),part("systemTitle","系统标题","common"),part("systemDetail","系统详情","common"),
  part("card", "事件卡片", "common"), part("header", "信息组", "common"), part("activityStatus", "活动状态", "message"),
  part("whole", "事件区", "common"), part("list", "事件列表", "common"), part("event", "事件", "common"), part("row", "普通事件", "common"), part("sticky", "置顶栏", "common"), part("stickyEvent", "置顶事件", "common"),
  part("user", "用户信息", "identity"), part("avatarWrap", "头像区域", "identity"), part("avatarPlaceholder", "头像占位", "identity"), part("avatarFrame", "头像框", "identity"), part("avatar", "头像", "identity"), part("username", "用户名", "identity"), part("medal", "粉丝牌", "identity"), part("medalName", "粉丝牌名称", "identity"), part("medalLevel", "粉丝牌等级", "identity"), part("guardBadge", "大航海身份", "identity"), part("anchorBadge", "主播身份", "identity"), part("adminBadge", "房管身份", "identity"), part("honor", "荣耀勋章", "identity"), part("rank", "当前排行", "identity"), part("badges", "身份徽章", "identity"),
  part("price", "价格整体", "message"), part("priceUnit", "货币符号", "message"), part("priceValue", "金额数值", "message"), part("repeatCount", "合并数量", "message"), part("blindGiftCount", "盲盒数量", "gift"), part("reply", "回复对象", "message"), part("translation", "平台译文", "message"), part("message", "正文", "message"), part("action", "动作文字", "message"), part("content", "内容区域", "message"), part("timestamp", "时间", "message"), part("deletedStatus", "删除状态", "message"), part("eventIcon", "事件图标", "message"), part("honorWatermark", "成就水印", "guard"),
  part("blindGiftName", "盲盒名称", "gift"), part("giftProfitPositive", "盲盒盈利", "gift"), part("giftProfitNegative", "盲盒亏损", "gift"), part("blindGiftImage", "盲盒图片", "gift"), part("giftImage", "礼物图片", "gift"), part("giftCount", "礼物数量", "gift"), part("giftName", "礼物名称", "gift"), part("giftPrice", "礼物金额", "gift"), part("giftProfit", "盲盒盈亏", "gift"), part("giftSourcePrice", "盲盒原价", "gift"), part("blindGiftGroup", "盲盒信息", "gift"), part("giftGroup", "礼物信息", "gift"), part("inlineEmote", "行内表情", "gift"), part("bigEmote", "大表情", "gift"), part("bannerEmote", "横幅表情", "gift"),
  part("guardDurationPrefix", "时长前缀", "guard"), part("guardDurationNumber", "时长数值", "guard"), part("guardDurationUnit", "时长单位", "guard"), part("guardDaysPrefix", "陪伴前缀", "guard"), part("guardDaysNumber", "陪伴数值", "guard"), part("guardDaysUnit", "陪伴单位", "guard"), part("guardDuration", "大航海时长", "guard"), part("guardDays", "陪伴天数", "guard"), part("guardName", "大航海名称", "guard"), part("guardContent", "大航海内容", "guard"), part("guardHighlight", "大航海高亮", "guard"),
  part("lotteryRequirementPrefix", "条件前缀", "lottery"), part("lotteryRequirementText", "条件正文", "lottery"), part("redpocketAwardsPrefix", "奖励前缀", "redpocket"), part("redpocketCount", "红包奖励数量", "redpocket"), part("resultDescription", "开奖摘要", "redpocket"), part("winnerListCount", "名单接收提示", "redpocket"), part("lotteryCommandPrefix", "口令前缀", "lottery"), part("lotteryCommandText", "口令正文", "lottery"), part("lotteryGiftPrefix", "礼物前缀", "lottery"), part("lotteryGiftName", "参与礼物名称", "lottery"), part("lotteryPrize", "天选奖品", "lottery"), part("lotteryCount", "天选名额", "lottery"), part("lotteryCommand", "天选口令", "lottery"), part("lotteryGift", "参与礼物", "lottery"), part("lotteryWait", "开奖时间", "lottery"), part("lotteryRequirement", "参与条件", "lottery"), part("lotteryGroup", "天选内容", "lottery"),
  part("redpocketCommandPrefix", "口令前缀", "redpocket"), part("redpocketCommandText", "口令正文", "redpocket"), part("redpocketAwards", "红包奖励", "redpocket"), part("redpocketCommand", "红包口令", "redpocket"), part("redpocketWait", "开奖时间", "redpocket"), part("redpocketName", "红包名称", "redpocket"), part("redpocketGroup", "红包内容", "redpocket"), part("winnerCount", "中奖人数", "redpocket"), part("winnerUser", "中奖用户", "redpocket"), part("winnerItem", "中奖项", "redpocket"), part("winnerItems", "中奖内容", "redpocket"), part("winnerToggle", "名单展开", "redpocket"), part("winnerList", "中奖名单", "redpocket"),
] as const;

export interface NativeVisualNavigationItem {
  id: string;
  part?: NativeSemanticPartId;
  label?: string;
  event?: string;
  defaultExpanded?: boolean;
  children?: readonly NativeVisualNavigationItem[];
}

export interface NativeVisualNavigationGroup {
  id: "display" | "identity" | "content" | "emote" | "danmaku" | "gift" | "superchat" | "guard" | "lotteryRedpocket";
  label: string;
  defaultExpanded: boolean;
  event?: string;
  items: readonly NativeVisualNavigationItem[];
}

const navItem = (id: NativeSemanticPartId, children?: readonly NativeSemanticPartId[], label?: string): NativeVisualNavigationItem => ({
  id, part: id,
  ...(label ? { label } : {}),
  ...(children ? { children: children.map(child => ({ id: child })) } : {}),
});

const navBranch = (id: string, label: string, children: readonly NativeVisualNavigationItem[], part?: NativeSemanticPartId, event?: string): NativeVisualNavigationItem => ({
  id, label, children, ...(part ? { part } : {}), ...(event ? { event } : {}),
});

/** Navigation order and nesting; labels and capabilities continue to come from NATIVE_SEMANTIC_PARTS. */
export const NATIVE_VISUAL_NAVIGATION: readonly NativeVisualNavigationGroup[] = [
  { id: "display", label: "显示区域", defaultExpanded: true, items: [navItem("whole"), navBranch("events", "事件", [navItem("event", undefined, "所有事件"), navBranch("row", "普通事件", [navItem("card"), navItem("header")], "row"), navItem("stickyEvent")]), navItem("list"), navItem("sticky")] },
  { id: "identity", label: "用户信息", defaultExpanded: true, items: [navItem("user", undefined, "用户信息整体"), navBranch("avatarWrap", "头像区域", [navItem("avatarPlaceholder"), navItem("avatarFrame"), navItem("avatar")], "avatarWrap"), navItem("username"), navBranch("medal", "粉丝牌", [navItem("medalName"), navItem("medalLevel")], "medal"), navBranch("badges", "身份徽章", [navItem("guardBadge"), navItem("anchorBadge"), navItem("adminBadge")], "badges"), navItem("honor"), navItem("rank")] },
  { id: "content", label: "事件内容", defaultExpanded: true, items: [navItem("content"), navItem("message"), navItem("action"), navItem("timestamp"), navItem("eventIcon"), navItem("activityStatus"), navItem("systemTitle"), navItem("systemDetail"), navBranch("quantity","数量",[navItem("quantityPrefix"),navItem("quantityNumber"),navItem("quantityUnit")]), navItem("price", ["price", "priceUnit", "priceValue"], "价格")] },
  { id: "emote", label: "表情", defaultExpanded: true, items: ["inlineEmote", "bigEmote", "bannerEmote"].map(id => navItem(id as NativeSemanticPartId)) },
  { id: "danmaku", label: "弹幕", defaultExpanded: false, event: "danmaku", items: [navItem("deletedStatus"), navItem("reply"), navItem("repeatCount")] },
  { id: "gift", label: "礼物", defaultExpanded: false, event: "gift", items: [navItem("giftImage"), navBranch("giftGroup", "礼物信息", [navItem("giftName"), navItem("giftCount")], "giftGroup"), navItem("giftPrice"), navItem("blindGiftImage"), navBranch("blindGiftGroup", "盲盒信息", [ navItem("blindGiftName"), navItem("blindGiftCount"), navBranch("giftProfit", "盲盒盈亏", [navItem("giftProfitPositive"), navItem("giftProfitNegative")], "giftProfit"), navItem("giftSourcePrice")], "blindGiftGroup")] },
  { id: "superchat", label: "醒目留言", defaultExpanded: false, event: "superchat", items: [navItem("message"), navItem("price", ["price", "priceUnit", "priceValue"], "价格"), navItem("translation"), navItem("deletedStatus")] },
  { id: "guard", label: "大航海", defaultExpanded: false, event: "guard", items: [navBranch("guardContent", "大航海内容", [navItem("guardName"), navBranch("guardDuration", "大航海时长", [navItem("guardDurationPrefix"), navItem("guardDurationNumber"), navItem("guardDurationUnit")], "guardDuration")], "guardContent"), navBranch("guardDays", "陪伴天数", [navItem("guardDaysPrefix"), navItem("guardDaysNumber"), navItem("guardDaysUnit")], "guardDays"), navItem("guardHighlight"), navItem("honorHeading"),navItem("honorSummary"),navItem("honorMilestone"), navItem("honorWatermark"), navItem("price")] },
  { id: "lotteryRedpocket", label: "红包与天选", defaultExpanded: false, items: [
    navBranch("redpocketGroup", "红包", [navItem("redpocketName"), navBranch("redpocketAwards", "红包奖励", [navItem("redpocketAwardsPrefix"), navItem("redpocketCount")], "redpocketAwards"), navBranch("redpocketCommand", "红包口令", [navItem("redpocketCommandPrefix"), navItem("redpocketCommandText")], "redpocketCommand"), navItem("redpocketWait"), { ...navItem("activityStatus"), event: "redpocketStart" }], "redpocketGroup", "redpocket"),
    navBranch("lotteryGroup", "天选", [navItem("lotteryPrize"), navItem("lotteryCount"), navBranch("lotteryCommand", "天选口令", [navItem("lotteryCommandPrefix"), navItem("lotteryCommandText")], "lotteryCommand"), navBranch("lotteryGift", "参与礼物", [navItem("lotteryGiftPrefix"), navItem("lotteryGiftName")], "lotteryGift"), navItem("lotteryWait"), { ...navItem("activityStatus"), event: "lotteryStart" }, navBranch("lotteryRequirement", "参与条件", [navItem("lotteryRequirementPrefix"), navItem("lotteryRequirementText")], "lotteryRequirement")], "lotteryGroup", "lottery"),
    navBranch("winnerList", "中奖", [navItem("resultDescription"), navItem("winnerCount"), navItem("winnerListCount"), navBranch("winnerItems", "中奖内容", [navItem("winnerItem"), navItem("winnerAvatar"), navItem("winnerUser")], "winnerItems"), navItem("winnerToggle")], "winnerList", "all"),
  ] },
] as const;

export function nativeVisualPropertiesForPart(partId: NativeSemanticPartId, shape?: "text" | "image"): readonly NativeVisualProperty[] {
  const metadata = NATIVE_PART_CAPABILITIES[partId];
  const groups = (shape && metadata.variants?.[shape]) || metadata.groups;
  const supported = new Set<NativeVisualProperty>(groups.flatMap(group => [...NATIVE_PROPERTY_GROUPS[group]]));
  if (groups.includes("typography")) supported.add("color");
  else supported.delete("color");
  const roleIcon = (partId === "anchorBadge" || partId === "adminBadge" || partId === "honorWatermark") && shape === "image";
  return VISUAL_PROPERTY_ORDER.filter(property => supported.has(property) && !(partId === "bigEmote" && property === "height")
    && !(["honor", "guardBadge"].includes(partId) && shape === "image" && property === "width")
    && !(roleIcon && (["fontFamily", "fontSize", "fontWeight", "lineHeight"] as NativeVisualProperty[]).includes(property)));
}

const PROPERTY_SECTION_LABELS: Record<NativePropertyGroup, string> = {
  display: "显示",
  typography: "文字",
  surface: "颜色与背景",
  spacing: "间距",
  border: "边框",
  layout: "排版",
  media: "媒体",
};

export function nativeVisualPropertySectionsForPart(partId: NativeSemanticPartId, shape?: "text" | "image"): readonly NativeVisualPropertySection[] {
  const available = new Set(nativeVisualPropertiesForPart(partId, shape));
  return (Object.entries(NATIVE_PROPERTY_GROUPS) as [NativePropertyGroup, readonly NativeVisualProperty[]][])
    .map(([id, properties]) => ({
      id,
      label: PROPERTY_SECTION_LABELS[id],
      defaultExpanded: id === "display" || id === "typography" || id === "surface",
      properties: properties.filter(property => available.has(property)),
    }))
    .filter(section => section.properties.length > 0);
}

export function resolveNativePartShape(partId: NativeSemanticPartId, context: { event: string; display: NativeThemeDisplaySettings }): "text" | "image" | undefined {
  if (partId === "honorWatermark") return "image";
  if (partId === "anchorBadge") return context.display.anchorIdentityDisplayMode === "icon" ? "image" : "text";
  if (partId === "adminBadge") return context.display.adminIdentityDisplayMode === "icon" ? "image" : "text";
  if (NATIVE_PART_CAPABILITIES[partId].shape !== "switchable") return undefined;
  if (partId === "guardBadge") return context.display.guardIdentityDisplayMode === "icon" ? "image" : "text";
  if (partId === "honor") return context.display.honorLevelDisplayMode === "icon" ? "image" : "text";
  if (partId === "eventIcon") {
    if (context.event === "all" || context.event === "guard") return undefined;
    return context.event === "gift" || context.event === "superchat" || nativeEventScopePath(context.event).some(scope => scope.id === "redpocket" || scope.id === "lottery") ? "image" : "text";
  }
  return undefined;
}

const VISUAL_PROPERTY_ORDER: readonly NativeVisualProperty[] = ["visible", "fontFamily", "color", "background", "fontSize", "fontWeight", "lineHeight", "paddingX", "paddingY", "marginX", "marginY", "gap", "width", "height", "borderWidth", "borderColor", "borderRadius", "borderImage"];

export function nativeVisualPartUsesGlobalScope(partId: NativeSemanticPartId): boolean {
  return partId === "whole" || partId === "canvas" || partId === "list" || partId === "sticky";
}

export function getNativeThemeCapability(mode: ThemeMode) {
  const editable = mode === "native";
  return { mode, editable, eventScopes: editable ? NATIVE_EVENT_SCOPES : [], identityScopes: editable ? NATIVE_IDENTITY_SCOPES : [], parts: editable ? NATIVE_SEMANTIC_PARTS : [], selectors: editable ? NATIVE_PART_SELECTORS : {} } as const;
}
