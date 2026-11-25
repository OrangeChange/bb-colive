import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const origin=process.env.TEST_ORIGIN??'http://localhost:1443';
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1100,height:850}});
page.setDefaultTimeout(15000);
const css=locator=>locator.evaluate(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return {bg:s.backgroundColor,border:s.borderTopWidth,height:r.height,width:r.width,align:s.justifyContent,shadow:s.boxShadow}});
try {
 for(const dark of [false,true]) {
  await page.goto(`${origin}/tests/fixtures/reviewNavigation.html${dark?'?dark':''}`,{waitUntil:"domcontentloaded"});
  const search=page.locator('.ui-search-input').first();await search.waitFor();
  assert.equal((await css(search)).bg,'rgba(0, 0, 0, 0)','搜索内部保持透明');
  assert.equal((await css(search)).border,'0px');
  await page.goto(`${origin}/tests/fixtures/localizedControls.html?mode=settings${dark?'&dark':''}`,{waitUntil:"domcontentloaded"});
  await page.locator('.settings-section-navigator').click();
  const triggerBounds=await page.locator('.settings-section-navigator').boundingBox();
  const menuBounds=await page.locator('.settings-section-navigator-menu').boundingBox();
  assert.ok(Math.abs(triggerBounds.x+triggerBounds.width-menuBounds.x-menuBounds.width)<1,'设置目录右对齐触发框');
  for(const item of await page.locator('.settings-section-navigator-menu [role=option]').all()){
   const s=await css(item);assert.equal(s.border,'0px','目录项无独立框');assert.ok(['flex-start','start','flow-start'].includes(s.align));
  }
  await page.keyboard.press('Escape');
  await page.locator('.settings-search-shell > button').click();
  const input=page.locator('.settings-search-input-wrap input');await input.fill('字体');
  assert.equal((await css(input)).border,'0px');assert.equal((await css(input)).bg,'rgba(0, 0, 0, 0)');
  for(const item of await page.locator('.settings-search-result').all())assert.equal((await css(item)).border,'0px');
  await page.keyboard.press('Escape');
  await page.locator('[data-settings-section=general] .settings-reset-button').click();
  const dialog=page.getByRole('alertdialog');await dialog.waitFor();await page.waitForTimeout(180);
  assert.equal(Math.round((await dialog.boundingBox()).width),440,'确认框保持440px');
  const footer=await dialog.locator('[data-slot=alert-dialog-footer]').evaluate(e=>{const s=getComputedStyle(e);return {border:s.borderTopWidth,bg:s.backgroundColor,direction:s.flexDirection}});
  assert.deepEqual(footer,{border:'0px',bg:'rgba(0, 0, 0, 0)',direction:'row'});
  await page.mouse.click(4,4);await dialog.waitFor({state:'hidden'});
  for(const input of await page.locator('.settings-font-size-control input').all()){
   const fit=await input.evaluate(e=>e.getBoundingClientRect().height<=e.parentElement.clientHeight);
   assert.ok(fit,'数值输入不超出组合框内容高度');
  }
 }
 await page.goto(`${origin}/tests/fixtures/reviewNavigation.html?dark`,{waitUntil:"domcontentloaded"});
 await page.locator('article button').first().click();
 await page.locator('.review-session-row').first().locator('button').last().click();
 await page.locator('.event').first().hover();
 await page.locator('.event-menu-trigger').first().click();
 const avatar=page.locator('.event-context-menu-meta button').first();await avatar.waitFor();
 const a=await css(avatar);assert.equal(Math.round(a.width),24);assert.equal(Math.round(a.height),24);assert.equal(a.border,'0px');assert.equal(a.bg,'rgba(0, 0, 0, 0)');
 for(const mode of ['native','blivechat','blivechat-open','laplace']){
  await page.setViewportSize({width:1500,height:1000});
  await page.goto(`${origin}/tests/fixtures/themeImageMatrix.html?mode=${mode}`,{waitUntil:"domcontentloaded"});
  await page.getByRole('tab',{name:'可视化编辑',exact:true}).click();
  await page.locator('.native-property-panel').waitFor();
  const parts=page.locator('nav[aria-label="语义部件"] details');await parts.evaluateAll(es=>es.forEach(e=>e.open=true));
  await page.locator('button[data-native-part-id="username"]:visible').last().click();
  await page.locator('.native-property-sections details').evaluateAll(es=>es.forEach(e=>e.open=true));
  const image=page.locator('.native-property-panel').getByRole('button',{name:'图片背景',exact:true});
  await image.click();const d=page.getByRole('dialog',{name:'图片背景',exact:true});await d.waitFor();
  await page.setViewportSize({width:500,height:760});await page.waitForTimeout(200);
  const bounds=await d.boundingBox();assert.ok(bounds.x>=15&&bounds.x+bounds.width<=485,`${mode}: 图片弹窗保留两侧留白`);
  await d.getByRole('button',{name:'取消',exact:true}).click();
 }
 console.log('搜索、菜单、确认框、数值组合、头像和四类图片编辑器符合界面约定');
} finally {await browser.close();}
