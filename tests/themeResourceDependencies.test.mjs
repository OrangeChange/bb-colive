import test from 'node:test';import assert from 'node:assert/strict';
import {localizeThemeResources} from '../src/themes/themeResourceDependencies.ts';
const document=()=>({themeId:'a',mode:'native',origin:'custom',metadata:{name:'a'},settings:{},styles:{baseCss:'@import "sub/a.css" layer(theme) screen; .a{background:image-set("pic.gif" 1x,url("pic.gif") 2x)}',visualCss:'',customCss:''},assets:[],revision:1});
test('依赖按各自来源解析并保留条件，重复图片只加载一次',async()=>{
 const requests=[];
 const result=await localizeThemeResources(document(),'https://test/main.css',{load:async url=>{requests.push(url);return url.endsWith('a.css')?{css:'@font-face{font-family:x;src:url(../font.woff2)}',finalUrl:'https://test/sub/a.css'}:{asset:{id:url,path:'',name:url.split('/').pop(),mediaType:url.endsWith('.gif')?'image/gif':'font/woff2',cacheResourceId:url.endsWith('.gif')?'gif':'font'}};}});
 assert.equal(requests.filter(x=>x==='https://test/pic.gif').length,1);
 assert.match(result.document.styles.baseCss,/@layer theme/);assert.match(result.document.styles.baseCss,/@media screen/);
 assert.equal(result.document.assets.length,2);assert.ok(result.document.assets.every(x=>x.cacheResourceId));
 assert.doesNotMatch(result.document.styles.baseCss,/https:\/\/test/);
});
test('依赖失败不改变原主题',async()=>{const d=document(),before=structuredClone(d);await assert.rejects(localizeThemeResources(d,'https://test/main.css',{load:async()=>{throw Error('网络失败')}}),/网络失败/);assert.deepEqual(d,before)});

test('普通保存保留远程依赖而不下载所有字体，本地导入仍展开',async()=>{
 const d=document();d.styles.baseCss='@import "https://test/font.css" layer(default);.a{background:url(https://test/a.png)}';
 const result=await localizeThemeResources(d,'file:///theme.css',{load:async()=>{throw Error('保存不应读取网络')}},'preserve');
 assert.equal(result.document.styles.baseCss,d.styles.baseCss);assert.equal(result.document.assets.length,0);
});
test('完整准备解析有来源的逻辑引用并固定缓存版本',async()=>{
 const d=document();d.styles.baseCss='.a{background:url(assets/a.png)}';d.assets=[{id:'a',name:'a',path:'assets/a.png',sourceUrl:'https://test/a.png',mediaType:'image/png'}];
 const result=await localizeThemeResources(d,'file:///theme.css',{load:async url=>{assert.equal(url,'https://test/a.png');return {asset:{id:'fixed',name:'a.png',cacheResourceId:'fixed',mediaType:'image/png',path:''}}}});
 assert.equal(result.document.assets.length,1);assert.equal(result.document.assets[0].cacheResourceId,'fixed');assert.match(result.document.styles.baseCss,/assets\/a.png/);
});

test('已保存的本地素材不重新读取导入前原文件',async()=>{
 const d=document();d.styles.baseCss='.a{background:url(assets/local.svg)}';d.assets=[{id:'local',path:'assets/local.svg',name:'local.svg',mediaType:'image/svg+xml',sourceUrl:'file:///removed/local.svg'}];
 const actual=await localizeThemeResources(d,'file:///removed/theme.css',{load:async()=>{throw Error('原文件已移动')}});
 assert.equal(actual.document.styles.baseCss,d.styles.baseCss);assert.deepEqual(actual.document.assets,d.assets);
});


test('兼容样式应用保留失败网络依赖并固定成功素材，完整导出仍拒绝缺失',async()=>{
 const d=document();d.mode='blivechat';d.styles.baseCss='@import "https://test/missing.css" layer(theme);.a{background:url(https://test/missing.png)}@font-face{font-family:x;src:url(https://test/font.woff2)}';
 const loader={load:async(url)=>{if(url.includes('missing'))throw Error('HTTP 403');return {asset:{id:'fixed',name:'font.woff2',cacheResourceId:'fixed',mediaType:'font/woff2',path:''}}}};
 const actual=await localizeThemeResources(d,'file:///theme.css',loader,'apply');
 assert.match(actual.document.styles.baseCss,/@import "https:\/\/test\/missing.css" layer\(theme\)/);
 assert.match(actual.document.styles.baseCss,/url\(https:\/\/test\/missing.png\)/);
 assert.equal(actual.document.assets[0].cacheResourceId,'fixed');
 await assert.rejects(localizeThemeResources(d,'file:///theme.css',loader),/403/);
});

test('应用跳过网络失败时仍响应取消，不吞掉本地素材错误',async()=>{
 const d=document();d.styles.baseCss='.a{background:url(https://test/a.png)}';const controller=new AbortController();
 await assert.rejects(localizeThemeResources(d,'file:///theme.css',{signal:controller.signal,load:async()=>{controller.abort();throw Error('网络失败')}},'apply'),/取消/);
 d.styles.baseCss='.a{background:url(missing.png)}';
 await assert.rejects(localizeThemeResources(d,'file:///theme.css',{load:async()=>{throw Error('本地文件缺失')}},'apply'),/本地文件缺失/);
});

test('原生应用不挂载尚未展开的失败CSS导入',async()=>{
 const d=document();d.styles.baseCss='@import "https://test/missing.css";';
 await assert.rejects(localizeThemeResources(d,'file:///theme.css',{load:async()=>{throw Error('HTTP 403')}},'apply'),/HTTP 403/);
});
test('原生data CSS导入展开并保留层和媒体条件',async()=>{
 const d=document();d.styles.baseCss='@import "data:text/css,.username%7Bcolor%3Ared%7D" layer(custom) screen;';
 const actual=await localizeThemeResources(d,'file:///theme.css',{load:async()=>{throw Error('不应读取外部资源')}},'apply');
 assert.doesNotMatch(actual.document.styles.baseCss,/@import/);
 assert.match(actual.document.styles.baseCss,/@layer custom/);
 assert.match(actual.document.styles.baseCss,/@media screen/);
 assert.match(actual.document.styles.baseCss,/\.username\s*\{/);
});

test('完整收集并发加载独立素材，重复地址仍只读取一次且保留CSS顺序',async()=>{
 const d=document();d.styles.baseCss=Array.from({length:9},(_,i)=>`.item${i}{background:url(https://test/${i%8}.png)}`).join('');
 let active=0,peak=0;const calls=[];
 const result=await localizeThemeResources(d,'file:///theme.css',{load:async url=>{calls.push(url);active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,15));active--;return {asset:{id:url,name:url.split('/').pop(),path:'',mediaType:'image/png',cacheResourceId:url}};}});
 assert.equal(peak,4);assert.equal(calls.length,8);assert.equal(result.document.assets.length,8);
 assert.deepEqual([...result.document.styles.baseCss.matchAll(/\.item(\d)/g)].map(x=>Number(x[1])),[0,1,2,3,4,5,6,7,8]);
});

test('独立CSS导入可以并发，完成顺序不改变层叠顺序',async()=>{
 const d=document();d.styles.baseCss='@import "https://test/first.css";@import "https://test/second.css";';let active=0,peak=0;
 const r=await localizeThemeResources(d,'file:///theme.css',{load:async url=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,url.includes('first')?25:5));active--;return {css:`.event{color:${url.includes('first')?'red':'blue'}}`,finalUrl:url};}});
 assert.equal(peak,2);assert.ok(r.document.styles.baseCss.indexOf('red')<r.document.styles.baseCss.indexOf('blue'));
});

test('并发收集失败后不启动后续资源，返回前结束已启动任务',async()=>{
 const d=document();d.styles.baseCss=Array.from({length:10},(_,i)=>`.item${i}{background:url(https://test/${i}.png)}`).join('');let active=0,calls=0;
 await assert.rejects(localizeThemeResources(d,'file:///theme.css',{load:async url=>{calls++;active++;await new Promise(resolve=>setTimeout(resolve,url.endsWith('/0.png')?1:20));active--;if(url.endsWith('/0.png'))throw Error('素材缺失');return {asset:{id:url,name:url.split('/').pop(),path:'',mediaType:'image/png',cacheResourceId:url}};}}),/素材缺失/);
 assert.equal(active,0);assert.equal(calls,4);
});
