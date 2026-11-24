import { MsgType, type DanmakuEvent } from '../protocol/types.ts';
import { createActivityLifecycle } from '../events/activityLifecycle.ts';

/** 固定预览以共同画布时钟演示原始样例的持续时长。 */
export function projectNativePreviewActivities(events: readonly DanmakuEvent[], now: number, fixed: boolean): DanmakuEvent[] {
  const lifecycle = createActivityLifecycle();
  const projected = events.map(event => {
    const duration = event.msgType === MsgType.AnchorLotStart ? event.lottery?.maxTime
      : event.msgType === MsgType.RedPocketStart ? event.lottery?.waitTime : undefined;
    let row = event;
    if (fixed && duration !== undefined && event.lottery) {
      row = {...event, activity: undefined, lottery: {...event.lottery, timing: {
        observedAt: now, serverNow: event.ts, endsAt: event.ts + duration * 1000, source:'start-duration',
      }}};
    }
    lifecycle.accept(row);
    return row;
  });
  return projected.map(row => lifecycle.project(row));
}
