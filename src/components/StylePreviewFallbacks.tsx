import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { mountBlivechatFallbackRoot, readBlivechatFallbackPresentation } from '../compat/blivechat/blivechatFallbackSurface.ts';
import { compatibleFallbackDisplay, type CompatibleThemeMode } from '../themes/compatThemeSettings.ts';
import { createDefaultEventStyleSettings } from '../eventStyleSettings.ts';
import type { DanmakuEvent } from '../protocol/types.ts';
import type { StylePreviewPolicySettings, selectStylePreviewEvents } from '../preview/stylePreviewPolicy.ts';
import { useEventAreaStyle } from './EventAreaStyle.tsx';
import { EventRow } from './EventRow.tsx';
import { EventRowSlot } from './EventRowSlot.tsx';
import { StickyEventCard } from './StickyEventCard.tsx';

export function StylePreviewFallbacks({ frameDocument,events,sticky=[],policy,mode,settings={},target,now }: {
  frameDocument: Document|null; events:DanmakuEvent[]; sticky?:ReturnType<typeof selectStylePreviewEvents>['sticky'];
  policy:StylePreviewPolicySettings; mode:CompatibleThemeMode; settings?:Record<string,unknown>;
  target:'live'|'windows'|'obs'; now:number;
}) {
  const [,refresh]=useState(0);
  const renderedSlots=useRef(new Map<string,HTMLElement>());
  useLayoutEffect(()=>{
    if(!frameDocument?.body)return;
    const wanted=new Set(events.map(event=>event.id));
    const observer=new MutationObserver(()=>{
      const next=new Map([...frameDocument.querySelectorAll<HTMLElement>('[data-compatible-fallback-id]')].filter(node=>wanted.has(node.dataset.compatibleFallbackId!)).map(node=>[node.dataset.compatibleFallbackId!,node]));
      if(next.size===renderedSlots.current.size&&[...next].every(([id,node])=>renderedSlots.current.get(id)===node))return;
      renderedSlots.current=next;
      flushSync(()=>refresh(value=>value+1));
    });
    observer.observe(frameDocument.body,{childList:true,subtree:true});
    return()=>observer.disconnect();
  },[frameDocument,events]);
  const display=useMemo(()=>({...policy.displayPreferences,...compatibleFallbackDisplay(mode,settings)}),[policy.displayPreferences,mode,settings]);
  const appearance=useMemo(()=>createDefaultEventStyleSettings(),[]);
  const area=useEventAreaStyle({settings:appearance,layout:target==='live'?'live':'window',fontSize:display.baseFontSize,padding:display.eventPadding,spacing:display.eventSpacing});
  if(target==='obs')return null;
  const host=frameDocument?.defaultView?.frameElement?.parentElement;
  const wanted=new Set(events.map(event=>event.id));
  const slotNodes=new Map([...(frameDocument?.querySelectorAll<HTMLElement>('[data-compatible-fallback-id]')??[])].filter(node=>wanted.has(node.dataset.compatibleFallbackId!)).map(node=>[node.dataset.compatibleFallbackId!,node]));
  renderedSlots.current=slotNodes;
  const presentation=host&&slotNodes.size?readBlivechatFallbackPresentation(document,host):undefined;
  const slots=events.flatMap(event=>{
    const slot=slotNodes.get(event.id);
    if(!slot||!host)return [];
    return [createPortal(<div className={`theme-surface event-area preview ${target==='live'?'live':'window'}`} data-event-style-scope={area.scope}>
      <EventRowSlot className="event-row-slot" data-event-id={event.id}><EventRow ev={event} animateOnMount={false} liveLayout showTime={target!=='live'&&display.showTimestamp} maskUsername={target!=='live'&&display.maskUsername} displayPreferences={display} eventStyleSettings={appearance} eventFontSize={display.baseFontSize}/></EventRowSlot>
    </div>,mountBlivechatFallbackRoot(slot,document,host,{scope:area.scope,css:area.css},presentation),event.id)];
  });
  return <>{slots}{sticky.length>0&&target!=='live'&&<div className="sticky-area native-preview-sticky-scroll" data-preview-fallback-sticky style={{flexShrink:0,order:policy.stickySettings.position==='bottom'?1:-1}} data-event-style-scope={area.scope}>{area.style}{sticky.map(card=><StickyEventCard key={card.event.id} card={card} now={now} display={display} eventStyleSettings={appearance}/>)}</div>}</>;
}
