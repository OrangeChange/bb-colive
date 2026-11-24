import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeVisualCodeDefault} from '../src/themes/nativeThemeDefaults.ts';
import * as builtin from '../src/themes/nativeBuiltinThemes.ts';
import {composeNativeThemeCss} from '../src/themes/nativeThemeCascade.ts';
import {buildNativeThemeCssExport} from '../src/themes/themeCssExport.ts';
import {createStylePreviewEvents,createStylePreviewDesignEvents} from '../src/components/stylePreviewEvents.ts';

test('卡片主题独立注册，原生默认保留独立基础配色与既有设置',()=>{
 const base=builtin.createBuiltinNativeTheme('native-default');
 const card=builtin.createBuiltinNativeTheme('native-card');
 assert.equal(base.styles.baseCss, '');
 assert.equal(base.styles.customCss,'');
 assert.equal(base.settings.avatarSize,24);
 assert.equal(card.mode,'native');
 assert.equal(card.metadata.name,'浅映卡片');
 assert.equal(card.settings.avatarSize,32);
 assert.equal(card.settings.fontFamily,base.settings.fontFamily,'主题字体不能写入回放共用设置');
 assert.equal(card.settings.display.baseFontSize,16);
 assert.ok(card.styles.baseCss.includes('.event {'));
 assert.deepEqual(builtin.createBuiltinNativeThemes().map(t=>t.themeId),['native-default','native-card','native-bubble']);
});

test('浅映卡片在没有译文样例时沿用译文字号和行高',()=>{
 const card=builtin.createBuiltinNativeTheme('native-card');
 const target={event:'superchat',identity:'all',part:'translation'};
 assert.deepEqual(nativeVisualCodeDefault(target,'fontSize',card.settings,card.styles.baseCss),{mode:'base-relative',ratio:.875});
 assert.equal(nativeVisualCodeDefault(target,'lineHeight',card.settings,card.styles.baseCss),1.4);
});

test('免费礼物有独立设计样例，静态与点选使用同一实际集合',()=>{
 for(const create of [createStylePreviewEvents,createStylePreviewDesignEvents]){
  const ev=create('礼物').find(e=>e.gift?.isFree);
  assert.ok(ev,'需要免费价格样例');
  assert.equal(ev.gift.totalRmb,0);
  assert.equal(ev.gift.coinType,'silver');
 }
});

test('卡片CSS导出包含完整主题，可视化与自定义覆盖保持独立',()=>{
 const card=builtin.createBuiltinNativeTheme('native-card');
 card.settings.componentAppearance.message.color='#123456';
 card.styles.customCss='.event .message{color:#abcdef}';
 const css=composeNativeThemeCss(card);
 assert.equal(buildNativeThemeCssExport(card,'complete'),css);
 assert.ok(css.indexOf('#123456')<css.lastIndexOf('#abcdef'));
 assert.ok(!css.includes("@font-face"),"卡片沿用软件字体，不嵌入演示字库");
 assert.equal(builtin.createBuiltinNativeTheme('native-default').settings.componentAppearance.message.color,undefined);
});
