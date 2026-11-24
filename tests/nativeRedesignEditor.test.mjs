import test from'node:test';import assert from'node:assert/strict';
import{createBuiltinNativeTheme}from'../src/themes/nativeBuiltinThemes.ts';import{renderManagedNativeCss}from'../src/themes/nativeManagedCss.ts';import{reverseSyncNativeVisualCss}from'../src/themes/nativeCssReverseSync.ts';import{nativeEventScopePath,resolveNativePartShape}from'../src/themes/nativeThemeCapabilities.ts';import{resolveNativeEventScope}from'../src/themes/nativeSemanticSelectors.ts';
import { findNativeNavigation, normalizeNativeNavigationSelection } from '../src/themes/nativeVisualNavigation.ts';
test('切入无卡片的互动或无表头的系统范围时回到有效事件部件',()=>{
  for(const event of ['interaction','enter','follow','like']) assert.equal(normalizeNativeNavigationSelection({event,identity:'all',part:'card'}).part,'row');
  for(const event of ['system','liveStatus','roomMute']) assert.equal(findNativeNavigation({event,identity:'all',part:'header'}),undefined);
  assert.ok(findNativeNavigation({event:'interaction',identity:'all',part:'header'}));
  assert.ok(findNativeNavigation({event:'system',identity:'all',part:'card'}));
});
test('活动状态提供共用入口，具体开奖范围不显示无效状态部件',()=>{
  assert.ok(findNativeNavigation({event:'all',identity:'all',part:'activityStatus'}));
  assert.ok(findNativeNavigation({event:'redpocketStart',identity:'all',part:'activityStatus'}));
  assert.equal(findNativeNavigation({event:'redpocketResult',identity:'all',part:'activityStatus'}),undefined);
});
test('活动阶段保留礼物祖先并由具体开始项点选定位',()=>{assert.deepEqual(nativeEventScopePath('redpocketStart').map(x=>x.id),['gift','redpocket','redpocketStart']);assert.equal(resolveNativeEventScope(s=>['.type-redpocket','.redpocket-start'].includes(s)),'redpocketStart')});
test('卡片表头和活动状态沿用可视化层并可反向读回',()=>{const doc=createBuiltinNativeTheme('native-default');doc.settings.visualModel={common:{'redpocketStart|captain|card':{fontSize:{source:'custom',value:{mode:'fixed',value:27}}},'all|all|header':{lineHeight:{source:'custom',value:1.7}},'lotteryStart|all|activityStatus':{color:{source:'custom',value:'#123456'}}},light:{},dark:{}};const css=renderManagedNativeCss(doc.settings);assert.match(css,/:not\(\.event-sticky\)/);assert.match(css,/--event-font-size: 27px/);assert.match(css,/\.info/);assert.match(css,/\.activity-status/);const back=reverseSyncNativeVisualCss(css,{});assert.equal(back.model.common['redpocketStart|captain|card'].fontSize.value.value,27);assert.equal(back.model.common['all|all|header'].lineHeight.value,1.7);assert.equal(back.model.common['lotteryStart|all|activityStatus'].color.value,'#123456')});
test('活动和SC图标提供图像属性，不提供无效字体控件',()=>{const display=createBuiltinNativeTheme('native-default').settings.display;for(const event of['superchat','redpocketStart','redpocketResult','lotteryStart','lotteryResult'])assert.equal(resolveNativePartShape('eventIcon',{event,display}),'image')});
