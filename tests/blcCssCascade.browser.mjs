import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const root = path.resolve(import.meta.dirname, '..');
const output = process.env.BLC_CSS_TEST_OUTPUT || await fs.mkdtemp(path.join(os.tmpdir(), 'blc-css-cascade-'));
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const vite = await createServer({ root, configFile: false, server: { middlewareMode: true, watch: null }, optimizeDeps: { noDiscovery: true }, appType: 'custom', logLevel: 'silent' });
const load = p => vite.ssrLoadModule(p);
const adapters = await load('/src/themes/themeModeAdapters.ts');
const blc = await load('/src/compat/blivechat/css.ts');
const open = await load('/src/compat/openlive/css.ts');
const { createBlivechatBaseCss, BLIVECHAT_CAPABILITY } = await load('/src/compat/blivechat/theme.ts');
const { OPENLIVE_CAPABILITY } = await load('/src/compat/openlive/theme.ts');
const { materializeCompatibleVisualCss } = await load('/src/themes/compatManagedCss.ts');
const { createStylePreviewEvents } = await load('/src/components/stylePreviewEvents.ts');
const { projectBlivechatCallback } = await load('/src/compat/blivechat/projection.ts');
const { projectOpenLiveCallback } = await load('/src/compat/openlive/projection.ts');
const baselineOpen = (await fs.readFile(path.join(root, 'src/compat/openlive/css.ts'), 'utf8')).match(/export const OPENLIVE_ADAPTER_CSS = `([\s\S]*?)`;/)[1];
const build = (name, env) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [`scripts/build-${name}.cjs`], { cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', s => { log += s; }); child.stderr.on('data', s => { log += s; });
  child.on('error', reject);
  child.on('exit', code => code === 0 ? resolve(log) : reject(new Error(log)));
});
const result = { output, builds: {}, cases: [], defaultAppearance: [] };
let browser, server;
try {
  console.log('Isolated builds:', output);
  for (const name of ['blivechat', 'openlive']) {
    const baseline = path.join(output, 'baseline', name);
    try { await fs.access(baseline); } catch { await fs.cp(path.join(root, 'public', name), baseline, { recursive: true }); }
  }
  if (!process.env.BLC_CSS_SKIP_BUILD) {
    await fs.writeFile(path.join(output, 'blivechat-build.log'), await build('blivechat', { BLIVECHAT_QA: '1', BLIVECHAT_QA_OUTPUT: path.join(output, 'blivechat') }));
    await fs.writeFile(path.join(output, 'openlive-build.log'), await build('openlive', { OPENLIVE_QA: '1', OPENLIVE_QA_OUTPUT: path.join(output, 'openlive') }));
  }
  for (const name of ['blivechat', 'openlive']) {
    const info = JSON.parse(await fs.readFile(path.join(output, name, 'build-info.json'), 'utf8'));
    for (const source of ['src/themes/compatibleThemeCascade.ts', 'src/themes/nativeThemeCascade.ts']) assert.ok(info.sourceHashes[source], `${name}: ${source} provenance`);
    assert.ok(info.artifactHashes['css-layer.mjs'], `${name}: css-layer.mjs provenance`);
    if (name === 'blivechat') assert.ok(info.artifactHashes['renderer-layered.css']);
    result.builds[name] = { qaBuild: info.qaBuild, sourceHashes: info.sourceHashes, artifacts: Object.keys(info.artifactHashes) };
  }
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/custom_public/preset.css') {
      res.setHeader('content-type', 'text/css');
      res.end('#message{color:rgb(11,22,33)} .url-probe{background-image:url(./tile.png)} @layer author{.explicit-probe{color:rgb(33,22,11)}}'); return;
    }
    const baseline = url.pathname.startsWith('/baseline/');
    const relative = decodeURIComponent(url.pathname.replace(/^\/baseline\//, '/')).slice(1);
    for (const dir of baseline ? [path.join(output, 'baseline'), path.join(root, 'public')] : [output, path.join(root, 'public')]) {
      try { const data = await fs.readFile(path.join(dir, relative)); res.setHeader('content-type', mime[path.extname(relative)] || 'application/octet-stream'); res.end(data); return; } catch {}
    }
    res.statusCode = 404; res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  result.chrome = browser.version();
  for (const [mode, dir, channel, project] of [
    ['blivechat', 'blivechat', 'bb-blivechat', projectBlivechatCallback],
    ['blivechat-open', 'openlive', 'bb-openlive', projectOpenLiveCallback],
  ]) {
    const doc = adapters.createCompatibleThemeModeAdapter(mode).createBuiltinTheme();
    const records = ['弹幕', '礼物', '醒目留言', '大航海'].flatMap(k => createStylePreviewEvents(k).slice(0, 2)).map((e, i) => project({ ...e, ts: Date.now(), receivedAt: Date.now() }, i + 1)).filter(Boolean);
    const compose = mode === 'blivechat' ? blc.composeBlivechatThemeCss : open.composeOpenLiveThemeCss;
    const legacy = mode === 'blivechat'
      ? [doc.styles.baseCss, createBlivechatBaseCss(doc.settings), materializeCompatibleVisualCss(doc, BLIVECHAT_CAPABILITY), doc.styles.customCss].filter(Boolean).join('\n\n')
      : [open.materializeOpenLiveSourceCss(doc.styles.baseCss), baselineOpen, materializeCompatibleVisualCss(doc, OPENLIVE_CAPABILITY), doc.styles.customCss].filter(Boolean).join('\n\n');
    const pages = [];
    const send = async (page, command, data) => {
      await page.evaluate(({ channel, command, data }) => window.postMessage({ type: channel, command, data }, location.origin), { channel, command, data });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    };
    const read = page => page.evaluate(() => Array.from(document.querySelectorAll('yt-live-chat-text-message-renderer, yt-live-chat-paid-message-renderer, yt-live-chat-membership-item-renderer, yt-live-chat-ticker-paid-message-item-renderer')).map(row => {
      const measure = el => { const s = getComputedStyle(el), r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, color: s.color, background: s.backgroundColor, padding: s.padding, fontSize: s.fontSize, lineHeight: s.lineHeight, display: s.display }; };
      return { tag: row.tagName, row: measure(row), parts: Array.from(row.querySelectorAll('#message,#author-name,#timestamp,#author-photo,.el-badge__content')).map(el => ({ id: el.id || el.className, ...measure(el) })) };
    }));
    try {
      for (const baseline of [true, false]) {
        const page = await browser.newPage({ viewport: { width: 520, height: 900 }, deviceScaleFactor: 1 }); pages.push(page);
        page.on('pageerror', error => { result.cases.push({ mode, baseline, pageError: error.message }); });
        await page.route('https://**/*', route => route.abort());
        await page.goto(`${origin}/${baseline ? 'baseline/' : ''}${dir}/renderer.html`);
        await page.waitForFunction(() => document.querySelector('yt-live-chat-renderer')?.__vue__);
        await send(page, 'css', { css: baseline ? legacy : compose(doc) });
        await send(page, 'hydrate', { records });
        await page.waitForFunction(() => Array.from(document.querySelectorAll('yt-live-chat-text-message-renderer #message')).some(el => el.textContent.trim() && el.getBoundingClientRect().height > 0));
        await page.waitForFunction(() => Array.from(document.querySelectorAll('yt-live-chat-text-message-renderer')).every(el => { const r = el.getBoundingClientRect(); return r.y >= 0 && r.bottom <= innerHeight; }));
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: path.join(output, `${dir}-${baseline ? 'baseline' : 'candidate'}.png`), animations: 'disabled' });
      }
      const before = await read(pages[0]), after = await read(pages[1]);
      result.defaultAppearance.push({ mode, before, after, identical: JSON.stringify(before) === JSON.stringify(after) });
      assert.deepEqual(after, before, `${mode}: unedited default appearance`);
      if (mode === 'blivechat-open') {
        for (const [i, page] of pages.entries()) {
          const loaded = page.waitForResponse(r => r.url().endsWith('/named-default.css'));
          await send(page, 'config', { skin: 'default' }); await loaded;
          await page.screenshot({ path: path.join(output, `${dir}-named-${i === 0 ? 'baseline' : 'candidate'}.png`), animations: 'disabled' });
        }
        const namedBefore = await read(pages[0]), namedAfter = await read(pages[1]);
        result.defaultAppearance.push({ mode: `${mode}/named-default`, before: namedBefore, after: namedAfter, identical: JSON.stringify(namedBefore) === JSON.stringify(namedAfter) });
        assert.deepEqual(namedAfter, namedBefore, `${mode}: unedited named skin appearance`);
        for (const page of pages) await send(page, 'config', { skin: 'none' });
      }
      const page = pages[1];
      const color = () => page.locator('yt-live-chat-text-message-renderer #message').filter({ hasText: /\S/ }).first().evaluate(el => getComputedStyle(el).color);
      const baselineColor = await color();
      const appearanceCss = 'yt-live-chat-text-message-renderer #content #message{color:rgb(2,34,56)}';
      await send(page, 'css', { appearanceCss, css: '#message{color:rgb(65,43,21)}' });
      assert.equal(await color(), 'rgb(65, 43, 21)');
      await page.evaluate(() => {
        window.__cascadeStyleMutations = 0;
        const observer = new MutationObserver(changes => { window.__cascadeStyleMutations += changes.length; });
        for (const el of document.querySelectorAll('#bb-blivechat-preset-css,#bb-blivechat-appearance-css,#bb-blivechat-custom-css,#bb-openlive-appearance-css,#bb-openlive-custom-css,#bb-openlive-named-skin')) observer.observe(el, { childList: true, characterData: true, subtree: true });
        window.__cascadeStyleObserver = observer;
      });
      await send(page, 'css', { appearanceCss, css: '#message{color:rgb(65,43,21)}' });
      await send(page, 'config', { maxNumber: 61 });
      const textRecord = records.find(record => record.method === 'onAddText');
      for (let i = 0; i < 5; i++) await send(page, 'event', { ...textRecord, sequence: 100 + i, payload: { ...textRecord.payload, id: `css-stream-${i}`, content: `css stream ${i}` } });
      assert.equal(await page.evaluate(() => { window.__cascadeStyleObserver.disconnect(); return window.__cascadeStyleMutations; }), 0, '相同 CSS 与持续入流不重写样式表');
      await send(page, 'css', { appearanceCss, css: '' });
      assert.equal(await color(), 'rgb(2, 34, 56)');
      await send(page, 'css', { css: '' });
      const sourceColor = await color();
      assert.notEqual(sourceColor, 'rgb(2, 34, 56)');
      await send(page, 'css', { css: compose(doc) });
      assert.equal(await color(), baselineColor);
      await send(page, 'css', { appearanceCss: '@layer config{#message{color:green;font-size:26px}}', css: '@layer custom{.message,#message{color:rgb(45,115,235);font-size:34px}}' });
      const fontSize = () => page.locator('yt-live-chat-text-message-renderer #message').filter({ hasText: /\S/ }).first().evaluate(el => getComputedStyle(el).fontSize);
      assert.equal(await color(), 'rgb(45, 115, 235)');
      assert.equal(await fontSize(), '34px');
      await send(page, 'css', { appearanceCss: '@layer config{#message{color:green;font-size:26px}}', css: '' });
      assert.equal(await color(), 'rgb(0, 128, 0)');
      assert.equal(await fontSize(), '26px');
      const importedBlue = 'data:text/css,' + encodeURIComponent('.message,#message{color:blue}');
      await send(page, 'css', { css: `@layer a,b; @import url("${importedBlue}") layer(b); @layer a{.message,#message{color:red}}` });
      await page.waitForFunction(() => Array.from(document.querySelectorAll('#bb-blivechat-custom-css,#bb-openlive-custom-css')).some(style => Array.from(style.sheet?.cssRules ?? []).some(rule => rule.type === CSSRule.IMPORT_RULE && rule.styleSheet?.cssRules.length)));
      assert.equal(await color(), 'rgb(0, 0, 255)', '导入前作者声明 a,b，b 层蓝色覆盖 a 层红色');
      await send(page, 'css', { appearanceCss, css: '@layer author{#message{color:rgb(88,77,66)}} #message{color:rgb(65,43,21)}' });
      assert.equal(await color(), 'rgb(88, 77, 66)');
      await send(page, 'css', { appearanceCss: '@layer config{#message{color:rgb(2,34,56)!important}}', css: '@layer custom{#message{color:rgb(65,43,21)!important}}' });
      assert.equal(await color(), 'rgb(2, 34, 56)');
      if (mode === 'blivechat') {
        await send(page, 'config', { importPresetCss: true });
        await page.waitForFunction(() => document.getElementById('bb-blivechat-preset-css')?.textContent.includes('11,22,33'));
        await send(page, 'css', { appearanceCss, css: '#message{color:rgb(65,43,21)}' });
        assert.equal(await color(), 'rgb(65, 43, 21)');
        await send(page, 'css', { css: '' });
        assert.equal(await color(), 'rgb(11, 22, 33)');
        assert.match(await page.locator('#bb-blivechat-preset-css').textContent(), /custom_public\/tile.png/);
        await send(page, 'css', { presetCss: '#message{color:rgb(44,55,66)}', appearanceCss, css: '#message{color:rgb(65,43,21)}' });
        assert.equal(await color(), 'rgb(65, 43, 21)');
        await send(page, 'css', { css: '' });
        assert.equal(await color(), 'rgb(44, 55, 66)');
        await send(page, 'config', { importPresetCss: false });
        assert.equal(await color(), sourceColor);
      } else {
        await send(page, 'config', { skin: 'default' });
        await page.waitForFunction(() => { const s = document.getElementById('bb-openlive-named-skin'); return s?.sheet?.cssRules?.[1]?.styleSheet?.cssRules?.length > 0; });
        await send(page, 'css', { appearanceCss: 'yt-live-chat-text-message-renderer #content #message{font-family:serif}', css: '#message{font-family:monospace;color:rgb(65,43,21)}' });
        const family = () => page.locator('yt-live-chat-text-message-renderer #message').filter({ hasText: /\S/ }).first().evaluate(el => getComputedStyle(el).fontFamily);
        assert.equal(await family(), 'monospace');
        assert.equal(await color(), 'rgb(255, 255, 255)', '命名皮肤原有 important 保留浏览器语义');
        await send(page, 'css', { appearanceCss: 'yt-live-chat-text-message-renderer #content #message{font-family:serif}', css: '' });
        assert.equal(await family(), 'serif');
        await send(page, 'config', { skin: 'none' });
      }
      result.cases.push({ mode, ordinaryCustom: 'rgb(65, 43, 21)', clearCustom: 'rgb(2, 34, 56)', sourceColor, restoredDefault: baselineColor, appCaseCustom: { color: 'rgb(45, 115, 235)', fontSize: '34px' }, appCaseClear: { color: 'rgb(0, 128, 0)', fontSize: '26px' }, importLayerOrderColor: 'rgb(0, 0, 255)', explicitLayers: true, preset: true });
      console.log(mode, 'ordinary cascade, clear, explicit layers, presets and default geometry passed');
    } finally { for (const page of pages) await page.close(); }
  }
} finally {
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
  console.log('Evidence:', path.join(output, 'result.json'));
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await vite.close();
}
