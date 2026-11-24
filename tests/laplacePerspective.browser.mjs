import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { build } = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

test('奇幻主题默认保留底部置顶顺序，显式上下位置保持优先', async () => {
  const bundle = await build({ entryPoints: ['src/compat/laplace/renderer/product.tsx'], bundle: true, write: false, format: 'iife', platform: 'browser', target: 'chrome111', define: { 'process.env.NODE_ENV': '"production"' } });
  const vite = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true }, server: { host: '127.0.0.1', port: 0, watch: null }, logLevel: 'error', plugins: [{ name: 'perspective-renderer', configureServer(server) {
    server.middlewares.use((request, response, next) => {
      if (request.url?.split('?')[0] !== '/laplace/product/renderer.js') return next();
      response.setHeader('Content-Type', 'text/javascript');
      response.end(bundle.outputFiles[0].text);
    });
  } }] });
  let browser;
  try {
    await vite.listen();
    browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
    const page = await browser.newPage({ viewport: { width: 640, height: 800 } });
    await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/laplace/product/index.html?qa=1&generation=1`);
    await page.waitForFunction(() => window.__laplaceQA);
    const samples = await page.evaluate(() => window.__laplaceQA.getOriginalSamples('design'));
    const events = samples.filter(event => event.type === 'message').slice(0, 10);
    const stickyEvents = [samples.find(event => event.type === 'superchat')];
    let sequence = 0;
    for (const position of [undefined, 'top', 'bottom', undefined]) {
      const message = { channel: 'bb-laplace', version: 1, type: 'render', generation: 1, sequence: ++sequence, events, stickyEvents, settings: { baseFontSize: 20, colorScheme: 'light', showStickyBar: true }, css: { cloud: readFileSync('public/laplace/templates/zelda.css', 'utf8'), remote: '', custom: '' }, preview: true, scrollable: true, direction: 'top', contentAlignment: 'top', rate: 0, animation: { preset: 'none', durationMs: 0 }, ...(position ? { tickerPosition: position } : {}) };
      assert.equal(await page.evaluate(message => window.__laplaceQA.renderSerialized(JSON.stringify(message)), message), true);
      const geometry = await page.evaluate(() => {
        const list = document.querySelector('.event-list'), bar = document.querySelector('.gift-sticky-bar');
        return { list: list.offsetTop, bar: bar.offsetTop, order: getComputedStyle(bar).order, perspective: getComputedStyle(list.parentElement).perspective, transform: getComputedStyle(list).transform };
      });
      assert.equal(geometry.order, position ? '0' : '1');
      assert.equal(geometry.bar < geometry.list, position === 'top');
      assert.equal(geometry.perspective, '1000px');
      assert.ok(geometry.transform.startsWith('matrix3d('));
    }
  } finally { await browser?.close(); await vite.close(); }
});
