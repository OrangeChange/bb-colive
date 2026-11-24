import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.connectOverCDP(process.env.UI_AUDIT_CDP || 'http://127.0.0.1:9235');
const page=browser.contexts()[0].pages()[0];page.setDefaultTimeout(12000);
const out='.hallmark/workflow-audit/after';fs.mkdirSync(out,{recursive:true});const results=[];
try {
  assert.equal(await page.evaluate(()=>__TAURI_INTERNALS__.invoke('plugin:app|identifier')),'cc.orange.danmu-app.ui-refinement');
  await page.evaluate(async()=>{const {useSession}=await import('/src/stores/session.ts');useSession.setState({phase:'loggedIn',session:{cookie:'',refreshToken:'',mid:'0',uname:'界面验收',savedAt:Date.now()}});(await import('/src/theme.ts')).useTheme.getState().setMode('light');});
  if(await page.getByRole('button',{name:'退出设置并收起工作台',exact:true}).isVisible())await page.getByRole('button',{name:'退出设置并收起工作台',exact:true}).click();
  await page.getByRole('button',{name:'样式',exact:true}).click();
  if(await page.getByRole('button',{name:'返回样式',exact:true}).isVisible())await page.getByRole('button',{name:'返回样式',exact:true}).click();
  for(const [id,name] of [['blc','BLC 原版默认'],['open','BLC 开放版默认'],['laplace','LAPLACE 默认']]) {
    await page.locator(`.theme-library-card[aria-label="编辑 ${name}"]`).getByRole('button',{name:'编辑',exact:true}).click();
    await page.getByRole('tab',{name:'可视化编辑',exact:true}).click();
    await page.evaluate(async()=>(await import('/src/generalSettings.ts')).useGeneralSettings.getState().setUiScale(1.25));
    await page.waitForTimeout(350);
    if(!await page.getByRole('combobox',{name:'事件范围',exact:true}).isVisible())await page.locator('.native-visual-body nav').getByRole('button',{name:'用户名',exact:true}).first().click();
    const event=page.getByRole('combobox',{name:'事件范围',exact:true});await event.click();
    const count=await page.getByRole('option').count();assert.ok(count>1);await page.keyboard.press('End');await page.keyboard.press('Enter');
    await page.getByRole('combobox',{name:'用户身份',exact:true}).click();await page.keyboard.press('Home');await page.keyboard.press('Enter');
    const panel=page.locator('.native-property-panel');assert.ok(await panel.evaluate(e=>e.clientHeight)>=240);
    await panel.scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/compatible-${id}-light-1.25.png`});
    if(id==='laplace'){await page.evaluate(async()=>(await import('/src/theme.ts')).useTheme.getState().setMode('dark'));await page.screenshot({path:`${out}/compatible-${id}-dark-1.25.png`});}
    results.push({name,scale:1.25,eventOptions:count,propertyHeight:await panel.evaluate(e=>e.clientHeight)});
    await page.getByRole('button',{name:'返回样式',exact:true}).click();
  }
  fs.writeFileSync(`${out}/compatible.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results));
} finally {
  await page.evaluate(async()=>(await import('/src/generalSettings.ts')).useGeneralSettings.getState().setUiScale(1));
  await browser.close();
}
