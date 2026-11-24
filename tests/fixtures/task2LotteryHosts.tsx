import { EventRow } from '../../src/components/EventRow';
import { createLotteryFixtureEvent } from './task2LotteryData';
import { getNativeEventSample } from './nativeEventSamples';

export function Task2LotteryHosts() {
  const result = createLotteryFixtureEvent(360)!;
  const empty = getNativeEventSample('lottery-result'); empty.lottery!.winners = [];
  const single = getNativeEventSample('pocket-result'); single.lottery!.winners = [{ uid: 'single-winner', uname: '单人中奖' }];
  return <section data-task2-hosts>
    <h2>阶段2宿主边界</h2>
    <div className="event-area live" data-style-api="1" data-task2-host="no-filter">
      <h3>现场无筛选回调</h3><div className="event-list">
        {[result, single, empty].map((ev, index) => <EventRow key={index} ev={ev} liveLayout allowWinnerExpansion animateOnMount={false} />)}
      </div>
    </div>
    {(['window-chat', 'window-pay'] as const).map(context => <div key={context} className={`event-area window ${context}`} data-style-api="1" data-task2-host={context}>
      <h3>{context === 'window-chat' ? '弹幕窗' : '礼物窗'}</h3>
      <div className="event-list"><EventRow ev={result} liveLayout animateOnMount={false} />
        <EventRow ev={createLotteryFixtureEvent(359)!} liveLayout animateOnMount={false} /></div>
    </div>)}
  </section>;
}
