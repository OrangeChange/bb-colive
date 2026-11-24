import {pickLaplaceRendererEvent,isLaplaceRenderMessage} from '../src/compat/laplace/renderer/bridge.ts';
import test from 'node:test';import assert from 'node:assert/strict';
import {MsgType} from '../src/protocol/eventTypeCodes.ts';
import {projectLaplaceEvent} from '../src/compat/laplace/projection.ts';
import {projectBlivechatCallback} from '../src/compat/blivechat/projection.ts';
import {projectOpenLiveCallback} from '../src/compat/openlive/projection.ts';
import {BlivechatRuntime} from '../src/compat/blivechat/runtime/core.mjs';
import {projectCallback,DEFAULT_CONFIG} from '../src/compat/openlive/runtime/core.mjs';
const base={id:'source-id',reactKey:'stable-id',roomId:1,ts:1793459532000,user:{uid:'1',uname:'用户'}};
const laplace=e=>projectLaplaceEvent(e,{roomId:1,generation:0},1,e.ts).event;
test('旧事件的标题分区、点赞正文和盲盒总额使用结构化事实',()=>{
 assert.equal(laplace({...base,msgType:MsgType.RoomChange,text:'拼接文案',stats:{roomTitle:'标题',roomArea:'子区',roomParentArea:'父区'}}).message,'标题');
 assert.equal(laplace({...base,msgType:MsgType.RoomChange,stats:{roomParentArea:'父区'}}).parentArea,'父区');
 assert.equal(laplace({...base,msgType:MsgType.Interact,interactKind:'like',text:'点赞正文',likeCount:2}).message,'点赞正文');
 assert.equal(laplace({...base,msgType:MsgType.Gift,gift:{id:1,name:'礼物',count:2,total:10000,totalRmb:10,coinType:'gold',blindGiftName:'盒子',blindPriceRmb:5}}).priceNormalized,10);
});
test('BLC原版省略盲盒，开放版只显示开出的普通礼物',()=>{
 const e={...base,msgType:MsgType.Gift,gift:{id:1,name:'礼物',count:2,total:10000,totalRmb:10,coinType:'gold',blindGiftName:'盒子',blindPriceRmb:5,blindHitPriceRmb:2}};
 assert.equal(projectBlivechatCallback(e,1),null);
 const record=projectOpenLiveCallback(e,1);
 assert.equal(record.method,'onAddGift');assert.equal(record.payload.giftName,'礼物');assert.equal(record.payload.num,2);assert.equal(record.payload.blindGiftName,undefined);
});

test('SC删除使用稳定ID，开放版保留原文和平台译文的独立字段',()=>{
 const e={...base,msgType:MsgType.SuperChat,sc:{price:30,message:'原文',trans:'译文'}};
 for(const project of [projectBlivechatCallback,projectOpenLiveCallback]){const record=project({...e,scDeleted:true},1);assert.equal(record.method,'onDelSuperChat');assert.deepEqual(record.payload.ids,['stable-id']);}
 const p=projectOpenLiveCallback(e,1).payload;assert.equal(p.content,'原文');assert.equal(p.translation,'译文');
});

test('来源扩展保留时仍使用底座合并后的数量、金额和后补头像',()=>{
 const event={...base,msgType:MsgType.Gift,user:{...base.user,avatar:'https://example.com/complete.png'},gift:{id:1,name:'礼物',count:3,total:15000,totalRmb:15,coinType:'gold'},laplace:{sourceCommand:'SEND_GIFT',sourceMode:'direct',platform:'bilibili',timestampUnit:'seconds',timestampFallback:false,event:{type:'gift',id:'old',origin:1,originIdx:0,uid:'1',timestamp:1,timestampNormalized:1000,giftAmount:1,priceNormalized:5,avatar:''}}};
 const p=laplace(event);assert.equal(p.giftAmount,3);assert.equal(p.priceNormalized,15);assert.equal(p.avatar,'https://example.com/complete.png');
});

test('旧事件缺少可选勋章字段时，正式renderer消息仍然有效',()=>{
 const event=laplace({...base,msgType:MsgType.Danmu,text:'旧正文'});
 const wire={channel:'bb-laplace',version:1,type:'render',generation:0,sequence:1,events:[pickLaplaceRendererEvent(event)],stickyEvents:[],settings:{},css:{cloud:'',remote:'',custom:''},preview:false,scrollable:true,rate:0};
 assert.equal(isLaplaceRenderMessage(wire),true);
});
