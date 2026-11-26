import {chromium} from 'playwright';import assert from 'node:assert/strict';
const b=await chromium.launch({channel:'msedge',headless:true});const p=await b.newPage({viewport:{width:1000,height:700}});p.setDefaultTimeout(10000);p.setDefaultNavigationTimeout(45000);const base=process.env.TEST_ORIGIN??'http://127.0.0.1:1446';
await p.goto(`${base}/tests/fixtures/fanMedalProfile.html?bounds&wheel-trap`,{waitUntil:'domcontentloaded'});const area=p.locator('[data-event-overlay-region]');const row=p.locator('[data-scene=review] .event');await row.hover();await row.locator('.event-menu-trigger').click();const menu=p.getByRole('menu',{name:'事件菜单',exact:true});await menu.waitFor();await p.waitForTimeout(200);const before=await area.evaluate(e=>e.scrollTop);const r=await menu.boundingBox();await p.mouse.move(r.x+r.width/2,r.y+r.height/2);await p.mouse.wheel(0,80);await p.waitForTimeout(200);assert.ok(await menu.evaluate(e=>e.scrollTop>0),'菜单本身应响应滚轮');assert.equal(await area.evaluate(e=>e.scrollTop),before,'菜单滚轮不能推动底层事件');await p.mouse.wheel(0,10000);await p.waitForTimeout(200);assert.equal(await area.evaluate(e=>e.scrollTop),before,'菜单到达边缘不能穿透');await p.keyboard.press('Escape');
await area.evaluate(e=>{e.style.height='100px';e.scrollTop=0;});await row.locator('.fan-medal').click();const card=p.getByRole('dialog',{name:'主播资料',exact:true});await card.getByText('所属主播',{exact:true}).waitFor();await p.waitForTimeout(200);const a=await area.boundingBox(),c=await card.boundingBox();assert.ok(c.y>=a.y+7&&c.y+c.height<=a.y+a.height-7,'上下都放不下时，资料卡仍须留在内容区');
const escaped=await area.evaluate(async area=>{
 let escaped=false;
 for(let i=0;i<30;i++){
  area.scrollTop+=6;await new Promise(resolve=>requestAnimationFrame(resolve));
  const panel=document.querySelector('.fan-medal-profile'),bounds=area.getBoundingClientRect();
  if(!panel)break;
  const rect=panel.getBoundingClientRect(),x=rect.left+rect.width/2;
  for(const y of [bounds.top-1,bounds.bottom+1])if(document.elementFromPoint(x,y)?.closest('.fan-medal-profile'))escaped=true;
 }
 return escaped;
});assert.equal(escaped,false,'滚出期间资料卡不能在内容区外绘制或命中');
await area.evaluate(e=>e.scrollTop=e.scrollHeight);await card.waitFor({state:'hidden'});await b.close();console.log('菜单滚轮、滚动边缘与资料卡狭窄区域关闭通过。');
