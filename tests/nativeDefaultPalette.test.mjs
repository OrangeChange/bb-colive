import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import postcss from 'postcss';
import {createBuiltinNativeTheme} from '../src/themes/nativeBuiltinThemes.ts';
import {composeNativeThemeCss} from '../src/themes/nativeThemeCascade.ts';
const names=['--text-name','--text-body','--text-secondary','--name-anchor','--name-admin','--name-captain','--name-admiral','--name-governor'];
test('原生默认的深浅配色来自基础层，自定义层无需配色',()=>{
 const theme=createBuiltinNativeTheme('native-default');
 assert.equal(theme.styles.baseCss,'');
 assert.equal(theme.styles.customCss,'');
 const shared=postcss.parse(readFileSync('src/eventStyle.css','utf8'));
 const variables=new Set();shared.walkDecls(d=>variables.add(d.prop));
 for(const name of names)assert.ok(variables.has(name),name);
 assert.doesNotMatch(theme.styles.baseCss,/--palette-/);
});
test('默认配色仍允许可视化和自定义CSS覆盖',()=>{
 const theme=createBuiltinNativeTheme('native-default');theme.styles.visualCss='.event.type-chat .message { color: rgb(12, 34, 56); }';theme.styles.customCss='.event.type-chat .message { color: rgb(65, 43, 21); }';
 const root=postcss.parse(composeNativeThemeCss(theme));const layers=[];root.walkDecls('color',d=>{if(d.value==='rgb(12, 34, 56)'||d.value==='rgb(65, 43, 21)')layers.push([d.value,d.parent.parent.params])});assert.deepEqual(layers,[['rgb(12, 34, 56)','config'],['rgb(65, 43, 21)','custom']]);
});
test('其他两个原生主题保留独立基础样式',()=>{
 for(const [id,file]of[['native-card','nativeCardTheme.css'],['native-bubble','nativeBubbleTheme.css']])assert.equal(createBuiltinNativeTheme(id).styles.baseCss,readFileSync('src/themes/'+file,'utf8').replaceAll('\r\n', '\n'));
});
