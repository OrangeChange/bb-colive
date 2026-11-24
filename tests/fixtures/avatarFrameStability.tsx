import { useState } from 'react';
import { EventList } from '../../src/components/EventList';
import { DEFAULT_EVENT_DISPLAY_PREFERENCES } from '../../src/eventDisplaySettings';
import { createFeedScrollSession } from '../../src/events/feedScroll';
import { MsgType, type DanmakuEvent } from '../../src/protocol/types';

export function AvatarFrameStability() {
  const [events,setEvents]=useState<DanmakuEvent[]>([]);
  const [session]=useState(()=>createFeedScrollSession(0));
  const [frame,setFrame]=useState(true);
  const [top,setTop]=useState(true);
  const [longName,setLongName]=useState(false);
  return <section data-avatar-stability>
    <button onClick={()=>setFrame(v=>!v)}>切换头像框</button>
    <button onClick={()=>setTop(v=>!v)}>切换追加方向</button>
    <button onClick={()=>setLongName(v=>!v)}>切换长昵称</button>
    <button onClick={()=>setEvents(current=>[...current,{id:`avatar-stability-${current.length}`,reactKey:`avatar-stability-${current.length}`,
      roomId:1,ts:1700000000000+current.length,msgType:MsgType.Danmu,text:'相同尺寸的文字消息',
      user:{uid:'fixture-user',uname:longName?'这是一个比较长而且带有身份标记的观众昵称用于测量首帧变化'.repeat(2):'测试用户',avatar:'/media/noface.gif',guardLevel:1,guardMilestone:'thousand'}}])}>追加头像样本</button>
    <div style={{height:420,width:600}}>
      <EventList events={events} visibleIndices={events.map((_,i)=>i)} viewKey="avatar-stability" feedKey="avatar-stability" feedSession={session}
        liveLayout scrollDirection={top?'top':'bottom'} displayPreferences={{...DEFAULT_EVENT_DISPLAY_PREFERENCES,showAvatarFrame:frame,eventAnimationPreset:'slide',eventAnimationDurationMs:200}} />
    </div>
  </section>;
}
