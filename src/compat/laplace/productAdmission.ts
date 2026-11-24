import { admitsLaplaceEvent } from './admission.ts';
import { assertLaplaceProductEventSettings, type LaplaceProductEventSettings, type LaplaceV2ProductEventSettings, type LaplaceSystemChild, type LaplaceProductEventInput, type LaplaceGiftChild, type LaplaceInteractionChild } from './productEventSettings.ts';
import type { LaplaceAdmissionSettings, LaplaceEvent } from './types.ts';

const actions: Readonly<Record<number, LaplaceInteractionChild>> = { 1: 'entry', 2: 'follow', 3: 'share', 4: 'specialFollow', 5: 'mutualFollow' };
/** Product intent only; facts are never rewritten, unknown actions remain unknown. */
export function allowsProductInteraction(event: LaplaceEvent, settings: LaplaceProductEventInput): boolean {
  assertLaplaceProductEventSettings(settings);
  if (event.type !== 'interaction' && event.type !== 'like-click') return true;
  if (!settings.interactions.enabled) return false;
  const key = event.type === 'like-click' ? 'like' : typeof event.action === 'number' ? actions[event.action] : undefined;
  return key ? settings.interactions.children[key] : true;
}
/** Neutralize only the two legacy aggregate flags; memoize at consumer boundaries. */
export function productLaplaceSourceSettings<T extends LaplaceAdmissionSettings>(settings: T): T {
  return { ...settings, showEnterEvent: true, showFollowEvent: true };
}
/** v2 product consumers own gift visibility, without changing frozen source defaults. */
export function productLaplaceGiftSourceSettings<T extends LaplaceAdmissionSettings>(settings: T): T {
  return { ...productLaplaceSourceSettings(settings), showGift: true, showGiftFree: true, showRedEnvelop: true, showLottery: true };
}
export function classifyProductGift(event: LaplaceEvent): LaplaceGiftChild | 'unclassified' | null {
  if (event.type === 'red-envelope-start' || event.type === 'red-envelope-result') return 'redEnvelope';
  if (event.type === 'lottery-start' || event.type === 'lottery-result') return 'lottery';
  if (event.type !== 'gift') return null;
  if (event.coinType === 'silver') return 'free';
  if (event.blindGift !== null && typeof event.blindGift === 'object' && !Array.isArray(event.blindGift)) return 'blind';
  if (event.coinType === 'gold' && Object.prototype.hasOwnProperty.call(event, 'blindGift') && event.blindGift === null) return 'normal';
  return 'unclassified';
}
export function allowsProductGift(event: LaplaceEvent, settings: LaplaceV2ProductEventSettings | LaplaceProductEventSettings): boolean {
  assertLaplaceProductEventSettings(settings);
  const key = classifyProductGift(event);
  if (key === null) return true;
  if (!settings.gifts.enabled) return false;
  const children = settings.gifts.children;
  return key === 'unclassified' ? children.free || children.normal || children.blind : children[key];
}
/** Exact supported source dispatch types only; generic system and aliases stay unclassified. */
export function classifyProductSystem(event: LaplaceEvent): LaplaceSystemChild | null {
  switch (event.type) {
    case 'live-start': case 'live-end': return 'live';
    case 'user-block': return 'userMute';
    case 'room-mute-on': case 'room-mute-off': return 'roomMute';
    case 'room-name-update': return 'roomChange';
    case 'live-warning': case 'live-cutoff': return 'warning';
    default: return null;
  }
}
export function allowsProductEvent(event: LaplaceEvent, settings: LaplaceProductEventInput): boolean {
  assertLaplaceProductEventSettings(settings);
  const system = classifyProductSystem(event);
  return allowsProductInteraction(event, settings) && (settings.version === 1 || allowsProductGift(event, settings))
    && (settings.version !== 3 || system === null || settings.systems.children[system]);
}
export function admitsLaplaceProductEvent(event: LaplaceEvent, settings: LaplaceAdmissionSettings, product: LaplaceProductEventInput): boolean {
  assertLaplaceProductEventSettings(product);
  return allowsProductEvent(event, product) && admitsLaplaceEvent(event,
    (product.version === 2 || product.version === 3) ? productLaplaceGiftSourceSettings(settings) : productLaplaceSourceSettings(settings));
}
