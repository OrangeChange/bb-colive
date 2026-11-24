import hundred from '../assets/events/guard-honor/100.png';
import six from '../assets/events/guard-honor/666.png';
import eight from '../assets/events/guard-honor/888.png';
import thousand from '../assets/events/guard-honor/1000.png';
import love from '../assets/events/guard-honor/1314.png';
import twins from '../assets/events/guard-honor/2233.png';
import five from '../assets/events/guard-honor/5200.png';
import tenThousand from '../assets/events/guard-honor/10000.png';
import type { HonorInfo } from '../protocol/types';
import { guardHonorThreshold } from '../protocol/guardHonor';
import { EventEffectIcon } from './EventEffectIcon';

const medals: Record<number, string> = {100: hundred, 666: six, 888: eight, 1000: thousand, 1314: love, 2233: twins, 5200: five, 10000: tenThousand};

export function GuardHonorWatermark({ honor, onPlayEffect }: { honor?: HonorInfo; onPlayEffect?: () => void }) {
  const threshold = guardHonorThreshold(honor);
  const src = threshold === undefined ? undefined : medals[threshold];
  if (src) return <EventEffectIcon className="event-icon honor-icon" src={src} label="播放大航海成就特效" onPlay={onPlayEffect} />;
  return <svg className="event-icon honor-icon" viewBox="0 0 96 96" fill="none" aria-hidden="true">
    <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M36 10A40 40 0 0 0 10 36M10 60a40 40 0 0 0 26 26M60 86a40 40 0 0 0 26-26M86 36A40 40 0 0 0 60 10" strokeWidth="3" />
      <path d="m48 3 4 9-4 9-4-9Z" fill="currentColor" stroke="none" />
      <path d="m3 48 7-3 7 3-7 3Zm76 0 7-3 7 3-7 3Z" fill="currentColor" stroke="none" />
      <circle cx="48" cy="29" r="6" strokeWidth="5.25" />
      <path d="M48 35v39M35 43h26M25 55c0 12 10 22 23 25 13-3 23-13 23-25" strokeWidth="6" />
      <path d="m20 62 5-9 9 5M62 58l9-5 5 9" strokeWidth="5.25" />
      <path d="M28 88c7-4 13-4 20 0 7-4 13-4 20 0" strokeWidth="3" />
    </g>
  </svg>;
}
