/** Executed compiled document tests in jsdom. This is NOT browser visual/layout evidence. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { BLIVECHAT_CAPABILITY } from '../../theme.ts';
import { compatibleSelectorFor, renderCompatibleManagedCss } from '../../../../themes/compatManagedCss.ts';
const require=createRequire(import.meta.url);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../../..');
const candidates=[process.env.BLIVECHAT_JSDOM_MODULE,path.join(root,'vendor/blivechat/node_modules/jsdom'),path.resolve(root,'../blivechat-dossier/runtime/harness-deps/node_modules/jsdom')].filter(Boolean);
const modulePath=candidates.find(fs.existsSync);
const JSDOM=modulePath ? require(modulePath).JSDOM : null;
const output=process.env.BLIVECHAT_TEST_OUTPUT ? path.resolve(process.env.BLIVECHAT_TEST_OUTPUT) : path.join(root,'public/blivechat');
const bundle=path.join(output,'renderer.js');
const enabled=!!JSDOM && fs.existsSync(bundle);
if (!enabled) throw new Error('Compiled document tests require vendor/blivechat npm ci (jsdom26.1.0) and npm run build:blivechat. Tests may not silently skip.');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
async function mount({preset='/* preset */ yt-live-chat-renderer { color: red; }'}={}) {
  const dom=new JSDOM('<!doctype html><html><head></head><body><div id="app"></div></body></html>',{url:'https://bb.invalid/blivechat/renderer.html',runScripts:'outside-only',pretendToBeVisual:true});
  const win=dom.window,messages=[],errors=[];
  const parent={postMessage:(message,origin)=>messages.push({message,origin})};
  Object.defineProperty(win,'parent',{value:parent});win.TextEncoder=global.TextEncoder;
  win.Element.prototype.getAnimations ??= () => [];
  win.fetch=async()=>preset===null?{ok:false,status:404}:{ok:true,text:async()=>preset};
  win.Image=class{naturalWidth=128;naturalHeight=128;set src(_url){queueMicrotask(()=>this.onload?.());}};
  win.addEventListener('error',event=>errors.push(event.message));
  win.eval(fs.readFileSync(bundle,'utf8'));await tick();
  const send=(command,data,origin=win.location.origin,source=parent)=>win.dispatchEvent(new win.MessageEvent('message',{source,origin,data:{type:'bb-blivechat',command,data}}));
  const snapshot=()=>{send('inspect');return messages.filter(item=>item.message.command==='snapshot').at(-1)?.message.data;};
  const renderer=()=>{const vm=win.document.querySelector('yt-live-chat-renderer')?.__vue__;return vm?.$refs.renderer || vm;};
  const flush=async()=>{await tick();const vm=renderer();if(!vm)return;win.clearTimeout(vm.emitSmoothedMessageTimerId);vm.emitSmoothedMessageTimerId=null;const groups=vm.smoothedMessageQueue.flat();vm.smoothedMessageQueue=[];vm.handleMessageGroup(groups);await tick();};
  return{dom,win,messages,errors,parent,send,snapshot,renderer,flush,close:()=>dom.window.close()};
}
const emitText=(id,extra={})=>({method:'onAddText',payload:{id,content:'hello',authorName:'author',authorType:0,authorLevel:60,isMobileVerified:true,emoticon:null,medalLevel:10,...extra}});
const emitGift=id=>({method:'onAddGift',payload:{id,authorName:'author',totalCoin:70000,giftName:'礼物',num:1}});
const emitSc=(id,price=700)=>({method:'onAddSuperChat',payload:{id,authorName:'author',price,content:'SC'}});

for (const direction of ['bottom', 'top']) test(`managed ${direction} mixed async flush keeps Vue message order aligned`, async()=>{
 const h=await mount();try{
  const presentation=ids=>({layout:ids.map(eventId=>({kind:'source',eventId})),stickyRecords:[],direction,contentAlignment:'top',position:'top',animation:{preset:'none',durationMs:0}});
  h.send('host',{managed:true,scale:1,tickerEnabled:false,direction});
  h.send('hydrate',{records:[emitText('order-old')],presentation:presentation(['order-old'])});
  await tick();await tick();await h.flush();
  const vm=h.renderer(),old=vm.messages[0],oldNode=h.win.document.querySelector('[data-compatible-event-id="order-old"]');
  const wanted=direction==='top'?['order-gift','order-text','order-old']:['order-old','order-text','order-gift'];
  const commits=[],flushes=[],flush=vm.flushMessagesBuffer;
  const beforeUpdate=()=>commits.push(Array.from(vm.messages,message=>message.id));
  vm.$options.beforeUpdate=[...(vm.$options.beforeUpdate||[]),beforeUpdate];
  vm.flushMessagesBuffer=function(...args){const result=flush.apply(this,args);flushes.push(Array.from(this.messages,message=>message.id));return result;};
  // Text projection resolves a Promise; gift admission is synchronous in the same real callback batch.
  h.send('event-batch',{records:[emitText('order-text'),emitGift('order-gift')],presentation:presentation(wanted)});
  await tick();await tick();await h.flush();await tick();
  const legal=ids=>ids.every((id,index)=>!index||wanted.indexOf(ids[index-1])<wanted.indexOf(id));
  assert.ok(flushes.length&&flushes.every(legal),JSON.stringify({flushes,wanted}));
  assert.ok(commits.length&&commits.every(legal),JSON.stringify({commits,wanted}));
  assert.deepEqual(Array.from(vm.messages,message=>message.id),wanted);
  assert.equal(vm.messages.find(message=>message.id===old.id),old);
  assert.equal(h.win.document.querySelector('[data-compatible-event-id="order-old"]'),oldNode);
  assert.ok(oldNode.isConnected);
  const references=new Map(Array.from(vm.messages,message=>[message.id,message]));
  const reversed=[...wanted].reverse();
  h.send('presentation',presentation(reversed));
  assert.deepEqual(Array.from(vm.messages,message=>message.id),reversed,'presentation must order the source array synchronously');
  await tick();await tick();
  for(const message of vm.messages)assert.equal(message,references.get(message.id));
  const stable=vm.messages;h.send('presentation',presentation(reversed));assert.equal(vm.messages,stable);
  await tick();await tick();
  assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

for (const direction of ['bottom', 'top']) test(`managed ${direction} capacity flush preserves native trimming and orders before Vue render`, async()=>{
 const h=await mount();try{
  const presentation=ids=>({layout:ids.map(eventId=>({kind:'source',eventId})),stickyRecords:[],direction,contentAlignment:'top',position:'top',animation:{preset:'none',durationMs:0}});
  h.send('host',{managed:true,scale:1,tickerEnabled:false,direction});
  h.send('config',{maxNumber:2});await tick();
  h.send('hydrate',{records:[emitText('capacity-a'),emitText('capacity-b')],presentation:presentation(['capacity-a','capacity-b'])});
  await tick();await tick();await h.flush();
  const vm=h.renderer(),removed=vm.messages[0],kept=vm.messages[1],time=+kept.addTime;
  const incoming={...kept,id:'capacity-new',contentParts:[{type:0,text:'new'}]};
  const wanted=direction==='top'?['capacity-new',kept.id]:[kept.id,'capacity-new'];
  h.send('presentation',presentation(direction==='top'?['capacity-new','capacity-a','capacity-b']:['capacity-a','capacity-b','capacity-new']));
  await tick();await tick();
  const commits=[];
  vm.$options.beforeUpdate=[...(vm.$options.beforeUpdate||[]),()=>commits.push(Array.from(vm.messages,message=>message.id))];
  vm.atBottom=true;vm.messagesBuffer=[incoming];
  await vm.flushMessagesBuffer();await tick();
  assert.deepEqual(Array.from(vm.messages,message=>message.id),wanted);
  assert.ok(commits.every(ids=>ids.every((id,index)=>!index||wanted.indexOf(ids[index-1])<wanted.indexOf(id))),JSON.stringify({commits,wanted}));
  assert.equal(vm.messages.length,2);assert.equal(vm.messagesBuffer.length,0);
  assert.ok(!vm.messages.includes(removed),'native capacity victim must not be restored');
  assert.equal(vm.messages.find(message=>message.id===kept.id),kept);assert.equal(+kept.addTime,time);
  assert.equal(vm.messages.find(message=>message.id==='capacity-new'),incoming);
  assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

for(const direction of ['bottom','top'])test(`managed ${direction} full host window retains all surviving rows after capacity clipping`,async()=>{
 const h=await mount();try{
  const presentation=ids=>({layout:ids.map(eventId=>({kind:'source',eventId})),stickyRecords:[],direction,contentAlignment:'top',position:'top',animation:{preset:'none',durationMs:0}});
  const ids=Array.from({length:60},(_,index)=>`full-${direction}-${direction==='top'?59-index:index}`);
  h.send('host',{managed:true,scale:1,tickerEnabled:false,direction});
  h.send('hydrate',{records:ids.map(id=>emitText(id)),presentation:presentation(ids)});
  await tick();await tick();await h.flush();
  const vm=h.renderer(),kept=vm.messages.find(message=>message.id===`full-${direction}-59`);
  const oldNode=h.win.document.querySelector(`[data-compatible-event-id="full-${direction}-59"]`),time=+kept.addTime;
  const next=`full-${direction}-60`;
  const wanted=direction==='top'?[next,...ids.slice(0,-1)]:[...ids.slice(1),next];
  h.send('event-batch',{records:[emitText(next)],presentation:presentation(wanted)});
  await tick();await tick();await h.flush();await tick();
  assert.deepEqual(Array.from(vm.messages,message=>message.id),wanted);
  assert.equal(vm.messages.length,60);assert.equal(vm.messages.find(message=>message.id===kept.id),kept);
  assert.equal(+kept.addTime,time);assert.equal(h.win.document.querySelector(`[data-compatible-event-id="${kept.id}"]`),oldNode);
  assert.ok(oldNode.isConnected);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('managed repeated presentation preserves host style text nodes and applies changed placement',async()=>{
 const h=await mount();try{
  const base={layout:[{kind:'source',eventId:'style-a'},{kind:'source',eventId:'style-b'}],stickyRecords:[],direction:'bottom',contentAlignment:'top',position:'top',animation:{preset:'none',durationMs:0}};
  h.send('host',{managed:true,scale:1,tickerEnabled:false,direction:'bottom'});
  h.send('hydrate',{records:[emitText('style-a'),emitText('style-b')],presentation:base});
  await tick();await tick();await h.flush();
  const style=h.win.document.getElementById('bb-blivechat-host-css'),text=style.textContent,textNode=style.firstChild;
  let mutations=0;
  const observer=new h.win.MutationObserver(records=>{mutations+=records.filter(record=>record.type==='childList').length;});
  observer.observe(style,{childList:true});
  try{
   for(let repeat=0;repeat<2;repeat++){
    h.send('presentation',base);await tick();await tick();
   }
   assert.equal(mutations,0,'相同 hostStyle 文本不得反复替换样式文本节点');
   assert.equal(style.firstChild,textNode);
   assert.equal(style.textContent,text);
   const changed={...base,layout:[...base.layout].reverse(),direction:'top',contentAlignment:'bottom',position:'bottom'};
   h.send('presentation',changed);await tick();await tick();
   assert.ok(mutations>0,'实际对齐和置顶变化必须更新样式');
   assert.notEqual(style.textContent,text);
   assert.ok(style.textContent.includes('margin-top:auto'));
   assert.ok(style.textContent.includes('order:2!important'));
   assert.equal(h.win.document.documentElement.dataset.tickerPosition,'bottom');
   assert.deepEqual(Array.from(h.win.document.querySelectorAll('#items.style-scope.yt-live-chat-item-list-renderer > [data-compatible-event-id]'),node=>node.dataset.compatibleEventId),['style-b','style-a']);
   mutations=0;
   h.send('presentation',changed);await tick();await tick();
   assert.equal(mutations,0,'更新后的相同配置也不得重复改写样式');
   assert.deepEqual(h.errors,[]);
  }finally{observer.disconnect();}
 }finally{h.close();}
});

test('managed presentation preserves the messages array when reference members are unchanged',async()=>{
 const h=await mount();try{
  const presentation=ids=>({layout:ids.map(eventId=>({kind:'source',eventId})),stickyRecords:[],direction:'bottom',contentAlignment:'top',position:'top',animation:{preset:'none',durationMs:0}});
  h.send('host',{managed:true,scale:1,tickerEnabled:false,direction:'bottom'});
  h.send('hydrate',{records:[emitText('stable-a'),emitText('stable-b')],presentation:presentation(['stable-a','stable-b'])});
  await tick();await tick();await h.flush();
  const vm=h.renderer(),messages=vm.messages,members=Array.from(messages);
  let changes=0;
  const unwatch=vm.$watch(()=>vm.messages,()=>{changes++;},{sync:true});
  try{
   for(let repeat=0;repeat<2;repeat++){
    h.send('presentation',presentation(['stable-a','stable-b']));await tick();await tick();
    assert.ok(vm.messages===messages,'相同引用成员不应替换真实 Vue messages 数组');
   }
   assert.equal(changes,0,'相同主流成员不应触发 messages 响应式更新');
   h.send('presentation',presentation(['stable-b']));await tick();await tick();
   assert.notEqual(vm.messages,messages);
   assert.deepEqual(Array.from(vm.messages,message=>message.id),['stable-b']);
   assert.equal(vm.messages[0],members[1],'过滤不得重建保留事件');
   assert.equal(changes,1,'实际过滤需要一次响应式更新');
   h.send('presentation',presentation([]));await tick();await tick();
   assert.equal(vm.messages.length,0,'空呈现仍须清除主流事件');
   assert.deepEqual(h.errors,[]);
  }finally{unwatch();}
 }finally{h.close();}
});

for (const direction of ['bottom', 'top']) test(`managed ${direction} append keeps existing rows connected`, async()=>{
 const h=await mount();try{
  const presentation=ids=>({layout:ids.map(eventId=>({kind:'source',eventId})),stickyRecords:[],direction,contentAlignment:'top',position:'top',animation:{preset:'lift',durationMs:250}});
  h.send('host',{managed:true,scale:1,tickerEnabled:false,direction});
  h.send('hydrate',{records:[emitText('motion-old')],presentation:presentation(['motion-old'])});
  await tick();await tick();await h.flush();
  const old=h.win.document.querySelector('[data-compatible-event-id="motion-old"]');
  const removed=[];
  const observer=new h.win.MutationObserver(records=>{for(const record of records)for(const node of record.removedNodes)if(node===old)removed.push(node);});
  observer.observe(old.parentNode,{childList:true});
  const ids=direction==='top'?['motion-new','motion-old']:['motion-old','motion-new'];
  h.send('event-batch',{records:[emitText('motion-new')],presentation:presentation(ids)});
  await tick();await h.flush();await tick();
  observer.disconnect();
  assert.equal(h.win.document.querySelector('[data-compatible-event-id="motion-old"]'),old);
  assert.equal(removed.length,0,'新事件进入不得移出旧节点并重启来源动画');
  assert.deepEqual(Array.from(old.parentNode.querySelectorAll(':scope > [data-compatible-event-id]'),node=>node.dataset.compatibleEventId),ids);
 }finally{h.close();}
});

test('compiled original document boots with public hooks and original scoped style, guarded parent protocol',{skip:!enabled},async()=>{
 const h=await mount();try{
  assert.ok(h.messages.some(x=>x.message.command==='ready'));const ready=h.messages.find(x=>x.message.command==='ready').message.data;assert.equal(ready.retainedSettings.length,16);assert.ok(!ready.retainedSettings.some(k=>k.startsWith('hostPaid')));assert.ok(h.renderer());assert.ok(h.win.document.querySelector('yt-live-chat-renderer[hide-timestamps]'));
  h.send('event',emitText('wrong-origin'),'https://other.invalid');h.send('event',emitText('wrong-source'),h.win.location.origin,{});
  h.send('event',emitText('good'));await h.flush();assert.deepEqual(Array.from(h.snapshot().messages,m=>m.id),['good']);
  const row=h.win.document.querySelector('yt-live-chat-text-message-renderer');assert.ok(row.querySelector('#author-photo'));assert.ok(row.querySelector('#message'));
  assert.ok(row.getAttributeNames().some(name=>name.startsWith('data-v-')));assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('compiled original document releases commands and timers on pagehide',async()=>{
 const h=await mount();try{
  const cleared=[];const originalClearInterval=h.win.clearInterval.bind(h.win);h.win.clearInterval=id=>{cleared.push(id);return originalClearInterval(id);};
  const before=h.messages.length;
  h.win.dispatchEvent(new h.win.PageTransitionEvent('pagehide',{persisted:false}));
  h.send('inspect');await tick();
  assert.equal(h.messages.length,before,'卸载后的来源文档不得继续处理宿主命令');
  assert.ok(cleared.length>0,'卸载时必须释放来源保留计时器');
 }finally{h.close();}
});

test('source document assigns stable event ids and reports username and context actions to its parent',async()=>{
 const h=await mount();try{
  h.send('event',emitText('action-row'));await h.flush();
  const row=h.win.document.querySelector('yt-live-chat-text-message-renderer');
  assert.equal(row.dataset.compatibleEventId,'action-row');
  row.querySelector('#author-name').dispatchEvent(new h.win.MouseEvent('click',{bubbles:true}));
  row.dispatchEvent(new h.win.MouseEvent('contextmenu',{bubbles:true,clientX:10,clientY:20}));
  assert.ok(h.messages.some(x=>x.message.command==='action'&&x.message.data.eventId==='action-row'&&x.message.data.action==='filter-user'));
  assert.ok(h.messages.some(x=>x.message.command==='context-menu'&&x.message.data.eventId==='action-row'));
  assert.equal(h.win.document.querySelector('.bb-action-menu'),null,'来源文档不能自建脱离软件能力的菜单');
 }finally{h.close();}
});

test('source document selects reveals and reports real Vue editor nodes without changing event ids',async()=>{
 const h=await mount();try{
  h.send('event',emitText('editor-row'));await h.flush();
  const messageSelector=compatibleSelectorFor(BLIVECHAT_CAPABILITY,'danmaku|all|main|message','common');
  assert.ok(messageSelector&&h.win.document.querySelector(messageSelector),'正式能力表必须命中发布 DOM 的正文');
  const managed=renderCompatibleManagedCss(BLIVECHAT_CAPABILITY,{common:{'danmaku|all|main|message':{fontSize:{source:'custom',value:31},color:{source:'custom',value:'rgb(1, 2, 3)'}}},light:{},dark:{}});
  h.send('css',{css:managed});await tick();
  const computed=h.win.getComputedStyle(h.win.document.querySelector(messageSelector));
  assert.equal(computed.fontSize,'31px');
  assert.equal(computed.color,'rgb(1, 2, 3)');
  const message=h.win.document.querySelector('yt-live-chat-text-message-renderer #message');
  const eventRow=message.closest('[data-compatible-event-id]');
  const revealStyle=h.win.document.createElement('style');revealStyle.textContent='.reveal-layout{display:flex}.reveal-layout.is-hidden{display:none}@media all{#message{line-height:calc(20px + 1px)}}';h.win.document.head.appendChild(revealStyle);eventRow.classList.add('reveal-layout','is-hidden');
  const selection={part:'message',reveal:true,selectors:{message:[BLIVECHAT_CAPABILITY.parts.message.selector],username:[BLIVECHAT_CAPABILITY.parts.username.selector]},focusSelectors:[messageSelector],strictScope:true,scheme:'dark',properties:{message:['fontSize','color','lineHeight']},scopeSelectors:{eventsByPlacement:BLIVECHAT_CAPABILITY.eventSelectorsByPlacement,identities:BLIVECHAT_CAPABILITY.identitySelectors,placements:Object.fromEntries(Object.entries(BLIVECHAT_CAPABILITY.eventSelectorsByPlacement).map(([key,value])=>[key,Object.values(value).join(',')]))}};
  h.send('editor-select',selection);await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(h.win.document.documentElement.dataset.theme,'dark');
  assert.equal(message.hasAttribute('data-compatible-editor-selected'),true);
  assert.equal(message.hasAttribute('data-compatible-editor-reveal'),false);
  assert.equal(eventRow.hasAttribute('data-compatible-editor-reveal'),true);
  assert.equal(eventRow.style.display,'flex','临时显露必须恢复来源 flex 布局');
  assert.ok(h.messages.some(x=>x.message.command==='editor-inspected'&&x.message.data.scope.part==='message'&&x.message.data.computed.fontSize.value==='31px'),'选择、CSS 或明暗变化后必须自动重采样，无需再次点击');
  message.dispatchEvent(new h.win.MouseEvent('click',{bubbles:true}));
  assert.ok(h.messages.some(x=>x.message.command==='editor-inspected'&&x.message.data.scope.part==='message'&&x.message.data.computed.fontSize.value==='31px'));
  h.send('css',{css:managed});await tick();message.dispatchEvent(new h.win.MouseEvent('click',{bubbles:true}));
  assert.ok(h.messages.some(x=>x.message.command==='editor-inspected'&&x.message.data.computed.lineHeight.mixed===true),'表达式必须保留并标示为混合值');
  h.send('editor-select',{...selection,focusSelectors:['.not-present'],strictScope:true});await tick();
  assert.equal(h.win.document.querySelector('[data-compatible-editor-selected]'),null,'限定范围失败时不得回退全局选择');
  h.send('editor-select',null);await tick();
  assert.equal(h.win.document.querySelector('[data-compatible-editor-reveal]'),null,'退出编辑必须清理临时显露');
  assert.equal(h.win.getComputedStyle(eventRow).display,'none','退出显露必须精确恢复原隐藏规则');
  assert.equal(message.closest('[data-compatible-event-id]').dataset.compatibleEventId,'editor-row');
 }finally{h.close();}
});

test('source document preserves the product Bilibili video action without rewriting source message DOM',async()=>{
 const h=await mount();try{
  h.send('event',emitText('video-row',{content:'参考 BV1xx411c7mD'}));await h.flush();
  const message=h.win.document.querySelector('yt-live-chat-text-message-renderer #message');
  const originalHtml=message.innerHTML;
  message.querySelector('span').dispatchEvent(new h.win.MouseEvent('click',{bubbles:true}));
  assert.equal(h.messages.some(x=>x.message.command==='action'&&x.message.data.action?.type==='open-link'),false);
  h.send('host',{scale:1,tickerEnabled:true,enableBilibiliVideoLinks:true});await tick();
  message.querySelector('span').dispatchEvent(new h.win.MouseEvent('click',{bubbles:true}));
  const action=h.messages.filter(x=>x.message.command==='action'&&x.message.data.action?.type==='open-link').at(-1)?.message.data;
  assert.deepEqual(JSON.parse(JSON.stringify(action)),{eventId:'video-row',action:{type:'open-link',href:'https://www.bilibili.com/video/BV1xx411c7mD'}});
  assert.equal(message.innerHTML,originalHtml,'产品动作桥不能改写来源消息 DOM');
 }finally{h.close();}
});

test('host command controls scale, source ticker, locate and reading state without rebuilding source rows',async()=>{
 const h=await mount();try{
  h.send('event',emitText('target'));h.send('event',emitSc('paid'));await h.flush();
  h.send('host',{scale:1.25,tickerEnabled:false,enableBilibiliVideoLinks:false});await tick();
  assert.equal(h.win.document.documentElement.style.getPropertyValue('--bb-host-scale'),'1.25');
  assert.equal(h.win.document.querySelector('yt-live-chat-ticker-renderer').hidden,true);
  h.send('locate',{eventId:'target'});await tick();
  assert.equal(h.win.document.querySelector('[data-compatible-event-id="target"]').hasAttribute('data-compatible-located'),true);
  const scroller=h.win.document.getElementById('item-scroller');
  Object.defineProperties(scroller,{scrollHeight:{configurable:true,value:500},clientHeight:{configurable:true,value:100},scrollTop:{configurable:true,writable:true,value:120}});
  scroller.dispatchEvent(new h.win.Event('scroll'));
  const state=h.messages.filter(x=>x.message.command==='scroll-state').at(-1)?.message.data;
  assert.equal(state.followingLatest,false);assert.equal(state.scrollTop,120);assert.equal(state.scrollHeight,500);assert.equal(state.clientHeight,100);assert.equal(typeof state.nearStart,'boolean');assert.equal(typeof state.nearEnd,'boolean');
  h.send('restore-scroll',{followingLatest:false,scrollTop:64});await tick();
  assert.equal(scroller.scrollTop,64);assert.equal(h.renderer().atBottom,false);
  h.send('scroll-latest');await tick();
  assert.equal(h.renderer().atBottom,true);
 }finally{h.close();}
});

test('product presentation keeps mixed source and fallback order and closes the parent menu on iframe pointer',async()=>{
 const h=await mount();try{
  h.send('hydrate',{records:[emitText('a'),emitText('b')]});await tick();await tick();
  h.send('presentation',{layout:[{kind:'source',eventId:'a'},{kind:'fallback',eventId:'native'},{kind:'source',eventId:'b'}],stickyRecords:[],position:'top',direction:'bottom'});await tick();await tick();
  const rows=[...h.win.document.querySelectorAll('#items.style-scope.yt-live-chat-item-list-renderer > [data-compatible-event-id]')];
  assert.deepEqual(rows.map(row=>row.dataset.compatibleEventId),['a','native','b']);
  assert.equal(rows[1].dataset.compatibleFallbackId,'native');
  rows[1].dispatchEvent(new h.win.MouseEvent('pointerdown',{bubbles:true,button:0}));
  assert.ok(h.messages.some(item=>item.message.command==='pointer-down'));
 }finally{h.close();}
});

test('empty presentation removes every fallback slot and clears mixed layout state',async()=>{
 const h=await mount();try{
  h.send('presentation',{layout:[{kind:'fallback',eventId:'native'}],stickyRecords:[],position:'top',direction:'bottom'});await tick();
  assert.ok(h.win.document.querySelector('[data-compatible-fallback-id="native"]'));
  h.send('presentation',{layout:[],stickyRecords:[],position:'top',direction:'bottom'});await tick();
  assert.equal(h.win.document.querySelector('[data-compatible-fallback-id]'),null);
  assert.ok(h.messages.some(item=>item.message.command==='fallback-slots-ready'&&item.message.data.ids.length===0));
 }finally{h.close();}
});

test('source presentation marks a leaving row for the host exit animation',async()=>{
 const h=await mount();try{
  h.send('hydrate',{records:[emitText('leaving')]});await tick();await tick();
  h.send('presentation',{layout:[{kind:'source',eventId:'leaving',removing:true}],stickyRecords:[],position:'top',direction:'bottom',animation:{preset:'fade',durationMs:120}});await tick();await tick();
  const row=h.win.document.querySelector('[data-compatible-event-id="leaving"]');
  assert.equal(row?.dataset.compatibleEventRemoving,'true');
  assert.equal(row?.style.getPropertyValue('--bb-event-exit-duration'),'120ms');
 }finally{h.close();}
});

test('scroll-state marks only scrolls preceded by user intent as user initiated',async()=>{
 const h=await mount();try{
  const scroller=h.win.document.getElementById('item-scroller');
  h.send('scroll-latest');await tick();
  assert.equal(h.messages.filter(item=>item.message.command==='scroll-state').at(-1).message.data.userInitiated,false);
  scroller.dispatchEvent(new h.win.WheelEvent('wheel',{bubbles:true,deltaY:10}));
  scroller.dispatchEvent(new h.win.Event('scroll'));await tick();
  assert.equal(h.messages.filter(item=>item.message.command==='scroll-state').at(-1).message.data.userInitiated,true);
 }finally{h.close();}
});

test('product direction owns latest edge and restore anchor after hydrated presentation',async()=>{
 const h=await mount();try{
  h.send('hydrate',{records:[emitText('a'),emitText('b')]});await tick();await tick();
  h.send('presentation',{layout:[{kind:'source',eventId:'a'},{kind:'source',eventId:'b'}],stickyRecords:[],position:'top',direction:'top'});await tick();
  const scroller=h.win.document.getElementById('item-scroller');
  Object.defineProperties(scroller,{scrollHeight:{configurable:true,value:500},clientHeight:{configurable:true,value:100},scrollTop:{configurable:true,writable:true,value:200}});
  h.send('scroll-latest');await tick();assert.equal(scroller.scrollTop,0);
  const anchor=h.win.document.querySelector('[data-compatible-event-id="b"]');Object.defineProperty(anchor,'offsetTop',{configurable:true,value:180});
  h.send('restore-scroll',{followingLatest:false,scrollTop:20,anchorId:'b',anchorOffset:30});await tick();assert.equal(scroller.scrollTop,150);
  h.send('host',{scale:1,tickerEnabled:true,enableBilibiliVideoLinks:false,direction:'bottom'});h.send('scroll-latest');await tick();assert.equal(h.renderer().atBottom,true);
 }finally{h.close();}
});

test('top flow keeps the newest edge through append and resize-driven relayout',async()=>{
 const h=await mount();try{
  h.send('host',{scale:1,tickerEnabled:false,enableBilibiliVideoLinks:false,direction:'top',managed:true});h.send('hydrate',{records:[emitText('a')]});await tick();await tick();h.send('presentation',{layout:[{kind:'source',eventId:'a'}],stickyRecords:[],position:'top',direction:'top'});await tick();
  const scroller=h.win.document.getElementById('item-scroller');Object.defineProperties(scroller,{scrollHeight:{configurable:true,value:500},clientHeight:{configurable:true,value:100},scrollTop:{configurable:true,writable:true,value:0}});
  h.send('event',emitText('b'));await h.flush();await tick();assert.equal(scroller.scrollTop,0);
  h.renderer().maybeResizeScrollContainer();h.renderer().maybeScrollToBottom();await tick();assert.equal(scroller.scrollTop,0);assert.equal(h.renderer().atBottom,true);
 }finally{h.close();}
});

test('software sticky candidates exclusively determine source ticker order',async()=>{
 const h=await mount();try{
  h.send('hydrate',{records:[emitSc('a'),emitSc('b')]});await tick();await tick();
  h.send('presentation',{layout:[{kind:'source',eventId:'a'},{kind:'source',eventId:'b'}],stickyRecords:[{record:emitSc('b'),startedAt:Date.now(),expiresAt:Date.now()+60000}],position:'top',direction:'bottom'});await tick();
  assert.deepEqual(Array.from(h.renderer().paidMessages,message=>message.id),['b']);
 }finally{h.close();}
});

test('software directly supplies 30 yuan SC ticker and controls ticker placement',async()=>{
 const h=await mount();try{
  h.send('presentation',{layout:[],stickyRecords:[{record:emitSc('software-sc',30),startedAt:1000,expiresAt:Date.now()+60000}],position:'bottom',direction:'bottom'});await tick();await tick();
  assert.deepEqual(Array.from(h.renderer().paidMessages,message=>message.id),['software-sc']);
  assert.equal(h.renderer().paidMessages[0].price,30);
  const root=h.win.document.querySelector('yt-live-chat-renderer'),ticker=h.win.document.querySelector('yt-live-chat-ticker-renderer'),list=h.win.document.querySelector('yt-live-chat-item-list-renderer');
  assert.ok(root.compareDocumentPosition(ticker)&h.win.Node.DOCUMENT_POSITION_FOLLOWING || ticker.compareDocumentPosition(list)&h.win.Node.DOCUMENT_POSITION_FOLLOWING);
  assert.equal(h.win.document.documentElement.dataset.tickerPosition,'bottom');
  assert.equal(h.renderer().$children.find(child=>child.$options.name==='Ticker').needToShow(h.renderer().paidMessages[0]),true);
 }finally{h.close();}
});

test('source paid rows never enter an empty software-owned ticker',async()=>{
 const h=await mount();try{
  h.send('host',{scale:1,tickerEnabled:true,enableBilibiliVideoLinks:false,direction:'bottom',managed:true});
  h.send('presentation',{layout:[{kind:'source',eventId:'source-sc'}],stickyRecords:[],position:'top',direction:'bottom'});await tick();
  h.send('event',emitSc('source-sc',700));await h.flush();await tick();
  assert.deepEqual(Array.from(h.renderer().paidMessages),[]);
 }finally{h.close();}
});

test('expired software ticker does not return when a source event is appended',async()=>{
 const h=await mount();try{
  h.send('host',{scale:1,tickerEnabled:true,enableBilibiliVideoLinks:false,direction:'bottom',managed:true});
  h.send('presentation',{layout:[],stickyRecords:[{record:emitSc('expired'),startedAt:1000,expiresAt:2000}],position:'top',direction:'bottom'});await tick();
  const ticker=h.renderer().$children.find(child=>child.$options.name==='Ticker');ticker.updateProgress();await tick();assert.deepEqual(Array.from(h.renderer().paidMessages),[]);
  h.send('event',emitText('after-expiry'));await h.flush();await tick();assert.deepEqual(Array.from(h.renderer().paidMessages),[]);
 }finally{h.close();}
});

test('ticker expiry keeps software candidates isolated from later unselected paid events',async()=>{
 const h=await mount();try{
  h.send('host',{scale:1,tickerEnabled:true,enableBilibiliVideoLinks:false,direction:'bottom',managed:true});
  h.send('presentation',{layout:[],stickyRecords:[
   {record:emitSc('expired',30),startedAt:1000,expiresAt:2000},
   {record:emitSc('keep',30),startedAt:Date.now(),expiresAt:Date.now()+60000},
  ],position:'top',direction:'bottom'});await tick();
  const ticker=h.renderer().$children.find(child=>child.$options.name==='Ticker');ticker.updateProgress();await tick();
  assert.deepEqual(Array.from(h.renderer().paidMessages,message=>message.id),['keep']);
  h.send('event',emitSc('not-selected',700));await h.flush();await tick();
  assert.deepEqual(Array.from(h.renderer().paidMessages,message=>message.id),['keep']);
 }finally{h.close();}
});

test('ticker leaving DOM keeps its stable identity when visible ticker order changes',async()=>{
 const h=await mount();try{
  h.send('event',emitSc('a'));h.send('event',emitSc('b'));await h.flush();await tick();
  const ticker=h.win.document.querySelector('yt-live-chat-ticker-renderer');
  const rows=[...ticker.querySelectorAll('yt-live-chat-ticker-paid-message-item-renderer')];
  const leavingId=rows[0].dataset.compatibleEventId,remainingId=rows[1].dataset.compatibleEventId;
  assert.ok(leavingId&&remainingId&&leavingId!==remainingId);
  const leaving=rows[0].cloneNode(true);leaving.dataset.compatibleEventId=leavingId;
  h.renderer().paidMessages=h.renderer().paidMessages.filter(message=>message.id===remainingId);await tick();
  ticker.querySelector('#items').prepend(leaving);await tick();
  assert.equal(leaving.dataset.compatibleEventId,leavingId,'离场节点不能按新数组 index 被改绑');
  assert.equal(rows[1].dataset.compatibleEventId,remainingId);
 }finally{h.close();}
});

test('complete CSS exact bytes and preset toggle are immediate in isolated document',{skip:!enabled},async()=>{
 const preset='/* preset */ html { --preset: 1; }',h=await mount({preset});try{
  const css='/* full CSS */\nhtml body yt-live-chat-renderer { --custom: "abc"; }';h.send('css',{css});
  assert.equal(h.win.document.getElementById('bb-blivechat-custom-css').textContent,css);
  h.send('config',{importPresetCss:true});await tick();await tick();assert.equal(h.win.document.getElementById('bb-blivechat-preset-link').href,'https://bb.invalid/custom_public/preset.css');
  h.send('config',{importPresetCss:false});assert.equal(h.win.document.getElementById('bb-blivechat-preset-link'),null);
  h.send('css',{css:''});assert.equal(h.win.document.getElementById('bb-blivechat-custom-css').textContent,'');
 }finally{h.close();}
});

test('missing optional upstream-style preset is reported explicitly',{skip:!enabled},async()=>{
 const h=await mount({preset:null});try{h.send('config',{importPresetCss:true});await tick();await tick();assert.ok(h.messages.some(x=>x.message.command==='error'&&x.message.data.code==='preset-unavailable'));}finally{h.close();}
});

test('settings rebuild changes existing gift DOM in place and keeps original first acceptance clock',{skip:!enabled},async()=>{
 const h=await mount();try{
  h.send('event',emitGift('gift'));await h.flush();const vm=h.renderer(),row=h.win.document.querySelector('yt-live-chat-paid-message-renderer');
  const addTime=+vm.messages[0].addTime;assert.equal(row.hasAttribute('show-only-header'),true);
  h.send('config',{showGiftName:true});await tick();assert.equal(h.win.document.querySelector('yt-live-chat-paid-message-renderer'),row);assert.ok(row.querySelector('#message').textContent.includes('礼物'));assert.equal(+h.renderer().messages[0].addTime,addTime);
  h.send('config',{showGift:false});await tick();assert.equal(h.win.document.querySelector('yt-live-chat-paid-message-renderer'),null);
  h.send('config',{showGift:true});await tick();assert.equal(h.renderer().messages[0].id,'gift');assert.equal(+h.renderer().messages[0].addTime,addTime);
 }finally{h.close();}
});

test('equal source config is idempotent and does not rebuild or clear the live queue',async()=>{
 const h=await mount();try{
  const config={minGiftPrice:0,showDanmaku:true,showGift:true,showGiftName:false,mergeSimilarDanmaku:false,mergeGift:false,maxNumber:60,blockGiftDanmaku:false,blockMirrorMessages:false,blockLevel:0,blockNewbie:false,blockNotMobileVerified:false,blockMedalLevel:0,showDebugMessages:false,importPresetCss:false,templateUrl:''};
  h.send('config',{...config});h.send('event',emitText('stable'));await h.flush();const row=h.win.document.querySelector('[data-compatible-event-id="stable"]');
  h.send('config',{...config});await tick();assert.equal(h.win.document.querySelector('[data-compatible-event-id="stable"]'),row);assert.equal(h.renderer().messages.length,1);
 }finally{h.close();}
});

test('original renderer live merge cannot consume a capped-away row before or after rebuild',{skip:!enabled},async()=>{
 const h=await mount();try{
  h.send('config',{maxNumber:1,mergeSimilarDanmaku:true});
  for(const [id,content]of[['a','same'],['b','other'],['c','same']]){h.send('event',emitText(id,{content}));await h.flush();}
  assert.equal(h.renderer().messages[0].id,'c');h.send('config',{showGiftName:true});await tick();assert.equal(h.renderer().messages[0].id,'c');
 }finally{h.close();}
});

test('custom SDK sandbox: exact source/null origin, init config, marker CSS and no duplicate replay race',{skip:!enabled},async()=>{
 const h=await mount();try{
  h.send('css',{css:'/* blc-inject-into-template */ body { color: red; }',presetCss:'body { margin: 0; }'});
  h.send('config',{templateUrl:'https://template.invalid/view',importPresetCss:true});await tick();await tick();
  let frame=h.win.document.querySelector('iframe');assert.equal(frame.getAttribute('sandbox'),'allow-scripts');assert.equal(frame.referrerPolicy,'no-referrer');const output=[];frame.contentWindow.postMessage=(message,origin)=>output.push({message,origin});
  h.win.dispatchEvent(new h.win.MessageEvent('message',{source:{},origin:'null',data:{type:'blcTemplateConnect'}}));assert.equal(output.length,0);
  h.win.dispatchEvent(new h.win.MessageEvent('message',{source:frame.contentWindow,origin:'https://template.invalid',data:{type:'blcTemplateConnect'}}));assert.equal(output.length,0);
  h.win.dispatchEvent(new h.win.MessageEvent('message',{source:frame.contentWindow,origin:'null',data:{type:'blcTemplateConnect'}}));
  h.send('event',emitSc('during-handshake'));await tick();await tick();
  assert.equal(output[0].message.type,'blcInit');assert.equal(output[0].message.data.sdkVersion,'1.0.1');assert.equal(output[0].message.data.config.showGiftName,false);
  assert.ok(output.some(x=>x.message.type==='blcInjectCss'&&x.message.data.injectCss.includes('blc-inject-into-template')));
  assert.equal(output.filter(x=>x.message.type==='blcAddMsg'&&x.message.data.id==='during-handshake').length,1);
  const oldFrame=frame;h.send('config',{showGiftName:true});await tick();await tick();frame=h.win.document.querySelector('iframe');assert.notEqual(frame,oldFrame,'SDK hot config requires automatic nested remount');
  const reconnected=[];frame.contentWindow.postMessage=message=>reconnected.push(message);
  h.win.dispatchEvent(new h.win.MessageEvent('message',{source:frame.contentWindow,origin:'null',data:{type:'blcTemplateConnect'}}));await tick();await tick();
  assert.equal(reconnected.find(m=>m.type==='blcInit').data.config.showGiftName,true);assert.equal(reconnected.filter(m=>m.type==='blcAddMsg'&&m.data.id==='during-handshake').length,1);
  h.send('config',{templateUrl:''});await tick();await tick();assert.ok(h.renderer());assert.equal(h.renderer().messages[0].id,'during-handshake');
 }finally{h.close();}
});

test('original random client pause/resume/reset wiring is present and source is untouched',{skip:!enabled},async()=>{
 const h=await mount();try{
  const types={text:true,emoticon:false,gift:false,member:false,superChat:false};h.send('simulation',{playing:true,speed:11,types});
  await new Promise(resolve=>setTimeout(resolve,250));h.send('simulation',{playing:false,speed:11,types});const before=h.snapshot().stats.records;assert.ok(before>0);
  await new Promise(resolve=>setTimeout(resolve,220));assert.equal(h.snapshot().stats.records,before);
  h.send('reset');assert.equal(h.snapshot().stats.records,0);
  h.send('simulation',{playing:false,speed:11,types});await tick();assert.equal(h.snapshot().stats.records,0);
 }finally{h.close();}
});

test('historical hydrate keeps receive clock, replaces once without smoothing backlog and handles following live events',{skip:!enabled},async()=>{
 const h=await mount();try{
  const old=Date.now()-3601000;
  const records=[{...emitSc('expired'),receivedAt:old},...Array.from({length:80},(_,i)=>({...emitText('h'+i,{content:'h'+i}),receivedAt:old+i+1}))];
  h.send('hydrate',{records});h.send('event',emitText('live-after-hydrate',{content:'live'}));
  await tick();await tick();await h.flush();
  assert.equal(h.renderer().smoothedMessageQueue.length,0);assert.equal(h.renderer().messages.at(-1).id,'live-after-hydrate');
  assert.equal(h.snapshot().paidMessages.some(m=>m.id==='expired'),false);
  assert.equal(h.snapshot().stats.records,82);
 }finally{h.close();}
});


test('compiled artifact is current for every host/core/build source and all delivered artifacts',()=>{
 const info=JSON.parse(fs.readFileSync(path.join(output,'build-info.json'),'utf8'));
 assert.ok(info.sourceHashes['src/compat/blivechat/runtime/core.mjs']);
 assert.ok(info.sourceHashes['src/nativeTextFilterFacts.mjs']);
 assert.ok(info.sourceHashes['src/compat/blivechat/runtime/nativeText.mjs']);
 for(const[name,expected]of Object.entries(info.sourceHashes))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex'),expected,`stale compiled artifact: ${name}; run build:blivechat`);
 for(const[name,expected]of Object.entries(info.artifactHashes))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(output,name))).digest('hex'),expected,name);
});

test('host paid filter reaches original DOM main list while ticker remains independent',async()=>{
 const h=await mount();try{
  h.send('config',{hostPaidFilter:true,hostPaidThreshold:.1,hostPaidMode:'unit',minGiftPrice:999});
  const gift=id=>({method:'onAddGift',payload:{id,authorName:'u',giftName:'gift',num:1,totalCoin:35000,bbPaidAmount:{unit:.06,cumulative:.06}}});
  h.send('event',gift('paid-a'));await h.flush();
  assert.equal(h.renderer().messages.length,0);assert.equal(h.renderer().paidMessages.length,1);
  h.send('event',gift('paid-b'));await h.flush();assert.equal(h.renderer().messages.length,0);
  h.send('config',{hostPaidMode:'cumulative'});await h.flush();assert.equal(h.renderer().messages.length,1);assert.equal(h.renderer().messages[0].num,2);
  h.send('config',{hostPaidThreshold:.13});await h.flush();assert.equal(h.renderer().messages.length,0);assert.equal(h.renderer().paidMessages.length,1);
  h.send('config',{hostPaidThreshold:.12});await h.flush();assert.equal(h.renderer().messages.length,1);
  assert.ok(h.win.document.querySelector('yt-live-chat-paid-message-renderer'));
 }finally{h.close();}
});
test('host cumulative live crossing does not apply queued merge delta twice to restored main row',async()=>{
 const h=await mount();try{
  h.send('config',{hostPaidFilter:true,hostPaidThreshold:.1,hostPaidMode:'cumulative'});
  const gift=id=>({method:'onAddGift',payload:{id,authorName:'u',giftName:'g',num:1,totalCoin:60,bbPaidAmount:{unit:.06,cumulative:.06}}});
  h.send('event',gift('a'));await h.flush();assert.equal(h.renderer().messages.length,0);
  h.send('event',gift('b'));await h.flush();
  assert.equal(h.renderer().messages[0].num,2);assert.equal(h.renderer().messages[0].price,.12);
  assert.equal(h.renderer().paidMessages[0].num,2);
 }finally{h.close();}
});
test('host filter leaves third-party template SDK unchanged pending separate lane support',async()=>{
 const h=await mount();try{
  h.send('config',{hostPaidFilter:true,hostPaidThreshold:1000,templateUrl:'https://template.invalid/'});await tick();await tick();
  const frame=h.win.document.querySelector('iframe'),sent=[];frame.contentWindow.postMessage=data=>sent.push(data);
  h.win.dispatchEvent(new h.win.MessageEvent('message',{source:frame.contentWindow,origin:'null',data:{type:'blcTemplateConnect'}}));
  h.send('event',emitGift('custom-gift'));await tick();await tick();
  assert.equal(sent.filter(x=>x.type==='blcAddMsg'&&x.data.id==='custom-gift').length,1);
  h.send('event',{method:'onDelSuperChat',payload:{ids:['custom-gift']}});
  assert(sent.some(x=>x.type==='blcDelMsgs'&&x.data.ids.includes('custom-gift')));
 }finally{h.close();}
});

for (const initial of [false,true]) test(`main gift description isolates expanded ticker, initial ${initial}, toggles and merge`,async()=>{
 const h=await mount();try{
  h.send('config',{showGiftName:initial,minGiftPrice:0});await tick();
  h.send('event',{...emitGift('scope-gift'),payload:{...emitGift('scope-gift').payload,num:2}});await h.flush();
  const vm=h.renderer(),ticker=vm.$children.find(child=>child.$options.name==='Ticker');
  const main=()=>h.win.document.querySelector('yt-live-chat-item-list-renderer yt-live-chat-paid-message-renderer');
  const pinned=()=>h.win.document.querySelector('yt-live-chat-ticker-renderer yt-live-chat-paid-message-renderer');
  const compact=()=>h.win.document.querySelector('yt-live-chat-ticker-renderer yt-live-chat-ticker-paid-message-item-renderer #text').textContent;
  h.win.document.querySelector('yt-live-chat-ticker-paid-message-item-renderer').click();await tick();
  const row=main(),clock=+vm.messages[0].addTime;
  const assertMain=(enabled,num)=>{assert.equal(main(),row);assert.equal(main().querySelector('#message').textContent,enabled?`Sent 礼物x${num}`:'');};
  assertMain(initial,2);assert.equal(pinned().querySelector('#message').textContent,'');
  for(const merged of [false,true]){
   if(merged){h.send('event',{...emitGift('scope-merge'),payload:{...emitGift('scope-merge').payload,num:3}});await h.flush();assert.equal(vm.messages[0].num,5);}
   const tickerText=compact(),pinnedRow=pinned(),header=pinned().querySelector('#purchase-amount').textContent;
   for(const enabled of [true,false,true,false]){
    h.send('config',{showGiftName:enabled});await tick();
    assertMain(enabled,merged?5:2);assert.equal(compact(),tickerText);assert.equal(pinned(),pinnedRow);
    assert.equal(pinned().querySelector('#message').textContent,'');assert.equal(pinned().querySelector('#purchase-amount').textContent,header);
    assert.equal(ticker.pinnedMessage.id,'scope-gift');assert.equal(+ticker.pinnedMessage.addTime,clock);assert.equal(+vm.messages[0].addTime,clock);assert.equal(+vm.paidMessages[0].addTime,clock);
   }
  }
  assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('gift-description toggles preserve free gift header, SC and membership content and clocks',async()=>{
 const h=await mount();try{
  h.send('config',{minGiftPrice:0});
  h.send('event',{method:'onAddGift',payload:{id:'free',authorName:'free',giftName:'免费礼物',num:4,totalCoin:0}});await h.flush();
  h.send('event',emitSc('control-sc'));await h.flush();
  h.send('event',{method:'onAddMember',payload:{id:'control-member',authorName:'member',privilegeType:3,num:1}});await h.flush();
  const list=h.win.document.querySelector('yt-live-chat-item-list-renderer'),before=list.textContent;
  assert.ok(before.includes('免费礼物x4'));assert.ok(before.includes('SC'));assert.ok(list.querySelector('yt-live-chat-membership-item-renderer'));
  const clocks=h.renderer().messages.map(m=>[m.id,+m.addTime]);
  for(const showGiftName of [true,false,true]){h.send('config',{showGiftName});await tick();assert.equal(list.textContent,before);assert.deepEqual(h.renderer().messages.map(m=>[m.id,+m.addTime]),clocks);}
 }finally{h.close();}
});

test('showGiftName hot update preserves a non-empty 20 item source queue and ticker clock',async()=>{
 const h=await mount();try{
  h.send('config',{minGiftPrice:0});
  for(let index=0;index<20;index+=1) h.send('event',index===0?emitSc(`queued-${index}`):emitText(`queued-${index}`));
  await tick();
  const vm=h.renderer(),ticker=vm.$children.find(child=>child.$options.name==='Ticker');
  h.win.clearTimeout(vm.emitSmoothedMessageTimerId);vm.emitSmoothedMessageTimerId=null;
  vm.handleMessageGroup=()=>{};vm.flushMessagesBuffer=()=>{};
  const before={
   messages:vm.messages.slice(),
   buffer:vm.messagesBuffer.slice(),
   smooth:vm.smoothedMessageQueue.slice(),
   paid:vm.paidMessages.slice(),
   pinned:ticker?.pinnedMessage,
   pinnedClock:ticker?.pinnedMessage?+ticker.pinnedMessage.addTime:null,
  };
  assert.equal(before.messages.length+before.buffer.length+before.smooth.length>=20,true);
  h.send('config',{showGiftName:true});
  assert.deepEqual(vm.messages.map(x=>x.id),before.messages.map(x=>x.id));
  assert.deepEqual(vm.messagesBuffer.map(x=>x.id),before.buffer.map(x=>x.id));
  assert.deepEqual(vm.smoothedMessageQueue.map(x=>x.id),before.smooth.map(x=>x.id));
  assert.deepEqual(vm.paidMessages.map(x=>x.id),before.paid.map(x=>x.id));
  assert.equal(ticker?.pinnedMessage?.id,before.pinned?.id);
  assert.equal(ticker?.pinnedMessage?+ticker.pinnedMessage.addTime:null,before.pinnedClock);
  await tick();
  assert.deepEqual(vm.messages.map(x=>x.id),before.messages.map(x=>x.id));
  assert.deepEqual(vm.messagesBuffer.map(x=>x.id),before.buffer.map(x=>x.id));
  assert.deepEqual(vm.smoothedMessageQueue.map(x=>x.id),before.smooth.map(x=>x.id));
 }finally{h.close();}
});
test('managed history preserves rows across the two-hour boundary',async()=>{
 const h=await mount();try{
  h.send('host',{managed:true,scale:1,tickerEnabled:false,direction:'bottom',contentAlignment:'top'});
  const old=Date.now()-3*60*60*1000;
  h.send('hydrate',{records:[{...emitText('old-managed',{content:'旧记录'}),receivedAt:old},{...emitText('new-managed',{content:'新记录'}),receivedAt:Date.now()}],presentation:{layout:[{kind:'source',eventId:'old-managed'},{kind:'source',eventId:'new-managed'}],stickyRecords:[],direction:'bottom',contentAlignment:'top',position:'top',animation:{preset:'none',durationMs:0}}});
  await tick();await tick();await h.flush();
  assert.deepEqual(Array.from(h.renderer().messages,message=>message.id),['old-managed','new-managed']);

 }finally{h.close();}
});

test('managed historical gifts stay in the main list after their ticker expires',async()=>{
 const h=await mount();try{
  h.send('host',{managed:true,scale:1,tickerEnabled:false,direction:'bottom'});
  h.send('hydrate',{records:[{...emitGift('old-gift'),receivedAt:Date.now()-3*60*60*1000},{...emitGift('new-gift'),receivedAt:Date.now()}],presentation:{layout:[{kind:'source',eventId:'old-gift'},{kind:'source',eventId:'new-gift'}],stickyRecords:[],direction:'bottom',position:'top',contentAlignment:'top',animation:{preset:'none',durationMs:0}}});
  await tick();await tick();await h.flush();
  assert.equal(h.renderer().messages.some(message=>message.id==='old-gift'),true);
  assert.equal(h.renderer().paidMessages.length,0);
 }finally{h.close();}
});
test('managed append during hydration keeps the latest presentation',async()=>{
 const h=await mount();try{
  h.send('host',{managed:true,scale:1,tickerEnabled:false,direction:'bottom'});
  const base={stickyRecords:[],direction:'bottom',position:'top',contentAlignment:'top',animation:{preset:'none',durationMs:0}};
  h.send('hydrate',{records:[emitText('first')],presentation:{...base,layout:[{kind:'source',eventId:'first'}]}});
  h.send('event-batch',{records:[emitText('second')],presentation:{...base,layout:[{kind:'source',eventId:'first'},{kind:'source',eventId:'second'}]}});
  await tick();await tick();await h.flush();
  assert.deepEqual(Array.from(h.renderer().messages,message=>message.id),['first','second']);
 }finally{h.close();}
});

test('presentation before managed host initialization settles without repeated DOM moves',async()=>{
 const h=await mount();try{
  h.send('hydrate',{records:[emitText('early-first'),emitText('early-second')]});
  await tick();await h.flush();
  let moves=0;
  const observer=new h.win.MutationObserver(records=>{moves+=records.filter(record=>record.target.id==='items').length;});
  observer.observe(h.win.document.body,{childList:true,subtree:true});
  h.send('presentation',{layout:[{kind:'source',eventId:'early-second'},{kind:'source',eventId:'early-first'}],stickyRecords:[],direction:'top',contentAlignment:'top',position:'top',animation:{preset:'none',durationMs:0}});
  await tick();await tick();
  const settled=moves;
  await tick();await tick();
  observer.disconnect();
  assert.equal(moves,settled);
  assert.deepEqual(Array.from(h.win.document.querySelectorAll('#items.style-scope.yt-live-chat-item-list-renderer > [data-compatible-event-id]'),node=>node.dataset.compatibleEventId),['early-second','early-first']);
  assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});
