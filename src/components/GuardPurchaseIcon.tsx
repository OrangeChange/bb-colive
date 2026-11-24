import captain from '../assets/events/guard/captain-animate.png';
import captainThousand from '../assets/events/guard/captain-1k.png';
import admiral from '../assets/events/guard/admiral-animate.png';
import admiralThousand from '../assets/events/guard/admiral-1k.png';
import governor from '../assets/events/guard/governor-animate.png';
import governorThousand from '../assets/events/guard/governor-1k.png';
import type { GuardMilestone } from '../protocol/types';
import { EventEffectIcon } from './EventEffectIcon';

const sources = {
  1: [captain, captainThousand],
  2: [admiral, admiralThousand],
  3: [governor, governorThousand],
};

export function GuardPurchaseIcon({level, milestone, onPlayEffect}: {level?: number; milestone?: GuardMilestone; onPlayEffect?: () => void}) {
  if (level !== 1 && level !== 2 && level !== 3) return null;
  return <EventEffectIcon className="event-icon guard-purchase-icon" src={sources[level][milestone === 'thousand' || milestone === 'tenThousand' ? 1 : 0]} label="播放大航海特效" onPlay={onPlayEffect} />;
}
