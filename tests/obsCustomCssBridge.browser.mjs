import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { build } from 'esbuild';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const paths = ['/laplace/product/index.html', '/blivechat/renderer.html', '/openlive/renderer.html'];
const source = '@import "./bridge-import.css" layer(remote-css); .bridge-probe { color: rgb(12, 34, 56); } @layer remote-css { .bridge-probe { background-color: rgb(65, 43, 21); } }';

test('OBS 网页入口将外层用户 CSS 传递到三版兼容产品，跟随编辑和 iframe 生命周期', async () => {
  const bundle = await build({ entryPoints: ['src/obs/obsBrowserEntry.tsx'], bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"', '__DANMU_BUILD_ID__': '"browser-test"' }, plugins: [{ name: 'raw-css', setup(builder) { builder.onLoad({ filter: /\.css\?raw$/ }, async args => ({ contents: await readFile(args.path.slice(0, -4), 'utf8'), loader: 'text' })); } }] });
  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/entry.js') { res.setHeader('content-type', 'text/javascript'); res.end(bundle.outputFiles[0].text); return; }
    if (pathname === '/bridge-import.css') { res.setHeader('content-type', 'text/css'); res.end('.bridge-probe { outline-color: rgb(23, 45, 67); }'); return; }
    try {
      const bytes = await readFile(new URL(`../public${pathname}`, import.meta.url));
      res.setHeader('content-type', pathname.endsWith('.html') ? 'text/html' : pathname.endsWith('.css') ? 'text/css' : 'text/javascript'); res.end(bytes);
    } catch { res.statusCode = 404; res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const entryHtml = '<html><head></head><body><div id="root"></div><script type="module" src="/entry.js"></script></body></html>';
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const entry of ['/obs', '/preview']) {
      const page = await browser.newPage();
      page.setDefaultTimeout(8000);
      await page.route(`${origin}${entry}`, async route => {
        const html = entryHtml.replace('</head>', `<style id="obs-user">${source}</style><style id="danmu-active-native-theme">.bridge-probe { --app-leak: yes; }</style><style data-precedence="react">.bridge-probe { --react-leak: yes; }</style><style data-vite-dev-id="test">.bridge-probe { --vite-leak: yes; }</style><style data-shared-preview-scrollbars>.bridge-probe { --scrollbars-leak: yes; }</style></head>`)
          .replace('</body>', '<iframe id="early" src="/laplace/product/index.html?early"></iframe><iframe id="unsupported" src="/other.html"></iframe></body>');
        await route.fulfill({ contentType: 'text/html', body: html });
      });
      await page.route(`${origin}/other.html`, route => route.fulfill({ contentType: 'text/html', body: '<span class="bridge-probe">external</span>' }));
      await page.goto(`${origin}${entry}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.documentElement.dataset.obsBrowser === 'true');
      const addProbe = async id => {
        await page.locator(`#${id}`).evaluate(frame => {
          const probe = frame.contentDocument.createElement('span');
          probe.className = 'bridge-probe';
          probe.textContent = 'CSS 验证';
          frame.contentDocument.body.append(probe);
        });
      };
      const color = async (id, expected) => {
        await page.waitForFunction(({ id, expected }) => {
          const doc = document.getElementById(id)?.contentDocument;
          const probe = doc?.querySelector('.bridge-probe');
          return probe && doc.defaultView.getComputedStyle(probe).color === expected;
        }, { id, expected });
      };
      await page.locator('#early').evaluate(frame => new Promise(resolve => {
        if (frame.contentDocument?.readyState === 'complete') resolve(); else frame.addEventListener('load', resolve, { once: true });
      }));
      await addProbe('early');
      await color('early', 'rgb(12, 34, 56)');
      await page.waitForFunction(() => {
        const doc = document.getElementById('early').contentDocument;
        return doc.defaultView.getComputedStyle(doc.querySelector('.bridge-probe')).outlineColor === 'rgb(23, 45, 67)';
      });
      await page.locator('#early').evaluate(frame => {
        const style = frame.contentDocument.createElement('style');
        style.textContent = '@layer custom { .bridge-probe { color: rgb(1, 2, 3); background-color: rgb(1, 2, 3); } }';
        frame.contentDocument.head.append(style);
      });
      await color('early', 'rgb(12, 34, 56)');
      assert.equal(await page.locator('#early').evaluate(frame => {
        const doc = frame.contentDocument, computed = doc.defaultView.getComputedStyle(doc.querySelector('.bridge-probe'));
        return computed.backgroundColor;
      }), 'rgb(65, 43, 21)');
      for (let index = 0; index < paths.length; index++) {
        await page.evaluate(({ path, index }) => new Promise(resolve => {
          const frame = document.createElement('iframe'); frame.id = `late-${index}`; frame.src = path;
          frame.onload = resolve; document.body.append(frame);
        }), { path: paths[index], index });
        await addProbe(`late-${index}`);
        await color(`late-${index}`, 'rgb(12, 34, 56)');
      }
      assert.deepEqual(await page.locator('#early').evaluate(frame => {
        const doc = frame.contentDocument, computed = doc.defaultView.getComputedStyle(doc.querySelector('.bridge-probe'));
        return ['--app-leak', '--react-leak', '--vite-leak', '--scrollbars-leak'].map(name => computed.getPropertyValue(name));
      }), ['', '', '', '']);
      assert.equal(await page.locator('#unsupported').evaluate(frame => frame.contentDocument.querySelector('[data-obs-custom-css]')), null);
      await page.evaluate(() => {
        document.getElementById('obs-user').textContent = '';
        for (let index = 0; index < 3; index++) {
          const doc = document.getElementById(`late-${index}`).contentDocument, style = doc.createElement('style');
          style.id = 'software-custom'; style.textContent = '@layer custom { .bridge-probe { color: rgb(180, 0, 0); } }'; doc.head.append(style);
        }
      });
      for (let index = 0; index < paths.length; index++) await color(`late-${index}`, 'rgb(180, 0, 0)');
      for (const rgb of ['255, 128, 0', '0, 90, 255']) {
        await page.evaluate(rgb => { document.getElementById('obs-user').textContent = `.bridge-probe { color: rgb(${rgb}); }`; }, rgb);
        for (let index = 0; index < paths.length; index++) await color(`late-${index}`, `rgb(${rgb})`);
      }
      await page.evaluate(() => {
        for (let index = 0; index < 3; index++) {
          const doc = document.getElementById(`late-${index}`).contentDocument;
          doc.getElementById('software-custom').remove();
          const style = doc.createElement('style'); style.id = 'software-custom';
          style.textContent = '@layer custom { .bridge-probe { color: rgb(210, 30, 30); } }'; doc.head.append(style);
        }
      });
      for (let index = 0; index < paths.length; index++) await color(`late-${index}`, 'rgb(0, 90, 255)');
      await page.evaluate(() => { document.getElementById('obs-user').textContent = ''; });
      for (let index = 0; index < paths.length; index++) await color(`late-${index}`, 'rgb(210, 30, 30)');
      await page.evaluate(() => { document.getElementById('obs-user').textContent = '.bridge-probe { color: rgb(77, 88, 99); }'; });
      await page.evaluate(() => { document.getElementById('obs-user').firstChild.data = '.bridge-probe { color: rgb(77, 88, 99); }'; });
      await color('early', 'rgb(77, 88, 99)');
      await page.evaluate(() => { document.getElementById('obs-user').textContent = '.bridge-probe {'; });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await color('early', 'rgb(77, 88, 99)');
      await page.locator('#early').evaluate(frame => new Promise(resolve => { frame.onload = resolve; frame.contentWindow.location.reload(); }));
      await addProbe('early'); await color('early', 'rgb(77, 88, 99)');
      await page.evaluate(() => { document.getElementById('obs-user').textContent = ''; });
      await page.waitForFunction(() => !document.querySelector('#early').contentDocument.querySelector('[data-obs-custom-css]')?.textContent);
      assert.notEqual(await page.locator('#early').evaluate(frame => {
        const doc = frame.contentDocument; return doc.defaultView.getComputedStyle(doc.querySelector('.bridge-probe')).color;
      }), 'rgb(77, 88, 99)');
      await page.evaluate(() => { const style = document.createElement('style'); style.id = 'late-user'; style.textContent = '.bridge-probe { color: rgb(98, 76, 54); }'; document.head.append(style); });
      await color('early', 'rgb(98, 76, 54)');
      await page.evaluate(() => new Promise(resolve => {
        const old = document.getElementById('early'), frame = document.createElement('iframe');
        window.__detachedObsFrameDocument = old.contentDocument;
        frame.id = 'early'; frame.src = '/openlive/renderer.html?theme=replaced'; frame.onload = resolve; old.replaceWith(frame);
      }));
      await addProbe('early'); await color('early', 'rgb(98, 76, 54)');
      // Removed frames must release their head observer even without a source edit.
      assert.equal(await page.evaluate(async () => {
        const doc = window.__detachedObsFrameDocument, style = doc.createElement('style');
        style.textContent = '@layer custom { .bridge-probe { color: red; } }'; doc.head.append(style);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return doc.head.lastElementChild === style;
      }), true);
      // Streaming rows must not rewrite the bridge stylesheet or cause an observer loop.
      assert.equal(await page.locator('#early').evaluate(async frame => {
        const doc = frame.contentDocument, style = doc.querySelector('[data-obs-custom-css]');
        let changes = 0; const observer = new MutationObserver(records => { changes += records.length; });
        observer.observe(style, { childList: true, subtree: true, characterData: true });
        for (let i = 0; i < 100; i++) doc.body.append(doc.createElement('span'));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        observer.disconnect(); return changes;
      }), 0);
      assert.equal(await page.locator('#late-user').textContent(), '.bridge-probe { color: rgb(98, 76, 54); }');
      await page.close();
    }
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
