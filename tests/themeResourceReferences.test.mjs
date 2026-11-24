import test from 'node:test';import assert from 'node:assert/strict';
import {localizeThemeResources} from '../src/themes/themeResourceDependencies.ts';
import {applyThemeAssetUrls} from '../src/themes/themeAssets.ts';
test('SVG片段与image-set字符串引用共享同一素材',()=>{
 const d={settings:{},styles:{baseCss:'.x{background:image-set("assets/a.svg#icon" 1x,url(assets/a.svg#other) 2x)}',visualCss:'',customCss:''}};
 const actual=applyThemeAssetUrls(d,new Map([['assets/a.svg','http://127.0.0.1:1/theme-resources/shared/s/a.svg']]));
 assert.match(actual.styles.baseCss,/a.svg#icon/);assert.match(actual.styles.baseCss,/a.svg#other/);assert.doesNotMatch(actual.styles.baseCss,/assets\/a.svg/);
});
test('取消素材加载不返回半成品主题',async()=>{
 const controller=new AbortController();controller.abort();
 await assert.rejects(localizeThemeResources({styles:{baseCss:'.x{background:url(https://example.com/a.png)}',visualCss:'',customCss:''},assets:[]},'file:///main.css',{signal:controller.signal,load:()=>{throw Error('不应请求')}}),/取消/);
});
