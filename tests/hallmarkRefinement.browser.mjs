import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');

test('图标回退、导入预览与键盘焦点在深浅色和窄面板中保持可用', async () => {
  const source = `import React from 'react';import {createRoot} from 'react-dom/client';
    import {UserAvatar} from './src/components/UserAvatar.tsx';
    import {EventRow,GiftIcon} from './src/components/EventRow.tsx';import {MsgType} from './src/protocol/types.ts';
    import {UiSelect} from './src/components/ui/Select.tsx';
    import {UiCombobox} from './src/components/ui/Combobox.tsx';
    import {ReviewArchiveSettings} from './src/components/ReviewArchiveSettings.tsx';
    import {ReviewArchiveManagement} from './src/components/ReviewArchiveManagement.tsx';
    import {ArchiveTransferService} from './src/archive/archiveTransfer.ts';
    import {DEFAULT_EVENT_DISPLAY_PREFERENCES} from './src/eventDisplaySettings.ts';
    import {getNativeEventSample} from './tests/fixtures/nativeEventSamples.ts';
    const owner={ownerId:'room:100',roomId:100,uid:'100',name:'验收主播',createdAt:1,updatedAt:1};
    const repository={getHealthSnapshot:async()=>({available:true,bytes:4096,ownerCount:1,sessionCount:0,eventCount:123456789,favoriteCount:3}),listOwners:async()=>[],getTransferSnapshot:async()=>({owners:[owner],sessions:[],nicknames:[],historicalFavorites:[]}),getSession:async()=>null,getEvent:async()=>null};
    window.audit={plays:0,reads:0};
    const bundle=await new ArchiveTransferService({repository}).exportArchiveText({kind:'all'});
    window.__TAURI_INTERNALS__={invoke:async(command)=>{if(command==='plugin:dialog|open')return 'fixture.json';if(command==='read_archive_transfer'){audit.reads++;return bundle;}if(command==='plugin:store|load')return 1;if(command==='plugin:store|get')return [null,false];return null;}};
    const gift=getNativeEventSample('normal-gift');gift.gift={name:'回退礼物',webp:'/missing-gift.webp',price:1000};
    const like={...getNativeEventSample('text'),msgType:MsgType.Interact,text:'为主播点赞了'};
    const preferences={...DEFAULT_EVENT_DISPLAY_PREFERENCES,showEventIcon:true};
    function Fixture(){const[value,setValue]=React.useState('a');return <main>
      <section id="controls"><UiSelect ariaLabel="验收选择" value={value} options={[{value:'a',label:'选项甲'},{value:'b',label:'选项乙'}]} onValueChange={setValue}/><UiCombobox id="query" ariaLabel="验收搜索" value="" options={[]} onValueChange={()=>{}}/><input aria-label="验收设置" className="settings-control-surface" /></section>
      <section id="avatar"><UserAvatar user={{avatar:'/missing-avatar.png'}} size={24}/></section>
      <section id="gift"><GiftIcon gift={gift.gift} allowManualRetry/><GiftIcon gift={gift.gift} onPlayEffect={()=>audit.plays++}/></section>
      <section id="like"><EventRow ev={like} showTime={false} displayPreferences={preferences}/></section>
      <section id="settings"><ReviewArchiveSettings repository={repository} retentionDays={30} onRetentionDaysChange={()=>{}} onChanged={()=>{}}/></section>
      <section id="management"><ReviewArchiveManagement repository={repository} owner={owner} ownerId={owner.ownerId} sessions={[]} onChanged={()=>{}}/></section>
    </main>};createRoot(document.getElementById('root')).render(<Fixture/>);`;
  const output = await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,format:'esm',loader:{'.png':'dataurl','.webp':'dataurl'},outfile:'refinement.js',define:{'process.env.NODE_ENV':'"production"','import.meta.env.DEV':'false','import.meta.env.PROD':'true','import.meta.env.MODE':'"test"'},logLevel:'silent'});
  const js = output.outputFiles.find(f=>f.path.endsWith('.js')).text;
  const css = fs.readdirSync('dist/assets').filter(f=>f.endsWith('.css')).map(f=>fs.readFileSync('dist/assets/'+f,'utf8')).join('\n');
  const server=http.createServer((req,res)=>{
    if(req.url.startsWith('/missing') || req.url.includes('noface') || req.url.includes('gift-fallback')){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',req.url==='/app.js'?'application/javascript':req.url==='/app.css'?'text/css':'text/html');
    res.end(req.url==='/app.js'?js:req.url==='/app.css'?css:'<!doctype html><html lang="zh-CN"><head><link rel="stylesheet" href="/app.css"><style>body{margin:0;overflow:auto!important}main{padding:16px;background:var(--bg);color:var(--text-1)}section{margin-bottom:16px}#controls{display:flex;gap:8px}#controls>*{min-width:0}#settings,#management{max-width:400px}</style></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
    const page=await browser.newPage();page.setDefaultTimeout(10000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.locator('#avatar').getByRole('img',{name:'头像不可用'}).waitFor();
    assert.equal(await page.locator('#avatar svg').count(),1);
    const retry=page.getByRole('button',{name:'重新加载礼物图标'});
    await retry.waitFor();assert.equal(await retry.locator('svg').count(),1);
    await retry.click();await retry.waitFor();
    await page.getByRole('button',{name:'播放回退礼物特效',exact:true}).click();
    assert.equal(await page.evaluate(()=>audit.plays),1);
    const before=await page.evaluate(()=>audit.reads);
    await page.locator('#settings').getByRole('button',{name:'导入档案',exact:true}).click();
    await page.locator('#settings .archive-summary').filter({hasText:'新增事件'}).waitFor();
    await page.locator('#management').getByRole('button',{name:'导入主播档案',exact:true}).click();
    await page.locator('#management .archive-summary').waitFor();
    assert.equal(await page.evaluate(()=>audit.reads),before+2);
    for(const id of ['settings','management']) {
      const summary=page.locator('#'+id+' .archive-summary').filter({hasText:'新增事件'});
      assert.deepEqual(await summary.locator('dt').allTextContents(),['主播','场次','新增事件','跳过事件','冲突事件','补全字段']);
      assert.equal(await summary.locator('dd').first().innerText(),'1 位');
    }
    for(const dark of [false,true]) for(const width of [960,360]) {
      await page.setViewportSize({width,height:900});
      await page.evaluate(dark=>document.documentElement.classList.toggle('dark',dark),dark);
      for(const label of ['验收选择','验收搜索','验收设置']) {
        const control=page.getByRole(label==='验收设置'?'textbox':'combobox',{name:label,exact:true});
        await page.keyboard.press('Tab');await control.focus();
        const focus=await control.evaluate(el=>({shadow:getComputedStyle(el).boxShadow,transitions:getComputedStyle(el).transitionProperty}));
        assert.notEqual(focus.shadow,'none',label);assert.ok(!focus.transitions.includes('box-shadow'));
      }
      const overflowing=await page.locator('.archive-summary > div').evaluateAll(items=>items.some(item=>{const r=item.getBoundingClientRect(),p=item.closest('.archive-summary').getBoundingClientRect();return r.right>p.right+1||r.left<p.left-1;}));
      assert.equal(overflowing,false);
      fs.mkdirSync('.hallmark/refinement',{recursive:true});
      await page.screenshot({path:'.hallmark/refinement/'+(dark?'dark':'light')+'-'+width+'.png',fullPage:true});
    }
    assert.deepEqual(errors,[]);
  } finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
