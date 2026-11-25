import '../../src/shadcn.css';
import {createRoot} from 'react-dom/client';
import {Fragment,useState} from 'react';
import {MsgType} from '../../src/protocol/eventTypeCodes';
import {EventRow} from '../../src/components/EventRow';
import {EventRowSlot} from '../../src/components/EventRowSlot';
import {StylePreviewArea} from '../../src/components/StylePreviewArea';
import {useEventAreaStyle} from '../../src/components/EventAreaStyle';
import {DEFAULT_EVENT_DISPLAY_PREFERENCES} from '../../src/eventDisplaySettings';
import {projectNativePreviewActivities} from '../../src/preview/nativePreviewActivities';
import {createBuiltinNativeTheme} from '../../src/themes/nativeBuiltinThemes';
import {DEFAULT_EVENT_STYLE_SETTINGS} from '../../src/eventStyleSettings';
import {scopeThemeCss} from '../../src/themes/themeCssScope';
import {projectNativeTheme} from "../../src/themes/nativeThemeProjection";
import {resolveLiveNativeThemePresentation} from "../../src/themes/nativeThemeTargetPresentation";
import {assignNativeCssLayer} from '../../src/themes/nativeThemeCascade';
import {createStylePreviewDesignEvents} from '../../src/components/stylePreviewEvents';
import {useGeneralSettings} from '../../src/generalSettings';
import {getNativeEventSample} from './nativeEventSamples';
import defaultCss from '../../src/themes/nativeDefaultTheme.css?raw';
import cardCss from '../../src/themes/nativeCardTheme.css?raw';
import bubbleCss from '../../src/themes/nativeBubbleTheme.css?raw';
import {renderPriceGradientCss,normalizePriceGradient} from '../../src/themes/nativePriceGradient';


(window as any).setNativeReviewSize = (fontSize: number) => useGeneralSettings.getState().setReviewStyleSettings({fontSize});

export function NativeLayoutFixture({initialState={theme:'bubble',target:'live',width:360,dark:false,avatar:true,emotesOnly:false,typographyOnly:false,deletedOnly:false,baseSize:16}}){
 const [state,setState]=useState(initialState);
 if(typeof window!=='undefined')(window as any).setNativeLayoutCase=setState;
 const builtin=state.baseSizeCase ? createBuiltinNativeTheme('native-'+state.theme) : null;
 const defaults=builtin?.settings ?? (state.semantic ? createBuiltinNativeTheme('native-'+state.theme).settings : DEFAULT_EVENT_STYLE_SETTINGS);
 const themeSettings={...defaults,visualModel:state.visualModel??defaults.visualModel,rolePriority:state.adminFirst?['admin','captain','admiral','viceroy','anchor','normal']:['captain','admin','admiral','viceroy','anchor','normal'],display:{...(builtin ? {...builtin.settings.display,baseFontSize:state.baseSize??16,showAvatar:state.avatar,showEventIcon:state.icons!==false,showCurrentRank:state.rank===true,showHonorLevel:state.rank===true} : {}),...(state.textIdentity ? {guardIdentityDisplayMode:"text",anchorIdentityDisplayMode:"text",adminIdentityDisplayMode:"text",honorLevelDisplayMode:"text"}:{}),identityPriority:state.adminFirst?["admin","captain","admiral","viceroy","anchor","normal"]:["captain","admin","admiral","viceroy","anchor","normal"],usePriceGradient:state.gradient===true,showTimestamp:state.timestamp===true},priceGradient:normalizePriceGradient(state.gradientModel,state.theme)};
 const projection=builtin ? projectNativeTheme({...builtin,settings:themeSettings,styles:{...builtin.styles,customCss:state.customCss??builtin.styles.customCss}}) : null;
 const presentation=resolveLiveNativeThemePresentation({
   eventFontSize:state.baseSize??16,eventStyleSettings:themeSettings,
   displayPreferences:{...DEFAULT_EVENT_DISPLAY_PREFERENCES,showAvatar:state.avatar,showEventIcon:state.icons!==false,eventPadding:8,eventSpacing:8,eventAnimationPreset:'none'}
 },projection,state.contentScale??1);
 const {eventFontSize:fontSize,displayPreferences:preferences}=presentation;
 const area=useEventAreaStyle({settings:presentation.eventStyleSettings,layout:state.target==='live'?'live':'window',fontSize,padding:preferences.eventPadding,spacing:preferences.eventSpacing});
 const honor=getNativeEventSample('honor');honor.honor={firstLine:'恭喜主播<%星瞳_Official%>',secondLine:'舰队规模突破<%1000%>',threshold:1000,effectId:5787};honor.broadcaster={uid:'401315430',uname:'星瞳_Official',avatar:'/media/native-preview/guard-redpocket-sender.jpg',guardLevel:0,isAnchor:true};
 const banners=['路途与旅人','很长很长的用户昵称用于验证身份换行'].map((uname,index)=>({...getNativeEventSample('banner-emote'),id:`banner-${index}`,user:{uid:'banner-user',uname,guardLevel:0 as const,wealthLevel:5,medal:{level:25,name:'德云色',color:6729215}},text:'打call',emoticon:{url:'http://i0.hdslb.com/bfs/live/fa1eb4dce3ad198bb8650499830560886ce1116c.png',width:195,height:60,unique:'official_146'}}));
 const typography=[...['text','normal-gift','free-gift','blind-gift','guard','translated-sc','lottery-start','lottery-result','pocket-start','pocket-result','entry','live-start','live-end','warning','cutoff'].map(getNativeEventSample),honor];
 const exampleKeys = ['body-long','identity-admin-guard','long-username','interaction-entry','gift-band-0','gift-quantity-128','gift-free','blind-loss','guard-1-开通','sc-translation','sc-recalled','lottery-complete','lottery-result','redpocket-1','redpocket-result','honor-1000','live-start','warning-captured'];
 const fixtureNow=1700000030000;
 const events=state.designKeys ? projectNativePreviewActivities(createStylePreviewDesignEvents('混合流').filter(event=>state.designKeys.includes(event.id.replace('native-design:', ''))),fixtureNow,true) : state.sampleKeys ? state.sampleKeys.map(key=>key==='honor'?honor:getNativeEventSample(key)) : state.semantic ? projectNativePreviewActivities(createStylePreviewDesignEvents('混合流').filter(event=>exampleKeys.includes(event.id.replace('native-design:', ''))),fixtureNow,true) :state.deletedOnly?[{...getNativeEventSample('text'),text:'测试撤回消息内容',danmuDeleted:true},getNativeEventSample('deleted-sc')]:state.typographyOnly?typography:state.emotesOnly?[...banners,getNativeEventSample('big-emote'),getNativeEventSample('text')]:[honor,...['normal-gift','guard','sc','lottery-start','pocket-start'].map(getNativeEventSample)];
 if(state.eventChanges)for(const event of events)Object.assign(event,state.eventChanges);
 if(state.filterName)for(const event of events)if((event.msgType===MsgType.Danmu||event.msgType===MsgType.Interact)&&event.user)event.user={...event.user,uname:state.filterName};
 const menu={regionKey:'fixture',onSpeakEvent(){},isFavorite:()=>false,onToggleFavorite(){}};
 const review=state.target==='review';
 const target=review?'review':state.target==='window'?'theme-target-windows window window-pay gift-window-log':'theme-target-live live scene-live-list';
 const css=state.theme==='card'?cardCss:state.theme==='bubble'?bubbleCss:defaultCss;
 return <div className={state.dark?'dark':''}>
  <nav style={{display:'flex',gap:12,padding:12,flexWrap:'wrap'}}>
   <label>主题<select value={state.theme} onChange={e=>setState({...state,theme:e.target.value})}><option value="default">默认</option><option value="card">卡片</option><option value="bubble">气泡</option></select></label>
   <button onClick={()=>setState({...state,width:420,baseSize:16,typographyOnly:true})}>正常宽度</button>
   <button onClick={()=>setState({...state,width:260,baseSize:24,typographyOnly:true})}>窄宽度大字号</button>
   <label><input type="checkbox" checked={state.gradient===true} onChange={e=>setState({...state,gradient:e.target.checked})}/>价格梯度</label>
   <label><input type="checkbox" checked={state.dark} onChange={e=>setState({...state,dark:e.target.checked})}/>深色</label>
   <label><input type="checkbox" checked={state.adminFirst===true} onChange={e=>setState({...state,adminFirst:e.target.checked})}/>房管优先</label>
  </nav>
  <style>{!review && (projection ? scopeThemeCss(projection.css,'.fixture-surface') : scopeThemeCss(assignNativeCssLayer(css,'default')+assignNativeCssLayer(renderPriceGradientCss(themeSettings.priceGradient,state.gradient===true),'config'),'.fixture-surface'))}</style>
  <div className={state.target==='window'?'gift-window flex flex-col':''} style={{width:state.width,height:state.target==='window'?500:undefined,background:state.dark?'#171c22':'#f7f9fa'}}>
   <div className={`${review?'':'theme-surface'} fixture-surface event-area ${target} ${state.target==='window'?'min-h-0 flex-1 overflow-y-auto':''}`} data-fixture-case={state.caseId} data-event-style-scope={area.scope}>
    {!review && area.style}<div className={state.target==='window'?'event-list gift-window-event-list':'event-list'}>
     {state.previewContext ? <StylePreviewArea context={state.previewContext} mode="all" events={events} eventStyleSettings={presentation.eventStyleSettings} displayPreferences={preferences} eventFontSize={fontSize} windowEventFontSize={fontSize} previewMotion="static" previewNow={fixtureNow} /> : events.map((event,index)=>{
      const row=<EventRow ev={event} onUserFilter={state.semantic && !review ? user => window.dispatchEvent(new CustomEvent('fixture-user-filter',{detail:user.uname})) : undefined} activityNow={state.semantic ? fixtureNow : undefined} liveLayout={!review} reviewLayout={review} archiveLayout={review} allowWinnerExpansion={state.semantic || state.baseSizeCase} showTime={review || state.timestamp===true} animateOnMount={false} displayPreferences={preferences} eventStyleSettings={presentation.eventStyleSettings} eventFontSize={fontSize} eventMenu={state.target==='live'?menu:undefined} giftEffectResolver={state.clickable===false?undefined:()=>({id:5787,giftIds:[],planPlatforms:[1,2],webMp4:'5787.mp4',webMp4Json:'5787.json'})} onPlayGiftEffect={state.clickable===false?undefined:()=>{}} />
      return state.noSlots ? <Fragment key={event.id}>{row}</Fragment> : <EventRowSlot key={event.id} className="event-row-slot" contentScale={presentation.displayScale} showEventSpacing={index<events.length-1}>{row}</EventRowSlot>;
     })}
    </div>
   </div>
  </div>
 </div>;
}
if(typeof document!=='undefined'){document.body.style.margin='0';createRoot(document.getElementById('root')!).render(<NativeLayoutFixture/>);}
