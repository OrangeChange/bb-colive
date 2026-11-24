import { createStylePreviewEvents, type PreviewEventKind } from '../components/stylePreviewEvents.ts';
import { getDanmuContentKey } from '../windows/danmuMerge.ts';
import { MsgType, type DanmakuEvent } from '../protocol/types.ts';

export interface PreviewUser { id: string; name: string; avatar: string }
export interface NativePreviewRepetition { key: string; event: DanmakuEvent; occurrences: number }
export interface PreviewGenerationContext<T> {
  candidates: readonly T[];
  random: () => number;
  now: () => number;
  sequence: number;
  session: string;
  events?: readonly DanmakuEvent[];
  repetitions?: NativePreviewRepetition[];
}
const recordedEvents = createStylePreviewEvents('混合流');
export const PREVIEW_USERS: readonly PreviewUser[] = [...new Map(recordedEvents.flatMap(event => event.user ? [[event.user.uid, { id: event.user.uid, name: event.user.uname, avatar: event.user.avatar ?? '/media/noface.gif' }] as const] : [])).values()];
export function pickPreviewUser<T>(users: readonly T[], random: () => number): T | null {
  return users.length ? users[Math.floor(random() * users.length)] : null;
}
const kinds: PreviewEventKind[] = ['弹幕', '互动', '礼物', '红包/天选', '醒目留言', '大航海', '系统'];
export function nativePreviewCandidates(kind: PreviewEventKind): DanmakuEvent[] {
  return (kind === '混合流' ? kinds.flatMap(createStylePreviewEvents) : createStylePreviewEvents(kind))
    .filter(event => !event.danmuDeleted && !event.scDeleted);
}
function category(event: DanmakuEvent) {
  if ([MsgType.GuardBuy, MsgType.GuardHonor].includes(event.msgType)) return 'guard';
  if ([MsgType.RedPocketStart, MsgType.AnchorLotStart, MsgType.RedPocketWinner, MsgType.AnchorLotAward].includes(event.msgType)) return 'lottery';
  return [MsgType.Danmu, MsgType.Interact, MsgType.Gift, MsgType.SuperChat].includes(event.msgType) ? String(event.msgType) : 'system';
}
function uncompletedStart(type: MsgType, events: readonly DanmakuEvent[] = []) {
  const completed = new Set(events.filter(event => event.msgType === type).map(event => event.lottery?.id));
  return [...events].reverse().find(event => event.msgType === (type === MsgType.RedPocketWinner ? MsgType.RedPocketStart : MsgType.AnchorLotStart) && !completed.has(event.lottery?.id));
}
export function eligibleNativePreviewCandidates(candidates: readonly DanmakuEvent[], events: readonly DanmakuEvent[] = []) {
  return candidates.filter(event => ![MsgType.RedPocketWinner, MsgType.AnchorLotAward].includes(event.msgType) || uncompletedStart(event.msgType, events));
}
function repetitionKey(event: DanmakuEvent): string | null {
  if (event.msgType === MsgType.Danmu) return getDanmuContentKey(event);
  if (event.msgType !== MsgType.Gift || !event.gift || event.gift.isFree || event.gift.coinType === 'silver') return null;
  return `gift:${event.user?.uid}:${event.gift.id}:${event.gift.blindGiftName ?? ''}`;
}
export function nextNativePreviewEvent(context: PreviewGenerationContext<DanmakuEvent>): DanmakuEvent | null {
  const { random, now, sequence, session } = context;
  const timestamp = now();
  const repetitions = context.repetitions ?? [];
  for (let index = repetitions.length - 1; index >= 0; index--) {
    if (timestamp - repetitions[index].event.ts > 8000) repetitions.splice(index, 1);
  }
  const candidates = eligibleNativePreviewCandidates(context.candidates, context.events);
  const available = repetitions.filter(group => group.occurrences < 3 && repetitionKey(group.event) !== null && candidates.some(candidate => repetitionKey(candidate) === group.key));
  const repeated = available.length && random() < 0.15 ? pickPreviewUser(available, random) : null;
  const fresh = candidates.filter(candidate => !repetitions.some(group => group.key === (repetitionKey(candidate) ?? `source:${candidate.id}`)));
  const selected = repeated ? null : pickPreviewUser([...new Set(fresh.map(category))], random);
  const sample = repeated?.event ?? (selected === null ? null : pickPreviewUser(fresh.filter(event => category(event) === selected), random));
  if (!sample) return null;
  const event = structuredClone(sample);
  event.id = `preview:${session}:${sequence}`;
  event.ts = timestamp;
  delete event.firstOccurredAt;
  delete event.danmuRepeatCount;
  delete event.annotationIdentity;
  delete event.reactKey;
  delete event.dedupe;
  if (event.gift) {
    delete event.isComboUpdate;
    delete event.comboFinalized;
    if (repeated && !event.gift.blindGiftName) {
      const unitPrice = (event.gift.priceRmb ?? 0) > 0
        ? event.gift.priceRmb!
        : (event.gift.totalRmb ?? 0) / event.gift.count;
      event.gift.count = 1;
      event.gift.priceRmb = unitPrice;
      event.gift.price = unitPrice * 1000;
      event.gift.total = event.gift.price;
      event.gift.totalRmb = unitPrice;
      event.gift.paymentRmb = event.gift.totalRmb;
    }
    if (!repeated) event.comboId = `preview-combo:${session}:${sequence}`;
  }
  if (event.lottery && (event.msgType === MsgType.AnchorLotStart || event.msgType === MsgType.RedPocketStart)) {
    const seconds = event.msgType === MsgType.AnchorLotStart ? event.lottery.maxTime : event.lottery.waitTime;
    if (seconds !== undefined) event.lottery.timing = { observedAt:event.ts, endsAt:event.ts + seconds * 1000, source:'start-duration' };
    delete event.activity;
  }
  if (event.pocket) event.pocket.lotId = sequence;
  if (event.lottery) event.lottery.id = sequence;
  if ([MsgType.RedPocketWinner, MsgType.AnchorLotAward].includes(event.msgType) && event.lottery) {
    const start = uncompletedStart(event.msgType, context.events)!;
    event.lottery.id = start.lottery?.id ?? start.pocket?.lotId;
    event.lottery.awardName = start.lottery?.awardName || event.lottery.awardName;
    event.lottery.winners = event.lottery.winners?.map(winner => ({ ...winner, awardName: event.lottery!.awardName }));
  }
  const key = repetitionKey(event) ?? `source:${sample.id}`;
  if (repeated) { repeated.occurrences++; repeated.event = event; }
  else repetitions.push({ key, event, occurrences: 1 });
  return event;
}
