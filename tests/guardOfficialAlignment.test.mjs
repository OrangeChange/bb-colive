import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import * as effects from '../src/protocol/giftEffects.ts';

let vite;
test.after(async()=>{await vite?.close()});
async function load(path){
 vite??=await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-guardOfficialAlignment.test.mjs",configFile:false,server:{middlewareMode:true,watch:null},optimizeDeps:{noDiscovery:true,include:[]},logLevel:'silent'});
 return vite.ssrLoadModule(path);
}
const tiers=[[100,5783],[666,5784],[888,5786],[1000,5787],[1314,5782],[2233,5788],[5200,5789],[10000,5790]];
const resources=[590,5843,5844,5845,5849,5850,5851,5852,5853,591,592,1485,...tiers.map(t=>t[1])].map(id=>({id,giftIds:[],planPlatforms:[1,2],webMp4:`${id}.mp4`,webMp4Json:`${id}.json`}));
const context=()=>({roomId:22886883,anchorUid:'401315430',anchorName:'星瞳_Official',viewerUid:'7'});
const glory=id=>({cmd:'GUARD_FAME_GLORY_EVENT',data:{ruid:401315430,effect_id:id,danmu_area:{face:'https://example.com/anchor.png',headmap_url:'https://example.com/frame.png',guard_reach_url:'https://example.com/reach.png'}}});
const legacy=count=>({cmd:'GUARD_ACHIEVEMENT_ROOM',data:{event_type:1,anchor_guard_achieve_level:count,current_achievement_level:3,first_line_content:'恭喜主播<%星瞳_Official%>',second_line_content:`舰队规模突破<%${count}%>`,face:'https://example.com/anchor.png'}});

test('官方非展示成就报文不生成突破0事件，也不占用成就去重状态',async()=>{
 const {adapt}=await load('/src/protocol/adapter.ts');
 const ctx=context();
 const message={cmd:'GUARD_ACHIEVEMENT_ROOM',data:{event_type:2,anchor_guard_achieve_level:0,current_achievement_level:1,first_line_content:'恭喜主播<%老飞宇66%>',second_line_content:'舰队规模突破<%0%>',headmap_url:''}};
 assert.equal(adapt(message,ctx),null);
 assert.equal(ctx.guardHonorSeen,undefined);
 assert.equal(message.data.second_line_content,'舰队规模突破<%0%>');
 assert.ok(adapt(legacy(100),ctx));
});

test('旧成就通知仅展示官方数值类型1，其他类型不按成就展示',async()=>{
 const {adapt}=await load('/src/protocol/adapter.ts');
 for(const eventType of [0,2,undefined,'1']){
  const message=legacy(1000);message.data.event_type=eventType;
  const ctx=context();
  assert.equal(adapt(message,ctx),null);
  assert.ok(adapt(glory(5787),ctx));
 }
 assert.equal(adapt(legacy(1000),context()).honor.threshold,1000);
});

test('时长各部分的可视化继承字重与大航海正文一致',async()=>{
 const {nativeVisualCodeDefault}=await load('/src/themes/nativeThemeDefaults.ts');
 const {createBuiltinNativeTheme}=await load('/src/themes/nativeBuiltinThemes.ts');
 for(const part of ['guardDuration','guardDurationPrefix','guardDurationNumber','guardDurationUnit','quantityPrefix','quantityUnit']){
  assert.equal(nativeVisualCodeDefault({event:'guard',identity:'all',part},'fontWeight',createBuiltinNativeTheme('native-default').settings),700);
 }
});

test('特殊来源1485按消息播放，即使官方资源分类为礼物且绑定33972',()=>{
 const config={full_sc_resource:{conf_list:[{id:1485,type:1,bind_gift_ids:[33972],plan_platform:[1,2],web_mp4:'1485.mp4',web_mp4_json:'1485.json'}]}};
 const resource=effects.resolveGuardEffect(effects.parseGuardEffectResources(config),{level:1,count:1,effect:{source:1,roomEffectId:590,roomGiftEffectId:1485}},'昵称');
 assert.equal(resource?.id,1485);
 assert.equal(effects.resolveGiftEffect(effects.parseGiftEffectResources(config),{id:33973,effect:2,effectId:1485}),null);
});

test('官方联合上舰优先，来源与本人决定房间动画，屏蔽保留本人例外',()=>{
 const resolve=effect=>effects.resolveGuardEffect(resources,{level:1,count:1,effect},'昵称');
 assert.equal(resolve({isGroup:true,groupName:'联合舰队',source:1,roomGroupEffectId:591,roomGiftEffectId:1485})?.id,591);
 assert.equal(resolve({isGroup:true,groupName:'联合舰队',roomGroupEffectId:591})?.username,'联合舰队');
 assert.equal(resolve({source:1,roomEffectId:5850,roomGiftEffectId:1485})?.id,1485);
 assert.equal(resolve({source:2,isSelf:true,roomEffectId:5850}),null);
 assert.equal(resolve({source:2,isSelf:false,roomEffectId:5850})?.id,5850);
 assert.equal(resolve({blocked:true,isSelf:true,roomEffectId:5850})?.id,5850);
 assert.equal(resolve({blocked:true,isSelf:false,roomEffectId:5850}),null);
 assert.equal(resolve({roomEffectId:0,shipEffectId:5850}),null);
 assert.equal(resolve({source:3,roomEffectId:5850}),null);
 for(const id of [590,5843,5844,5845,5849,5850,5851,5852,5853,591,592])assert.equal(resolve({roomEffectId:id})?.id,id);
});

test('八档荣耀消息保留官方编号、档位及头像，自动和手动可解析成就动画',async()=>{
 const {adapt}=await load('/src/protocol/adapter.ts');
 const {MsgType}=await load('/src/protocol/types.ts');
 for(const [threshold,id] of tiers){
  const e=adapt(glory(id),context());
  assert.equal(e?.msgType,MsgType.GuardHonor);
  assert.equal(e.honor.threshold,threshold);
  assert.equal(e.honor.effectId,id);
  assert.equal(e.broadcaster.avatar,'https://example.com/anchor.png');
  assert.match(e.honor.firstLine,/星瞳_Official/);
  assert.match(e.honor.secondLine,new RegExp(`<%${threshold}%>`));
  assert.equal(effects.resolveGuardHonorEffect(resources,e.honor)?.id,id);
 }
});

test('千舰两类消息按房间档位去重，旧等级3不误认成888，其他档位继续显示',async()=>{
 const {adapt}=await load('/src/protocol/adapter.ts');
 for(const messages of [[glory(5787),legacy(1000)],[legacy(1000),glory(5787)]]){
  const ctx=context();const events=messages.map(m=>adapt(m,ctx)).filter(Boolean);
  assert.equal(events.length,1);
  assert.equal(events[0].honor.threshold,1000);
  assert.equal(events[0].honor.effectId,5787);
  assert.equal(adapt(glory(5782),ctx).honor.threshold,1314);
 }
 const ctx=context();assert.ok(adapt(glory(5787),ctx));ctx.guardHonorSeen.clear();assert.ok(adapt(glory(5787),ctx));
 const e=adapt(legacy(50),context());assert.equal(e.honor.threshold,50);assert.equal(e.honor.effectId,undefined);
});

test('上舰保留联合名称和本人状态，成就图标与上舰图标都可点击，回看布局保留',async()=>{
 const {adapt}=await load('/src/protocol/adapter.ts');const {EventRow}=await load('/src/components/EventRow.tsx');
 const e=adapt({cmd:'USER_TOAST_MSG_V2',data:{sender_uinfo:{uid:7,base:{name:'昵称'}},receiver_uinfo:{uid:401315430},guard_info:{guard_level:3},group_guard_info:{group_name:'联合舰队'},effect_info:{room_effect_id:5850,room_group_effect_id:591},option:{source:0,is_group:1,svga_block:1}}},context());
 assert.equal(e.guard.effect.isSelf,true);assert.equal(e.guard.effect.groupName,'联合舰队');
 for(const event of [e,adapt(glory(5787),context())]){
  const html=renderToStaticMarkup(React.createElement(EventRow,{ev:event,liveLayout:true,showTime:false,giftEffectResolver:()=>resources[0],onPlayGiftEffect:()=>{}}));
  assert.match(html,/<button[^>]*aria-label="播放大航海(?:成就)?特效"/);
  if(event.honor){assert.match(html,/1000\.png/);assert.doesNotMatch(html,/<svg[^>]*honor-icon/)}
  if(event.honor){
   const noAvatar=renderToStaticMarkup(React.createElement(EventRow,{ev:event,liveLayout:true,showTime:false,displayPreferences:{...(await load("/src/eventDisplaySettings.ts")).DEFAULT_EVENT_DISPLAY_PREFERENCES,showAvatar:false},giftEffectResolver:()=>resources[0],onPlayGiftEffect:()=>{}}));
   assert.match(noAvatar,/1000\.png/);assert.doesNotMatch(noAvatar,/class="user-avatar avatar-wrap/);
  }
  const replay=renderToStaticMarkup(React.createElement(EventRow,{ev:event,reviewLayout:true,showTime:false,giftEffectResolver:()=>resources[0],onPlayGiftEffect:()=>{}}));
  assert.doesNotMatch(replay,/aria-label="播放大航海/);
 }
});

test('成就动效使用大航海开关，并可在OBS单独接收',async()=>{
 const {adapt}=await load('/src/protocol/adapter.ts');const {resolveOutputEventNeeds}=await load('/src/events/outputEventPolicy.ts');
 const {DEFAULT_EVENT_WINDOW_PREFERENCES:defaults}=await load('/src/windows/eventWindowPreferences.ts');const {createObsOutputState}=await load('/src/obs/obsOutputState.ts');
 const e=adapt(glory(5787),context());const prefs={...defaults,showGuardEffect:true,showGiftEffect:false};
 assert.equal(resolveOutputEventNeeds(e,{preferences:prefs,roomId:e.roomId}).effect,true);
 assert.equal(resolveOutputEventNeeds(e,{preferences:{...prefs,showGuardEffect:false},roomId:e.roomId}).effect,false);
 const seen=[];const state=createObsOutputState(e.roomId,prefs,{},x=>seen.push(x.id));state.accept(e,Date.now());state.accept(e,Date.now());assert.deepEqual(seen,[e.id]);
});
