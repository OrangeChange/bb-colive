import type { HonorInfo } from './types.ts'

/** 月度舰队档位与官方荣耀动画；对应资源画面中的档位文字。 */
export const GUARD_HONOR_TIERS = [
  { count: 100, effectId: 5783 },
  { count: 666, effectId: 5784 },
  { count: 888, effectId: 5786 },
  { count: 1000, effectId: 5787 },
  { count: 1314, effectId: 5782 },
  { count: 2233, effectId: 5788 },
  { count: 5200, effectId: 5789 },
  { count: 10000, effectId: 5790 },
] as const

export function guardHonorThreshold(honor?: HonorInfo): number | undefined {
  const count = honor?.secondLine.match(/<%(\d+)%>/)?.[1]
  return honor?.threshold ?? (count ? Number(count) : undefined)
}

export function guardHonorEffectId(honor: HonorInfo): number | undefined {
  return honor.effectId ?? GUARD_HONOR_TIERS.find(tier => tier.count === guardHonorThreshold(honor))?.effectId
}
