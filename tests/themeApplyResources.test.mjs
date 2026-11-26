import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {localizeThemeResources} from '../src/themes/themeResourceDependencies.ts';
import {routeThemeRemoteUrls} from '../src/themes/themeRemoteCss.ts';

test('应用入口保留远程依赖，完整导出独立收集',()=>{
 const source=readFileSync('src/components/ThemeWorkspace.tsx','utf8');
 const apply=source.slice(source.indexOf('const resolveThemeAssets ='),source.indexOf('const resolveSavedThemeForObsPreview'));
 assert.match(apply,/themeDependencyLoader\(false,preparation.signal,preparation.onProgress\),"preserve"/);
 const complete=source.slice(source.indexOf('const completeThemePackage='),source.indexOf('const completeThemePackage=')+650);
 assert.match(complete,/localizeThemeResources/);
 assert.doesNotMatch(complete,/,"preserve"/);
});

test('四类样式应用不预下载字体与图片，远程请求交给缓存入口',async()=>{
 for(const mode of ['native','blivechat','blivechat-open','laplace']){
  const document={themeId:'probe',mode,origin:'custom',metadata:{name:'probe',resourceBaseUrl:'https://example.test/main.css'},settings:{},styles:{baseCss:'@import "font.css"; .event{background:url(picture.png)}',visualCss:'',customCss:''},assets:[],revision:1};
  const prepared=await localizeThemeResources(document,document.metadata.resourceBaseUrl,{load:async()=>{assert.fail('应用不能等待网络素材')}},'preserve');
  const routed=routeThemeRemoteUrls(prepared.document,'http://127.0.0.1:17920');
  assert.match(routed.styles.baseCss,/theme-remote\?url=https%3A%2F%2Fexample.test%2Ffont.css&css=1/);
  assert.match(routed.styles.baseCss,/theme-remote\?url=https%3A%2F%2Fexample.test%2Fpicture.png/);
  await assert.rejects(localizeThemeResources(document,document.metadata.resourceBaseUrl,{load:async()=>{throw Error('素材无法下载')}}),/素材无法下载/);
 }
});
