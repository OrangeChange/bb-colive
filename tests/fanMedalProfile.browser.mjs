import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const b=await chromium.launch({channel:'msedge',headless:true});const p=await b.newPage({viewport:{width:900,height:700}});p.setDefaultTimeout(12000);p.setDefaultNavigationTimeout(45000);
const origin=process.env.TEST_ORIGIN ?? 'http://localhost:1443';
for(const dark of [false,true]){
 await p.goto(`${origin}/tests/fixtures/fanMedalProfile.html${dark?'?dark':''}`,{waitUntil:'domcontentloaded'});
 const live=p.locator('[data-scene=live] .fan-medal');await live.click();
 const card=p.getByRole('dialog',{name:'主播资料',exact:true});await card.getByText('所属主播',{exact:true}).waitFor();
 await card.getByText('粉丝 123,456',{exact:true}).waitFor();await p.waitForTimeout(180);
 const avatar=card.getByRole('button',{name:'预览 所属主播 的头像'});assert.equal(Math.round((await avatar.boundingBox()).width),24);
 const boxes=await card.locator('.fan-medal-profile-row').evaluate(e=>[...e.children].map(n=>{const r=n.getBoundingClientRect();return r.top+r.height/2}));assert.ok(Math.max(...boxes)-Math.min(...boxes)<1,'头像、两行资料和操作垂直居中');
 await card.getByRole('button',{name:'个人主页',exact:true}).click();await card.getByRole('button',{name:'直播间',exact:true}).click();
 assert.deepEqual(await p.evaluate(()=>window.openedProfileUrls),['https://space.bilibili.com/2','https://live.bilibili.com/1024']);
 await p.screenshot({path:`.superpowers/fan-medal-${dark?'dark':'light'}.png`});
 await avatar.click();await p.locator('.image-preview-overlay').waitFor();await card.waitFor({state:'hidden'});await p.keyboard.press('Escape');await p.locator('.image-preview-overlay').waitFor({state:'hidden'});await live.focus();
 await p.locator('[data-scene=review] .fan-medal').click();await card.getByText('所属主播',{exact:true}).waitFor();assert.equal(await p.evaluate(()=>window.profileRequests),1,'现场与回看复用缓存');await p.keyboard.press('Escape');
 assert.equal(await p.locator('[data-scene=output] .fan-medal').getAttribute('role'),null,'输出不增加交互');
 await p.frameLocator('iframe').getByRole('button',{name:'兼容粉丝牌'}).click();await card.getByText('所属主播',{exact:true}).waitFor();assert.equal(await p.evaluate(()=>window.profileRequests),1);await p.keyboard.press('Escape');
}
await p.goto(`${origin}/tests/fixtures/fanMedalProfile.html?unknown`,{waitUntil:'domcontentloaded'});await p.locator('[data-scene=review] .fan-medal').click();await p.getByText('暂无主播信息',{exact:true}).waitFor();assert.equal(await p.evaluate(()=>window.profileRequests),0);
await p.goto(`${origin}/tests/fixtures/fanMedalProfile.html`,{waitUntil:'domcontentloaded'});await p.evaluate(()=>window.profileFail=true);await p.locator('[data-scene=live] .fan-medal').click();await p.getByRole('button',{name:'加载失败，重试'}).waitFor();await p.evaluate(()=>window.profileFail=false);await p.getByRole('button',{name:'加载失败，重试'}).click();await p.getByText('粉丝 123,456',{exact:true}).waitFor();
for(const [lang,title] of [['en','Streamer profile'],['zh-Hant','主播資料'],['ja','配信者情報']]){
 await p.goto(`${origin}/tests/fixtures/fanMedalProfile.html?lang=${lang}`,{waitUntil:'domcontentloaded'});
 await p.locator('[data-scene=review] .fan-medal').click();
 await p.getByRole('dialog',{name:title,exact:true}).getByText('所属主播',{exact:true}).waitFor();
 await p.keyboard.press('Escape');
}
await b.close();console.log('现场、回看、兼容粉丝牌资料：查询缓存、24px居中、头像预览、跳转和失败重试通过。');
