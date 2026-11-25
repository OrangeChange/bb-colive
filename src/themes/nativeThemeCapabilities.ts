import { localized, uiText } from "../i18n/index.ts";
import type { NativeThemeDisplaySettings, NativeVisualProperty } from "./nativeComponentAppearance.ts";
import type { ThemeMode } from "./themeTypes.ts";
import { NATIVE_PART_SELECTORS, type NativeSemanticPartId } from "./nativeSemanticSelectors.ts";

export interface NativeScopeChoice { id: string; label: string; children?: readonly NativeScopeChoice[] }
export interface NativeSemanticPart { id: NativeSemanticPartId; label: string; group: "common" | "identity" | "message" | "gift" | "guard" | "lottery" | "redpocket"; selector: string; capability: NativePartCapability }

export const NATIVE_EVENT_SCOPES: readonly NativeScopeChoice[] = localized(() => ([
  { id: "all", label: uiText("nativeThemeCapabilities.NATIVE_EVENT_SCOPES.label") }, { id: "danmaku", label: uiText("nativeThemeCapabilities.NATIVE_EVENT_SCOPES.label2") },
  { id: "interaction", label: uiText("nativeThemeCapabilities.NATIVE_EVENT_SCOPES.label3"), children: [
    { id: "enter", label: uiText("nativeThemeCapabilities.NATIVE_EVENT_SCOPES.children.label") }, { id: "follow", label: uiText("nativeThemeCapabilities.NATIVE_EVENT_SCOPES.children.label2") }, { id: "share", label: uiText("nativeThemeCapabilities.NATIVE_EVENT_SCOPES.children.label3") },
    { id: "specialFollow", label: uiText("nativeThemeCapabilities.NATIVE_EVENT_SCOPES.children.label4") }, { id: "mutualFollow", label: uiText("nativeThemeCapabilities.NATIVE_EVENT_SCOPES.children.label5") }, { id: "like", label: uiText("nativeThemeCapabilities.NATIVE_EVENT_SCOPES.children.label6") },
  ] },
  { id: "gift", label: uiText("nativeThemeCapabilities.NATIVE_EVENT_SCOPES.label4"), children: [
    { id: "free", label: uiText("nativeThemeCapabilities.NATIVE_EVENT_SCOPES.children.label7") }, { id: "normal", label: uiText("nativeThemeCapabilities.NATIVE_EVENT_SCOPES.children.label8") }, { id: "blind", label: uiText("nativeThemeCapabilities.NATIVE_EVENT_SCOPES.children.label9") },
    { id: "redpocket", label: uiText("nativeThemeCapabilities.NATIVE_EVENT_SCOPES.children.label10"), children: [{id:"redpocketStart",label:uiText("nativeThemeCapabilities.NATIVE_EVENT_SCOPES.children.label11")},{id:"redpocketResult",label:uiText("nativeThemeCapabilities.NATIVE_EVENT_SCOPES.children.label12")}] }, { id: "lottery", label: uiText("nativeThemeCapabilities.NATIVE_EVENT_SCOPES.children.label13"), children: [{id:"lotteryStart",label:uiText("nativeThemeCapabilities.NATIVE_EVENT_SCOPES.children.label14")},{id:"lotteryResult",label:uiText("nativeThemeCapabilities.NATIVE_EVENT_SCOPES.children.label15")}] },
  ] },
  { id: "superchat", label: uiText("nativeThemeCapabilities.NATIVE_EVENT_SCOPES.label5") }, { id: "guard", label: uiText("nativeThemeCapabilities.NATIVE_EVENT_SCOPES.label6") },
  { id: "system", label: uiText("nativeThemeCapabilities.NATIVE_EVENT_SCOPES.label7"), children: [
    { id: "liveStatus", label: uiText("nativeThemeCapabilities.NATIVE_EVENT_SCOPES.children.label16") }, { id: "userMute", label: uiText("nativeThemeCapabilities.NATIVE_EVENT_SCOPES.children.label17") },
    { id: "roomMute", label: uiText("nativeThemeCapabilities.NATIVE_EVENT_SCOPES.children.label18") }, { id: "admin", label: uiText("nativeThemeCapabilities.NATIVE_EVENT_SCOPES.children.label19") }, { id: "roomChange", label: uiText("nativeThemeCapabilities.NATIVE_EVENT_SCOPES.children.label20") },
    { id: "warning", label: uiText("nativeThemeCapabilities.NATIVE_EVENT_SCOPES.children.label21") },
  ] },
] as const));

export const NATIVE_IDENTITY_SCOPES = localized(() => ([
  { id: "all", label: uiText("nativeThemeCapabilities.NATIVE_IDENTITY_SCOPES.label") }, { id: "ordinary", label: uiText("nativeThemeCapabilities.NATIVE_IDENTITY_SCOPES.label2") }, { id: "captain", label: uiText("nativeThemeCapabilities.NATIVE_IDENTITY_SCOPES.label3") }, { id: "admiral", label: uiText("nativeThemeCapabilities.NATIVE_IDENTITY_SCOPES.label4") },
  { id: "viceroy", label: uiText("nativeThemeCapabilities.NATIVE_IDENTITY_SCOPES.label5") }, { id: "anchor", label: uiText("nativeThemeCapabilities.NATIVE_IDENTITY_SCOPES.label6") }, { id: "admin", label: uiText("nativeThemeCapabilities.NATIVE_IDENTITY_SCOPES.label7") },
] as const));

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
export const NATIVE_SEMANTIC_PARTS: readonly NativeSemanticPart[] = localized(() => ([
  part("quantityPrefix",uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS"),"common"),part("quantityNumber",uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS2"),"common"),part("quantityUnit",uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS3"),"common"),part("winnerAvatar",uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS4"),"redpocket"),part("honorHeading",uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS5"),"guard"),part("honorSummary",uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS6"),"guard"),part("honorMilestone",uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS7"),"guard"),part("systemTitle",uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS8"),"common"),part("systemDetail",uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS9"),"common"),
  part("card", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS10"), "common"), part("header", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS11"), "common"), part("activityStatus", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS12"), "message"),
  part("whole", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS13"), "common"), part("list", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS14"), "common"), part("event", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS15"), "common"), part("row", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS16"), "common"), part("sticky", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS17"), "common"), part("stickyEvent", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS18"), "common"),
  part("user", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS19"), "identity"), part("avatarWrap", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS20"), "identity"), part("avatarPlaceholder", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS21"), "identity"), part("avatarFrame", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS22"), "identity"), part("avatar", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS23"), "identity"), part("username", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS24"), "identity"), part("medal", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS25"), "identity"), part("medalName", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS26"), "identity"), part("medalLevel", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS27"), "identity"), part("guardBadge", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS28"), "identity"), part("anchorBadge", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS29"), "identity"), part("adminBadge", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS30"), "identity"), part("honor", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS31"), "identity"), part("rank", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS32"), "identity"), part("badges", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS33"), "identity"),
  part("price", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS34"), "message"), part("priceUnit", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS35"), "message"), part("priceValue", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS36"), "message"), part("repeatCount", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS37"), "message"), part("blindGiftCount", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS38"), "gift"), part("reply", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS39"), "message"), part("translation", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS40"), "message"), part("message", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS41"), "message"), part("action", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS42"), "message"), part("content", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS43"), "message"), part("timestamp", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS44"), "message"), part("deletedStatus", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS45"), "message"), part("eventIcon", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS46"), "message"), part("honorWatermark", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS47"), "guard"),
  part("blindGiftName", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS48"), "gift"), part("giftProfitPositive", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS49"), "gift"), part("giftProfitNegative", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS50"), "gift"), part("blindGiftImage", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS51"), "gift"), part("giftImage", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS52"), "gift"), part("giftCount", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS53"), "gift"), part("giftName", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS54"), "gift"), part("giftPrice", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS55"), "gift"), part("giftProfit", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS56"), "gift"), part("giftSourcePrice", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS57"), "gift"), part("blindGiftGroup", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS58"), "gift"), part("giftGroup", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS59"), "gift"), part("inlineEmote", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS60"), "gift"), part("bigEmote", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS61"), "gift"), part("bannerEmote", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS62"), "gift"),
  part("guardDurationPrefix", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS63"), "guard"), part("guardDurationNumber", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS64"), "guard"), part("guardDurationUnit", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS65"), "guard"), part("guardDaysPrefix", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS66"), "guard"), part("guardDaysNumber", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS67"), "guard"), part("guardDaysUnit", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS68"), "guard"), part("guardDuration", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS69"), "guard"), part("guardDays", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS70"), "guard"), part("guardName", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS71"), "guard"), part("guardContent", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS72"), "guard"), part("guardHighlight", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS73"), "guard"),
  part("lotteryRequirementPrefix", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS74"), "lottery"), part("lotteryRequirementText", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS75"), "lottery"), part("redpocketAwardsPrefix", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS76"), "redpocket"), part("redpocketCount", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS77"), "redpocket"), part("resultDescription", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS78"), "redpocket"), part("winnerListCount", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS79"), "redpocket"), part("lotteryCommandPrefix", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS80"), "lottery"), part("lotteryCommandText", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS81"), "lottery"), part("lotteryGiftPrefix", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS82"), "lottery"), part("lotteryGiftName", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS83"), "lottery"), part("lotteryPrize", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS84"), "lottery"), part("lotteryCount", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS85"), "lottery"), part("lotteryCommand", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS86"), "lottery"), part("lotteryGift", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS87"), "lottery"), part("lotteryWait", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS88"), "lottery"), part("lotteryRequirement", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS89"), "lottery"), part("lotteryGroup", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS90"), "lottery"),
  part("redpocketCommandPrefix", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS80"), "redpocket"), part("redpocketCommandText", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS81"), "redpocket"), part("redpocketAwards", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS91"), "redpocket"), part("redpocketCommand", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS92"), "redpocket"), part("redpocketWait", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS88"), "redpocket"), part("redpocketName", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS93"), "redpocket"), part("redpocketGroup", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS94"), "redpocket"), part("winnerCount", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS95"), "redpocket"), part("winnerUser", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS96"), "redpocket"), part("winnerItem", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS97"), "redpocket"), part("winnerItems", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS98"), "redpocket"), part("winnerToggle", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS99"), "redpocket"), part("winnerList", uiText("nativeThemeCapabilities.NATIVE_SEMANTIC_PARTS100"), "redpocket"),
] as const));

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
export const NATIVE_VISUAL_NAVIGATION: readonly NativeVisualNavigationGroup[] = localized(() => ([
  { id: "display", label: uiText("nativeThemeCapabilities.NATIVE_VISUAL_NAVIGATION.label"), defaultExpanded: true, items: [navItem("whole"), navBranch("events", uiText("nativeThemeCapabilities.NATIVE_VISUAL_NAVIGATION.items"), [navItem("event", undefined, uiText("nativeThemeCapabilities.NATIVE_VISUAL_NAVIGATION.items2")), navBranch("row", uiText("nativeThemeCapabilities.NATIVE_VISUAL_NAVIGATION.items3"), [navItem("card"), navItem("header")], "row"), navItem("stickyEvent")]), navItem("list"), navItem("sticky")] },
  { id: "identity", label: uiText("nativeThemeCapabilities.NATIVE_VISUAL_NAVIGATION.label2"), defaultExpanded: true, items: [navItem("user", undefined, uiText("nativeThemeCapabilities.NATIVE_VISUAL_NAVIGATION.items4")), navBranch("avatarWrap", uiText("nativeThemeCapabilities.NATIVE_VISUAL_NAVIGATION.items5"), [navItem("avatarPlaceholder"), navItem("avatarFrame"), navItem("avatar")], "avatarWrap"), navItem("username"), navBranch("medal", uiText("nativeThemeCapabilities.NATIVE_VISUAL_NAVIGATION.items6"), [navItem("medalName"), navItem("medalLevel")], "medal"), navBranch("badges", uiText("nativeThemeCapabilities.NATIVE_VISUAL_NAVIGATION.items7"), [navItem("guardBadge"), navItem("anchorBadge"), navItem("adminBadge")], "badges"), navItem("honor"), navItem("rank")] },
  { id: "content", label: uiText("nativeThemeCapabilities.NATIVE_VISUAL_NAVIGATION.label3"), defaultExpanded: true, items: [navItem("content"), navItem("message"), navItem("action"), navItem("timestamp"), navItem("eventIcon"), navItem("activityStatus"), navItem("systemTitle"), navItem("systemDetail"), navBranch("quantity",uiText("nativeThemeCapabilities.NATIVE_VISUAL_NAVIGATION.items8"),[navItem("quantityPrefix"),navItem("quantityNumber"),navItem("quantityUnit")]), navItem("price", ["price", "priceUnit", "priceValue"], uiText("nativeThemeCapabilities.NATIVE_VISUAL_NAVIGATION.items9"))] },
  { id: "emote", label: uiText("nativeThemeCapabilities.NATIVE_VISUAL_NAVIGATION.label4"), defaultExpanded: true, items: ["inlineEmote", "bigEmote", "bannerEmote"].map(id => navItem(id as NativeSemanticPartId)) },
  { id: "danmaku", label: uiText("nativeThemeCapabilities.NATIVE_VISUAL_NAVIGATION.label5"), defaultExpanded: false, event: "danmaku", items: [navItem("deletedStatus"), navItem("reply"), navItem("repeatCount")] },
  { id: "gift", label: uiText("nativeThemeCapabilities.NATIVE_VISUAL_NAVIGATION.label6"), defaultExpanded: false, event: "gift", items: [navItem("giftImage"), navBranch("giftGroup", uiText("nativeThemeCapabilities.NATIVE_VISUAL_NAVIGATION.items10"), [navItem("giftName"), navItem("giftCount")], "giftGroup"), navItem("giftPrice"), navItem("blindGiftImage"), navBranch("blindGiftGroup", uiText("nativeThemeCapabilities.NATIVE_VISUAL_NAVIGATION.items11"), [ navItem("blindGiftName"), navItem("blindGiftCount"), navBranch("giftProfit", uiText("nativeThemeCapabilities.NATIVE_VISUAL_NAVIGATION.items12"), [navItem("giftProfitPositive"), navItem("giftProfitNegative")], "giftProfit"), navItem("giftSourcePrice")], "blindGiftGroup")] },
  { id: "superchat", label: uiText("nativeThemeCapabilities.NATIVE_VISUAL_NAVIGATION.label7"), defaultExpanded: false, event: "superchat", items: [navItem("message"), navItem("price", ["price", "priceUnit", "priceValue"], uiText("nativeThemeCapabilities.NATIVE_VISUAL_NAVIGATION.items9")), navItem("translation"), navItem("deletedStatus")] },
  { id: "guard", label: uiText("nativeThemeCapabilities.NATIVE_VISUAL_NAVIGATION.label8"), defaultExpanded: false, event: "guard", items: [navBranch("guardContent", uiText("nativeThemeCapabilities.NATIVE_VISUAL_NAVIGATION.items13"), [navItem("guardName"), navBranch("guardDuration", uiText("nativeThemeCapabilities.NATIVE_VISUAL_NAVIGATION.items14"), [navItem("guardDurationPrefix"), navItem("guardDurationNumber"), navItem("guardDurationUnit")], "guardDuration")], "guardContent"), navBranch("guardDays", uiText("nativeThemeCapabilities.NATIVE_VISUAL_NAVIGATION.items15"), [navItem("guardDaysPrefix"), navItem("guardDaysNumber"), navItem("guardDaysUnit")], "guardDays"), navItem("guardHighlight"), navItem("honorHeading"),navItem("honorSummary"),navItem("honorMilestone"), navItem("honorWatermark"), navItem("price")] },
  { id: "lotteryRedpocket", label: uiText("nativeThemeCapabilities.NATIVE_VISUAL_NAVIGATION.label9"), defaultExpanded: false, items: [
    navBranch("redpocketGroup", uiText("nativeThemeCapabilities.NATIVE_VISUAL_NAVIGATION.items16"), [navItem("redpocketName"), navBranch("redpocketAwards", uiText("nativeThemeCapabilities.NATIVE_VISUAL_NAVIGATION.items17"), [navItem("redpocketAwardsPrefix"), navItem("redpocketCount")], "redpocketAwards"), navBranch("redpocketCommand", uiText("nativeThemeCapabilities.NATIVE_VISUAL_NAVIGATION.items18"), [navItem("redpocketCommandPrefix"), navItem("redpocketCommandText")], "redpocketCommand"), navItem("redpocketWait"), { ...navItem("activityStatus"), event: "redpocketStart" }], "redpocketGroup", "redpocket"),
    navBranch("lotteryGroup", uiText("nativeThemeCapabilities.NATIVE_VISUAL_NAVIGATION.items19"), [navItem("lotteryPrize"), navItem("lotteryCount"), navBranch("lotteryCommand", uiText("nativeThemeCapabilities.NATIVE_VISUAL_NAVIGATION.items20"), [navItem("lotteryCommandPrefix"), navItem("lotteryCommandText")], "lotteryCommand"), navBranch("lotteryGift", uiText("nativeThemeCapabilities.NATIVE_VISUAL_NAVIGATION.items21"), [navItem("lotteryGiftPrefix"), navItem("lotteryGiftName")], "lotteryGift"), navItem("lotteryWait"), { ...navItem("activityStatus"), event: "lotteryStart" }, navBranch("lotteryRequirement", uiText("nativeThemeCapabilities.NATIVE_VISUAL_NAVIGATION.items22"), [navItem("lotteryRequirementPrefix"), navItem("lotteryRequirementText")], "lotteryRequirement")], "lotteryGroup", "lottery"),
    navBranch("winnerList", uiText("nativeThemeCapabilities.NATIVE_VISUAL_NAVIGATION.items23"), [navItem("resultDescription"), navItem("winnerCount"), navItem("winnerListCount"), navBranch("winnerItems", uiText("nativeThemeCapabilities.NATIVE_VISUAL_NAVIGATION.items24"), [navItem("winnerItem"), navItem("winnerAvatar"), navItem("winnerUser")], "winnerItems"), navItem("winnerToggle")], "winnerList", "all"),
  ] },
] as const));

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

const PROPERTY_SECTION_LABELS: Record<NativePropertyGroup, string> = localized(() => ({
  display: uiText("theme.propertyVisibility"),
  typography: uiText("nativeThemeCapabilities.PROPERTY_SECTION_LABELS.typography"),
  surface: uiText("nativeThemeCapabilities.PROPERTY_SECTION_LABELS.surface"),
  spacing: uiText("nativeThemeCapabilities.PROPERTY_SECTION_LABELS.spacing"),
  border: uiText("nativeThemeCapabilities.PROPERTY_SECTION_LABELS.border"),
  layout: uiText("nativeThemeCapabilities.PROPERTY_SECTION_LABELS.layout"),
  media: uiText("nativeThemeCapabilities.PROPERTY_SECTION_LABELS.media"),
}));

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
