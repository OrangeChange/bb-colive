import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
const require=createRequire(import.meta.url);
const {build}=require('esbuild');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');

for (const native of [true,false]) test(`预览滚动结束后保留位置和锚点（${native?'scrollend':'旧版内核'}）`,async()=>{
  const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {usePreviewCanvas} from './src/preview/usePreviewCanvas.ts';function Probe(){const canvas=usePreviewCanvas(400,'light');window.canvasState=canvas.scroll;return React.createElement('div',{ref:canvas.ref},React.createElement('div',{className:'native-preview-message-scroll',style:{height:100,overflow:'auto'}},React.createElement('div',{'data-event-id':'first',className:'event-row-slot',style:{height:500}},'正文')))}createRoot(document.getElementById('root')).render(React.createElement(Probe));`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"production"','__DANMU_BUILD_ID__':'"test"'}});
  const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/probe.js'?'text/javascript':'text/html');res.end(req.url==='/probe.js'?bundle.outputFiles[0].text:'<div id="root"></div><script src="/probe.js"></script>');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:[`--explicitly-allowed-ports=${server.address().port}`]});
  try{
    const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(()=>window.canvasState);
    await page.evaluate(native=>{const node=document.querySelector('.native-preview-message-scroll');if(!native)for(let p=node;p;p=Object.getPrototypeOf(p))if(Object.hasOwn(p,'onscrollend'))delete p.onscrollend;Object.defineProperty(node,'scrollTop',{value:120});node.dispatchEvent(new Event('scroll',{bubbles:true}));},native);
    await page.waitForTimeout(40);
    assert.equal(await page.evaluate(()=>window.canvasState.top),0);
    if(native)await page.evaluate(()=>document.querySelector('.native-preview-message-scroll').dispatchEvent(new Event('scrollend',{bubbles:true})));
    await page.waitForFunction(()=>window.canvasState.top===120);
    assert.equal(await page.evaluate(()=>window.canvasState.anchorId),'first');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
