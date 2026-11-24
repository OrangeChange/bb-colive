import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
import {readFileSync,readdirSync} from 'node:fs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server=await createServer({configFile:false,server:{host:'127.0.0.1',port:0,watch:null},optimizeDeps:{noDiscovery:true},logLevel:'error'});await server.listen();
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const {composeOpenLiveThemeCss}=await server.ssrLoadModule('/src/compat/openlive/css.ts');
 const {DEFAULT_OPENLIVE_THEME_SETTINGS}=await server.ssrLoadModule('/src/compat/openlive/theme.ts');
 const {createStylePreviewEvents}=await server.ssrLoadModule('/src/components/stylePreviewEvents.ts');
 const {projectOpenLiveCallback}=await server.ssrLoadModule('/src/compat/openlive/projection.ts');
 const sample=createStylePreviewEvents('弹幕')[0];
 const records=Array.from({length:60},(_,i)=>projectOpenLiveCallback({...sample,id:'scroll-'+i,reactKey:'scroll-'+i,text:'样例 '+i,ts:Date.now()+i},i));
 for(const file of readdirSync('resources/theme-catalog').filter(name=>/^openlive-.*\.css$/.test(name))){
  const page=await browser.newPage({viewport:{width:400,height:600}});
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/openlive/renderer.html`);
  await page.waitForFunction(()=>document.querySelector('yt-live-chat-renderer')?.__vue__);
  const css=composeOpenLiveThemeCss({settings:DEFAULT_OPENLIVE_THEME_SETTINGS,styles:{baseCss:readFileSync('resources/theme-catalog/'+file,'utf8'),visualCss:'',customCss:''}});
  await page.evaluate(({css,records})=>{
   const send=(command,data)=>window.postMessage({type:'bb-openlive',command,data},location.origin);
   send('host',{managed:true,direction:'bottom',scale:1,tickerEnabled:false});
   send('hydrate',{records});
   const style=document.createElement('style');style.textContent=css;document.head.append(style);
  },{css,records});
  await page.waitForTimeout(800);
  const state=await page.evaluate(()=>{const node=document.querySelector('#item-scroller');node.scrollTop=0;node.scrollTop=200;return{top:node.scrollTop,extent:node.scrollHeight,viewport:node.clientHeight,overflow:getComputedStyle(node).overflowY};});
  assert.ok(state.extent>state.viewport,JSON.stringify({file,state}));assert.ok(state.top>0,JSON.stringify({file,state}));console.log(file,state);await page.close();
 }
}finally{await browser.close();await server.close();}
