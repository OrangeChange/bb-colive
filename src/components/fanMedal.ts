/**
 * 粉丝牌固定色阶。
 *
 * 颜色来自当前 B 站页面样本与本地真实直播报文交叉核对后的固定值。
 * 不读取服务端动态颜色，避免同一等级在不同事件或不同时间出现视觉漂移。
 */
export interface FanMedalPalette {
  backgroundStart: string
  backgroundEnd: string
  text: string
  level: string
}

export const UNLIT_FAN_MEDAL_PALETTE: FanMedalPalette = {
  backgroundStart: '#919298CC',
  backgroundEnd: '#919298CC',
  text: '#FFFFFFFF',
  level: '#919298E6',
}

export const FAN_MEDAL_PALETTES: ReadonlyArray<{
  min: number
  max: number
  palette: FanMedalPalette
}> = [
  { min: 1, max: 10, palette: { backgroundStart: '#5762A799', backgroundEnd: '#5762A799', text: '#FFFFFFFF', level: '#5762A7E6' } },
  { min: 11, max: 20, palette: { backgroundStart: '#C770A499', backgroundEnd: '#C770A499', text: '#FFFFFFFF', level: '#C770A4E6' } },
  { min: 21, max: 30, palette: { backgroundStart: '#3FB4F699', backgroundEnd: '#3FB4F699', text: '#FFFFFFFF', level: '#3FB4F6E6' } },
  { min: 31, max: 40, palette: { backgroundStart: '#4C7DFF99', backgroundEnd: '#4C7DFF99', text: '#FFFFFFFF', level: '#4C7DFFE6' } },
  { min: 41, max: 50, palette: { backgroundStart: '#A773F199', backgroundEnd: '#A773F199', text: '#FFFFFFFF', level: '#A773F1E6' } },
  { min: 51, max: 60, palette: { backgroundStart: '#EC4F6E99', backgroundEnd: '#EC4F6E99', text: '#FFFFFFFF', level: '#EC4F6EE6' } },
  { min: 61, max: Number.POSITIVE_INFINITY, palette: { backgroundStart: '#F5832FCC', backgroundEnd: '#F5832FCC', text: '#FFFFFFFF', level: '#F5832FE6' } },
]

export function getFanMedalPalette(level: number, isLighted?: boolean): FanMedalPalette {
  if (isLighted === false) return UNLIT_FAN_MEDAL_PALETTE
  const normalizedLevel = Math.max(1, Number(level) || 1)
  return FAN_MEDAL_PALETTES.find(({ min, max }) => normalizedLevel >= min && normalizedLevel <= max)?.palette
    ?? FAN_MEDAL_PALETTES[FAN_MEDAL_PALETTES.length - 1].palette
}
