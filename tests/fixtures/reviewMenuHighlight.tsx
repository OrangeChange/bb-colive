import {EventRow} from '../../src/components/EventRow';
import {EventRowSlot} from '../../src/components/EventRowSlot';
import {getNativeEventSample} from './nativeEventSamples';
export function ReviewMenuHighlight({persistent=false}) {
 const menu={regionKey:'highlight',onSpeakEvent(){},isFavorite:()=>persistent,onToggleFavorite(){}};
 return <>{['live','review'].map(mode=><div key={mode} className={mode==='live'?'theme-surface live scene-live-list':'event-area review'} data-highlight-host={mode} style={{width:480}}><EventRowSlot><EventRow ev={getNativeEventSample('text')} liveLayout={mode==='live'} reviewLayout={mode==='review'} eventMenuScope={mode} eventMenu={menu} animateOnMount={false}/></EventRowSlot></div>)}</>;
}
