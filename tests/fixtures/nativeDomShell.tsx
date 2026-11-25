import '../../src/shadcn.css';
import '../../src/components/nativeThemeEditor.css';
import '../../src/obs/obs.css';
import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import {StylePreviewArea} from '../../src/components/StylePreviewArea';
import {ObsOutputView} from '../../src/obs/ObsOutputView';
import {EventList} from '../../src/components/EventList';
import {ReviewOwnerEventResults} from '../../src/components/ReviewOwnerEventResults';
import {createFeedScrollSession} from '../../src/events/feedScroll';
import {createBuiltinNativeTheme} from '../../src/themes/nativeBuiltinThemes';
import {projectNativeTheme} from '../../src/themes/nativeThemeProjection';
import {DEFAULT_EVENT_DISPLAY_PREFERENCES} from '../../src/eventDisplaySettings';
import {DEFAULT_STICKY_EVENT_SETTINGS,selectStickyEvents} from '../../src/windows/stickyEventModel';
import {createStylePreviewDesignEvents} from '../../src/components/stylePreviewEvents';
import {projectNativePreviewActivities} from '../../src/preview/nativePreviewActivities';

function Shell(){
 const [state,setState]=useState<any>({mode:'preview',theme:'default',width:480,size:16,dark:false,scale:1,alignment:'top'});
 (window as any).setNativeShellCase=setState;
 const doc=createBuiltinNativeTheme(state.theme==='card'?'native-card':state.theme==='bubble'?'native-bubble':'native-default');
 doc.settings.display.showAvatar=true;doc.settings.display.showTimestamp=true;
 const projected=projectNativeTheme(doc);
 const preferences={...DEFAULT_EVENT_DISPLAY_PREFERENCES,showAvatar:true,showHonorLevel:true,showCurrentRank:true,showTimestamp:true,eventAnimationPreset:'none' as const};
 const keys=['body-long','identity-admin-guard','gift-band-0','gift-free','blind-loss','guard-1-开通','sc-translation','sc-recalled','lottery-complete','lottery-result','redpocket-1','redpocket-result','honor-1000','live-start','warning-captured'];
 const now=1700000030000;
 const events=projectNativePreviewActivities(createStylePreviewDesignEvents('混合流').filter(e=>keys.includes(e.id.replace('native-design:',''))),now,true);
 const stickyEvents={...DEFAULT_STICKY_EVENT_SETTINGS,enabled:true,obsEnabled:true,giftThreshold:0,maxCount:8};
 const snapshot={mode:'native' as const,targetId:'shell',roomId:null,themeId:doc.themeId,revision:1,settings:projected.settings,display:doc.settings.display,displayPreferences:preferences,eventFontSize:state.size,css:projected.css,displayScale:state.scale,stickyEvents,savedAt:''};
 const candidates=selectStickyEvents(events,stickyEvents,now);
 const event=events.find(e=>e.id==='native-design:lottery-result')!;
 const record={eventKey:event.id,eventTs:event.ts,userName:'测试用户',roomId:1,payloadJson:JSON.stringify(event)};
 const page={items:[{session:{sessionId:'shell',roomId:1,startedAt:now,title:'测试场次',status:'ended',recordingStatus:'complete',quality:'complete'},matchCount:1,latestMatchTs:event.ts,matches:[record]}],nextOffset:null,hasMore:false};
 return <div className={state.dark?'dark':''} data-case={state.id} style={{width:state.width,height:760,background:state.dark?'#171c22':'#fff'}}>
 {state.mode==='obs'?<ObsOutputView events={events} snapshot={snapshot} stickyCards={candidates} stickyEvents={stickyEvents} scrollDirection="bottom" contentAlignment={state.alignment} softwareDisplay={preferences} now={now}/>:state.mode==='search'?<ReviewOwnerEventResults page={page as any} loading={false} error={null} hasConditions onOpenMatch={()=>{(window as any).opened=((window as any).opened??0)+1}} onLoadMore={()=>{}} onRetry={()=>{}} onClear={()=>{}}/>:state.mode==='live'?<EventList key={state.id} events={Array.from({length:8},(_,i)=>events.map(e=>({...e,id:e.id+i}))).flat()} visibleIndices={Array.from({length:8*events.length},(_,i)=>i)} viewKey="shell" feedKey="shell" feedSession={createFeedScrollSession(0)} liveLayout eventStyleSettings={projected.settings} displayPreferences={preferences} eventFontSize={state.size} displayScale={state.scale} contentAlignment={state.alignment}/>:<><style>{projected.css}</style><StylePreviewArea context="obs" mode="all" events={events} eventStyleSettings={projected.settings} displayPreferences={preferences} eventFontSize={state.size} windowEventFontSize={state.size} showStickyPreview stickySettings={stickyEvents} previewNow={now}/></>}
 </div>;
}
document.body.style.margin='0';createRoot(document.getElementById('root')!).render(<Shell/>);
