import test from 'node:test';
import assert from 'node:assert/strict';
import {createBuiltinNativeTheme} from '../src/themes/nativeBuiltinThemes.ts';
import {renderManagedNativeCss} from '../src/themes/nativeManagedCss.ts';
import {reverseSyncNativeVisualCss} from '../src/themes/nativeCssReverseSync.ts';

test('原生渐变的明暗覆盖与CSS往返保持一致',()=>{
 const theme=createBuiltinNativeTheme('native-card');
 const light='linear-gradient(90deg, rgb(100, 150, 200) 0%, transparent 100%)';
 const dark='radial-gradient(circle at 25% 50%, rgb(20, 40, 60) 0%, transparent 100%)';
 const key='gift|all|row';
 theme.settings.visualModel={common:{},light:{[key]:{background:{source:'custom',value:light}}},dark:{[key]:{background:{source:'custom',value:dark}}}};
 const css=renderManagedNativeCss(theme.settings);
 assert(css.includes(light));assert(css.includes(dark));
 const restored=reverseSyncNativeVisualCss(css,theme.settings.visualModel);
 assert.equal(restored.error,'');
 assert.equal(restored.model.light[key].background.value,light);
 assert.equal(restored.model.dark[key].background.value,dark);
});
