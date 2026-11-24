import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import postcss from 'postcss';
import {scopeThemeCss} from '../src/themes/themeCssScope.ts';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({configFile:false,server:{middlewareMode:true,watch:null},optimizeDeps:{noDiscovery:true,include:[]},logLevel:'silent'});
let browser;
try{
 const {LotteryMenuAlignment}=await server.ssrLoadModule('/tests/fixtures/lotteryMenuAlignment.tsx');
 const assets=await readdir('dist/assets');const utilities=postcss.parse(await readFile('dist/assets/'+assets.find(x=>/^register-.*\.css$/.test(x)),'utf8'));
 for(const node of [...utilities.nodes])if(node.type!=='atrule'||node.name!=='layer'||!['theme','base','utilities'].includes(node.params))node.remove();
 const css=utilities.toString()+(await readFile('src/App.css','utf8')).replace(/^@import[^;]+;|^@source[^;]+;/gm,'')+scopeThemeCss(await readFile('src/eventStyle.css','utf8'),'.theme-surface');
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:700,height:1000}});
 for(const theme of ['default','card','bubble'])for(const width of [280,480])for(const zoom of [1,1.25]){
 await page.setContent(`<style>${css}</style>${renderToStaticMarkup(React.createElement(LotteryMenuAlignment,{theme,width}))}`,{waitUntil:'domcontentloaded'});await page.evaluate(z=>document.documentElement.style.zoom=String(z),zoom);
 for(const expanded of [false,true]){
 await page.locator('.winner-list').evaluateAll((lists,open)=>lists.forEach(list=>list.open=open),expanded);
 const rows=await page.locator('.event-row-with-menu').evaluateAll(events=>events.map(event=>{const row=event.getBoundingClientRect(),button=event.querySelector('.event-menu-trigger').getBoundingClientRect();return{type:event.className,offset:(button.top+button.height/2)-(row.top+row.height/2),align:getComputedStyle(event.querySelector('.event-row-actions')).alignItems}}));
 assert.equal(rows.length,3);for(const row of rows)assert(Math.abs(row.offset)<1,`${theme} ${width} zoom=${zoom} expanded=${expanded} ${row.type}: 菜单偏移${row.offset}px`);
 }
 }
 console.log('三主题、窄宽度及125%缩放下，天选/红包开奖名单收起和展开均与其他事件共用居中菜单');
}finally{await browser?.close();await server.close();}
