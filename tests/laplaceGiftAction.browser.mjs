import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
const require=createRequire(import.meta.url),{build}=require('esbuild');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const bundle=await build({entryPoints:['src/compat/laplace/renderer/product.tsx'],bundle:true,write:false,format:'iife',platform:'browser',target:'chrome111',define:{'process.env.NODE_ENV':'"production"'}});
const server=await createServer({configFile:false,server:{host:'127.0.0.1',port:0,watch:null},logLevel:'error',plugins:[{name:'gift-action',configureServer(v){v.middlewares.use((req,res,next)=>{if(req.url?.split('?')[0]!=='/laplace/product/renderer.js')return next();res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text)})}}]});
await server.listen();const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage();await page.route('https://**/*',r=>r.abort());
 await page.route('**/gift-parent',r=>r.fulfill({contentType:'text/html',body:`<iframe style="width:700px;height:900px" src="/laplace/product/index.html?qa=1&generation=1&parentOrigin=${encodeURIComponent(origin)}"></iframe><script>window.actions=[];addEventListener('message',e=>{if(e.data?.type==='action')actions.push({id:e.data.eventId,action:e.data.action})})</script>`}));
 await page.goto(origin+'/gift-parent');const f=page.frames().find(f=>f.url().includes('/laplace/product/'));await f.waitForFunction(()=>window.__laplaceQA);
 const sample=await f.evaluate(()=>window.__laplaceQA.getOriginalSamples('design').find(e=>e.type==='gift'&&e.coinType==='gold'));
 let sequence=0;
 const render=async(mode,preview=false,interactive=mode==='dashboard')=>{await f.evaluate(m=>window.__laplaceQA.render(m),{channel:'bb-laplace',version:1,type:'render',generation:1,sequence:++sequence,events:[sample],stickyEvents:[sample],settings:{baseFontSize:20,showStickyBar:true},css:{cloud:'',remote:'',custom:''},preview,giftEffectInteractive:interactive,scrollable:true,rate:0,renderMode:mode});await page.waitForTimeout(40);await page.evaluate(()=>actions=[])};
 await render('dashboard');const icon=f.locator('.event-list .gift-icon-wrap').first();await icon.click();await page.waitForTimeout(40);
 assert.deepEqual(await page.evaluate(()=>actions),[{id:sample.id,action:'gift-effect'}]);
 await page.evaluate(()=>actions=[]);await icon.focus();await page.keyboard.press('Enter');await page.keyboard.press('Space');await page.waitForTimeout(40);assert.equal(await page.evaluate(()=>actions.filter(a=>a.action==='gift-effect').length),2);
 await page.evaluate(()=>actions=[]);await f.locator('.gift-sticky-bar .gift-icon-wrap').first().click();await page.waitForTimeout(40);assert.equal(await page.evaluate(()=>actions.filter(a=>a.action==='gift-effect').length),1);
 for(const [mode,preview] of [['obs',false],['dashboard',true]]){await render(mode,preview);await f.locator('.event-list .gift-icon-wrap').first().click();await page.waitForTimeout(40);assert.equal(await page.evaluate(()=>actions.length),0)}
 await render('obs',false,true);await f.locator('.event-list .gift-icon-wrap').first().click();await page.waitForTimeout(40);assert.equal(await page.evaluate(()=>actions.filter(a=>a.action==='gift-effect').length),1);
 console.log('礼物图标主事件、置顶、键盘触发与OBS/编辑预览隔离通过');
}finally{await browser.close();await server.close()}
