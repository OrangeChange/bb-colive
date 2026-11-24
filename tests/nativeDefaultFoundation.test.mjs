import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { getNativeEventSample } from './fixtures/nativeEventSamples.ts';
import { selectStylePreviewEvents, DEFAULT_STYLE_PREVIEW_POLICY } from '../src/preview/stylePreviewPolicy.ts';
let vite, EventRow;
before(async () => {
  vite = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-nativeDefaultFoundation.test.mjs",optimizeDeps:{noDiscovery:true,include:[]},configFile:false,server:{middlewareMode:true,watch:null},logLevel:'silent'});
  ({EventRow}=await vite.ssrLoadModule('/src/components/EventRow.tsx'));
});
after(async()=>{await vite?.close();});
const render=(ev,props={})=>renderToStaticMarkup(React.createElement(EventRow,{ev,liveLayout:true,showTime:false,...props}));
test('免费主价格保留价格语义，文字不拆成数值',()=>{
  const ev=getNativeEventSample('normal-gift');ev.gift.isFree=true;
  const html=render(ev);
  assert.match(html, /class="price gift-price gift-free-label[^>]*>免费<\/span>/);
  assert.doesNotMatch(html, /class="price-value">免费/);
  assert.match(render(getNativeEventSample('normal-gift')), /class="price-value">50<\/span>/);
});
test('舰种专用图片不借身份图标，周期保留一月及独立数值',()=>{
  const html=render(getNativeEventSample('guard'));
  assert.match(html,/assets\/events\/guard\/captain-animate.png/);
  assert.match(html,/class="number quantity-number">1/);
  assert.match(html,/class="unit quantity-unit">月/);
});
test('盲盒来源没有字面括号，动作图片名称数量独立',()=>{
  const ev=getNativeEventSample('normal-gift');ev.gift.blindGiftName='盲盒';ev.gift.blindPriceRmb=9;
  const html=render(ev);assert.doesNotMatch(html,/（|）/);
  assert.match(html,/blind-gift/);assert.doesNotMatch(html,/gift-source/);assert.match(html,/gift-count[^>]*><span class="prefix quantity-prefix">×/);
});
test('名单显示头像用户名，开奖摘要不以第一位获奖者代替',()=>{
  const html=render(getNativeEventSample('lottery-result'),{allowWinnerExpansion:true});
  assert.match(html,/winner-avatar/);assert.match(html,/2 人/);
  assert.doesNotMatch(html,/等 2 人/);
});
test('系统图标在有用户时仍保留，封面不输出可见行',()=>{
  assert.match(render(getNativeEventSample('block')),/system-message-icon/);
  assert.equal(render({...getNativeEventSample('text'),msgType:26}),'');
});
test('显示所有保持最低金额与置顶门槛，并恢复开奖活动置顶',()=>{
  const low=getNativeEventSample('normal-gift');low.gift.paymentRmb=50;
  const drawn=getNativeEventSample('lottery-start');drawn.activity={drawnAt:2000};drawn.lottery.timing={endsAt:1500,observedAt:1000,serverNow:1000,source:'explicit-end'};
  const settings={...DEFAULT_STYLE_PREVIEW_POLICY,giftThreshold:60,stickySettings:{...DEFAULT_STYLE_PREVIEW_POLICY.stickySettings,enabled:true,giftThreshold:60}};
  const output=selectStylePreviewEvents([low,drawn],settings,{target:'windows',mode:'static',displayAll:true,now:1000000});
  assert.deepEqual(output.events.map(e=>e.id),[drawn.id]);
  assert.deepEqual(output.sticky.map(c=>c.event.id),[drawn.id]);
  assert.equal(output.sticky[0].event.activity.drawnAt,2000);
});

test('编辑器提供数量、名单头像、成就与系统文字的独立部件及字重往返',async()=>{
 const {NATIVE_PART_SELECTORS}=await import('../src/themes/nativeSemanticSelectors.ts');
 const {nativeVisualPropertiesForPart}=await import('../src/themes/nativeThemeCapabilities.ts');
 for(const id of ['quantityNumber','winnerAvatar','honorMilestone','systemTitle']) assert.ok(NATIVE_PART_SELECTORS[id]);
 assert.ok(nativeVisualPropertiesForPart('quantityNumber').includes('fontWeight'));
 const {renderManagedNativeCss}=await import('../src/themes/nativeManagedCss.ts');
 const {createBuiltinNativeTheme}=await import('../src/themes/nativeBuiltinThemes.ts');
 const settings=createBuiltinNativeTheme('native-default').settings;
 settings.visualModel.common['all|all|quantityNumber']={fontWeight:{source:'theme',value:700}};
 assert.match(renderManagedNativeCss(settings),/font-weight: 700/);
});

test('部分名单保留可靠总人数，展开提示已收到人数',()=>{
 const ev=getNativeEventSample('lottery-result');ev.lottery.awardNum=8;
 const html=render(ev,{allowWinnerExpansion:true});assert.match(html,/8 人/);assert.match(html,/已收到 2 人名单/);
});

test('表头字重生成直接声明，作用于继承文字',async()=>{
 const {renderManagedNativeCss}=await import('../src/themes/nativeManagedCss.ts');
 const {createBuiltinNativeTheme}=await import('../src/themes/nativeBuiltinThemes.ts');
 const {default:postcss}=await import('postcss');
 const settings=createBuiltinNativeTheme('native-default').settings;
 settings.visualModel.common['all|all|header']={fontWeight:{source:'theme',value:700}};
 let weight;postcss.parse(renderManagedNativeCss(settings)).walkDecls('font-weight',d=>{weight=d.value;});assert.equal(weight,'700');
});
