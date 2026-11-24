import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

test('主题导入支持 ZIP 多选、CSS 单选与忙碌状态，窄窗口操作区始终可见', async () => {
  const source = `import React from 'react';import {createRoot} from 'react-dom/client';import {ThemeImportDialog} from './src/components/ThemeImportDialog.tsx';import './src/components/themeWorkspace.css';
  window.audit={calls:[],closed:false,files:['C:/fixtures/主题甲.zip','C:/fixtures/主题乙.zip']};
  window.__TAURI_INTERNALS__={invoke:async(command,args)=>{audit.calls.push({command,args});return audit.files}};
  createRoot(document.getElementById('root')).render(React.createElement(ThemeImportDialog,{onClose:()=>audit.closed=true,onTheme:async paths=>{audit.paths=paths;if(audit.pending)await new Promise(r=>audit.release=r);if(audit.fail)throw Error('无法导入，请检查文件后重试。')},onCss:async(...args)=>audit.css=args,onUrl:url=>audit.url=url}));`;
  const output = await build({ stdin: { contents: source, resolveDir: process.cwd(), loader: 'jsx' }, bundle: true, write: false, outfile: 'theme-import.js', define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent' });
  const js = output.outputFiles.find(file=>file.path.endsWith('.js')).text;
  const css = output.outputFiles.find(file=>file.path.endsWith('.css')).text;
  const server = http.createServer((request,response)=>{
    response.setHeader('Content-Type',request.url==='/app.js'?'application/javascript':request.url==='/app.css'?'text/css':'text/html');
    response.end(request.url==='/app.js'?js:request.url==='/app.css'?css:'<!doctype html><html><head><link rel="stylesheet" href="/app.css"><style>*{box-sizing:border-box}body{margin:0;font-family:sans-serif;--color-bg:#fff;--color-surface:#eee;--color-line:#aaa;--color-t1:#111;--color-accent:teal}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
    const page = await browser.newPage(); page.setDefaultTimeout(10000);
    const url = `http://127.0.0.1:${server.address().port}/`;
    for(const viewport of [{width:1200,height:800},{width:520,height:480},{width:360,height:480}]) {
      await page.setViewportSize(viewport);await page.goto(url);
      await page.getByRole('radio',{name:'LAPLACE',exact:true}).check();
      await page.getByRole('radio',{name:'远程 URL',exact:true}).check();
      await page.getByLabel('CSS 网址').fill('https://example.com/theme.css');
      const geometry=await page.evaluate(()=>{const panel=document.querySelector('.theme-transfer-panel'),body=panel.querySelector('.theme-transfer-body'),footer=panel.querySelector('footer');return {panel:panel.getBoundingClientRect().toJSON(),footer:footer.getBoundingClientRect().toJSON(),scroll:body.scrollHeight,client:body.clientHeight,overflow:document.documentElement.scrollWidth>innerWidth}});
      assert.equal(geometry.overflow,false);assert.ok(geometry.panel.y>=0);assert.ok(geometry.footer.bottom<=viewport.height);if(viewport.height===480)assert.ok(geometry.scroll>geometry.client);
      await page.getByRole('button',{name:'加载预览',exact:true}).click();assert.equal(await page.evaluate(()=>audit.url),'https://example.com/theme.css');
    }
    await page.goto(url);await page.getByRole('button',{name:'选择文件',exact:true}).click();
    assert.equal(await page.evaluate(()=>audit.calls.at(-1).args.options.multiple),true);
    await page.evaluate(()=>{audit.pending=true;audit.fail=true});await page.getByRole('button',{name:'导入',exact:true}).click();
    await page.waitForFunction(()=>!!audit.release);await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>audit.closed),false);
    assert.equal(await page.getByRole('button',{name:'正在导入',exact:true}).isDisabled(),true);
    assert.deepEqual(await page.evaluate(()=>audit.paths),['C:/fixtures/主题甲.zip','C:/fixtures/主题乙.zip']);
    await page.evaluate(()=>audit.release());await page.getByRole('alert').waitFor();assert.equal(await page.evaluate(()=>audit.closed),false);await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>audit.closed),true);
    await page.goto(url);await page.getByRole('radio',{name:'原生 CSS',exact:true}).check();await page.evaluate(()=>audit.files='C:/fixtures/原生.css');await page.getByRole('button',{name:'选择文件',exact:true}).click();assert.equal(await page.evaluate(()=>audit.calls.at(-1).args.options.multiple),false);await page.getByRole('button',{name:'导入',exact:true}).click();assert.deepEqual((await page.evaluate(()=>audit.css)).slice(0,3),['native','C:/fixtures/原生.css','原生']);
  } finally { await browser?.close(); await new Promise(resolve=>server.close(resolve)); }
});
