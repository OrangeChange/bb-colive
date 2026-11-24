import { MsgType } from '../protocol/types';
import { motion, useReducedMotion } from 'motion/react';
import type { StickyEventCard as Card } from '../windows/stickyEventModel';
import type { EventDisplayPreferences } from '../eventDisplaySettings';
import { getEventStyleType, type EventStyleSettings } from '../eventStyleSettings';
import { getEventStyleRole } from '../eventRowStyles';
import { publicEventClass, publicIdentityClasses, publicGuardPurchaseClass } from '../events/publicEventStyle';
import { Avatar, GiftIcon, GiftPrice, BlindProfit, CurrencyPrice, giftPriceLabel, EventDisplayContext, GuardEventIcon } from './EventRow';
import { CompatibleEventRenderer, type CompatibleEventRender } from '../compat/CompatibleEventRenderer';
import { NativeEventIcon } from './NativeEventIcon';
import { priceGradientClass } from '../themes/nativePriceGradient.ts';

export function StickyEventCard({ card, now, display, eventStyleSettings, compatibleEventRender }: {
  card: Card; now: number; display: EventDisplayPreferences; eventStyleSettings: EventStyleSettings; position?: 'top' | 'bottom'; compatibleEventRender?: CompatibleEventRender;
}) {
  const reducedMotion = useReducedMotion();
  const offset = reducedMotion ? 0 : "-0.75em";
  const { event, amount } = card;
  const eventStyleType = getEventStyleType(event.msgType,event.guard?.level ?? event.user?.guardLevel);
  const seconds = Math.max(0,Math.ceil((card.expiresAt-now)/1000));
  const gift = event.gift;
  const paid = gift?.paymentRmb;
  const difference = gift?.blindGiftName && amount !== undefined && paid !== undefined ? Math.round((amount-paid)*100)/100 : null;
  const fallback = <EventDisplayContext.Provider value={{...display,eventStyleSettings,liveLayout:true,enableBilibiliVideoLinks:false,userNicknames:{},eventStyleType,maskUsername:false}}>
    <div className={`event event-sticky sticky ${priceGradientClass(event, (eventStyleSettings as import("../themes/nativeComponentAppearance.ts").NativeThemeSettings).priceGradient, (eventStyleSettings as import("../themes/nativeComponentAppearance.ts").NativeThemeSettings).display?.usePriceGradient === true)} ${publicEventClass(event)} ${publicIdentityClasses(event.user)} ${publicGuardPurchaseClass(event)}`} data-event-id={event.id} data-event-role={getEventStyleRole(event.user, eventStyleSettings.rolePriority)} data-event-style-type={eventStyleType} data-event-layout="live" aria-description={`剩余${seconds}秒`}>
      <Avatar user={event.msgType === MsgType.AnchorLotStart ? (event.broadcaster ?? {uid:"",uname:"",guardLevel:0}) : event.user} />
      <span className="content">
        {event.msgType === MsgType.AnchorLotStart ? <span className="lottery">天选</span>
          : amount !== undefined && (event.msgType === MsgType.Gift ? <GiftPrice value={amount === 0 ? '¥0' : giftPriceLabel({totalRmb:amount})} /> : <CurrencyPrice value={amount === 0 ? 0 : giftPriceLabel({totalRmb:amount})} className="font-mono" />)}
        {gift?.blindGiftName && <span className="blind-gift"><BlindProfit difference={difference} /></span>}
      </span>
      {event.msgType === MsgType.Gift ? <GiftIcon gift={gift} /> : !display.showEventIcon ? null : event.msgType === MsgType.GuardBuy ? <GuardEventIcon event={event} /> : <NativeEventIcon rpType={event.pocket?.rpType} kind={event.msgType === MsgType.SuperChat ? 'superchat' : event.msgType === MsgType.RedPocketStart ? 'redpocket' : 'lottery'} />}
    </div>
  </EventDisplayContext.Provider>;
  return <motion.div className="sticky-motion-host" data-sticky-motion-host initial={{ x: offset, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: offset, opacity: 0 }} transition={{ duration: reducedMotion ? 0 : .2, ease: 'easeOut' }}>
    <CompatibleEventRenderer event={event} render={compatibleEventRender} fallback={fallback} />
  </motion.div>;
}
