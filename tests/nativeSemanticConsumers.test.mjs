import test from 'node:test';
import assert from 'node:assert/strict';
import { createBuiltinNativeTheme } from '../src/themes/nativeBuiltinThemes.ts';
import { renderManagedNativeCss } from '../src/themes/nativeManagedCss.ts';
import { reverseSyncNativeVisualCss } from '../src/themes/nativeCssReverseSync.ts';
import { nativeVisualPropertiesForPart, resolveNativePartShape } from '../src/themes/nativeThemeCapabilities.ts';
import { resolveNativeEventScope } from '../src/themes/nativeSemanticSelectors.ts';

test('CSS生成消费公共身份与专属价格映射，普通行和置顶栏不串用', () => {
 const theme = createBuiltinNativeTheme('native-default');
 theme.settings.visualModel = {
  'guard|captain|giftPrice': { color: {source:'custom',value:'#123456'} },
  'all|all|row': { background: {source:'custom',value:'#234567'} },
  'all|all|sticky': { background: {source:'custom',value:'#345678'} },
  'all|all|stickyEvent': { background: {source:'custom',value:'#456789'} },
 };
 const css=renderManagedNativeCss(theme.settings);
 assert.match(css,/\.event\.type-guard\.guard-level-3 \.price\.gift-price/);
 assert.match(css,/\.event-list \.event\s*\{/);
 assert.match(css,/\.sticky-area\s*\{/);
 assert.match(css,/\.event\.event-sticky\s*\{/);
 assert.doesNotMatch(css,/\.sticky\s*\{/);
});

test('CSS反向同步不把图片文字和容器尺寸误当作可编辑属性', () => {
 const css = `/* visual:common|all|all|avatarFrame */\n.event .avatar-frame { font-size: 20px; width: 32px; }\n/* visual:common|all|all|content */\n.event .content { width: 40px; background: red; }`;
 const result=reverseSyncNativeVisualCss(css,{});
 assert.equal(result.model.common['all|all|avatarFrame'].fontSize,undefined);
 assert.deepEqual(result.model.common['all|all|avatarFrame'].width.value,{mode:'fixed',value:32});
 assert.equal(result.model.common['all|all|content'].width,undefined);
 assert.equal(result.model.common['all|all|content'].background.value,'red');
 assert.match(result.unmanagedCss,/font-size: 20px/);
 assert.match(result.unmanagedCss,/width: 40px/);
});

test('switchable 部件按当前形态约束面板、生成器和反向同步', () => {
 const theme = createBuiltinNativeTheme('native-default');
 theme.settings.display.guardIdentityDisplayMode = 'icon';
 theme.settings.visualModel = {
  common: { 'all|all|guardBadge': {
   color: {source:'custom',value:'#123456'},
   height: {source:'custom',value:{mode:'fixed',value:32}},
  } }, light: {}, dark: {},
 };
 assert.equal(resolveNativePartShape('guardBadge', { event: 'all', display: theme.settings.display }), 'image');
 assert.equal(nativeVisualPropertiesForPart('guardBadge', 'image').includes('color'), false);
 const css = renderManagedNativeCss(theme.settings);
 assert.doesNotMatch(css,/color: #123456/);
 assert.match(css,/--guard-badge-size: 32px/);
 const synced = reverseSyncNativeVisualCss(css, theme.settings.visualModel, { display: theme.settings.display });
 assert.deepEqual(synced.model.common['all|all|guardBadge'].color, {source:'custom',value:'#123456'});
 assert.deepEqual(synced.model.common['all|all|guardBadge'].height.value, {mode:'fixed',value:32});
});

test('荣耀勋章和事件图标使用当前文字或图片形态', () => {
 const theme = createBuiltinNativeTheme('native-default');
 theme.settings.display.honorLevelDisplayMode = 'text';
 assert.equal(resolveNativePartShape('honor', { event: 'all', display: theme.settings.display }), 'text');
 assert.equal(resolveNativePartShape('eventIcon', { event: 'guard', display: theme.settings.display }), undefined);
 assert.equal(resolveNativePartShape('eventIcon', { event: 'superchat', display: theme.settings.display }), 'image');
 theme.settings.visualModel = { common: {
  'all|all|honor': { color: {source:'custom',value:'#123456'}, width: {source:'custom',value:44} },
  'guard|all|eventIcon': { color: {source:'custom',value:'#234567'}, width: {source:'custom',value:28} },
 }, light: {}, dark: {} };
 const css = renderManagedNativeCss(theme.settings);
 assert.match(css,/color: #123456/);
 assert.doesNotMatch(css,/--wealth-medal-size: 44px/);
 assert.match(css,/color: #234567/);
 assert.match(css,/width: 28px/);
});

const matchClasses = (...classes) => {
 const available = new Set(classes);
 return selector => selector.split(',').some(branch => [...branch.matchAll(/\.([\w-]+)/g)].every(([, name]) => available.has(name)));
};

test('预览点选优先解析礼物、互动和系统的二级事件范围', () => {
 assert.equal(resolveNativeEventScope(matchClasses('event','type-gift','gift-normal')), 'normal');
 assert.equal(resolveNativeEventScope(matchClasses('event','type-interaction','interact-follow')), 'follow');
 assert.equal(resolveNativeEventScope(matchClasses('event','type-system','system-room-change')), 'roomChange');
 assert.equal(resolveNativeEventScope(matchClasses('event','type-superchat')), 'superchat');
});


test('混合事件图标范围保留颜色与尺寸，图片范围仍排除字体属性', () => {
 const theme = createBuiltinNativeTheme('native-default');
 for (const event of ['all', 'guard']) {
  const shape = resolveNativePartShape('eventIcon', {event, display:theme.settings.display});
  const properties = nativeVisualPropertiesForPart('eventIcon', shape);
  assert.ok(properties.includes('width'));
  assert.ok(properties.includes('color'));
  theme.settings.visualModel = {common:{[`${event}|all|eventIcon`]:{
   width:{source:'custom',value:{mode:'fixed',value:31}},
   color:{source:'custom',value:'#123456'},
  }},light:{},dark:{}};
  const css=renderManagedNativeCss(theme.settings);
  assert.match(css,/width: 31px/);
  assert.match(css,/color: #123456/);
  const sync=reverseSyncNativeVisualCss(css,{}, {display:theme.settings.display});
  assert.equal(sync.model.common[`${event}|all|eventIcon`].width.value.value,31);
  assert.equal(sync.model.common[`${event}|all|eventIcon`].color.value,'#123456');
 }
 for(const event of ['gift','superchat','redpocketStart','lotteryResult']) {
  const shape=resolveNativePartShape('eventIcon',{event,display:theme.settings.display});
  assert.equal(shape,'image');
  assert.ok(!nativeVisualPropertiesForPart('eventIcon',shape).includes('fontSize'));
 }
});
