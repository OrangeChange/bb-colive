import { FanMedalProfile } from './FanMedalProfile'
import { useUiLanguage } from '../i18n/react'
import { uiText } from '../i18n'
import { getFanMedalPalette, FAN_MEDAL_PALETTES } from './fanMedal'
import type { FanMedalInfo } from '../protocol/types'

export function FanMedalBadge({ medal, eventStyle = false, interactive = false }: { medal?: FanMedalInfo; eventStyle?: boolean; interactive?: boolean }) {
  useUiLanguage();
  if (!medal?.name) return null
  const palette = getFanMedalPalette(medal.level, medal.isLighted)
  const badge = (
    <span
      className={`fan-medal event-fan-medal inline-flex h-[18px] shrink-0 items-center gap-1 rounded-full border-0 px-1 ${eventStyle ? 'event-type-micro' : 'ui-type-micro'}${interactive ? ' cursor-pointer focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2' : ''}`}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? e => e.stopPropagation() : undefined}
      onKeyDown={interactive ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); e.currentTarget.click(); } } : undefined}
      data-level={Number.isFinite(medal.level) ? medal.level : undefined}
      data-event-medal-palette={eventStyle ? (medal.isLighted === false ? 'unlit' : FAN_MEDAL_PALETTES.findIndex(item => item.palette === palette)) : undefined}
      style={eventStyle ? undefined : {
        backgroundImage: `linear-gradient(90deg, ${palette.backgroundStart}, ${palette.backgroundEnd})`,
        color: palette.text,
      }}
      aria-label={uiText('fanMedalProfile.badge', { name: medal.name, level: medal.level })}
    >
      <span className="medal-name">{medal.name}</span>
      <span className="medal-level font-mono" style={eventStyle ? undefined : { color: palette.text }}>{medal.level}</span>
    </span>
  )
  return interactive ? <FanMedalProfile medal={medal}>{badge}</FanMedalProfile> : badge;
}
