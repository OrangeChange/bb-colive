import test from 'node:test';import assert from 'node:assert/strict';
import {routeThemeRemoteUrls} from '../src/themes/themeRemoteCss.ts';
import {themeAssetInsertValue,findThemeAssetUsages} from '../src/themes/themeAssetPresentation.ts';
import {updateLaplaceRemoteTheme,createLaplaceRemoteTheme} from '../src/themes/laplaceThemeSources.ts';
const a={id:'a',name:'sample.woff2',path:'assets/sample.woff2',mediaType:'font/woff2'};
test('字体插入当前别名，图片保留URL',()=>{assert.equal(themeAssetInsertValue(a,'测试字体'),'"测试字体"');assert.equal(themeAssetInsertValue({...a,mediaType:'image/png'}),'url("assets/sample.woff2")')});
test('移除检查包含image-set与SVG片段',()=>{const uses=findThemeAssetUsages({baseCss:'.x{background:image-set("assets/a.svg#one" 1x,url("assets/a.svg#two") 2x)}',visualCss:'',customCss:''},{...a,path:'assets/a.svg'});assert.equal(uses.length,2)});
test('远程更新使用最终响应URL解析相对依赖',async()=>{const d=createLaplaceRemoteTheme({id:'x',url:'https://test/redirect.css',css:'.old{}',metadata:null,fetchedAt:'now'});const r=await updateLaplaceRemoteTheme(d,async()=>({css:'.a{background:url(image.png)}',metadata:null,finalUrl:'https://test/styles/main.css'}));assert.equal(r.document.styles.baseCss,'.a{background:url(image.png)}');assert.equal(r.document.metadata.resourceBaseUrl,'https://test/styles/main.css');const routed=routeThemeRemoteUrls(r.document,'http://127.0.0.1:17920');assert.match(routed.styles.baseCss,/https%3A%2F%2Ftest%2Fstyles%2Fimage\.png/)});
