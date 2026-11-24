import test from 'node:test';
import assert from 'node:assert/strict';
import {createBuiltinNativeTheme} from '../src/themes/nativeBuiltinThemes.ts';
import {renderNativeVisualBlocks} from '../src/themes/nativeManagedCss.ts';

test('子分类覆盖父分类，不依赖编辑先后顺序',()=>{
 const settings=createBuiltinNativeTheme('native-default').settings;
 settings.visualModel.common['normal|all|event']={paddingX:{source:'custom',value:13}};
 settings.visualModel.common['gift|all|event']={paddingX:{source:'custom',value:7}};
 const blocks=renderNativeVisualBlocks(settings);
 assert(blocks.findIndex(s=>s.includes('visual:common|gift|all|event'))<blocks.findIndex(s=>s.includes('visual:common|normal|all|event')));
});
