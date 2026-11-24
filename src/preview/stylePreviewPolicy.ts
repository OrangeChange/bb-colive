import { DEFAULT_EVENT_DISPLAY_PREFERENCES, type EventDisplayPreferences } from "../eventDisplaySettings.ts";
import { DEFAULT_EVENT_FILTERS, isAllowedByOnlyGuardEntry, isEventVisibleInPane, type EventFilterState } from "../events/eventView.ts";
import { isAllowedByAudienceFilters, DEFAULT_AUDIENCE_FILTERS, type AudienceFilterSettings } from "../events/audienceFilters.ts";
import { isPaidEventVisibleAtThreshold, type GiftThresholdMode } from "../giftThreshold.ts";
import { MsgType, type DanmakuEvent, type GuardLevel } from "../protocol/types.ts";
import { DEFAULT_STICKY_EVENT_SETTINGS, applyScDeletion, updateStickyEvents, selectStickyEvents, stickyCandidate, type StickyEventSettings } from "../windows/stickyEventModel.ts";
import { isEventExpired, type EventExpirySettings } from "../windows/windowEventExpiry.ts";
import { sceneCategoryFilters } from '../themes/themeEventVisibility.ts';

export interface StylePreviewPolicySettings {
  previewEventKinds?: readonly string[];
  mergeSameDanmu: boolean;
  sameDanmuWindowSeconds: number;
  displayPreferences: EventDisplayPreferences;
  filters: EventFilterState;
  windowFilters?: EventFilterState["left"];
  audienceFilters?: AudienceFilterSettings;
  targetRoomId?: number;
  giftThreshold: number;
  giftThresholdMode: GiftThresholdMode;
  stickySettings: StickyEventSettings;
  capacity: number;
  expiry: EventExpirySettings;
}
export const DEFAULT_STYLE_PREVIEW_POLICY: StylePreviewPolicySettings = {
  mergeSameDanmu: false, sameDanmuWindowSeconds: 8,
  displayPreferences: DEFAULT_EVENT_DISPLAY_PREFERENCES, filters: DEFAULT_EVENT_FILTERS,
  giftThreshold: 0.1, giftThresholdMode: "unit", stickySettings: DEFAULT_STICKY_EVENT_SETTINGS,
  capacity: 50, expiry: { enabled: false, seconds: 10 },
};
export interface StylePreviewPolicyOptions {
  target: "live" | "windows" | "obs";
  mode: "static" | "design" | "simulation";
  displayAll: boolean;
  now: number;
}
export function stylePreviewAnimation(settings: StylePreviewPolicySettings) {
  return { preset: settings.displayPreferences.eventAnimationPreset, durationMs: settings.displayPreferences.eventAnimationDurationMs };
}
export function scopeStylePreviewSample(event: DanmakuEvent, targetRoomId?: number): DanmakuEvent {
  return targetRoomId && targetRoomId > 0 ? { ...event, roomId: targetRoomId } : event;
}
export function admitsStylePreviewEvent(event: DanmakuEvent, settings: StylePreviewPolicySettings, options: StylePreviewPolicyOptions, paid = true) {
  if (event.msgType === MsgType.RedPocketGift || event.msgType === MsgType.CoverAudit) return false;
  const selected = settings.previewEventKinds;
  if (selected?.length) {
    const kind = event.msgType === MsgType.Danmu ? '弹幕'
      : [MsgType.Interact, MsgType.EntryEffect].includes(event.msgType) ? '互动'
      : event.msgType === MsgType.Gift ? '礼物'
      : event.msgType === MsgType.SuperChat || event.msgType === MsgType.ScDeleted ? '醒目留言'
      : [MsgType.GuardBuy, MsgType.GuardHonor].includes(event.msgType) ? '大航海'
      : [MsgType.AnchorLotStart, MsgType.AnchorLotAward, MsgType.RedPocketStart, MsgType.RedPocketWinner].includes(event.msgType) ? '红包/天选' : '系统';
    if (!selected.includes(kind)) return false;
  }
  if (paid && !isPaidEventVisibleAtThreshold(event, settings.giftThreshold, settings.giftThresholdMode)) return false;
  if (options.displayAll) return true;
  const filters = options.target === 'live' ? settings.filters : options.target === 'obs' ? DEFAULT_EVENT_FILTERS : (() => {
    const categories = sceneCategoryFilters(settings.filters);
    return { ...categories, left: { ...categories.left,
      danmu: categories.left.danmu && settings.windowFilters?.danmu !== false,
      interact: categories.left.interact && settings.windowFilters?.interact !== false,
    } };
  })();
  const pane = event.msgType === MsgType.Danmu || event.msgType === MsgType.Interact ? "left" : "right";
  const prefs = settings.displayPreferences;
  const targetRoomId = event.roomId > 0 ? settings.targetRoomId : undefined;
  // 系统通知沿用来源支持范围；已识别的公共类别使用原生准入。
  return isAllowedByAudienceFilters(event, settings.audienceFilters ?? DEFAULT_AUDIENCE_FILTERS, targetRoomId)
    && isAllowedByOnlyGuardEntry(event, prefs.onlyGuardEntry)
    && (![MsgType.Danmu, MsgType.Interact, MsgType.Gift, MsgType.SuperChat, MsgType.GuardBuy, MsgType.GuardHonor, MsgType.RedPocketStart, MsgType.RedPocketWinner, MsgType.AnchorLotStart, MsgType.AnchorLotAward].includes(event.msgType) || isEventVisibleInPane(event, pane, filters,
    0, {}, settings.giftThresholdMode, prefs.onlyGuardEntry, prefs.showAutoDanmaku,
    prefs.showPhoneNotVerified, settings.audienceFilters, targetRoomId))
    && (!paid || isPaidEventVisibleAtThreshold(event, settings.giftThreshold, settings.giftThresholdMode));
}
export function selectStylePreviewEvents(events: readonly DanmakuEvent[], settings: StylePreviewPolicySettings, options: StylePreviewPolicyOptions, previousRetired: ReadonlySet<string> = new Set()) {
  const fixed = options.mode !== "simulation";
  let controlled = [...events];
  for (const deletion of events) if (deletion.msgType === MsgType.ScDeleted) controlled = applyScDeletion(controlled, deletion);
  const admitted = controlled.filter(event => admitsStylePreviewEvent(event, settings, options, false));
  const eligibleMain = admitted.filter(event => event.msgType !== MsgType.ScDeleted && isPaidEventVisibleAtThreshold(event, settings.giftThreshold, settings.giftThresholdMode));
  let main = eligibleMain;
  const inputIds = new Set(events.map(event => event.id));
  const retiredMainIds = new Set([...previousRetired].filter(id => inputIds.has(id)));
  if (!fixed && options.target !== "live") {
    const eligible = main.filter(event => !retiredMainIds.has(event.id));
    main = eligible.filter(event => !isEventExpired(event.firstOccurredAt ?? event.ts, options.now, settings.expiry)).slice(-settings.capacity);
    const visible = new Set(main.map(event => event.id));
    for (const event of eligible) if (!visible.has(event.id)) retiredMainIds.add(event.id);
  }
  const stickySettings = { ...settings.stickySettings,
    enabled: options.target !== "live" && (options.displayAll || (options.target === "obs" ? settings.stickySettings.obsEnabled : settings.stickySettings.enabled)),
  };
  // 固定样例只豁免寿命，数量和排序仍由置顶设置负责。
  let dynamicSticky: DanmakuEvent[] = [];
  if (!fixed) for (const event of admitted) dynamicSticky = updateStickyEvents(dynamicSticky, event, stickySettings, event.firstOccurredAt ?? event.ts);
  const stickyInput = fixed || options.displayAll ? eligibleMain.map(event => {
    const activity = [MsgType.AnchorLotStart, MsgType.RedPocketStart].includes(event.msgType);
    const candidate = activity && event.lottery && (fixed || options.displayAll) ? { ...event, activity: undefined, lottery: {...event.lottery, timing:undefined, maxTime:event.lottery?.maxTime ?? 1, waitTime:event.lottery?.waitTime ?? 1} } : event;
    const card = stickyCandidate(candidate, stickySettings);
    return card ? { ...candidate, stickyEnqueuedAt: options.now, ...(event.lottery ? { ts: options.now, firstOccurredAt: options.now } : {}) } : event;
  }) : dynamicSticky;
  const sticky = selectStickyEvents(stickyInput, stickySettings, options.now).map(card => ({ ...card, event: admitted.find(event => event.id === card.event.id) ?? card.event }));
  return { events: main, sticky, retiredMainIds };
}

export type SourcePreviewRecord = { method?: unknown; payload?: Record<string, any>; data?: Record<string, any>; receivedAt?: unknown; sequence?: number; [key: string]: unknown };
const number = (value: unknown): number | undefined => typeof value === "number" && Number.isFinite(value) ? value : undefined;
/** 只投影公共准入与置顶所需的事实；渲染继续使用原始来源字段。 */
export function projectSourcePreviewFact(record: SourcePreviewRecord, source: "blivechat" | "blivechat-open" | "laplace"): DanmakuEvent {
  const p = record.payload ?? record.data ?? record;
  const laplace = source === "laplace";
  const kind = laplace ? p.type : record.method;
  const types: Record<string, MsgType> = { onAddText: MsgType.Danmu, message: MsgType.Danmu, "effect-message": MsgType.Danmu,
    onAddGift: MsgType.Gift, gift: MsgType.Gift, onAddMember: MsgType.GuardBuy, toast: MsgType.GuardBuy,
    onAddSuperChat: MsgType.SuperChat, superchat: MsgType.SuperChat, onDelSuperChat: MsgType.ScDeleted, "superchat-delete": MsgType.ScDeleted, onAddLike: MsgType.Interact,
    "like-click": MsgType.Interact, interaction: MsgType.Interact, "entry-effect": MsgType.Interact,
    "red-envelope-start": MsgType.RedPocketStart, "red-envelope-result": MsgType.RedPocketWinner,
    "lottery-start": MsgType.AnchorLotStart, "lottery-result": MsgType.AnchorLotAward };
  const ts = laplace ? number(p.timestampNormalized) ?? number(p.timestamp) : number(record.receivedAt) ?? number(p.time) ?? (number(p.timestamp) === undefined ? undefined : p.timestamp * 1000);
  const phone = laplace ? p.phoneVerified : p.isMobileVerified;
  const event: DanmakuEvent = { id: String(p.id ?? record.sequence ?? ""), roomId: number(p.origin) ?? number(p.roomId) ?? 0,
    ts: ts ?? 0, msgType: types[String(kind)] ?? MsgType.Unknown,
    user: { uid: String(p.uid ?? ""), uname: String(p.username ?? p.authorName ?? ""),
      guardLevel: (laplace ? p.guardType > 0 ? 4 - p.guardType : 0 : p.privilegeType > 0 ? 4 - p.privilegeType : 0) as GuardLevel,
      ...(typeof phone === "boolean" || laplace && (phone === 0 || phone === 1) ? { phoneVerified: Boolean(phone) } : {}),
      ...(number(p.wealthMedalLevel) !== undefined ? { wealthLevel: p.wealthMedalLevel } : {}),
    },
    ...(typeof p.isGiftDanmaku === "boolean" ? { isAutoDanmaku: p.isGiftDanmaku } : laplace && number(p.sendType) !== undefined ? { isAutoDanmaku: p.sendType !== 0 } : {}),
  };
  const medalLevel = number(laplace ? p.medal?.level : p.medalLevel);
  if (medalLevel !== undefined) {
    const room = number(p.medal?.room), origin = number(p.origin);
    const current = typeof p.isCurrentRoom === "boolean" ? p.isCurrentRoom : laplace && room !== undefined && room > 0 && origin !== undefined && origin > 0 ? room === origin : undefined;
    event.user!.medal = { name: String(laplace ? p.medal?.name ?? "" : p.medalName ?? ""), level: medalLevel, ...(current === undefined ? {} : { isCurrentRoom: current }) };
  }
  if (event.msgType === MsgType.Interact) event.interactKind = kind === "onAddLike" || kind === "like-click" ? "like" : kind === "entry-effect" ? "entry" : ({1:"entry",2:"follow",3:"share",4:"specialFollow",5:"mutualFollow"} as const)[p.action as 1];
  if (event.interactKind === "like") event.likeCount = number(p.likeCount);
  const count = number(laplace ? p.giftAmount ?? p.toastAmount : p.num);
  if (event.msgType === MsgType.Gift) {
    const total = p.coinType === "silver" ? 0 : laplace ? number(p.priceNormalized) : number(p.totalCoin) === undefined ? number(p.price) : p.totalCoin / 1000;
    const unit = total !== undefined && count !== undefined && count > 0 ? total / count : undefined;
    const blind = laplace ? p.blindGift?.original_gift_name ?? p.blindGift?.name : p.blindGiftName;
    const blindUnit = number(p.blindPaidPrice);
    event.gift = { id: number(p.giftId) ?? 0, name: String(p.giftName ?? ""), count: count ?? 1,
      price: unit === undefined ? NaN : unit * 1000, total: total === undefined ? NaN : total * 1000,
      coinType: p.coinType ?? (total === 0 ? "silver" : "gold"), priceRmb: unit, totalRmb: total,
      paymentRmb: blind ? blindUnit === undefined ? laplace ? total : undefined : blindUnit * (count ?? 1) : total,
      ...(blind ? { blindGiftName: String(blind), blindPriceRmb: blindUnit ?? (laplace ? unit : undefined), blindHitPriceRmb: number(p.blindHitPrice) ?? number(p.giftPrice) } : {}),
    };
  }
  if (event.msgType === MsgType.GuardBuy) {
    const total = laplace ? number(p.priceNormalized) : number(p.totalCoin) === undefined ? number(p.price) : p.totalCoin / 1000;
    event.guard = { ...(event.user!.guardLevel ? { level: event.user!.guardLevel } : laplace && [1, 2, 3].includes(p.toastType) ? { level: 4 - p.toastType } : {}), count: count ?? 1, priceRmb: total } as DanmakuEvent["guard"];
  }
  if (event.msgType === MsgType.ScDeleted && Array.isArray(p.ids)) event.scDeleteIds = p.ids.map(String);
  if (event.msgType === MsgType.SuperChat) event.scDeleted = p.deleted === true;
  if (event.msgType === MsgType.SuperChat) event.sc = { price: number(p.priceNormalized) ?? number(p.price) ?? NaN, message: String(p.message ?? p.content ?? ""), duration: number(p.duration) ?? 0 };
  if ([MsgType.AnchorLotStart, MsgType.RedPocketStart, MsgType.AnchorLotAward, MsgType.RedPocketWinner].includes(event.msgType)) event.lottery = { id: number(p.lotteryId ?? p.redEnvelopeId), awardName: String(p.rewardName ?? ""), maxTime: number(p.duration), waitTime: number(p.duration), awardNum: number(p.rewardNum) ?? 0, ...(number(p.priceNormalized) === undefined ? {} : {totalPrice:p.priceNormalized * 1000}) };
  return event;
}
