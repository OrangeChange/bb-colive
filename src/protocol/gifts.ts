/**
 * 礼物图标缓存（临时诊断/盲盒图标支持）：
 * SEND_GIFT 报文的 gift_info 只带爆出物图标，盲盒本体（blind_gift.original_gift_id）
 * 图标不在报文里。每个房间连接建立时拉一次全量礼物配置（giftPanel/giftConfig，900+ 条），
 * 之后同步查 Map。
 *
 * - loadGiftConfig()：连接建立时按房间调用（失败静默，盲盒退化为无图）
 * - getGiftIcon(giftId)：同步查询，未加载/未命中返回 undefined
 */
import { getGiftConfig } from './api'

export interface GiftIconInfo {
  icon?: string
  webp?: string
  gif?: string
  effect?: number
  effectId?: number
  hasImagedGift?: number
}

const cache = new Map<number, GiftIconInfo>()
const loadedRooms = new Set<number>()
const loadingRooms = new Map<number, Promise<void>>()

/** 拉取当前房间礼物配置进缓存。已加载/加载中不重复拉；失败静默并保留已有缓存。 */
export function loadGiftConfig(roomId: number, cookie?: string): Promise<void> {
  if (loadedRooms.has(roomId)) return Promise.resolve()
  const existing = loadingRooms.get(roomId)
  if (existing) return existing
  const loading = getGiftConfig(roomId, cookie)
    .then(data => {
      for (const g of data?.list ?? []) {
        if (g?.id && (g.webp || g.gif || g.img_basic || g.effect_id)) {
          cache.set(g.id, {
            icon: g.img_basic,
            webp: g.webp,
            gif: g.gif,
            effect: g.effect,
            effectId: g.effect_id,
            hasImagedGift: g.has_imaged_gift,
          })
        }
      }
    })
    .catch(() => { /* 静默：盲盒图标退化为文字标注 */ })
    .finally(() => {
      loadedRooms.add(roomId)
      loadingRooms.delete(roomId)
    })
  loadingRooms.set(roomId, loading)
  return loading
}

/** 同步查礼物图标（缓存未就绪或未命中返回 undefined） */
export function getGiftIcon(giftId: number): GiftIconInfo | undefined {
  return cache.get(giftId)
}
