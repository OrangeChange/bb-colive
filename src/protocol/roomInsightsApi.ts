import { biliGet, encWbi, getNav, keyFromUrl } from './api'
import {
  normalizeContribution, normalizeGuardPage, normalizeOverview, guardSortType,
  type RawContribution, type RawGuardPage, type RawRoomOverview, type GuardSort,
} from './roomInsights'

const LIVE_API = 'https://api.live.bilibili.com'

export async function getRoomOverview(roomId: number, cookie: string, signal?: AbortSignal) {
  const nav = await getNav(cookie)
  signal?.throwIfAborted()
  const query = encWbi({ room_id: String(roomId), web_location: '444.8' },
    keyFromUrl(nav.wbi_img.img_url), keyFromUrl(nav.wbi_img.sub_url), Math.floor(Date.now() / 1000))
  const data = await biliGet<RawRoomOverview>(`${LIVE_API}/xlive/web-room/v1/index/getInfoByRoom?${query}`, cookie, signal)
  if (!data.room_info?.uid || data.room_info.room_id !== roomId) throw new Error('房间概览暂不可用，请重试')
  return normalizeOverview(data)
}

export async function getContributionRank(roomId: number, uid: number, cookie: string, signal?: AbortSignal) {
  const query = new URLSearchParams({ room_id: String(roomId), ruid: String(uid), page: '1', page_size: '100', type: 'online_rank', switch: 'contribution_rank', platform: 'web' })
  return normalizeContribution(await biliGet<RawContribution>(`${LIVE_API}/xlive/general-interface/v1/rank/queryContributionRank?${query}`, cookie, signal), uid)
}

export async function getGuardPage(roomId: number, uid: number, page: number, cookie: string, signal?: AbortSignal, sort: GuardSort = 'intimacy') {
  const query = new URLSearchParams({ roomid: String(roomId), ruid: String(uid), page: String(page), page_size: '20', typ: guardSortType(sort), platform: 'web' })
  return normalizeGuardPage(await biliGet<RawGuardPage>(`${LIVE_API}/xlive/app-room/v2/guardTab/topListNew?${query}`, cookie, signal), uid)
}
