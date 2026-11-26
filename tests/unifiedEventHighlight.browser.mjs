import {chromium} from 'playwright';import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});const origin=process.env.TEST_ORIGIN??'http://127.0.0.1:1446';
try{
 const page=await browser.newPage({viewport:{width:950,height:850}});
 for(const mode of ['laplace','blivechat','blivechat-open'])for(const dark of [false,true]){
  await page.goto(`${origin}/tests/fixtures/styleCommonBehavior.html?mode=${mode}&target=live&animation=none`,{timeout:45000});
  await page.evaluate(d=>window.setFixtureScheme(d?'dark':'light'),dark);await page.getByRole('button',{name:'追加事件',exact:true}).click();
  const row=page.frameLocator('iframe').locator('[data-compatible-event-id],[data-event-id]').first();await row.waitFor();await row.hover();
  const layer=page.locator('.compatible-event-row-highlight');await layer.waitFor({timeout:5000});await page.waitForTimeout(180);
  const colors=await layer.evaluate(n=>({fill:getComputedStyle(n).backgroundColor,expected:(()=>{const probe=document.createElement('span');probe.style.backgroundColor='var(--event-hover-fill)';n.append(probe);const color=getComputedStyle(probe).backgroundColor;probe.remove();return color;})(),opacity:getComputedStyle(n).opacity,z:getComputedStyle(n).zIndex}));
  assert.equal(colors.fill,colors.expected.trim());assert.equal(Number(colors.opacity),1);assert.equal(colors.z,'0');
  assert.equal(await page.locator('[data-source-hovered]').evaluate(n=>getComputedStyle(n,'::before').content),'none','宿主菜单不覆盖整行蒙层');
  const trigger=page.locator('.event-menu-trigger:visible').first();await trigger.click();await page.getByRole('menu',{name:'事件菜单',exact:true}).waitFor();await page.mouse.move(850,800);await page.waitForTimeout(180);assert.equal(await layer.evaluate(n=>Number(getComputedStyle(n).opacity)),1,'菜单展开保留底层高光');
  await page.keyboard.press('Escape');await page.mouse.click(850,799);await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('.compatible-event-row-highlight')).opacity)===0,{},{timeout:3000});
  await row.hover();await page.locator('.event-quick-action:has(.lucide-star):visible').first().click();await page.mouse.click(850,799);await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('.compatible-event-row-highlight')).opacity)===0);assert.ok(await page.locator('.event-quick-action-persistent:visible').count()>0,'收藏图标常驻且整行不亮');
  console.log(`${mode}/${dark?'dark':'light'}: 底层高光、菜单保持、淡出及收藏常驻`);
 }
 for(const theme of ['default','card','bubble','review'])for(const dark of [false,true]){
  await page.goto(origin+'/tests/fixtures/nativeLayoutRepair.html',{timeout:45000});await page.waitForFunction(()=>window.setNativeLayoutCase);
  await page.evaluate(({theme,dark})=>window.setNativeLayoutCase({theme:theme==='review'?'default':theme,target:theme==='review'?'review':'live',width:480,dark,avatar:true,baseSizeCase:true,sampleKeys:['text','normal-gift']}),{theme,dark});
  const row=page.locator('.event-row-with-menu').first();await row.waitFor();await row.hover();await page.waitForTimeout(180);
  const owner=theme==='review'?row:page.locator('.event-row-slot-content').first();
  const state=await owner.evaluate((n,review)=>{const probe=document.createElement('span');probe.style.backgroundColor='var(--event-hover-fill)';n.append(probe);const expected=getComputedStyle(probe).backgroundColor;probe.remove();return {expected,actual:getComputedStyle(n,review?undefined:'::before').backgroundColor,z:review?'background':getComputedStyle(n,'::before').zIndex,count:n.style.getPropertyValue('--event-menu-action-count'),gradient:getComputedStyle(n,'::after').width};},theme==='review');
  assert.equal(state.actual,state.expected,theme+' 高光配色');if(theme!=='review')assert.equal(state.z,'-1');assert.ok(Number(state.count)>0);assert.ok(parseFloat(state.gradient)>0);
  await row.locator('.event-menu-trigger').click();await page.getByRole('menu',{name:'事件菜单',exact:true}).waitFor();await page.mouse.move(850,800);
  if(theme==='review')assert.equal(await row.evaluate(n=>getComputedStyle(n).backgroundColor),state.expected);else assert.equal(await owner.evaluate(n=>Number(getComputedStyle(n,'::before').opacity)),1);
  await page.keyboard.press('Escape');await page.mouse.click(850,799);await page.waitForTimeout(180);
  console.log(theme+'/'+(dark?'dark':'light')+': 整行底层高光及菜单展开保持');
 }
 for(const direction of ['top','bottom']){
  await page.goto(`${origin}/tests/fixtures/styleCommonBehavior.html?mode=laplace&target=live&animation=none&direction=${direction}`,{timeout:45000});
  const append=page.getByRole('button',{name:'追加事件',exact:true});for(let i=0;i<35;i++)await append.click();
  const frame=page.frameLocator('iframe');await frame.locator('[data-event-id]').first().waitFor();
  await frame.locator('[data-event-id]').filter({visible:true}).first().hover();await page.locator('.event-quick-action:has(.lucide-bookmark):visible').first().click();
  const marked=page.getByRole('button',{name:'跳转到标记',exact:true});await marked.waitFor();assert.equal(await marked.locator('.lucide-bookmark').count(),1);
  await frame.locator('.scroll-area').evaluate((n,direction)=>{n.scrollTop=direction==='top'?0:n.scrollHeight;},direction);await page.waitForTimeout(200);await frame.locator('.scroll-area').hover();await page.mouse.wheel(0,direction==='top'?500:-500);await page.waitForTimeout(200);await append.click();
  const latest=page.getByRole('button',{name:'回到最新消息',exact:true});await latest.waitFor();assert.equal(await latest.locator(direction==='top'?'.lucide-arrow-up-to-line':'.lucide-arrow-down-to-line').count(),1);
  console.log(direction+': B 组书签与回到最新图标方向正确');
 }
}finally{await browser.close();}
