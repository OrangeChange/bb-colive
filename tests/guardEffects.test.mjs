import test from "node:test";
import assert from "node:assert/strict";
import * as effects from "../src/protocol/giftEffects.ts";
import {createGiftEffectQueue} from "../src/windows/giftEffectQueue.ts";

const config={full_sc_resource:{conf_list:[5844,5845,5849,591,592].map(id=>({id,type:3,bind_gift_ids:[0],plan_platform:[1,2],web_mp4:`${id}.mp4`,web_mp4_json:`${id}.json`}))}};
test("大航海资源按服务端编号选择，不依赖购买月数或礼物绑定",()=>{
 const resources=effects.parseGuardEffectResources(config);
 assert.equal(resources.length,5);
 for(const [level,id] of [[1,5844],[1,5845],[1,5849],[2,591],[3,592]]){
  const resource=effects.resolveGuardEffect(resources,{level,count:1,effect:{roomEffectId:id}},"测试昵称");
  assert.equal(resource?.id,id);
  assert.equal(resource?.username,"测试昵称");
 }
 assert.equal(effects.resolveGuardEffect(resources,{level:1,count:1,effect:{roomEffectId:999}},"昵称"),null);
 assert.equal(effects.resolveGuardEffect(resources,{level:1,count:1,effect:{roomEffectId:5849,blocked:true}},"昵称"),null);
 assert.deepEqual(effects.parseGiftEffectResources(config),[]);
});
test("普通上舰、联合上舰、礼物来源使用各自服务端动画编号",()=>{
 const resources=effects.parseGuardEffectResources(config);
 assert.equal(effects.resolveGuardEffect(resources,{level:1,count:1,effect:{roomEffectId:5844,roomGroupEffectId:5845,isGroup:true}},"昵称")?.id,5845);
 assert.equal(effects.resolveGuardEffect(resources,{level:1,count:1,effect:{roomEffectId:5844,roomGiftEffectId:5849,source:1}},"昵称")?.id,5849);
});
test("关闭一种特效只清除该类等待项，当前动画与另一类保留",()=>{
 const queue=createGiftEffectQueue();queue.enqueue({kind:"guard",id:1});queue.enqueue({kind:"gift",id:2});queue.enqueue({kind:"guard",id:3});
 queue.clearPending(item=>item.kind==="guard");assert.equal(queue.current.id,1);assert.equal(queue.finishCurrent().id,2);assert.equal(queue.finishCurrent(),null);
});

let vite;
test.after(async()=>{await vite?.close()});
async function module(path){vite??=await (await import("vite")).createServer({configFile:false,server:{middlewareMode:true,watch:null},optimizeDeps:{noDiscovery:true,include:[]},logLevel:"silent"});return vite.ssrLoadModule(path)}
test("上舰源报文保留真实身份、房间人数与特效信息，另两条并发命令不重复渲染",async()=>{
 const {adapt}=await module("/src/protocol/adapter.ts");
 for(const [wire,model,id] of [[3,1,5849],[2,2,591],[1,3,592]]){
  const e=adapt({cmd:"USER_TOAST_MSG_V2",data:{sender_uinfo:{uid:1,base:{name:"测试昵称"}},receiver_uinfo:{uid:9,base:{name:"主播"}},guard_info:{guard_level:wire,room_guard_count:1000,op_type:1},pay_info:{num:1,unit:"月",price:168000},effect_info:{room_effect_id:id,ship_effect_id:id,effect_id:5846},option:{source:0,svga_block:0}}},{roomId:1,anchorUid:"9"});
  assert.equal(e.guard.level,model);assert.equal(e.guard.roomGuardCount,1000);assert.equal(e.guard.effect.roomEffectId,id);
 }
 assert.equal(adapt({cmd:"GUARD_BUY",data:{}},{roomId:1}),null);
 assert.equal(adapt({cmd:"USER_TOAST_MSG",data:{}},{roomId:1}),null);
});
test("OBS 两类开关独立，重复上舰不重复播，跨房间不播",async()=>{
 const {createObsOutputState}=await module("/src/obs/obsOutputState.ts");const {DEFAULT_EVENT_WINDOW_PREFERENCES:defaults}=await module("/src/windows/eventWindowPreferences.ts");const {MsgType}=await module("/src/protocol/types.ts");
 const seen=[];const prefs={...defaults,showGiftEffect:false,showGuardEffect:true};const state=createObsOutputState(1,prefs,{},e=>seen.push(e.id));
 const guard={id:"guard",roomId:1,ts:1000,msgType:MsgType.GuardBuy,guard:{level:1,count:1,effect:{roomEffectId:5849}}};
 state.accept(guard,1000);state.accept(guard,1001);state.accept({...guard,id:"other-room",roomId:2},1002);
 const gift={id:"gift",roomId:1,ts:1000,msgType:MsgType.Gift,gift:{id:1,name:"礼物",count:1,priceRmb:1,totalRmb:1}};
 state.accept(gift,1003);assert.deepEqual(seen,["guard"]);
 state.configure({...prefs,showGiftEffect:true,showGuardEffect:false});state.accept({...guard,id:"guard-off"},1004);state.accept({...gift,id:"gift-on",ts:20000},20000);assert.deepEqual(seen,["guard","gift-on"]);
});
