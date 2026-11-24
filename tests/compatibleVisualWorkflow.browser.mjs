import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.PREVIEW_TEST_URL||'http://127.0.0.1:1420';
const modes=['blivechat','blivechat-open','laplace'];
async function choose(page,id){
 const target=page.locator(`[data-navigation-id="${id}"]`);
 for(let round=0;round<16&&!await target.isVisible();round++){
  let opened=false;
  for(const ancestor of await target.locator('xpath=ancestor::details').all()){
   if(await ancestor.getAttribute('open')!==null)continue;
   const summary=ancestor.locator(':scope > summary');
   if(await summary.isVisible()){await summary.click({position:{x:5,y:8}});opened=true;break;}
  }
  if(!opened)break;
 }
 await target.click();
}
async function frameOf(page,mode){await page.waitForFunction(()=>[...document.querySelectorAll('iframe')].some(f=>f.contentDocument?.querySelector('.event-list .event, yt-live-chat-item-list-renderer #item-scroller [data-compatible-event-id]')));const frame=page.frames().find(f=>f.url().includes(mode==='laplace'?'/laplace/product/':'/renderer.html'));assert.ok(frame);await frame.waitForSelector(mode==='laplace'?'.event-list .event':"yt-live-chat-item-list-renderer #item-scroller [data-compatible-event-id]");return frame;}
for(const mode of modes)test(`${mode}: actual editor selection, numeric edit, CSS and restore`,async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{const page=await browser.newPage({viewport:{width:1500,height:950}});await page.goto(`${base}/tests/fixtures/compatibleEditorBridge.html?mode=${mode}`);const frame=await frameOf(page,mode);
 await page.getByRole('tab',{name:'可视化编辑'}).click();await choose(page,'username');
 await page.locator('.native-event-scope-primary').getByRole('button',{name:'弹幕',exact:true}).click();
 const input=page.getByRole('spinbutton',{name:'字号精确值'});await input.waitFor();await page.waitForTimeout(200);
 await input.fill('24');await page.waitForFunction(()=>JSON.parse(document.querySelector('[data-testid="qa-state"]').textContent).model.common['danmaku|all|main|username']?.fontSize);
 const selector=mode==='laplace'?'.event-list .event--message .username':mode==='blivechat'?"yt-live-chat-text-message-renderer[data-blc-placement='main'] #author-name":"yt-live-chat-text-message-renderer[data-openlive-kind='danmaku'][data-openlive-placement='main'] #author-name";
 await frame.waitForFunction(s=>[...document.querySelectorAll(s)].some(e=>getComputedStyle(e).fontSize==='24px'),selector);
 assert.equal(await page.locator('nav[aria-label="语义部件"] button.is-active').count(),1);
 assert.match(await page.locator('[data-testid="qa-state"]').textContent(),/font-size/);
 await page.locator('.native-property-field.is-fontSize').getByRole('button',{name:'恢复继承'}).click();await page.waitForFunction(()=>!JSON.parse(document.querySelector('[data-testid="qa-state"]').textContent).model.common['danmaku|all|main|username']?.fontSize);
 await page.getByRole('button',{name:'全部事件',exact:true}).first().click();
 await page.waitForTimeout(200);assert.equal(await input.inputValue(),'');
 writeFileSync(`.superpowers/sdd/2026-10-28-compatible-visual-editor-implementation/${mode}-actual-editor.json`,JSON.stringify({mode,selection:true,numeric:24,actualFontSize:24,css:true,restore:true,mixedBlank:true}));
 }finally{await browser.close()}
});
for(const mode of ['blivechat','blivechat-open'])test(`${mode}: static preview opens source ticker details while visual editor remains active`,async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});try{const page=await browser.newPage({viewport:{width:1500,height:950}});await page.goto(`${base}/tests/fixtures/compatibleEditorBridge.html?mode=${mode}`);const frame=await frameOf(page,mode);await page.getByRole('tab',{name:'可视化编辑'}).click();await page.getByRole('button',{name:'静态',exact:true}).click();await frame.locator('yt-live-chat-ticker-paid-message-item-renderer').first().click();await frame.waitForSelector('yt-live-chat-ticker-renderer > [data-compatible-event-id]',{timeout:3000});}finally{await browser.close()}
});
test('LAPLACE reselects a conditional sticky gift image after sample filtering',async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});try{const page=await browser.newPage({viewport:{width:1500,height:950}});await page.goto(`${base}/tests/fixtures/compatibleEditorBridge.html?mode=laplace`);const frame=await frameOf(page,'laplace');await page.getByRole('tab',{name:'可视化编辑'}).click();await choose(page,'sticky-gift-image');await page.getByRole('switch',{name:'显示全部部件'}).click();await frame.waitForSelector('.gift-sticky-bar .gift-image-wrap img');await frame.waitForSelector('.gift-sticky-bar .gift-image-wrap img[data-compatible-editor-selected]',{timeout:3000});}finally{await browser.close()}
});
test('handwritten important CSS is displayed as CSS controlled rather than an editable number',async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});try{const page=await browser.newPage({viewport:{width:1500,height:950}});await page.goto(`${base}/tests/fixtures/compatibleEditorBridge.html?mode=blivechat`);await frameOf(page,'blivechat');await page.getByRole('tab',{name:'可视化编辑'}).click();await choose(page,'username');await page.getByRole('button',{name:'写入自定义 CSS',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.native-property-field.is-fontSize')?.textContent.includes('由 CSS 控制'),{},{timeout:3000});}finally{await browser.close()}
});
for(const mode of modes)test(`${mode}: line height reads back in the mode-specific unit`,async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});try{const page=await browser.newPage({viewport:{width:1500,height:950}});page.setDefaultTimeout(5000);await page.goto(`${base}/tests/fixtures/compatibleEditorBridge.html?mode=${mode}`);await frameOf(page,mode);await page.getByRole('tab',{name:'可视化编辑'}).click();await choose(page,'username');await page.locator('.native-event-scope-primary').getByRole('button',{name:'弹幕',exact:true}).click();const input=page.getByRole('spinbutton',{name:'行高精确值'});const value=mode==='laplace'?1.5:24;await input.fill(String(value));await page.waitForTimeout(500);assert.equal(Number(await input.inputValue()),value);const frame=await frameOf(page,mode);await frame.waitForFunction(expected=>[...document.querySelectorAll('[data-compatible-editor-selected]')].some(e=>Math.abs(parseFloat(getComputedStyle(e).lineHeight)-expected)<.2),mode==='laplace'?30:24);}finally{await browser.close()}
});
test('individual winner colour remains above a later shared winner colour',async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});try{const page=await browser.newPage({viewport:{width:1500,height:950}});await page.goto(`${base}/tests/fixtures/compatibleEditorBridge.html?mode=laplace`);const frame=await frameOf(page,'laplace');await page.getByRole('tab',{name:'可视化编辑'}).click();
 const colour=async(id,value)=>{await choose(page,id);await page.getByRole('button',{name:'颜色',exact:true}).click();await page.getByRole('dialog',{name:'颜色面板'}).getByRole('textbox',{name:'精确值'}).fill(value);await page.getByRole('button',{name:'关闭颜色面板'}).click();};
 await colour('winner-title-redResult','#ff0000');await colour('winner-title-winners','#0000ff');await page.waitForTimeout(200);assert.equal(await frame.locator('.event--red-envelope-result .details-name').first().evaluate(e=>getComputedStyle(e).color),'rgb(255, 0, 0)');assert.equal(await frame.locator('.event--lottery-result .details-name').first().evaluate(e=>getComputedStyle(e).color),'rgb(0, 0, 255)');
 }finally{await browser.close()}
});
