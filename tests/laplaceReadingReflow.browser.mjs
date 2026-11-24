import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {build}=require('esbuild');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');

for(const nativePromise of [true,false])test(`LAPLACE 迟到的图片尺寸在滚动结束后补偿（${nativePromise?'原生完成通知':'旧版内核'}）`,async()=>{
  const bundle=await build({entryPoints:['src/compat/laplace/renderer/layoutFollowing.ts'],bundle:true,write:false,format:'iife',globalName:'layoutFollowing',platform:'browser'});
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{
    const page=await browser.newPage();
    await page.setContent('<div id="viewport" style="height:200px;overflow:auto;overflow-anchor:none"><div id="content" style="height:600px"></div></div>');
    await page.addScriptTag({content:bundle.outputFiles[0].text});
    await page.evaluate(nativePromise=>{const n=document.getElementById('viewport');n.scrollTop=400;window.calls=[];const scroll=n.scrollTo.bind(n);n.scrollTo=x=>{calls.push(x);const result=scroll(x);return nativePromise?result:undefined};if(!nativePromise){const add=n.addEventListener.bind(n);n.addEventListener=(type,...args)=>{if(type!=='scrollend')add(type,...args)}}window.follower=layoutFollowing.attachLaplaceLayoutFollowing(n);},nativePromise);
    await page.waitForTimeout(60);
    await page.evaluate(()=>{document.getElementById('content').style.height='1000px';follower.scrollToEnd('smooth');});
    await page.waitForFunction(()=>{const y=document.getElementById('viewport').scrollTop;return y>400&&y<650;});
    await page.evaluate(()=>document.getElementById('content').style.height='1200px');
    await page.waitForTimeout(45);
    assert.equal(await page.evaluate(()=>calls.length),1,'图片尺寸通知不能重新启动滚动');
    await page.waitForFunction(()=>Math.abs(document.getElementById('viewport').scrollTop-1000)<=1);
    assert.deepEqual(await page.evaluate(()=>calls.map(x=>x.behavior)),['smooth','auto']);
    await page.evaluate(()=>follower.dispose());
  }finally{await browser.close();}
});

test('LAPLACE 竖排事件沿横向直接平滑跟随',async()=>{
  const bundle=await build({entryPoints:['src/compat/laplace/renderer/layoutFollowing.ts'],bundle:true,write:false,format:'iife',globalName:'layoutFollowing',platform:'browser'});
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{
    const page=await browser.newPage();await page.setContent('<div id="viewport" style="width:200px;height:200px;overflow:auto;writing-mode:vertical-rl"><div id="content"></div></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});
    await page.evaluate(()=>{document.getElementById('content').innerHTML=Array.from({length:20},(_,i)=>`<div data-event-id="${i}" style="width:40px;height:180px">正文</div>`).join('');window.follower=layoutFollowing.attachLaplaceLayoutFollowing(document.getElementById('viewport'));follower.scrollToEnd();});
    await page.waitForFunction(()=>document.getElementById('viewport').scrollLeft<0);
    const result=await page.evaluate(()=>{const node=document.getElementById('viewport');window.calls=[];const scroll=node.scrollTo.bind(node);node.scrollTo=x=>{calls.push(x);return scroll(x)};document.getElementById('content').insertAdjacentHTML('beforeend','<div data-event-id="new" style="width:40px;height:180px">新事件</div>');follower.followEvents('smooth');return calls});
    assert.equal(result.length,1);assert.equal(result[0].behavior,'smooth');assert.ok(result[0].left<0);assert.equal(result[0].top,undefined);
    await page.waitForFunction(()=>{const node=document.getElementById('viewport');return Math.abs(-node.scrollLeft-(node.scrollWidth-node.clientWidth))<=2});
    await page.evaluate(()=>follower.dispose());
  }finally{await browser.close();}
});

test('LAPLACE 平滑跟随不会被同一目标的布局通知打断，手动阅读仍可停止跟随',async()=>{
  const bundle=await build({entryPoints:['src/compat/laplace/renderer/layoutFollowing.ts'],bundle:true,write:false,format:'iife',globalName:'layoutFollowing',platform:'browser'});
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{
    const page=await browser.newPage();
    await page.setContent('<div id="viewport" style="height:200px;overflow:auto"><div id="content" style="height:600px"></div></div>');
    await page.addScriptTag({content:bundle.outputFiles[0].text});
    await page.evaluate(()=>{
      const node=document.getElementById('viewport');node.scrollTop=400;
      window.calls=[];const scroll=node.scrollTo.bind(node);node.scrollTo=options=>{calls.push(options);scroll(options)};
      window.follower=layoutFollowing.attachLaplaceLayoutFollowing(node);
    });
    await page.waitForTimeout(60);
    await page.evaluate(()=>{document.getElementById('content').style.height='1000px';follower.scrollToEnd('smooth');});
    await page.waitForFunction(()=>{const top=document.getElementById('viewport').scrollTop;return top>400&&top<800;});
    const middle=await page.evaluate(()=>({top:document.getElementById('viewport').scrollTop,calls}));
    assert.ok(middle.top>400&&middle.top<800,JSON.stringify(middle));
    assert.ok(middle.calls.every(call=>call.behavior==='smooth'),JSON.stringify(middle));
    assert.equal(middle.calls.length,1,'相同目标不能重复启动滚动');
    await page.waitForTimeout(650);
    assert.equal(await page.evaluate(()=>document.getElementById('viewport').scrollTop),800);
    await page.evaluate(()=>{const n=document.getElementById('viewport');n.dispatchEvent(new WheelEvent('wheel',{deltaY:-100}));n.scrollTop=500;document.getElementById('content').style.height='1200px';});
    await page.waitForTimeout(120);
    assert.equal(await page.evaluate(()=>document.getElementById('viewport').scrollTop),500);
    await page.evaluate(()=>follower.dispose());
  }finally{await browser.close();}
});

test('LAPLACE 行高缩小至尾部不足一屏时保留阅读位置，回到最新后释放留白',async()=>{
  const bundle=await build({entryPoints:['src/compat/laplace/renderer/layoutFollowing.ts'],bundle:true,write:false,format:'iife',globalName:'layoutFollowing',platform:'browser'});
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:640,height:900}});
    await page.setContent('<div id="viewport" style="height:800px;overflow:auto"><div id="content"></div></div>');
    await page.addScriptTag({content:bundle.outputFiles[0].text});
    await page.evaluate(()=>{const n=document.getElementById('viewport');document.getElementById('content').innerHTML=Array.from({length:100},(_,i)=>`<div data-event-id="${i}" style="height:65px">消息 ${i}</div>`).join('');window.follower=layoutFollowing.attachLaplaceLayoutFollowing(n);follower.scrollToEnd();});
    await page.mouse.move(300,400);await page.mouse.wheel(0,-220);await page.waitForTimeout(150);
    const before=await page.evaluate(()=>{const n=document.getElementById('viewport'),top=n.getBoundingClientRect().top;const row=[...n.querySelectorAll('[data-event-id]')].find(r=>r.getBoundingClientRect().bottom>top);window.anchor=row;return{offset:row.getBoundingClientRect().top-top,id:row.dataset.eventId};});
    await page.evaluate(()=>document.querySelectorAll('[data-event-id]').forEach(n=>n.style.height='35px'));await page.waitForTimeout(200);
    const after=await page.evaluate(()=>{const n=document.getElementById('viewport');return{offset:anchor.getBoundingClientRect().top-n.getBoundingClientRect().top,padding:parseFloat(n.firstElementChild.style.paddingBottom)};});
    assert.ok(Math.abs(after.offset-before.offset)<=2,JSON.stringify({before,after}));assert.ok(after.padding>0);
    await page.evaluate(()=>follower.scrollToEnd());await page.waitForTimeout(100);
    const latest=await page.evaluate(()=>{const n=document.getElementById('viewport');return{padding:n.firstElementChild.style.paddingBottom,distance:n.scrollHeight-n.clientHeight-n.scrollTop};});
    assert.equal(latest.padding,'');assert.ok(latest.distance<=2);await page.evaluate(()=>follower.dispose());
  }finally{await browser.close();}
});

test('LAPLACE 定长队列替换时保留阅读锚点，移出队列后选择相邻消息',async()=>{
  const bundle=await build({entryPoints:['src/compat/laplace/renderer/layoutFollowing.ts'],bundle:true,write:false,format:'iife',globalName:'layoutFollowing',platform:'browser'});
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try {
    const page=await browser.newPage();
    await page.setContent('<div id="viewport" style="height:200px;overflow:auto;overflow-anchor:none"><div id="content"></div></div>');
    await page.addScriptTag({content:bundle.outputFiles[0].text});
    await page.evaluate(()=>{const n=document.getElementById('viewport');content.innerHTML=Array.from({length:50},(_,i)=>`<div data-event-id="${i}" style="height:40px">${i}</div>`).join('');n.scrollTop=400;window.follower=layoutFollowing.attachLaplaceLayoutFollowing(n,undefined,()=>false);follower.rememberReadingPosition();});
    await page.waitForTimeout(80);
    const before=await page.evaluate(()=>document.querySelector('[data-event-id="10"]').getBoundingClientRect().top);
    await page.evaluate(()=>{content.firstElementChild.remove();content.insertAdjacentHTML('beforeend','<div data-event-id="50" style="height:40px">50</div>');});
    await page.waitForTimeout(100);
    assert.ok(Math.abs(await page.evaluate(()=>document.querySelector('[data-event-id="10"]').getBoundingClientRect().top)-before)<=2);
    await page.evaluate(()=>document.querySelectorAll('[data-event-id]').forEach(n=>{if(Number(n.dataset.eventId)<=10)n.remove()}));
    await page.waitForTimeout(100);
    assert.ok(Math.abs(await page.evaluate(()=>document.querySelector('[data-event-id="11"]').getBoundingClientRect().top)-before)<=2);
    await page.evaluate(()=>follower.dispose());
  }finally{await browser.close()}
});
