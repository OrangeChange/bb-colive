import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
const entry = `import React from 'react';
import {createRoot} from 'react-dom/client';
import '/src/App.css';
import {LiveFilterBar} from '/src/components/LiveFilterBar';
import {StatusBar} from '/src/components/StatusBar';
import {DEFAULT_EVENT_FILTERS} from '/src/events/eventView';
createRoot(document.getElementById('root')).render(<><LiveFilterBar filters={DEFAULT_EVENT_FILTERS} setFilters={()=>{}} giftThreshold={0} giftThresholdMode="unit" setGiftThreshold={()=>{}} query={{}} onSearchTextChange={()=>{}} layoutMode="dual" onLayoutChange={()=>{}} onClearQuery={()=>{}}/><StatusBar/></>);`;
const server = await createServer({server:{port:19873,host:'127.0.0.1'}, plugins:[{
  name:'workspace-layout-fixture',
  enforce:'pre',
  resolveId(id, importer) {
    if (id === '/workspace-layout.tsx') return `${process.cwd().replaceAll('\\','/')}/tests/fixtures/workspace-layout.tsx`;
    if (id.includes('useRoomInsights') && importer?.endsWith('RoomOverviewBar.tsx')) return '\0fixture-insights';
    if (id === '../stores/connection' && importer?.endsWith('StatusBar.tsx')) return '\0fixture-connection';
  },
  load(id) {
    if (id.endsWith('/tests/fixtures/workspace-layout.tsx')) return entry;
    if (id === '\0fixture-insights') return `export const useRoomInsights=()=>({roomId:1,stats:{},overview:{data:{watched:1234567,likes:1234567,fansClub:1234567,guards:1234567},dataUpdatedAt:1},guardFirst:{},viewers:{text:'1,234,567'},timing:{startedAt:1000},enabled:true,observedAt:7201000,refreshOverview(){}});`;
    if (id === '\0fixture-connection') return 'export const useConnection = selector=>selector({listCount:123456,events:[]});';
  },
  configureServer(server) {
    server.middlewares.use(async (req,res,next)=>{
      if(req.url==='/workspace-layout.html') {
        res.setHeader('Content-Type','text/html');
        res.end(await server.transformIndexHtml(req.url,'<html><head><link rel="icon" href="data:,"></head><body><div id="root"></div><script type="module" src="/workspace-layout.tsx"></script></body></html>')); return;
      }
      next();
    });
  },
}]});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({headless:true,channel:'chrome'});
  const page=await browser.newPage();
  const errors=[];
  page.on('pageerror',e=>{errors.push(e.message); console.error(e.message);});
  page.on('console',message=>{if(message.type()==='error') console.error(message.text());});
  for(const width of [960,768,640,480]) {
    await page.setViewportSize({width,height:600});
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/workspace-layout.html`);
    await page.getByRole('button',{name:'弹幕',exact:true}).waitFor();
    const geometry=await page.evaluate(()=>{
      const toolbar=document.querySelector('[data-scene-toolbar]');
      const buttons=[...toolbar.querySelector('[aria-label="现场筛选"]').children].map(e=>e.getBoundingClientRect());
      const scroll=document.querySelector('.status-bar-overview');
      scroll.scrollLeft=scroll.scrollWidth;
      const duration=[...scroll.querySelectorAll('dt')].find(e=>e.textContent==='时长').parentElement.getBoundingClientRect();
      const region=scroll.getBoundingClientRect();
      return {heights:buttons.map(r=>r.height),tops:buttons.map(r=>r.top),overflow:document.documentElement.scrollWidth>innerWidth,durationVisible:duration.left>=region.left-1&&duration.right<=region.right+1,summary:scroll.firstElementChild.title};
    });
    assert.ok(geometry.heights.every(h=>h===32),JSON.stringify({width,...geometry}));
    assert.equal(new Set(geometry.tops).size,1,`宽度${width}筛选按钮应在同一行`);
    assert.equal(geometry.overflow,false,`宽度${width}不应撑出页面`);
    assert.equal(geometry.durationVisible,true,`宽度${width}可滚动查看完整时长`);
    assert.match(geometry.summary,/时长/);
  }
  assert.deepEqual(errors,[]);
  console.log('现场筛选480/640/768/960px与底栏完整概览通过');
} finally {
  await browser?.close();
  await server.close();
}
