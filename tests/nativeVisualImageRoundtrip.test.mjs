import test from 'node:test';
import assert from 'node:assert/strict';
import { readImageBackground } from '../src/components/themeImageValue.ts';
import { createBuiltinNativeTheme } from '../src/themes/nativeBuiltinThemes.ts';
import { renderNativeVisualBlocks } from '../src/themes/nativeManagedCss.ts';
import { reverseSyncNativeVisualCss } from '../src/themes/nativeCssReverseSync.ts';

test('未修改背景CSS时保留隐藏图片层和编辑参数',()=>{
 const settings=createBuiltinNativeTheme('native-default').settings;
 const background=readImageBackground({backgroundImage:'url("assets/a.png"),url("assets/b.png")',backgroundColor:'rgb(1, 2, 3)',backgroundSize:'80px 40px'});
 background.kind='image-background';background.layers[1].visible=false;
 settings.visualModel.common['all|all|username']={background:{source:'custom',value:background}};
 const result=reverseSyncNativeVisualCss(renderNativeVisualBlocks(settings).join('\n'),settings.visualModel);
 assert.deepEqual(result.model.common['all|all|username'].background.value,background);
});

test('边框宽度配套声明随模型同步，不残留到自定义CSS',()=>{
 const settings=createBuiltinNativeTheme('native-default').settings;
 settings.visualModel.common['all|all|username']={borderWidth:{source:'custom',value:{mode:'fixed',value:2}}};
 const result=reverseSyncNativeVisualCss(renderNativeVisualBlocks(settings).join('\n'),settings.visualModel);
 assert.equal(result.unmanagedCss,'');
});

test('未纳入可视化的手写尺寸约束保持原样',()=>{
 const css='/* visual:common|all|all|message */\n.event .message { width: 80px; max-width: none; }';
 const result=reverseSyncNativeVisualCss(css,{});
 assert.match(result.unmanagedCss,/width: 80px/);
 assert.match(result.unmanagedCss,/max-width: none/);
});
