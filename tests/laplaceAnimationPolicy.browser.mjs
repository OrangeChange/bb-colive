import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { build } = require('esbuild');
const bundle = await build({ entryPoints: ['src/compat/laplace/renderer/product.tsx'], bundle: true, write: false, format: 'iife', platform: 'browser', target: 'chrome111', define: { 'process.env.NODE_ENV': '"production"' } });
const vite = await createServer({ configFile: false, server: { host: '127.0.0.1', port: 0, watch: null }, logLevel: 'error', plugins: [{ name: 'animation-policy', configureServer(server) {
  server.middlewares.use((request, response, next) => {
    if (request.url?.split('?')[0] !== '/laplace/product/renderer.js') return next();
    response.setHeader('Content-Type', 'text/javascript'); response.end(bundle.outputFiles[0].text);
  });
} }] });
const { composeLaplaceCssLayers } = await vite.ssrLoadModule('/src/compat/laplace/cssCascade.ts');
await vite.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ reducedMotion: 'no-preference' });
  await page.route('https://**/*', route => route.abort());
  await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/laplace/product/index.html?qa=1`);
  await page.waitForFunction(() => window.__laplaceQA);
  const sample = await page.evaluate(() => window.__laplaceQA.getOriginalSamples('static').find(event => event.type === 'message'));
  let sequence = 0;
  const animations = () => page.evaluate(() => [...document.querySelector('.event-list').getAnimations({ subtree: true })].filter(animation => animation instanceof CSSAnimation).map(animation => ({ name: animation.animationName, duration: animation.effect.getTiming().duration, running: animation.playState === 'running', iterations: animation.effect.getTiming().iterations })));
  async function render(preset, source, custom = '', events = [{ ...sample, id: 'animation-policy' }], stickyEvents = []) {
    const css = composeLaplaceCssLayers('', source, '', custom);
    await page.evaluate(message => window.__laplaceQA.render(message), { channel: 'bb-laplace', version: 1, type: 'render', generation: 0, sequence: ++sequence, events, stickyEvents, settings: { baseFontSize: 20 }, css, preview: false, scrollable: true, rate: 0, animation: { preset, durationMs: preset === 'none' ? 0 : 300 } });
    await page.waitForTimeout(60);
  }
  const source = '@keyframes themeEntry{from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:translateX(0)}} .event--message .message{animation:themeEntry 2s both} @keyframes themeLoop{to{filter:brightness(.7)}} .username{animation:themeLoop 2s infinite}';
  await render('none', source);
  assert.ok((await animations()).some(animation => animation.name === 'themeEntry' && animation.running && animation.duration === 2000), '关闭软件动画后，主题入场动画应运行');
  await render('slide', source);
  assert.ok((await animations()).some(animation => animation.name === 'themeEntry' && animation.running), '默认叠加时保留主题入场动画');
  await render('none', source);
  assert.ok((await animations()).some(animation => animation.name === 'themeEntry' && animation.running && animation.duration === 2000), '从软件动画切换到关闭时恢复主题动画');
  assert.ok((await animations()).some(animation => animation.name === 'themeLoop' && animation.running), '主题循环装饰不受软件开关影响');
  for (const file of ['public/laplace/templates/bubble-next.css', 'public/laplace/templates/zelda.css', 'resources/theme-catalog/laplace-curated-1.css']) {
    await render('none', readFileSync(file, 'utf8'), '', [{ ...sample, id: file }]);
    assert.ok((await animations()).some(animation => animation.running && animation.iterations !== Infinity), `${file} 应保留自身入场动画`);
  }
  await render('none', '.event--message{transition:margin-left 2s ease-in}');
  assert.equal(await page.locator('.event--message').first().evaluate(node => getComputedStyle(node).transitionProperty), 'margin-left', '关闭软件动画不应覆盖主题 CSS transition');
  await page.locator('.event--message').first().evaluate(node => { node.style.marginLeft = '20px'; });
  await page.waitForTimeout(40);
  assert.ok(await page.locator('.event--message').first().evaluate(node => node.getAnimations().some(animation => animation instanceof CSSTransition && animation.transitionProperty === 'margin-left')), '主题过渡应实际播放');
  const gift = await page.evaluate(() => window.__laplaceQA.getOriginalSamples('static').find(event => event.type === 'gift'));
  const a = { ...gift, id: 'sticky-a' }, b = { ...gift, id: 'sticky-b' };
  await render('none', '', '', [], [a, b]);
  await render('none', '', '', [], [b, a]);
  assert.equal(await page.locator('.gift-sticky-bar').evaluate(node => node.getAnimations({ subtree: true }).filter(animation => !(animation instanceof CSSAnimation) && !(animation instanceof CSSTransition)).length), 0, '关闭软件动画后不应播放程序生成的置顶位移动画');
  await render('slide', '', '', [], [b, a]);
  await render('slide', '', '', [], [a, b]);
  assert.ok(await page.locator('.gift-sticky-bar').evaluate(node => node.getAnimations({ subtree: true }).some(animation => !(animation instanceof CSSAnimation) && !(animation instanceof CSSTransition))), '软件动画启用时保留置顶位移');
  await render('none', '', '', [], [a, b]);
  assert.equal(await page.locator('.gift-sticky-bar').evaluate(node => node.getAnimations({ subtree: true }).filter(animation => !(animation instanceof CSSAnimation) && !(animation instanceof CSSTransition)).length), 0, '关闭开关时终止正在播放的程序位移');
  await render('slide', '', '', [], [b, a]);
  const curve = await page.locator('.gift-sticky-bar').evaluate(node => {
    const animation = node.getAnimations({ subtree: true }).find(a => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition));
    animation.pause();
    const frames = animation.effect.getKeyframes();
    const start = new DOMMatrix(frames[0].transform);
    animation.currentTime = 50;
    const actual = new DOMMatrix(getComputedStyle(animation.effect.target).transform);
    return { duration: animation.effect.getTiming().duration, frames: frames.length, ratio: actual.m41 / start.m41 };
  });
  assert.equal(curve.duration, 1051);
  assert.equal(curve.frames, 2);
  assert.ok(Math.abs(curve.ratio - 0.63681) < 0.0001, '置顶弹簧前段速度与官网实测一致');
  await render('slide', '', '', [], [a, b]);
  assert.equal(await page.locator('.gift-sticky-bar').evaluate(node => node.getAnimations({ subtree: true }).filter(a => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition)).length), 2, '连续重排取消旧位移，每项只保留一个动画');
  await page.evaluate(() => { window.originalSupports = CSS.supports; CSS.supports = (...args) => args[1] === 'linear(0, 1)' ? false : originalSupports(...args); });
  await render('slide', '', '', [], [b, a]);
  const legacy = await page.locator('.gift-sticky-bar').evaluate(node => node.getAnimations({ subtree: true }).filter(a => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition)).map(a => a.effect.getTiming().easing));
  assert.ok(legacy.every(easing => easing === 'cubic-bezier(0.16, 1, 0.3, 1)'), '旧内核使用官网相同的曲线回退');
  await page.evaluate(() => CSS.supports = originalSupports);
  console.log('软件动画关闭、开关切换、循环装饰、三个真实主题及 CSS 过渡通过');
} finally { await browser.close(); await vite.close(); }
