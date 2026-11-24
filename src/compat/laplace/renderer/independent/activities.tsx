import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
// @ts-expect-error Host-owned media resolver.
import { resolveAsset, jr as createTooltip, rt as TooltipAnchor, ut as Tooltip, ot as TooltipContent } from '../runtime-context.mjs';
import { priceRank } from './paid';
import { Avatar, classes, EventRoot, figure, numeric, Picture, Price, Timestamp, Username, useOptions, senderAvatarUrl, type EventProps } from './primitives';

export function ActivityResult({ data, mode = 'obs' }: EventProps) {
  const [expanded, setExpanded] = useState(false), options = useOptions();
  const tooltip = useMemo(createTooltip, []);
  const red = data.type === 'red-envelope-result', prefix = red ? 'red-envelope-result' : 'lottery-result';
  const limit = red ? 12 : 15;
  const list = Array.isArray(data.list) ? data.list : [], canExpand = mode === 'dashboard' && list.length > limit;
  const masked = mode === 'obs' || canExpand && !expanded;
  const users = masked ? list.slice(0, limit) : list;
  return <EventRoot data={data} className={classes(!list.length && 'no-rewards', data.read && 'read', options.colorScheme === 'dark' && 'dark')}><div className="content"><div className="message">
    <div className={`details-name ${prefix}-details-name`}>{data.message}{list.length > 0 && `（共 ${list.length} 人）`}{canExpand && <button type="button" className={`toggle-button ${prefix}-toggle`} onClick={() => setExpanded(!expanded)}>{expanded ? '收起' : '展开'}</button>}</div>
    <div className={classes(masked && 'is-masked', `rewards-items-mask ${prefix}-mask`)}><div className={classes('rewards-items-wrap', red && 'red-envelope-result-list')}>
      {users.length ? users.map((item: any, index: number) => {
        const user = Array.isArray(item) ? { uid: item[0], username: item[1], avatar: typeof item[2] === 'string' ? item[2] : undefined } : { ...item, username: item.uname, avatar: item.face || item.avatar };
        return <div key={`${user.uid}-${index}`} className="rewards-item-wrap list-item-wrap" data-user-uid={mode === 'dashboard' ? String(user.uid) : undefined} aria-label={mode === 'dashboard' ? `筛选用户：${user.username}` : undefined} role={mode === 'dashboard' ? 'button' : undefined} tabIndex={mode === 'dashboard' ? 0 : undefined}>{mode === 'dashboard' ? <div><TooltipAnchor handle={tooltip} payload={user.username} render={<div className="cursor-pointer"><Avatar data={{ uid: user.uid, avatar: user.avatar }} mode={mode} /></div>} /></div> : <Avatar data={{ uid: user.uid, avatar: user.avatar }} mode={mode} />}</div>;
      }) : <div className="list-item-wrap">无人中奖</div>}
      {mode === 'dashboard' && <Tooltip handle={tooltip}>{({ payload }: { payload: unknown }) => payload ? <TooltipContent>{String(payload)}</TooltipContent> : null}</Tooltip>}
    </div></div>
  </div></div></EventRoot>;
}

export function LotteryStart({ data, as = 'normal', mode = 'obs' }: EventProps) {
  const options = useOptions(), sticky = as === 'sticky';
  const host = { uid: data.origin, avatar: `https://workers.laplace.cn/bilibili/avatar/${data.origin}?size=${numeric(options.baseFontSize) / 20 * 320}&isRoom=1` };
  const avatar = (className?: string) => <Avatar data={host} mode={mode} className={className} />;
  const icon = (className = '') => <span className={classes('lottery-start-icon-wrap', className)}><Picture className="inline-flex" imageClass={undefined} alt="天选" src="https://rsrc.laplace.cn/assets/chat/lottery.png" /></span>;
  return <EventRoot data={data} className={classes('event-size--highlight', `event-show-as--${as}`, data.read && 'read', options.colorScheme === 'dark' && 'dark')}><div className="content"><div className="top">{avatar()}{avatar('avatar-alt-top hidden')}<div className="message">{mode === 'dashboard' ? <span className="cursor-pointer">天选时刻</span> : '天选时刻'}{!sticky && <>：<b>{data.rewardName}</b></>}</div>{icon()}{icon('lottery-start-icon-wrap-alt-top hidden')}</div>
    {!sticky && <div className="message"><span className="lottery-start-details-message"><b>{data.messageToJoin || data.message}</b></span>{' '}{data.giftName && <span className="lottery-start-details-requirements">需要投喂 <b>{data.giftName}</b>{' '}<Price value={data.giftPriceNormalized} /></span>}{avatar('avatar-alt-bottom hidden')}{icon('lottery-start-icon-wrap-alt-bottom hidden')}</div>}
  </div></EventRoot>;
}

function RedEnvelopePrice({ mode, className, explanation, children }: { mode: string; className?: string; explanation: string; children: ReactNode }) {
  const tooltip = useMemo(createTooltip, []);
  const price = <span className={className}>{children}</span>;
  if (mode !== 'dashboard') return price;
  return <><TooltipAnchor handle={tooltip} payload={explanation} render={price} /><Tooltip handle={tooltip}>{({ payload }: { payload: unknown }) => payload ? <TooltipContent>{String(payload)}</TooltipContent> : null}</Tooltip></>;
}

export function RedEnvelopeStart({ data, as = 'normal', mode = 'obs' }: EventProps) {
  const options = useOptions(), sticky = as === 'sticky', amount = numeric(data.priceNormalized);
  const avatar = (className?: string) => <Avatar data={data} mode={mode} className={className} />;
  const icon = (className = '') => <span className={classes('gift-icon-wrap red-envelope-start-icon-wrap', className)}><Picture alt="红包" className="inline-flex" src={data.icon || 'https://rsrc.laplace.cn/assets/chat/red-envelope.webp'} /></span>;
  const explanation = (data.list || []).some((gift: any) => gift.gift_id === 0)
    ? '上舰红包金额不对主播分成，当用户使用上舰红包中的优惠券成为舰长后，主播可获得大航海舰长的奖励分成'
    : '该金额为红包奖池总金额，不会对主播产生任何直接收益';
  const priceContent = <><span className="price-currency">CN¥</span><span className="price-figure">{figure(amount)}</span></>;
  return <EventRoot data={data} style={{ '--inline-avatar-url': `url(${resolveAsset(senderAvatarUrl(data, options.baseFontSize))})` } as CSSProperties} className={classes(`event-size--${sticky || amount >= options.showGiftHighlightAbove ? 'highlight' : 'normal'}`, `event-show-as--${as}`, `red-envelope-start-rank--${priceRank(amount)}`, data.read && 'read', options.colorScheme === 'dark' && 'dark')}><div className="content">
    {!sticky && <Timestamp value={data.timestampNormalized} />}<div className="top">{avatar()}{avatar('avatar-alt-top hidden')}{!sticky && <Username data={data} mode={mode} />}<div className="price"><RedEnvelopePrice mode={mode} explanation={explanation}>{priceContent}</RedEnvelopePrice></div>{icon()}{icon('red-envelope-start-icon-wrap-alt-top hidden')}</div><div className="price-alt hidden">{priceContent}</div>
    {!sticky && <div className="message"><span className="red-envelope-start-details-action">送了红包</span><span className="rewards-items-wrap red-envelope-start-rewards">{(data.list || []).map((gift: any, index: number) => <div className="rewards-item-wrap" key={index}><div className="rewards-item-count">{gift.num}</div><Picture className="rewards-item-picture-wrap inline-flex" src={gift.gift_pic} alt="红包" /></div>)}</span>{' '}{mode === 'obs' && <b className="red-envelope-start-details-name">{data.message}</b>}<span className="red-envelope-start-details">{' '}<RedEnvelopePrice mode={mode} explanation={explanation} className="gift-details-price">{priceContent}</RedEnvelopePrice></span>{avatar('avatar-alt-top hidden')}{icon('red-envelope-start-icon-wrap-alt-bottom hidden')}</div>}
  </div></EventRoot>;
}
