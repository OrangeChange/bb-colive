import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';
import {createServer} from 'vite';
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import postcss from 'postcss';import {scopeThemeCss} from '../src/themes/themeCssScope.ts';
import {generateCustomPalette} from '../src/customPalette.ts';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({configFile:false,server:{middlewareMode:true,watch:null},optimizeDeps:{noDiscovery:true,include:[]},logLevel:'silent'});let browser;
try{
 const {ReviewMenuHighlight}=await server.ssrLoadModule('/tests/fixtures/reviewMenuHighlight.tsx');
 const assets=await readdir('dist/assets'),utilities=postcss.parse(await readFile('dist/assets/'+assets.find(x=>/^register-.*\.css$/.test(x)),'utf8'));
 for(const node of [...utilities.nodes])if(node.type!=='atrule'||node.name!=='layer'||!['theme','base','utilities'].includes(node.params))node.remove();
 const css=utilities.toString()+await readFile('src/archiveEventStyle.css','utf8')+(await readFile('src/App.css','utf8')).replace(/^@import[^;]+;|^@source[^;]+;/gm,'')+scopeThemeCss(await readFile('src/eventStyle.css','utf8'),'.theme-surface');
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:700,height:600}});const gradients=[];
 const paint=mode=>page.locator(`[data-highlight-host="${mode}"] .event-row-slot-content`).evaluate((slot,mode)=>{const row=slot.querySelector('.event');const x=getComputedStyle(mode==='live'?slot:row,'::after');return{image:x.backgroundImage,opacity:x.opacity,width:parseFloat(x.width),rowWidth:row.getBoundingClientRect().width,body:getComputedStyle(row.querySelector('.message')).color};},mode);
 for(const palette of ['sakura','pine','custom'])for(const dark of [false,true])for(const persistent of [false,true]){
 await page.setContent(`<style>${css}</style>${renderToStaticMarkup(React.createElement(ReviewMenuHighlight,{persistent}))}`,{waitUntil:'domcontentloaded'});
 await page.evaluate(({palette,dark,tokens})=>{document.documentElement.dataset.theme=palette;document.documentElement.classList.toggle('dark',dark);for(const[k,v]of Object.entries(tokens))document.documentElement.style.setProperty(k,v);},{palette,dark,tokens:palette==='custom'?generateCustomPalette('#7c3aed',dark?'dark':'light'):{}});
 for(const mode of ['live','review']){await page.locator(`[data-highlight-host="${mode}"] .event`).hover({position:{x:5,y:5}});await page.waitForTimeout(200);const value=await paint(mode);assert.equal(value.opacity,'1',`${mode}悬停高光 ${JSON.stringify(value)}`);assert(value.image.startsWith('linear-gradient('),`${mode}应为渐变：${value.image}`);assert(value.width<value.rowWidth*.5,`${mode}高光只覆盖右侧`);if(mode==='live')gradients.push(value.image);else assert.equal(value.image,gradients.at(-1),'回看与现场使用同一主题渐变');}
 await page.mouse.move(650,550);await page.locator('[data-highlight-host="review"] .event-menu-trigger').focus();await page.waitForTimeout(160);assert.equal((await paint('review')).opacity,'1','键盘聚焦高光');
 await page.locator('[data-highlight-host="review"] .event-menu-trigger').evaluate(e=>{e.blur();e.setAttribute('aria-expanded','true')});await page.waitForTimeout(160);assert.equal((await paint('review')).opacity,'1','展开菜单高光');
 await page.locator('[data-highlight-host="review"] .event-menu-trigger').evaluate(e=>e.setAttribute('aria-expanded','false'));await page.waitForTimeout(160);assert.equal((await paint('review')).opacity,persistent?'1':'0','仅收藏常驻时保留高光');
 }
 assert.equal(new Set(gradients).size,6,'三种配色与浅深高光均响应');console.log('回看与现场高光一致，配色、明暗、聚焦、展开及收藏常驻状态通过');
}finally{await browser?.close();await server.close();}
