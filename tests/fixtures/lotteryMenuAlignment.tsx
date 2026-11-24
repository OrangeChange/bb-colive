import {EventRow} from '../../src/components/EventRow';
import {EventRowSlot} from '../../src/components/EventRowSlot';
import {useEventAreaStyle} from '../../src/components/EventAreaStyle';
import {createBuiltinNativeTheme} from '../../src/themes/nativeBuiltinThemes';
import {projectNativeTheme} from '../../src/themes/nativeThemeProjection';
import {scopeThemeCss} from '../../src/themes/themeCssScope';
import {DEFAULT_EVENT_DISPLAY_PREFERENCES} from '../../src/eventDisplaySettings';
import {getNativeEventSample} from './nativeEventSamples';
export function LotteryMenuAlignment({theme,width}){
 const projection=projectNativeTheme(createBuiltinNativeTheme('native-'+theme));
 const area=useEventAreaStyle({settings:projection.settings,layout:'live',fontSize:16,padding:8,spacing:8});
 const menu={regionKey:'alignment',onSpeakEvent(){},isFavorite:()=>false,onToggleFavorite(){}};
 return <div style={{width}} className="theme-surface theme-target-live live scene-live-list event-area" data-event-style-scope={area.scope}><style>{scopeThemeCss(projection.css,'.theme-surface')}</style>{area.style}<div className="event-list">{['normal-gift','lottery-result','pocket-result'].map(key=><EventRowSlot key={key}><EventRow ev={getNativeEventSample(key)} liveLayout allowWinnerExpansion animateOnMount={false} displayPreferences={DEFAULT_EVENT_DISPLAY_PREFERENCES} eventStyleSettings={projection.settings} eventMenu={menu}/></EventRowSlot>)}</div></div>;
}
