import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {createServer} from 'vite';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {build}=require('esbuild');
const bundle=await build({entryPoints:['src/compat/laplace/renderer/product.tsx'],bundle:true,write:false,format:'iife',platform:'browser',target:'chrome120',define:{'process.env.NODE_ENV':'"production"'}});
const vite=await createServer({configFile:false,server:{host:'127.0.0.1',port:0,open:false,watch:null},logLevel:'error',plugins:[{name:'entry-motion',configureServer(server){server.middlewares.use((req,res,next)=>{if(req.url?.split('?')[0]!=='/laplace/product/renderer.js')return next();res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);});}}]});
await vite.listen();
const {composeLaplaceCssLayers}=await vite.ssrLoadModule('/src/compat/laplace/cssCascade.ts');
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage();
 const origin=`http://127.0.0.1:${vite.httpServer.address().port}`;
 const results=[];
 for(const file of ['public/laplace/templates/bubble-next.css','public/laplace/templates/zelda.css','resources/theme-catalog/laplace-curated-1.css']){
  for(const preset of ['slide','none'])for(const preferThemeAnimation of [false,true]){
   await page.goto(`${origin}/laplace/product/index.html?qa=1`);
   await page.waitForFunction(()=>window.__laplaceQA);
   const event=await page.evaluate(()=>({...window.__laplaceQA.getOriginalSamples('static').find(e=>e.type==='message'),id:'entry-motion'}));
   const source=readFileSync(file,'utf8').replace(/url\((['"]?)(assets\/[^)'"\s]+)\1\)/g,(_,q,path)=>`url("${origin}/resources/theme-catalog/${path}")`)
    +'\n@keyframes sourceAmbient {from{filter:brightness(.9)}to{filter:brightness(1)}} .event--message .username {animation:sourceAmbient 2s infinite}'
    +'\n@keyframes sourceExit {0%{opacity:0}5%,95%{opacity:1}100%{opacity:0}} [data-event-id="source-exit"] {animation:sourceExit 15s both}';
   const render=async(sequence,custom='',events=[event],rate=0)=>{
    const css=composeLaplaceCssLayers('',source,'',custom);
    await page.evaluate(m=>window.__laplaceQA.render(m),{channel:'bb-laplace',version:1,type:'render',generation:0,sequence,events,stickyEvents:[],settings:{baseFontSize:20,colorScheme:'dark'},css,preview:false,scrollable:true,rate,animation:{preset,durationMs:300,preferThemeAnimation},productElements:{classicScope:false}});
    await page.locator('.event-list .event').first().waitFor({state:'attached'});
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   };
   await render(1);
   const active=await page.evaluate(()=>document.querySelector('.event-list .event').getAnimations({subtree:true}).filter(a=>a instanceof CSSAnimation&&a.effect.getTiming().iterations!==Infinity&&a.playState==='running').map(a=>a.animationName));
   results.push({file,preset,preferThemeAnimation,active});
   if(preset==='none')assert.ok(active.length>0,`${file}: 关闭软件动画时保留主题入场`);
   else assert.ok(active.length>0,'开启软件动画也保留主题入场');
   assert.equal(await page.locator('.event-list .event').first().getAttribute('data-event-motion'),preferThemeAnimation?'none':preset,'主题动画优先按开关生效');
   assert.ok(await page.evaluate(()=>document.querySelector('.event-list .event').getAnimations({subtree:true}).some(a=>a instanceof CSSAnimation&&a.animationName==='sourceAmbient'&&a.playState==='running')),'来源循环装饰继续播放');
   assert.equal(await page.locator('[data-laplace-entry-motion]').count(),0,'不覆写主题动画时长');
   if(file.includes('bubble-next')){
    const events=[0,1,2].map(index=>({...event,id:`entry-${index}`}));
    await render(2,'',events);
    await render(3,'',events.slice(0,2));
    assert.equal(await page.locator('.event-list .event').last().evaluate(n=>getComputedStyle(n).animationDuration),'0.5s','结构变化后仍使用主题自身的时长');
    await render(4,'',events,10);
    await render(5,'',events,0);
    assert.equal(await page.locator('[data-laplace-entry-motion]').count(),0,'流量变化后不残留动画时长覆盖');
   }
   await render(6,'',[{...event,id:'source-exit'}]);
   assert.equal(await page.locator('[data-event-id="source-exit"]').evaluate(n=>getComputedStyle(n).animationDuration),'15s','来源的有限次退出动效不按入场动画处理');
   await render(7,'@keyframes userEntry {from{opacity:.7}to{opacity:1}} .event--message .message {animation:userEntry 2s both}');
   assert.ok(await page.evaluate(()=>document.querySelector('.event-list .event').getAnimations({subtree:true}).some(a=>a instanceof CSSAnimation&&a.animationName==='userEntry'&&a.playState==='running')),'自定义有限次动画仍然生效');
   await render(8,'@keyframes ambient {from{filter:brightness(.9)}to{filter:brightness(1)}} .event--message .message {animation:ambient 2s infinite}');
   assert.ok(await page.evaluate(()=>document.querySelector('.event-list .event').getAnimations({subtree:true}).some(a=>a instanceof CSSAnimation&&a.animationName==='ambient'&&a.effect.getTiming().iterations===Infinity&&a.playState==='running')),'循环装饰继续播放');
   await render(9,'.event,.event *{animation:none}');
   assert.equal(await page.locator('.event-list .event').first().getAttribute('data-event-motion'),preset,'没有主题动画时使用软件入场');
  }
 }
 console.log(JSON.stringify(results));
}finally{await browser.close();await vite.close();}
