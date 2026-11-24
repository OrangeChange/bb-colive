import test from'node:test';import assert from'node:assert/strict';import{applyThemeAssetUrls}from'../src/themes/themeAssets.ts';import{localizeThemeResources}from'../src/themes/themeResourceDependencies.ts';
test('保留内嵌SVG及未替换URL的原引用语义',async()=>{
 const css=`.a{background:url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"></svg>')}`;
 const d={settings:{},styles:{baseCss:css,visualCss:'',customCss:''},assets:[]};
 assert.equal(applyThemeAssetUrls(d,new Map()).styles.baseCss,css);
 const r=await localizeThemeResources(d,'file:///main.css',{load:async()=>{throw Error('不应加载')}});assert.equal(r.document.styles.baseCss,css);
});
