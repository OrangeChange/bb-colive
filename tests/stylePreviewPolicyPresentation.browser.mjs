import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:700,height:760}});
await context.route(/https:\/\//,r=>r.abort());
await context.route('**/tests/fixtures/compat/*/original-fixed-batch.json',async r=>{const batch=JSON.parse(await fs.readFile('tests/fixtures/compat/blc-original/original-fixed-batch.json','utf8'));const gift=batch.events.find(e=>e.method==='onAddGift');batch.events=[29.99,49.99,50,60,100].map((a,i)=>({...gift,receivedAt:Date.now(),offsetMs:i,data:{...gift.data,id:'gift-'+i,giftName:'金额'+a,num:1,price:a,totalCoin:a*1000,coinType:'gold',timestamp:Date.now()/1000}}));await r.fulfill({json:batch})});
const out='.superpowers/sdd/2026-11-01-style-common-behavior',results=[];
const selector=mode=>mode==='native'?'.event-row-slot[data-event-id]':mode==='laplace'?'.event-list .event[data-event-id]':'[data-blc-placement="main"],[data-openlive-placement="main"]';
const frame=(p,mode)=>p.frames().find(f=>mode==='native'?f.url()==='about:blank':f.url().includes(mode==='laplace'?'/laplace/product/':mode==='blivechat'?'/blivechat/renderer':'/openlive/renderer'));
async function until(fn){let e;for(let i=0;i<60;i++){try{return await fn()}catch(x){e=x;await new Promise(r=>setTimeout(r,50))}}throw e}
try{for(const mode of ['native','blivechat','blivechat-open','laplace']){
 const pages=[],session='presentation-'+mode+Date.now();for(const role of ['editor','window','web']){const p=await context.newPage();await p.goto(`http://127.0.0.1:1442/tests/fixtures/stylePreviewPolicy.html?mode=${mode}&role=${role}&session=${session}`);pages.push(p)}
 await until(async()=>{for(const p of pages)assert.equal(await frame(p,mode)?.locator(selector(mode)).count(),3)});
 await pages[0].evaluate(()=>window.previewFixture.configure({accent:true}));
 await until(async()=>{for(const p of pages)assert.equal(await frame(p,mode).locator(selector(mode)).first().evaluate(n=>getComputedStyle(n).outlineColor),'rgb(17, 99, 177)')});
 const presentation=[];for(const [i,p] of pages.entries()){const f=frame(p,mode);presentation.push(await f.locator(selector(mode)).first().evaluate(n=>({outline:getComputedStyle(n).outline,bodyBackground:getComputedStyle(document.body).backgroundColor})));await p.screenshot({path:`${out}/preview-style-${mode}-${i}.png`})}
 results.push({mode,action:'style-sync',status:'PASS',presentation});
 const timings=[];
 for(const threshold of [60,50,60,50]){
  const expected=threshold===60?2:3;
  for(const p of pages)await p.evaluate(({selector,expected})=>{window.previewConvergedAt=undefined;clearInterval(window.previewTimer);window.previewTimer=setInterval(()=>{const doc=document.querySelector('iframe')?.contentDocument;if(doc?.querySelectorAll(selector).length===expected){window.previewConvergedAt=Date.now();clearInterval(window.previewTimer)}},10)},{selector:selector(mode),expected});
  const started=await pages[0].evaluate(threshold=>{const t=Date.now();window.previewFixture.configure({threshold});return t},threshold);
  const elapsed=await until(async()=>{const times=await Promise.all(pages.map(p=>p.evaluate(()=>window.previewConvergedAt)));assert(times.every(Boolean));return times.map(t=>t-started)});timings.push({threshold,elapsedMs:elapsed});
 }
 results.push({mode,action:'settings-dom-timing',limitMs:250,status:timings.every(t=>t.elapsedMs.every(v=>v<=250))?'PASS':'FAIL',timings});
 const scrollSelector=mode==='native'?'.native-preview-message-scroll':mode==='laplace'?'.scroll-area':'#item-scroller';
 for(const p of pages)await p.locator('main').evaluate(n=>n.style.height='180px');
 await until(async()=>{for(const p of pages)assert(await frame(p,mode).locator(scrollSelector).evaluate(n=>n.scrollHeight-n.clientHeight>20))});
 const positions=async()=>Promise.all(pages.map(p=>frame(p,mode).locator(scrollSelector).evaluate(n=>({top:n.scrollTop,max:n.scrollHeight-n.clientHeight,scrollbar:getComputedStyle(n).scrollbarWidth}))));
 const before=await positions();await frame(pages[2],mode).locator(scrollSelector).hover();await pages[2].mouse.wheel(0,before[2].top<before[2].max/2?600:-600);await pages[2].waitForTimeout(300);const after=await positions();
 assert(Math.abs(before[0].top-after[0].top)<2);assert(Math.abs(before[1].top-after[1].top)<2);assert(Math.abs(after[2].top-before[2].top)>2,'网页预览实际滚动');assert.equal(after[1].scrollbar,'none');assert.equal(after[2].scrollbar,'none');results.push({mode,action:'independent-scroll',status:'PASS',before,after});
 await pages[2].setViewportSize({width:320,height:760});const width=await pages[2].locator('iframe').evaluate(n=>n.getBoundingClientRect().width);assert(width<=320&&width>=300);results.push({mode,action:'responsive',status:'PASS',width});
 console.log(mode,JSON.stringify(results.filter(r=>r.mode===mode)));for(const p of pages)await p.close();
}}finally{await fs.writeFile(`${out}/preview-presentation.json`,JSON.stringify({ipcCovered:false,results},null,2));await browser.close()}

assert(results.every(r=>r.status==='PASS'),'存在未通过的预览呈现行为');
