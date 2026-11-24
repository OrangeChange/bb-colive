import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:700,height:760}});
await context.route('**/tests/fixtures/compat/*/original-fixed-batch.json',async route=>{const batch=JSON.parse(await fs.readFile('tests/fixtures/compat/blc-original/original-fixed-batch.json','utf8'));const gift=batch.events.find(e=>e.method==='onAddGift');batch.events=[29.99,49.99,50,60,100].map((amount,index)=>({...gift,sequence:index+1,receivedAt:Date.now(),offsetMs:index,data:{...gift.data,id:'gift-'+index,giftName:'金额'+amount,num:1,price:amount,totalCoin:amount*1000,coinType:'gold',timestamp:Date.now()/1000}}));await route.fulfill({json:batch});});
await context.route('**/tests/fixtures/compat/blc-open/constructed-like-batch.json',route=>route.fulfill({json:{events:[]}}));
await context.route(/https:\/\//,route=>route.abort());
const out='.superpowers/sdd/2026-11-01-style-common-behavior';await fs.mkdir(out,{recursive:true});
const results=[], errors=[];
const modes=process.env.PREVIEW_MODES?.split(',')||['native','blivechat','blivechat-open','laplace'];
async function read(p,mode){
 const f=p.frames().find(f=>mode==='native'?f.url()==='about:blank':f.url().includes(mode==='laplace'?'/laplace/product/':mode==='blivechat'?'/blivechat/renderer':'/openlive/renderer'));
 if(!f)return {main:[],sticky:[]};
 return f.evaluate(mode=>{
  const main=mode==='native'?'.event-row-slot[data-event-id]':mode==='laplace'?'.event-list .event[data-event-id]':'[data-blc-placement="main"],[data-openlive-placement="main"]';
  const sticky=mode==='native'?'.sticky-area [data-event-id]':mode==='laplace'?'.gift-sticky-bar .event[data-event-id]':'[data-blc-placement="sticky"],[data-openlive-placement="sticky"]';
  const ids=s=>[...document.querySelectorAll(s)].map(n=>n.getAttribute('data-event-id')||n.getAttribute('data-compatible-event-id'));
  return {viewportHeight:innerHeight,main:ids(main),sticky:ids(sticky),geometry:[...document.querySelectorAll(main)].map(n=>{const r=n.getBoundingClientRect(),c=getComputedStyle(n);return {id:n.getAttribute('data-event-id')||n.getAttribute('data-compatible-event-id'),x:r.x,y:r.y,width:r.width,height:r.height,display:c.display,visibility:c.visibility,opacity:c.opacity}}),background:getComputedStyle(document.body).backgroundColor,scrollbar:getComputedStyle(document.querySelector('#item-scroller,.scroll-area,.native-preview-message-scroll')||document.body).scrollbarWidth};
 },mode);
}
async function eventually(fn){let error;for(let i=0;i<40;i++){try{return await fn()}catch(e){error=e;await new Promise(r=>setTimeout(r,100))}}throw error;}
try{for(const mode of modes){
 const session=`preview-${mode}-${Date.now()}`;
 const pages=[];for(const role of ['editor','window','web']){const p=await context.newPage();p.on('pageerror',e=>errors.push({mode,role,message:e.message}));await p.goto(`http://127.0.0.1:1442/tests/fixtures/stylePreviewPolicy.html?mode=${mode}&session=${session}&role=${role}`);pages.push(p);}
 const p=pages[0];await p.waitForTimeout(1800);
 for(const motion of ['static','design','simulation'])for(const all of [false,true]){
  await p.evaluate(({motion,all})=>window.previewFixture.configure({motion,all,restart:true}),{motion,all});await p.waitForTimeout(1000);
  if(mode.startsWith('blivechat')){
   const records=[29.99,49.99,50,60,100].map((amount,index)=>({sequence:index+1,method:'onAddGift',receivedAt:Date.now(),payload:{id:`gift-${index}`,uid:'1',authorName:'验收用户',avatarUrl:'',giftName:`金额${amount}`,num:1,price:amount,totalCoin:amount*1000,giftId:1,coinType:'gold',timestamp:Date.now()/1000}}));
   await p.locator('iframe').evaluate((el,{records,mode})=>el.contentWindow.postMessage({type:mode==='blivechat-open'?'bb-openlive':'bb-blivechat',command:'hydrate',data:{records}},location.origin),{records,mode});
  }
  const expected=motion==='simulation'?['gift-3','gift-4']:all?['gift-0','gift-1','gift-2','gift-3','gift-4']:['gift-2','gift-3','gift-4'];
  let actual;
  try{actual=await eventually(async()=>{const rows=await Promise.all(pages.map(p=>read(p,mode)));for(const row of rows){assert.ok(row.viewportHeight>=500,'产品预览布局高度');assert.ok(row.geometry.every(r=>r.y>=-1&&r.y+r.height<=row.viewportHeight+1),'主流样例应位于预览可见区域');assert.deepEqual(row.main,expected,`${mode} ${motion} all=${all} main`);assert.deepEqual(row.sticky,['gift-4','gift-3'],`${mode} ${motion} all=${all} sticky`)}return rows});}
  catch(e){const rows=await Promise.all(pages.map(p=>read(p,mode)));results.push({mode,motion,all,status:'FAIL',expected,rows,error:e.message});await p.screenshot({path:`${out}/preview-failure-${mode}-${motion}-${all}.png`});throw e;}
  results.push({mode,motion,all,status:'PASS',rows:actual});console.log('PASS',mode,motion,all);
  await p.screenshot({path:`${out}/preview-${mode}-${motion}-${all}.png`});
 }
 await p.evaluate(()=>window.previewFixture.configure({all:false,motion:'static',restart:true}));await p.waitForTimeout(1000);
 if(mode.startsWith('blivechat')){await p.locator('iframe').evaluate((el,mode)=>el.contentWindow.postMessage({type:mode==='blivechat-open'?'bb-openlive':'bb-blivechat',command:'hydrate',data:{records:[29.99,49.99,50,60,100].map((a,i)=>({method:'onAddGift',receivedAt:Date.now(),payload:{id:'gift-'+i,uid:'1',authorName:'验收用户',giftName:'金额'+a,num:1,price:a,totalCoin:a*1000,coinType:'gold'}}))}},location.origin),mode);}
 for(const threshold of [60,50]){const started=Date.now();await p.evaluate(threshold=>window.previewFixture.configure({threshold}),threshold);const expected=threshold===60?['gift-3','gift-4']:['gift-2','gift-3','gift-4'];const rows=await eventually(async()=>{const rows=await Promise.all(pages.map(p=>read(p,mode)));for(const row of rows)assert.deepEqual(row.main,expected);return rows});results.push({mode,action:'settings-threshold',threshold,elapsedMs:Date.now()-started,status:'PASS',rows});console.log('PASS settings',mode,threshold);}
 await p.evaluate(()=>window.previewFixture.configure({motion:'simulation',restart:true}));await p.waitForTimeout(1200);
 if(mode.startsWith('blivechat')){await p.locator('iframe').evaluate((el,mode)=>el.contentWindow.postMessage({type:mode==='blivechat-open'?'bb-openlive':'bb-blivechat',command:'hydrate',data:{records:[29.99,49.99,50,60,100].map((a,i)=>({method:'onAddGift',receivedAt:Date.now(),payload:{id:'gift-'+i,uid:'1',authorName:'验收用户',giftName:'金额'+a,num:1,price:a,totalCoin:a*1000,coinType:'gold'}}))}},location.origin),mode);}
 await eventually(async()=>{for(const page of pages)assert.deepEqual((await read(page,mode)).main,['gift-3','gift-4'])});
 await p.evaluate(()=>window.previewFixture.configure({capacity:5}));await p.waitForTimeout(400);
 const expanded=await Promise.all(pages.map(p=>read(p,mode)));for(const row of expanded)assert.deepEqual(row.main,['gift-3','gift-4'],'容量扩大不复活');results.push({mode,action:'capacity-expand',status:'PASS',rows:expanded});
 await pages[2].reload();await eventually(async()=>assert.deepEqual((await read(pages[2],mode)).main,['gift-3','gift-4']));results.push({mode,action:'late-page',status:'PASS'});
 for(const p of pages)await p.close();
}}finally{await fs.writeFile(`${out}/preview-browser-${process.env.PREVIEW_RUN||'result'}.json`,JSON.stringify({browser:browser.version(),ipcCovered:false,results,errors},null,2));await browser.close();}
