import { MsgType, type ActivityTiming, type DanmakuEvent } from '../protocol/types.ts';
import { localActivityTime } from './activityTiming.ts';

export interface ActivityFacts {
  roomId: number;
  kind: 'anchor' | 'red-pocket';
  activityId: number;
  observedAt: number;
  timing?: ActivityTiming;
  endedAt?: number;
  drawnAt?: number;
}
export type ActivityState = 'scheduled' | 'running' | 'awaiting-result' | 'drawn' | 'unknown';
export const activityKey = (fact: Pick<ActivityFacts, 'roomId' | 'kind' | 'activityId'>) => `${fact.roomId}:${fact.kind}:${fact.activityId}`;
export function activityEventKey(event: DanmakuEvent): string | undefined {
  const id = event.lottery?.id ?? event.pocket?.lotId;
  const kind = event.msgType === MsgType.AnchorLotStart || event.msgType === MsgType.AnchorLotAward ? 'anchor'
    : event.msgType === MsgType.RedPocketStart || event.msgType === MsgType.RedPocketWinner ? 'red-pocket' : undefined;
  return id === undefined || !kind ? undefined : activityKey({roomId: event.roomId, kind, activityId: id});
}
export function activityFactFromMessage(message: {cmd?: string; data?: {id?: number}}, roomId: number, observedAt = Date.now()): ActivityFacts | undefined {
  if (message.cmd?.split(':')[0] !== 'ANCHOR_LOT_END' || message.data?.id === undefined) return undefined;
  return {roomId, kind: 'anchor', activityId: message.data.id, observedAt, endedAt: observedAt};
}
export function createActivityLifecycle() {
  const facts = new Map<string, ActivityFacts>();
  return {
    get: (key: string) => facts.get(key),
    snapshot: () => [...facts.values()],
    clear: () => facts.clear(),
    acceptFact(incoming: ActivityFacts): ActivityFacts {
      const key = activityKey(incoming), previous = facts.get(key);
      const timing = incoming.timing;
      const newer = timing && (previous?.timing?.source !== 'end-time' || timing.source === 'end-time') && (!previous?.timing || timing.source === 'end-time' && previous.timing.source !== 'end-time' || (
        timing.serverNow !== undefined && previous.timing.serverNow !== undefined
          ? timing.serverNow > previous.timing.serverNow
          : timing.observedAt > previous.timing.observedAt && timing.endsAt !== previous.timing.endsAt
            && !(timing.source === 'remaining' && previous.timing.source === 'remaining'
              && timing.serverNow === undefined && previous.timing.serverNow === undefined
              && (timing.endsAt ?? 0) - timing.observedAt === (previous.timing.endsAt ?? 0) - previous.timing.observedAt)
      ));
      const next: ActivityFacts = {...incoming, ...previous,
        observedAt: Math.max(previous?.observedAt ?? 0, incoming.observedAt),
        timing: newer ? timing : previous?.timing ?? timing,
        endedAt: previous?.endedAt ?? incoming.endedAt,
        drawnAt: previous?.drawnAt ?? incoming.drawnAt};
      if (previous && next.timing === previous.timing && next.endedAt === previous.endedAt && next.drawnAt === previous.drawnAt) return previous;
      facts.set(key, next);
      return next;
    },
    accept(event: DanmakuEvent): ActivityFacts | undefined {
      const key = activityEventKey(event);
      if (!key) return undefined;
      if (event.activity) this.acceptFact(event.activity);
      const result = event.msgType === MsgType.AnchorLotAward || event.msgType === MsgType.RedPocketWinner;
      return this.acceptFact({roomId:event.roomId, kind:key.includes(':anchor:')?'anchor':'red-pocket',
        activityId:event.lottery?.id ?? event.pocket!.lotId,
        observedAt:event.lottery?.timing?.observedAt ?? event.ts,
        timing:event.lottery?.timing, ...(result?{drawnAt:event.ts}:{})});
    },
    project<T extends DanmakuEvent>(event: T): T {
      const key = activityEventKey(event), activity = key ? facts.get(key) : undefined;
      return activity && event.activity !== activity ? {...event, activity} : event;
    },
  };
}
export function activityPresentation(fact: ActivityFacts | undefined, now: number): {state:ActivityState; label:string; remainingSeconds?:number} {
  if (fact?.drawnAt !== undefined) return {state:'drawn',label:'已开奖'};
  if (fact?.endedAt !== undefined) return {state:'awaiting-result',label:'等待开奖'};
  const timing = fact?.timing;
  if (!timing || timing.endsAt === undefined) return {state:'unknown',label:''};
  if (timing.startsAt !== undefined && localActivityTime(timing,timing.startsAt)>now) return {state:'scheduled',label:'待开始'};
  const remainingSeconds=Math.max(0,Math.ceil((localActivityTime(timing,timing.endsAt)-now)/1000));
  if (!remainingSeconds) return {state:'awaiting-result',label:'等待开奖',remainingSeconds};
  const hours=Math.floor(remainingSeconds/3600), minutes=Math.floor(remainingSeconds/60)%60, seconds=remainingSeconds%60;
  return {state:'running',remainingSeconds,label:`${hours?`${hours}:`:''}${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`};
}
