import {projectBlivechatEvent} from '../src/compat/blivechat/projection.ts';
import {projectOpenLiveEvent} from '../src/compat/openlive/projection.ts';
import {MsgType} from '../src/protocol/types.ts';
import {compatibleEditorEventScopes,compatibleVisualEventScopes,compatibleEditorSelectors} from '../src/themes/compatThemeCapabilities.ts';
import {reverseSyncCompatibleCss} from '../src/themes/compatCssReverseSync.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { BLIVECHAT_CAPABILITY as blc } from '../src/compat/blivechat/theme.ts';
import { OPENLIVE_CAPABILITY as open } from '../src/compat/openlive/theme.ts';
import { LAPLACE_CAPABILITY as laplace } from '../src/compat/laplace/theme.ts';
import { compatibleSelectorFor } from '../src/themes/compatManagedCss.ts';
import {isLaplaceRendererReply} from '../src/compat/laplace/renderer/bridge.ts';

test('开放版互动父类可匹配点赞，普通身份排除主播和房管',()=>{
 assert.ok(open.eventSelectorsByPlacement.main.interaction);
 assert.match(open.identitySelectors.normal,/is-owner/);
 assert.equal(open.identitySelectors.streamer,"[is-owner='true']");
});
test('LAPLACE 互动覆盖点赞，礼物范围包含红包与天选',()=>{
 assert.match(laplace.eventSelectorsByPlacement.main.interaction,/like-click/);
 assert.match(laplace.eventSelectorsByPlacement.main.redpocket,/red-envelope-result/);
 assert.ok(laplace.identitySelectors.normal);
 assert.ok(compatibleSelectorFor(laplace,'redpocket|all|main|event','common'));
});
test('生成的身份条件不改变选择器优先程度',()=>{
 const selector=compatibleSelectorFor(open,'danmaku|guard|main|username','common');
 assert.match(selector,/:where\(\[privilegeType\]/);
});
test('已有受管身份规则在输出时沿用统一优先级且保留值',()=>{
 const model={common:{'danmaku|streamer|main|username':{color:{source:'custom',value:'blue'}}}};
 const source="/* compat-visual:common|danmaku|streamer|main|username */\nyt-live-chat-text-message-renderer[data-openlive-kind='danmaku'][data-openlive-placement='main'][author-type='owner'] #author-name { color: blue; }";
 const css=materializeCompatibleVisualCss({styles:{visualCss:source},settings:{visualModel:model}},open);
 assert.match(css,/:where\(\[is-owner='true'\]\)/);
 assert.match(css,/color: blue/);
});

test('LAPLACE host accepts actual inspection layout information',()=>{
 assert.equal(isLaplaceRendererReply({channel:'bb-laplace',version:1,generation:1,sequence:1,type:'editor-inspected',scope:{part:'giftImage',eventType:'gift',identity:'all',placement:'sticky'},computed:{width:{value:'37.5px'}},layoutSupported:false,inspectionRevision:0,refresh:true,mode:'candidate'}),true);
});
for (const c of [blc,open,laplace]) test(`${c.mode}: global containers address the container directly`,()=>{
  assert.equal(compatibleSelectorFor(c,'all|all|main|eventArea','common'),c.parts.eventArea.selector);
  assert.equal(compatibleSelectorFor(c,'all|all|main|eventList','common'),c.parts.eventList.selector);
});
for (const c of [blc,open]) test(`${c.mode}: ticker container and event root have separate scope`,()=>{
  assert.equal(compatibleSelectorFor(c,'all|all|sticky|ticker','common'),'yt-live-chat-ticker-renderer');
  assert.equal(compatibleSelectorFor(c,'all|all|sticky|tickerList','common'),'yt-live-chat-ticker-renderer #items.yt-live-chat-ticker-renderer');
  const roots=compatibleSelectorFor(c,'all|all|sticky|tickerItem','common');
  assert.ok(roots && !roots.includes('] yt-live-chat-ticker-paid-message-item-renderer'));
});
test('BLC main selectors exclude expanded details',()=>{
 for(const v of Object.values(blc.eventSelectorsByPlacement.main)) assert.ok(v.includes("data-blc-placement='main'"),v);
});
test('LAPLACE common event root spans both outputs without changing ordinary event scope',()=>{
 const both=compatibleSelectorFor(laplace,'all|all|main|allEvents','common');
 assert.ok(both?.includes('.event-list .event'));
 assert.ok(both?.includes('.gift-sticky-bar .event'));
 assert.ok(!compatibleSelectorFor(laplace,'all|all|main|event','common').includes('.gift-sticky-bar'));
});
import { buildCompatibleVisualNavigation, resolveCompatibleNavigationSelection } from '../src/themes/compatibleVisualNavigation.ts';
const flatten=groups=>{const result=[];const visit=items=>items.forEach(i=>{result.push(i);visit(i.children??[])});groups.forEach(g=>visit(g.items));return result};
for(const c of [blc,open]) test(`${c.mode}: complete expanded details and editable sticky root`,()=>{
 const nodes=flatten(buildCompatibleVisualNavigation(c.mode,c.parts));
 for(const event of ['gift','superchat','guard'])assert.ok(nodes.some(n=>n.placement==='detail'&&n.event===event&&n.part==='avatar'));
 assert.ok(nodes.some(n=>n.id==='sticky'&&n.part));
});
test('LAPLACE navigation covers source-specific nested layers and event shortcuts',()=>{
 const nodes=flatten(buildCompatibleVisualNavigation('laplace',laplace.parts));
 for(const part of ['allEvents','header','meta','usernameWrap','timestampWrap','body','guardType','guardFigure','guardUnit','guardDays','winnerContent','winnerTitle','winnerToggle','winnerMask','winnerList','winnerItem','winnerAvatar','rewardCount','rewardImage','lotteryPrize','muteOperator'])assert.ok(nodes.some(n=>n.part===part),part);
 for(const [part,event]of [['giftImage','gift'],['guardContent','guard'],['reply','danmaku']]){
 const n=nodes.find(n=>n.part===part);assert.equal(resolveCompatibleNavigationSelection(n,{event:'danmaku',identity:'all',part:'message',placement:'main'}).event,event);
 }
});
import { setCompatibleVisualProperty, resolveCompatibleVisualProperty } from '../src/themes/compatThemeCapabilities.ts';
import { renderCompatibleManagedCss } from '../src/themes/compatManagedCss.ts';
test('visual numeric editing keeps original scale chains while handwritten fixed values remain fixed',()=>{
 const target={event:'danmaku',identity:'all',placement:'main',part:'username'};
 for(const [c,settings,expected] of [[blc,{globalScale:2,fontScale:1.5},'var(--blc-g,'],[laplace,{baseFontSize:24},'var(--event-base-size'],[open,{},'24px']]){
  const model=setCompatibleVisualProperty({},target,'fontSize',{source:'custom',value:24},'common',{definition:c.parts.username,settings});
  assert.ok(renderCompatibleManagedCss(c,model).includes(expected));
 }
 const fixed=setCompatibleVisualProperty({},target,'fontSize',{source:'custom',value:'24px'});
 assert.ok(renderCompatibleManagedCss(blc,fixed).includes('24px'));
});
test('winner collection is inherited by individual results',()=>{
 const model={common:{'winners|all|main|winnerTitle':{color:{source:'custom',value:'red'}}}};
 assert.equal(resolveCompatibleVisualProperty(model,{event:'redResult',identities:[],placement:'main',part:'winnerTitle'},'color').value,'red');
});
test('ordinary and sticky event controls inherit the shared LAPLACE event value',()=>{
 const model={common:{'all|all|main|allEvents':{color:{source:'custom',value:'#123456'}}}};
 for(const placement of ['main','sticky'])assert.equal(resolveCompatibleVisualProperty(model,{event:'gift',identities:[],placement,part:'event'},'color').value,'#123456');
});
import { materializeCompatibleVisualCss, patchCompatibleManagedCss } from '../src/themes/compatManagedCss.ts';
test('default priorities sort a later shared winner rule before the individual rule',()=>{
 const first={common:{'redResult|all|main|winnerTitle':{color:{source:'custom',value:'red'}}}};
 const next={common:{...first.common,'winners|all|main|winnerTitle':{color:{source:'custom',value:'blue'}}}};
 const source=patchCompatibleManagedCss(renderCompatibleManagedCss(laplace,first),laplace,first,next);
 const result=materializeCompatibleVisualCss({styles:{visualCss:source},settings:{visualModel:next}},laplace);
 assert.ok(result.indexOf('common|redResult|')>result.indexOf('common|winners|'));
});

test('BLC 同一节点的旧正文设置保留胜出值并统一到内容区域',()=>{
 const input={common:{'gift|all|main|contentArea':{background:{source:'custom',value:'red'}},'gift|all|main|paidContent':{background:{source:'custom',value:'blue'}}}};
 const css=renderCompatibleManagedCss(open,input);
 assert.doesNotMatch(css,/compat-visual:common\|gift\|all\|main\|paidContent/);
 assert.match(css,/background: blue/);
 assert.doesNotMatch(css,/background: red/);
});
test('LAPLACE 普通礼物不包含红包和天选父范围',()=>{
 const selector=compatibleSelectorFor(laplace,'gift-regular|all|main|contentArea','common');
 assert.match(selector,/event--gift/);assert.doesNotMatch(selector,/red-envelope|lottery/);
});

test('旧全局正文的礼物细项层叠优先于礼物父设置',()=>{
 const input={common:{'all|all|main|paidContent':{background:{source:'custom',value:'red'}},'gift|all|main|contentArea':{background:{source:'custom',value:'blue'}}}};
 const css=renderCompatibleManagedCss(open,input);
 assert.match(css,/compat-visual:common\|gift-normal\|all\|main\|contentArea[\s\S]*?background: red/);
 assert.doesNotMatch(css,/gift-blind/);
});

test('删除复杂受管规则后清理独立的 CSS 控制标记',()=>{const key='all|all|main|username';const selector=compatibleSelectorFor(open,key,'common');const first=reverseSyncCompatibleCss(`/* compat-visual:common|${key} */\n${selector}{color:var(--accent)}`,open,{common:{[key]:{color:{source:'custom',value:'red'}}}});const result=reverseSyncCompatibleCss('',open,first.model,first.authored);assert.deepEqual(result.authored.common,{});});
test('LAPLACE 互动和系统细分类有可编辑的原 DOM 定位',()=>{for(const name of ['entry','follow','share','special-follow','mutual-follow','live-status','user-block','room-mute','room-change','warning']){assert.ok(laplace.eventSelectorsByPlacement.main[name],name);assert.ok(compatibleSelectorFor(laplace,`${name}|all|main|message`,'common'),name);}});

for(const c of [blc,open])test(`${c.mode}:礼物编辑无二级分类，置顶单事件可命中`,()=>{
 assert.equal(compatibleVisualEventScopes(c,'main').find(s=>s.id==='gift').children,undefined);
 assert(compatibleEditorSelectors(c).event.includes('yt-live-chat-ticker-paid-message-item-renderer'));
});

test('两版BLC将长条归为大表情，普通小表情保持行内分类',()=>{
 const event={id:'emotes',roomId:1,ts:1,msgType:MsgType.Danmu,user:{uid:'1',uname:'测试'},text:'[长条][小表情]',emotes:{'[长条]':{url:'banner.png',width:80,height:20},'[小表情]':{url:'small.png',width:59,height:59}}};
 const blc=projectBlivechatEvent(event,{roomId:1,generation:1},1,1);
 const open=projectOpenLiveEvent(event,{roomId:1,generation:1},1,1);
 assert.deepEqual(blc.contentParts.filter(p=>p.type==='image').map(p=>p.large),[true,false]);
 assert.deepEqual(open.payload.contentParts.filter(p=>p.type==='image').map(p=>p.large),[true,false]);
});

test('点选先识别具体事件，再匹配父分类',()=>{
 const scopes=compatibleEditorEventScopes(laplace).sticky;
 assert(Object.keys(scopes).indexOf('lotteryStart')<Object.keys(scopes).indexOf('gift'));
 assert(scopes.gift.split(',').every(branch=>branch===branch.trim()));
 assert.equal(compatibleEditorEventScopes(open).main['gift-normal'],undefined);
});
