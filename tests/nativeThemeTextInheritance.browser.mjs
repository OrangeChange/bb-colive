import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import postcss from 'postcss';
import {scopeThemeCss} from '../src/themes/themeCssScope.ts';

const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.LAYOUT_ACCEPTANCE_DIR||'D:/CodexBuild/native-text-inheritance';
await mkdir(out,{recursive:true});
const server=await createServer({configFile:false,server:{middlewareMode:true,watch:null},optimizeDeps:{noDiscovery:true,include:[]},logLevel:'silent'});
const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[];
try{
 const {NativeLayoutFixture}=await server.ssrLoadModule('/tests/fixtures/nativeLayoutRepair.tsx');
 const assets=await readdir('dist/assets');
 const utilities=postcss.parse(await readFile('dist/assets/'+assets.find(x=>/^register-.*\.css$/.test(x)),'utf8'));
 for(const node of [...utilities.nodes])if(node.type!=='atrule'||node.name!=='layer'||!['theme','base','utilities'].includes(node.params))node.remove();
 const css=utilities.toString()+(await readFile('src/App.css','utf8')).replace(/^@import[^;]+;|^@source[^;]+;/gm,'')+scopeThemeCss(await readFile('src/eventStyle.css','utf8'),'.theme-surface');
 const page=await browser.newPage({viewport:{width:650,height:1100}});
 for(const theme of ['card','bubble'])for(const dark of [false,true])for(const width of [280,480])for(const avatar of [false,true]){
  const html=renderToStaticMarkup(React.createElement(NativeLayoutFixture,{initialState:{theme,dark,width,avatar,typographyOnly:true,target:'live',baseSize:16}}));
  await page.setContent(`<style>${css}body{margin:0}</style>${html}`,{waitUntil:'domcontentloaded'});
  const failures=await page.locator('.fixture-surface').evaluate((area)=>{
   const errors=[],style=n=>getComputedStyle(n);
   for(const group of area.querySelectorAll('.price,.quantity,.guard-duration')){
    const parts=group.querySelectorAll('.price-unit,.price-value,.quantity-prefix,.quantity-number,.quantity-unit');
    for(const part of parts)if(style(part).fontWeight!==style(group).fontWeight)errors.push('整组字重：'+group.className);
    const old=group.style.fontWeight;group.style.fontWeight='600';
    for(const part of parts)if(style(part).fontWeight!=='600')errors.push('字重继承：'+part.className);
    group.style.fontWeight=old;
   }
   for(const row of area.querySelectorAll('.activity-prize,.lottery-command,.lottery-required-gift,.lottery-requirement,.redpocket-command,.redpocket-awards,.result-description,.system-message')){
    const selector=row.matches('.system-message')?'.system-message-title,.system-message-detail,.lifecycle-time':'.prefix,.text,.gift-name,.lottery-name,.redpocket-name,.quantity,.quantity-number';
    for(const child of row.querySelectorAll(selector))if(style(row).color!==style(child).color)errors.push('整行颜色：'+row.className+' / '+child.className);
   }
   if([...area.querySelectorAll('.event *')].some(n=>style(n).fontWeight==='600'))errors.push('仍有600默认字重');
   const name=area.querySelector('.event[data-event-role="normal"] .user .username'),body=area.querySelector('.type-chat .message');
   if(name&&body&&style(name).color===style(body).color)errors.push('普通用户名未与正文区分');
   return errors;
  });
  assert.deepEqual(failures,[],JSON.stringify({theme,dark,width,avatar}));
  const prices=await page.locator('.type-superchat .price').evaluateAll(ns=>ns.map(n=>getComputedStyle(n).fontWeight));
  assert(prices.every(x=>x===(theme==='bubble'?'500':'700')));
  await page.evaluate(()=>{const s=document.createElement('style');s.textContent='@layer custom{.fixture-surface .event .price{font-size:22px;font-weight:700}.fixture-surface .event .price-unit{font-size:18px;font-weight:500}}';document.head.append(s)});
  const override=await page.locator('.price').first().evaluate(n=>({size:getComputedStyle(n).fontSize,weight:getComputedStyle(n).fontWeight,unit:getComputedStyle(n.querySelector('.price-unit')).fontWeight}));
  assert.deepEqual(override,{size:'22px',weight:'700',unit:'500'});
  results.push({theme,dark,width,avatar});
 }
 await writeFile(out+'/browser.json',JSON.stringify({cases:results},null,2));
 console.log(JSON.stringify({cases:results.length,groupInheritance:true,rowColors:true,customOverrides:true}));
}finally{await browser.close();await server.close()}
