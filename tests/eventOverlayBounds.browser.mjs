import {chromium} from 'playwright';import assert from 'node:assert/strict';
const origin=process.env.TEST_ORIGIN??'http://127.0.0.1:1446';const b=await chromium.launch({channel:'msedge',headless:true});const p=await b.newPage({viewport:{width:1000,height:700}});p.setDefaultTimeout(12000);p.setDefaultNavigationTimeout(45000);
const region=p.locator('[data-event-overlay-region]');
async function contained(panel){await p.waitForTimeout(200);const a=await region.boundingBox(),r=await panel.boundingBox();assert.ok(r&&r.x>=a.x+7&&r.y>=a.y+7&&r.x+r.width<=a.x+a.width-7&&r.y+r.height<=a.y+a.height-7,JSON.stringify({region:a,panel:r}));}
for(const dark of [false,true]){
 await p.goto(`${origin}/tests/fixtures/fanMedalProfile.html?bounds${dark?'&dark':''}`,{waitUntil:'domcontentloaded'});
 for(const scene of ['live','review']){
  await region.evaluate(e=>e.scrollTop=0);
  const row=p.locator(`[data-scene=${scene}] .event`).first(),badge=row.locator('.fan-medal');
  await badge.click();const card=p.getByRole('dialog',{name:'主播资料',exact:true});await card.getByText('所属主播',{exact:true}).waitFor();await contained(card);
  await region.evaluate(e=>e.style.width='250px');await contained(card);await p.keyboard.press('Escape');await region.evaluate(e=>e.style.width='600px');
  await row.hover();await row.locator('.event-menu-trigger').click();const menu=p.getByRole('menu',{name:'事件菜单',exact:true});await menu.waitFor();await contained(menu);
  assert.ok(await menu.evaluate(e=>e.scrollHeight>e.clientHeight),'空间不足时菜单内部滚动');
  await region.evaluate(e=>{e.style.height='100px';});await contained(menu);await p.keyboard.press('Escape');
  await region.evaluate(e=>{e.style.height='240px';e.scrollTop=0;});await badge.click();await card.waitFor();await region.evaluate(e=>e.scrollTop=e.scrollHeight);await card.waitFor({state:'hidden'});
 }
 await region.evaluate(e=>{e.scrollTop=e.scrollHeight;});const source=p.frameLocator('iframe');await source.getByRole('button',{name:'兼容粉丝牌'}).click();const card=p.getByRole('dialog',{name:'主播资料',exact:true});await card.waitFor();await contained(card);
 await p.keyboard.press('Escape');await source.getByRole('button',{name:'兼容粉丝牌'}).click({button:'right'});const remoteMenu=p.getByRole('menu',{name:'事件菜单',exact:true});await remoteMenu.waitFor();await contained(remoteMenu);
 await source.locator('body').evaluate(e=>{e.style.height='1000px';e.ownerDocument.defaultView.scrollTo(0,500);});await remoteMenu.waitFor({state:'hidden'});
}
await b.close();console.log('现场、回看、兼容资料卡与事件菜单：8px边界、尺寸变化、内部滚动和移出关闭通过。');
