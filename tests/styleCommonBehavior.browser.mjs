import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.STYLE_COMMON_URL || 'http://127.0.0.1:1442';
const output = process.env.STYLE_COMMON_OUT || '.superpowers/sdd/2026-11-01-style-common-behavior';
const group = process.env.STYLE_COMMON_GROUP || 'positions';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
const modes = (process.env.STYLE_COMMON_MODES || 'native,blivechat,blivechat-open,laplace').split(',');
await fs.mkdir(output, { recursive: true });
async function open(mode, target, options = {}) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  page.setDefaultTimeout(8000);
  const params = new URLSearchParams({ mode, target, ...options });
  await page.goto(`${base}/tests/fixtures/styleCommonBehavior.html?${params}`, { waitUntil: 'domcontentloaded' });
  await page.getByText('追加事件', { exact: true }).waitFor();
  return page;
}
async function rows(page, mode) {
  if (mode === 'native') return page.locator('.event-row');
  await page.locator('iframe').waitFor();
  const frame = await page.locator('iframe').elementHandle().then(element => element.contentFrame());
  return frame.locator(mode === 'laplace' ? '.event-list .event' : mode === 'blivechat-open' ? '#chat-items > [data-compatible-event-id]' : '#items > [data-compatible-event-id]');
}
async function sample(locator) {
  return locator.evaluateAll(nodes => nodes.map(node => {
    const style = getComputedStyle(node), rect = node.getBoundingClientRect();
    return { text: node.textContent, y: rect.y, bottom: rect.bottom, height: rect.height,
      opacity: Number(style.opacity), transform: style.transform, translate: style.translate,
      scale: style.scale, duration: parseFloat(style.transitionDuration) * 1000,
      visibility: style.visibility, animation: style.animationName };
  }));
}
try {
  if(group==='followingchanges')for(const mode of modes)for(const target of ['live','obs','display','gift'])for(const direction of ['top','bottom']){
    const windowTarget=target==='display'||target==='gift';const page=windowTarget?await browser.newPage({viewport:{width:400,height:500}}):await open(mode,target,{direction,animation:'none'});
    try{
      if(windowTarget){await page.goto(`http://127.0.0.1:1444/tests/fixtures/styleCommonWindow.html?${new URLSearchParams({mode,kind:target,direction,animation:'none'})}`,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent==='追加事件');return b&&!b.disabled})}
      await page.evaluate(()=>{for(let i=0;i<50;i++)[...document.querySelectorAll('button')].find(b=>b.textContent==='追加事件').click()});const list=await rows(page,mode);await list.first().waitFor();await page.waitForTimeout(250);
      await page.getByText('切换最新位置',{exact:true}).click();await page.waitForTimeout(250);for(let i=0;i<3;i++)await page.getByText('追加事件',{exact:true}).click();await page.waitForTimeout(200);
      const frame=mode==='native'?page:await(await page.locator('iframe').elementHandle()).contentFrame();const scroller=frame.locator(mode==='native'?(windowTarget?'[aria-live="polite"]':target==='live'?'.scene-live-list':'.obs-native-root > .event-list'):mode==='laplace'?'.scroll-area':'#item-scroller');
      const actual=await scroller.evaluate(n=>({top:n.scrollTop,max:n.scrollHeight-n.clientHeight}));assert.ok(Math.abs(actual.top-(direction==='top'?actual.max:0))<=4,JSON.stringify({mode,target,direction,actual}));
      results.push({mode,target,direction,...actual});console.log('PASS following change',mode,target,direction);
    }finally{await page.close();}
  }
  if(group==='windowexits')for(const mode of modes)for(const kind of ['display','gift','gift-only','superchat','guard'])for(const animation of ['none','fade']){
    const page=await browser.newPage({viewport:{width:400,height:500}});page.setDefaultTimeout(8000);
    try{
      await page.goto(`http://127.0.0.1:1444/tests/fixtures/styleCommonWindow.html?${new URLSearchParams({mode,kind,animation:'none',capacity:'1'})}`,{waitUntil:'domcontentloaded'});
      await page.getByText('追加事件',{exact:true}).click();const list=await rows(page,mode);await list.first().waitFor();
      await page.evaluate(async({kind,animation})=>{const {nativeEventBrowserPorts:ports}=await import('/tests/helpers/nativeEventBrowserPorts.ts');const {DEFAULT_EVENT_WINDOW_PREFERENCES:p,EVENT_WINDOW_PREFERENCES_EVENT:name}=await import('/src/windows/eventWindowPreferences.ts');await ports.emitTo(kind,name,{...p,capacity:1,display:{...p.display,eventAnimationPreset:animation,eventAnimationDurationMs:800}})},{kind,animation});
      await page.waitForTimeout(100);await page.getByText('追加事件',{exact:true}).click();
      const old=list.filter({hasText:'验收用户 1'});let exiting;
      if(animation==='fade'){await page.waitForTimeout(70);exiting=(await sample(old))[0];assert.ok(exiting&&exiting.opacity<1,JSON.stringify({mode,kind,exiting}));assert.equal(exiting.duration,800);}
      await old.waitFor({state:'detached'});assert.equal(await list.count(),1);
      results.push({mode,kind,animation,exiting,removed:true});console.log('PASS window exit',mode,kind,animation);
    }finally{await page.close();}
  }
  if(group==='obssettings'){
    const page=await browser.newPage({viewport:{width:400,height:600}});page.setDefaultTimeout(8000);
    try{
      await page.goto(`${base}/tests/fixtures/obsServiceSettings.html`,{waitUntil:'domcontentloaded'});
      const toggle=page.getByRole('switch',{name:'OBS 礼物特效',exact:true});await toggle.click();
      await page.reload({waitUntil:'domcontentloaded'});await toggle.waitFor();assert.equal(await toggle.getAttribute('aria-checked'),'true');
      await page.getByRole('button',{name:'恢复默认',exact:true}).click();
      const actual=JSON.parse(await page.locator('output').textContent());assert.deepEqual(actual,{obs:false,live:true,window:true});
      await page.screenshot({path:`${output}/obs-settings.png`});results.push(actual);console.log('PASS OBS independent setting persistence and reset');
    }finally{await page.close();}
  }
  if(group==='windowanimations')for(const mode of modes)for(const kind of ['display','gift','gift-only','superchat','guard'])for(const animation of ['none','fade','lift','scale','slide'])for(const duration of ['200','800']){
    const page=await browser.newPage({viewport:{width:400,height:500}});page.setDefaultTimeout(8000);
    try{
      await page.goto(`http://127.0.0.1:1444/tests/fixtures/styleCommonWindow.html?${new URLSearchParams({mode,kind,animation,duration})}`,{waitUntil:'domcontentloaded'});
      await page.getByText('追加事件',{exact:true}).click();const list=await rows(page,mode);await list.first().waitFor();await page.waitForTimeout(50);
      const entering=(await sample(list))[0];assert.equal(entering.duration,animation==='none'?0:Number(duration));if(animation!=='none')assert.ok(entering.opacity<1,JSON.stringify({mode,kind,animation,duration,entering}));
      await page.waitForTimeout(Number(duration)+50);assert.equal((await sample(list))[0].opacity,1);
      results.push({mode,kind,animation,duration,entering});console.log('PASS window animation',mode,kind,animation,duration);
    }finally{await page.close();}
  }
  if(group==='timing')for(const mode of modes)for(const target of ['live','obs']){
    const page=await open(mode,target,{animation:'none'});
    try{
      await page.getByText('追加事件',{exact:true}).click();const list=await rows(page,mode);await list.first().waitFor();
      const elapsed=[];
      for(let n=2;n<=11;n++){
        const start=await page.evaluate(()=>{const t=Date.now();[...document.querySelectorAll('button')].find(b=>b.textContent==='追加事件').click();return t});
        await page.waitForFunction(value=>{const d=document.querySelector('iframe')?.contentDocument??document;return [...d.querySelectorAll('.event-row,#items>[data-compatible-event-id],#chat-items>[data-compatible-event-id],.event-list .event')].some(r=>r.textContent.includes(`事件 ${value}`))},n,{polling:10});
        elapsed.push(await page.evaluate(t=>Date.now()-t,start));
      }
      const sorted=[...elapsed].sort((a,b)=>a-b),p95=sorted[Math.ceil(sorted.length*.95)-1];assert.ok(p95<=250,JSON.stringify({mode,target,elapsed}));
      results.push({mode,target,elapsed,p50:sorted[Math.floor(sorted.length/2)],p95,max:Math.max(...elapsed)});console.log('PASS event timing',mode,target,p95);
    }finally{await page.close();}
  }
  if(group==='fallback'){
    const page=await open('blivechat','obs',{fallback:'1',hide:'1',animation:'fade',duration:'800'});
    try{
      await page.getByText('追加事件',{exact:true}).click();const frame=await(await page.locator('iframe').elementHandle()).contentFrame();
      const outer=frame.locator('[data-compatible-fallback-id]'),inner=frame.locator('.event-row');await inner.waitFor();await page.waitForTimeout(70);
      const actual={outer:await sample(outer),inner:await sample(inner),avatars:await frame.locator('.event-avatar').count(),names:await frame.locator('.username:visible').count()};
      assert.equal(actual.inner[0].animation,'none');assert.equal(actual.outer[0].duration,800);assert.ok(actual.outer[0].opacity<1);assert.equal(actual.names,0);assert.equal(actual.avatars,0);
      results.push(actual);console.log('PASS compatible fallback display and single motion');
    }finally{await page.close();}
  }
  if(group==='queue')for(const scenario of ['fifo','failure','disable','room']){
    const page=await open('native','live',{effects:'1'});
    try{
      await page.evaluate(()=>{window.effectMetrics={starts:0,max:0};new MutationObserver(changes=>{for(const c of changes)for(const n of c.addedNodes)if(n instanceof Element)window.effectMetrics.starts+=(n.matches('canvas')?1:0)+n.querySelectorAll('canvas').length;window.effectMetrics.max=Math.max(window.effectMetrics.max,document.querySelectorAll('canvas').length)}).observe(document.body,{childList:true,subtree:true})});
      if(scenario==='failure')await page.getByText('播放损坏特效',{exact:true}).click();
      await page.getByText('播放特效',{exact:true}).click();await page.locator('canvas').waitFor();
      if(scenario==='fifo'||scenario==='disable')await page.getByText('播放特效',{exact:true}).click();
      if(scenario==='disable')await page.getByText('切换特效开关',{exact:true}).click();
      if(scenario==='room')await page.getByText('切换房间',{exact:true}).click();
      await page.waitForFunction(expected=>window.effectMetrics.starts===expected&&document.querySelectorAll('canvas,video').length===0,scenario==='fifo'?2:1,{timeout:16000});
      await page.waitForTimeout(150);const actual=await page.evaluate(()=>window.effectMetrics);assert.equal(actual.max,1);
      results.push({scenario,...actual});console.log('PASS queue',scenario);
    }finally{await page.close();}
  }
  if(group==='elements')for(const target of ['live','obs'])for(const classic of [false,true]){
    const page=await open('laplace',target,{hide:'1',animation:'none',...(classic?{classic:'1'}:{})});
    try{
      await page.getByText('追加事件',{exact:true}).click();const list=await rows(page,'laplace');await list.first().waitFor();await page.waitForTimeout(100);
      const actual=await list.first().evaluate(n=>{const visible=s=>[...n.querySelectorAll(s)].filter(v=>v.getClientRects().length&&getComputedStyle(v).display!=='none').length;return {avatars:visible('.avatar-wrap'),names:visible('.username'),text:n.textContent}});
      let reference;
      if(classic){
        const original=await open('laplace',target,{hide:'1',classic:'1',reference:'1'});
        try{
          await original.getByText('追加事件',{exact:true}).click();const source=await rows(original,'laplace');await source.first().waitFor();
          reference=await source.first().evaluate(n=>{const count=s=>[...n.querySelectorAll(s)].filter(v=>v.getClientRects().length&&getComputedStyle(v).display!=='none').length;return {avatars:count('.avatar-wrap'),names:count('.username')}});
          assert.equal(actual.avatars,reference.avatars);assert.equal(actual.names,reference.names);
        }finally{await original.close();}
      }else{assert.equal(actual.avatars,0);assert.equal(actual.names,0);}
      results.push({target,classic,...actual,reference});console.log('PASS element scope',target,classic);
    }finally{await page.close();}
  }
  if(group==='persistence'){
    const page=await browser.newPage({viewport:{width:800,height:1000}});page.setDefaultTimeout(8000);
    try{
      await page.goto(`${base}/tests/fixtures/styleSettingsBehavior.html?persist=1`,{waitUntil:'domcontentloaded'});
      await page.getByRole('group',{name:'内容对齐',exact:true}).getByRole('button',{name:'底部',exact:true}).click();
      await page.getByRole('group',{name:'最新事件位置',exact:true}).getByRole('button',{name:'上方',exact:true}).click();
      const before=JSON.parse(await page.locator('output').textContent());
      await page.reload({waitUntil:'domcontentloaded'});await page.locator('output').waitFor({state:'attached'});
      const after=JSON.parse(await page.locator('output').textContent());assert.equal(after.alignment,'bottom');assert.equal(after.direction,'top');
      assert.deepEqual(after.scene,before.scene);results.push({before,after});console.log('PASS settings persistence');
    }finally{await page.close();}
    for(const direction of ['top','bottom']){
      const legacy=await browser.newPage();
      try{
        await legacy.addInitScript(value=>localStorage.setItem('danmu-general-settings',JSON.stringify({state:{liveScrollDirection:value,eventFontSize:22},version:0})),direction);
        await legacy.goto(`${base}/tests/fixtures/styleSettingsBehavior.html?persist=1`,{waitUntil:'domcontentloaded'});
        await legacy.locator('output').waitFor({state:'attached'});const state=JSON.parse(await legacy.locator('output').textContent());
        assert.equal(state.alignment,undefined);assert.equal(state.eventFontSize,22);
        results.push({legacyDirection:direction,state});console.log('PASS legacy native alignment',direction);
      }finally{await legacy.close();}
    }
  }
  if(group==='reading'||group==='readingchanges'||group==='windowreadingchanges')for(const mode of modes)for(const target of (group==='windowreadingchanges'?['display','gift']:['live','obs']))for(const direction of ['top','bottom'])for(const alignment of ['top','bottom']){
    const windowTarget=group==='windowreadingchanges';
    const page=windowTarget?await browser.newPage({viewport:{width:400,height:500}}):await open(mode,target,{direction,alignment,animation:'none'});
    if(windowTarget){await page.goto(`http://127.0.0.1:1444/tests/fixtures/styleCommonWindow.html?${new URLSearchParams({mode,kind:target,direction,alignment,animation:'none'})}`,{waitUntil:'domcontentloaded'});await page.getByText('追加事件',{exact:true}).waitFor();await page.waitForFunction(()=>![...document.querySelectorAll('button')].find(b=>b.textContent==='追加事件').disabled)}
    try{
      await page.evaluate(()=>{for(let i=0;i<50;i++)[...document.querySelectorAll('button')].find(b=>b.textContent==='追加事件').click()});
      const list=await rows(page,mode);await list.first().waitFor();await page.waitForTimeout(250);
      const frame=mode==='native'?page:await(await page.locator('iframe').elementHandle()).contentFrame();
      const scroller=frame.locator(mode==='native'?(windowTarget?'[aria-live="polite"]':target==='live'?'.scene-live-list':'.obs-native-root > .event-list'):mode==='laplace'?'.scroll-area':'#item-scroller');
      const box=await scroller.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,group!=='reading'?await scroller.evaluate(n=>n.scrollHeight/2-n.scrollTop):(direction==='top'?350:-350));await page.waitForTimeout(180);
      const anchor=()=>scroller.evaluate(n=>{const b=n.getBoundingClientRect(),candidates=[...n.querySelectorAll('.event-row,[data-compatible-event-id],.event-list .event')].filter(v=>v.getBoundingClientRect().height>0&&v.getBoundingClientRect().bottom>b.top&&v.getBoundingClientRect().top<b.bottom);const r=candidates[0];return {id:r?.closest('[data-event-id]')?.getAttribute('data-event-id')??r?.getAttribute('data-compatible-event-id')??r?.textContent,offset:r?r.getBoundingClientRect().y-b.y:0,top:n.scrollTop,max:n.scrollHeight-n.clientHeight}});
      const before=await anchor();assert.ok(before.top>4&&before.top<before.max-4,JSON.stringify({mode,target,direction,before}));
      for(let i=0;i<3;i++)await page.getByText('追加事件',{exact:true}).click();await page.waitForTimeout(180);
      const after=await anchor();assert.equal(after.id,before.id,JSON.stringify({mode,target,direction,alignment,before,after}));assert.ok(Math.abs(after.offset-before.offset)<=2);
      if(group!=='reading'){await page.getByText('切换最新位置',{exact:true}).click();await page.waitForTimeout(200);const flipped=await anchor();assert.equal(flipped.id,before.id,JSON.stringify({mode,target,direction,before,flipped}));await page.getByText('切换内容对齐',{exact:true}).click();await page.waitForTimeout(100);const aligned=await anchor();assert.equal(aligned.id,before.id);assert.ok(Math.abs(aligned.offset-before.offset)<=2,JSON.stringify({mode,target,direction,alignment,before,flipped,aligned}));}
      results.push({mode,target,direction,alignment,before,after});console.log('PASS reading',mode,target,direction,alignment);
    }finally{await page.close();}
  }
  if(group==='manualeffects')for(const mode of modes){
    const page=await open(mode,'live',{effects:'1',gift:'1',animation:'none'});
    try{
      await page.getByText('追加事件',{exact:true}).click();const list=await rows(page,mode);await list.first().waitFor();
      await page.getByText('切换特效开关',{exact:true}).click();
      if(mode==='native')await page.getByRole('button',{name:'打开事件菜单',exact:true}).click();
      else await list.first().click({button:'right'});
      await page.getByText('播放礼物特效',{exact:true}).click();await page.locator('canvas').waitFor();
      await page.locator('canvas').waitFor({state:'detached',timeout:10000});assert.equal(await page.locator('video').count(),0);
      results.push({mode,manualWhileAutoDisabled:true,cleaned:true});console.log('PASS manual effect',mode);
    }finally{await page.close();}
  }
  if(group==='windoweffects')for(const mode of modes)for(const kind of ['gift','gift-only']){
    const page=await browser.newPage({viewport:{width:400,height:500}});page.setDefaultTimeout(10000);
    try{
      await page.goto(`http://127.0.0.1:1444/tests/fixtures/styleCommonWindow.html?${new URLSearchParams({mode,kind,effects:'1'})}`);
      await page.getByText('追加事件',{exact:true}).click();
      await page.getByText('播放窗口特效',{exact:true}).click();await page.locator('canvas').waitFor();
      await page.waitForTimeout(900);await page.screenshot({path:`${output}/effect-${mode}-${kind}-1.png`});
      await page.waitForTimeout(900);await page.screenshot({path:`${output}/effect-${mode}-${kind}-2.png`});
      await page.locator('canvas').waitFor({state:'detached'});assert.equal(await page.locator('video').count(),0);
      results.push({mode,kind,played:true,cleaned:true});console.log('PASS window effect',mode,kind);
    }finally{await page.close();}
  }
  if (group === 'windows') for(const mode of modes) for(const kind of (process.env.STYLE_WINDOW_KINDS || 'display,gift,gift-only,superchat,guard').split(','))
    for(const direction of ['top','bottom']) for(const alignment of ['top','bottom']){
      const page=await browser.newPage({viewport:{width:400,height:500}});page.setDefaultTimeout(8000);
      try{
        await page.goto(`http://127.0.0.1:1444/tests/fixtures/styleCommonWindow.html?${new URLSearchParams({mode,kind,direction,alignment,animation:'none'})}`);
        for(let i=0;i<3;i++)await page.getByText('追加事件',{exact:true}).click();
        const list=await rows(page,mode);await list.nth(2).waitFor();await page.waitForTimeout(100);
        const actual=await sample(list),ordered=[...actual].sort((a,b)=>a.y-b.y);
        assert.ok(ordered[0].text.includes(direction==='top'?'用户 3':'用户 1'),JSON.stringify({mode,kind,direction,actual}));
        const frame=mode==='native'?null:await(await page.locator('iframe').elementHandle()).contentFrame();
        const boundary=mode==='native'?await page.locator('[aria-live="polite"]').boundingBox():await frame.locator(mode==='laplace'?'.scroll-area':'#item-scroller').evaluate(n=>{const r=n.getBoundingClientRect();return {y:r.y,height:r.height}});
        const gap=alignment==='top'?ordered[0].y-boundary.y:boundary.y+boundary.height-ordered[2].bottom;
        assert.ok(gap>=-2&&gap<=24,JSON.stringify({mode,kind,direction,alignment,gap}));
        results.push({mode,kind,direction,alignment,gap,rows:actual});console.log('PASS window',mode,kind,direction,alignment);
      }finally{await page.close();}
    }
  if (group === 'medals') for (const target of ['live','obs']) {
    const page = await open('laplace',target,{medal:'1',animation:'none'});
    try {
      for(let i=0;i<5;i++) await page.getByText('追加事件',{exact:true}).click();
      const list=await rows(page,'laplace'); await list.nth(4).waitFor(); await page.waitForTimeout(100);
      const actual=await list.evaluateAll(nodes=>nodes.map(node=>({text:node.textContent,medals:[...node.querySelectorAll('.fans-medal')].filter(n=>getComputedStyle(n).display!=='none'&&n.getClientRects().length>0).map(n=>n.textContent)})));
      assert.deepEqual(actual.map(row=>row.medals.length),[1,0,1,0,0]);
      results.push({target,rows:actual}); console.log('PASS medal',target);
    } finally {await page.close();}
  }
  if (group === 'positions') for (const mode of modes) for (const target of ['live', 'obs'])
    for (const direction of ['top', 'bottom']) for (const alignment of ['top', 'bottom']) {
      const page = await open(mode, target, { direction, alignment, animation: 'none' });
      try {
        await page.getByText('追加事件', { exact: true }).click();
        const list = await rows(page, mode); await list.first().waitFor();
        await page.getByText('追加事件', { exact: true }).click();
        await page.getByText('追加事件', { exact: true }).click();
        await list.nth(2).waitFor(); await page.waitForTimeout(180);
        const actual = await sample(list), ordered = [...actual].sort((a,b) => a.y-b.y);
        assert.equal(actual.length, 3);
        assert.ok(ordered[0].text.includes(direction === 'top' ? '事件 3' : '事件 1'));
        assert.ok(ordered[2].text.includes(direction === 'top' ? '事件 1' : '事件 3'));
        const frame = mode === 'native' ? null : await (await page.locator('iframe').elementHandle()).contentFrame();
        const boundary = mode === 'native'
          ? await page.locator('section').boundingBox()
          : await frame.locator(mode === 'laplace' ? '.scroll-area' : '#item-scroller').evaluate(node => {
              const rect = node.getBoundingClientRect(); return { y: rect.y, height: rect.height };
            });
        const gap = alignment === 'top' ? ordered[0].y - boundary.y
          : boundary.y + boundary.height - ordered[2].bottom;
        assert.ok(gap >= -2 && gap <= 24, `${mode} ${target} ${direction}/${alignment} gap=${gap}`);
        results.push({ mode, target, direction, alignment, gap, rows: actual });
        console.log('PASS position', mode, target, direction, alignment);
      } finally { await page.close(); }
    }
  if (group === 'animations') for (const mode of modes) for (const target of ['live','obs'])
    for (const animation of ['none','fade','lift','scale','slide']) for (const duration of ['200','800']) {
      const page = await open(mode, target, { animation, duration });
      try {
        await page.getByText('追加事件', { exact: true }).click();
        const list = await rows(page, mode); await list.first().waitFor();
        await page.waitForTimeout(70);
        const entering = (await sample(list))[0];
        assert.equal(entering.duration, animation === 'none' ? 0 : Number(duration));
        if (animation === 'none') assert.equal(entering.opacity, 1);
        else assert.ok(entering.opacity < 1, `${mode} ${target} missing ${animation} entry`);
        await page.waitForTimeout(Number(duration) + 100);
        assert.equal((await sample(list))[0].opacity, 1);
        let exiting;
        if (target === 'obs') {
          await page.getByText('退出事件', { exact: true }).click(); await page.waitForTimeout(70);
          exiting = (await sample(list))[0];
          if (animation === 'none') assert.equal(exiting.visibility,'hidden');
          else assert.ok(exiting.opacity < 1);
        }
        results.push({ mode, target, animation, duration, entering, exiting });
        console.log('PASS animation', mode, target, animation, duration);
      } finally { await page.close(); }
    }
  if (group === 'effects') for (const mode of modes) for (const target of ['live','obs']) {
    const page = await open(mode, target, { effects:'1' });
    try {
      await page.getByText('播放特效',{exact:true}).click();
      await page.locator('canvas').waitFor();
      await page.waitForTimeout(900); await page.screenshot({path:`${output}/effect-${mode}-${target}-1.png`});
      await page.waitForTimeout(900); await page.screenshot({path:`${output}/effect-${mode}-${target}-2.png`});
      await page.locator('canvas').waitFor({state:'detached',timeout:8000});
      assert.equal(await page.locator('video').count(),0);
      results.push({mode,target,played:true,cleaned:true}); console.log('PASS effect',mode,target);
    } finally { await page.close(); }
  }
} finally {
  await fs.writeFile(`${output}/${group}-result.json`,JSON.stringify(results,null,2));
  await browser.close();
}
