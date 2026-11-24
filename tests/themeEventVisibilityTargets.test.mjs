import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveThemeEventVisibility, sceneCategoryFilters } from '../src/themes/themeEventVisibility.ts';
import { createNativeEventVisibilityPredicate, resolveOutputEventNeeds } from '../src/events/outputEventPolicy.ts';
import { createDefaultNativeEventVisibility } from '../src/themes/nativeComponentAppearance.ts';
import { normalizeCompatibleEventVisibility, isCompatibleThemeEventVisible } from '../src/themes/compatibleEventVisibility.ts';
import { DEFAULT_EVENT_FILTERS } from '../src/events/eventView.ts';
import { DEFAULT_EVENT_WINDOW_PREFERENCES } from '../src/windows/eventWindowPreferences.ts';
import { DEFAULT_STYLE_PREVIEW_POLICY, admitsStylePreviewEvent } from '../src/preview/stylePreviewPolicy.ts';
import { MsgType } from '../src/protocol/types.ts';
import { renderManagedNativeCss, scopeNativeEventVisibilityCss, readManagedNativeEventVisibility } from '../src/themes/nativeManagedCss.ts';
import { createBuiltinNativeTheme } from '../src/themes/nativeBuiltinThemes.ts';

const entry={id:'entry',roomId:1,ts:1000,msgType:MsgType.Interact,interactKind:'entry',user:{uid:1,uname:'进房用户',guardLevel:0}};
const like={...entry,id:'like',interactKind:'like',likeCount:1};
test('主题大类和细项按现场、副窗口、OBS 各自的范围生效',()=>{
 const visibility=createDefaultNativeEventVisibility();
 visibility.categories.interaction=false;visibility.children.enter=true;visibility.children.like=false;
 for(const [target,enterAllowed,likeAllowed] of [['live',true,true],['windows',true,false],['obs',false,false]]){
  const allows=createNativeEventVisibilityPredicate(resolveThemeEventVisibility(visibility,target));
  assert.equal(allows(entry),enterAllowed,target);assert.equal(allows(like),likeAllowed,target);
 }
 assert.equal(visibility.categories.interaction,false);
});
test('三个兼容来源使用相同场景范围，不放大来源支持范围',()=>{
 for(const mode of ['blivechat','blivechat-open','laplace']){
  const visibility=normalizeCompatibleEventVisibility(mode,{categories:{danmaku:false,gift:false,interaction:false},children:{normal:true,like:false}});
  const chat={...entry,msgType:MsgType.Danmu,text:'测试'};
  assert.equal(isCompatibleThemeEventVisible(mode,resolveThemeEventVisibility(visibility,'live'),chat),true);
  assert.equal(isCompatibleThemeEventVisible(mode,resolveThemeEventVisibility(visibility,'windows'),chat),true);
  assert.equal(isCompatibleThemeEventVisible(mode,resolveThemeEventVisibility(visibility,'obs'),chat),false);
 }
});
test('副窗口跟随现场大类，忽略现场细项，并保留窗口总开关',()=>{
 const scene=structuredClone(DEFAULT_EVENT_FILTERS);scene.left.interactKinds.entry=false;
 const filters=sceneCategoryFilters(scene);
 assert.equal(filters.left.interactKinds.entry,true);
 const preferences={...structuredClone(DEFAULT_EVENT_WINDOW_PREFERENCES),sceneFilters:scene};
 assert.equal(resolveOutputEventNeeds(entry,{roomId:1,preferences}).main,true);
 preferences.sceneFilters.left.interact=false;
 assert.equal(resolveOutputEventNeeds(entry,{roomId:1,preferences}).main,false);
 preferences.sceneFilters.left.interact=true;preferences.displayFilters.interact=false;
 assert.equal(resolveOutputEventNeeds(entry,{roomId:1,preferences}).main,false);
});
test('预览现场读全部现场细项，副窗口只读现场大类，OBS不读现场筛选',()=>{
 const policy=structuredClone(DEFAULT_STYLE_PREVIEW_POLICY);policy.filters.left.interactKinds.entry=false;
 const options={displayAll:false,mode:'static',now:1001};
 assert.equal(admitsStylePreviewEvent(entry,policy,{...options,target:'live'}),false);
 assert.equal(admitsStylePreviewEvent(entry,policy,{...options,target:'windows'}),true);
 policy.filters.left.interact=false;
 assert.equal(admitsStylePreviewEvent(entry,policy,{...options,target:'windows'}),false);
 assert.equal(admitsStylePreviewEvent(entry,policy,{...options,target:'obs'}),true);
});
test('新生成和已发布的事件显隐 CSS 都不影响现场',()=>{
 const settings=createBuiltinNativeTheme('native-default').settings;
 settings.eventVisibility.children.enter=false;
 const css=renderManagedNativeCss(settings);
 assert.match(css,/\.theme-target-obs \.event\.type-interaction/);
 assert.match(css,/\.theme-target-windows \.event\.interact-entry/);
 assert.doesNotMatch(css,/theme-target-live/);
 const legacy='/* danmu-managed:start */\n.event.type-interaction {display:none}\n.event.interact-entry, .event.interact-entry-effect {display:none}\n/* danmu-managed:end */';
 const scoped=scopeNativeEventVisibilityCss(legacy);
 assert.match(scoped,/\.theme-target-obs \.event\.type-interaction/);
 assert.match(scoped,/\.theme-target-windows \.event\.interact-entry/);
 assert.equal(readManagedNativeEventVisibility(scoped).categories.interaction,false);
 assert.equal(readManagedNativeEventVisibility(scoped).children.enter,false);
});
