import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { scopeNativePreviewCss } from '../src/themes/nativeManagedCss.ts';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  const content = '<div class="event"><span class="message">正文</span></div><section class="nested"><span class="message">内层</span><div class="stop"><span class="message">边界外</span></div></section>';
  await page.setContent(`<style id="theme"></style><div id="probe">${content}</div><div id="control">${content}</div>`);
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  const read = selector => page.locator(selector).evaluateAll(nodes => nodes.map(node => getComputedStyle(node).color));
  const baseline = await read('#control .message');
  for (const source of [
    '@scope(body){:scope{& .message{color:blue}}}',
    '@scope(body){.message,#unused{@media(min-width:0px){color:red}}.message{color:blue}}',
    '@scope(body){.message,#unused{color:red;&{color:green}color:blue}}',
    '@scope(body) to (.stop){.message{color:blue}}',
    '@scope(body){@scope(.nested) to (.stop){:scope{& .message{color:blue}}}}',
    '@layer custom{@media(min-width:0px){@scope(:root){.message{color:blue}}}}',
    '.event{& .message{color:blue}}',
    '@scope(body){@keyframes fade{from{opacity:0}to{opacity:1}}.message{color:blue}}',
    '@layer custom{@scope(body){.message{color:blue}}.message{color:red}}',
    '@scope(.dark){.message{color:blue}}',
    '@scope(html.dark){:scope{& .message{color:blue}}}',
  ]) {
    await page.locator('#theme').evaluate((node, css) => { node.textContent = css; }, source);
    const expected = await read('#probe .message');
    await page.locator('#theme').evaluate((node, css) => { node.textContent = css; }, scopeNativePreviewCss(source, '#probe'));
    assert.deepEqual(await read('#probe .message'), expected, source);
    assert.deepEqual(await read('#control .message'), baseline, `隔离：${source}`);
  }
  console.log('Chrome：作用域、嵌套、条件、层、边界与同屏隔离通过');
} finally {
  await browser.close();
}
