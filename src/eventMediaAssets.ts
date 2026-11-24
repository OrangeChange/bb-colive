import type { DanmakuUser } from './protocol/types';
import { publicGuardLevel } from './events/publicEventStyle';

export const DEFAULT_AVATAR_PATH = '/media/noface.gif';
export const GIFT_FALLBACK_PATH = '/laplace/gifts/gift-fallback.png';
export const BLIND_BOX_FALLBACK_PATH = '/media/blind-box-fallback.webp';

export function guardAvatarFramePath(user?: Pick<DanmakuUser, 'guardLevel' | 'guardMilestone'>): string | null {
  if (!user || user.guardLevel <= 0) return null;
  const suffix = user.guardMilestone === 'tenThousand' ? '-10k'
    : user.guardMilestone === 'thousand' ? '-1k' : '';
  return `/laplace/guard-icons/frame-${publicGuardLevel(user.guardLevel)}${suffix}.png`;
}
