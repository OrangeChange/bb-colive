import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeEventDisplayPreferences,resolveEventDisplayPreferences,DEFAULT_EVENT_DISPLAY_PREFERENCES} from '../src/eventDisplaySettings.ts';
import {stylePreviewAnimation} from '../src/preview/stylePreviewPolicy.ts';
test('主题动画优先默认关闭，旧配置保持软件与主题动画叠加',()=>{
 assert.equal(DEFAULT_EVENT_DISPLAY_PREFERENCES.preferThemeAnimation,false);
 assert.equal(normalizeEventDisplayPreferences({}).preferThemeAnimation,false);
 assert.equal(normalizeEventDisplayPreferences({preferThemeAnimation:'true'}).preferThemeAnimation,false);
});
test('软件偏好与预览同步主题动画优先，不受主题旧值覆盖',()=>{
 const software=normalizeEventDisplayPreferences({preferThemeAnimation:true});
 assert.equal(resolveEventDisplayPreferences(DEFAULT_EVENT_DISPLAY_PREFERENCES,software).preferThemeAnimation,true);
 assert.equal(stylePreviewAnimation({displayPreferences:software}).preferThemeAnimation,true);
 assert.equal(resolveEventDisplayPreferences({...software},DEFAULT_EVENT_DISPLAY_PREFERENCES).preferThemeAnimation,false);
});
