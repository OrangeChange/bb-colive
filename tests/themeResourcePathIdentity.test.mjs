import test from 'node:test';import assert from 'node:assert/strict';
import {localizeThemeResources} from '../src/themes/themeResourceDependencies.ts';
const d=()=>({themeId:'x',styles:{baseCss:'@import "a.css"; @import "b.css";',visualCss:'',customCss:''},assets:[]});
test('不同CSS目录同名资源分别解析，保留物理缓存文件名',async()=>{
 const seen=[];const r=await localizeThemeResources(d(),'https://test/main.css',{load:async(url,css)=>{
 seen.push(url);if(css)return {css:'.x{background:url(assets/logo.png)}',finalUrl:url.endsWith('a.css')?'https://test/a/a.css':'https://test/b/b.css'};
 return {asset:{id:url,cacheResourceId:url.includes('/a/')?'a':'b',name:'logo.png',path:'',mediaType:'image/png'}};
 }});
 assert.equal(r.document.assets.length,2);assert.ok(seen.includes('https://test/a/assets/logo.png'));assert.ok(seen.includes('https://test/b/assets/logo.png'));
 assert.equal(r.document.assets[1].resourceFileName,'logo.png');assert.equal(r.document.assets[1].path,'assets/2-logo.png');
});
test('已保存主题的 ./assets 引用不会重新访问来源',async()=>{
 const source=d();source.styles.baseCss='.x{background:url(./assets/logo.png#x)}';source.assets=[{id:'a',path:'assets/logo.png',name:'logo.png',mediaType:'image/png'}];
 await localizeThemeResources(source,'file:///theme.css',{load:async()=>{throw Error('不应加载')}});
});
