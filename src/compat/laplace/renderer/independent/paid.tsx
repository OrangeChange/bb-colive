import { useMemo, useState, type CSSProperties } from 'react';
import { IconEyeOff } from '@tabler/icons-react';
import trendArtwork from './price-trend-artwork.json';
import { productGiftHighlight } from '../../productPresentationPolicy';
import { Avatar, classes, EventRoot, FansMedal, figure, MessageContent, numeric, Picture, Price, Timestamp, Username, useOptions, senderAvatarUrl, WealthMedal, type EventProps } from './primitives';
// @ts-expect-error Host-owned media mapping.
import { resolveAsset, jr as createTooltip, rt as TooltipAnchor, ut as Tooltip, ot as TooltipContent } from '../runtime-context.mjs';

export const priceRank = (amount: number) => amount >= 2000 ? 6 : amount >= 1000 ? 5 : amount >= 500 ? 4 : amount >= 100 ? 3 : amount >= 50 ? 2 : 1;
function TrendIcon({ up }: { up: boolean }) {
  return <svg fill="none" viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg" className="w-4" role="img" aria-label={up ? 'Up' : 'Down'} dangerouslySetInnerHTML={{ __html: up ? trendArtwork.up : trendArtwork.down }} />;
}

export function GiftEvent({ data, as = 'normal', mode = 'obs' }: EventProps) {
  const options = useOptions(), sticky = as === 'sticky', paid = data.coinType === 'gold', blind = data.blindGift;
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const amount = blind ? numeric(blind.gift_tip_price) * numeric(data.giftAmount) / 1000 : numeric(data.priceNormalized);
  const highlighted = productGiftHighlight(data, amount, options.showGiftHighlightAbove), rank = priceRank(amount);
  const avatar = (className: string) => <Avatar data={data} mode={mode} className={className} sender />;
  const size = numeric(options.baseFontSize) / 20 * 320 * (highlighted ? 3 : 1);
  const imageUrl = data.giftIcon || `https://workers.laplace.cn/bilibili/room-gift-config/${data.origin}?gift=${data.giftId}&size=${size}`;
  const giftImage = (className: string) => <span className={`gift-image-wrap gift-icon-wrap ${className || (mode === 'dashboard' ? 'cursor-pointer' : '')}`} {...(!className ? { role: 'button', tabIndex: 0 } : {})}><Picture alt="礼物" className="inline-flex" imageClass={failedImage === imageUrl ? 'gift-icon-fallback' : ''} src={failedImage === imageUrl ? 'https://rsrc.laplace.cn/assets/chat/gift-fallback.png' : imageUrl} onError={() => setFailedImage(imageUrl)} /></span>;
  const priceContent = paid ? <>{blind && amount !== data.priceNormalized && <Price value={data.priceNormalized} currency="¥" className="price-actual" />}{blind && amount !== data.priceNormalized && <span className={`price-blind-result price-blind-result-${amount > data.priceNormalized ? 'up' : 'down'}`}><TrendIcon up={amount > data.priceNormalized} /></span>}<span className="price-currency">{sticky ? 'CN¥' : '¥'}</span><span className="price-figure">{figure(amount)}</span></> : `${figure(amount)} 银瓜子`;
  return <EventRoot data={data} className={classes(`event-size--${highlighted && paid || sticky ? 'highlight' : 'normal'}`, `event-show-as--${as}`, `guard-level--${numeric(data.guardType)}`, `event-gift-id--${data.giftId}`, `event-gift-type--${paid ? 'paid' : 'free'}`, `event-gift-rank--${rank}`, `event-price-rank--${rank}`, options.colorScheme === 'dark' && 'dark', data.read && 'read')}>
    <div className="content">{!sticky && <Timestamp value={data.timestampNormalized} />}<div className="top">{avatar('sender-avatar')}{avatar('avatar-alt-top hidden')}{!sticky && <><WealthMedal data={data} /><FansMedal data={data} mode={mode} /><Username data={data} mode={mode} /></>}<div className="price">{priceContent}</div>{giftImage('')}{giftImage('gift-icon-wrap-alt-top hidden')}</div><div className="price-alt hidden">{priceContent}</div>
      {!sticky && <div className="message">{blind && highlighted && <span className="gift-blind"><span className="gift-blind-name">{blind.original_gift_name}</span><span className="gift-blind-action">{blind.gift_action}</span></span>}<b className="gift-details-name">{data.message || data.giftName}</b><span className="gift-details">{numeric(data.giftAmount) > 1 && <><span className="gift-details-symbol">×</span><span className="gift-details-figure">{figure(data.giftAmount)}</span></>}{' '}<span className="gift-details-price">{priceContent}</span></span>{data.receiver && (data.bizSource === 'voice_chat_room' || data.receiver.master?.room_id && data.origin !== data.receiver.master.room_id) && <span className="gift-receiver"><span className="gift-receiver-action">送给</span><Avatar data={{ uid: data.receiver.uid, avatar: data.receiver.avatar, origin: data.origin }} mode={mode} className="receiver-avatar avatar--receiver" />{(mode !== 'obs' || options.classicElementScope || options.showUsername !== false) && <b data-user-uid={mode === 'dashboard' ? String(data.receiver.uid) : undefined} role={mode === 'dashboard' ? 'button' : undefined} tabIndex={mode === 'dashboard' ? 0 : undefined} className={classes('gift-receiver-username', mode === 'dashboard' && 'cursor-pointer')}>{data.receiver.uname}</b>}</span>}{avatar('avatar-alt-bottom hidden')}{giftImage('gift-icon-wrap-alt-bottom hidden')}</div>}
    </div>
  </EventRoot>;
}

export function SuperchatEvent({ data, as = 'normal', mode = 'obs' }: EventProps) {
  const options = useOptions(), sticky = as === 'sticky', amount = numeric(data.priceNormalized), rank = priceRank(numeric(data.price ?? amount));
  const translated = data.transMark === 1 && data.messageTrans;
  const deletedTooltip = useMemo(createTooltip, []);
  const timestamp = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(numeric(data.timestampNormalized)));
  const avatar = (className?: string) => <Avatar data={data} mode={mode} className={className} />;
  return <EventRoot data={data} style={{ '--inline-avatar-url': `url(${resolveAsset(senderAvatarUrl(data, options.baseFontSize))})` } as CSSProperties} className={classes(`event-show-as--${as}`, `event-superchat-id--${data.scId}`, `event-superchat-rank--${rank}`, `event-price-rank--${rank}`, amount < 30 && 'special-promo', data.guardBackground && 'has-guard-bg', data.deleted && 'deleted', data.read && 'read', translated && 'has-translation', options.colorScheme === 'dark' && 'dark')}>
    <div className="content"><div className="top">{avatar()}{avatar('avatar-alt-top hidden')}{data.guardBackground && <Picture src={data.guardBackground} className="guard-bg-wrap guard-bg-wrap-alt-top hidden" imageClass="guard-bg" />}<div className="meta">{!sticky && <div className="username-wrap"><FansMedal data={data} mode={mode} /><Username data={data} mode={mode} /></div>}<div className="price"><span className="price-currency">CN¥</span><span className="price-figure">{figure(amount)}</span></div>{mode === 'dashboard' && <div className="timestamp-wrap">{data.deleted && <><TooltipAnchor handle={deletedTooltip} payload="已被系统或房管删除" render={<IconEyeOff className="deleted-badge" />} /><Tooltip handle={deletedTooltip}>{({ payload }: { payload: unknown }) => payload ? <TooltipContent>{String(payload)}</TooltipContent> : null}</Tooltip></>}<div className="timestamp">{timestamp}</div></div>}</div></div>
      {!sticky && <div className="message"><div className="message-text"><MessageContent data={data} /></div>{translated && <div className="message-translation">{'🌐 '}{data.messageTrans}</div>}{avatar('avatar-alt-bottom hidden')}</div>}
    </div>
  </EventRoot>;
}

export function ToastEvent({ data, as = 'normal', mode = 'obs' }: EventProps) {
  const options = useOptions(), sticky = as === 'sticky', guard = numeric(data.toastType);
  const guardData = { ...data, guardType: guard };
  const frameRank = numeric(data.toastTotalCount) >= 10000 ? 3 : numeric(data.toastTotalCount) >= 1000 ? 2 : 1;
  const badgeRank = numeric(data.toastTotalCount) >= 1000 ? 2 : 1;
  const avatar = (className?: string) => <Avatar data={guardData} mode={mode} className={className} perkLevel={frameRank} />;
  const name = data.toastName || ['','总督','提督','舰长'][guard];
  const days = String(data.message || '').match(/第(\d+)天/)?.[1] ?? data.toastTotalDays;
  const action = String(data.message || '').match(/(开通|续费|升级)/)?.[1] || data.toastAction || '开通';
  const icon = <span className="toast-icon-wrap toast-icon-wrap-alt-bottom hidden"><Picture alt="大航海" className="inline-flex" src={`https://rsrc.laplace.cn/assets/guard-icons/icon-${guard}${badgeRank > 1 ? '-1k' : '-animate'}.png`} /></span>;
  return <EventRoot data={data} className={classes(`event-show-as--${as}`, `guard-level--${guard}`, `avatar-frame-rank--${frameRank} avatar-badge-rank--${badgeRank}`, data.mockPrice && 'mock-price', data.priceNormalized <= 50 && 'special-blind-box', options.colorScheme === 'dark' && 'dark', data.read && 'read')}>
    {avatar()}{avatar('avatar-alt-top hidden')}<div className="content">{!sticky && <Username data={data} mode={mode} />}<div className="price">{data.mockPrice ? <span className="price-text">{name}</span> : <><span className="price-currency">CN¥</span><span className="price-figure">{figure(data.priceNormalized)}</span></>}</div>
      {!sticky && <div className="message"><span className="toast-details-action">{action}</span><span className="toast-details-type">{name}</span>{numeric(data.toastAmount) > 1 && <><span className="toast-details-symbol">×</span><span className="toast-details-figure">{data.toastAmount}</span><span className="toast-details-unit">{data.toastAmountUnit === '月' ? '个月' : data.toastAmountUnit}</span></>}{String(data.toastAmountUnit || '').includes('天') && <><span className="toast-details-symbol">×</span><span className="toast-details-figure">{String(data.toastAmountUnit).match(/\d+/)?.[0] || 1}</span><span className="toast-details-unit">天</span></>}{days && <><span className="toast-details-total-days-text-before">，已陪伴主播 </span><b className="toast-details-total-days">{days}</b><span className="toast-details-total-days-text-after"> 天</span></>}</div>}{avatar('avatar-alt-bottom hidden')}{icon}
    </div>
  </EventRoot>;
}
