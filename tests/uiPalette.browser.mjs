import {chromium} from 'playwright';import assert from 'node:assert/strict';
const origin=process.env.TEST_ORIGIN ?? 'http://localhost:1443';
const b=await chromium.launch({channel:'msedge',headless:true});const p=await b.newPage({viewport:{width:1280,height:900}});p.setDefaultTimeout(10000);
for(const dark of [false,true]){
 await p.goto(`${origin}/tests/fixtures/localizedControls.html?mode=settings${dark?'&dark':''}`,{waitUntil:'domcontentloaded'});
 const sw=p.locator('[data-settings-section=general] [role=switch]').first();await sw.waitFor();
 const bg=await p.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
 const state=await sw.evaluate(e=>({checked:e.getAttribute('aria-checked'),bg:getComputedStyle(e).backgroundColor}));if(state.checked==='true') await sw.click();assert.equal(await sw.evaluate(e=>getComputedStyle(e).backgroundColor),dark?'rgb(18, 16, 17)':'rgb(250, 248, 248)');
 await p.keyboard.press('Tab'); await sw.focus();
 await p.waitForFunction(e=>e.matches(':focus-visible') && getComputedStyle(e).boxShadow.includes('2px'),await sw.elementHandle());
 await sw.click();assert.equal(await sw.getAttribute('aria-checked'),'true');
 await p.waitForTimeout(180); await p.screenshot({path:`.superpowers/palette-settings-${dark?'dark':'light'}.png`});
 await sw.click(); const select=p.getByRole('combobox').first();await select.click();
 const item=p.getByRole('option').nth(1);assert.equal(await item.evaluate(e=>getComputedStyle(e).color),dark?'rgb(162, 152, 156)':'rgb(90, 82, 87)');
 assert.equal(await p.getByRole('listbox').evaluate(e=>getComputedStyle(e).backgroundColor),dark?'rgb(34, 29, 32)':'rgb(245, 241, 242)');
 await p.waitForTimeout(180); await p.screenshot({path:`.superpowers/palette-menu-${dark?'dark':'light'}.png`});await p.keyboard.press('Escape');
}
await b.close();console.log('Light and dark settings: off/on/focus switches and menu text/surfaces match palette roles.');



