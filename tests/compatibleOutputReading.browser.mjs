import {connect,home,choose,assert,save} from './compatibleVisualAcceptanceSupport.mjs';
const {browser,page}=await connect(); const results=[];
try {
  assert.equal(await page.evaluate(async()=>(await import('/node_modules/@tauri-apps/api/app.js')).getIdentifier()),'cc.orange.danmu-app.visual-acceptance-20261029');
  for(const [mode,name] of [['blivechat','BLC 原版默认'],['blivechat-open','BLC 开放版默认'],['laplace','LAPLACE 默认']]) for(const direction of ['bottom','top']) {
    await page.evaluate(async direction=>(await import('/src/generalSettings.ts')).useGeneralSettings.setState({liveScrollDirection:direction}),direction);
    await home(page);
    await page.locator('.theme-library-card').filter({has:page.locator('strong',{hasText:name,exact:true})}).getByRole('button',{name:'编辑',exact:true}).click();
    await choose(page,'应用位置','现场');await page.locator('.native-editor-actions').getByRole('button',{name:'应用',exact:true}).click();
    let bound=false;for(let i=0;i<100&&!bound;i++){bound=await page.evaluate(async mode=>(await(await import('/src/themes/themeBindings.ts')).loadThemeBindings()).some(b=>b.targetId==='live'&&b.themeId===`${mode}-default`),mode);if(!bound)await page.waitForTimeout(100);}assert.ok(bound);
    await home(page);await page.getByTitle('现场（当前页）',{exact:true}).click();
    await page.evaluate(async()=>{const {useConnection}=await import('/src/stores/connection.ts'),{createStylePreviewEvents}=await import('/src/components/stylePreviewEvents.ts');const base=createStylePreviewEvents('混合流')[0],now=Date.now();window.__readingEvents=Array.from({length:160},(_,i)=>({...base,id:`reading-${i}`,reactKey:`reading-${i}`,ts:now+i,firstOccurredAt:now+i,text:`阅读 ${i}`}));useConnection.setState({events:window.__readingEvents,state:{status:'closed',roomId:base.roomId},listCount:160});});
    const expected=mode==='laplace'?'/laplace/product/':mode==='blivechat'?'/blivechat/renderer':'/openlive/renderer';
    let frame;for(let i=0;i<80&&!frame;i++){for(const f of page.frames().slice(1)){const e=await f.frameElement();if(f.url().includes(expected)&&await e.isVisible()&&await e.evaluate(x=>!!x.closest('.scene-live-list'))){frame=f;break}}if(!frame)await page.waitForTimeout(100);}assert.ok(frame,mode);
    const selector=mode==='laplace'?'.event-list .scroll-area':'#item-scroller';
    const viewport=frame.locator(selector).first();await viewport.waitFor();
    for(let i=0;i<100;i++){if(await viewport.evaluate(e=>e.scrollHeight>e.clientHeight+100))break;await page.waitForTimeout(100);}
    await viewport.hover();
    let latestBefore;
    for(let i=0;i<15;i++){
      await page.mouse.wheel(0,direction==='top'?-10000:10000);await page.waitForTimeout(200);
      latestBefore=await viewport.evaluate(e=>({top:e.scrollTop,total:e.scrollHeight,height:e.clientHeight}));
      if((direction==='top'?latestBefore.top<5:latestBefore.total-latestBefore.top-latestBefore.height<5)&&await frame.locator('[data-event-id="reading-159"], [data-compatible-event-id="reading-159"]').count())break;
    }
    assert.ok(direction==='top'?latestBefore.top<5:latestBefore.total-latestBefore.top-latestBefore.height<5,`${mode} ${direction} 无法先到最新`);
    await page.mouse.wheel(0,direction==='top'?600:-600);await page.waitForTimeout(300);
    const reading=await viewport.evaluate(e=>({top:e.scrollTop,total:e.scrollHeight,height:e.clientHeight}));
    assert.ok(direction==='top'?reading.top>5:reading.total-reading.top-reading.height>5,`${mode} ${direction} 无法离开最新`);
    console.log(mode,direction,reading);
    await page.evaluate(async()=>{const {useConnection}=await import('/src/stores/connection.ts');const es=window.__readingEvents;useConnection.setState({events:[...es,{...es[0],id:'reading-latest',reactKey:'reading-latest',ts:Date.now(),text:'最新'}],listCount:es.length+1});});
    await page.getByRole('button',{name:'回到最新消息',exact:true}).first().click();
    let position;for(let i=0;i<60;i++){position=await viewport.evaluate(e=>({top:e.scrollTop,height:e.clientHeight,total:e.scrollHeight}));if(direction==='top'?position.top<5:position.total-position.top-position.height<5)break;await page.waitForTimeout(100);}
    assert.ok(direction==='top'?position.top<5:position.total-position.top-position.height<5,`${mode} ${direction}: ${JSON.stringify(position)}`);
    assert.equal(await frame.locator('[data-event-id="reading-latest"], [data-compatible-event-id="reading-latest"]').count() > 0,true,`${mode} 最新事件未呈现`);
    assert.equal(await page.getByRole('button',{name:'回到最新消息',exact:true}).count(),0,mode);
    if(mode==='blivechat-open'&&direction==='bottom') {
      await viewport.hover();await page.mouse.wheel(0,-600);await page.waitForTimeout(200);
      await page.evaluate(async()=>{const {useConnection}=await import('/src/stores/connection.ts');const es=useConnection.getState().events;useConnection.setState({events:[...es,{...es[0],id:'reading-key-latest',reactKey:'reading-key-latest',ts:Date.now()}],listCount:es.length+1});});
      await page.getByRole('button',{name:'回到最新消息',exact:true}).first().waitFor();
      await viewport.focus();await page.keyboard.press('End');
      await page.getByRole('button',{name:'回到最新消息',exact:true}).first().waitFor({state:'hidden',timeout:5000});
    }
    results.push({mode,direction,...position});
  }
  save('output-reading-results',results);console.log(results);
} finally {await page.evaluate(async()=>(await import('/src/generalSettings.ts')).useGeneralSettings.setState({liveScrollDirection:'bottom'}));await browser.close();}
