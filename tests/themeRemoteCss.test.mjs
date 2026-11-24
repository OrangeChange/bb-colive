import test from 'node:test';
import assert from 'node:assert/strict';
import {applyThemeAssetUrls} from '../src/themes/themeAssets.ts';
import {rebaseThemeResourceOrigin} from '../src/themes/themeResourceOrigin.ts';
test('缓存替换保留导入条件与字体字符范围',()=>{
 const document={settings:{},styles:{baseCss:'@import "font.css" layer(default) supports(display:grid) screen; @font-face{src:url(font.woff2);unicode-range:U+4E00-4EFF}',visualCss:'',customCss:''},assets:[]};
 const actual=applyThemeAssetUrls(document,new Map([['font.css','http://127.0.0.1:17920/theme-remote?url=x&css=1'],['font.woff2','http://127.0.0.1:17920/theme-remote?url=y']]));
 assert.match(actual.styles.baseCss,/@import "http:\/\/127\.0\.0\.1:17920\/theme-remote\?url=x&css=1" layer\(default\) supports\(display:grid\) screen/);
 assert.match(actual.styles.baseCss,/unicode-range:U\+4E00-4EFF/);
});
test('来源支持的容错CSS不会阻止依赖地址替换',()=>{
 const document={settings:{},styles:{baseCss:'.a{\n// background-color: var(--bg);\nbackground:url(a.png)}',visualCss:'',customCss:''},assets:[]};
 assert.match(applyThemeAssetUrls(document,new Map([['a.png','data:image/png;base64,AA==']])).styles.baseCss,/data:image/);
});
test('更换端口重新定位缓存入口但保留网络来源参数',()=>{
 const css='@import "http://127.0.0.1:17920/theme-remote?url=https%3A%2F%2Fx.test%2Fa.css&css=1";';
 assert.equal(rebaseThemeResourceOrigin({css},'http://127.0.0.1:17921').css,css.replace(':17920/',':17921/'));
});

test('本地导入素材继续通过主题目录读取，不发送到网络缓存入口',async()=>{
 globalThis.location=new URL('http://127.0.0.1:17926');
 const {resolveCatalogRuntimeAssets}=await import('../src/themes/builtinThemeCatalog.ts');
 const document={themeId:'copy',revision:1,assets:[{id:'local',name:'local.svg',path:'assets/local.svg',mediaType:'image/svg+xml',sourceUrl:'file:///removed/local.svg'}]};
 const urls=await resolveCatalogRuntimeAssets(document,{},async()=>{throw Error('预览不应预读')});
 assert.equal(urls.get('assets/local.svg'),'http://127.0.0.1:17926/theme-assets/copy/local.svg?revision=1');
});


test('SHED原分发入口使用作者同版本发布文件，其他地址不变',async()=>{
 const {resolveThemeResourceSource}=await import('../src/themes/themeRemoteCss.ts');
 const file='51895d7c51f026370c7791d09cfbc384.woff2';
 assert.equal(resolveThemeResourceSource('https://npm.elemecdn.com/shed-fonts/HarmonyOS%20Sans/Medium/'+file),'https://unpkg.com/shed-fonts@1.0.4/HarmonyOS%20Sans/Medium/'+file);
 assert.equal(resolveThemeResourceSource('https://npm.elemecdn.com/shed-fonts/HarmonyOS%20Sans/result.css'),'https://unpkg.com/shed-fonts@1.0.4/HarmonyOS%20Sans/result.css');
 assert.equal(resolveThemeResourceSource('https://example.test/'+file),'https://example.test/'+file);
});
