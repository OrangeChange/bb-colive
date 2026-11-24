import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import postcss from 'postcss';
import {scopeThemeCss} from '../src/themes/themeCssScope.ts';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.LAYOUT_ACCEPTANCE_DIR||'D:/CodexBuild/native-price-gradient';
await mkdir(out,{recursive:true});
const server=await createServer({configFile:false,server:{middlewareMode:true,watch:null},optimizeDeps:{noDiscovery:true,include:[]},logLevel:'silent'});
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
try{
 const {NativeLayoutFixture}=await server.ssrLoadModule('/tests/fixtures/nativeLayoutRepair.tsx');
 const assets=await readdir('dist/assets'),utilities=postcss.parse(await readFile('dist/assets/'+assets.find(x=>/^register-.*\.css$/.test(x)),'utf8'));
 for(const node of [...utilities.nodes])if(node.type!=='atrule'||node.name!=='layer'||!['theme','base','utilities'].includes(node.params))node.remove();
 const css=utilities.toString()+(await readFile('src/App.css','utf8')).replace(/^@import[^;]+;|^@source[^;]+;/gm,'')+scopeThemeCss(await readFile('src/eventStyle.css','utf8'),'.theme-surface');
 const page=await browser.newPage({viewport:{width:700,height:1100}});
 for(const theme of ['default','card','bubble'])for(const dark of [false,true])for(const width of [280,480])for(const gradient of [false,true]){
  const html=renderToStaticMarkup(React.createElement(NativeLayoutFixture,{initialState:{theme,dark,width,avatar:true,typographyOnly:true,target:'live',baseSize:16,gradient,timestamp:true}}));
  await page.setContent(`<style>${css}body{margin:0}</style>${html}`,{waitUntil:'domcontentloaded'});
  const data=await page.locator('.fixture-surface').evaluate((area,theme)=>{
   const s=n=>getComputedStyle(n),r=n=>n.getBoundingClientRect();
   return{
    active:[...area.querySelectorAll('.price-gradient-active')].map(e=>({cls:e.className,expected:s(e).getPropertyValue('--price-color').trim(),actual:s(e.querySelector('.price:not(.blind-price)')).color,background:s(e.querySelector('.event-card')).backgroundColor,tone:s(e).getPropertyValue('--card-tone').trim(),image:s(e.querySelector('.event-card')).backgroundImage})),
    times:[...area.querySelectorAll('.time:not(.lifecycle-time)')].map(e=>({weight:s(e).fontWeight,font:s(e).fontFamily,left:r(e).x,right:r(e).right,cardRight:theme==='bubble'?r(area).right:r(e.closest('.event')).right})),
    overflow:[...area.querySelectorAll('.event')].filter(e=>e.scrollWidth>e.clientWidth+1&&!(theme==='bubble'&&e.querySelector('.event-layout > .time'))).map(e=>e.className),
    strong:[...area.querySelectorAll('.event-normal .username,.event-normal .price,.event-normal .guard-name,.event-normal .guard-duration')].map(e=>s(e).fontWeight),
    awards:[...area.querySelectorAll('.event:is(.lottery-result,.redpocket-result)')].map(e=>[s(e.querySelector('.result-title')).color,s(e.querySelector('.result-description')).color]),
   };
  },theme);
  assert.equal(data.overflow.length,0,JSON.stringify({theme,dark,width,gradient,overflow:data.overflow}));
  assert(data.times.length>0);assert(data.times.every(t=>t.weight==='500'&&t.font.includes('MiSans')&&t.right<=t.cardRight+1),JSON.stringify({theme,dark,width,gradient,times:data.times}));
  if(gradient){assert(data.active.length>=3);assert(data.active.every(e=>e.actual===e.expected));}else assert.equal(data.active.length,0);
  if(gradient&&theme==='card'){assert(data.active.every(e=>e.tone===e.expected),'卡片标题底色和边界沿用档位色相');assert(data.active.every(e=>e.image.includes('linear-gradient')),'卡片价格梯度保留高光渐变');}
  if(theme==='bubble'){assert(data.strong.every(w=>w==='700'));assert(data.awards.every(([a,b])=>a===b));}
  if(gradient&&theme==='card'){
   const image=await page.locator('.price-gradient-active').first().evaluate(event=>{
    event.style.setProperty('--event-background','linear-gradient(90deg, rgb(18, 52, 86), rgb(100, 120, 140))');
    return getComputedStyle(event.querySelector('.event-card')).backgroundImage;
   });
   assert(image.includes('rgb(18, 52, 86)'),'用户渐变背景覆盖价格表面，不进入颜色混合函数');
  }
  results.push({theme,dark,width,gradient,...data});
 }
 await writeFile(out+'/layout.json',JSON.stringify(results,null,2));console.log(JSON.stringify({cases:results.length,timestamp:true,gradient:true,alignment:true}));
}finally{await browser.close();await server.close()}
