import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import postcss from 'postcss';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { build } = require('esbuild');

test('LAPLACE 普通 custom 覆盖 config，clear 逐级恢复并保留显式层、important、inline', async () => {
  const bundle = process.env.LAPLACE_TEST_PUBLIC === '1' ? null : await build({ entryPoints: ['src/compat/laplace/renderer/product.tsx'], bundle: true, write: false, format: 'iife', platform: 'browser', target: 'chrome120', define: { 'process.env.NODE_ENV': '"production"' } });
  const vite = await createServer({ configFile: false, esbuild: { jsx: 'automatic' }, optimizeDeps: { noDiscovery: true }, server: { host: '127.0.0.1', port: 0, open: false, watch: null }, plugins: [{ name: 'laplace-cascade-renderer', configureServer(server) { server.middlewares.use((request, response, next) => {
    if (request.url?.split('?')[0] === '/tests/laplace-custom-import.css') {
      response.setHeader('Content-Type', 'text/css');
      response.end('.message {color: #4169ab; font-size: 41px}');
      return;
    }
    if (!bundle || request.url?.split('?')[0] !== '/laplace/product/renderer.js') return next();
    response.setHeader('Content-Type', 'text/javascript');
    response.end(bundle.outputFiles[0].text);
  }); } }], logLevel: 'error' });
  let browser;
  try {
    await vite.listen();
    await vite.ssrLoadModule('/src/compat/laplace/projection.ts');
    await vite.ssrLoadModule('/src/compat/laplace/theme.ts');
    const { composeLaplaceRendererCssSources: compose, composeLaplaceThemeCss: composeExport } = await vite.ssrLoadModule('/src/compat/laplace/runtime.tsx');
    const { createCompatibleThemeModeAdapter } = await vite.ssrLoadModule('/src/themes/themeModeAdapters.ts');
    let document = createCompatibleThemeModeAdapter('laplace').createBuiltinTheme();
    browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
    const host = await browser.newPage();
    const errors = [];
    host.on('pageerror', error => errors.push(error.message));
    const frameReady = host.waitForEvent('framenavigated', { predicate: frame => frame.url().includes('/laplace/product/index.html') });
    await host.goto(`http://127.0.0.1:${vite.httpServer.address().port}/tests/fixtures/laplaceCascade.html`, { waitUntil: 'domcontentloaded' });
    const page = await frameReady;
    await page.waitForFunction(() => !!window.__laplaceQA);
    const event = await page.evaluate(() => window.__laplaceQA.getOriginalSamples('static').find(event => event.type === 'message'));
    let sequence = 0;
    const render = async (extraCss = '') => {
      const css = compose(document);
      css.custom += '\n' + extraCss;
      const message = { channel: 'bb-laplace', version: 1, type: 'render', generation: 1, sequence: ++sequence, events: [event], stickyEvents: [], settings: { baseFontSize: 20, colorScheme: 'light' }, css, preview: true, scrollable: false, rate: 0, productElements: { classicScope: false } };
      assert.equal(await page.evaluate(message => window.__laplaceQA.render(message), message), true);
      await page.waitForFunction(css => document.querySelector('#dynamic-custom-css')?.textContent?.includes(css), extraCss || 'timestamp');
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    };
    const values = () => page.locator('.event--message .message').first().evaluate(node => ({ color: getComputedStyle(node).color, fontSize: getComputedStyle(node).fontSize }));
    await render();
    const baseline = await values();
    assert.deepEqual(baseline, { color: 'rgb(26, 27, 30)', fontSize: '20px' });
    const profiler = await host.context().newCDPSession(page);
    await profiler.send('Profiler.enable');
    await profiler.send('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
    await render('.cache-probe{color:red}');
    const firstCoverage = await profiler.send('Profiler.takePreciseCoverage');
    const firstComposition = firstCoverage.result.flatMap(script => script.functions).find(fn => fn.functionName === 'composeLaplaceFrameCustomCss');
    assert.equal(firstComposition?.ranges[0].count, 1, 'CSS 变化实际调用一次组合器');
    for (let index = 0; index < 5; index++) {
      event.message = `持续入流 ${index}`;
      await render('.cache-probe{color:red}');
    }
    const coverage = await profiler.send('Profiler.takePreciseCoverage');
    const composition = coverage.result.flatMap(script => script.functions).find(fn => fn.functionName === 'composeLaplaceFrameCustomCss');
    assert.equal(composition?.ranges[0].count ?? 0, 0, '相同 CSS 持续入流不重新组合或解析');
    await profiler.send('Profiler.stopPreciseCoverage');
    await profiler.detach();
    document.settings.visualModel = { common: { 'danmaku|all|main|message': { color: { source: 'custom', value: '#125634' }, fontSize: { source: 'custom', value: 29 } } }, light: {}, dark: {} };
    await render();
    assert.deepEqual(await values(), { color: 'rgb(18, 86, 52)', fontSize: '29px' });
    document.styles.customCss = '.message {color: #cb2143; font-size: 37px}';
    await render('.event--message .message {letter-spacing: 2px}');
    assert.deepEqual(await values(), { color: 'rgb(203, 33, 67)', fontSize: '37px' });
    assert.equal(await page.locator('.message').first().evaluate(node => getComputedStyle(node).letterSpacing), '2px');
    document.styles.customCss = '';
    await render();
    assert.deepEqual(await values(), { color: 'rgb(18, 86, 52)', fontSize: '29px' });
    document.settings.visualModel = { common: {}, light: {}, dark: {} };
    await render();
    assert.deepEqual(await values(), baseline);
    document.styles.customCss = '@layer manual {.message {color: #234567}} .message {color: #cb2143; font-size:37px}';
    await render();
    assert.equal((await values()).color, 'rgb(35, 69, 103)');
    document.styles.customCss = '.message {color: #cb2143; font-size:37px}';
    await render('.message {color: #123456!important}');
    assert.equal((await values()).color, 'rgb(18, 52, 86)');
    await page.locator('.message').first().evaluate(node => node.style.fontSize = '43px');
    assert.equal((await values()).fontSize, '43px');
    await page.locator('.message').first().evaluate(node => node.style.removeProperty('font-size'));
    const { createLaplaceCatalogTheme, LAPLACE_BUILTIN_THEME_SOURCES } = await vite.ssrLoadModule('/src/themes/laplaceThemeSources.ts');
    const builtins = [];
    for (const name of ['simple', 'bubble', 'shed']) {
      document = createLaplaceCatalogTheme(LAPLACE_BUILTIN_THEME_SOURCES.find(source => source.id === `laplace-builtin-${name}`), readFileSync(`public/laplace/templates/${name}.css`, 'utf8'), '2026-11-03');
      if (name === 'bubble') {
        const cloud = postcss.parse(compose(document).cloud);
        const fontImport = cloud.nodes.find(node => node.type === 'atrule' && node.name === 'import');
        assert.ok(fontImport, '来源字体 import 保留在顶层');
        assert.match(fontImport.params, /layer\(default\)/);
      }
      await render();
      const sourceDefault = await values();
      document.settings.visualModel = { common: { 'danmaku|all|main|message': { color: { source: 'custom', value: '#125634' }, fontSize: { source: 'custom', value: 29 } } }, light: {}, dark: {} };
      await render();
      assert.deepEqual(await values(), { color: 'rgb(18, 86, 52)', fontSize: '29px' }, `${name}: config`);
      document.styles.customCss = '.message {color: #cb2143; font-size: 37px}';
      await render();
      assert.deepEqual(await values(), { color: 'rgb(203, 33, 67)', fontSize: '37px' }, `${name}: custom`);
      document.styles.customCss = '';
      await render();
      assert.deepEqual(await values(), { color: 'rgb(18, 86, 52)', fontSize: '29px' }, `${name}: clear custom`);
      document.settings.visualModel = { common: {}, light: {}, dark: {} };
      await render();
      assert.deepEqual(await values(), sourceDefault, `${name}: clear config`);
      builtins.push({ name, sourceDefault });
    }
    const exports = [];
    const importUrl = `http://127.0.0.1:${vite.httpServer.address().port}/tests/laplace-custom-import.css`;
    for (const name of ['default', 'simple', 'shed', 'authored']) {
      document = createCompatibleThemeModeAdapter('laplace').createBuiltinTheme();
      if (name === 'simple' || name === 'shed') document.styles.baseCss = readFileSync(`public/laplace/templates/${name}.css`, 'utf8');
      document.settings.visualModel = { common: { 'danmaku|all|main|message': { color: { source: 'custom', value: '#125634' }, fontSize: { source: 'custom', value: 29 } } }, light: {}, dark: {} };
      document.styles.customCss = name === 'authored'
        ? `@layer manual-before, manual-import; @import url("${importUrl}") layer(manual-import); @layer manual-before {.message{color: #125634; font-size:39px}}`
        : `@import url("${importUrl}");`;
      await render();
      await page.waitForFunction(() => getComputedStyle(document.querySelector('.message')).fontSize === '41px');
      const importPreview = await values();
      assert.deepEqual(importPreview, { color: 'rgb(65, 105, 171)', fontSize: '41px' });
      const exported = await browser.newPage();
      const html = await page.locator('#root').innerHTML();
      await exported.setContent(`<html data-theme="light"><head><style>${composeExport(document)}</style></head><body>${html}</body></html>`, { waitUntil: 'networkidle' });
      const importExport = await exported.locator('.message').first().evaluate(node => ({ color: getComputedStyle(node).color, fontSize: getComputedStyle(node).fontSize }));
      assert.deepEqual(importExport, importPreview, `${name}: 完整导出中的 custom import 与隔离预览一致`);
      exports.push({ name, ...importExport });
      await exported.close();
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ browser: await browser.version(), baseline, config: { color: 'rgb(18, 86, 52)', fontSize: '29px' }, custom: { color: 'rgb(203, 33, 67)', fontSize: '37px' }, clearRestored: true, explicitLayer: true, important: true, inline: true, builtins, exports }));
  } finally {
    await browser?.close();
    await vite.close();
  }
});
