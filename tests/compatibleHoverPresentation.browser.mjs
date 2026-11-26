import {chromium} from 'playwright';import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:900,height:800}});
 for(const mode of ['laplace','blivechat','blivechat-open']){
  await page.goto(`${process.env.TEST_ORIGIN??'http://127.0.0.1:1446'}/tests/fixtures/styleCommonBehavior.html?mode=${mode}&target=live&gift&smallGift&animation=none`,{timeout:45000});
  await page.getByRole('button',{name:'追加事件',exact:true}).click();
  const row=page.frameLocator('iframe').locator('[data-event-id],[data-compatible-event-id]').first();await row.waitFor();await row.hover();
  const overlay=page.locator('[data-source-hovered="true"]');await overlay.waitFor();await page.waitForTimeout(250);
  const state=await overlay.evaluate(n=>({inset:parseFloat(n.style.getPropertyValue('--event-menu-right-inset'))||0,gradient:getComputedStyle(n,'::after').backgroundImage,gradientHeight:parseFloat(getComputedStyle(n,'::after').height)}));
  if(mode==='laplace')assert.equal(state.inset,0,'行内礼物图标不能挤走右侧快捷菜单');
  assert.equal(await page.locator('.compatible-event-row-highlight').evaluate(n=>Number(getComputedStyle(n).opacity)),1,`${mode}: 底层高光可见`);assert.match(state.gradient,/linear-gradient/,`${mode}: 菜单右缘渐变`);
  assert.ok(state.gradientHeight>0,`${mode}: 渐变实际覆盖菜单区域`);
  const trigger=page.locator('.event-menu-trigger:visible').first();assert.ok(await trigger.isVisible());await trigger.click();await page.getByRole('menu',{name:'事件菜单',exact:true}).waitFor();await page.keyboard.press('Escape');
  console.log(`${mode}: 快捷菜单靠右、整条事件高光及展开菜单正常`);
 }
 await page.goto(`${process.env.TEST_ORIGIN??'http://127.0.0.1:1446'}/tests/fixtures/styleCommonBehavior.html?mode=laplace&target=live&gift&animation=none`,{timeout:45000});
 await page.getByRole('button',{name:'追加事件',exact:true}).click();await page.frameLocator('iframe').locator('.event--gift').hover();
 const largeGift=page.locator('[data-source-hovered="true"]');await largeGift.waitFor();
 const inset=await largeGift.evaluate(n=>parseFloat(n.style.getPropertyValue('--event-menu-right-inset'))||0);assert.ok(inset>0,'右侧独立礼物图仍保留避让');
 assert.equal(await largeGift.evaluate(n=>parseFloat(getComputedStyle(n,'::after').right)),inset,'渐变与菜单共同避让大礼物图');
}finally{await browser.close();}
