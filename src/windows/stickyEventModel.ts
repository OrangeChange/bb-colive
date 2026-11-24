import { MsgType, type DanmakuEvent } from '../protocol/types.ts';
import { activityKey, activityEventKey, type ActivityFacts } from '../events/activityLifecycle.ts';
import { localActivityTime } from '../events/activityTiming.ts';

export type StickyEventSettings = {
  enabled: boolean;
  obsEnabled: boolean;
  position: 'top' | 'bottom';
  giftThreshold: number;
  maxCount: number;
  sort: 'amount' | 'time';
};
export const DEFAULT_STICKY_EVENT_SETTINGS: StickyEventSettings = {
  enabled: false, obsEnabled: true, position: 'top', giftThreshold: 30, maxCount: 20, sort: 'amount',
};
export const STICKY_SNAPSHOT_EVENT = 'event-window:sticky-snapshot';
export type StickyEventCard = { event: DanmakuEvent; amount?: number; startedAt: number; expiresAt: number; occurredAt: number };
export type StickyProjectionEvent = DanmakuEvent & { stickyEnqueuedAt?: number };
const known = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const queuedAt = (event: DanmakuEvent | undefined): number | undefined => {
  const value = (event as StickyProjectionEvent | undefined)?.stickyEnqueuedAt;
  return known(value) ? value : undefined;
};
export function normalizeStickyEventSettings(value: unknown): StickyEventSettings {
  const input = value && typeof value === 'object' ? value as Partial<StickyEventSettings> : {};
  return {
    enabled: input.enabled === true,
    obsEnabled: input.obsEnabled !== false,
    position: input.position === 'bottom' ? 'bottom' : 'top',
    giftThreshold: known(input.giftThreshold) ? input.giftThreshold : 30,
    maxCount: known(input.maxCount) ? Math.min(100, Math.max(1, Math.floor(input.maxCount))) : 20,
    sort: input.sort === 'time' ? 'time' : 'amount',
  };
}
export function stickyEventKey(event: DanmakuEvent): string {
  if ((event.msgType === MsgType.AnchorLotStart || event.msgType === MsgType.RedPocketStart)
    && event.lottery?.id !== undefined) return `${event.msgType}:${event.lottery.id}`;
  return event.dedupe ?? event.comboId ?? event.id;
}
const durationBands = [[1,4],[5,6],[10,10],[15,20],[30,30],[50,60],[100,120],[500,300],[1000,1800],[2000,3600],[5000,7200],[10000,10800],[20000,14400],[Infinity,18000]];
export function stickyGiftDuration(amount: number): number {
  return amount > 0 ? durationBands.find(([upper]) => amount < upper)![1] : 0;
}
export function stickyDisplayAmount(event: DanmakuEvent): number | undefined {
  if (event.msgType === MsgType.Gift) {
    const gift = event.gift;
    if (!gift) return undefined;
    if (gift.blindGiftName) {
      const hit = gift.blindHitPriceRmb ?? gift.priceRmb;
      return known(hit) && known(gift.count) ? Math.round(hit * gift.count * 100) / 100 : undefined;
    }
    const value = gift.totalRmb ?? (known(gift.priceRmb) && known(gift.count) ? gift.priceRmb * gift.count : undefined);
    return known(value) ? value : undefined;
  }
  const value = event.msgType === MsgType.SuperChat ? event.sc?.price
    : event.msgType === MsgType.GuardBuy ? event.guard?.priceRmb
    : event.msgType === MsgType.RedPocketStart && known(event.lottery?.totalPrice) ? event.lottery.totalPrice / 1000 : undefined;
  return known(value) ? value : undefined;
}
export function stickyCandidate(event: DanmakuEvent, settings: StickyEventSettings): StickyEventCard | null {
  if (event.activity?.drawnAt !== undefined || event.activity?.endedAt !== undefined) return null;
  const occurredAt = event.firstOccurredAt ?? event.ts;
  if (!known(occurredAt)) return null;
  let seconds: number | undefined;
  switch (event.msgType) {
    case MsgType.Gift: {
      const gift = event.gift;
      const value = stickyDisplayAmount(event);
      if (!gift || gift.isFree || gift.coinType === 'silver' || !known(value)
        || value <= 0 || value < settings.giftThreshold) return null;
      seconds = stickyGiftDuration(value);
      break;
    }
    case MsgType.GuardBuy:
      if (!known(event.guard?.priceRmb) || event.guard.priceRmb <= 0 || event.guard.priceRmb < settings.giftThreshold) return null;
      seconds = stickyGiftDuration(event.guard.priceRmb); break;
    case MsgType.SuperChat:
      if (event.scDeleted || !known(event.sc?.price) || event.sc.price <= 0 || event.sc.price < settings.giftThreshold) return null;
      seconds = stickyGiftDuration(event.sc.price); break;
    case MsgType.AnchorLotStart: seconds = event.lottery?.maxTime; break;
    case MsgType.RedPocketStart: seconds = event.lottery?.waitTime; break;
    default: return null;
  }
  const timing = event.activity?.timing ?? event.lottery?.timing;
  if ((!known(seconds) || seconds <= 0) && timing?.endsAt === undefined) return null;
  const paid = event.msgType === MsgType.Gift || event.msgType === MsgType.GuardBuy || event.msgType === MsgType.SuperChat;
  const startedAt = paid ? queuedAt(event) ?? occurredAt : occurredAt;
  const deadline = !paid && timing?.endsAt !== undefined ? localActivityTime(timing, timing.endsAt) : startedAt + seconds! * 1000;
  return { event, amount: stickyDisplayAmount(event), startedAt, occurredAt, expiresAt: deadline };
}
export function selectStickyEvents(events: readonly DanmakuEvent[], settings: StickyEventSettings, now: number): StickyEventCard[] {
  if (!settings.enabled) return [];
  const cards = events.flatMap(event => { const card = stickyCandidate(event, settings); return card && card.expiresAt > now ? [card] : []; });
  // 候选保持首次接收顺序；稳定排序在同金额、同时间时保留较晚接收者在前。
  cards.reverse();
  cards.sort((a,b) => {
    const aLottery = a.event.msgType === MsgType.AnchorLotStart;
    const bLottery = b.event.msgType === MsgType.AnchorLotStart;
    if (aLottery !== bLottery) return aLottery ? -1 : 1;
    if (aLottery) return b.occurredAt-a.occurredAt;
    if (settings.sort === 'amount') {
      if (a.amount === undefined && b.amount !== undefined) return 1;
      if (a.amount !== undefined && b.amount === undefined) return -1;
    }
    return (settings.sort === 'amount' && a.amount !== undefined && b.amount !== undefined ? b.amount-a.amount : 0) || b.occurredAt-a.occurredAt;
  });
  return cards.slice(0,settings.maxCount);
}
export function clearStickyEvents(): DanmakuEvent[] { return []; }
export function applyScDeletion<T extends DanmakuEvent>(events: T[], deletion: DanmakuEvent): T[] {
  const ids = new Set(deletion.scDeleteIds ?? []);
  return events.map(event => event.msgType === MsgType.SuperChat && ids.has(event.id) ? { ...event, scDeleted: true } : event);
}
/** 仅保存仍有效的固定候选，不截取显示上限。 */
export function updateStickyEvents(events: readonly DanmakuEvent[], incoming: DanmakuEvent, settings: StickyEventSettings, now: number): DanmakuEvent[] {
  if (!settings.enabled) return [];
  let next = events.filter(event => { const card=stickyCandidate(event,settings); return card && card.expiresAt > now; });
  if (incoming.msgType === MsgType.ScDeleted) {
    const ids=new Set(incoming.scDeleteIds ?? []);
    return next.filter(event => event.msgType !== MsgType.SuperChat || !ids.has(event.id));
  }
  const startType = incoming.msgType === MsgType.AnchorLotAward ? MsgType.AnchorLotStart
    : incoming.msgType === MsgType.RedPocketWinner ? MsgType.RedPocketStart : undefined;
  if (startType !== undefined) return next.filter(event => event.msgType !== startType || incoming.lottery?.id === undefined || event.lottery?.id !== incoming.lottery.id);
  const key=stickyEventKey(incoming);
  const previousIndex=next.findIndex(event=>stickyEventKey(event)===key);
  const previous=next[previousIndex];
  const event: StickyProjectionEvent={
    ...incoming,
    firstOccurredAt:previous?.firstOccurredAt ?? previous?.ts ?? incoming.firstOccurredAt ?? incoming.ts,
    stickyEnqueuedAt:queuedAt(previous) ?? queuedAt(incoming) ?? now,
  };
  const card=stickyCandidate(event,settings);
  if(card && card.expiresAt>now) {
    if(previousIndex>=0) next[previousIndex]=event;
    else next.push(event);
  } else if(previousIndex>=0) next.splice(previousIndex,1);
  return next;
}
/** 主端持有，原生窗口关闭不影响候选；仅由功能关闭、切房或到期清理。 */
export function createStickyProjection() {
  let events: DanmakuEvent[] = [];
  let admissions = new WeakMap<object, number>();
  const deletedScIds = new Set<string>();
  const endedActivities = new Set<string>();
  let settings = { ...DEFAULT_STICKY_EVENT_SETTINGS };
  return {
    configure(next: StickyEventSettings, now: number) { settings = next; events = this.snapshot(now); },
    accept(event: DanmakuEvent, now: number): DanmakuEvent {
      if (event.msgType === MsgType.ScDeleted) {
        for (const id of event.scDeleteIds ?? []) deletedScIds.add(id);
      }
      const activityId = event.lottery?.id;
      if (activityId !== undefined && event.msgType === MsgType.AnchorLotAward) endedActivities.add(`anchor:${activityId}`);
      if (activityId !== undefined && event.msgType === MsgType.RedPocketWinner) endedActivities.add(`red-pocket:${activityId}`);
      if (event.msgType === MsgType.SuperChat && deletedScIds.has(event.id)) return { ...event, scDeleted: true };
      if (activityId !== undefined && event.msgType === MsgType.AnchorLotStart && endedActivities.has(`anchor:${activityId}`)) return event;
      if (activityId !== undefined && event.msgType === MsgType.RedPocketStart && endedActivities.has(`red-pocket:${activityId}`)) return event;
      if (!settings.enabled || !known(now)) return event;
      const previous = events.find(candidate => stickyEventKey(candidate) === stickyEventKey(event));
      const startedAt = admissions.get(event) ?? queuedAt(previous) ?? now;
      const projected: StickyProjectionEvent = {
        ...event,
        firstOccurredAt: previous?.firstOccurredAt ?? previous?.ts ?? event.firstOccurredAt ?? event.ts,
        stickyEnqueuedAt: startedAt,
      };
      if (stickyCandidate(projected, settings)) admissions.set(event, startedAt);
      events = updateStickyEvents(events,projected,settings,now);
      return projected;
    },
    updateActivity(fact: ActivityFacts) {
      const key = activityKey(fact);
      events = events.map(event => activityEventKey(event) === key ? {...event, activity:fact} : event);
    },
    retain(predicate: (event: DanmakuEvent) => boolean) { events = events.filter(predicate); },
    snapshot(now: number): DanmakuEvent[] {
      if (!settings.enabled) { events=[]; return []; }
      events=events.filter(event=> { const card=stickyCandidate(event,settings);return card && card.expiresAt>now; });
      return [...events];
    },
    clear() { events=[]; admissions = new WeakMap(); deletedScIds.clear(); endedActivities.clear(); },
  };
}
