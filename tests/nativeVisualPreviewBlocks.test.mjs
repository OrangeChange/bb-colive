import test from 'node:test';
import assert from 'node:assert/strict';
import {createBuiltinNativeTheme} from '../src/themes/nativeBuiltinThemes.ts';
import {renderNativeVisualBlocks} from '../src/themes/nativeManagedCss.ts';

test('图片边框按选中部件生成且不被常规边框清除',()=>{
 const settings=createBuiltinNativeTheme('native-default').settings;
 settings.visualModel={common:{'all|all|row':{borderImage:{source:'custom',value:'url("assets/frame.png") 20 fill / 12px / 0px stretch'}}},light:{},dark:{}};
 const css=renderNativeVisualBlocks(settings).join('\n');
 assert.match(css,/border-image: url\("assets\/frame.png"\) 20 fill \/ 12px \/ 0px stretch/);
});

test('拖动覆盖只包含可视化目标，不重新生成类型开关或价格档位',()=>{
 const settings=createBuiltinNativeTheme('native-default').settings;
 settings.visualModel={common:{'all|all|row':{background:{source:'custom',value:'linear-gradient(90deg, #123456, transparent)'}}},light:{},dark:{}};
 const css=renderNativeVisualBlocks(settings).join('\n');
 assert(css.includes('linear-gradient(90deg, #123456, transparent)'));
 assert(!css.includes('price-tier-'));assert(!css.includes('theme-target-obs'));
});
