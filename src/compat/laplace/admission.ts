import type { LaplaceAdmissionSettings, LaplaceEvent } from './types.ts';

const RENDERED_TYPES = new Set(['message', 'effect-message', 'interaction', 'like-click', 'gift', 'superchat',
  'toast', 'red-envelope-start', 'red-envelope-result', 'lottery-start', 'lottery-result',
  'system', 'user-block', 'live-start', 'live', 'preparing', 'live-end', 'live-warning',
  'live-cutoff', 'room-name-update', 'room-mute-on', 'room-mute-off']);

/** Pinned Vc/obs_admission; approved changes: no notice or MVP, and guard-only applies
 * to action=1 alone. Never coerce sendType or phoneVerified into invented facts. */
export function admitsLaplaceEvent(e: LaplaceEvent, o: LaplaceAdmissionSettings): boolean {
  if (e.type === 'notice' || e.type === 'mvp') return false;
  if (e.type === 'message' && (o.showDanmaku === false
    || typeof e.sendType === 'number' && e.sendType !== 0 && o.showAutoDanmaku !== true
    || !o.showPhoneNotVerified && !e.phoneVerified)) return false;
  if (e.type === 'interaction' && (!o.showEnterEvent && e.action === 1
    || o.showEnterEventCurrentGuardOnly && e.action === 1 && e.guardType! < 1
    || !o.showFollowEvent && [2, 3, 4, 5].includes(e.action))) return false;
  if (e.type === 'like-click' && !o.showFollowEvent) return false;
  if (e.type === 'gift' && (o.showGift === false || !o.showGiftFree && e.coinType === 'silver'
    || !o.hostPaidFilter && e.price! / 1000 < o.showGiftPriceAbove!)) return false;
  if (e.type === 'superchat' && (o.showSuperChat === false || !o.hostPaidFilter && e.priceNormalized! < o.showGiftPriceAbove!)) return false;
  if (e.type === 'toast' && (o.showToast === false || !o.hostPaidFilter && e.priceNormalized! < o.showGiftPriceAbove!)) return false;
  if (['red-envelope-start', 'red-envelope-result'].includes(e.type)
    && (o.showRedEnvelop === false || !o.hostPaidFilter && e.type === 'red-envelope-start' && e.priceNormalized! < o.showGiftPriceAbove!)) return false;
  if (['lottery-start', 'lottery-result'].includes(e.type) && o.showLottery === false) return false;
  if (e.type === 'effect-message' && o.showDanmaku === false) return false;
  if (['entry-effect', 'superchat-delete', 'watched-update', 'online-update', 'online-rank-update',
    'likes-update', 'room-meta-update', 'message-recall'].includes(e.type)) return false;
  if (['live-start', 'live'].includes(e.type) && (!e.initial || o.showSystemMessage !== true)) return false;
  if (['system', 'user-block', 'preparing', 'live-end', 'live-warning', 'live-cutoff',
    'room-name-update', 'room-mute-on', 'room-mute-off'].includes(e.type) && !o.showSystemMessage) return false;
  // Only implemented dispatch branches are renderable, never unknown=>message.
  return RENDERED_TYPES.has(e.type);
}
