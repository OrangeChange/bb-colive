import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import fs from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = await createServer({ configFile: false, plugins: [react(), tailwindcss()], cacheDir: 'node_modules/.vite-publication-license', optimizeDeps: { entries: ['tests/fixtures/thirdPartyNotices.html'] }, server: { port: 0, strictPort: false, host: '127.0.0.1', hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const width of [960, 320]) for (const dark of [false, true]) {
    const page = await browser.newPage({ viewport: { width, height: 720 } });
    await page.route('https://**/*', route => route.abort());
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/fixtures/thirdPartyNotices.html`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '关于 BB CoLive', exact: true }).click();
    await page.evaluate(dark=>document.documentElement.classList.toggle('dark',dark),dark);
    await page.getByRole('heading', { name: 'BB CoLive', exact: true }).waitFor();
    await page.getByText('懂你的直播伙伴。', { exact: true }).waitFor();
    await page.getByText('© 2026 橙橙子君 Orange', { exact: true }).waitFor();
    assert.equal(await page.getByRole('link').count(),8);
    assert.equal(await page.getByRole('link',{name:'橙橙子君',exact:true}).getAttribute('href'),'https://space.bilibili.com/4261481');
    assert.equal(await page.getByRole('link',{name:'爱发电',exact:true}).getAttribute('href'),'https://afdian.com/a/orangeee');
    assert.equal(await page.getByRole('link',{name:'LAPLACE Chat',exact:true}).getAttribute('href'),'https://chat.laplace.live/');
    for(const label of ['Blivechat','LAPLACE Chat','React','Tauri','Tailwind CSS','Radix UI']) await page.getByRole('link',{name:label,exact:true}).waitFor();
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.evaluate(()=>document.fonts.ready);
    assert.equal(await page.getByRole('searchbox').count(), 0);
    assert.equal(await page.locator('dialog').evaluate(e => e.scrollWidth <= e.clientWidth), true);
    assert.equal(await page.locator('.about-links').evaluate(e=>getComputedStyle(e).textAlign),'center');
    assert.ok(await page.locator('.about-link-row').evaluateAll(es=>es.every(e=>getComputedStyle(e).justifyContent==='center')));
    assert.ok(await page.locator('.about-badge').evaluateAll(es=>es.every(e=>e.getBoundingClientRect().height<=24.5)),'徽章保持紧凑高度');
    assert.equal(await page.locator('.about-compatible').evaluate(e=>getComputedStyle(e).alignItems),'center');
    assert.ok(await page.locator('.about-brand-icon').evaluateAll(es=>es.every(e=>e.getBoundingClientRect().width===14)),'图标与文字比例一致');
    assert.ok(await page.getByRole('link',{name:'LAPLACE Chat',exact:true}).locator('img').evaluate(e=>e.complete&&e.naturalWidth>0),'LAPLACE Chat 官方图标已载入');
    await page.screenshot({ path: path.join(tmpdir(),`about-updated-${width}-${dark?'dark':'light'}.png`) });
    await page.keyboard.press('Escape');
    await page.locator('dialog').waitFor({ state: 'detached' });
    assert.equal(await page.getByRole('button', { name: '关于 BB CoLive', exact: true }).evaluate(e => e === document.activeElement), true);
    await page.close();
  }
  console.log('关于：品牌徽章、主页链接、居中排版、明暗模式、窄窗和关闭通过。');
} finally { await browser.close(); await server.close(); }
