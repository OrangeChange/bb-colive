import { MsgType, MsgTypeName, type DanmakuEvent, type GiftKind, type InteractKind } from "../protocol/types.ts";
import { isPaidEventVisibleAtThreshold, type GiftThresholdMode } from "../giftThreshold.ts";
import { buildEventContentText } from "./eventContentText.ts";
import { shouldShowAutoDanmaku, shouldShowPhoneNotVerified } from "../eventDisplaySettings.ts";
import { DEFAULT_AUDIENCE_FILTERS, isAllowedByAudienceFilters, type AudienceFilterSettings } from "./audienceFilters.ts";

export { isGiftVisibleAtThreshold } from "../giftThreshold.ts";

export type Pane = "left" | "right" | "danmu" | "interact" | "gift" | "superChat" | "guard";
export type LeftFilterKey = "danmu" | "interact";
export type RightFilterKey = "gift" | "superChat" | "guard";

export interface EventFilterState {
  left: Record<LeftFilterKey, boolean> & { interactKinds: Record<InteractKind, boolean> };
  right: Record<RightFilterKey, boolean> & { giftKinds: Record<GiftKind, boolean> };
}

export interface EventProjection {
  /** 房间、区域和筛选条件的组合；变化后必须重建索引。 */
  scopeKey: string;
  /** 生成索引时源事件数组的长度。现场事件只追加，不删除。 */
  sourceLength: number;
  /** 源事件数组中通过当前筛选的下标。 */
  indices: number[];
  /** 源事件未进入当前投影时的固定原因计数。 */
  filteredByReason: Partial<Record<EventVisibilityReason, number>>;
}

export type EventVisibilityReason =
  | "hidden-event"
  | "auto-danmaku"
  | "phone-not-verified"
  | "only-guard-entry"
  | "query-mismatch"
  | "category-disabled"
  | "subcategory-disabled"
  | "pane-mismatch"
  | "gift-threshold"
  | "audience-filter";

/** 现场附加查询：用户名和文字搜索可以同时生效。 */
export interface EventQuery {
  userId?: string;
  userName?: string;
  text?: string;
}

const GIFT_TYPES = new Set<MsgType>([
  MsgType.Gift,
  MsgType.AnchorLotStart,
  MsgType.AnchorLotAward,
  MsgType.RedPocketStart,
  MsgType.RedPocketWinner,
]);

export const INTERACT_KIND_OPTIONS: readonly { key: InteractKind; label: string }[] = [
  { key: "entry", label: "进房" },
  { key: "follow", label: "关注" },
  { key: "share", label: "分享" },
  { key: "specialFollow", label: "特别关注" },
  { key: "mutualFollow", label: "互相关注" },
  { key: "like", label: "点赞" },
];

export const GIFT_KIND_OPTIONS: readonly { key: GiftKind; label: string }[] = [
  { key: "free", label: "免费礼物" },
  { key: "normal", label: "普通礼物" },
  { key: "blind", label: "盲盒礼物" },
  { key: "redPocket", label: "红包" },
  { key: "anchorLot", label: "天选" },
];

/** PK 作为备选功能暂不进入现场事件流。 */
const PK_HIDDEN = /^(PK_|UNIVERSAL_EVENT_GIFT)/;

export const DEFAULT_EVENT_FILTERS: EventFilterState = {
  left: {
    danmu: true,
    interact: true,
    interactKinds: {
      entry: true,
      follow: true,
      share: true,
      specialFollow: true,
      mutualFollow: true,
      like: true,
    },
  },
  right: {
    gift: true,
    giftKinds: { free: true, normal: true, blind: true, redPocket: true, anchorLot: true },
    superChat: true,
    guard: true,
  },
};

/** 当前所有一级分类和下拉子分类是否都处于启用状态。 */
export function areAllEventCategoriesEnabled(filters: EventFilterState): boolean {
  return filters.left.danmu
    && filters.left.interact
    && INTERACT_KIND_OPTIONS.every(({ key }) => filters.left.interactKinds[key] !== false)
    && filters.right.gift
    && GIFT_KIND_OPTIONS.every(({ key }) => filters.right.giftKinds[key] !== false)
    && filters.right.superChat
    && filters.right.guard;
}

/** 一次性切换现场所有可筛选分类，保留其它筛选条件。 */
export function setAllEventCategories(filters: EventFilterState, enabled: boolean): EventFilterState {
  return {
    ...filters,
    left: {
      ...filters.left,
      danmu: enabled,
      interact: enabled,
      interactKinds: Object.fromEntries(
        INTERACT_KIND_OPTIONS.map(({ key }) => [key, enabled]),
      ) as Record<InteractKind, boolean>,
    },
    right: {
      ...filters.right,
      gift: enabled,
      giftKinds: Object.fromEntries(
        GIFT_KIND_OPTIONS.map(({ key }) => [key, enabled]),
      ) as Record<GiftKind, boolean>,
      superChat: enabled,
      guard: enabled,
    },
  };
}

type PaneFilters = EventFilterState | EventFilterState["left"] | EventFilterState["right"];

function getLeftFilters(filters: PaneFilters): EventFilterState["left"] {
  return "left" in filters ? filters.left : filters as EventFilterState["left"];
}

function getRightFilters(filters: PaneFilters): EventFilterState["right"] {
  return "right" in filters ? filters.right : filters as EventFilterState["right"];
}

function getLegacyInteractKind(event: DanmakuEvent): InteractKind | undefined {
  const text = event.text ?? "";
  if (text.includes("互相关注")) return "mutualFollow";
  if (text.includes("特别关注")) return "specialFollow";
  if (text.includes("点赞")) return "like";
  if (text.includes("关注")) return "follow";
  if (text.includes("分享")) return "share";
  if (text.includes("进入")) return "entry";
  return undefined;
}

export function getInteractKind(event: DanmakuEvent): InteractKind | undefined {
  return event.interactKind ?? getLegacyInteractKind(event);
}

/** 只显示大航海进房时，普通进房是唯一会被额外过滤的互动类型。 */
export function isAllowedByOnlyGuardEntry(ev: DanmakuEvent, onlyGuardEntry: boolean): boolean {
  if (!onlyGuardEntry || ev.msgType !== MsgType.Interact || getInteractKind(ev) !== "entry") return true;
  return (ev.user?.guardLevel ?? 0) > 0;
}

export function getGiftKind(ev: DanmakuEvent): GiftKind | null {
  if (ev.msgType === MsgType.Gift) {
    if (ev.gift?.blindGiftName) return "blind";
    const gift = ev.gift;
    if (gift?.isFree !== undefined) return gift.isFree ? "free" : "normal";
    if (gift?.coinType === "silver") return "free";
    if ((gift?.totalRmb ?? 0) > 0 || (gift?.priceRmb ?? 0) > 0 || (gift?.paymentRmb ?? 0) > 0
      || gift?.coinType === "gold" && (gift.total ?? 0) > 0) return "normal";
    if (gift?.priceRmb === 0) return "free";
    return "normal";
  }
  if (ev.msgType === MsgType.RedPocketStart || ev.msgType === MsgType.RedPocketWinner) return "redPocket";
  if (ev.msgType === MsgType.AnchorLotStart || ev.msgType === MsgType.AnchorLotAward) return "anchorLot";
  return null;
}

export function isHiddenEvent(ev: DanmakuEvent): boolean {
  return ev.msgType === MsgType.CoverAudit || ev.msgType === MsgType.Recall || ev.msgType === MsgType.RedPocketGift || ev.msgType === MsgType.Unknown && PK_HIDDEN.test(ev.text ?? "");
}

function normalizeQueryText(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase() ?? "";
}

/** 组装现场用户能读到的文字字段，搜索不扫描原始报文和图片地址。 */
export function getEventSearchText(ev: DanmakuEvent): string {
  const parts = [
    MsgTypeName[ev.msgType],
    buildEventContentText(ev),
    ev.user?.uname,
    ev.user?.medal?.name,
    ev.user?.guardLevel ? ["", "舰长", "提督", "总督"][ev.user.guardLevel] : undefined,
    ev.user?.isAnchor ? "主播" : undefined,
    ev.user?.isAdmin ? "房管" : undefined,
    ev.gift?.isFree ? "免费" : undefined,
  ];

  switch (ev.msgType) {
    case MsgType.Gift:
      parts.push("送出", ev.gift?.blindGiftName ? "开出" : undefined);
      break;
    case MsgType.SuperChat:
      parts.push("醒目留言", ev.sc?.price == null ? undefined : String(ev.sc.price));
      break;
    case MsgType.GuardBuy:
      parts.push("上舰", "舰长", "提督", "总督");
      break;
    case MsgType.GuardHonor:
      parts.push("大航海荣誉");
      break;
    case MsgType.AnchorLotStart:
      parts.push("天选福袋", "口令", "需送出");
      break;
    case MsgType.AnchorLotAward:
      parts.push("天选开奖", "获得");
      break;
    case MsgType.RedPocketStart:
      parts.push("发出红包", "口令");
      break;
    case MsgType.RedPocketWinner:
      parts.push("红包开奖", "获得");
      break;
    default:
      break;
  }

  return parts.filter((part): part is string => Boolean(part)).join(" ").toLocaleLowerCase();
}

function matchesEventQuery(ev: DanmakuEvent, query: EventQuery): boolean {
  const userId = query.userId?.trim();
  const userName = query.userName?.trim();
  if (userId) {
    if (ev.user?.uid) {
      if (ev.user.uid !== userId) return false;
    } else if (userName && ev.user?.uname !== userName) {
      return false;
    }
  } else if (userName && ev.user?.uname !== userName) {
    return false;
  }

  const text = normalizeQueryText(query.text);
  return !text || getEventSearchText(ev).includes(text);
}

export function isEventVisibleInPane(
  ev: DanmakuEvent,
  pane: Pane,
  filters: PaneFilters,
  giftThreshold = 0,
  query: EventQuery = {},
  giftThresholdMode: GiftThresholdMode = "unit",
  onlyGuardEntry = false,
  showAutoDanmaku = true,
  showPhoneNotVerified = false,
  audienceFilters: AudienceFilterSettings = DEFAULT_AUDIENCE_FILTERS,
  targetRoomId?: number | null,
): boolean {
  return getEventVisibilityReason(ev, pane, filters, giftThreshold, query, giftThresholdMode, onlyGuardEntry, showAutoDanmaku, showPhoneNotVerified, audienceFilters, targetRoomId) === undefined;
}

/** 说明事件没有进入当前面板的固定原因，供投影统计和诊断使用。 */
export function getEventVisibilityReason(
  ev: DanmakuEvent,
  pane: Pane,
  filters: PaneFilters,
  giftThreshold = 0,
  query: EventQuery = {},
  giftThresholdMode: GiftThresholdMode = "unit",
  onlyGuardEntry = false,
  showAutoDanmaku = true,
  showPhoneNotVerified = false,
  audienceFilters: AudienceFilterSettings = DEFAULT_AUDIENCE_FILTERS,
  targetRoomId?: number | null,
): EventVisibilityReason | undefined {
  if (!shouldShowAutoDanmaku(ev, showAutoDanmaku)) return "auto-danmaku";
  if (!shouldShowPhoneNotVerified(ev, showPhoneNotVerified)) return "phone-not-verified";
  if (isHiddenEvent(ev)) return "hidden-event";
  if (!isAllowedByOnlyGuardEntry(ev, onlyGuardEntry)) return "only-guard-entry";
  if (!isAllowedByAudienceFilters(ev, audienceFilters, targetRoomId)) return "audience-filter";
  if (!matchesEventQuery(ev, query)) return "query-mismatch";
  const leftFilters = getLeftFilters(filters);
  const rightFilters = getRightFilters(filters);
  if (pane === "left") {
    if (ev.msgType === MsgType.Danmu) return leftFilters.danmu ? undefined : "category-disabled";
    if (ev.msgType === MsgType.Interact) {
      if (!leftFilters.interact) return "category-disabled";
      const kind = getInteractKind(ev);
      return kind != null && leftFilters.interactKinds?.[kind] === false ? "subcategory-disabled" : undefined;
    }
    return "pane-mismatch";
  }
  if (pane === "right") {
    if (GIFT_TYPES.has(ev.msgType)) {
      if (!rightFilters.gift) return "category-disabled";
      const kind = getGiftKind(ev);
      if (kind != null && rightFilters.giftKinds?.[kind] === false) return "subcategory-disabled";
    } else if (ev.msgType === MsgType.SuperChat) {
      if (!rightFilters.superChat) return "category-disabled";
    } else if (ev.msgType === MsgType.GuardBuy || ev.msgType === MsgType.GuardHonor) {
      if (!rightFilters.guard) return "category-disabled";
    } else {
      return "pane-mismatch";
    }
  }
  if (pane === "danmu") {
    return ev.msgType === MsgType.Danmu
      ? (leftFilters.danmu ? undefined : "category-disabled")
      : "pane-mismatch";
  }
  if (pane === "interact") {
    if (ev.msgType !== MsgType.Interact) return "pane-mismatch";
    if (!leftFilters.interact) return "category-disabled";
    const kind = getInteractKind(ev);
    return kind != null && leftFilters.interactKinds?.[kind] === false ? "subcategory-disabled" : undefined;
  }
  if (pane === "gift") {
    if (!GIFT_TYPES.has(ev.msgType)) return "pane-mismatch";
    if (!rightFilters.gift) return "category-disabled";
    const kind = getGiftKind(ev);
    if (kind != null && rightFilters.giftKinds?.[kind] === false) return "subcategory-disabled";
  } else if (pane === "superChat") {
    if (ev.msgType !== MsgType.SuperChat) return "pane-mismatch";
    if (!rightFilters.superChat) return "category-disabled";
  } else if (pane === "guard") {
    if (ev.msgType !== MsgType.GuardBuy && ev.msgType !== MsgType.GuardHonor) return "pane-mismatch";
    if (!rightFilters.guard) return "category-disabled";
  }
  return !isPaidEventVisibleAtThreshold(ev, giftThreshold, giftThresholdMode)
    ? "gift-threshold"
    : undefined;
}

function getProjectionScopeKey(
  pane: Pane,
  filters: PaneFilters,
  giftThreshold: number,
  roomId: number | null | undefined,
  query: EventQuery,
  giftThresholdMode: GiftThresholdMode,
  onlyGuardEntry: boolean,
  showAutoDanmaku: boolean,
  showPhoneNotVerified: boolean,
  audienceFilters: AudienceFilterSettings,
): string {
  const leftFilters = getLeftFilters(filters);
  const rightFilters = getRightFilters(filters);
  const interactKindsKey = INTERACT_KIND_OPTIONS.map(({ key }) => leftFilters.interactKinds?.[key] === false ? 0 : 1).join("");
  const giftKindsKey = GIFT_KIND_OPTIONS.map(({ key }) => rightFilters.giftKinds?.[key] === false ? 0 : 1).join("");
  const filterKey = pane === "left"
    ? `${leftFilters.danmu ? 1 : 0}${leftFilters.interact ? 1 : 0}${interactKindsKey}`
    : pane === "right"
      ? `${rightFilters.gift ? 1 : 0}${rightFilters.superChat ? 1 : 0}${rightFilters.guard ? 1 : 0}${giftKindsKey}`
      : pane === "danmu"
        ? String(leftFilters.danmu ? 1 : 0)
        : pane === "interact"
          ? `${leftFilters.interact ? 1 : 0}${interactKindsKey}`
          : pane === "gift"
            ? `${rightFilters.gift ? 1 : 0}${giftKindsKey}`
            : pane === "superChat"
              ? `${rightFilters.superChat ? 1 : 0}`
              : `${rightFilters.guard ? 1 : 0}`;
  const queryKey = [query.userId, query.userName, query.text]
    .map((value) => encodeURIComponent(normalizeQueryText(value)))
    .join("|");
  const audienceKey = `${audienceFilters.showCrossRoomEvents ? 1 : 0}:${audienceFilters.minimumWealthLevel}:${audienceFilters.minimumCurrentRoomMedalLevel}`;
  return `${pane}|${roomId ?? "none"}|${filterKey}|${["right", "gift", "superChat", "guard"].includes(pane) ? `${giftThreshold}:${giftThresholdMode}` : ""}|${onlyGuardEntry ? 1 : 0}|${showAutoDanmaku ? 1 : 0}|${showPhoneNotVerified ? 1 : 0}|${audienceKey}|${queryKey}`;
}

/**
 * 现场事件按追加流维护投影：新事件只检查新增尾部，切换房间/筛选时才全量重建。
 * 连接 store 的事件数组只会追加事件或替换已有行，不会在中间插入/删除行。
 */
export function updateEventProjection(
  previous: EventProjection | null,
  events: DanmakuEvent[],
  pane: Pane,
  filters: PaneFilters,
  giftThreshold: number,
  roomId: number | null | undefined,
  query: EventQuery = {},
  giftThresholdMode: GiftThresholdMode = "unit",
  onlyGuardEntry = false,
  showAutoDanmaku = true,
  showPhoneNotVerified = false,
  audienceFilters: AudienceFilterSettings = DEFAULT_AUDIENCE_FILTERS,
): EventProjection {
  const scopeKey = getProjectionScopeKey(pane, filters, giftThreshold, roomId, query, giftThresholdMode, onlyGuardEntry, showAutoDanmaku, showPhoneNotVerified, audienceFilters);
  if (previous?.scopeKey === scopeKey && previous.sourceLength <= events.length) {
    if (previous.sourceLength === events.length) return previous;
    const indices = [...previous.indices];
    const filteredByReason = { ...previous.filteredByReason };
    for (let index = previous.sourceLength; index < events.length; index++) {
      const reason = getEventVisibilityReason(events[index], pane, filters, giftThreshold, query, giftThresholdMode, onlyGuardEntry, showAutoDanmaku, showPhoneNotVerified, audienceFilters, roomId);
      if (reason === undefined) indices.push(index);
      else filteredByReason[reason] = (filteredByReason[reason] ?? 0) + 1;
    }
    return { scopeKey, sourceLength: events.length, indices, filteredByReason };
  }

  const indices: number[] = [];
  const filteredByReason: Partial<Record<EventVisibilityReason, number>> = {};
  for (let index = 0; index < events.length; index++) {
    const reason = getEventVisibilityReason(events[index], pane, filters, giftThreshold, query, giftThresholdMode, onlyGuardEntry, showAutoDanmaku, showPhoneNotVerified, audienceFilters, roomId);
    if (reason === undefined) indices.push(index);
    else filteredByReason[reason] = (filteredByReason[reason] ?? 0) + 1;
  }
  return { scopeKey, sourceLength: events.length, indices, filteredByReason };
}

export function filterEventsForPane(
  events: DanmakuEvent[],
  pane: Pane,
  filters: PaneFilters,
  giftThreshold = 0,
  query: EventQuery = {},
  giftThresholdMode: GiftThresholdMode = "unit",
  onlyGuardEntry = false,
  showAutoDanmaku = true,
  showPhoneNotVerified = false,
  audienceFilters: AudienceFilterSettings = DEFAULT_AUDIENCE_FILTERS,
  targetRoomId?: number | null,
): DanmakuEvent[] {
  return events.filter((ev) => isEventVisibleInPane(ev, pane, filters, giftThreshold, query, giftThresholdMode, onlyGuardEntry, showAutoDanmaku, showPhoneNotVerified, audienceFilters, targetRoomId));
}

/** 仅更新统计，不进入现场或外部输出的消息列表。 */
export function isStatisticsEvent(event: Pick<DanmakuEvent, "msgType">): boolean {
  return event.msgType === MsgType.WatchedChange || event.msgType === MsgType.OnlineRank
    || event.msgType === MsgType.LikeUpdate || event.msgType === MsgType.FansUpdate;
}
