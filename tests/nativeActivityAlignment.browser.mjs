import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import postcss from 'postcss';
import {scopeThemeCss} from '../src/themes/themeCssScope.ts';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.LAYOUT_ACCEPTANCE_DIR||'D:/CodexBuild/native-activity-alignment';
await mkdir(out,{recursive:true});
const server=await createServer({configFile:false,server:{middlewareMode:true,watch:null},optimizeDeps:{noDiscovery:true,include:[]},logLevel:'silent'});
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[],iconColors=new Map();
try{
 const {NativeLayoutFixture}=await server.ssrLoadModule('/tests/fixtures/nativeLayoutRepair.tsx');
 const assets=await readdir('dist/assets'),utilities=postcss.parse(await readFile('dist/assets/'+assets.find(x=>/^register-.*\.css$/.test(x)),'utf8'));
 for(const node of [...utilities.nodes])if(node.type!=='atrule'||node.name!=='layer'||!['theme','base','utilities'].includes(node.params))node.remove();
 const css=utilities.toString()+(await readFile('src/App.css','utf8')).replace(/^@import[^;]+;|^@source[^;]+;/gm,'')+scopeThemeCss(await readFile('src/eventStyle.css','utf8'),'.theme-surface');
 const page=await browser.newPage({viewport:{width:700,height:1100}});
 for(const theme of ['default','card','bubble'])for(const dark of [false,true])for(const width of [280,480])for(const avatar of [true,false]){
  const html=renderToStaticMarkup(React.createElement(NativeLayoutFixture,{initialState:{theme,dark,width,avatar,typographyOnly:true,target:'live',baseSize:16}}));
  await page.setContent(`<style>${css}body{margin:0}</style>${html}`,{waitUntil:'domcontentloaded'});
  const data=await page.locator('.fixture-surface').evaluate((area,theme)=>{
   const s=n=>getComputedStyle(n),box=n=>n.getBoundingClientRect(),errors=[];
   for(const card of area.querySelectorAll('.event-activity-card')){
    const h=card.querySelector('.event-header'),c=card.querySelector('.event-content');
    const layout=card.querySelector('.event-layout'),a=layout.querySelector(':scope > .avatar-wrap');
    const fullWidth=theme!=='default' && area.clientWidth<=20*parseFloat(s(area).fontSize);
    if(Math.abs(box(c).x-box(fullWidth?layout:h).x)>1)errors.push('活动正文起点错误');
    if(a&&s(card).getPropertyValue('--card-size').trim()===''){
     const firstLine=Math.max(parseFloat(s(h).lineHeight),box(a).height);
     if(Math.abs(box(a).y+box(a).height/2-box(h).y-firstLine/2)>1)errors.push('头像未对齐首行');
    }
    if(card.scrollWidth>card.clientWidth+1)errors.push('活动横向溢出');
   }
   const titles=[...area.querySelectorAll('.event:is(.lottery-result,.redpocket-result)')].map(e=>{const t=e.querySelector('.result-title'),b=e.querySelector('.result-description');return{title:[s(t).fontSize,s(t).fontWeight,s(t).color],body:[s(b).fontSize,s(b).fontWeight,s(b).color]}});
   const lotto=area.querySelector('.lottery-start'),title=lotto.querySelector('.activity-title'),prize=lotto.querySelector('.lottery-name');
   const lifecycle=[...area.querySelectorAll('.event:is(.live-start,.live-end) .system-message-title,.event:is(.live-start,.live-end) .lifecycle-time')].map(n=>s(n).fontWeight);
   const icons=[...area.querySelectorAll('.system-message-icon')].map(n=>({type:n.closest('.event').className.match(/(?:system-room-change|live-start|live-end|live-warning|live-cutoff)/)?.[0],color:s(n).color}));
   const spacing=[...area.querySelectorAll('.lottery-command,.lottery-required-gift,.lottery-requirement,.redpocket-command')].map(n=>({display:s(n).display,line:parseFloat(s(n).lineHeight),font:parseFloat(s(n).fontSize),height:box(n).height,margin:s(n).marginTop}));
   const resultSpacing=[...area.querySelectorAll('.event:is(.lottery-result,.redpocket-result) .event-content')].map(n=>s(n).marginTop);
   const lifecycleColors=[...area.querySelectorAll('.event:is(.live-start,.live-end) .system-message')].map(n=>[n,...n.querySelectorAll('.system-message-icon,.system-message-title,.lifecycle-time')].map(x=>s(x).color));
   const blindFonts=[...area.querySelectorAll('.gift-source:has(.blind-profit)')].map(n=>[s(n.querySelector('.blind-gift-name')).fontSize,s(n.querySelector('.blind-profit')).fontSize]);
   const resultColumns=[...area.querySelectorAll('.event:is(.lottery-result,.redpocket-result) .event-content')].map(n=>s(n).gridColumnStart);
   const companionLines=[...area.querySelectorAll('.guard-companion-days')].map(n=>({line:parseFloat(s(n).lineHeight),font:parseFloat(s(n).fontSize),height:box(n).height}));
   return{errors,titles,resultSpacing,lifecycleColors,blindFonts,resultColumns,companionLines,lottery:{title:[s(title).fontWeight,s(title).color],prize:[s(prize).fontWeight,s(prize).color]},lifecycle,icons,spacing};
  },theme);
  assert.deepEqual(data.errors,[],JSON.stringify({theme,dark,width,avatar}));
  assert(data.lifecycleColors.every(colors=>new Set(colors).size===1),'直播文字、时间与图标同色');
  assert(data.blindFonts.every(([name,profit])=>name===profit),'盲盒盈亏继承盲盒信息字号');
  if(theme==='default')assert(data.resultColumns.every(column=>column==='1'),'默认开奖内容从左列开始');
  if(theme==='bubble')assert(data.companionLines.every(n=>n.height>=20 && n.line===n.font*1.25),'大航海补充行使用正文行高');
  if(theme==='card'){assert.deepEqual(data.lottery.title,data.lottery.prize);for(const t of data.titles)assert.deepEqual(t.title,t.body);}
  if(theme!=='default')assert(data.lifecycle.every(x=>x==='700'));
  if(theme==='bubble'){assert(data.spacing.every(x=>x.display==='block'&&x.height>=20&&x.line===x.font*1.25&&x.margin==='4px'));assert(data.resultSpacing.every(x=>x==='4px'));}
  const key=JSON.stringify({dark,width,avatar});if(theme==='default')iconColors.set(key,data.icons);else assert.deepEqual(data.icons,iconColors.get(key),'系统图标与默认一致');
  results.push({theme,dark,width,avatar,...data});
 }
 const recalls=[];
 for(const theme of ['default','card','bubble']){
  const html=renderToStaticMarkup(React.createElement(NativeLayoutFixture,{initialState:{theme,dark:false,width:480,avatar:true,deletedOnly:true,target:'live',baseSize:16}}));
  await page.setContent(`<style>${css}</style>${html}`,{waitUntil:'domcontentloaded'});
  const data=await page.locator('.fixture-surface').evaluate(area=>{
   const found=new Set(),errors=[];
   for(let width=160;width<=480;width+=8){area.style.width=width+'px';for(const e of area.querySelectorAll('.event')){
    const label=e.querySelector('.status.deleted'),message=e.querySelector('.event-content .message');
    if(!label||!message)continue;const walker=document.createTreeWalker(message,NodeFilter.SHOW_TEXT);let last,current;while(current=walker.nextNode())last=current;if(!last)continue;
    const r=document.createRange();r.setStart(last,Math.max(0,last.length-1));r.setEnd(last,last.length);const a=r.getBoundingClientRect(),b=label.getBoundingClientRect();
    if(b.y>a.y+parseFloat(getComputedStyle(message).fontSize)*.75){const content=e.querySelector('.event-content'),block=getComputedStyle(content).display==='block'?content:e.querySelector('.event-body');const left=block.getBoundingClientRect().x+parseFloat(getComputedStyle(block).paddingLeft);found.add(e.matches('.type-chat')?'chat':'sc');if(Math.abs(b.x-left)>1)errors.push({width,left,x:b.x});}
   }}
   return{wrapped:[...found],errors};
  });
  assert.deepEqual(data.errors,[],'撤回标记换行无行首空隙');assert.equal(data.wrapped.length,2,JSON.stringify({theme,...data}));recalls.push({theme,...data});
 }
 await writeFile(out+'/browser.json',JSON.stringify({results,recalls},null,2));console.log(JSON.stringify({cases:results.length,recalls}));
}finally{await browser.close();await server.close()}
