import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import postcss from 'postcss';
import {scopeThemeCss} from '../src/themes/themeCssScope.ts';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const out='design/native-semantic-restoration-20261121/honor';await mkdir(out,{recursive:true});
const server=await createServer({configFile:false,server:{middlewareMode:true,watch:null},optimizeDeps:{noDiscovery:true,include:[]},logLevel:'silent'});
const browser=await chromium.launch({channel:'chrome',headless:true});const results=[];
try {
 const {NativeLayoutFixture}=await server.ssrLoadModule('/tests/fixtures/nativeLayoutRepair.tsx');
 const assets=await readdir('dist/assets');const utilities=postcss.parse(await readFile('dist/assets/'+assets.find(x=>/^register-.*\.css$/.test(x)),'utf8'));
 for(const node of [...utilities.nodes])if(node.type!=='atrule'||node.name!=='layer'||!['theme','base','utilities'].includes(node.params))node.remove();
 const css=utilities.toString()+(await readFile('src/App.css','utf8')).replace(/^@import[^;]+;|^@source[^;]+;/gm,'')+scopeThemeCss(await readFile('src/eventStyle.css','utf8'),'.theme-surface');
 const page=await browser.newPage({viewport:{width:650,height:1100}});
 await page.route('http://fixture.local/**',async route=>{const path=decodeURIComponent(new URL(route.request().url()).pathname);for(const prefix of ['/public','/dist','/src',''])try{return await route.fulfill({body:await readFile('.'+prefix+path)})}catch{}await route.abort();});
 const {createBuiltinNativeTheme}=await server.ssrLoadModule('/src/themes/nativeBuiltinThemes.ts');
 const {renderManagedNativeCss}=await server.ssrLoadModule('/src/themes/nativeManagedCss.ts');
 const {assignNativeCssLayer}=await server.ssrLoadModule('/src/themes/nativeThemeCascade.ts');
 for(const [width,baseSize] of [[480,16],[260,24]])for(const avatar of [true,false])for(const icons of [true,false]){
  const state={theme:'default',width,baseSize,avatar,icons,typographyOnly:true,target:'live'};
  await page.setContent(`<base href="http://fixture.local/"><style>${css}body{margin:0}</style>${renderToStaticMarkup(React.createElement(NativeLayoutFixture,{initialState:state}))}`);
  await page.evaluate(()=>document.fonts.ready);
  const data=await page.locator('.type-guard-honor').evaluate(event=>{
   const box=e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,w:b.width,h:b.height,right:b.right,bottom:b.bottom}};
   const icon=event.querySelector('.honor-icon'),content=event.querySelector('.content'),layout=event.querySelector('.event-layout');
   const text=[];const walk=document.createTreeWalker(content,NodeFilter.SHOW_TEXT);const range=document.createRange();let node;
   while(node=walk.nextNode()){if(!node.textContent.trim())continue;range.selectNodeContents(node);for(const r of range.getClientRects())text.push({x:r.x,y:r.y,right:r.right,bottom:r.bottom});}
   return{icon:icon&&box(icon),content:box(content),layout:box(layout),position:getComputedStyle(layout).position,text};
  });
  assert.equal(data.position,'relative','成就网格必须提供定位包含块');assert.equal(!!data.icon,icons,'官方勋章开关');
  if(icons){assert(data.icon.x>=data.content.right-.5 || (width===260 && data.icon.bottom<=data.content.y+.5),'勋章位于独立的列或窄幅媒体行');assert(data.icon.right<=data.layout.right+.5,'勋章不得超出布局');assert(data.text.every(t=>Math.min(t.right,data.icon.right)-Math.max(t.x,data.icon.x)<=.5||Math.min(t.bottom,data.icon.bottom)-Math.max(t.y,data.icon.y)<=.5),'勋章不得覆盖真实文字');}
  results.push({state,data});await page.locator('.type-guard-honor').screenshot({path:`${out}/honor-${width}-${avatar?'avatar':'no-avatar'}-${icons?'icons':'no-icons'}.png`});
 }
 for(const theme of ['default','card','bubble'])for(const part of ['row','event']){
  const state={theme,width:480,baseSize:16,avatar:true,typographyOnly:true,target:'live'};
  await page.setContent(`<base href="http://fixture.local/"><style>${css}</style>${renderToStaticMarkup(React.createElement(NativeLayoutFixture,{initialState:state}))}`);
  await page.evaluate(()=>document.fonts.ready);
  const measure=()=>page.locator('.gift-normal').evaluate(event=>Object.fromEntries([['row',event],['action',event.querySelector('.content > .action')],['username',event.querySelector('.username')],['price',event.querySelector('.gift-price')]].map(([key,node])=>[key,getComputedStyle(node).fontWeight])));
  const before=await measure();assert.equal(before.row,'500');assert.equal(before.action,'500');
  const settings=createBuiltinNativeTheme('native-'+theme).settings;
  settings.visualModel.common[(part==='row'?'all':'gift')+'|all|'+part]={fontWeight:{source:'theme',value:300}};
  const managed=scopeThemeCss(assignNativeCssLayer(renderManagedNativeCss(settings),'config'),'.fixture-surface');await page.addStyleTag({content:managed});
  const after=await measure();assert.equal(after.row,'300',theme+' '+part+'行级字重');assert.equal(after.action,'300',theme+' '+part+'普通动作字重');assert.equal(after.username,'700','用户名保持强调');assert.equal(after.price,'700','主价格保持强调');
  results.push({state,part,before,after});
 }
 await writeFile(out+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify({cases:results.length,failures:[]}));
} finally {await browser.close();await server.close();}
