import { captureLaplaceNativeGuardEntry } from './nativeGuardEntry.ts';
import { captureLaplaceNativePaidSticky } from './nativePaidStickyFact.ts';
import { readLaplaceActivity } from './activity.ts';
import { paidAmountVisible } from '../paidFilter.mjs';
import { paidEventAmount } from '../../giftThreshold.ts';
import { MsgType } from '../../protocol/eventTypeCodes.ts';
import type { DanmakuEvent, GuardLevel } from '../../protocol/types.ts';
import { admitsLaplaceEvent } from './admission.ts';
import type { LaplaceAdmissionSettings, LaplaceEvent, LaplaceInputRecord, LaplaceInputScope, LaplaceProjectionMode } from './types.ts';

/** Host presentation only; source identity fields pass through unchanged. */
export function laplaceHostElementPresentation<T extends Record<string, unknown>>(settings: T, events: readonly LaplaceEvent[]) {
  const rules: string[] = [];
  const hide = (selector: string) => rules.push(`${selector}{display:none!important}`);
  if (settings.classicElementScope !== true) {
    if (settings.showAvatar === false) hide('.event .avatar-wrap,.event .list-item-wrap img.avatar');
    if (settings.showUsername === false) hide('.event .username,.event .reply-username,.event .gift-receiver-username');
  }
  if (settings.showMedal !== true) hide('.event .fans-medal');
  if (settings.showModBadge === false) hide('.event .mod-badge-wrap');
  if (settings.showAnchorBadge === false) hide('.event .streamer-badge-wrap');
  if (settings.showMedalLightenedOnly !== false) hide('.event .fans-medal-lightened--false,.event .fans-medal-lightened--0');
  if (settings.showMedalCurrentRoomOnly === true) {
    for (const event of events) {
      const current = 'bbHostMedalCurrentRoom' in event ? event.bbHostMedalCurrentRoom
        : Number(event.medal?.room) > 0 ? Number(event.medal.room) === Number(event.origin) : undefined;
      if (current !== true && Number.isFinite(event.origin) && Number.isFinite(event.originIdx)) {
        hide(`.event.origin--${event.origin}.origin-index--${event.originIdx} .fans-medal`);
      }
    }
  }
  return { settings: { ...settings, showMedalLightenedOnly: false }, css: rules.join('\n') };
}

export const toLaplaceGuard = (level: GuardLevel | undefined): number => level ? 4 - level : 0;
const encoded = (value: unknown) => encodeURIComponent(String(value));
export function laplaceSourceIdentity(scope: LaplaceInputScope, sourceMode: string, kind: string, id: string): string {
  return `bb:laplace:bilibili:${sourceMode}:${scope.roomId}:${scope.generation}:${kind}:${encoded(id)}`;
}
/** Normalized total price, not quantity × total. Original Gi duration bands. */
export function laplaceDurationSeconds(price: number): number {
  if (price > 0 && price < 1) return 4;
  const bounds: Array<[number, number, number]> = [[1,5,6],[5,10,10],[10,15,20],[15,30,30],[30,50,60],
    [50,100,120],[100,500,300],[500,1000,1800],[1000,2000,3600],[2000,5000,7200],
    [5000,10000,10800],[10000,20000,14400]];
  for (const [min,max,seconds] of bounds) if (price >= min && price < max) return seconds;
  return price >= 20000 ? 18000 : 30;
}

/** Source facts win. Canonical fallback is deliberately small: fields that BB
 * cannot faithfully restore are reported, never guessed from display text. */
export function projectLaplaceEvent(event: DanmakuEvent, scope: LaplaceInputScope, sequence: number, receivedAt: number): LaplaceInputRecord | null {
  if (event.roomId !== scope.roomId) return null;
  const source = event.laplace;
  const sourceMode = source?.sourceMode ?? 'canonical';
  const sourceCommand = source?.sourceCommand ?? '';
  if (event.isComboUpdate || sourceCommand === 'COMBO_SEND') return null;
  if (source && !source.event && !source.deleteIds) return null;
  const sourceId = String(source?.event?.scId ?? event.id);
  const common: LaplaceEvent = {
    type: '', id: event.id, origin: scope.roomId, originIdx: 0,
    uid: event.user?.uid ?? 0, username: event.user?.uname ?? '', timestamp: event.ts,
    timestampNormalized: Number.isFinite(event.ts) ? event.ts : receivedAt, read: false,
  };
  let projected: LaplaceEvent;
  if (event.msgType === MsgType.ScDeleted || source?.deleteIds) {
    projected = { ...common, type: 'superchat-delete', ids: source?.deleteIds ?? event.scDeleteIds ?? [] };
  } else if (source?.event) {
    projected = { ...common, ...structuredClone(source.event) };
    if (event.user?.avatar) projected.avatar = event.user.avatar;
    if (event.user?.wealthIconUrl) projected.wealthMedalIcon = event.user.wealthIconUrl;
    if (projected.type === 'gift' && event.gift) {
      const gift = event.gift;
      projected.giftAmount = gift.count;
      projected.price = gift.total;
      projected.priceNormalized = gift.coinType === 'gold' ? gift.paymentRmb ?? gift.totalRmb ?? gift.total / 1000 : gift.total / 1000;
      projected.duration = laplaceDurationSeconds(projected.priceNormalized);
      if (!projected.giftIcon) projected.giftIcon = gift.webp || gift.gif || gift.icon || '';
    }
    if (event.msgType === MsgType.Danmu && projected.type === 'message' && Number(event.danmuRepeatCount ?? 0) > 1) {
      projected.message = `${projected.message ?? event.text ?? ''} ×${event.danmuRepeatCount}`;
      projected.hostRepeatCount = event.danmuRepeatCount;
    }
    if (projected.type === 'superchat') projected.deleted = Boolean(projected.deleted || event.scDeleted);
    if (projected.type === 'red-envelope-start' && !Array.isArray(projected.list)) projected.list = [];
    if (projected.type === 'red-envelope-result' && Array.isArray(projected.list)) projected.list = projected.list.map((winner: any) => Array.isArray(winner) ? winner : [winner.uid ?? 0, winner.uname ?? winner.username ?? '', winner.avatar ?? null, winner.giftId ?? winner.gift_id ?? null]);
    if ((projected.type === 'live-warning' || projected.type === 'live-cutoff') && projected.roomId == null) projected.roomId = scope.roomId;
  } else {
    // This path supports native fixture/canonical events with accurate slots.
    // Transport adapter normally supplies the complete original-schema metadata.
    const u = event.user;
    const identity = { avatar: u?.avatar ?? '', ...(u?.wealthIconUrl?{wealthMedalIcon:u.wealthIconUrl}:{}), guardType: toLaplaceGuard(u?.guardLevel),
      userType: u?.isAnchor ? 100 : u?.isAdmin ? 1 : 0, userLvl: u?.userLevel ?? 0,
      userLvlBorder: u?.userLevelBorder ?? 0, currentRank: u?.currentRank ?? 0,
      phoneVerified: u?.phoneVerified, sendType: u?.sendType, wealthMedalLevel: u?.wealthLevel ?? 0,
      medal: { name: u?.medal?.name ?? '', level: u?.medal?.level ?? 0, guardType: toLaplaceGuard(u?.medal?.guardLevel),
        lightened: u?.medal?.isLighted, uid: u?.medal?.anchorUid, type: u?.medal?.type ?? 0, room: 0 } };
    if (event.msgType === MsgType.Danmu) projected = { ...common, ...identity, type: 'message', message: `${event.text ?? ''}${Number(event.danmuRepeatCount ?? 0) > 1 ? ` ×${event.danmuRepeatCount}` : ''}`, ...(Number(event.danmuRepeatCount ?? 0) > 1 ? { hostRepeatCount: event.danmuRepeatCount } : {}),
      reply: event.replyTo ? { uid: event.replyTo.uid, uname: event.replyTo.uname, ...(event.replyTo.avatar?{avatar:event.replyTo.avatar}:{}) } : {},
      ...(event.emoticon ? { emote: { ...event.emoticon, emoticon_unique: event.emoticon.unique } } : {}),
      ...(event.emotes ? { bmotes: structuredClone(event.emotes) } : {}) };
    else if (event.msgType === MsgType.SuperChat && event.sc) projected = { ...common, ...identity, type: 'superchat',
      scId: event.id, price: event.sc.price, priceNormalized: event.sc.price, message: event.sc.message,
      messageTrans: event.sc.trans, transMark: event.sc.trans ? 1 : 0, duration: event.sc.duration, guardBackground: event.sc.guardBackgroundUrl,
      deleted: Boolean(event.scDeleted) };
    else if (event.gift) projected = { ...common, ...identity, type: 'gift',
      price: event.gift.total, priceNormalized: event.gift.total / 1000, duration: laplaceDurationSeconds(event.gift.total / 1000),
      message: event.gift.name, coinType: event.gift.coinType, giftName: event.gift.name, giftId: event.gift.id,
      giftAmount: event.gift.count, giftIcon: event.gift.webp || event.gift.gif || event.gift.icon || '',
      ...(event.gift.blindGiftName ? { blindGift: { name: event.gift.blindGiftName, original_gift_name: event.gift.blindGiftName, gift_action: '开出', gift_tip_price: (event.gift.blindHitPriceRmb ?? event.gift.priceRmb ?? 0) * 1000 }, price: event.gift.paymentRmb ?? event.gift.totalRmb ?? (event.gift.blindPriceRmb ?? 0) * event.gift.count, priceNormalized: event.gift.paymentRmb ?? event.gift.totalRmb ?? (event.gift.blindPriceRmb ?? 0) * event.gift.count, giftPrice: event.gift.blindHitPriceRmb ?? event.gift.priceRmb ?? 0 } : {}) };
    else if (event.msgType === MsgType.GuardBuy && event.guard) { const toastType = toLaplaceGuard(event.guard.level); const toastNames: Record<number, string> = { 1: '总督', 2: '提督', 3: '舰长' }; projected = { ...common, ...identity, type: 'toast', guardType: toastType, toastType, toastName: toastNames[toastType] ?? '大航海', price: event.guard.priceRmb, priceNormalized: event.guard.priceRmb, toastAmount: event.guard.count, toastAmountUnit: event.guard.unit || '月', toastAction: event.guard.action, toastTotalCount: 0, toastId: 0, message: event.text ?? '' }; }
    else if (event.msgType === MsgType.Interact) projected = event.interactKind === 'like'
      ? { ...common, ...identity, type: 'like-click', message: event.text ?? '', action: 0, actionText: event.text ?? '', count: event.likeCount ?? 0 }
      : { ...common, ...identity, type: 'interaction', action: ({ entry: 1, follow: 2, share: 3, specialFollow: 4, mutualFollow: 5 } as Record<string, number>)[event.interactKind ?? ''] ?? 0, actionText: event.text ?? '' };
    else if (event.msgType === MsgType.RedPocketStart) projected = { ...common, ...identity, type: 'red-envelope-start', redEnvelopeId: event.pocket?.lotId ?? event.lottery?.id, price: (event.lottery?.totalPrice ?? 0) / 1000, priceNormalized: (event.lottery?.totalPrice ?? 0) / 1000, duration: event.lottery?.waitTime ?? 0, message: event.pocket?.danmu ?? event.text ?? '', list: (event.lottery?.awards ?? []).map(award => ({ gift_id: award.id, gift_name: award.name, num: award.count })) };
    else if (event.msgType === MsgType.RedPocketWinner) projected = { ...common, ...identity, type: 'red-envelope-result', redEnvelopeId: event.lottery?.id, message: '红包中奖名单', name: event.lottery?.awardName ?? '', list: (event.lottery?.winners ?? []).map((winner: any) => Array.isArray(winner) ? winner : [winner.uid ?? 0, winner.uname ?? winner.username ?? '', winner.avatar ?? null, winner.giftId ?? winner.gift_id ?? null]) };
    else if (event.msgType === MsgType.AnchorLotStart) projected = { ...common, type: 'lottery-start', lotteryId: event.lottery?.id, duration: event.lottery?.maxTime ?? event.lottery?.waitTime ?? 0, message: [event.lottery?.awardName, event.lottery?.danmu].filter(Boolean).join('：'), giftName: event.lottery?.giftName, requirement: event.lottery?.requireText, rewardName: event.lottery?.awardName ?? '', rewardNum: event.lottery?.awardNum ?? 0, messageToJoin: event.lottery?.danmu ?? '' };
    else if (event.msgType === MsgType.AnchorLotAward) projected = { ...common, type: 'lottery-result', message: '天选时刻中奖名单', lotteryId: event.lottery?.id, rewardName: event.lottery?.awardName ?? '', list: event.lottery?.winners ?? [] };
    else if (event.msgType === MsgType.RoomBlock) projected = { ...common, ...identity, type: 'user-block', operator: event.roomBlock?.operator, vaildPeriod: event.roomBlock?.validPeriod, message: event.text ?? '' };
    else if (event.msgType === MsgType.RoomSilent) projected = { ...common, type: event.roomSilent?.action === 'off' ? 'room-mute-off' : 'room-mute-on', message: event.text ?? '' };
    else if (event.msgType === MsgType.RoomChange) projected = { ...common, type: 'room-name-update', roomName: event.stats?.roomTitle ?? '', message: event.stats?.roomTitle ?? event.text ?? '', area: event.stats?.roomArea ?? '', parentArea: event.stats?.roomParentArea ?? '' };
    else if (event.msgType === MsgType.LiveStart) projected = { ...common, type: 'live-start', message: event.text ?? '' };
    else if (event.msgType === MsgType.LiveEnd) projected = { ...common, type: 'live-end', message: event.text ?? '' };
    else if (event.msgType === MsgType.Warning) projected = { ...common, type: 'live-warning', roomId: scope.roomId, message: event.text ?? '' };
    else if (event.msgType === MsgType.CutOff) projected = { ...common, type: 'live-cutoff', roomId: scope.roomId, message: event.text ?? '' };
    else return null;
  }
  if (event.user?.medal && projected.medal) projected.medal = { ...projected.medal, lightened: event.user.medal.isLighted };
  const milestone = event.user?.guardMilestone;
  if (projected.medal && milestone && milestone !== 'unknown') {
    projected.medal = { ...projected.medal, resolvedPerkLevel: milestone === 'tenThousand' ? 3 : milestone === 'thousand' ? 2 : 1 };
  }
  projected.bbHostMedalCurrentRoom = event.user?.medal?.isCurrentRoom ?? null;
  projected.bbPaidAmount = { unit: paidEventAmount(event, "unit"), cumulative: paidEventAmount(event, "cumulative") };
  // Notice remains excluded even if supplied via a manually built canonical event.
  if (projected.type === 'notice') return null;
  let activity = readLaplaceActivity(source, projected.type, event.msgType);
  if (activity.fact && projected.origin !== scope.roomId) activity = { invalid: true };
  const nativeGuardEntryDecision = captureLaplaceNativeGuardEntry(event, projected, scope, sourceMode, sourceCommand);
  const nativePaidSticky = captureLaplaceNativePaidSticky(event, projected, scope, sourceMode);
  const unavailableFields = activity.invalid ? [...(source?.unavailableFields ?? []), 'invalid activity correlation']
    : source?.unavailableFields ?? (source ? undefined : ['original LAPLACE source metadata']);
  return { event: projected, sequence, receivedAt, source: {
    platform: 'bilibili', sourceMode, sourceCommand, sourceEventId: event.id,
    ...(nativeGuardEntryDecision !== undefined ? { nativeGuardEntryDecision } : {}),
    ...(nativePaidSticky !== undefined ? { nativePaidSticky } : {}),
    ...(event.msgType === MsgType.Danmu ? { nativeTextFilterFacts: {
      isDanmu: true as const,
      ...(typeof event.isAutoDanmaku === 'boolean' ? { isAutoDanmaku: event.isAutoDanmaku } : {}),
      ...(typeof event.user?.phoneVerified === 'boolean' ? { phoneVerified: event.user.phoneVerified } : {}),
    } } : {}),
    userIdentity: source?.rawOpenID
      ? `bilibili:open:${scope.roomId}:${encoded(source.rawOpenID)}`
      : `bilibili:uid:${encoded(projected.uid)}`,
    ...(source?.rawOpenID ? { rawOpenID: source.rawOpenID } : {}),
    ...(source?.sourcePhoneVerification ? { sourcePhoneVerification: source.sourcePhoneVerification } : {}),
    ...(source?.phoneVerifiedProvenance ? { phoneVerifiedProvenance: source.phoneVerifiedProvenance } : {}),
    ...(activity.fact ? { activity: { kind: activity.fact.kind, phase: activity.fact.phase,
      identity: laplaceSourceIdentity(scope, sourceMode, activity.fact.kind, activity.fact.id), terminal: false } } : {}),
    ...(projected.type === 'superchat' ? { scIdentity: laplaceSourceIdentity(scope, sourceMode, 'sc', sourceId) } : {}),
    timestampUnit: source?.timestampUnit ?? 'milliseconds', timestampFallback: source?.timestampFallback ?? !Number.isFinite(event.ts),
    unavailableFields: nativePaidSticky === null ? [...(unavailableFields ?? []), 'invalid native paid sticky fact'] : unavailableFields,
  } };
}
export const laplaceQueueDelay = (queueLength: number, rate: number): number =>
  queueLength > 30 || queueLength < 2 || rate > 30 || rate < 2 ? 0 : 900 / queueLength;
export const laplaceEventRate = (currentLength: number, referenceLength: number): number => currentLength - referenceLength;

export function selectLaplaceProjection(
  sourceEvents: readonly LaplaceEvent[], settings: LaplaceAdmissionSettings,
  options: { mode?: LaplaceProjectionMode; now?: number; scrollable?: boolean; stickyPredicate?: (event: LaplaceEvent) => boolean; admit?: (event: LaplaceEvent, settings: LaplaceAdmissionSettings, sourceIndex: number) => boolean } = {},
): { events: LaplaceEvent[]; stickyEvents: LaplaceEvent[]; nextExpiryAt: number | null } {
  const { mode = 'live', now = Date.now(), scrollable = mode === 'design' } = options;
  // Both predefined collections bypass main slicing; only design bypasses
  // setting admission, never product exclusions (EVT04). Static and simulation
  // still apply host admission exactly once. Retained source facts are unchanged.
  const predefined = mode === 'static' || mode === 'design';
  const admitted = sourceEvents.filter((e, sourceIndex) => e.type !== 'notice' && e.type !== 'mvp' && e.type !== 'superchat-delete'
    && (mode === 'design' || (options.admit ?? admitsLaplaceEvent)(e, settings, sourceIndex)));
  // The software minimum is main-list only; sticky uses its own threshold below.
  const main = settings.hostPaidFilter ? admitted.filter(e => paidAmountVisible(e.bbPaidAmount, settings.hostPaidThreshold ?? 0.1, settings.hostPaidMode)) : admitted;
  const events = predefined ? main : main.slice(-(settings.limitEventAmount || 50));
  const candidates = admitted.filter(e => (!options.stickyPredicate || options.stickyPredicate(e)) && (((e.type === 'gift' && e.coinType === 'gold'
    || ['superchat', 'toast', 'red-envelope-start'].includes(e.type))
    && e.priceNormalized! > settings.showGiftStickyAbove!) || e.type === 'lottery-start'));
  const stickyEvents = candidates.filter(e => scrollable || e.timestampNormalized + e.duration! * 1000 >= now)
    .slice(-(settings.limitStickyAmount || 20)).reverse();
  const deadlines = scrollable ? [] : candidates.map(e => e.timestampNormalized + e.duration! * 1000 + 1)
    .filter(deadline => Number.isFinite(deadline) && deadline > now);
  return { events, stickyEvents, nextExpiryAt: deadlines.length ? Math.min(...deadlines) : null };
}
