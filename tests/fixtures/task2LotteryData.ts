import type { DanmakuEvent } from '../../src/protocol/types';
import { getNativeEventSample } from './nativeEventSamples.ts';

export function createLotteryFixtureEvent(index: number, pocket = false): DanmakuEvent | undefined {
  if (index === 359) {
    const event = getNativeEventSample(pocket ? 'pocket-start' : 'lottery-start');
    event.lottery!.requireText = '粉丝牌等级至少5级';
    return event;
  }
  if (index !== 360) return undefined;
  const event = getNativeEventSample(pocket ? 'pocket-result' : 'lottery-result');
  event.lottery!.winners = Array.from({ length: 160 }, (_, i) => ({
    uid: i === 1 ? 'fixture-same-user' : `fixture-winner-${i}`,
    uname: i === 2 ? '' : i === 1 ? '目标用户' : `中奖观众${i}`,
  }));
  event.user = { ...event.lottery!.winners[0], guardLevel: 0 };
  return event;
}
