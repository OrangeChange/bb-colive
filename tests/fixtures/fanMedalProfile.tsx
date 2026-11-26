import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { EventRow } from '../../src/components/EventRow';
import { MsgType } from '../../src/protocol/types';
import { applyThemeToDocument } from '../../src/theme';
import { setUiLanguage } from '../../src/i18n';
import { EventContextMenu } from '../../src/components/EventContextMenu';
import { observeCompatibleMedals, compatibleElementBounds } from '../../src/compat/compatibleRowInteraction';
import { FanMedalProfile } from '../../src/components/FanMedalProfile';
import { useState } from 'react';
import '../../src/shadcn.css';
const params = new URLSearchParams(location.search);
setUiLanguage(params.get('lang') || 'zh-CN');
applyThemeToDocument('sakura', params.has('dark') ? 'dark' : 'light');
mockWindows('main');
Object.assign(window,{profileRequests:0,profileFail:false,openedProfileUrls:[]});
let rid=0;const reads=new Set<number>();
mockIPC(async (cmd,args:any) => {
 if(cmd==='plugin:http|fetch'){(window as any).profileRequests++;return ++rid;}
 if(cmd==='plugin:http|fetch_send')return {rid:args.rid,status:200,statusText:'OK',url:'https://api.live.bilibili.com/live_user/v1/Master/info',headers:[]};
 if(cmd==='plugin:http|fetch_read_body'){
  if(reads.has(args.rid))return [1];reads.add(args.rid);
  const response=(window as any).profileFail?{code:-1,message:'加载失败'}:{code:0,data:{info:{uname:'所属主播',face:'/icon.svg'},follower_num:123456,room_id:1024}};
  return [...new TextEncoder().encode(JSON.stringify(response)),0];
 }
 if(cmd==='plugin:opener|open_url'){(window as any).openedProfileUrls.push(args.url);return;}
 if(cmd==='plugin:store|load')return 1;
 if(cmd==='plugin:store|get')return [null,false];
 return null;
},{shouldMockEvents:true});
const event={id:'medal-event',roomId:1,ts:Date.now(),msgType:MsgType.Danmu,text:'你好',user:{uid:'99',uname:'观众',avatar:'/icon.svg',guardLevel:0 as const,medal:{name:'牌子',level:25,isLighted:true,anchorUid:params.has('unknown')?undefined:'2'}}};
const menu={regionKey:'fixture',onSpeakEvent:()=>{},isFavorite:()=>false,onToggleFavorite:()=>{}};
const client=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
function Fixture(){
 const [compat,setCompat]=useState<any>(null);
 const [remote,setRemote]=useState<any>(null);
 return <div onWheel={ev=>{if(params.has('wheel-trap') && !ev.currentTarget.contains(ev.target as Node)){ev.preventDefault();ev.currentTarget.scrollTop+=ev.deltaY;}}} data-event-overlay-region={params.has("bounds") ? "fixture" : undefined} style={params.has("bounds") ? {position:"fixed",left:72,top:104,width:600,height:240,overflow:"auto",border:"1px solid",padding:8} : {padding:24}}>
  <section data-scene="live"><EventRow ev={event} liveLayout eventMenu={menu} /></section>
  <section data-scene="review" style={{marginTop:32}}><EventRow ev={event} reviewLayout eventMenu={menu} /></section>
  <section data-scene="output" style={{marginTop:32}}><EventRow ev={event} /></section>
  <iframe title="compatible" style={{marginTop:32,width:300,height:80}} srcDoc={'<div data-event-id="medal-event"><div class="fans-medal">兼容粉丝牌</div></div>'}
   onLoad={e=>{
     const frame=e.currentTarget;
     observeCompatibleMedals(frame,(_,anchor,getAnchorRect)=>setCompat({medal:event.user.medal,anchor,getAnchorRect}));
     frame.contentDocument?.addEventListener('contextmenu', ev=>{
       ev.preventDefault();const host=frame.getBoundingClientRect(),node=frame.contentDocument!.querySelector<HTMLElement>('.fans-medal')!;
       setRemote({revision:Date.now(),left:host.left+ev.clientX,top:host.top+ev.clientY,getAnchorRect:()=>compatibleElementBounds(frame,node)});
     });
   }} />
  {remote && <EventContextMenu event={event} shortcutActions={[]} handlers={menu} remoteOpenRequest={remote} getAnchorRect={remote.getAnchorRect} onInteractionChange={active=>{if(!active)setRemote(null);}} />}
  {params.has("bounds") && <div style={{height:500}} />}
  {compat&&<FanMedalProfile medal={compat.medal} anchor={compat.anchor} getAnchorRect={compat.getAnchorRect} onClose={()=>setCompat(null)} />}
 </div>;
}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><Fixture /></QueryClientProvider>);
