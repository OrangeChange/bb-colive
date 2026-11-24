import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out=process.env.NATIVE_SHELL_OUTPUT ?? 'design/native-dom-shell-20261121/hosts';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:820,height:900}});const errors=[],results=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:1420/tests/fixtures/nativeDomShell.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>typeof window.setNativeShellCase==='function');
 for(const theme of ['default','card','bubble'])for(const mode of ['preview','obs'])for(const [width,size]of [[480,16],[260,24]]){
  const id=`${theme}-${mode}-${width}`;
  await page.evaluate(s=>window.setNativeShellCase(s),{id,theme,mode,width,size,dark:false,scale:1,alignment:'top'});
  await page.locator(`[data-case="${id}"]`).waitFor();await page.locator('.event-list .event').first().waitFor();
  await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>setTimeout(r,300));});
  const info=await page.locator('.event-area').evaluate(e=>({area:e.className,contents:[...e.querySelectorAll('*')].filter(n=>getComputedStyle(n).display==='contents').length,slots:[...e.querySelectorAll('.event-row-slot')].every(n=>n.classList.contains('event-row-slot-content')),sticky:e.querySelector('.sticky-area')?.className,nestedSticky:e.querySelectorAll('.sticky-area .sticky-area').length,fan:e.querySelector('.fan-medal')?.getAttribute('data-level'),wealth:e.querySelector('.wealth-medal')?.getAttribute('data-level'),events:e.querySelectorAll('.event-list .event').length,listHeight:e.querySelector('.event-list').getBoundingClientRect().height,stickyOverflow:e.querySelector('.sticky-area')?.scrollWidth>e.querySelector('.sticky-area')?.clientWidth}));
  assert.ok(info.area.includes('obs'));assert.ok(!info.area.split(' ').includes('live'));
  assert.equal(info.area.split(' ').includes('preview'),mode==='preview');assert.equal(info.contents,0);assert.ok(info.slots);assert.equal(info.nestedSticky,0);assert.ok(info.events>0);
  const geometry=await page.locator('.event-sticky').first().evaluate(e=>{const a=e.querySelector('.avatar-wrap'),r=e.getBoundingClientRect(),b=a.getBoundingClientRect();return {height:r.height,avatar:b.width,left:b.left-r.left,top:b.top-r.top}});
  assert.ok(Math.abs(geometry.left-geometry.top)<1,`${id} 头像同心 ${JSON.stringify(geometry)}`);assert.ok(info.fan);assert.ok(info.wealth);assert.ok(info.listHeight>100);
  const toggle=page.locator('.winner-list-toggle').first();if(!await toggle.evaluate(e=>e.closest('details').open))await toggle.click();assert.ok(await page.locator('.winner-list[open]').count());
  if(info.stickyOverflow){const sticky=page.locator('.sticky-area');await sticky.hover();await page.mouse.wheel(0,100);await page.waitForTimeout(100);assert.ok(await sticky.evaluate(e=>e.scrollLeft>0));}
  await page.locator('[data-case]').screenshot({path:`${out}/${id}.png`});results.push({id,...info});
 }
 for(const scale of [1,1.25,1.5]){
  const id=`live-${scale}`;await page.evaluate(s=>window.setNativeShellCase(s),{id,mode:'live',theme:'default',width:480,size:16,scale,alignment:'bottom'});
  await page.locator(`[data-case="${id}"]`).waitFor();await page.locator('.event-list .event').first().waitFor();await page.waitForTimeout(350);
  const info=await page.locator('.event-area.live').evaluate(e=>({height:e.scrollHeight,client:e.clientHeight,positioned:e.querySelector('.event-row-slot').style.position,layers:e.querySelector('.event-row-slot').classList.contains('event-row-slot-content')?1:2,slots:[...e.querySelectorAll('.event-row-slot')].map(n=>({y:n.getBoundingClientRect().y,h:n.getBoundingClientRect().height})),contents:[...e.querySelectorAll('*')].filter(n=>getComputedStyle(n).display==='contents').length}));
  assert.equal(info.positioned,'absolute');assert.equal(info.layers,2);assert.equal(info.contents,0);assert.ok(info.height>info.client);
  await page.locator('.event-area.live').evaluate(e=>e.scrollTop=0);await page.waitForTimeout(300);assert.ok(await page.locator('.event-list .event').count());results.push({id,...info});
 }
 const id='search';await page.evaluate(s=>window.setNativeShellCase(s),{id,mode:'search',theme:'default',width:480,size:16,scale:1});await page.locator(`[data-case="${id}"]`).waitFor();
 const toggle=page.locator('.winner-list-toggle');await toggle.click();assert.equal(await page.evaluate(()=>window.opened??0),0);assert.ok(await page.locator('.winner-list[open]').count());
 await toggle.focus();await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>window.opened??0),0);
 const summary=page.locator('[aria-label^="打开 "]');await summary.focus();await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>window.opened),1);
 await page.locator('.winner-count').first().click();assert.equal(await page.evaluate(()=>window.opened),2);results.push({id,nestedInteraction:true});
 assert.deepEqual(errors,[]);await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));console.log('实际 OBS 组件、预览、虚拟列表缩放与检索名单交互通过');
}finally{await browser.close();}
