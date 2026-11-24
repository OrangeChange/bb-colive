import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import postcss from 'postcss';
import {scopeThemeCss} from '../src/themes/themeCssScope.ts';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.LAYOUT_ACCEPTANCE_DIR||'D:/CodexBuild/danmu-banner-emote';await mkdir(out,{recursive:true});
const server=await createServer({configFile:false,server:{middlewareMode:true,watch:null},optimizeDeps:{noDiscovery:true,include:[]},logLevel:'silent'});
const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:700,height:1100}});const results=[],failures=[];
try{
 const {NativeLayoutFixture}=await server.ssrLoadModule('/tests/fixtures/nativeLayoutRepair.tsx');
 const assets=await readdir('dist/assets');const compiled=postcss.parse(await readFile('dist/assets/'+assets.find(f=>/^register-.*\.css$/.test(f)),'utf8'));
 for(const node of [...compiled.nodes])if(node.type!=='atrule'||node.name!=='layer'||!['theme','base','utilities'].includes(node.params))node.remove();
 const source=(await readFile('src/App.css','utf8')).replace(/^@import[^;]+;|^@source[^;]+;/gm,'');
 const foundation=scopeThemeCss(await readFile('src/eventStyle.css','utf8'),'.theme-surface');
 await page.route('http://fixture.local/**',async route=>{const path=decodeURIComponent(new URL(route.request().url()).pathname);for(const prefix of ['','/dist','/public','/src'])try{const data=await readFile('.'+prefix+path);return route.fulfill({body:data,headers:{'access-control-allow-origin':'*'},contentType:/\.woff2$/.test(path)?'font/woff2':/\.png$/.test(path)?'image/png':'image/jpeg'})}catch{}return route.abort()});
 const banner=await readFile('tests/fixtures/media/native-banner-call.png');
 await page.route('http://i0.hdslb.com/bfs/live/fa1eb4dce3ad198bb8650499830560886ce1116c.png',route=>route.fulfill({body:banner,contentType:'image/png'}));
 for(const theme of ['default','card','bubble'])for(const width of [180,280,480])for(const avatar of [true,false]){
  const html=renderToStaticMarkup(React.createElement(NativeLayoutFixture,{initialState:{theme,target:'live',dark:false,width,avatar,emotesOnly:true}}));
  await page.setContent(`<base href="http://fixture.local/"><style>${compiled.toString()}${source}${foundation}body{margin:0}</style>${html}`,{waitUntil:'domcontentloaded'});await page.evaluate(()=>document.fonts.ready);
  await page.locator('.banner-emote').evaluateAll(es=>Promise.all(es.map(e=>e.complete?null:new Promise(r=>{e.onload=r;e.onerror=r}))));
  const data=await page.locator('.type-chat:has(.banner-emote)').evaluateAll(es=>es.map(e=>{const img=e.querySelector('.banner-emote'),r=img.getBoundingClientRect(),m=e.querySelector('.message').getBoundingClientRect(),u=e.querySelector('.user').getBoundingClientRect(),h=e.querySelector('.event-header').getBoundingClientRect();return{width:r.width,height:r.height,ratio:r.width/r.height,natural:[img.naturalWidth,img.naturalHeight],x:r.x,messageX:m.x,y:r.y,userY:u.y,userBottom:u.bottom,headerBottom:h.bottom,overflow:e.scrollWidth>e.clientWidth+1}}));
  const check=(ok,issue)=>{if(!ok)failures.push({theme,width,avatar,issue,data})};
  check(data.every(e=>e.natural[0]===195),'真实素材加载');check(data.every(e=>Math.abs(e.ratio-3.25)<.02),'图片元素保持原比例');check(data.every(e=>e.width<=65.1&&e.height<=20.1),'图片不保留240px空框');check(data.every(e=>!e.overflow),'窄幅不溢出');check(data.every(e=>Math.abs(e.x-e.messageX)<1),'图片从正文起点显示');
  if(theme==='card')check(data.every(e=>e.y>=e.headerBottom),'卡片正文保持独立下一行');else check(data.every(e=>Math.abs(e.y-e.userY)<1||e.y>=e.userBottom),'用户名首行不被表情拉高');
  results.push({theme,width,avatar,data});await page.screenshot({path:`${out}/${theme}-${width}-${avatar?'avatar':'no-avatar'}.png`,fullPage:true});
 }
 await writeFile(out+'/layout-results.json',JSON.stringify({results,failures},null,2));console.log(JSON.stringify({cases:results.length,failures}));assert.equal(failures.length,0,'布局验收');
}finally{await browser.close();await server.close()}
