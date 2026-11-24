import { pickPreviewEditorPart } from '../../public/previewEditorHit.mjs';
export const NATIVE_EVENT_SCOPE_SELECTORS: Record<string, string> = {
  all: "", danmaku: ".type-chat", interaction: ".type-interaction", gift: ".type-gift, .type-redpocket, .type-lottery",
  superchat: ".type-superchat", guard: ".type-guard, .type-guard-honor", system: ".type-system:where(:not(.system-cover-audit)), .type-live-status",
  enter: ".interact-entry, .interact-entry-effect", follow: ".interact-follow", share: ".interact-share",
  specialFollow: ".interact-special-follow", mutualFollow: ".interact-mutual-follow", like: ".interact-like",
  free: ".gift-free", normal: ".gift-normal", blind: ".gift-blind", redpocket: ".type-redpocket", lottery: ".type-lottery",
  redpocketStart: ".redpocket-start", redpocketResult: ".redpocket-result", lotteryStart: ".lottery-start", lotteryResult: ".lottery-result",
  liveStatus: ".live-start, .live-end", liveStart: ".live-start", liveEnd: ".live-end", userMute: ".system-user-block", roomMute: ".system-room-silent",
  admin: ".system-admin-change", roomChange: ".system-room-change", coverAudit: ".system-cover-audit",
  warning: ".live-warning, .live-cutoff",
};

export const NATIVE_ROLE_SELECTORS = {
  normal: '.event:not(.guard-level-1, .guard-level-2, .guard-level-3, .streamer, .mod)',
  captain: '.event.guard-level-3',
  admiral: '.event.guard-level-2',
  viceroy: '.event.guard-level-1',
  admin: '.event.mod',
  anchor: '.event.streamer',
} as const;

/** Stable public selectors consumed by the visual editor and user CSS. */
export const NATIVE_PART_SELECTORS = {
  quantityPrefix:".event .quantity-prefix", quantityNumber:".event .quantity-number", quantityUnit:".event .quantity-unit",
  winnerAvatar:".event .winner-avatar", honorHeading:".event .honor-heading > :not(.honor-highlight)", honorSummary:".event .honor-summary > :not(.honor-highlight)", honorMilestone:".event .honor-milestone", systemTitle:".event .system-message-title", systemDetail:".event .system-message-detail",
  card: ".event:not(.event-sticky)", header: ".event > .info, .event > .user, .event > .activity-title, .event > .result-title", activityStatus: ".event .activity-status",
  whole: ".event-area", canvas: ".event-area", list: ".event-list",
  row: ".event-list .event", event: ".event", sticky: ".sticky-area", stickyEvent: ".sticky-area .event.event-sticky", user: ".event .user", identity: ".event .user",
  avatarWrap: ".event .avatar-wrap", avatarPlaceholder: ".event .avatar-placeholder", avatarFrame: ".avatar-frame", avatar: ".event .avatar", username: ".event .username",
  medal: ".event .fan-medal", medalName: ".event .medal-name", medalLevel: ".event .medal-level",
  guardBadge: ".event .guard-badge", anchorBadge: ".event .streamer-badge", adminBadge: ".event .mod-badge",
  honor: ".event .wealth-medal", rank: ".event .rank-badge", badges: ".event .badges",
  reply: ".event .reply", translation: ".bili-translation", message: ".event .message",
  action: ".event .action", content: ".event .content",
  price: ".event .price", priceUnit: ".event .price .price-unit", priceValue: ".event .price .price-value",
  repeatCount: ".event .repeat-count", blindGiftCount: ".event .blind-gift-count",
  timestamp: ".event .time", deletedStatus: ".event .status.deleted", eventIcon: ".event .event-icon", honorWatermark: ".event .honor-icon",
  blindGiftImage: ".event .blind-gift-icon", giftImage: ".event .gift-icon",
  giftCount: ".event .gift-count", giftName: ".event .gift-name", giftPrice: ".event .price.gift-price",
  blindGiftName: ".event .blind-gift-name", giftProfitPositive: ".event .blind-profit.is-gain", giftProfitNegative: ".event .blind-profit.is-loss",
  giftProfit: ".event .blind-profit", giftSourcePrice: ".event .price.blind-price", giftValue: ".event .price.gift-price",
  giftGroup: ".event .gift", blindGiftGroup: ".event .blind-gift", inlineEmote: ".event .inline-emote", bigEmote: ".event .big-emote", bannerEmote: ".event .banner-emote",
  guardDuration: ".event .guard-duration", guardDays: ".event .guard-companion-days", guardName: ".event .guard-name",
  guardDurationPrefix: ".event .guard-duration .prefix", guardDurationNumber: ".event .guard-duration .number", guardDurationUnit: ".event .guard-duration .unit",
  guardDaysPrefix: ".event .guard-companion-days .prefix", guardDaysNumber: ".event .guard-companion-days .number", guardDaysUnit: ".event .guard-companion-days .unit",
  guardContent: ".event .guard", guardHighlight: ".event .honor-highlight:not(.honor-milestone)",
  lotteryPrize: ".event .lottery-name", lotteryCount: ".event .lottery-count", lotteryCommand: ".event .lottery-command",
  lotteryCommandPrefix: ".event .lottery-command .prefix", lotteryCommandText: ".event .lottery-command .text",
  lotteryGiftPrefix: ".event .lottery-required-gift .prefix", lotteryGiftName: ".event .lottery-required-gift .gift-name",
  lotteryRequirementPrefix: ".event .lottery-requirement .prefix", lotteryRequirementText: ".event .lottery-requirement .text",
  redpocketAwardsPrefix: ".event .redpocket-awards > .prefix", redpocketCount: ".event .redpocket-count", resultDescription: ".event .result-description", winnerListCount: ".event .winner-list-count",
  lotteryGift: ".event .lottery-required-gift", lotteryWait: ".event .lottery-wait", lotteryRequirement: ".event .lottery-requirement", lotteryGroup: ".event .lottery",
  redpocketAwards: ".event .redpocket-awards", redpocketCommand: ".event .redpocket-command", redpocketWait: ".event .redpocket-wait",
  redpocketCommandPrefix: ".event .redpocket-command .prefix", redpocketCommandText: ".event .redpocket-command .text",
  redpocketName: ".event .redpocket-name", redpocketGroup: ".event .redpocket",
  winnerCount: ".event .winner-count", winnerUser: ".event .winner-list-item .username", winnerItem: ".event .winner-list-item",
  winnerItems: ".event .winner-list-items", winnerToggle: ".event .winner-list-toggle", winnerList: ".event .winner-list",
} as const;

/** Saved component IDs that address the same public part. */
export const NATIVE_PART_ALIASES = { canvas: "whole", identity: "user", giftValue: "giftPrice" } as const;

export type NativeSemanticPartId = keyof typeof NATIVE_PART_SELECTORS;

function isElementForBoundary(target: EventTarget | null, boundary: Element): target is Element {
  const ElementConstructor = boundary.ownerDocument.defaultView?.Element;
  return Boolean(ElementConstructor && target instanceof ElementConstructor);
}

const PICKABLE_PARTS = (Object.entries(NATIVE_PART_SELECTORS) as [NativeSemanticPartId, string][])
  .filter(([id]) => !(id in NATIVE_PART_ALIASES))
  .sort(([, left], [, right]) => (right.match(/\.[\w-]+/g)?.length ?? 0) - (left.match(/\.[\w-]+/g)?.length ?? 0));

export function nativePartElementFromTarget(target: EventTarget | null, boundary: Element, point?: {x:number;y:number}): { part: NativeSemanticPartId; element: Element } | undefined {
  if (!isElementForBoundary(target, boundary) || !boundary.contains(target)) return undefined;
  const picked = pickPreviewEditorPart(target, Object.fromEntries(PICKABLE_PARTS.map(([part,selector])=>[part,[selector]])), point);
  return picked ? {part:picked.part as NativeSemanticPartId,element:picked.node} : undefined;
}

export function nativePartFromElement(target: EventTarget | null, boundary: Element, point?: {x:number;y:number}): NativeSemanticPartId | undefined {
  return nativePartElementFromTarget(target, boundary, point)?.part;
}

const PRIMARY_EVENT_SCOPES = new Set(["danmaku", "interaction", "gift", "superchat", "guard", "system", "redpocket", "lottery"]);
const PICKABLE_EVENT_SCOPES = Object.entries(NATIVE_EVENT_SCOPE_SELECTORS)
  .filter(([id, selector]) => id !== "all" && Boolean(selector))
  .sort(([leftId, left], [rightId, right]) => {
    const level = Number(PRIMARY_EVENT_SCOPES.has(leftId)) - Number(PRIMARY_EVENT_SCOPES.has(rightId));
    return level || (right.match(/\.[\w-]+/g)?.length ?? 0) - (left.match(/\.[\w-]+/g)?.length ?? 0);
  });

export function resolveNativeEventScope(matches: (selector: string) => boolean): string {
  return PICKABLE_EVENT_SCOPES.find(([, selector]) => matches(selector))?.[0] ?? "all";
}

export function nativeSelectionContextFromElement(
  target: EventTarget | null,
  boundary: Element,
  identityPriority: readonly string[],
  point?: {x:number;y:number},
): { part: NativeSemanticPartId; event: string; identity: string } | undefined {
  const part = nativePartFromElement(target, boundary, point);
  if (!part || !isElementForBoundary(target, boundary)) return undefined;
  if (part === "whole" || part === "list" || part === "sticky") return { part, event: "all", identity: "all" };
  const eventElement = target.closest(".event");
  if (!eventElement || !boundary.contains(eventElement)) return { part, event: "all", identity: "all" };
  const event = resolveNativeEventScope(selector => eventElement.matches(selector));
  const identity = identityPriority.find(id => id !== "normal" && NATIVE_ROLE_SELECTORS[id as keyof typeof NATIVE_ROLE_SELECTORS] && eventElement.matches(NATIVE_ROLE_SELECTORS[id as keyof typeof NATIVE_ROLE_SELECTORS]))
    ?? (eventElement.matches(NATIVE_ROLE_SELECTORS.normal) ? "ordinary" : "all");
  return { part, event, identity };
}
