import {mkdirSync} from 'node:fs';
mkdirSync('.superpowers/software-updates',{recursive:true});
import {chromium} from 'playwright';import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:900,height:760}});
 await page.goto(`${process.env.BB_COLIVE_TEST_BASE_URL??'http://127.0.0.1:1420'}/tests/fixtures/softwareUpdate.html?notifications`);
 await page.evaluate(()=>window.updateTest.state.setState({phase:'available',offer:window.updateTest.offer}));
 const toast=page.getByRole('status',{name:'软件更新'});await toast.waitFor();
 await toast.getByRole('button',{name:'关闭更新提示'}).click();assert.equal(await toast.count(),0);
 await page.evaluate(()=>window.updateTest.state.setState({phase:'ready'}));await toast.waitFor();
 const bell=await page.getByRole('button',{name:'系统提醒',exact:true}).boundingBox(),card=await toast.boundingBox();assert(card.y+card.height<bell.y);assert(Math.abs(card.x+card.width-bell.x-bell.width)<2);
 assert.equal(await toast.getByRole('button',{name:'关闭更新提示'}).innerText(),'');
 await page.screenshot({path:'.superpowers/software-updates/notification-ready.png'});
 await toast.getByRole('button',{name:'关闭更新提示'}).click();await page.getByRole('button',{name:'系统提醒',exact:true}).click();await page.getByRole('button',{name:'系统提醒',exact:true}).click();assert.equal(await toast.count(),0);
 await page.goto(`${process.env.BB_COLIVE_TEST_BASE_URL??'http://127.0.0.1:1420'}/tests/fixtures/softwareUpdate.html?helper`);
 await page.getByRole('progressbar').waitFor();
 const busyHeight=await page.locator('main').evaluate(e=>e.getBoundingClientRect().height);assert(busyHeight<230);
 await page.evaluate(async()=>{const {emit}=await import('/node_modules/@tauri-apps/api/event.js');await emit('update-install-progress',{phase:'failed',version:'1.0.0',completed:0,total:0,error:'文件被其他程序占用，请关闭后重试。',releaseUrl:'https://gitee.com/orange-chan/bb-colive/releases'});});
 await page.getByRole('button',{name:'重试更新'}).waitFor();assert.equal(await page.getByRole('button',{name:'关闭',exact:true}).innerText(),'关闭');
 const main=page.locator('main');await main.screenshot({path:'.superpowers/software-updates/helper-compact.png'});
 const margin=await page.evaluate(()=>{const m=document.querySelector('main').getBoundingClientRect(),a=document.querySelector('.software-update-actions').getBoundingClientRect();return m.bottom-a.bottom;});assert(margin>=26&&margin<=30);
 console.log('铃铛上方通知、图标关闭、通知关闭状态、更新窗口内容高度通过。');
}finally{await browser.close();}
