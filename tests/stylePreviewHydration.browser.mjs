import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage();
const output=process.env.STYLE_ACCEPTANCE_DIR||'.superpowers/sdd/2026-11-01-preview-ipc-completion';
try {
 await page.goto((process.env.STYLE_DESKTOP_URL||'http://127.0.0.1:1437')+'/tests/fixtures/stylePreviewHydration.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.hydrationReady);
 const result=await page.evaluate(async()=>{
  const frames=[];let finished;
  const hydrated=new Promise(resolve=>finished=resolve);
  window.addEventListener('message',e=>{if(e.data?.type!=='bb-blivechat')return;if(e.data.command==='preview-frame')frames.push({at:performance.now(),count:e.data.data.records.length});if(e.data.command==='hydrated')finished(e.data.data)});
  const send=(command,data)=>document.querySelector('iframe').contentWindow.postMessage({type:'bb-blivechat',command,data},location.origin);
  send('preview-observe',true);
  await new Promise(resolve=>setTimeout(resolve,50));
  const records=(await(await fetch('/tests/fixtures/compat/blc-original/original-fixed-batch.json')).json()).events;
  const start=performance.now();send('hydrate',{records});
  const done=await hydrated;
  await new Promise(resolve=>setTimeout(resolve,100));
  return{expected:records.length,done,elapsed:performance.now()-start,frames};
 });
 await fs.writeFile(output+'/hydration-'+(process.env.STYLE_RUN||'result')+'.json',JSON.stringify(result,null,2));
 assert.equal(result.expected,8294);
 assert.equal(result.done.records,result.expected);
 assert(result.frames.some(f=>f.count===result.expected),'完整样例必须发布');
 assert.deepEqual(result.frames.filter(f=>f.count>0&&f.count<result.expected),[],'整批载入不能发布不完整的累积快照');
 console.log('PASS complete source hydration',result.expected,'records',Math.round(result.elapsed),'ms',result.frames.length,'frames');
} finally {await browser.close()}

