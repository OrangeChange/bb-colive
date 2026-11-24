import test from 'node:test';
import assert from 'node:assert/strict';
import { createBuiltinNativeTheme } from '../src/themes/nativeBuiltinThemes.ts';
import { renderNativeVisualBlocks } from '../src/themes/nativeManagedCss.ts';
import { reverseSyncNativeVisualCss } from '../src/themes/nativeCssReverseSync.ts';

test('图片宽高及尺寸约束反向同步后完整回到模型', () => {
  const settings=createBuiltinNativeTheme('native-default').settings;
  settings.visualModel.common['all|all|inlineEmote']={width:{source:'custom',value:{mode:'fixed',value:48}},height:{source:'custom',value:{mode:'fixed',value:32}}};
  const css=renderNativeVisualBlocks(settings).join('\n');
  const result=reverseSyncNativeVisualCss(css,settings.visualModel);
  assert.equal(result.error,'');
  assert.equal(result.unmanagedCss,'');
  assert.deepEqual(result.model,settings.visualModel);
});

test('价格颜色保留局部覆盖，头像宽高分别保存', () => {
  const settings=createBuiltinNativeTheme('native-default').settings;
  settings.visualModel.common['gift|all|price']={color:{source:'custom',value:'rgb(13, 71, 109)'}};
  settings.visualModel.common['all|all|avatar']={width:{source:'custom',value:{mode:'fixed',value:48}},height:{source:'custom',value:{mode:'fixed',value:32}}};
  const css=renderNativeVisualBlocks(settings).join('\n');
  const result=reverseSyncNativeVisualCss(css,settings.visualModel);
  assert.equal(result.error,'');
  assert.equal(result.unmanagedCss,'');
  assert.deepEqual(result.model,settings.visualModel);
});
