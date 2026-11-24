import lottery from '../assets/events/lottery.png';
import redpocket from '../assets/events/redpocket.webp';
import guardRedpocket from '../assets/events/guard-redpocket.webp';
import batteryRedpocket from '../assets/events/battery-redpocket.webp';
import superchat from '../assets/events/superchat.png';

const images = { lottery, redpocket, superchat };

export function NativeEventIcon({ kind, rpType, visible = true }: { kind: keyof typeof images; rpType?: number; visible?: boolean }) {
  if (!visible) return null;
  const src = kind !== 'redpocket' ? images[kind] : rpType === 2 ? guardRedpocket : rpType === 3 || rpType === 5 ? batteryRedpocket : redpocket;
  return <span className={`event-icon native-event-icon${kind === "redpocket" ? rpType === 2 ? " guard-pocket" : rpType === 3 || rpType === 5 ? " battery-pocket" : " standard-pocket" : ""}`} aria-hidden="true">
    <img src={src} alt="" draggable={false} />
  </span>;
}
