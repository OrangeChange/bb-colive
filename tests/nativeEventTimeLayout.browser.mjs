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
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const {NativeLayoutFixture}=await server.ssrLoadModule('/tests/fixtures/nativeLayoutRepair.tsx');
 const assets=await readdir('dist/assets'),utilities=postcss.parse(await readFile('dist/assets/'+assets.find(x=>/^register-.*\.css$/.test(x)),'utf8'));
 for(const n of [...utilities.nodes])if(n.type!=='atrule'||n.name!=='layer'||!['theme','base','utilities'].includes(n.params))n.remove();
 const css=utilities.toString()+(await readFile('src/App.css','utf8')).replace(/^@import[^;]+;|^@source[^;]+;/gm,'')+scopeThemeCss(await readFile('src/eventStyle.css','utf8'),'.theme-surface');
 const page=await browser.newPage({viewport:{width:700,height:1100}});
 for(const theme of ['default','card','bubble'])for(const width of [280,480]){
  const measurements=[];
  for(const clickable of [false,true]){
   const html=renderToStaticMarkup(React.createElement(NativeLayoutFixture,{initialState:{theme,width,avatar:true,typographyOnly:true,target:'live',baseSize:16,timestamp:true,clickable}}));
   await page.setContent(`<style>${css}body{margin:0}</style>${html}`,{waitUntil:'domcontentloaded'});
   const data=await page.locator('.fixture-surface').evaluate(area=>{
    const r=e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,right:b.right,bottom:b.bottom}};
    const gift=area.querySelector('.event-normal.gift-normal'),image=gift.querySelector('.gift-icon'),name=gift.querySelector('.gift-name');
    return{honorTime:area.querySelectorAll('.type-guard-honor .time').length,interactionUser:getComputedStyle(area.querySelector('.type-interaction .event-header .user')).display,times:[...area.querySelectorAll('.time:not(.lifecycle-time)')].map(t=>({parent:t.parentElement.className,position:{right:getComputedStyle(t).right,bottom:getComputedStyle(t).bottom,margin:getComputedStyle(t).margin,offset:t.offsetParent?.className,offsetRect:t.offsetParent?r(t.offsetParent):null},display:getComputedStyle(t).display,rect:r(t),type:t.closest('.event').className,surface:r(t.closest('.event.type-chat')&&getComputedStyle(t).getPropertyValue('--bubble-size')?t.closest('.event'):t.closest('.event').querySelector('.event-card')??t.closest('.event')),visible:[...t.childNodes].filter(n=>n.nodeType===3||getComputedStyle(n).display!=='none').map(n=>n.textContent).join('')})),gift:{image:r(image),name:r(name),row:r(gift),trigger:!!gift.querySelector('.event-gift-effect-trigger')},overflow:area.scrollWidth>area.clientWidth+1};
   });
   assert.equal(data.honorTime,0,'成就不显示时间');
   assert(data.times.every(t=>t.parent.split(' ').includes('event-layout')),'时间必须与标题、正文同处event-layout');
   if(theme==='default')assert(data.times.filter(t=>/type-chat|type-interaction/.test(t.type)).every(t=>t.display==='inline'),'默认弹幕与互动时间行内接续');
   if(theme==='bubble'){assert(data.times.every(t=>/^\d{2}:\d{2}$/.test(t.visible)),'气泡只显示时分');assert(data.times.filter(t=>!t.type.includes('type-interaction')).every(t=>Math.abs(t.rect.x-t.surface.right-2)<=1&&Math.abs(t.rect.bottom-t.surface.bottom)<=1),JSON.stringify(data.times.filter(t=>!(t.rect.x>=t.surface.right&&Math.abs(t.rect.bottom-t.surface.bottom)<=1)).map(t=>({type:t.type,rect:t.rect,surface:t.surface,position:t.position}))));}
   await page.screenshot({path:`D:/CodexBuild/native-price-ui-revision/time-${theme}-${width}-${clickable}.png`,fullPage:true});
   if(theme==='bubble')assert(data.times.filter(t=>t.type.includes('type-interaction')).every(t=>t.display==='inline'),'气泡互动时间行内');
   if(theme==='card')assert.equal(data.interactionUser,'inline','卡片互动用户名与正文同行');
   assert(!data.overflow,`${theme} ${width}不横向溢出`);measurements.push(data.gift);
  }
  for(const part of ['image','name','row'])for(const key of ['x','y','w','h'])assert(Math.abs(measurements[0][part][key]-measurements[1][part][key])<1,`${theme} ${width} 点击入口不改变${part}.${key}`);
 }
 console.log('三主题时间结构、行内时间、时分显示及礼物交互前后布局一致');
}finally{await browser.close();await server.close()}
