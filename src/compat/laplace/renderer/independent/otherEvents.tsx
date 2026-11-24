import { IconThumbUpFilled } from '@tabler/icons-react';
import { Avatar, classes, EventRoot, FansMedal, GuardBadge, numeric, Picture, Timestamp, Username, useOptions, usePerk, WealthMedal, type EventProps } from './primitives';

const actions: Record<number, [string, string]> = { 1: ['enter', '进入'], 2: ['follow', '关注'], 3: ['share', '分享'], 4: ['follow-special', '特别关注'], 5: ['follow-mutual', '互相关注'] };
export function InteractionEvent({ data, mode = 'obs' }: EventProps) {
  const medalPerk = usePerk(undefined, data.medal?.uid), roomPerk = usePerk(data.origin);
  const like = data.type === 'like-click', action = actions[numeric(data.action)] || ['unknown', ''];
  return <EventRoot data={data} className={classes(`guard-level--${numeric(like ? data.medal?.guardType : data.guardType)}`, !like && `event-action--${action[0]}`)}><Timestamp value={data.timestampNormalized} /><div className="meta"><Avatar data={data} mode={mode} perkLevel={like ? roomPerk : numeric(data.medal?.resolvedPerkLevel) || medalPerk} />{!like && <WealthMedal data={data} />}<FansMedal data={data} mode={mode} /><Username data={data} mode={mode} /></div><span className="message">{like ? <>{data.message}<IconThumbUpFilled size="1em" /></> : `${action[1]}直播间`}</span>{!like && mode === 'dashboard' && data.relation?.type > 0 && data.relation.icon && <span className={`relation-wrap relation-type--${data.relation.type}`} title={data.relation.text}><Picture className="relation-icon-wrap" imageClass="relation-icon" alt={data.relation.text} src={data.relation.icon} /></span>}</EventRoot>;
}

export function EffectMessage({ data, mode = 'obs' }: EventProps) {
  const raw = data.messageRaw || {}, options = useOptions(), perk = usePerk(data.origin);
  return <EventRoot data={data} className={classes('event--message event-type--message', `guard-level--${numeric(data.guardType)}`, options.colorScheme === 'dark' && 'dark')}><div className="meta"><Timestamp value={data.timestampNormalized} />{options.showAvatar !== false && <Avatar data={data} mode={mode} sender className="sender-avatar" />}<WealthMedal data={data} /><FansMedal data={data} mode={mode} />{(options.showUsername || mode === 'dashboard') && <Username data={data} mode={mode} />}{options.showGuardBadge && data.guardType > 0 && <GuardBadge guard={data.guardType} perk={perk} />}</div><span className="message"><span className="effect-message-action">{raw.action}</span>{' '}<Picture className="effect-message-icon-wrap inline-flex" alt="礼物图标" src={raw.img} />{' '}<span className="effect-message-name">{raw.name}</span>{' '}<span className="effect-message-num">{raw.num}</span>{' '}<span className="effect-message-prefix">{raw.prefix}</span><span className="effect-message-text">{raw.text}</span></span></EventRoot>;
}

export function SystemEvent({ data, mode = 'obs' }: EventProps) {
  const options = useOptions();
  switch (data.type) {
    case 'system': return <EventRoot data={data}><span className="message">{data.message}</span></EventRoot>;
    case 'live': case 'live-start': case 'preparing': case 'live-end':
      return <EventRoot data={data}><span className="message">{mode === 'dashboard' ? <span className="cursor-pointer">{data.message}</span> : data.message}{' '}<Timestamp value={data.timestampNormalized} force /></span></EventRoot>;
    case 'live-warning': case 'live-cutoff':
      return <EventRoot data={data}><span className="message">{mode === 'dashboard' ? <span className="cursor-pointer">{data.type === 'live-warning' ? '直播间 ' : '直播 '}{data.uid}{data.type === 'live-warning' ? ' 被警告' : ' 被切断'}</span> : <>{data.type === 'live-warning' ? '直播间 ' : '直播 '}{data.uid}{data.type === 'live-warning' ? ' 被警告' : ' 被切断'}</>}{data.message && <>：{data.message}</>}</span></EventRoot>;
    case 'room-mute-on': case 'room-mute-off':
      return <EventRoot data={data}><div className="message">{mode === 'dashboard' ? <span className="cursor-pointer">{data.message}</span> : data.message}</div></EventRoot>;
    case 'room-name-update':
      return <EventRoot data={data}><div className="message">{mode === 'dashboard' ? <span className="cursor-pointer">直播间标题更新</span> : '直播间标题更新'}{'：'}{data.message}</div><div className="message">分区：{data.parentArea} - {data.area}</div></EventRoot>;
    case 'user-block':
      return <EventRoot data={data}>{(mode !== 'obs' || options.classicElementScope || options.showUsername !== false) && <span className="username"><span className={classes('username-text', mode === 'dashboard' && 'cursor-pointer')}>{data.username}</span></span>}<span className="message">被 <span className="block-operator">{data.operator === 1 ? '房管' : '主播'}</span> 禁言{data.vaildPeriod && <>，有效期 <span className="block-duration">{data.vaildPeriod}</span></>}</span></EventRoot>;
    default: return null;
  }
}
