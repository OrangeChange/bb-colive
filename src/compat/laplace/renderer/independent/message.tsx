import { IconShieldCheckFilled, IconRosetteDiscountCheckFilled } from '@tabler/icons-react';
import { Avatar, classes, EventRoot, FansMedal, GuardBadge, LaplaceRenderContext, MessageContent, numeric, Timestamp, Username, useOptions, usePerk, WealthMedal, type EventProps } from './primitives';
export { LaplaceRenderContext };

export function MessageEvent({ data, mode = 'obs' }: EventProps) {
  const options = useOptions(), guard = numeric(data.guardType), user = numeric(data.userType), rank = numeric(data.currentRank);
  const perk = usePerk(data.origin);
  const avatar = (className: string) => <Avatar data={data} mode={mode} className={className} sender />;
  const reply = data.reply && Object.keys(data.reply).length ? data.reply : null;
  const border = `#${numeric(data.userLvlBorder).toString(16).padStart(6, '0')}`;
  return <EventRoot data={data} className={classes(`guard-level--${guard}`, `current-rank--${rank}`, `user-type--${user}`, `user-type--${user === 100 ? 'streamer' : user === 1 ? 'mod' : 'user'}`, `guard-leader--${data.guardLeader ? 1 : 0}`, data.read && 'read', data.isMirror && 'is-mirror', Object.keys(data.bmotes || {}).length && 'has-bmotes', data.reply?.uid && 'has-reply', data.emote && 'has-emotes', options.colorScheme === 'dark' && 'dark')}>
    {avatar('avatar-alt-outer hidden')}
    <div className="meta"><Timestamp value={data.timestampNormalized} />{mode === 'dashboard' && data.isMirror && <div className="mirror-badge">跨房</div>}{options.showAvatar !== false && avatar('sender-avatar')}{avatar('avatar-alt-top hidden')}
      <WealthMedal data={data} /><FansMedal data={data} mode={mode} />
      {numeric(data.userLvl) > 0 && <div className={`user-level user-level--${data.userLvl}`} style={{ borderColor: border }}><div className="user-level-text" style={{ color: border }}><span className="user-level-name">UL</span><span className="user-level-figure">{data.userLvl}</span></div></div>}
      {(options.showUsername || mode === 'dashboard') && <Username data={data} mode={mode} />}
      {user === 100 && <div className="streamer-badge-wrap"><IconRosetteDiscountCheckFilled className="streamer-badge" /></div>}
      {(options.showModBadge || mode === 'dashboard') && user === 1 && <div className="mod-badge-wrap"><IconShieldCheckFilled className="mod-badge" /></div>}
      {options.showGuardBadge && guard > 0 && <GuardBadge guard={guard} perk={perk} />}
      {options.showCurrentRank && rank > 0 && <span className={`current-rank current-rank--${rank}`}>榜{rank}</span>}
    </div>
    <span className="message">{data.emote?.url && <MessageContent data={data} />}{reply && <span className="reply"><Avatar data={{ uid: reply.uid, avatar: reply.avatar, origin: data.origin }} mode={mode} className="reply-avatar avatar--reply inline-flex" />{(options.showUsername || mode === 'dashboard') && <Username data={reply} mode={mode} inline className="reply-username" />}</span>}{!data.emote?.url && <MessageContent data={data} />}{avatar('avatar-alt-bottom hidden')}</span>
  </EventRoot>;
}
