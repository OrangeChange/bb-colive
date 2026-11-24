import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
const require=createRequire(import.meta.url);
const {build}=require('esbuild');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');

test('LAPLACE 新事件直接按速率滚动，浏览权限不改变滚动曲线，CSS重排仅补偿位置',async()=>{
  const bundle=await build({entryPoints:['src/compat/laplace/renderer/product.tsx'],bundle:true,write:false,format:'iife',platform:'browser',target:'chrome111',define:{'process.env.NODE_ENV':'"production"'}});
  const vite=await createServer({configFile:false,optimizeDeps:{noDiscovery:true},server:{host:'127.0.0.1',port:0,watch:null},logLevel:'error',plugins:[{name:'follow-test',configureServer(server){server.middlewares.use((req,res,next)=>{if(req.url?.split('?')[0]!=='/laplace/product/renderer.js')return next();res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);});}}]});
  await vite.listen();const origin=vite.resolvedUrls.local[0].replace(/\/$/,'');
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{
    for(const scrollable of [false,true])for(const rate of [3,6,7]){
      const page=await browser.newPage({viewport:{width:400,height:240}});await page.route('https://**/*',route=>route.abort());
      await page.goto(`${origin}/laplace/product/index.html?qa=1&generation=1&parentOrigin=${encodeURIComponent(origin)}`);await page.waitForFunction(()=>window.__laplaceQA);
      await page.evaluate(({scrollable,rate})=>{
        const original=Element.prototype.scrollTo;window.calls=[];
        Element.prototype.scrollTo=function(options){if(this.matches('.event-list .scroll-area'))calls.push(options);return original.call(this,options)};
        const base=__laplaceQA.getOriginalSamples('static').find(e=>e.type==='message'&&!e.emote?.url&&!Object.keys(e.bmotes||{}).length);
        const events=Array.from({length:20},(_,i)=>({...base,id:'event-'+i,message:'正文',reply:{},avatar:'',timestampNormalized:1700000000000+i}));
        window.packet={channel:'bb-laplace',version:1,type:'render',generation:1,sequence:1,events,stickyEvents:[],settings:{baseFontSize:20,colorScheme:'light',showAvatar:false},css:{cloud:'',remote:'',custom:'.events-list-wrap{height:200px!important}.event-list .event{height:40px!important;min-height:40px!important}.avatar-wrap{display:none!important}'},preview:true,scrollable,rate,renderMode:'obs',animation:{preset:'none',durationMs:0}};
        if(!__laplaceQA.renderSerialized(JSON.stringify(packet)))throw Error('invalid packet');
      },{scrollable,rate});
      await page.waitForFunction(()=>{const n=document.querySelector('.event-list .scroll-area');return n&&Math.abs(n.scrollHeight-n.clientHeight-n.scrollTop)<=2});
      const direct=await page.evaluate(()=>{calls.length=0;packet={...packet,sequence:2,events:[...packet.events,{...packet.events[0],id:'new-event'}]};__laplaceQA.renderSerialized(JSON.stringify(packet));return calls});
      assert.equal(direct.length,1,JSON.stringify({scrollable,rate,direct}));assert.equal(direct[0].behavior,rate>6?'auto':'smooth');
      await page.waitForFunction(()=>{const n=document.querySelector('.event-list .scroll-area');return Math.abs(n.scrollHeight-n.clientHeight-n.scrollTop)<=2});
      const immediate=await page.evaluate(()=>{calls.length=0;packet={...packet,sequence:3,css:{...packet.css,custom:packet.css.custom.replaceAll('40px','48px')}};__laplaceQA.renderSerialized(JSON.stringify(packet));return calls.length});
      assert.equal(immediate,0,'样式变化不是新事件追加');
      await page.waitForFunction(()=>calls.length>0);assert.deepEqual(await page.evaluate(()=>calls.map(x=>x.behavior)),['auto']);
      await page.evaluate(()=>__laplaceQA.dispatchControlSerialized(JSON.stringify({channel:'bb-laplace',version:1,type:'control',generation:1,action:'restore-scroll',scrollTop:0,followingLatest:false})));
      await page.waitForFunction(()=>document.querySelector('.event-list .scroll-area').scrollTop===0);
      await page.evaluate(()=>{calls.length=0;packet={...packet,sequence:4,events:[...packet.events,{...packet.events[0],id:'reading-event'}]};__laplaceQA.renderSerialized(JSON.stringify(packet));});
      await page.waitForTimeout(100);
      assert.equal(await page.evaluate(()=>document.querySelector('.event-list .scroll-area').scrollTop),0,'新事件不打断手动阅读');
      assert.equal(await page.evaluate(()=>calls.length),0);
      await page.evaluate(()=>__laplaceQA.dispatchControlSerialized(JSON.stringify({channel:'bb-laplace',version:1,type:'control',generation:1,action:'scroll-latest'})));
      await page.waitForFunction(()=>{const n=document.querySelector('.event-list .scroll-area');return Math.abs(n.scrollHeight-n.clientHeight-n.scrollTop)<=2});
      const manual=await page.evaluate(()=>{packet={...packet,sequence:5,followLatest:false};return __laplaceQA.renderSerialized(JSON.stringify(packet));});
      assert.equal(manual,true);
      await page.evaluate(async()=>{document.querySelector('.event-list .scroll-area').scrollTop=0;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));calls.length=0;packet={...packet,sequence:6,events:[...packet.events,{...packet.events[0],id:'manual-preview'}]};__laplaceQA.renderSerialized(JSON.stringify(packet));});
      await page.waitForTimeout(80);
      assert.equal(await page.evaluate(()=>calls.length),0,'手动预览不自动追到末尾');
      await page.evaluate(()=>{packet={...packet,sequence:7,followLatest:true};__laplaceQA.renderSerialized(JSON.stringify(packet));});
      if(rate<=6){
        await page.waitForTimeout(40);
        const offset=await page.evaluate(async()=>{
          const n=document.querySelector('.event-list .scroll-area');n.style.overflowAnchor='none';
          __laplaceQA.dispatchControlSerialized(JSON.stringify({channel:'bb-laplace',version:1,type:'control',generation:1,action:'restore-scroll',scrollTop:300,followingLatest:false}));
          await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
          window.readAnchor=[...n.querySelectorAll('.event[data-event-id]')].find(row=>row.getBoundingClientRect().bottom>n.getBoundingClientRect().top);
          const offset=readAnchor.getBoundingClientRect().top-n.getBoundingClientRect().top;
          packet={...packet,sequence:8,css:{...packet.css,custom:packet.css.custom.replaceAll('48px','60px')}};__laplaceQA.renderSerialized(JSON.stringify(packet));return offset;
        });
        await page.waitForFunction(offset=>Math.abs(readAnchor.getBoundingClientRect().top-document.querySelector('.event-list .scroll-area').getBoundingClientRect().top-offset)<1,offset,{timeout:1500});
        await page.evaluate(()=>__laplaceQA.dispatchControlSerialized(JSON.stringify({channel:'bb-laplace',version:1,type:'control',generation:1,action:'scroll-latest'})));
      }
      await page.waitForFunction(()=>{const n=document.querySelector('.event-list .scroll-area');return Math.abs(n.scrollHeight-n.clientHeight-n.scrollTop)<=2});
      await page.close();
    }
  }finally{await browser.close();await vite.close();}
});
