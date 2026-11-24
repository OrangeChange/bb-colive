import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import postcss from 'postcss';
import {scopeThemeCss} from '../src/themes/themeCssScope.ts';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.LAYOUT_ACCEPTANCE_DIR||'design/native-semantic-restoration-20261121/activity';await mkdir(out,{recursive:true});
const server=await createServer({configFile:false,server:{middlewareMode:true,watch:null},optimizeDeps:{noDiscovery:true,include:[]},logLevel:'silent'});
const browser=await chromium.launch({channel:'chrome',headless:true});const results=[];
try {
 const {NativeLayoutFixture}=await server.ssrLoadModule('/tests/fixtures/nativeLayoutRepair.tsx');
 const assets=await readdir('dist/assets');const utilities=postcss.parse(await readFile('dist/assets/'+assets.find(x=>/^register-.*\.css$/.test(x)),'utf8'));
 for(const node of [...utilities.nodes])if(node.type!=='atrule'||node.name!=='layer'||!['theme','base','utilities'].includes(node.params))node.remove();
 const css=utilities.toString()+(await readFile('src/App.css','utf8')).replace(/^@import[^;]+;|^@source[^;]+;/gm,'')+scopeThemeCss(await readFile('src/eventStyle.css','utf8'),'.theme-surface');
 const page=await browser.newPage({viewport:{width:650,height:1100}});
 await page.route('http://fixture.local/**',async route=>{const path=decodeURIComponent(new URL(route.request().url()).pathname);for(const prefix of ['/public','/dist','/src',''])try{return await route.fulfill({body:await readFile('.'+prefix+path)})}catch{}await route.abort();});
 for(const [width,baseSize] of [[480,16],[260,24]])for(const avatar of [true,false])for(const icons of [true,false]){
  const state={theme:'default',width,baseSize,avatar,icons,typographyOnly:true,target:'live'};
  await page.setContent(`<base href="http://fixture.local/"><style>${css}body{margin:0}</style>${renderToStaticMarkup(React.createElement(NativeLayoutFixture,{initialState:state}))}`);
  await page.evaluate(()=>document.fonts.ready);
  const data=await page.locator('.fixture-surface').evaluate(area=>{
   const box=e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,w:b.width,h:b.height,right:b.right,bottom:b.bottom}};
   const pocket=area.querySelector('.redpocket-start'),layout=pocket.querySelector('.event-layout');
   return {columnGap:parseFloat(getComputedStyle(layout).columnGap),header:box(layout.querySelector('.event-header')),user:box(pocket.querySelector('.username')),group:box(pocket.querySelector('.user')),price:box(layout.querySelector('.redpocket > .price')),status:box(layout.querySelector('.activity-status')),action:box(layout.querySelector('.activity-action')),avatar:pocket.querySelector('.avatar-wrap')&&box(pocket.querySelector('.avatar-wrap')),details:[...layout.querySelectorAll('.redpocket > .redpocket-awards,.redpocket > .redpocket-command')].map(box),rows:[...area.querySelectorAll('.lottery-start,.lottery-result,.redpocket-result')].map(e=>{const title=e.querySelector('.activity-title,.result-title'),icon=e.querySelector('.event-media .native-event-icon,.event-layout > .native-event-icon');return{title:box(title),icon:icon&&box(icon),header:box(e.querySelector('.event-header')),content:box(e.querySelector('.event-content')),overflow:e.scrollWidth>e.clientWidth+1}})};
  });
  const overlaps=(a,b)=>Math.min(a.right,b.right)-Math.max(a.x,b.x)>.5&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>.5;
  assert(data.user.w>0&&data.group.w>0,'用户名必须有可用宽度');assert(!overlaps(data.price,data.status),'红包金额与状态互不覆盖');
  assert(data.details.length===2,'奖励和口令完整');assert(data.details.every(d=>d.w>0),'奖励和口令保留可用宽度');
  if(avatar)assert(data.details.every(d=>d.x>=data.avatar.right-.5),'奖励和口令不得进入头像列');
  if(width===480 && avatar){assert.equal(data.columnGap,baseSize*.5);assert(Math.abs(data.header.x-data.avatar.right-data.columnGap)<1,'活动表头采用实际头像尺寸和列间距');}
  if(width===480)assert(Math.min(data.price.bottom,data.action.bottom)>Math.max(data.price.y,data.action.y),'宽幅金额与动作同行');
  for(const row of data.rows){assert(!row.overflow,'活动不能横向溢出');assert.equal(!!row.icon,icons,'事件图标开关');if(icons)assert(Math.min(row.title.bottom,row.icon.bottom)>Math.max(row.title.y,row.icon.y),'图标与标题同排');else assert(Math.abs(row.title.x-row.header.x)<1,'关闭图标不留标题空位');}
  results.push({state,data});await page.screenshot({path:`${out}/default-${width}-${avatar?'avatar':'no-avatar'}-${icons?'icons':'no-icons'}.png`,fullPage:true});
 }
 for(const theme of ['default','card','bubble'])for(const dark of [false,true]){
  const state={theme,dark,width:480,baseSize:16,avatar:true,typographyOnly:true,target:'live'};
  await page.setContent(`<base href="http://fixture.local/"><style>${css}</style>${renderToStaticMarkup(React.createElement(NativeLayoutFixture,{initialState:state}))}`);
  await page.evaluate(()=>document.fonts.ready);
  const colors=await page.locator('.fixture-surface').evaluate(area=>['live-start','live-end','live-warning','live-cutoff'].map(type=>getComputedStyle(area.querySelector('.'+type+' .system-message-icon')).stroke));
  assert.deepEqual(colors,dark?['rgb(183, 218, 208)','rgb(204, 208, 232)','rgb(230, 190, 100)','rgb(239, 148, 163)']:['rgb(20, 67, 61)','rgb(53, 59, 93)','rgb(98, 59, 16)','rgb(116, 36, 49)'],`${theme}系统图标必须保留固定基准语义描边`);
  results.push({state,colors});
 }
 await writeFile(out+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify({cases:results.length,failures:[]}));
} finally {await browser.close();await server.close();}
