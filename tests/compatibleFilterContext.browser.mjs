import {connect,home,choose,assert,save} from './compatibleVisualAcceptanceSupport.mjs';
const {browser,page}=await connect();const results=[];
try{
assert.equal(await page.evaluate(async()=>(await import('/node_modules/@tauri-apps/api/app.js')).getIdentifier()),'cc.orange.danmu-app.visual-acceptance-20261029');
await page.reload();
for(const [mode,name] of [['native','原生默认'],['blivechat','BLC 原版默认'],['blivechat-open','BLC 开放版默认'],['laplace','LAPLACE 默认']]){
  if(process.env.PROGRAM_MODE && process.env.PROGRAM_MODE!==mode)continue;
  await home(page);await page.locator('.theme-library-card').filter({has:page.locator('strong',{hasText:name,exact:true})}).getByRole('button',{name:'编辑',exact:true}).click();await choose(page,'应用位置','现场');await page.locator('.native-editor-actions').getByRole('button',{name:'应用',exact:true}).click();
  for(let i=0;i<80;i++){if(await page.evaluate(async mode=>(await(await import('/src/themes/themeBindings.ts')).loadThemeBindings()).some(b=>b.targetId==='live'&&b.themeId===`${mode}-default`),mode))break;await page.waitForTimeout(100)}
  await home(page);await page.getByTitle('现场（当前页）',{exact:true}).click();
  await page.evaluate(async mode=>{
    const find=path=>performance.getEntriesByType('resource').find(entry=>new URL(entry.name).pathname===path)?.name??path;
    const {useConnection}=await import(find('/src/stores/connection.ts')),{useGeneralSettings}=await import(find('/src/generalSettings.ts')),{createStylePreviewEvents}=await import('/src/components/stylePreviewEvents.ts');
    useGeneralSettings.getState().setLiveScrollDirection('bottom');const base=createStylePreviewEvents('混合流')[0],now=Date.now();const events=Array.from({length:120},(_,i)=>({...base,id:`context-${mode}-${i}`,reactKey:`context-${mode}-${i}`,ts:now+i,firstOccurredAt:now+i,text:`context text ${i} END`}));useConnection.setState({state:{status:'closed',roomId:base.roomId}});await new Promise(r=>setTimeout(r,200));useConnection.setState({events,listCount:events.length});
  },mode);
  await choose(page,'现场布局','布局：多区');
  let frame=page,viewport;
  if(mode==='native')viewport=page.locator('.scene-live-list').first();else{
    const path=mode==='laplace'?'/laplace/product/':mode==='blivechat'?'/blivechat/renderer':'/openlive/renderer';frame=undefined;
    for(let i=0;i<80&&!frame;i++){for(const f of page.frames().filter(f=>f.url().includes(path))){const el=await f.frameElement();if(await el.isVisible()&&await el.evaluate(e=>!!e.closest('.scene-live-list'))){frame=f;break}}if(!frame)await page.waitForTimeout(100)}assert.ok(frame);viewport=frame.locator(mode==='laplace'?'.event-list .scroll-area':'#item-scroller').first();
  }
  const row=id=>viewport.locator(`[data-event-id="${id}"],[data-compatible-event-id="${id}"]`).first();
  const visible=async id=>{for(let i=0;i<70;i++){if(await row(id).count()){const bounds=await row(id).boundingBox().catch(()=>null),area=await viewport.boundingBox().catch(()=>null);if(bounds&&area&&bounds.y+bounds.height>area.y&&bounds.y<area.y+area.height)return;}await page.waitForTimeout(100)}throw Error(`${mode} ${id} 没有进入可视区域`)};
  await viewport.hover();for(let i=0;i<7;i++){await page.mouse.wheel(0,10000);await page.waitForTimeout(150)}await page.mouse.wheel(0,-500);await page.waitForTimeout(350);
  const before=await viewport.evaluate(e=>{const b=e.getBoundingClientRect(),center=b.top+b.height/2;const rows=[...e.querySelectorAll('[data-event-id],[data-compatible-event-id]')].map(row=>({id:row.dataset.eventId??row.dataset.compatibleEventId,b:row.getBoundingClientRect()})).filter(row=>row.b.bottom>b.top&&row.b.top<b.bottom).sort((a,c)=>Math.abs(a.b.top+a.b.height/2-center)-Math.abs(c.b.top+c.b.height/2-center));return {id:rows[0].id,offset:rows[0].b.top-b.top}});
  const search=page.getByRole('searchbox',{name:'搜索现场事件内容'});await search.fill('context text 119 END');await page.waitForTimeout(450);
  await page.evaluate(async mode=>{const path='/src/stores/connection.ts';const {useConnection}=await import(performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname===path)?.name??path);const events=useConnection.getState().events,now=Date.now();useConnection.setState({events:[...events,{...events[0],id:`context-${mode}-120`,reactKey:`context-${mode}-120`,ts:now,firstOccurredAt:now,text:'context text 120 END'}],listCount:121})},mode);
  await page.getByRole('button',{name:'退出筛选'}).click();await visible(before.id);await page.waitForTimeout(600);
  const after=await row(before.id).evaluate(e=>{const parent=e.closest('.scene-live-list,#item-scroller,.scroll-area');return e.getBoundingClientRect().top-parent.getBoundingClientRect().top});assert.ok(Math.abs(after-before.offset)<4,`${mode} 多区新增消息后阅读位置变化: ${before.offset} -> ${after}`);
  await search.fill('context text 10 END');await page.waitForTimeout(600);const targetId=`context-${mode}-10`;await visible(targetId);
  if(mode==='native'){await row(targetId).hover();await row(targetId).getByRole('button',{name:'打开事件菜单'}).click()}else await row(targetId).click({button:'right'});
  await page.getByRole('menuitem',{name:'查看上下文',exact:true}).click();await visible(targetId);assert.equal(await search.inputValue(),'');
  await page.evaluate(async mode=>{const path='/src/stores/connection.ts';const {useConnection}=await import(performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname===path)?.name??path);const events=useConnection.getState().events,now=Date.now();useConnection.setState({events:[...events,{...events[0],id:`context-${mode}-121`,reactKey:`context-${mode}-121`,ts:now,firstOccurredAt:now,text:'context text 121 END'}],listCount:122})},mode);
  await page.getByRole('button',{name:'回到最新消息'}).first().click();await visible(`context-${mode}-121`);
  await search.fill('context text 10 END');await page.waitForTimeout(400);
  await page.evaluate(async mode=>{const path='/src/stores/connection.ts';const {useConnection}=await import(performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname===path)?.name??path);const events=useConnection.getState().events,now=Date.now();useConnection.setState({events:[...events,{...events[0],id:`context-${mode}-122`,reactKey:`context-${mode}-122`,ts:now,firstOccurredAt:now,text:'context text 122 END'}],listCount:123})},mode);
  await page.getByRole('button',{name:'退出筛选'}).click();await visible(`context-${mode}-122`);
  const latestDistance=await viewport.evaluate(e=>e.scrollHeight-e.scrollTop-e.clientHeight);assert.ok(latestDistance<4,`${mode} 退出筛选后未跟随最新: ${latestDistance}px`);
  results.push({mode,layout:'多区',filteredAppend:'原事件及偏移保持',context:'选择事件可见',latest:'新事件可见',followingAfterFilter:'继续显示最新事件'});console.log(results.at(-1));save('filter-context-acceptance',results);
  await choose(page,'现场布局','布局：双区');
}
}finally{await browser.close()}
