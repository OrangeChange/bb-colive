import {connect, home, choose, assert, save} from './compatibleVisualAcceptanceSupport.mjs';

const {browser, page} = await connect();
const results = [];
const errors = [];
page.on('pageerror', error => errors.push(error.message));
let originalDirection;

async function applyTheme(mode, name) {
  await home(page);
  await page.locator('.theme-library-card').filter({has:page.locator('strong',{hasText:name,exact:true})}).getByRole('button',{name:'编辑',exact:true}).click();
  await choose(page, '应用位置', '现场');
  await page.locator('.native-editor-actions').getByRole('button',{name:'应用',exact:true}).click();
  let bound = false;
  for (let i = 0; i < 80 && !bound; i++) {
    bound = await page.evaluate(async mode => (await (await import('/src/themes/themeBindings.ts')).loadThemeBindings()).some(b => b.targetId === 'live' && b.themeId === `${mode}-default`), mode);
    if (!bound) await page.waitForTimeout(100);
  }
  assert.ok(bound, `${mode} 现场主题未应用`);
  await home(page);
  await page.getByTitle('现场（当前页）',{exact:true}).click();
}

async function actualViewport(mode) {
  if (mode === 'native') return {frame:page, viewport:page.locator('.scene-live-list').first()};
  const path = mode === 'laplace' ? '/laplace/product/' : mode === 'blivechat' ? '/blivechat/renderer' : '/openlive/renderer';
  for (let i = 0; i < 80; i++) {
    for (const frame of page.frames().filter(frame => frame.url().includes(path))) {
      const element = await frame.frameElement();
      if (await element.isVisible() && await element.evaluate(e => !!e.closest('.scene-live-list'))) {
        return {frame, viewport:frame.locator(mode === 'laplace' ? '.event-list .scroll-area' : '#item-scroller').first()};
      }
    }
    await page.waitForTimeout(100);
  }
  throw Error(`${mode} 正式输出未加载`);
}

function anchorAtCenter(element) {
  const viewport = element.getBoundingClientRect();
  const center = viewport.top + viewport.height / 2;
  const rows = [...element.querySelectorAll('[data-event-id],[data-compatible-event-id]')]
    .map(row => ({id:row.dataset.eventId ?? row.dataset.compatibleEventId, bounds:row.getBoundingClientRect()}))
    .filter(row => row.bounds.bottom > viewport.top && row.bounds.top < viewport.bottom);
  const anchor = rows.sort((a,b) => Math.abs(a.bounds.top + a.bounds.height/2-center) - Math.abs(b.bounds.top + b.bounds.height/2-center))[0];
  return anchor && {id:anchor.id, offset:anchor.bounds.top-viewport.top, top:element.scrollTop, total:element.scrollHeight, height:element.clientHeight};
}

async function verifyAnchor(viewport, before, label) {
  let after;
  for (let i = 0; i < 50; i++) {
    after = await viewport.evaluate((element,id) => {
      const row = [...element.querySelectorAll('[data-event-id],[data-compatible-event-id]')].find(row => (row.dataset.eventId ?? row.dataset.compatibleEventId) === id);
      if (!row) return null;
      const a = row.getBoundingClientRect(), b = element.getBoundingClientRect();
      return {offset:a.top-b.top, visible:a.bottom>b.top && a.top<b.bottom, top:element.scrollTop};
    }, before.id).catch(() => null);
    if (after?.visible && Math.abs(after.offset-before.offset) < 4) break;
    await page.waitForTimeout(100);
  }
  assert.ok(after?.visible && Math.abs(after.offset-before.offset) < 4, `${label}: ${JSON.stringify({before,after})}`);
  return after;
}

try {
  assert.equal(await page.evaluate(async () => (await import('/node_modules/@tauri-apps/api/app.js')).getIdentifier()), 'cc.orange.danmu-app.visual-acceptance-20261029');
  await page.reload();
  originalDirection = await page.evaluate(async () => {
    const path='/src/generalSettings.ts';
    const module=performance.getEntriesByType('resource').find(entry=>new URL(entry.name).pathname===path)?.name??path;
    return (await import(module)).useGeneralSettings.getState().liveScrollDirection;
  });
  for (const [mode,name] of [['native','原生默认'],['blivechat','BLC 原版默认'],['blivechat-open','BLC 开放版默认'],['laplace','LAPLACE 默认']]) {
    for (const direction of ['bottom','top']) {
      await page.evaluate(async direction => {
        const path='/src/generalSettings.ts';
        const module=performance.getEntriesByType('resource').find(entry=>new URL(entry.name).pathname===path)?.name??path;
        (await import(module)).useGeneralSettings.getState().setLiveScrollDirection(direction);
      }, direction);
      await applyTheme(mode,name);
      await page.evaluate(async ({mode,direction}) => {
        const path='/src/stores/connection.ts';
        const module=performance.getEntriesByType('resource').find(entry=>new URL(entry.name).pathname===path)?.name??path;
        const {useConnection}=await import(module), {createStylePreviewEvents}=await import('/src/components/stylePreviewEvents.ts');
        const base=createStylePreviewEvents('混合流')[0], now=Date.now();
        const events=Array.from({length:100},(_,i)=>({...base,id:`filter-${mode}-${direction}-${i}`,reactKey:`filter-${mode}-${direction}-${i}`,ts:now+i,firstOccurredAt:now+i,text:`filter text ${i}`,user:{...base.user,uid:`qa-filter-user-${i%2}`,uname:`验收用户${i%2}`}}));
        useConnection.setState({state:{status:'closed',roomId:base.roomId}});
        await new Promise(resolve=>setTimeout(resolve,200));
        useConnection.setState({events,listCount:events.length});
      }, {mode,direction});
      await choose(page, '现场布局', '布局：双区');
      const {frame,viewport} = await actualViewport(mode);
      await viewport.hover();
      for(let i=0;i<7;i++){await page.mouse.wheel(0,direction==='top'?-10000:10000);await page.waitForTimeout(150);}
      await page.mouse.wheel(0,direction==='top'?500:-500);
      await page.waitForTimeout(400);
      const frameElement = mode === 'native' ? null : await frame.frameElement();
      for (const query of ['filter text 99','no-matching-event','filter text 99']) {
        const before = await viewport.evaluate(anchorAtCenter);
        assert.ok(before && before.top > 10 && before.total-before.top-before.height>10, `${mode} ${direction} 未进入阅读位置`);
        const search=page.getByRole('searchbox',{name:'搜索现场事件内容'});
        if (query === 'no-matching-event') await search.pressSequentially(query,{delay:10});
        else await search.fill(query);
        await page.waitForTimeout(600);
        await page.getByRole('button',{name:'退出筛选'}).click();
        const after=await verifyAnchor(viewport,before,`${mode} ${direction} ${query}`);
        if(frameElement)assert.ok(await frameElement.evaluate(element=>element.isConnected),'筛选不应重建 iframe');
        results.push({mode,direction,query,anchor:before.id,before:before.offset,after:after.offset});
      }
      const before = await viewport.evaluate(anchorAtCenter);
      const anchorRow = mode==='native' ? viewport.locator(`[data-event-id="${before.id}"]`) : mode==='laplace' ? viewport.locator(`[data-event-id="${before.id}"]`) : viewport.locator(`[data-compatible-event-id="${before.id}"]`);
      if(mode==='native')await anchorRow.getByRole('button',{name:/筛选用户/}).first().click();
      else await anchorRow.locator(mode==='laplace'?'.username':'#author-name').first().click();
      await page.getByRole('button',{name:'退出筛选'}).waitFor();
      await page.waitForTimeout(400);
      await page.getByRole('button',{name:'退出筛选'}).click();
      const after=await verifyAnchor(viewport,before,`${mode} ${direction} 用户筛选`);
      results.push({mode,direction,query:'用户筛选',anchor:before.id,before:before.offset,after:after.offset});
      await viewport.hover();
      for(let i=0;i<7;i++){await page.mouse.wheel(0,direction==='top'?-10000:10000);await page.waitForTimeout(150);}
      await page.getByRole('searchbox',{name:'搜索现场事件内容'}).fill('filter text 99');
      await page.waitForTimeout(400);
      await page.getByRole('button',{name:'退出筛选'}).click();
      await page.waitForTimeout(500);
      await viewport.hover();await page.mouse.wheel(0,direction==='top'?500:-500);await page.waitForTimeout(350);
      const resumed=await viewport.evaluate(anchorAtCenter);assert.ok(resumed);
      await page.evaluate(async()=>{
        const path='/src/stores/connection.ts';const module=performance.getEntriesByType('resource').find(entry=>new URL(entry.name).pathname===path)?.name??path;
        const {useConnection}=await import(module),events=useConnection.getState().events,base=events[0],now=Date.now();
        useConnection.setState({events:[...events,{...base,id:base.id+'-append',reactKey:base.id+'-append',ts:now,firstOccurredAt:now,text:'筛选退出后的新增事件'}],listCount:events.length+1});
      });
      await page.waitForTimeout(500);
      const resumedAfter=await verifyAnchor(viewport,resumed,`${mode} ${direction} 跟随后退出筛选再阅读`);
      results.push({mode,direction,query:'跟随后退出筛选再阅读',anchor:resumed.id,before:resumed.offset,after:resumedAfter.offset});
      console.log({mode,direction,cases:results.filter(r=>r.mode===mode&&r.direction===direction).length});
      save('filter-reading-acceptance',results);
    }
    const {viewport}=await actualViewport(mode);
    const before=await viewport.evaluate(anchorAtCenter);assert.ok(before);
    await page.getByRole('searchbox',{name:'搜索现场事件内容'}).fill('filter text 99');await page.waitForTimeout(400);
    await choose(page,'现场布局','布局：多区');
    await page.getByRole('button',{name:'退出筛选'}).click();await page.waitForTimeout(400);
    await choose(page,'现场布局','布局：双区');
    const restored=await actualViewport(mode);
    const after=await verifyAnchor(restored.viewport,before,`${mode} 筛选期间切换布局再返回`);
    results.push({mode,direction:'top',query:'筛选期间切换布局再返回',anchor:before.id,before:before.offset,after:after.offset});
    save('filter-reading-acceptance',results);
  }
  assert.deepEqual(errors,[],'实际程序不得出现未处理错误');
} finally {
  if(originalDirection)await page.evaluate(async direction=>{
    const path='/src/generalSettings.ts';const module=performance.getEntriesByType('resource').find(entry=>new URL(entry.name).pathname===path)?.name??path;
    (await import(module)).useGeneralSettings.getState().setLiveScrollDirection(direction);
  },originalDirection).catch(()=>{});
  await browser.close();
}
