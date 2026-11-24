import { connect, home, choose, assert, save } from './compatibleVisualAcceptanceSupport.mjs';

const {browser, page} = await connect();
const results = [];
try {
  assert.equal(await page.evaluate(async () => (await import('/node_modules/@tauri-apps/api/app.js')).getIdentifier()), 'cc.orange.danmu-app.visual-acceptance-20261029');
  const initialMode = await page.evaluate(async()=>(await import('/src/theme.ts')).useTheme.getState().mode);
  await home(page);
  if (!browser.contexts()[0].pages().some(p => p.url().includes('window=display'))) await page.getByRole('button', {name:'打开弹幕窗', exact:true}).click();
  const floating = await browser.contexts()[0].waitForEvent('page', {timeout:1000}).catch(() => browser.contexts()[0].pages().find(p => p.url().includes('window=display')));
  assert.ok(floating);
  const originalSize = await page.evaluate(async()=>await(await import('/node_modules/@tauri-apps/api/core.js')).invoke('plugin:window|inner_size',{label:'display'}));
  for (const [mode, name] of [['blivechat','BLC 原版默认'],['blivechat-open','BLC 开放版默认'],['laplace','LAPLACE 默认']]) {
    await home(page);
    await page.locator('.theme-library-card').filter({has:page.locator('strong',{hasText:name,exact:true})}).getByRole('button',{name:'编辑',exact:true}).click();
    for (const target of ['现场','副窗口']) {
      await choose(page,'应用位置',target);
      await page.locator('.native-editor-actions').getByRole('button',{name:'应用',exact:true}).click();
      let bound = false;
      for (let attempt = 0; attempt < 100 && !bound; attempt++) {
        bound = await page.evaluate(async ({mode,target}) => (await (await import('/src/themes/themeBindings.ts')).loadThemeBindings()).some(b => b.targetId === (target === '现场' ? 'live' : 'windows') && b.themeId === `${mode}-default`), {mode,target});
        if (!bound) await page.waitForTimeout(100);
      }
      assert.ok(bound, `${mode} ${target} 绑定未更新`);
    }
    await home(page);
    await page.evaluate(async (mode) => {
      const {useConnection} = await import('/src/stores/connection.ts');
      const {createStylePreviewEvents} = await import('/src/components/stylePreviewEvents.ts');
      const {emitTo} = await import('/node_modules/@tauri-apps/api/event.js');
      const roomId=mode==='blivechat'?700001:mode==='blivechat-open'?700002:700003;
      const events = createStylePreviewEvents('混合流').map((e,i)=>({...e,roomId,id:`container-${Date.now()}-${i}`,ts:Date.now(),firstOccurredAt:Date.now()}));
      useConnection.setState({events,state:{status:'closed',roomId:events[0].roomId},listCount:events.length});
      await emitTo('display','display:room-changed',{roomId:events[0].roomId,generation:Date.now()});
      for (const event of events) await emitTo('display','display:danmu',event);
    },mode);
    await page.getByTitle('现场（当前页）',{exact:true}).click();
    const expected = mode === 'laplace' ? '/laplace/product/' : mode === 'blivechat' ? '/blivechat/renderer' : '/openlive/renderer';
    await floating.waitForFunction(expected => [...document.querySelectorAll('iframe')].some(e => e.src.includes(expected)), expected);
    let liveSource;
    for(let i=0;i<100&&!liveSource;i++){for(const f of page.frames().slice(1)){const e=await f.frameElement();if(f.url().includes(expected)&&await e.isVisible()&&await e.evaluate(x=>!!x.closest('.scene-live-list'))&&await f.locator(mode==='laplace'?'.event-list [data-event-id]':'[data-compatible-event-id]').count()){liveSource=f;break;}}if(!liveSource)await page.waitForTimeout(100);}
    assert.ok(liveSource,`${mode} 现场事件未加载`);
    let visibleRow=false;
    for(let i=0;i<70&&!visibleRow;i++){visibleRow=await liveSource.evaluate(()=>[...document.querySelectorAll('[data-compatible-event-id], .event-list [data-event-id]')].some(e=>{const r=e.getBoundingClientRect();return r.height>0&&r.bottom>0&&r.top<document.documentElement.clientHeight;}));if(!visibleRow)await page.waitForTimeout(100);}
    assert.ok(visibleRow,`${mode} 现场事件未进入可视区域`);
    const liveLayout=await liveSource.evaluate(()=>{const row=document.querySelector('[data-compatible-event-id], .event-list [data-event-id]'),sc=document.querySelector('#item-scroller, .event-list .scroll-area');return {row:row?.getBoundingClientRect().toJSON(),scroll:sc&&{top:sc.scrollTop,height:sc.clientHeight,total:sc.scrollHeight},text:document.body.innerText.slice(0,60)};});
    console.log(mode,'现场',liveLayout);
    for(const appearance of ['light','dark']) {
      await page.evaluate(async appearance=>(await import('/src/theme.ts')).useTheme.getState().setMode(appearance),appearance);
      await page.waitForTimeout(100);
      const target=page.locator('.scene-live-list iframe').first();
      await target.waitFor();
      assert.equal(await target.evaluate(e=>getComputedStyle(e).colorScheme),'normal',`${mode} ${appearance} 画布配色`);
      await page.screenshot({path:`.superpowers/sdd/2026-10-28-compatible-visual-editor-implementation/container-fixed-${mode}-${appearance}.png`});
    }
    const result = await floating.evaluate(() => {
      const root = document.querySelector('main'); const frame = root.querySelector('iframe');
      const style = getComputedStyle(root);
      return {background:style.backgroundColor,image:style.backgroundImage,frameScheme:getComputedStyle(frame).colorScheme};
    });
    assert.notEqual(result.background,'rgba(0, 0, 0, 0)',mode);
    assert.match(result.image,/radial-gradient/,mode);
    assert.equal(result.frameScheme,'normal',mode);
    result.scales = [];
    for (const [width,height] of [[450,360],[560,600]]) for (const scale of [1, 0.9, 1.5]) {
      await page.evaluate(async ({width,height})=>await(await import('/node_modules/@tauri-apps/api/core.js')).invoke('plugin:window|set_size',{label:'display',value:{Physical:{width,height}}}),{width,height});
      await page.evaluate(async ({mode,scale}) => (await import('/src/themes/themeModeAdapters.ts')).getThemeModeAdapter(mode).updateScale('windows','windows',scale), {mode,scale});
      await floating.waitForTimeout(150);
      const dimensions = await floating.evaluate(() => {
        const area = document.querySelector('.display-window-log');
        const list = area.querySelector('.event-list');
        const frame = list.querySelector('iframe');
        return {area:area.getBoundingClientRect().height,frame:frame.getBoundingClientRect().height,zoom:getComputedStyle(list).zoom};
      });
      assert.ok(Math.abs(dimensions.area-dimensions.frame) <= 2, `${mode} ${scale}: ${JSON.stringify(dimensions)}`);
      assert.equal(dimensions.zoom, '1', `${mode} ${scale}`);
      const source = floating.frames().find(f => f.url().includes(expected));
      const avatarSelector = mode === 'laplace' ? '.event-list img.avatar:visible' : '#author-photo:visible';
      await source.locator(avatarSelector).first().waitFor({timeout:7000});
      const avatar = await source.locator(avatarSelector).first().evaluate(e=>e.getBoundingClientRect().width);
      const transform = await floating.locator('.compatible-event-list iframe').evaluate(e=>e.getBoundingClientRect().width/e.clientWidth);
      assert.ok(avatar > 0, `${mode} 缺少头像`);
      const visualWidth = avatar * transform;
      if (scale === 1) result.baseAvatar = visualWidth;
      else assert.ok(Math.abs(visualWidth / result.baseAvatar - scale) < 0.04, `${mode} ${scale}: ${visualWidth/result.baseAvatar}`);
      result.scales.push({width,height,scale,...dimensions,visualWidth});
    }
    await page.evaluate(async mode => (await import('/src/themes/themeModeAdapters.ts')).getThemeModeAdapter(mode).updateScale('windows','windows',1), mode);
    const currentSource = floating.frames().find(f => f.url().includes(expected));
    await currentSource.evaluate(()=>document.documentElement.style.colorScheme='dark');
    await page.evaluate(async mode => (await import('/src/themes/themeModeAdapters.ts')).getThemeModeAdapter(mode).updateScale('windows','windows',0.95), mode);
    await floating.locator('.compatible-event-list iframe').waitFor();
    for(let i=0;i<60;i++){if(await floating.locator('.compatible-event-list iframe').evaluate(e=>getComputedStyle(e).colorScheme)==='dark')break;await page.waitForTimeout(100);}
    assert.equal(await floating.locator('.compatible-event-list iframe').evaluate(e=>getComputedStyle(e).colorScheme),'dark',`${mode} 来源配色未同步`);
    await currentSource.evaluate(()=>document.documentElement.style.removeProperty('color-scheme'));
    await page.evaluate(async mode => (await import('/src/themes/themeModeAdapters.ts')).getThemeModeAdapter(mode).updateScale('windows','windows',1), mode);
    await floating.screenshot({path:`.superpowers/sdd/2026-10-28-compatible-visual-editor-implementation/container-fixed-${mode}.png`});
    results.push({mode,...result});
  }
  await page.evaluate(async size=>await(await import('/node_modules/@tauri-apps/api/core.js')).invoke('plugin:window|set_size',{label:'display',value:{Physical:size}}),originalSize);
  await page.evaluate(async mode=>(await import('/src/theme.ts')).useTheme.getState().setMode(mode),initialMode);
  save('container-isolation-results',results);
  console.log(results);
} finally { await browser.close(); }
