import{chromium}from'playwright';import assert from'node:assert/strict';
const b=await chromium.launch({channel:'msedge',headless:true});const p=await b.newPage({viewport:{width:600,height:850}});p.setDefaultTimeout(7000);p.setDefaultNavigationTimeout(30000);
try{
 await p.goto((process.env.TEST_ORIGIN||'http://127.0.0.1:1436')+'/tests/fixtures/shadcn/visual-editor.html');await p.locator('[data-native-scope]').waitFor();await p.evaluate(async()=>{window.scopeLanguageModule=(await(await fetch('/src/i18n/react.ts')).text()).match(/from "([^"]*i18n\/index.ts[^"]*)"/)[1]});
 for(const lang of ['zh-CN','en','ja','zh-Hant']){
  await p.evaluate(async value=>(await import(window.scopeLanguageModule)).setUiLanguage(value),lang);
  for(const width of [600,1200]){
   await p.setViewportSize({width,height:850});await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   for(const selector of ['.native-event-scope-primary button','.native-identity-scope button','.native-scope-parameters [data-slot="select-trigger"]']){
    const boxes=await p.locator(selector).evaluateAll(ns=>ns.map(n=>n.getBoundingClientRect().toJSON()));assert.ok(boxes.length>0);assert.ok(Math.max(...boxes.map(r=>r.top))-Math.min(...boxes.map(r=>r.top))<2,lang+': '+selector+' 应保持单行');
   }
   assert.equal(await p.locator('.native-scope-parameters [data-slot="select-trigger"]').count(),4);
   const fonts=await p.locator('.native-scope-setting>span,.native-price-mode>span,.native-price-gradient-scope>label>span').evaluateAll(ns=>ns.map(n=>getComputedStyle(n).fontSize));assert.ok(fonts.every(x=>x==='14px'));
   assert.equal(await p.locator('html').evaluate(n=>n.scrollWidth>n.clientWidth),false);
  }
 }
 await p.evaluate(async()=>(await import(window.scopeLanguageModule)).setUiLanguage('zh-CN'));await p.setViewportSize({width:600,height:850});
 const bar=p.locator('.native-scope-parameters');await bar.hover();await p.mouse.wheel(0,500);await p.waitForFunction(()=>document.querySelector('.native-scope-parameters').scrollLeft>0);
 const amount=bar.locator('[data-slot="select-trigger"]').last();const before=await amount.innerText();await amount.click();await p.getByRole('option',{name:'管理档位',exact:true}).click();await p.getByRole('dialog').waitFor();await p.getByRole('button',{name:'关闭',exact:true}).click();await p.getByRole('dialog').waitFor({state:'detached'});assert.equal(await amount.innerText(),before,'管理入口不更改档位');
 await amount.focus();await p.keyboard.press('Enter');await p.getByRole('option',{name:'管理档位',exact:true}).focus();await p.keyboard.press('Enter');await p.getByRole('dialog').waitFor();await p.keyboard.press('Escape');await p.getByRole('dialog').waitFor({state:'detached'});
 const row=p.locator('.native-identity-scope .native-scope-options');await row.locator('button').last().click();const box=await row.boundingBox(),active=await row.locator('.is-active').boundingBox();assert.ok(active.x>=box.x-1&&active.x+active.width<=box.x+box.width+1,'所选身份进入可视范围');
 console.log('四语宽窄布局、横向滚动、选中项可见、档位管理和键盘操作通过');
}finally{await b.close()}
