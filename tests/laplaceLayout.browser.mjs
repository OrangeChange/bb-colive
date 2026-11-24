import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'vite';
import postcss from 'postcss';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { build } = require('esbuild');

test('LAPLACE 置顶上下位置及反向滚轮实际渲染', async () => {
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
    await host.evaluate(()=>{window.flowReports=[];addEventListener('message',event=>{if(event.data?.type==='scroll-state')window.flowReports.push(event.data)});});
    await page.waitForFunction(() => !!window.__laplaceQA);
    assert.equal(await page.title(), 'LAPLACE product');
    const event = await page.evaluate(() => window.__laplaceQA.getOriginalSamples('static').find(event => event.type === 'message'));
    let sequence = 0;
    const events = Array.from({length:30},(_,i)=>({...event,id:`layout-${i}`,message:`事件 ${i}`}));
    const stickyEvent = await page.evaluate(() => window.__laplaceQA.getOriginalSamples('static').find(event => event.type === 'superchat'));
    for (const theme of ['laplace-curated-1','laplace-builtin-zelda']) {
      document.styles.baseCss = readFileSync(`resources/theme-catalog/${theme}.css`,'utf8');
      for (const position of ['top','bottom']) {
        const message = {channel:'bb-laplace',version:1,type:'render',generation:1,sequence:++sequence,events,stickyEvents:Array.from({length:12},(_,i)=>({...stickyEvent,id:`sticky-${i}`})),settings:{baseFontSize:20,colorScheme:'light',showStickyBar:true},css:compose(document),preview:true,scrollable:true,contentAlignment:'top',tickerPosition:position,rate:0,productElements:{classicScope:false}};
        await page.evaluate(message=>window.__laplaceQA.render(message),message);
        await page.waitForTimeout(250);
        const geometry = await page.evaluate(()=>{const bar=document.querySelector('.gift-sticky-bar'),list=document.querySelector('.event-list');return {bar:bar.getBoundingClientRect().toJSON(),list:list.getBoundingClientRect().toJSON(),reverse:getComputedStyle(bar).flexDirection};});
        assert.ok(geometry.list.height>100,JSON.stringify(geometry));
        assert.ok(position==='top'?geometry.bar.y<geometry.list.y:geometry.bar.y>geometry.list.y,JSON.stringify(geometry));
        const movement=await page.evaluate(()=>{const bar=document.querySelector('.gift-sticky-bar');const reversed=getComputedStyle(bar).flexDirection==='row-reverse';bar.scrollLeft=0;bar.dispatchEvent(new WheelEvent('wheel',{deltaY:120,bubbles:true,cancelable:true}));return {left:bar.scrollLeft,max:bar.scrollWidth-bar.clientWidth};});
        if(movement.max>0)assert.ok(Math.abs(movement.left)>0,JSON.stringify(movement));
        console.log(theme,position,JSON.stringify({geometry,movement}));
      }
    }
    for (const rate of [1,7]) {
      const message={channel:'bb-laplace',version:1,type:'render',generation:1,sequence:++sequence,events:[event],stickyEvents:[],settings:{baseFontSize:20,colorScheme:'light'},css:compose(document),preview:true,scrollable:true,rate,productElements:{classicScope:false}};
      await page.evaluate(message=>window.__laplaceQA.render(message),message);
      assert.equal(await page.locator('.events-list-wrap').evaluate(n=>n.classList.contains('reduced-motion')),rate>6);
    }
    for (const [width,height] of [[400,800],[800,600]]) {
    await host.locator('iframe').evaluate((node,size)=>{node.width=String(size[0]);node.height=String(size[1]);},[width,height]);
    for (const writingMode of ['horizontal-tb','vertical-rl','vertical-lr']) {
      const message={channel:'bb-laplace',version:1,type:'render',generation:1,sequence:++sequence,events:events.map(e=>({...e,id:writingMode+e.id})),stickyEvents:[],settings:{baseFontSize:20,colorScheme:'light'},css:{cloud:'',remote:'',custom:`.scroll-area{writing-mode:${writingMode}} .scroll-area>div{display:block!important;min-width:100%;} .event{min-block-size:80px}`},preview:true,scrollable:true,contentAlignment:'top',direction:'bottom',rate:0,productElements:{classicScope:false}};
      await page.evaluate(message=>{window.__laplaceQA.render(message);window.__laplaceQA.dispatchControlSerialized(JSON.stringify({channel:'bb-laplace',version:1,type:'control',generation:1,action:'scroll-latest'}));},message);
      await page.waitForTimeout(200);
      const geometry=await page.evaluate(()=>{const node=document.querySelector('.scroll-area');return{mode:getComputedStyle(node).writingMode,left:node.scrollLeft,top:node.scrollTop,width:node.scrollWidth,clientWidth:node.clientWidth,height:node.scrollHeight,clientHeight:node.clientHeight};});
      console.log('flow',writingMode,geometry,await page.evaluate(()=>[...document.querySelectorAll('.scroll-area,[data-radix-scroll-area-viewport]')].map(n=>({tag:n.tagName,cls:n.className,mode:getComputedStyle(n).writingMode,w:n.scrollWidth,c:n.clientWidth,left:n.scrollLeft,overflow:getComputedStyle(n).overflowX}))));
      if(writingMode.startsWith('vertical')) {
        assert.ok(geometry.width>geometry.clientWidth,'竖排必须能够横向溢出');
        assert.ok(Math.abs(geometry.left)>=geometry.width-geometry.clientWidth-2,'竖排新事件应跟随流末端');
      }
      const position = () => page.locator('.scroll-area').evaluate(node => getComputedStyle(node).writingMode.startsWith('vertical') ? Math.abs(node.scrollLeft) : node.scrollTop);
      const latestPosition = await position();
      await page.locator('.scroll-area').hover();
      await host.mouse.wheel(0,-180);
      await page.waitForTimeout(120);
      const readingPosition = await position();
      assert.ok(readingPosition<latestPosition-100,'滚轮可离开最新');
      message.sequence=++sequence;message.events=[...message.events,{...message.events[0],id:writingMode+'-reading-next'}];
      await page.evaluate(message=>window.__laplaceQA.render(message),message);
      await page.waitForTimeout(120);
      assert.ok(Math.abs(await position()-readingPosition)<2,'阅读位置不被新增事件拉回');
      await page.evaluate(()=>window.__laplaceQA.dispatchControlSerialized(JSON.stringify({channel:'bb-laplace',version:1,type:'control',generation:1,action:'scroll-latest'})));
      message.sequence=++sequence;message.events=[...message.events,{...message.events[0],id:writingMode+'-following-next'}];
      await page.evaluate(message=>window.__laplaceQA.render(message),message);
      await page.waitForTimeout(150);
      const distance = await page.locator('.scroll-area').evaluate(node => getComputedStyle(node).writingMode.startsWith('vertical') ? node.scrollWidth-node.clientWidth-Math.abs(node.scrollLeft) : node.scrollHeight-node.clientHeight-node.scrollTop);
      assert.ok(distance<=4,'回到最新后恢复后续入流跟随');
      const maxPosition=await page.locator('.scroll-area').evaluate(node=>getComputedStyle(node).writingMode.startsWith('vertical')?node.scrollWidth-node.clientWidth:node.scrollHeight-node.clientHeight);
      assert.ok(maxPosition>600,'边界核验需要可独立区分首尾预载区的内容');
      for(const position of [249,251,maxPosition-249,maxPosition-251]) {
        await page.locator('.scroll-area').evaluate((node,position)=>{
          const mode=getComputedStyle(node).writingMode;
          if(mode.startsWith('vertical'))node.scrollLeft=position*(mode.endsWith('-rl')?-1:1);else node.scrollTop=position;
        },position);
        await host.waitForFunction(position=>Math.abs((window.flowReports.at(-1)?.scrollTop??-1000)-position)<=1,position);
        const state=await host.evaluate(()=>window.flowReports.at(-1));
        assert.equal(state.nearStart,state.scrollTop<=250,'首端250px补载边界');
        assert.equal(state.nearEnd,state.scrollTop+state.clientHeight>=state.scrollHeight-250,'末端250px补载边界');
      }
    }
    mkdirSync('.superpowers/sdd/laplace-layout-20261105',{recursive:true});
    await host.screenshot({path:`.superpowers/sdd/laplace-layout-20261105/${width}x${height}.png`});
    }
  } finally { await browser?.close(); await vite.close(); }
});
