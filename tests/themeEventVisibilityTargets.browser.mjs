import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({channel:'chrome',headless:true});
const results=[];
async function until(fn){const end=Date.now()+10000;let error;while(Date.now()<end){try{return await fn()}catch(e){error=e;await new Promise(r=>setTimeout(r,80))}}throw error;}
async function choose(page,label,value){await page.getByRole('combobox',{name:label,exact:true}).click();await page.getByRole('option',{name:value,exact:true}).click();}
async function read(page,mode){const frame=page.frames().find(f=>mode==='native'?f.url()==='about:blank':f.url().includes(mode==='laplace'?'/laplace/product/':mode==='blivechat'?'/blivechat/renderer':'/openlive/renderer'));assert(frame);return frame.evaluate(mode=>{const selector=mode==='native'?'.event-row-slot[data-event-id]':mode==='laplace'?'.event-list .event[data-event-id]':'[data-blc-placement="main"],[data-openlive-placement="main"]';return [...document.querySelectorAll(selector)].filter(e=>getComputedStyle(e.querySelector('.event')??e).display!=='none').map(e=>e.getAttribute('data-event-id')||e.getAttribute('data-compatible-event-id'))},mode);}
try {for(const mode of (process.env.VISIBILITY_MODES || 'native,blivechat,blivechat-open,laplace').split(',')){
 const windowTarget=mode==='native'?'弹幕窗':'副窗口';
 const context=await browser.newContext({viewport:{width:1500,height:950}});let current;const sockets=new Set();
 await context.route(/^https?:\/\/(?!127\.0\.0\.1(?=[:/]))/,route=>route.abort());
 await context.routeWebSocket('**/ws?preview=current',socket=>{sockets.add(socket);if(current)socket.send(JSON.stringify({type:'preview:replace',state:current}));socket.onClose(()=>sockets.delete(socket))});
 await context.exposeBinding('__publishPreview',(_,{state,message})=>{current=state;for(const socket of sockets)socket.send(JSON.stringify(message))});
 const page=await context.newPage();page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(45000);
 await page.goto(`http://127.0.0.1:1442/tests/fixtures/stylePreviewPolicyEditor.html?mode=${mode}`,{waitUntil:'domcontentloaded'});
 await page.getByRole('combobox',{name:'预览样例',exact:true}).waitFor();
 const receiver=await context.newPage();await receiver.goto('http://127.0.0.1:1442/tests/fixtures/stylePreviewPolicyWeb.html',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'静态',exact:true}).click();
 await choose(page,'预览样例','弹幕');
 const all=page.getByRole('switch',{name:'显示全部部件',exact:true});if(await all.getAttribute('aria-checked')==='true')await all.click();
 await page.evaluate(async()=>{const {DEFAULT_EVENT_FILTERS}=await import('/src/events/eventView.ts');window.editorAcceptance.setSceneFilters(structuredClone(DEFAULT_EVENT_FILTERS));window.editorAcceptance.setVisibility({categories:{danmaku:false,interaction:false,gift:false},children:{enter:true,follow:false,like:true,normal:true,free:false}})});
 async function verify(label,expected){const ids=await until(async()=>{const a=await read(page,mode),b=await read(receiver,mode);assert.deepEqual(a,b);assert.equal(a.length>0,expected);return a});results.push({mode,label,rows:ids.length});console.log('PASS',mode,label,ids.length);}
 for(const [target,expected] of [['现场',true],[windowTarget,true],['OBS',false]]){await choose(page,'预览目标',target);await page.waitForTimeout(300);await verify('主题关闭弹幕-'+target,expected);}
 await choose(page,'预览目标',windowTarget);
 await page.evaluate(async()=>{const {DEFAULT_EVENT_FILTERS}=await import('/src/events/eventView.ts');const filters=structuredClone(DEFAULT_EVENT_FILTERS);filters.left.danmu=false;window.editorAcceptance.setSceneFilters(filters)});
 await page.waitForTimeout(300);await verify('现场关闭弹幕-副窗口',false);
 await page.evaluate(async()=>{const {DEFAULT_EVENT_FILTERS}=await import('/src/events/eventView.ts');window.editorAcceptance.setSceneFilters(structuredClone(DEFAULT_EVENT_FILTERS))});
 await choose(page,'预览目标','现场');await page.getByRole('button',{name:'点选',exact:true}).click();await verify('点选沿用现场范围',true);
 await page.getByRole('button',{name:'动态',exact:true}).click();await verify('动态沿用现场范围',true);await page.getByRole('button',{name:'暂停',exact:true}).click();
 if(mode==='native'||mode==='laplace'||mode==='blivechat-open'){
  await page.getByRole('button',{name:'静态',exact:true}).click();await choose(page,'预览样例','互动');
  await page.evaluate(async()=>{const {DEFAULT_EVENT_FILTERS}=await import('/src/events/eventView.ts');const filters=structuredClone(DEFAULT_EVENT_FILTERS);filters.left.interactKinds=Object.fromEntries(Object.keys(filters.left.interactKinds).map(k=>[k,false]));window.editorAcceptance.setSceneFilters(filters)});
  await choose(page,'预览目标','现场');await page.waitForTimeout(300);await verify('现场关闭全部互动细项',false);
  await choose(page,'预览目标',windowTarget);await page.waitForTimeout(300);await verify('副窗口忽略现场细项并读取主题细项',true);
  await choose(page,'预览目标','OBS');await page.waitForTimeout(300);await verify('OBS读取主题互动总开关',false);
 }
 await context.close();
} } finally {await fs.writeFile(process.env.VISIBILITY_REPORT||'D:/CodexBuild/native-preview-content-20261116/visibility-preview-browser.json',JSON.stringify(results,null,2));await browser.close();}
