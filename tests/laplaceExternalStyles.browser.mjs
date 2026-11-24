import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {createServer} from 'vite';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {build}=require('esbuild');

test('外部字体可以在本地预览加载，红包名单换行且天选维持单行遮罩',async()=>{
 const font=readFileSync('public/laplace/files/chat.laplace.live/assets/barlow-condensed-latin-600-normal-DepVgxBB.woff2');
 const bundle=await build({entryPoints:['src/compat/laplace/renderer/product.tsx'],bundle:true,write:false,format:'iife',platform:'browser',target:'chrome111',define:{'process.env.NODE_ENV':'"production"'}});
 const vite=await createServer({configFile:false,optimizeDeps:{noDiscovery:true},server:{host:'127.0.0.1',port:0,watch:null},logLevel:'error',plugins:[{name:'external-style-test',configureServer(server){server.middlewares.use((request,response,next)=>{
  if(request.url==='/external-font.css'){
   if(request.headers.referer){response.statusCode=204;response.end();return;}
   response.setHeader('Content-Type','text/css');response.end(`@font-face{font-family:ExternalTest;src:url(data:font/woff2;base64,${font.toString('base64')}) format('woff2')} .external-font-probe{font-family:ExternalTest}`);return;
  }
  if(request.url==='/external-font.woff2'){
   if(request.headers.referer){response.statusCode=204;response.end();return;}
   response.setHeader('Content-Type','font/woff2');response.end(font);return;
  }
  if(request.url?.split('?')[0]==='/laplace/product/renderer.js'){response.setHeader('Content-Type','text/javascript');response.end(bundle.outputFiles[0].text);return;}
  next();
 })}}]});
 let browser;
 try{
  await vite.listen();browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const page=await browser.newPage({viewport:{width:400,height:800}});
  await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/laplace/product/index.html?qa=1&generation=1`);
  await page.waitForFunction(()=>window.__laplaceQA);
  await page.addStyleTag({content:'@import url("/external-font.css");'});
  await page.waitForLoadState('networkidle');
  const loaded=await page.evaluate(async()=>{const n=document.createElement('div');n.className='external-font-probe';n.textContent='ABC123';document.body.append(n);const faces=await document.fonts.load('20px ExternalTest','ABC123');n.remove();return faces.length;});
  assert.equal(loaded,1,'本地来源不应导致外部字体 CSS 返回空内容');
  const message={channel:'bb-laplace',version:1,type:'render',generation:1,sequence:1,events:['red-envelope-result','lottery-result'].map((type,i)=>({type,id:String(i),origin:1,originIdx:0,uid:0,timestampNormalized:1700000000000,message:'中奖名单',list:Array.from({length:12},(_,i)=>[i+1,'用户',123])})),stickyEvents:[],settings:{baseFontSize:20,colorScheme:'light'},css:{cloud:'',remote:`@font-face{font-family:DirectFont;src:url("http://127.0.0.1:${vite.httpServer.address().port}/external-font.woff2")} .event{width:180px}`,custom:''},preview:true,scrollable:true,rate:0,animation:{preset:'none',durationMs:0}};
  assert.ok(await page.evaluate(m=>window.__laplaceQA.renderSerialized(JSON.stringify(m)),message));
  assert.equal(await page.evaluate(async()=>{try{return(await document.fonts.load('20px DirectFont','ABC123')).length}catch{return 0}}),1,'行内字体也应正常加载');
  const geometry=await page.evaluate(()=>Object.fromEntries(['red-envelope-result','lottery-result'].map(type=>{const items=[...document.querySelectorAll(`.event--${type} .rewards-item-wrap`)];return[type,new Set(items.map(n=>Math.round(n.getBoundingClientRect().top))).size];})));
  assert.ok(geometry['red-envelope-result']>1,'红包名单应随宽度换行');
  assert.equal(geometry['lottery-result'],1,'天选名单维持官方单行遮罩');
  assert.equal(await page.locator('link[rel="preload"][as="font"]').count(),1);
  assert.ok(await page.evaluate(m=>window.__laplaceQA.renderSerialized(JSON.stringify({...m,sequence:2,css:{cloud:'',remote:'.event{width:180px}',custom:''}})),message));
  assert.equal(await page.locator('link[rel="preload"][as="font"]').count(),0,'移除样式时应同时移除字体引用');
 }finally{await browser?.close();await vite.close();}
});
