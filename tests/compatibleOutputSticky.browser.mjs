import {connect,home,choose,assert,save} from './compatibleVisualAcceptanceSupport.mjs';
const {browser,page}=await connect();const results=[];
try{
  assert.equal(await page.evaluate(async()=>(await import('/node_modules/@tauri-apps/api/app.js')).getIdentifier()),'cc.orange.danmu-app.visual-acceptance-20261029');
  await home(page);
  if(!browser.contexts()[0].pages().some(p=>p.url().includes('window=display')))await page.getByRole('button',{name:'打开弹幕窗',exact:true}).click();
  let w;for(let i=0;i<60&&!w;i++){w=browser.contexts()[0].pages().find(p=>p.url().includes('window=display'));if(!w)await page.waitForTimeout(100);}assert.ok(w);
  for(const [mode,name] of [['blivechat','BLC 原版默认'],['blivechat-open','BLC 开放版默认'],['laplace','LAPLACE 默认']]){
    await home(page);await page.locator('.theme-library-card').filter({has:page.locator('strong',{hasText:name,exact:true})}).getByRole('button',{name:'编辑',exact:true}).click();await choose(page,'应用位置','副窗口');await page.locator('.native-editor-actions').getByRole('button',{name:'应用',exact:true}).click();
    let bound=false;for(let i=0;i<100&&!bound;i++){bound=await page.evaluate(async mode=>(await(await import('/src/themes/themeBindings.ts')).loadThemeBindings()).some(b=>b.targetId==='windows'&&b.themeId===`${mode}-default`),mode);if(!bound)await page.waitForTimeout(100);}assert.ok(bound);
    await home(page);await page.getByTitle('现场（当前页）',{exact:true}).click();
    const expected=mode==='laplace'?'/laplace/product/':mode==='blivechat'?'/blivechat/renderer':'/openlive/renderer';
    let f;for(let i=0;i<60&&!f;i++){f=w.frames().find(frame=>frame.url().includes(expected));if(!f)await page.waitForTimeout(100);}assert.ok(f);
    for(const position of ['top','bottom']){
      await page.evaluate(async position=>{const {emitTo}=await import('/node_modules/@tauri-apps/api/event.js'),{createEventWindowPreferences}=await import('/src/windows/eventWindowPreferences.ts'),{useGeneralSettings}=await import('/src/generalSettings.ts'),{createStylePreviewEvents}=await import('/src/components/stylePreviewEvents.ts');const state=useGeneralSettings.getState(),prefs=createEventWindowPreferences(state,{giftThreshold:0,giftThresholdMode:'total'});prefs.stickyEvents={...prefs.stickyEvents,enabled:true,position,giftThreshold:0};await emitTo('display','event-window:preferences',prefs);const now=Date.now(),base=createStylePreviewEvents('混合流').find(e=>e.sc?.price);const events=Array.from({length:8},(_,i)=>({...base,id:`sticky-${position}-${i}`,reactKey:`sticky-${position}-${i}`,ts:now,firstOccurredAt:now,sc:{...base.sc,price:30+i}}));await emitTo('display','display:room-changed',{roomId:base.roomId,generation:now});await new Promise(r=>setTimeout(r,200));for(const event of events)await emitTo('display','display:danmu',event);await emitTo('display','event-window:sticky-snapshot',{roomId:base.roomId,generation:now,events});},position);
      const selector=mode==='laplace'?'.gift-sticky-bar':mode==='blivechat-open'?'yt-live-chat-ticker-renderer > #container':'yt-live-chat-ticker-renderer .el-scrollbar__wrap';
      const ticker=f.locator(selector).first();await ticker.waitFor({state:'visible',timeout:10000});await page.waitForTimeout(200);
      const before=await ticker.evaluate(e=>({left:e.scrollLeft,width:e.clientWidth,total:e.scrollWidth,bar:getComputedStyle(e).scrollbarWidth,top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom,frameHeight:document.documentElement.clientHeight}));
      assert.ok(before.total>before.width,`${mode} ${position} 无横向溢出`);
      assert.ok(position==='top'?before.top<5:before.frameHeight-before.bottom<5,`${mode} ${position} 位置错误: ${JSON.stringify(before)}`);
      await ticker.dispatchEvent('wheel',{deltaY:180,bubbles:true,cancelable:true});await page.waitForTimeout(100);const after=await ticker.evaluate(e=>e.scrollLeft);assert.ok(after>before.left,`${mode} ${position} 无法横向滚动`);
      const viewport=await w.locator('.display-window-log').evaluate(e=>({height:e.clientHeight,frame:e.querySelector('iframe').getBoundingClientRect().height}));assert.ok(Math.abs(viewport.height-viewport.frame)<=2,`${mode} ${position} 高度异常`);
      results.push({mode,position,...before,after,...viewport});
    }
  }
  save('output-sticky-results',results);console.log(results);
}finally{await browser.close();}
