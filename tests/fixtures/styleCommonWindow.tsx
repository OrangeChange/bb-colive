import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import {FloatingEventWindow} from '../../src/windows/FloatingEventWindow.tsx';
import {nativeEventBrowserPorts as ports} from '../helpers/nativeEventBrowserPorts.ts';
import * as channels from '../../src/windows/eventWindowChannels.ts';
import {DEFAULT_EVENT_WINDOW_PREFERENCES,EVENT_WINDOW_PREFERENCES_EVENT} from '../../src/windows/eventWindowPreferences.ts';
import {installCompatibleEventRenderResolver} from '../../src/compat/CompatibleEventRenderer.tsx';
import {createCompatibleThemeModeAdapter} from '../../src/themes/themeModeAdapters.ts';
import {resolvePublishedBlivechatRender} from '../../src/compat/blivechat/runtime.tsx';
import {resolvePublishedOpenLiveRender} from '../../src/compat/openlive/runtime.tsx';
import {resolvePublishedLaplaceRender} from '../../src/compat/laplace/runtime.tsx';
import '../../src/compat/blivechat/register.tsx';
import '../../src/compat/openlive/register.tsx';
import '../../src/compat/laplace/register.tsx';
import '../../src/App.css';
const q=new URLSearchParams(location.search),mode=q.get('mode')??'native';
const kind=ports.label as channels.EventWindowKind,c=kind==='display'?{readyEvent:channels.DISPLAY_READY_EVENT,readyAckEvent:channels.DISPLAY_READY_ACK_EVENT,roomChangedEvent:channels.DISPLAY_ROOM_CHANGED_EVENT,eventName:channels.DISPLAY_EVENT_NAME}:channels.revenueWindowChannels(kind);
const room={roomId:1,generation:1};
const preferences={...DEFAULT_EVENT_WINDOW_PREFERENCES,scrollDirection:q.get('direction')==='top'?'top':'bottom',contentAlignment:q.has('legacy')?undefined:q.get('alignment')==='bottom'?'bottom':'top',display:{...DEFAULT_EVENT_WINDOW_PREFERENCES.display,eventAnimationPreset:q.get('animation')??'none',eventAnimationDurationMs:Number(q.get('duration')??200)}};
if(q.has('effects'))preferences.showGiftEffect=true;
if(q.has('capacity'))preferences.capacity=Number(q.get('capacity'));
if(mode!=='native'){
  const document=createCompatibleThemeModeAdapter(mode as any).createBuiltinTheme();
  installCompatibleEventRenderResolver(context=>{
    const current={document,context:{target:'windows',targetId:'windows',roomId:'1'}} as any;
    return mode==='blivechat'?resolvePublishedBlivechatRender(current,context):mode==='blivechat-open'?resolvePublishedOpenLiveRender(current,context):resolvePublishedLaplaceRender(current,context);
  });
}
let ready=false,count=0;const listeners=new Set<()=>void>();
await ports.listen(c.readyEvent,async()=>{await ports.emitTo(kind,c.roomChangedEvent,room);await ports.emitTo(kind,c.readyAckEvent,room);await ports.emitTo(kind,EVENT_WINDOW_PREFERENCES_EVENT,preferences);ready=true;listeners.forEach(fn=>fn());},'main');
function App(){const [active,setActive]=useState(ready);listeners.add(()=>setActive(true));return <><FloatingEventWindow kind={kind}/><button style={{position:'fixed',right:0,top:0,zIndex:100}} disabled={!active} onClick={()=>{const n=++count;void ports.emitTo(kind,c.eventName,{id:`window-${n}`,roomId:1,roomGeneration:1,generation:1,ts:Date.now(),msgType:kind==='display'?0:kind==='superchat'?2:kind==='guard'?3:1,text:`事件 ${n}`,user:{uid:String(n),uname:`验收用户 ${n}`},...((kind==='gift'||kind==='gift-only')?{gift:{id:1,name:'礼物',count:1,price:50000,total:50000,priceRmb:50,totalRmb:50,paymentRmb:50,coinType:'gold'}}:{}),...(kind==='superchat'?{sc:{price:50,message:`事件 ${n}`,duration:60}}:{}),...(kind==='guard'?{guard:{level:3,count:1,priceRmb:198}}:{})});}}>追加事件</button></>}
createRoot(document.getElementById('root')!).render(<App/>);
for(const [text,key]of [['切换最新位置','scrollDirection'],['切换内容对齐','contentAlignment']] as const){
  const button=document.createElement('button');button.textContent=text;button.style.cssText=`position:fixed;right:0;top:${key==='scrollDirection'?80:120}px;z-index:100`;
  button.onclick=()=>{preferences[key]=preferences[key]==='top'?'bottom':'top';void ports.emitTo(kind,EVENT_WINDOW_PREFERENCES_EVENT,{...preferences});};document.body.append(button);
}
if(kind==='gift'||kind==='gift-only'){
  let sequence=0;
  const button=document.createElement('button');button.textContent='播放窗口特效';button.style.cssText='position:fixed;right:0;top:40px;z-index:100';
  button.onclick=()=>void ports.emitTo(kind,channels.revenueWindowChannels(kind).effectEvent,{event:{id:`vap-${++sequence}`,roomId:1,__roomGeneration:1,ts:Date.now(),msgType:1},resource:{id:2071,giftIds:[34868],planPlatforms:[2],webMp4:'/.superpowers/sdd/2026-11-01-style-common-behavior/effect.mp4',webMp4Json:'/.superpowers/sdd/2026-11-01-style-common-behavior/effect.json'}});
  document.body.append(button);
}
