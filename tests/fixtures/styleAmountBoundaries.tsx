import {resolveObsRenders} from "../../src/obs/obsRenders.ts";
import {compatibleEventDecisionOf} from "../../src/compat/CompatibleEventRenderer.tsx";
import {createDefaultNativeEventVisibility} from "../../src/themes/nativeComponentAppearance.ts";
import {createRoot} from "react-dom/client";
import {ObsStateView} from "../../src/obs/ObsStateView.tsx";
import {createObsOutputState} from "../../src/obs/obsOutputState.ts";
import {createObsSnapshot} from "../../src/obs/createObsSnapshot.ts";
import {createBuiltinNativeTheme} from "../../src/themes/nativeBuiltinThemes.ts";
import {createCompatibleThemeModeAdapter} from "../../src/themes/themeModeAdapters.ts";
import {DEFAULT_EVENT_WINDOW_PREFERENCES} from "../../src/windows/eventWindowPreferences.ts";
import type {DanmakuEvent} from "../../src/protocol/types.ts";
import type {CompatibleThemeMode} from "../../src/themes/themeTypes.ts";
import "../../src/compat/blivechat/register.tsx";import "../../src/compat/openlive/register.tsx";import "../../src/compat/laplace/register.tsx";
import "../../src/App.css";import "../../src/obs/obs.css";
const q=new URLSearchParams(location.search),mode=q.get('mode')??'native',scenario=q.get('scenario')??'low',now=Date.now();
const document=mode==='native'?createBuiltinNativeTheme('native-default'):createCompatibleThemeModeAdapter(mode as CompatibleThemeMode).createBuiltinTheme();
if(mode==='laplace')document.settings.showGiftHighlightAbove=Number(q.get('highlight')??30);
const amounts=scenario==='low'?[.09,.10,.11]:[29.99,30,30.01,49.99,50,50.01];
const rows:DanmakuEvent[]=amounts.flatMap((amount,index)=>(scenario==='low'?[1]:[1,2,3]).map(type=>({id:`amount-${type}-${index}`,roomId:1,ts:now,msgType:type,text:`金额 ${amount}`,user:{uid:String(type*100+index),uname:`用户${type}-${index}`,phoneVerified:true},...(type===1?{gift:{id:30000+index,name:`礼物${index}`,count:scenario==='low'?2:1,price:Math.round(amount*1000),total:Math.round(amount*(scenario==='low'?2:1)*1000),priceRmb:amount,totalRmb:amount*(scenario==='low'?2:1),paymentRmb:amount*(scenario==='low'?2:1),coinType:'gold' as const}}:type===2?{sc:{price:amount,message:'金额边界',duration:60}}:{guard:{level:1 as const,count:1,priceRmb:amount,unit:'月'}})})));
if(scenario==='low')rows.push({id:'unknown',roomId:1,ts:now,msgType:1,user:{uid:'888',uname:'未知价格',phoneVerified:true},gift:{id:39999,name:'未知价格',count:1,price:0,total:0,coinType:'unknown'}},{id:'blind',roomId:1,ts:now,msgType:1,user:{uid:'999',uname:'盲盒',phoneVerified:true},gift:{id:39998,name:'开出礼物',count:1,price:60000,total:60000,priceRmb:60,totalRmb:60,paymentRmb:.09,blindGiftName:'盲盒',blindPriceRmb:.09,coinType:'gold'}});
if(scenario==='filters'){
 document.settings.eventVisibility=createDefaultNativeEventVisibility();
 const normal={roomId:1,ts:now,msgType:0,text:'普通弹幕',user:{uid:'1',uname:'验收用户',phoneVerified:true}};
 rows.splice(0,rows.length,...[
 {...normal,id:'normal'}, {...normal,id:'auto',isAutoDanmaku:true},
 {...normal,id:'unverified',user:{...normal.user,phoneVerified:false}},
 {...normal,id:'unknown-phone',user:{...normal.user,phoneVerified:undefined}},
 {...normal,id:'normal-entry',msgType:10,interactKind:'entry'},
 {...normal,id:'guard-entry',msgType:10,interactKind:'entry',user:{...normal.user,guardLevel:1}},
 {...normal,id:'follow',msgType:10,interactKind:'follow'},
 {...normal,id:'like',msgType:10,interactKind:'like',likeCount:3},
 ] as DanmakuEvent[]);
}
const preferences={...DEFAULT_EVENT_WINDOW_PREFERENCES,capacity:100,giftThreshold:scenario==='low'?.1:0,giftThresholdMode:q.get('calc')==='cumulative'?'cumulative' as const:'unit' as const,stickyEvents:{...DEFAULT_EVENT_WINDOW_PREFERENCES.stickyEvents,enabled:true,obsEnabled:true,giftThreshold:Number(q.get('sticky')??30),maxCount:30},display:{...DEFAULT_EVENT_WINDOW_PREFERENCES.display,eventAnimationPreset:'none' as const,...(scenario==='filters'?{showAutoDanmaku:false,showPhoneNotVerified:false,onlyGuardEntry:true}:{})}};
const snapshot=createObsSnapshot(document,'boundary','1',.9,preferences.stickyEvents);
const render=resolveObsRenders(snapshot);
const model=createObsOutputState(1,preferences,{allowsMain:event=>!render.main||compatibleEventDecisionOf(render.main,event)!=='omit',allowsSticky:event=>!render.sticky||compatibleEventDecisionOf(render.sticky,event)!=='omit'});for(const row of rows)model.accept(row,now);const projected=model.snapshot(now);
const state={type:'state' as const,identity:'boundary',sequence:1,snapshot,...projected,preferences,scheme:'light' as const,connection:{status:'connected' as const,roomId:1},roomUpdates:[]};
createRoot(globalThis.document.getElementById('root')!).render(<><output>{JSON.stringify({ids:projected.events.map(e=>e.id),sticky:projected.sticky.map(c=>c.event.id)})}</output><div style={{width:600,height:900}}><ObsStateView state={state}/></div></>);
