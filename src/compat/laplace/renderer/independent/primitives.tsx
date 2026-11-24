import { Fragment, useContext, useState, type ReactNode, type CSSProperties } from 'react';
// @ts-expect-error Shared host-owned settings and media resolution.
import { LaplaceRenderContext, defaultOptions, resolveAsset } from '../runtime-context.mjs';

export { LaplaceRenderContext };
export type EventData = Record<string, any>;
export type EventProps = { data: EventData; as?: string; mode?: string };
export const classes = (...values: unknown[]) => values.filter(Boolean).join(' ');
export const useOptions = () => ({ ...defaultOptions, ...(useContext(LaplaceRenderContext) as { settings: EventData }).settings }) as EventData;
export const numeric = (value: unknown) => Number(value) || 0;
export const figure = (value: unknown) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(numeric(value));
export function senderAvatarUrl(data: EventData, baseFontSize: unknown) {
  const size = numeric(baseFontSize) / 20 * 320;
  return data.avatar ? `${data.avatar}@${size}w_${size}h` : undefined;
}
export function usePerk(roomId?: unknown, uid?: unknown) {
  const context = useContext(LaplaceRenderContext) as { dashboardLiveGuards?: Record<string, { roomId: number; guardCount: number }> };
  const guards = context.dashboardLiveGuards || {};
  const room = uid != null && guards[String(uid)] ? guards[String(uid)] : Object.values(guards).find(item => item.roomId === roomId);
  const count = room ? room.guardCount : 0;
  return count >= 10000 ? 3 : count >= 1000 ? 2 : 1;
}

export function EventRoot({ data, className, children, style }: { data: EventData; className?: string; children: ReactNode; style?: CSSProperties }) {
  return <div className={classes('event', `event--${data.type}`, `event-type--${data.type}`, `origin--${data.origin}`, `origin-index--${data.originIdx}`, className)} style={style} data-uid={data.uid} data-timestamp={data.timestampNormalized} data-flip-id={data.id} data-event-id={data.id}>{children}</div>;
}

export function Avatar({ data, mode = 'obs', className, guardType = data.guardType, sender = false, perkLevel }: { data: EventData; mode?: string; className?: string; guardType?: number; sender?: boolean; perkLevel?: number }) {
  const options = useOptions();
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const roomPerk = usePerk(data.origin);
  if (mode === 'obs' && !options.classicElementScope && options.showAvatar === false) return null;
  const guard = numeric(guardType), perk = perkLevel || roomPerk;
  const url = resolveAsset((data.type ? senderAvatarUrl(data, options.baseFontSize) : data.avatar) || `https://workers.laplace.cn/bilibili/avatar/${data.uid}?size=${numeric(options.baseFontSize) / 20 * 320}`);
  const failed = failedUrl === url;
  const senderClass = className === 'sender-avatar' ? 'sender-avatar avatar--sender' : classes(sender && 'avatar--sender', className);
  return <div data-slot="avatar" className={classes('avatar-wrap', `guard-level--${guard}`, `perk-level--${perk}`, `guard-leader--${data.guardLeader ? 1 : 0}`, senderClass)} data-uid={data.uid}>
    {options.showAvatarFrame !== false && <div className="avatar-frame" />}
    <picture className="avatar-img-wrap"><img alt="头像" referrerPolicy="no-referrer" className={classes('avatar', failed && 'avatar-fallback')} loading="lazy" src={failed ? '/laplace/files/rsrc.laplace.cn/assets/chat/no-avatar.jpg' : url} onError={() => setFailedUrl(url)} /></picture>
  </div>;
}

export function Username({ data, mode = 'obs', className = 'username', inline = false }: { data: EventData; mode?: string; className?: string; inline?: boolean }) {
  const options = useOptions();
  if (mode === 'obs' && !options.classicElementScope && options.showUsername === false) return null;
  const name = data.username ?? data.uname ?? '';
  const action = mode === 'dashboard' && data.uid && String(data.uid) !== '0' ? { 'data-user-uid': String(data.uid), role: 'button', tabIndex: 0 } : {};
  return inline ? <span className={className} {...action}>{mode === 'dashboard' ? <span className="cursor-pointer">{name}</span> : name}</span> : <div className={className} {...action}><div className={classes('username-text line-clamp-1', mode === 'dashboard' && 'cursor-pointer')}>{name}</div></div>;
}

export function Timestamp({ value, force = false }: { value: unknown; force?: boolean }) {
  const options = useOptions();
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: options.useCst ? 'Asia/Shanghai' : undefined, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(numeric(value))).split(':');
  return <span className={classes('_wrap_2euit_2 timestamp tabular-nums', force && 'inline', !force && !options.showTimestamp && 'hidden')}>{time.map((part, index) => <span className={classes('time', ['hour', 'minute', 'second'][index])} key={index}><span className="figure">{part}</span>{index < 2 && <span className="separator">:</span>}</span>)}{' '}</span>;
}

export function GuardBadge({ guard, perk = 1, inMedal = false }: { guard: number; perk?: number; inMedal?: boolean }) {
  const Tag = inMedal ? 'div' : 'span';
  return <Tag className={classes(inMedal ? 'guard-badge-in-fans-medal' : 'guard-badge-in-meta', 'guard-badge', `guard-badge--${guard}`, `perk-level--${perk}`)} />;
}

export function FansMedal({ data, mode = 'obs' }: { data: EventData; mode?: string }) {
  const options = useOptions(), medal = data.medal;
  const dashboardPerk = usePerk(undefined, medal?.uid);
  if (!(options.showMedal || mode === 'dashboard') || !medal?.name || mode !== 'dashboard' && options.showMedalLightenedOnly && !medal.lightened) return null;
  const level = numeric(medal.level), guard = numeric(medal.guardType), hasGuard = guard > 0 || numeric(medal.type) === 1, perk = numeric(medal.resolvedPerkLevel) || dashboardPerk;
  return <div data-slot="fans-medal" className={classes('fans-medal', `fans-medal-lvl--${level}`, `fans-medal-tier--${Math.ceil(level / 10)}`, `fans-medal-name--${medal.name}`, `fans-medal-lightened--${medal.lightened ?? 'unknown'}`, `fans-medal-type--${numeric(medal.type)}`, hasGuard && 'fans-medal-has-guard', hasGuard && `fans-medal-has-guard--${guard}`)}><div className="fans-medal-content">{hasGuard && <GuardBadge guard={guard} perk={perk} inMedal />}{medal.name}</div>{level > 0 && <div className="fans-medal-level">{level}</div>}</div>;
}

export function WealthMedal({ data }: { data: EventData }) {
  const options = useOptions(), level = numeric(data.wealthMedalLevel);
  const [failed, setFailed] = useState(false);
  if (!options.showWealthMedal || !level) return null;
  return <div className={classes(`wealth-medal wealth-medal-lvl--${level}`, failed && 'wealth-medal-image-failed')} data-medal-lvl={level}><span className="wealth-medal-text">{level}</span><picture><img className={failed ? 'wealth-medal-image-fallback' : ''} alt="荣耀勋章" referrerPolicy="no-referrer" loading="lazy" src={resolveAsset(failed ? 'https://rsrc.laplace.cn/assets/transparent.png' : data.wealthMedalIcon || `https://workers.laplace.cn/bilibili/wealth-config?level=${level}`)} onError={() => setFailed(true)} /></picture>{failed && level}</div>;
}

export function Price({ value, currency = 'CN¥', className = 'price' }: { value: unknown; currency?: string; className?: string }) {
  return <span className={className}><span className="price-currency">{currency}</span><span className="price-figure">{figure(value)}</span></span>;
}

export function Picture({ src, alt = '图标', className, imageClass, onError }: { src: string; alt?: string; className?: string; imageClass?: string; onError?: () => void }) {
  return <picture className={className}><img src={resolveAsset(src)} alt={alt} className={imageClass} referrerPolicy="no-referrer" loading="lazy" onError={onError} /></picture>;
}

export function MessageContent({ data }: { data: EventData }) {
  const options = useOptions();
  if (data.emote?.url) {
    const large = data.emote.bulge_display === 1;
    return <Picture src={data.emote.url} alt={data.emote.emoticon_unique} className={classes('emote-wrap', large && 'emote-wrap--large')} imageClass={classes('emote', large && 'emote--large')} />;
  }
  const text = String(data.message ?? '');
  const renderText = (value: string) => value.split(/(\[[^\]]+\])/g).map((part, index) => data.bmotes?.[part]?.url ? <Picture key={index} src={data.bmotes[part].url} alt={part} className="bmote-wrap inline-flex" imageClass="bmote" /> : part);
  if (options.showSpoiler === false) return <>{renderText(text)}</>;
  const fragments = text.split(/(\|\|[\s\S]*?\|\|)/g);
  if (fragments.length === 1 && text.startsWith('||')) return <span className="spoiler">{renderText(text.slice(2))}</span>;
  return <>{fragments.map((part, index) => part.startsWith('||') && part.endsWith('||') ? <span key={index} className="spoiler">{renderText(part.slice(2, -2))}</span> : <Fragment key={index}>{renderText(part)}</Fragment>)}</>;
}

