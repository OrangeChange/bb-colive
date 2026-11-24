import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});const results=[];
try { for(const mode of ['native','blivechat','blivechat-open','laplace']) for(const target of ['live','obs','display','gift']) for(const direction of ['top','bottom']) {
 const windowed=target==='display'||target==='gift';
 const page=await browser.newPage({viewport:{width:1000,height:800}});
 try {await page.goto(`${windowed?'http://127.0.0.1:1444/tests/fixtures/styleCommonWindow.html':'http://127.0.0.1:1442/tests/fixtures/styleCommonBehavior.html'}?${new URLSearchParams({mode,target,kind:target,direction,legacy:'1',animation:'none'})}`);
 await page.getByText('追加事件',{exact:true}).click(); await page.waitForTimeout(550);
 const frame=mode==='native'?page:await(await page.locator('iframe').elementHandle()).contentFrame();
 const box=await frame.locator(mode==='native'?(windowed?'[aria-live="polite"]':target==='live'?'.scene-live-list':'.obs-native-root > .event-list'):mode==='laplace'?'.scroll-area':'#item-scroller').boundingBox();
 const row=await frame.locator(mode==='native'?'.event-row':mode==='laplace'?'.event-list .event':mode==='blivechat-open'?'#chat-items > [data-compatible-event-id]':'#items > [data-compatible-event-id]').first().boundingBox();
 assert.ok(box&&row,JSON.stringify({mode,target,direction,box,row}));
 const expected=mode==='blivechat'?'bottom':mode==='blivechat-open'?direction:mode==='laplace'?'top':direction==='top'?'bottom':'top';
 const topGap=row.y-box.y,bottomGap=box.y+box.height-row.y-row.height;
 assert.ok(expected==='top'?topGap<bottomGap:bottomGap<topGap,JSON.stringify({mode,target,direction,expected,topGap,bottomGap}));
 results.push({mode,target,direction,expected,topGap,bottomGap}); console.log('PASS legacy',mode,target,direction,expected);
 } finally {await page.close()}
 }} finally {await fs.writeFile('.superpowers/sdd/2026-11-01-style-common-behavior/legacy-alignment-results.json',JSON.stringify(results,null,2));await browser.close()}
