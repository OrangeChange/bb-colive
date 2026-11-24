import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.PREVIEW_TEST_URL||'http://localhost:1420';

for(const mode of ['blivechat','blivechat-open','laplace']) test(`${mode}: 加载失败可重试且保留编辑值`,async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1500,height:950}});
    const path=mode==='laplace'?'**/laplace/product/index.html*':mode==='blivechat'?'**/blivechat/renderer.html*':'**/openlive/renderer.html*';
    const abort=route=>route.abort('connectionrefused');
    await page.route(path,abort);
    await page.goto(`${base}/tests/fixtures/compatibleEditorBridge.html?mode=${mode}`);
    const alert=page.getByRole('alert').filter({hasText:'样式预览加载失败，请重试'});
    await alert.waitFor({timeout:20000});
    const setting=mode==='blivechat-open'?page.getByRole('switch',{name:'来源默认皮肤',exact:true}):page.getByRole('spinbutton',{name:mode==='laplace'?'基准字号 B':'整体比例 G',exact:true});
    if(mode==='blivechat-open')await setting.click();else await setting.fill(mode==='laplace'?'24':'1.25');
    await page.unroute(path,abort);
    await alert.getByRole('button',{name:'重试',exact:true}).click();
    await page.locator('iframe').contentFrame().locator(mode==='laplace'?'.event-list .event':'[data-compatible-event-id]:visible').first().waitFor();
    assert.equal(await alert.count(),0);
    if(mode==='blivechat-open')assert.equal(await setting.getAttribute('aria-checked'),'true');else assert.equal(await setting.inputValue(),mode==='laplace'?'24':'1.25');
  }finally{await browser.close()}
});
