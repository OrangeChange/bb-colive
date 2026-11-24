import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const entry = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {VoicePanel} from '/src/components/VoicePanel.tsx';
import {RoomInsightsProvider} from '/src/hooks/useRoomInsights.tsx';
import {voiceController} from '/src/voice/voiceRuntime.ts';
import '/src/App.css';
window.attempts=[];
voiceController.test = text => new Promise((resolve,reject)=>{window.attempts.push(text);window.completeTest=resolve;window.failTest=()=>reject(new Error('连接失败，请检查网络后重试'));});
const root=createRoot(document.getElementById('root'));
root.render(React.createElement(RoomInsightsProvider,null,React.createElement(VoicePanel)));
window.showFlow=async props=>{const {SettingsFlowPreview}=await import('/src/components/SettingsFlowPreview.tsx');root.render(React.createElement(SettingsFlowPreview,props));};
`;
const vite = await createServer({
  server: { port: 1437, strictPort: true, open: false },
  plugins: [{
    name: 'settings-experience-verification',
    resolveId(id) { if (id === 'virtual:settings-verification') return '\0settings-verification'; },
    load(id) { if (id === '\0settings-verification') return entry; },
    configureServer(server) {
      server.middlewares.use('/__settings-verification', async (_req,res) => {
        res.setHeader('Content-Type','text/html; charset=utf-8');
        res.end(await server.transformIndexHtml('/__settings-verification', '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"></head><body><div id="root" style="height:100vh;display:flex"></div><script type="module" src="/@id/virtual:settings-verification"></script></body></html>'));
      });
    },
  }],
});
let browser;
try {
  await vite.listen();
  browser = await chromium.launch({channel:'chrome',headless:true});
  const page = await browser.newPage({viewport:{width:1000,height:950}});
  page.on('pageerror',error=>console.error(error.message));
  page.on('console',message=>{if(message.type()==='error')console.error(message.text());});
  await page.goto('http://localhost:1437/__settings-verification');
  await page.locator('.voice-panel-root').waitFor();
  const text = page.getByRole('textbox',{name:'试听内容',exact:true});
  assert.equal(await text.count(),1,'语音引擎中应有可编辑的试听内容');
  const button = page.locator('.voice-test-panel').getByRole('button',{name:'试听',exact:true});
  await text.fill('   ');await button.click();
  assert.match(await page.locator('.voice-test-panel [role=status]').innerText(),/请输入试听内容/);
  assert.equal(await page.evaluate(()=>window.attempts.length),0);
  await text.fill('你好，直播间。');await button.click();
  assert.equal(await button.isDisabled(),true);
  assert.equal(await page.getByRole('radiogroup',{name:'语音引擎',exact:true}).getByRole('radio').first().isDisabled(),true,'试听期间不能切换引擎');
  assert.equal(await page.evaluate(()=>window.attempts.length),1);
  assert.doesNotMatch(await page.locator('.voice-test-panel [role=status]').innerText(),/完成/);
  await page.evaluate(()=>window.failTest());
  await page.waitForFunction(()=>document.querySelector('.voice-test-panel [role=status]').textContent.includes('连接失败'));
  assert.equal(await page.getByRole('radiogroup',{name:'语音引擎',exact:true}).getByRole('radio').first().isDisabled(),false);
  assert.equal(await text.inputValue(),'你好，直播间。');
  await button.click();assert.equal(await page.evaluate(()=>window.attempts.length),2);
  await page.evaluate(()=>window.completeTest());
  await page.waitForFunction(()=>document.querySelector('.voice-test-panel [role=status]').textContent.includes('试听已结束'));
  assert.doesNotMatch(await page.locator('.voice-test-panel [role=status]').innerText(),/成功|完成/,'控制器返回时不把可能的音频中断宣称为成功完成');
  assert.equal(await page.getByRole('radiogroup',{name:'语音引擎',exact:true}).getByRole('radio').first().isDisabled(),false);
  for (const width of [320,400,1200]) {
    await page.setViewportSize({width,height:950});
    await page.evaluate(()=>document.documentElement.style.zoom='1.25');
    const overflow=await page.locator('.voice-test-panel').evaluate(el=>el.scrollWidth>el.clientWidth+1);
    assert.equal(overflow,false,`试听区在 ${width}px/125% 不应横向溢出`);
  }
  await page.evaluate(()=>document.documentElement.style.zoom='1');
  for(const alignment of ['top','bottom']) for(const direction of ['top','bottom']) {
    await page.evaluate(args=>window.showFlow(args),{alignment,direction,preset:'fade',duration:5000});
    await page.waitForFunction(({alignment,direction})=>{
      const box=document.querySelector('.settings-flow-preview-events');
      if(!box || box.dataset.alignment!==alignment)return false;
      return (direction==='top'?box.firstElementChild:box.lastElementChild).textContent.includes('小橙子');
    },{alignment,direction});
  }
  for(const preset of ['fade','lift','scale','slide']) {
    await page.evaluate(args=>window.showFlow(args),{alignment:'top',direction:'top',preset,duration:5000});
    await page.waitForTimeout(50);await page.getByRole('button',{name:'试播动画'}).click();
    const frames=await page.locator('.settings-flow-preview-events').evaluate(el=>el.getAnimations({subtree:true}).map(a=>({duration:a.effect.getTiming().duration,frames:a.effect.getKeyframes()})));
    assert.equal(frames.length,1);assert.equal(frames[0].duration,5000);assert.equal(frames[0].frames[0].opacity,'0');
  }
  for(const [preset,duration] of [['none',200],['fade',0]]) {
    await page.evaluate(args=>window.showFlow(args),{alignment:'top',direction:'top',preset,duration});
    await page.waitForTimeout(50);assert.equal(await page.getByRole('button',{name:'试播动画'}).isDisabled(),true);
    assert.equal(await page.evaluate(()=>document.getAnimations().length),0);
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(args=>window.showFlow(args),{alignment:'top',direction:'top',preset:'slide',duration:5000});
  await page.waitForTimeout(50);await page.getByRole('button',{name:'试播动画'}).click();
  assert.equal(await page.evaluate(()=>document.getAnimations().length),0);
  await page.evaluate(args=>window.showFlow(args),{direction:'top',preset:'fade',duration:200});
  await page.waitForFunction(()=>document.querySelector('.settings-flow-preview')?.textContent.includes('选择内容对齐'));
  assert.equal(await page.getByRole('button',{name:'试播动画'}).isDisabled(),true);
  console.log('试听输入、忙碌反馈、失败重试、窄宽布局、四种排列、全部动画与减少动效通过');
} finally {await browser?.close();await vite.close();}
