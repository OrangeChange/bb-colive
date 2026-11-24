import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import postcss from 'postcss';
import {scopeThemeCss} from '../src/themes/themeCssScope.ts';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.LAYOUT_ACCEPTANCE_DIR||'D:/CodexBuild/danmu-native-layout';await mkdir(out,{recursive:true});
const server=await createServer({configFile:false,server:{middlewareMode:true,watch:null},optimizeDeps:{noDiscovery:true,include:[]},logLevel:'silent'});
const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:700,height:1100}});const results=[],failures=[];
try{
 const {NativeLayoutFixture}=await server.ssrLoadModule('/tests/fixtures/nativeLayoutRepair.tsx');
 const assets=await readdir('dist/assets');const compiled=postcss.parse(await readFile('dist/assets/'+assets.find(f=>/^register-.*\.css$/.test(f)),'utf8'));
 for(const node of [...compiled.nodes])if(node.type!=='atrule'||node.name!=='layer'||!['theme','base','utilities'].includes(node.params))node.remove();
 const source=(await readFile('src/App.css','utf8')).replace(/^@import[^;]+;|^@source[^;]+;/gm,'');
 const foundation=scopeThemeCss(await readFile('src/eventStyle.css','utf8'),'.theme-surface');
 await page.route('http://fixture.local/**',async route=>{const path=decodeURIComponent(new URL(route.request().url()).pathname);for(const prefix of ['','/dist','/public','/src'])try{const data=await readFile('.'+prefix+path);return route.fulfill({body:data,headers:{'access-control-allow-origin':'*'},contentType:/\.woff2$/.test(path)?'font/woff2':/\.png$/.test(path)?'image/png':'image/jpeg'})}catch{}return route.abort()});
 for(const theme of ['default','card','bubble'])for(const target of ['live','window'])for(const dark of [false,true])for(const width of [280,480])for(const avatar of [true,false]){
  const html=renderToStaticMarkup(React.createElement(NativeLayoutFixture,{initialState:{theme,target,dark,width,avatar}}));
  await page.setContent(`<base href="http://fixture.local/"><style>${compiled.toString()}${source}${foundation}body{margin:0}</style>${html}`,{waitUntil:'domcontentloaded'});await page.evaluate(()=>document.fonts.ready);
  const data=await page.locator('.fixture-surface').evaluate(area=>{
   const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}};
   const honor=area.querySelector('.type-guard-honor'),summary=honor.querySelector('.honor-summary'),number=honor.querySelector('.honor-milestone');
   return {area:rect(area),rows:[...area.querySelectorAll('.event')].map(e=>({type:e.classList.contains('type-guard-honor')?'honor':e.classList.contains('type-gift')?'gift':e.className,rect:rect(e),card:e.querySelector('.event-card')&&rect(e.querySelector('.event-card')),color:getComputedStyle(e).color,fill:e.querySelector('.event-card')&&getComputedStyle(e.querySelector('.event-card')).backgroundColor,overflow:e.scrollWidth>e.clientWidth+1})),
    gap:[...area.querySelectorAll('.event-row-slot-content[data-event-spacing]')].map(e=>parseFloat(getComputedStyle(e).paddingBottom)),
    honor:{number:rect(number),heading:rect(honor.querySelector('.honor-heading')),summary:rect(summary),prefix:rect(summary.firstElementChild),display:getComputedStyle(number).display,size:getComputedStyle(number).fontSize,prefixSize:getComputedStyle(summary.firstElementChild).fontSize,opacity:getComputedStyle(honor.querySelector('.honor-icon')).opacity},
    unitWeight:getComputedStyle(area.querySelector('.guard-duration .quantity-unit')).fontWeight,
    paid:[...area.querySelectorAll('.type-gift,.type-guard,.type-superchat')].map(e=>({type:e.className,user:rect(e.querySelector('.user')),price:rect(e.querySelector('.price,.sc-price')),priceRow:getComputedStyle(e.querySelector('.price,.sc-price')).gridRowStart})),
    menu:[...area.querySelectorAll('.event-row-actions')].map(e=>({right:rect(e).right,parent:rect(e.closest('.event')),slot:rect(e.closest('.event-row-slot')),honor:e.closest('.event').classList.contains('type-guard-honor')})),
   };
  });
  const check=(ok,issue)=>{if(!ok)failures.push({theme,target,dark,width,avatar,issue})};
  check(data.rows.every(r=>!r.overflow),'横向溢出');check(data.gap.every(h=>Math.abs(h-8)<.5),'事件间距');check(data.unitWeight==='700','月份字重');
  if(theme!=='card'){check(data.honor.size===data.honor.prefixSize,'成就数字字号');check(data.honor.display==='inline'&&data.honor.number.y>=data.honor.prefix.y,'成就数字跟随正文');check(data.honor.opacity==='1','完整显示勋章');}
  check(data.paid.every(p=>p.price.right<=p.user.x+.5||p.price.x>=p.user.right-.5||p.price.bottom<=p.user.y+.5||p.price.y>=p.user.bottom-.5),'主价格与姓名互不覆盖');
  if(target==='live')check(data.menu.every(m=>Math.abs(m.right-(m.slot.right-(m.honor?72:8)))<=1),'交互区域占满行');
  results.push({theme,target,dark,width,avatar,...data});if(avatar)await page.screenshot({path:`${out}/${theme}-${target}-${dark?'dark':'light'}-${width}.png`,fullPage:true});
 }
 await writeFile(out+'/layout-results.json',JSON.stringify({results,failures},null,2));console.log(JSON.stringify({cases:results.length,failures}));assert.equal(failures.length,0,'布局验收');
}finally{await browser.close();await server.close()}
