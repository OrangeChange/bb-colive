/** Actual generated standalone document + mounted Vue + bridge integration.
 * jsdom supplies a DOM, not layout, rasterization, font/image loading or browser frames.
 */
import test from 'node:test';
import { OPENLIVE_CAPABILITY } from '../src/compat/openlive/theme.ts';
import { projectOpenLiveCallback } from '../src/compat/openlive/projection.ts';
import { MsgType } from '../src/protocol/eventTypeCodes.ts';
import { compatibleSelectorFor } from '../src/themes/compatManagedCss.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url),{JSDOM,VirtualConsole}=require(path.join(root,'vendor/blivechat/node_modules/jsdom'));
const {buildSync}=require('esbuild');
const bundle=buildSync({entryPoints:[path.join(root,'public/openlive/entry.mjs')],bundle:true,write:false,format:'iife',platform:'browser',logLevel:'silent'}).outputFiles[0].text;
const read=name=>fs.readFileSync(path.join(root,'public/openlive',name),'utf8');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function documentHarness({fastTimers=true}={}){
 const virtualConsole=new VirtualConsole(),errors=[];virtualConsole.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(read('renderer.html'),{url:'https://bb.test/openlive/renderer.html?qa=1',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole});
 const w=dom.window,posts=[],parent={postMessage:(data,origin)=>posts.push({data,origin})};
 Object.defineProperty(w,'parent',{value:parent});w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;const actualTimeout=w.setTimeout.bind(w);
 w.Element.prototype.getAnimations ??= () => [];
 w.setTimeout=(fn,ms,...args)=>actualTimeout(fn,fastTimers?Math.min(ms??0,5):ms,...args);
 w.setInterval=()=>1;w.clearInterval=()=>{};
 // No resource fetches: fixed source URLs remain observable; asset loading is not asserted.
 w.eval(read('renderer.js'));
 w.eval(bundle);await sleep(20);
 const send=(command,data,changes={})=>w.dispatchEvent(new w.MessageEvent('message',{source:parent,origin:'https://bb.test',data:{type:'bb-openlive',command,data},...changes}));
 const wait=async(predicate,timeout=1500)=>{const start=Date.now();while(!predicate()){if(Date.now()-start>timeout)throw Error('Timed out waiting for generated OpenLive document: '+JSON.stringify({posts,errors,html:w.document.body.innerHTML,qa:!!w.__bbOpenLiveQA}));await sleep(5);}await sleep(5);};
 return {w,dom,posts,parent,errors,send,wait,close:()=>dom.window.close()};
}
const e=(id,method='onAddText',payload={})=>({method,payload:{id,time:Date.now(),timestamp:Date.now()/1000,avatarUrl:'',authorName:'Viewer',authorType:0,privilegeType:0,content:'正文',emoticon:null,medalName:null,medalLevel:0,...payload},receivedAt:Date.now()});
const rows=h=>h.w.document.querySelector('#chat-items');

test('盲盒的实际礼物价值贯穿挂载文档、单件与累计准入',async()=>{
 const h=await documentHarness();try{
  const make=(id,hit,cost,count=1)=>projectOpenLiveCallback({id,roomId:1,ts:Date.now(),msgType:MsgType.Gift,user:{uid:'1',uname:'用户'},gift:{id:1,name:'实际礼物'+id,count,price:hit*1000,priceRmb:hit,total:cost*count*1000,totalRmb:cost*count,paymentRmb:cost*count,coinType:'gold',blindGiftName:'幸运盲盒',blindPriceRmb:cost,blindHitPriceRmb:hit}},1);
  h.send('config',{hostPaidFilter:true,hostPaidThreshold:25,hostPaidMode:'unit',mergeGift:false});
  const records=[make('high',100,5),make('low',1,100),make('three',10,5,3)];
  h.send('hydrate',{records});
  await h.wait(()=>h.posts.some(p=>p.data.command==='hydrated'));
  const renderer=h.w.__bbOpenLiveQA.getRenderer();
  assert.deepEqual(Array.from(renderer.messages,m=>m.price),[100]);
  assert.match(rows(h).textContent,/实际礼物high/);
  assert.doesNotMatch(rows(h).textContent,/幸运盲盒/);
  h.send('config',{hostPaidMode:'cumulative'});
  await h.wait(()=>renderer.messages.length===2);
  assert.deepEqual(Array.from(renderer.messages,m=>m.price),[100,30]);
 }finally{h.close();}
});

test('history replacement waits for leaving rows and flushes the snapshot before acknowledging',async()=>{
 const h=await documentHarness();try{
  const renderer=h.w.__bbOpenLiveQA.getRenderer();
  renderer.onLeave=true;
  const timer=setTimeout(()=>{renderer.onLeave=false;},80);
  h.send('hydrate',{records:[e('restored-0'),e('restored-1')]});
  await h.wait(()=>h.posts.some(p=>p.data.command==='hydrated'));
  clearTimeout(timer);
  assert.deepEqual(Array.from(renderer.messages,m=>m.id),['restored-0','restored-1']);
  assert.equal(renderer.messagesBuffer.length,0);
 }finally{h.close();}
});

test('returning to latest waits for a leaving row before flushing buffered messages',async()=>{
 for(const command of ['scroll-latest','restore-scroll']){
  const h=await documentHarness();try{
   h.send('hydrate',{records:[e('shown')]});
   await h.wait(()=>h.posts.some(p=>p.data.command==='hydrated'));
   const renderer=h.w.__bbOpenLiveQA.getRenderer();
   renderer.onLeave=true;renderer.atBottom=false;
   renderer.messagesBuffer.push({...renderer.messages[0],id:'buffered'});
   h.send(command,command==='restore-scroll'?{followingLatest:true}:undefined);
   await sleep(30);
   assert.equal(renderer.messagesBuffer.length,1);
   renderer.onLeave=false;
   await sleep(100);
   assert.equal(renderer.messagesBuffer.length,0,command);
   assert.deepEqual(Array.from(renderer.messages,m=>m.id),['shown','buffered']);
  }finally{h.close();}
 }
});

test('restoring a following reader uses the latest edge rather than its old pixel offset',async()=>{
 const h=await documentHarness();try{
  const scroller=h.w.document.getElementById('item-scroller');
  Object.defineProperties(scroller,{scrollHeight:{configurable:true,value:2000},clientHeight:{configurable:true,value:500}});
  h.send('restore-scroll',{followingLatest:true,scrollTop:123});
  await h.wait(()=>h.posts.some(p=>p.data.command==='scroll-state'));
  assert.equal(scroller.scrollTop,2000);
 }finally{h.close();}
});

test('键盘滚动标记为用户操作',async()=>{
 const h=await documentHarness();try{
  const scroller=h.w.document.getElementById('item-scroller');
  scroller.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
  scroller.dispatchEvent(new h.w.Event('scroll',{bubbles:true}));
  assert.equal(h.posts.filter(p=>p.data.command==='scroll-state').at(-1).data.data.userInitiated,true);
 }finally{h.close();}
});

test('compiled standalone emits ready and mounts exact text/card/medal/emoticon DOM through parent events',async()=>{
 const h=await documentHarness();try{
  assert.equal(h.posts[0].data.command,'ready');assert.equal(h.posts[0].origin,'https://bb.test');assert.equal(h.posts[0].data.data.retainedSettings.length,20);assert.equal(h.posts[0].data.data.retainedSettings.some(key=>key.startsWith('hostPaid')),false);
  h.send('config',{emoticonSize:64,showLike:true});h.send('event',e('text','onAddText',{authorType:3,privilegeType:3,medalName:'Test',medalLevel:21,isFanGroup:true,isCurrentRoom:false,translation:'translation'}));h.send('event',e('em','onAddText',{content:'表情',emoticon:'https://example.com/large.png'}));h.send('event',e('like','onAddLike',{likeCount:3}));
  await h.wait(()=>rows(h)?.querySelectorAll('yt-live-chat-text-message-renderer').length===3);
  const first=rows(h).querySelector('yt-live-chat-text-message-renderer');assert.equal(first.firstElementChild.id,'card');assert.ok(first.querySelector('#card > #content'));assert.ok(first.hasAttribute('is-owner'));assert.equal(first.getAttribute('author-type'),'member');assert.ok(first.hasAttribute('is-fan-group'));assert.equal(first.hasAttribute('is-current-room'),false);
  const medal=first.querySelector('yt-live-chat-author-medal-renderer');assert.equal(medal.getAttribute('medal-nevel'),'21');assert.ok(medal.hasAttribute('is-fan-group'));assert.equal(medal.hasAttribute('is-current-room'),false);assert.ok(first.textContent.includes('translation'));assert.ok(first.textContent.includes('正文'));
  assert.equal(rows(h).querySelector('img#emoticon').getAttribute('width'),'64');assert.ok(rows(h).textContent.includes('点赞了直播间3次'));assert.equal(rows(h).querySelector('[is-like]'),null);
  h.send('config',{emoticonSize:48});await h.wait(()=>rows(h).querySelector('img#emoticon').getAttribute('width')==='48');
  assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('compiled OpenLive document stops accepting commands after pagehide',async()=>{
 const h=await documentHarness();try{
  const cancelled=[];h.w.requestAnimationFrame=()=>73;h.w.cancelAnimationFrame=id=>cancelled.push(id);
  h.send('event',e('editor-row'));await h.wait(()=>rows(h)?.querySelector('#message'));
  h.send('editor-select',{part:'message',reveal:false,selectors:{message:['#message']},focusSelectors:['#message'],strictScope:true,scheme:'dark',properties:{message:['fontSize']},scopeSelectors:{}});await sleep(10);
  const before=h.posts.length;
  h.w.dispatchEvent(new h.w.PageTransitionEvent('pagehide',{persisted:false}));
  h.send('snapshot');await sleep(20);
  assert.equal(h.posts.length,before,'卸载后的来源文档不得继续处理宿主命令');
  assert.deepEqual(cancelled,[73],'卸载时必须取消待执行的编辑定位帧');
 }finally{h.close();}
});
test('compiled bridge serializes config/event/css; ignores each foreign source/origin/channel and reports invalid payload',async()=>{
 const h=await documentHarness();try{
  h.send('config',{showDanmaku:false});h.send('event',e('hidden'));h.send('css',{css:'yt-live-chat-text-message-renderer { outline: 1px solid rgb(1,2,3); }'});await h.wait(()=>h.posts.filter(p=>p.data.command==='status').length>=3);assert.equal(rows(h).children.length,0);assert.ok(h.w.document.querySelector('#bb-openlive-custom-css').textContent.includes('outline:'));
  for(const changes of [{source:{}},{origin:'https://foreign.test'},{data:{type:'bb-blivechat',command:'config',data:{showDanmaku:true}}}])h.send('config',{showDanmaku:true},changes);
  await sleep(30);assert.equal(rows(h).children.length,0);
  h.send('config',{showDanmaku:true});await h.wait(()=>rows(h).querySelectorAll('yt-live-chat-text-message-renderer').length===1);
  h.send('event',{method:'not-a-callback',payload:{}});await h.wait(()=>h.posts.some(p=>p.data.command==='error'));assert.match(h.posts.find(p=>p.data.command==='error').data.data.message,/Unknown OpenLive/);
  h.send('config',{skin:'default'});await h.wait(()=>h.w.document.querySelector('#bb-openlive-named-skin').textContent.includes('named-default.css'));assert.match(h.w.document.querySelector('#bb-openlive-named-skin').textContent,/@import.*named-default\.css/);
  h.send('snapshot');await h.wait(()=>h.posts.some(p=>p.data.command==='snapshot'));assert.equal(h.posts.find(p=>p.data.command==='snapshot').data.data.messages.length,1);
 }finally{h.close();}
});
test('compiled SC translation/ticker click/delete/hydrate ledger uses original DOM and never resurrects deleted SC',async()=>{
 const h=await documentHarness();try{
  h.send('event',e('sc','onAddSuperChat',{price:30,content:'原 SC',translation:'已有译文'}));await h.wait(()=>rows(h).querySelector('yt-live-chat-paid-message-renderer'));
  assert.ok(rows(h).textContent.includes('原 SC（已有译文）'));
  const ticker=h.w.document.querySelector('yt-live-chat-ticker-paid-message-item-renderer');assert.ok(ticker);
  const tickerSelector=compatibleSelectorFor(OPENLIVE_CAPABILITY,'superchat|all|sticky|ticker','common');
  assert.ok(tickerSelector&&h.w.document.querySelector(tickerSelector),'正式能力表必须命中开放版 ticker item');
  ticker.dispatchEvent(new h.w.MouseEvent('click',{bubbles:true}));await sleep(10);assert.ok(h.w.document.querySelector('yt-live-chat-ticker-renderer > yt-live-chat-paid-message-renderer'));
  h.send('event',{method:'onUpdateTranslation',payload:{id:'sc',translation:'新译文'},receivedAt:Date.now()});await h.wait(()=>rows(h).textContent.includes('新译文'));
  h.send('event',{method:'onDelSuperChat',payload:{ids:['sc']},receivedAt:Date.now()});await h.wait(()=>h.w.__bbOpenLiveQA.getRuntime().snapshot().messages.length===0);
  h.send('config',{showSuperchat:false});h.send('config',{showSuperchat:true});h.send('event',{method:'onUpdateTranslation',payload:{id:'sc',translation:'迟到译文'},receivedAt:Date.now()});await sleep(30);assert.equal(h.w.__bbOpenLiveQA.getRuntime().snapshot().messages.length,0);
  h.send('hydrate',{records:[e('deleted-early','onAddSuperChat',{price:30}),e('kept')],deletedSuperChatIds:['deleted-early'],deletionOverflow:false});await h.wait(()=>h.w.__bbOpenLiveQA.getRuntime().snapshot().messages.some(m=>m.id==='kept'));const state=h.w.__bbOpenLiveQA.getRuntime().snapshot();assert.equal(state.messages.some(m=>m.id==='deleted-early'),false);assert.equal(state.paidMessages.length,0);
  h.send('reset');await h.wait(()=>h.w.__bbOpenLiveQA.getRuntime().snapshot().retainedRecords===0);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});


test('compiled host policy config changes admission without leaking into renderer props',async()=>{
 const h=await documentHarness();try{
  h.send('config',{hostPaidFilter:true,hostPaidThreshold:2,hostPaidMode:'unit',minGiftPrice:100});
  h.send('event',e('host-gift','onAddGift',{giftName:'host gift',num:1,price:.6,totalCoin:600,bbPaidAmount:{unit:.6,cumulative:.6}}));
  await h.wait(()=>h.posts.filter(p=>p.data.command==='status').length>=2);
  const runtime=h.w.__bbOpenLiveQA.getRuntime(),renderer=h.w.__bbOpenLiveQA.getRenderer();
  assert.equal(runtime.config.hostPaidFilter,true);assert.equal(runtime.config.hostPaidThreshold,2);
  assert.equal(runtime.renderer.messages.length,0);assert.equal(runtime.renderer.paidMessages.length,1);
  assert.equal(Object.keys(renderer.$props).some(key=>key.startsWith('hostPaid')),false);
  h.send('config',{hostPaidThreshold:.6});await h.wait(()=>rows(h).textContent.includes('host gift'));
  h.send('config',{hostPaidMode:'invalid'});await h.wait(()=>h.posts.some(p=>p.data.command==='error'));
  assert.equal(runtime.config.hostPaidMode,'unit');assert.equal(runtime.config.hostPaidThreshold,.6);
  assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('compiled source document accepts the shared host presentation protocol',async()=>{
 const h=await documentHarness();try{
  const record=e('host-row','onAddText',{content:'宿主正文'});
  h.send('config',{skin:'none',showLike:true,maxNumber:60,mergeGift:false,mergeSimilarDanmaku:false});
  h.send('host',{scale:.9,tickerEnabled:false,enableBilibiliVideoLinks:true,direction:'bottom',managed:true});
  h.send('hydrate',{records:[record]});
  await h.wait(()=>h.posts.some(p=>p.data.command==='hydrated'));
  h.send('presentation',{layout:[{eventId:'host-row',kind:'source'},{eventId:'fallback-row',kind:'fallback'}],stickyRecords:[],position:'top',direction:'bottom'});
  await h.wait(()=>h.posts.some(p=>p.data.command==='presented'));
  assert.ok(h.w.document.querySelector('[data-compatible-event-id="host-row"]'));
  assert.ok(h.w.document.querySelector('[data-compatible-fallback-id="fallback-row"]'));
  assert.equal(h.w.document.body.style.zoom,'0.9');
  assert.equal(h.w.document.querySelector('yt-live-chat-ticker-renderer').hidden,true);
  h.send('presentation',{layout:[{eventId:'host-row',kind:'source',removing:true}],stickyRecords:[],position:'top',direction:'bottom',animation:{preset:'slide',durationMs:140}});
  await h.wait(()=>h.w.document.querySelector('[data-compatible-event-id="host-row"]')?.dataset.compatibleEventRemoving==='true');
  const leaving=h.w.document.querySelector('[data-compatible-event-id="host-row"]');
  assert.equal(leaving.dataset.eventMotion,'slide');
  assert.equal(leaving.style.getPropertyValue('--event-motion-duration'),'140ms');
 }finally{h.close();}
});

test('compiled source document hot-updates config and css without rebuilding ordinary event history',async()=>{
 const h=await documentHarness();try{
  h.send('hydrate',{records:[e('kept','onAddText',{content:'保留正文'})]});
  await h.wait(()=>h.posts.some(p=>p.data.command==='hydrated'));
  const runtime=h.w.__bbOpenLiveQA.getRuntime(),before=runtime.snapshot().retainedRecords;
  h.send('config',{skin:'default',emoticonSize:96});
  h.send('css',{css:'#message { color: rgb(1, 2, 3) !important; }',appearanceCss:'#message { font-size: 24px; }'});
  await h.wait(()=>h.w.document.querySelector('#bb-openlive-named-skin')?.textContent.includes('named-default.css')&&h.w.document.querySelector('#bb-openlive-custom-css')?.textContent.includes('!important'));
  assert.equal(runtime.snapshot().retainedRecords,before);
  assert.equal(h.w.document.querySelector('#bb-openlive-appearance-css').textContent.includes('font-size: 24px'),true);
 }finally{h.close();}
});

test('managed source document routes author, video and context actions by stable event id',async()=>{
 const h=await documentHarness();try{
  h.send('host',{scale:1,tickerEnabled:false,enableBilibiliVideoLinks:true,direction:'bottom',managed:true});
  h.send('hydrate',{records:[e('action-row','onAddText',{content:'看看 BV1xx411c7mD'})]});
  await h.wait(()=>h.posts.some(p=>p.data.command==='hydrated'));
  h.send('presentation',{layout:[{eventId:'action-row',kind:'source'}],stickyRecords:[],position:'top',direction:'bottom'});
  await h.wait(()=>h.posts.some(p=>p.data.command==='presented'));
  const row=h.w.document.querySelector('[data-compatible-event-id="action-row"]');
  row.querySelector('#author-name').dispatchEvent(new h.w.MouseEvent('click',{bubbles:true}));
  [...row.querySelectorAll('#message')].find(node=>node.textContent.includes('BV1xx411c7mD')).dispatchEvent(new h.w.MouseEvent('click',{bubbles:true}));
  row.dispatchEvent(new h.w.MouseEvent('contextmenu',{bubbles:true,clientX:7,clientY:9}));
  await h.wait(()=>h.posts.some(p=>p.data.command==='context-menu'));
  assert.ok(h.posts.some(p=>p.data.command==='action'&&p.data.data.eventId==='action-row'&&p.data.data.action==='filter-user'));
  assert.ok(h.posts.some(p=>p.data.command==='action'&&p.data.data.eventId==='action-row'&&p.data.data.action?.type==='open-link'&&p.data.data.action.href.endsWith('/BV1xx411c7mD')));
  assert.equal(JSON.stringify(h.posts.find(p=>p.data.command==='context-menu').data.data),JSON.stringify({eventId:'action-row',x:7,y:9}));
 }finally{h.close();}
});

test('managed source document admits paid ticker rows only from software sticky presentation',async()=>{
 const h=await documentHarness();try{
  const sc=e('paid-row','onAddSuperChat',{price:30,content:'付费正文'});
  h.send('host',{scale:1,tickerEnabled:true,enableBilibiliVideoLinks:false,direction:'bottom',managed:true});
  h.send('hydrate',{records:[sc]});
  await h.wait(()=>h.posts.some(p=>p.data.command==='hydrated'));
  h.send('presentation',{layout:[{eventId:'paid-row',kind:'source'}],stickyRecords:[],position:'top',direction:'bottom'});
  await h.wait(()=>h.posts.filter(p=>p.data.command==='presented').length===1);
  assert.equal(h.w.__bbOpenLiveQA.getRenderer().paidMessages.length,0);
  await h.wait(()=>h.w.document.querySelectorAll('yt-live-chat-ticker-paid-message-item-renderer').length===0);
  assert.equal(h.w.document.querySelectorAll('yt-live-chat-ticker-paid-message-item-renderer').length,0);

  const startedAt=Date.now(),expiresAt=startedAt+60_000;
  h.send('presentation',{layout:[{eventId:'paid-row',kind:'source'}],stickyRecords:[{record:sc,startedAt,expiresAt}],position:'bottom',direction:'bottom'});
  await h.wait(()=>h.posts.filter(p=>p.data.command==='presented').length===2);
  await h.wait(()=>h.w.document.querySelector('[data-compatible-event-id="paid-row"][data-openlive-placement="sticky"]'));
  assert.equal(h.w.__bbOpenLiveQA.getRenderer().paidMessages.length,1);
  assert.equal(h.w.document.documentElement.dataset.tickerPosition,'bottom');

  h.send('config',{emoticonSize:96});
  await h.wait(()=>h.posts.filter(p=>p.data.command==='status').length>=1);
  assert.equal(h.w.__bbOpenLiveQA.getRenderer().paidMessages.length,1);
 }finally{h.close();}
});

test('mixed source and fallback rows retain A F B stable identities across resync',async()=>{
 const h=await documentHarness();try{
  h.send('host',{scale:1,tickerEnabled:false,enableBilibiliVideoLinks:false,direction:'bottom',managed:true});
  h.send('hydrate',{records:[e('A','onAddText',{content:'A'}),e('B','onAddText',{content:'B'})]});
  await h.wait(()=>h.posts.some(p=>p.data.command==='hydrated'));
  h.send('presentation',{layout:[{eventId:'A',kind:'source'},{eventId:'F',kind:'fallback'},{eventId:'B',kind:'source'}],stickyRecords:[],position:'top',direction:'bottom'});
  await h.wait(()=>h.w.document.querySelector('[data-compatible-fallback-id="F"]'));
  h.send('config',{emoticonSize:81});
  await h.wait(()=>h.posts.some(p=>p.data.command==='status'));
  assert.deepEqual([...rows(h).children].map(node=>node.dataset.compatibleEventId),['A','F','B']);
  assert.equal(h.w.document.querySelector('[data-compatible-fallback-id="F"]').dataset.compatibleEventId,'F');
 }finally{h.close();}
});

test('ticker leave animation keeps A and B identities when A is removed',async()=>{
 const h=await documentHarness({fastTimers:false});try{
  const now=Date.now(),a=e('ticker-A','onAddSuperChat',{price:30,content:'A'}),b=e('ticker-B','onAddSuperChat',{price:50,content:'B'});
  h.send('host',{scale:1,tickerEnabled:true,enableBilibiliVideoLinks:false,direction:'bottom',managed:true});
  h.send('hydrate',{records:[a,b]});await h.wait(()=>h.posts.some(p=>p.data.command==='hydrated'));
  h.send('presentation',{layout:[{eventId:'ticker-A',kind:'source'},{eventId:'ticker-B',kind:'source'}],stickyRecords:[{record:a,startedAt:now,expiresAt:now+60000},{record:b,startedAt:now,expiresAt:now+60000}],position:'top',direction:'bottom'});
  await h.wait(()=>h.w.document.querySelectorAll('yt-live-chat-ticker-paid-message-item-renderer').length===2);
  const before=[...h.w.document.querySelectorAll('yt-live-chat-ticker-paid-message-item-renderer')];
  assert.deepEqual(before.map(node=>node.dataset.compatibleEventId),['ticker-A','ticker-B']);
  h.send('presentation',{layout:[{eventId:'ticker-B',kind:'source'}],stickyRecords:[{record:b,startedAt:now,expiresAt:now+60000}],position:'top',direction:'bottom'});
  await h.wait(()=>before[0].classList.contains('sliding-down'));
  assert.deepEqual(before.map(node=>node.dataset.compatibleEventId),['ticker-A','ticker-B']);
 }finally{h.close();}
});

test('top host direction updates Vue config and remains aligned after append',async()=>{
 const h=await documentHarness();try{
  h.send('config',{danmakuAtBottom:true});
  h.send('host',{scale:1,tickerEnabled:false,enableBilibiliVideoLinks:false,direction:'top',managed:true});
  h.send('hydrate',{records:[e('top-A','onAddText',{content:'A'})]});await h.wait(()=>h.posts.some(p=>p.data.command==='hydrated'));
  h.send('presentation',{layout:[{eventId:'top-A',kind:'source'}],stickyRecords:[],position:'top',direction:'top'});await h.wait(()=>h.posts.some(p=>p.data.command==='presented'));
  assert.equal(h.w.__bbOpenLiveQA.getRuntime().config.danmakuAtBottom,false);
  assert.equal(h.w.document.querySelector('yt-live-chat-renderer').hasAttribute('danmaku-at-bottom'),false);
  const runtime=h.w.__bbOpenLiveQA.getRuntime(),setConfig=runtime.setConfig.bind(runtime);let configCalls=0;runtime.setConfig=(...args)=>{configCalls+=1;return setConfig(...args);};
  h.send('event',e('top-B','onAddText',{content:'B'}));
  h.send('presentation',{layout:[{eventId:'top-B',kind:'source'},{eventId:'top-A',kind:'source'}],stickyRecords:[],position:'top',direction:'top'});
  await h.wait(()=>h.w.document.querySelector('[data-compatible-event-id="top-B"]'));
  assert.equal(configCalls,0);
  assert.equal(h.w.__bbOpenLiveQA.getRuntime().config.danmakuAtBottom,false);
  assert.deepEqual([...rows(h).children].map(node=>node.dataset.compatibleEventId),['top-B','top-A']);
 }finally{h.close();}
});

test('managed ticker never publishes source prices or clears its clock during history replacement',async()=>{
 const h=await documentHarness();try{
  const sc=e('managed-30','onAddSuperChat',{price:30}),low=e('managed-2','onAddSuperChat',{price:2});
  h.send('host',{scale:1,tickerEnabled:true,managed:true});await sleep(30);
  const r=h.w.__bbOpenLiveQA.getRenderer(),changes=[];
  const startedAt=Date.now()-10000,expiresAt=startedAt+180000;
  h.send('presentation',{layout:[],stickyRecords:[{record:sc,startedAt,expiresAt}]});
  await h.wait(()=>h.posts.some(p=>p.data.command==='presented'));
  r.$watch(()=>r.paidMessages,()=>changes.push(Array.from(r.paidMessages,m=>({id:m.id,start:m.bbHostStartedAt,end:m.bbHostExpiresAt}))),{deep:true,sync:true});
  const records=[sc,low,...Array.from({length:55},(_,i)=>e('flow-'+i))];
  h.send('hydrate',{records});await h.wait(()=>h.posts.some(p=>p.data.command==='hydrated'));
  h.send('config',{minTickerPrice:0,maxNumber:50});await sleep(80);
  assert.ok(changes.every(rows=>rows.length===1&&rows[0].id==='managed-30'&&rows[0].start===startedAt&&rows[0].end===expiresAt),JSON.stringify(changes));
  h.send('presentation',{layout:[],stickyRecords:[]});await sleep(30);
  assert.equal(h.w.document.querySelector('yt-live-chat-ticker-renderer').hidden,true);
 }finally{h.close();}
});
test('managed append retains only the current host source window without resetting surviving rows',async()=>{
 const h=await documentHarness();try{
  h.send('host',{scale:1,tickerEnabled:true,managed:true});await sleep(30);
  h.send('config',{maxNumber:60});await sleep(30);
  const first=Array.from({length:60},(_,i)=>e('bounded-'+i));
  const presentation=records=>({layout:records.map(record=>({eventId:record.payload.id,kind:'source'})),stickyRecords:[],position:'top',direction:'bottom'});
  h.send('hydrate',{records:first,presentation:presentation(first)});await h.wait(()=>h.posts.some(p=>p.data.command==='hydrated'));
  const runtime=h.w.__bbOpenLiveQA.getRuntime(),r=h.w.__bbOpenLiveQA.getRenderer();
  const old=r.messages.find(m=>m.id==='bounded-1'),time=+old.addTime;
  const next=e('bounded-60');h.send('event-batch',{records:[next],presentation:presentation([...first.slice(1),next])});
  await h.wait(()=>r.messages.some(m=>m.id==='bounded-60'));
  assert.equal(runtime.records.size,60);assert.equal(runtime.records.has('bounded-0'),false);
  assert.equal(+r.messages.find(m=>m.id==='bounded-1').addTime,time);
  assert.equal(r.messages.find(m=>m.id==='bounded-1'),old);
  runtime.records.get('bounded-1').event.payload.content='更新正文';runtime.recompute();
  assert.notEqual(r.messages.find(m=>m.id==='bounded-1'),old);
  assert.equal(r.messages.find(m=>m.id==='bounded-1').content,'更新正文');
  assert.equal(r.messages.some(m=>m.id==='bounded-0'),false);
 }finally{h.close();}
});
