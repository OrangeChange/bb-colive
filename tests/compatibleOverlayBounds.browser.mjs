import {chromium} from 'playwright';import assert from 'node:assert/strict';const b=await chromium.launch({channel:'msedge',headless:true});const p=await b.newPage({viewport:{width:1000,height:800}});p.setDefaultTimeout(15000);p.setDefaultNavigationTimeout(45000);const origin=process.env.TEST_ORIGIN??'http://127.0.0.1:1446';
async function contained(panel){await p.waitForTimeout(250);const a=await p.locator('[data-event-overlay-region]').boundingBox(),r=await panel.boundingBox();assert.ok(r&&r.x>=a.x+7&&r.y>=a.y+7&&r.x+r.width<=a.x+a.width-7&&r.y+r.height<=a.y+a.height-7,JSON.stringify({area:a,panel:r}));}
for(const mode of ['blivechat','blivechat-open','laplace']){
 await p.goto(`${origin}/tests/fixtures/styleCommonBehavior.html?mode=${mode}&target=live&medal&animation=none`,{waitUntil:'domcontentloaded'});await p.getByRole('button',{name:'追加事件',exact:true}).click();
 const frame=p.frameLocator('iframe');const row=frame.locator('[data-compatible-event-id],[data-event-id]').first();await row.waitFor();await row.hover();const trigger=p.locator('.event-menu-trigger:visible').first();await trigger.click();const menu=p.getByRole('menu',{name:'事件菜单',exact:true});await menu.waitFor();await contained(menu);await p.keyboard.press('Escape');
 if(mode!=='blivechat'){
  const medal=frame.locator('.fans-medal,yt-live-chat-author-medal-renderer').first();await medal.click();const card=p.getByRole('dialog',{name:'主播资料',exact:true});await card.getByText('所属主播',{exact:true}).waitFor();await contained(card);await p.keyboard.press('Escape');
 }
 console.log(mode+': actual renderer overlays contained.');
}
await b.close();
