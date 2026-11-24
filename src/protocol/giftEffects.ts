import { getGiftEffectConfig } from "./api.ts"
import type { DanmakuEvent, GuardInfo, GiftInfo, HonorInfo } from "./types.ts"
import { guardHonorEffectId } from "./guardHonor.ts"

/** 可以被项目播放器消费的官方礼物特效资源。 */
export interface GiftEffectResource {
  id: number
  giftIds: number[]
  planPlatforms: number[]
  webMp4: string
  webMp4Json: string
  username?: string
  kind?: "guard"
}

type GiftEffectLookup = Pick<GiftInfo, "id" | "effect" | "effectId">

function numberValue(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function numberList(value: unknown): number[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[|,\s]+/).filter(Boolean)
      : value == null
        ? []
        : [value]
  return Array.from(new Set(values.map(numberValue).filter((item): item is number => item !== null)))
}

/** 只把完整的 Web VAP 资源纳入索引，避免渲染时出现黑底或分屏。 */
export function parseGiftEffectResources(value: unknown, includeUnbound = false): GiftEffectResource[] {
  if (typeof value !== "object" || value === null) return []
  const list = (value as { full_sc_resource?: { conf_list?: unknown } }).full_sc_resource?.conf_list
  if (!Array.isArray(list)) return []

  return list.flatMap((item): GiftEffectResource[] => {
    if (typeof item !== "object" || item === null) return []
    const candidate = item as Record<string, unknown>
    const id = numberValue(candidate.id)
    const giftIds = numberList(candidate.bind_gift_ids)
    const planPlatforms = numberList(candidate.plan_platform)
    const webMp4 = typeof candidate.web_mp4 === "string" ? candidate.web_mp4.trim() : ""
    const webMp4Json = typeof candidate.web_mp4_json === "string" ? candidate.web_mp4_json.trim() : ""
    if (id === null || (!includeUnbound && giftIds.length === 0) || !planPlatforms.includes(2) || !webMp4 || !webMp4Json) return []
    return [{ id, giftIds, planPlatforms, webMp4, webMp4Json }]
  })
}

/** 大航海按消息编号选择；特殊来源也可能引用绑定礼物的官方资源。 */
export function parseGuardEffectResources(value: unknown): GiftEffectResource[] {
  return parseGiftEffectResources(value, true)
}

export function resolveGuardEffect(resources: readonly GiftEffectResource[], guard: GuardInfo, username: string): GiftEffectResource | null {
  const effect = guard.effect
  if (!effect || (effect.blocked && !effect.isSelf)) return null
  if (!effect.isGroup && effect.source === 2 && effect.isSelf) return null
  if (!effect.isGroup && effect.source !== undefined && ![0, 1, 2].includes(effect.source)) return null
  const id = effect.isGroup ? effect.roomGroupEffectId : effect.source === 1 ? effect.roomGiftEffectId : effect.roomEffectId
  const resource = id ? resources.find(resource => resource.id === id) : undefined
  return resource ? {...resource, kind: "guard", username: effect.isGroup ? effect.groupName ?? "" : username} : null
}

export function resolveGuardHonorEffect(resources: readonly GiftEffectResource[], honor: HonorInfo): GiftEffectResource | null {
  const id = guardHonorEffectId(honor)
  const resource = id ? resources.find(resource => resource.id === id) : undefined
  return resource ? { ...resource, kind: "guard" } : null
}

export function isGiftEffectEligible(gift: GiftEffectLookup): boolean {
  return gift.effect === 2
    && gift.effectId !== undefined
    && Number.isSafeInteger(gift.effectId)
    && gift.effectId > 0
    && gift.id > 0
}

export function resolveGiftEffect(
  resources: readonly GiftEffectResource[],
  gift: GiftEffectLookup,
): GiftEffectResource | null {
  if (!isGiftEffectEligible(gift)) return null
  return resources.find((resource) => resource.id === gift.effectId && resource.giftIds.includes(gift.id)) ?? null
}

interface GiftEffectLoaderDependencies {
  getGiftEffectConfig?: typeof getGiftEffectConfig
}

export function createGiftEffectLoader(dependencies: GiftEffectLoaderDependencies = {}) {
  const request = dependencies.getGiftEffectConfig ?? getGiftEffectConfig
  let activeRoomId: number | null = null
  const roomResources = new Map<number, GiftEffectResource[]>()
  const guardResources = new Map<number, GiftEffectResource[]>()
  const loadingRooms = new Map<number, Promise<void>>()

  return {
    loadGiftEffectResources(roomId: number, cookie?: string): Promise<void> {
      activeRoomId = roomId
      if (roomResources.has(roomId)) return Promise.resolve()
      const existing = loadingRooms.get(roomId)
      if (existing) return existing
      const loading = request(roomId, cookie)
        .then((data) => {
          roomResources.set(roomId, parseGiftEffectResources(data))
          guardResources.set(roomId, parseGuardEffectResources(data))
        })
        .catch(() => {
          // 本次失败不缓存，下次连接重试；礼物事件流继续运行。
        })
        .finally(() => {
          loadingRooms.delete(roomId)
        })
      loadingRooms.set(roomId, loading)
      return loading
    },

    getGuardEffect(guard: GuardInfo, username: string, roomId: number | null = activeRoomId): GiftEffectResource | null {
      return resolveGuardEffect(roomId === null ? [] : guardResources.get(roomId) ?? [], guard, username)
    },
    getGuardHonorEffect(honor: HonorInfo, roomId: number | null = activeRoomId): GiftEffectResource | null {
      return resolveGuardHonorEffect(roomId === null ? [] : guardResources.get(roomId) ?? [], honor)
    },
    getGiftEffect(gift: GiftEffectLookup, roomId: number | null = activeRoomId): GiftEffectResource | null {
      const resources = roomId === null ? [] : roomResources.get(roomId) ?? []
      return resolveGiftEffect(resources, gift)
    },
  }
}

const giftEffectLoader = createGiftEffectLoader()

/** 连接前预热官方索引；失败静默，礼物事件流不因此中断。 */
export function loadGiftEffectResources(roomId: number, cookie?: string): Promise<void> {
  return giftEffectLoader.loadGiftEffectResources(roomId, cookie)
}

export function getGiftEffect(gift: GiftEffectLookup, roomId?: number): GiftEffectResource | null {
  return giftEffectLoader.getGiftEffect(gift, roomId)
}

/** 只解析实际事件下发的资源；两类资源分别匹配。 */
export function getEventEffect(event: DanmakuEvent): GiftEffectResource | null {
  if (event.guard) return giftEffectLoader.getGuardEffect(event.guard, event.user?.uname ?? "", event.roomId)
  if (event.honor) return giftEffectLoader.getGuardHonorEffect(event.honor, event.roomId)
  return event.gift ? getGiftEffect(event.gift, event.roomId) : null
}
