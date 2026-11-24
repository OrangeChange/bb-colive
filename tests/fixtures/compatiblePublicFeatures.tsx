import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import {CompatibleListSurface} from '../../src/compat/CompatibleListSurface';
import {dispatchCompatibleLiveAction} from '../../src/compat/compatibleLiveBridge';
import {projectBlivechatCallback} from '../../src/compat/blivechat/projection';
import {projectOpenLiveCallback} from '../../src/compat/openlive/projection';
import {projectLaplaceEvent} from '../../src/compat/laplace/projection';
import {DEFAULT_LAPLACE_SETTINGS} from '../../src/compat/laplace/settings';
import type {DanmakuEvent} from '../../src/protocol/types';
import type {CompatibleListSurfaceDescriptor} from '../../src/compat/CompatibleEventRenderer';
const base={roomId:1,ts:Date.now(),user:{uid:'100',uname:'发送者',guardLevel:0 as const}};
const sourceGift={type:'gift',origin:1,originIdx:0,timestampNormalized:Date.now(),uid:100,username:'发送者',coinType:'gold',giftId:25,message:'礼物',giftAmount:1,priceNormalized:30,receiver:{uid:300,uname:'收礼对象',master:{room_id:2}},bizSource:'voice_chat_room'};
const initialEvents=[
 {...base,id:'shared-text',msgType:0,text:'回复正文',replyTo:{uid:'200',uname:'回复对象',guardLevel:0}},
 {...base,id:'shared-gift',msgType:1,gift:{id:25,name:'礼物',count:1,price:30000,total:30000,coinType:'gold'},laplace:{sourceMode:'direct',sourceCommand:'SEND_GIFT',event:sourceGift}},
 {...base,id:'shared-result',msgType:7,lottery:{winners:[{uid:'400',uname:'中奖者'}],awardName:'奖品'}},
] as DanmakuEvent[];
function App(){
 const [names,setNames]=useState<Record<string,string>>({}),[events,setEvents]=useState(initialEvents),[masked,setMasked]=useState(false);
 Object.assign(window,{setCompatibleNames:setNames,setCompatibleRecalled:(value:boolean)=>setEvents(old=>old.map(e=>e.id==='shared-text'?{...e,danmuDeleted:value}:e)),setCompatibleMasked:setMasked,selectedCompatibleUsers:(window as any).selectedCompatibleUsers??[]});
 const config={showDanmaku:true,showGift:true,showGiftName:true,maxNumber:60,mergeGift:false,mergeSimilarDanmaku:false,minGiftPrice:0,hostPaidFilter:true};
 const descriptors:Record<string,CompatibleListSurfaceDescriptor>={
  blc:{url:'/blivechat/renderer.html',protocol:'bb-blivechat',css:'',config,project:projectBlivechatCallback},
  open:{url:'/openlive/renderer.html',protocol:'bb-openlive',css:'',config,project:projectOpenLiveCallback},
  laplace:{renderer:'laplace',url:'/laplace/product/index.html',protocol:'bb-laplace',css:'',config:{...DEFAULT_LAPLACE_SETTINGS,showMedal:true},project:(event,sequence)=>projectLaplaceEvent(event,{roomId:1,generation:1},sequence,event.ts)?.event??null},
 };
 return <div style={{display:'flex',gap:16}}>{Object.entries(descriptors).map(([key,value])=>{
  const descriptor={...value,maskUsername:masked,eventDecision:(event:DanmakuEvent)=>value.project(event,1)?'render' as const:'omit' as const};
  return <section key={key} data-mode={key} style={{width:400,height:800}}><CompatibleListSurface descriptor={descriptor} events={events} userNicknames={names} direction="top" contentAlignment="top" renderMode="dashboard" dispatch={(eventId,action)=>{const event=events.find(e=>e.id===eventId);return !!event&&dispatchCompatibleLiveAction(event,action,{onFilterUser:user=>(window as any).selectedCompatibleUsers.push(user.uid)})}} /></section>
 })}</div>
}
createRoot(document.getElementById('root')!).render(<App/>);
