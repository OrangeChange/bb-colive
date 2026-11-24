import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = await createServer({configFile:'tests/fixtures/nativeEvent.vite.config.mjs',server:{port:0,host:'127.0.0.1',strictPort:false,hmr:false,watch:null},optimizeDeps:{entries:['tests/fixtures/coliveAbout.html'],noDiscovery:false,include:['protobufjs']},logLevel:'error'});
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}/tests/fixtures/coliveAbout.html`;
const browser = await chromium.launch({channel:'chrome',headless:true});
try {
  const page = await browser.newPage({viewport:{width:960,height:720}});
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => console.error(error.message));
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:30000});
  await page.getByRole('button',{name:'关于 danmu-app',exact:true}).click();
  await page.waitForTimeout(100);
  assert.equal(await page.locator('dialog:modal').count(),1,'StrictMode下打开后保持显示');
  assert.equal(await page.evaluate(() => { const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);return ids.length===new Set(ids).size; }),true,'多实例无重复ID');
  const svgInstance = await page.locator('.about-character svg').elementHandle();
  await page.waitForTimeout(4900);
  assert.equal(await svgInstance.evaluate(svg => svg.isConnected), true, '持续父组件更新不能替换动画实例');
  assert.ok(await page.locator('.about-character svg').evaluate(svg=>svg.getCurrentTime())>=4.8);
  await page.getByRole('button',{name:'重播角色动画'}).click();
  assert.ok(await page.locator('.about-character svg').evaluate(svg=>svg.getCurrentTime())<1);
  await page.keyboard.press('Escape');
  await page.locator('dialog').waitFor({state:'detached'});
  assert.equal(await page.getByRole('button',{name:'关于 danmu-app',exact:true}).evaluate(e=>e===document.activeElement),true);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.getByRole('button',{name:'关于 danmu-app',exact:true}).click();
  assert.equal(await page.locator('.about-character animate, .about-character animateTransform').count(),0);
  await page.getByRole('button',{name:'关闭关于'}).click();
  await page.goto(base+'?floating',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>window.colivePorts?.calls.some(call=>call.command==='window.show'));
  assert.equal(await page.locator('.event-window-position-hint').count(),1);
  await page.evaluate(async () => {
    const {DEFAULT_EVENT_WINDOW_PREFERENCES:p}=await import('/src/windows/eventWindowPreferences.ts');
    await window.colivePorts.emitTo('display','event-window:preferences',{...p,appearance:{...p.appearance,scheme:'dark',material:'glass'}});
  });
  await page.waitForFunction(()=>document.querySelector('main').dataset.surfaceScheme==='dark');
  assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('dark')),false,'窗口深色不能改变内容浅色');
  await page.evaluate(async () => {
    const {DEFAULT_EVENT_WINDOW_PREFERENCES:p}=await import('/src/windows/eventWindowPreferences.ts');
    document.documentElement.classList.add('dark');
    await window.colivePorts.emitTo('display','event-window:preferences',{...p,appearance:{...p.appearance,scheme:'light',material:'transparent'}});
  });
  await page.waitForFunction(()=>document.querySelector('main').dataset.surfaceScheme==='light');
  assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('dark')),true,'窗口浅色不能改变内容深色');

  await page.evaluate(()=>window.colivePorts.emitTo('display','display:lock',true));
  await page.waitForFunction(()=>document.querySelector('main')?.dataset.lockState==='locked');
  assert.equal(await page.locator('.event-window-position-hint').count(),0);
  await page.evaluate(()=>window.colivePorts.emitTo('display','display:locate'));
  await page.locator('.event-window-position-hint').waitFor();
  await page.waitForTimeout(3100);
  assert.equal(await page.locator('.event-window-position-hint').count(),0);
  console.log('About StrictMode、动画重播、焦点、减少动效、多实例，以及副窗 StrictMode 握手与锁定定位通过。');
} finally { await browser.close(); await server.close(); }
