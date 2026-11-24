import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { getNativeEventSample } from './fixtures/nativeEventSamples.ts';
import { DEFAULT_EVENT_DISPLAY_PREFERENCES } from '../src/eventDisplaySettings.ts';
import { createDefaultEventStyleSettings } from '../src/eventStyleSettings.ts';
let vite, Card;
const previousStorage=globalThis.localStorage, previousWindow=globalThis.window;
const storage=new Map();
globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
globalThis.window={localStorage:globalThis.localStorage,addEventListener(){},removeEventListener(){}};
before(async()=>{vite=await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-stickyEventCard.test.mjs",optimizeDeps:{noDiscovery:true,include:[]},configFile:false,root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true,watch:null},logLevel:'silent'});try { ({StickyEventCard:Card}=await vite.ssrLoadModule('/src/components/StickyEventCard.tsx')); }catch(error){if(!String(error).includes('Failed to load'))throw error;}});
after(async()=>{await vite?.close();globalThis.localStorage=previousStorage;globalThis.window=previousWindow;});
const render=(event,display=DEFAULT_EVENT_DISPLAY_PREFERENCES)=>{assert.ok(Card,'共享固定卡片应已实现');return renderToStaticMarkup(React.createElement(Card,{card:{event,amount:event.gift?.blindGiftName?5:50,occurredAt:1700000000000,expiresAt:1700007200000},now:1700000000000,display,eventStyleSettings:createDefaultEventStyleSettings()}));};
test('固定卡片复用公开类型、头像框、礼物价值和实际开出图，寿命提示不占可见正文',()=>{
  const event=getNativeEventSample('blind-gift');
  event.gift.paymentRmb=10;
  const html=render(event);
  assert.match(html,/event event-sticky sticky [^"]*\btype-gift gift-blind/);assert.match(html,/avatar-wrap/);assert.match(html,/avatar-frame/);
  assert.match(html,/class="price gift-price[^"]*"[^>]*><span class="price-unit">¥<\/span><span class="price-value">5<\/span>/);
  assert.match(html,/class="blind-profit[^"]*"[^>]*>▼-5<\/span>/);assert.doesNotMatch(html,/price blind-profit/);
  assert.match(html,new RegExp(event.gift.webp.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(html,/aria-description="剩余7200秒"/);assert.doesNotMatch(html,/2:00:00|sticky-countdown|<button|<details|class="message|blind-gift-icon/);
});
test('媒体开关与缺图沿用原组件回退',()=>{
  const event=getNativeEventSample('normal-gift');delete event.gift.webp;delete event.gift.icon;delete event.user.avatar;
  assert.match(render(event),/\/media\/noface.gif/);assert.match(render(event),/\/laplace\/gifts\/gift-fallback.png/);
  assert.doesNotMatch(render(event,{...DEFAULT_EVENT_DISPLAY_PREFERENCES,showAvatar:false,showGiftImage:false}),/avatar-wrap|gift-icon/);
});
test('盲盒开出零价值仍显示¥0，支付金额不被写成免费',()=>{
  const event=getNativeEventSample('blind-gift');event.gift.blindHitPriceRmb=0;event.gift.paymentRmb=30;
  assert.ok(Card);
  const html=renderToStaticMarkup(React.createElement(Card,{card:{event,amount:0,expiresAt:1700000060000},now:1700000000000,display:DEFAULT_EVENT_DISPLAY_PREFERENCES,eventStyleSettings:createDefaultEventStyleSettings()}));
  assert.match(html,/class="price gift-price[^"]*"[^>]*><span class="price-unit">¥<\/span><span class="price-value">0<\/span>/);assert.doesNotMatch(html,/免费/);
});
test('天选只显示天选、其他类别用现有event-icon；SC正文不进入卡片',()=>{
  const sc=getNativeEventSample('translated-sc');const html=render(sc);
  assert.match(html,/event-icon/);assert.doesNotMatch(html,new RegExp(sc.sc.message));
  const lot=getNativeEventSample('lottery-start');assert.match(render(lot),/天选/);
});
test('大航海固定卡片使用购买身份图片，不使用通用船形符号',()=>{
  const event=getNativeEventSample('guard-governor');
  const html=render(event);
  assert.match(html,/<img[^>]*class="event-icon/);
  assert.doesNotMatch(html,/🚢|class="guard-badge/);
});
test('副窗口固定设置持久化、恢复和默认关闭',async()=>{
  globalThis.window={localStorage:globalThis.localStorage,addEventListener(){},removeEventListener(){}};
  const {useGeneralSettings:store}=await vite.ssrLoadModule('/src/generalSettings.ts');
  assert.equal(typeof store.getState().setStickyEvents,'function');
  store.getState().setStickyEvents({enabled:true,position:'bottom',giftThreshold:40,maxCount:3,sort:'time'});
  const options=store.persist.getOptions();const saved=options.partialize(store.getState());
  assert.deepEqual(options.merge(saved,store.getState()).stickyEvents,{enabled:true,obsEnabled:true,position:'bottom',giftThreshold:40,maxCount:3,sort:'time'});
  store.getState().resetWindows();assert.deepEqual(store.getState().stickyEvents,{enabled:true,obsEnabled:true,position:'bottom',giftThreshold:40,maxCount:3,sort:'time'});
  store.getState().resetEventDisplay();assert.deepEqual(store.getState().stickyEvents,{enabled:false,obsEnabled:true,position:'top',giftThreshold:30,maxCount:20,sort:'amount'});
  globalThis.window=undefined;
});
test('固定卡片从左侧滑入，保留原公开根节点',()=>{
  const source=readFileSync(fileURLToPath(new URL('../src/components/StickyEventCard.tsx',import.meta.url)),'utf8');
  assert.match(source,/initial=\{\{ x: offset, opacity: 0 \}\}/);
  assert.match(source,/exit=\{\{ x: offset, opacity: 0 \}\}/);
  assert.doesNotMatch(source,/\by:/);
  assert.match(source,/event event-sticky sticky/);
});


test('置顶事件图标开关不隐藏礼物图标',()=>{
  const display={...DEFAULT_EVENT_DISPLAY_PREFERENCES,showEventIcon:false};
  assert.doesNotMatch(render(getNativeEventSample('translated-sc'),display),/class="event-icon\b/);
  assert.doesNotMatch(render(getNativeEventSample('guard-governor'),display),/class="event-icon\b/);
  assert.match(render(getNativeEventSample('normal-gift'),display),/class="gift-icon\b/);
});
