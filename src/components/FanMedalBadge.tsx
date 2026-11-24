import { getFanMedalPalette, FAN_MEDAL_PALETTES } from './fanMedal'
import type { FanMedalInfo } from '../protocol/types'

export function FanMedalBadge({ medal, eventStyle = false }: { medal?: FanMedalInfo; eventStyle?: boolean }) {
  if (!medal?.name) return null
  const palette = getFanMedalPalette(medal.level, medal.isLighted)
  return (
    <span
      className={`fan-medal event-fan-medal inline-flex h-[18px] shrink-0 items-center gap-1 rounded-full border-0 px-1 ${eventStyle ? 'event-type-micro' : 'ui-type-micro'}`}
      data-level={Number.isFinite(medal.level) ? medal.level : undefined}
      data-event-medal-palette={eventStyle ? (medal.isLighted === false ? 'unlit' : FAN_MEDAL_PALETTES.findIndex(item => item.palette === palette)) : undefined}
      style={eventStyle ? undefined : {
        backgroundImage: `linear-gradient(90deg, ${palette.backgroundStart}, ${palette.backgroundEnd})`,
        color: palette.text,
      }}
      aria-label={`粉丝牌：${medal.name} ${medal.level}级`}
    >
      <span className="medal-name">{medal.name}</span>
      <span className="medal-level font-mono" style={eventStyle ? undefined : { color: palette.text }}>{medal.level}</span>
    </span>
  )
}
