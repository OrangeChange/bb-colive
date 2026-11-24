import {connect,home,choose,assert,save} from './compatibleVisualAcceptanceSupport.mjs';
const {browser,page}=await connect();
try {
  assert.equal(await page.evaluate(async()=>(await import('/node_modules/@tauri-apps/api/app.js')).getIdentifier()),'cc.orange.danmu-app.visual-acceptance-20261029');
  await page.reload();
  const edit=async name=>{await home(page);await page.locator('.theme-library-card').filter({has:page.locator('strong',{hasText:name,exact:true})}).getByRole('button',{name:'编辑',exact:true}).click();};
  const apply=async target=>{await choose(page,'应用位置',target);await page.locator('.native-editor-actions').getByRole('button',{name:'应用',exact:true}).click();};
  const waitBindings=async predicate=>{for(let i=0;i<100;i++){const entries=await page.evaluate(async()=>(await import('/src/themes/themeBindings.ts')).loadThemeBindings());if(predicate(entries))return entries;await page.waitForTimeout(100);}throw Error('目标绑定未更新');};
  await edit('验收-尺寸-blivechat-open-1793239661154');
  for (const target of ['现场','副窗口']) {
    await apply(target);
    await waitBindings(all=>all.some(b=>b.targetId===(target==='现场'?'live':'windows')&&b.themeId==='6f40fbc3-8ad5-49d9-9df2-abe00eaa4877'));
  }
  await edit('验收-尺寸-laplace-1793239661154');
  const input=page.getByRole('spinbutton',{name:'基准字号 B',exact:true});
  const initial=Number(await input.inputValue()); await input.fill(initial === 26 ? '25' : '26');
  await choose(page,'应用位置','现场');
  const saveButton=await page.locator('.native-editor-actions').getByRole('button',{name:'保存',exact:true}).boundingBox();
  const applyButton=await page.locator('.native-editor-actions').getByRole('button',{name:'应用',exact:true}).boundingBox();
  await page.mouse.click(saveButton.x+saveButton.width/2,saveButton.y+saveButton.height/2);
  await page.mouse.click(applyButton.x+applyButton.width/2,applyButton.y+applyButton.height/2);
  await choose(page,'应用位置','副窗口'); await apply('副窗口');
  const bindings=await waitBindings(all=>['live','windows'].every(id=>all.some(b=>b.targetId===id&&b.themeId==='44c730b4-a50d-49af-bec6-e893eb6bc80d')));
  const chosen=bindings.filter(b=>['live','windows'].includes(b.targetId));
  console.log(chosen);
  assert.equal(chosen[0].revision,chosen[1].revision);
  await home(page);
  if(!browser.contexts()[0].pages().some(p=>p.url().includes('window=display'))) await page.getByRole('button',{name:'打开弹幕窗',exact:true}).click();
  let floating;for(let i=0;i<60&&!floating;i++){floating=browser.contexts()[0].pages().find(p=>p.url().includes('window=display'));if(!floating)await page.waitForTimeout(100);}assert.ok(floating);
  await page.evaluate(async()=>{const {useConnection}=await import('/src/stores/connection.ts'),{createStylePreviewEvents}=await import('/src/components/stylePreviewEvents.ts'),{emitTo}=await import('/node_modules/@tauri-apps/api/event.js');const events=createStylePreviewEvents('混合流').map(e=>({...e,id:e.id+'-'+Date.now(),ts:Date.now(),firstOccurredAt:Date.now()}));useConnection.setState({events,state:{status:'closed',roomId:events[0].roomId},listCount:events.length});await emitTo('display','display:room-changed',{roomId:events[0].roomId,generation:Date.now()});await new Promise(resolve=>setTimeout(resolve,200));for(const event of events)await emitTo('display','display:danmu',event);});
  await page.getByTitle('现场（当前页）',{exact:true}).click();
  const output=async p=>{for(let i=0;i<80;i++){for(const f of p.frames().slice(1)){const el=await f.frameElement();if(f.url().includes('/laplace/product/')&&await el.isVisible()&&!await el.evaluate(e=>!!e.closest('.theme-library-card,.native-theme-preview')))return f;}await p.waitForTimeout(100);}throw Error('实际 LAPLACE 输出未加载');};
  const live=await output(page),aux=await output(floating);
  await page.evaluate(async()=>{const {emitTo}=await import('/node_modules/@tauri-apps/api/event.js'),{createStylePreviewEvents}=await import('/src/components/stylePreviewEvents.ts');const events=createStylePreviewEvents('混合流').map(e=>({...e,id:e.id+'-'+Date.now(),ts:Date.now(),firstOccurredAt:Date.now()}));await emitTo('display','display:room-changed',{roomId:events[0].roomId,generation:Date.now()});await new Promise(resolve=>setTimeout(resolve,200));for(const event of events)await emitTo('display','display:danmu',event);});
  await live.locator('.event-list [data-event-id]').first().waitFor({state:'attached',timeout:10000});
  await aux.locator('.event-list [data-event-id]').first().waitFor({state:'attached',timeout:10000});
  const liveEvent=await live.locator('.event-list [data-event-id]').first().count(),auxEvent=await aux.locator('.event-list [data-event-id]').first().count();
  assert.ok(liveEvent&&auxEvent,'两个窗口均应显示事件');
  await edit('验收-尺寸-laplace-1793239661154');
  await page.getByRole('spinbutton',{name:'基准字号 B',exact:true}).fill('27');
  await page.evaluate(async()=>{const {invoke}=await import('/node_modules/@tauri-apps/api/core.js');const document=await invoke('read_theme_document',{themeId:'44c730b4-a50d-49af-bec6-e893eb6bc80d'});document.revision++;await invoke('write_theme_document',{document});});
  await page.locator('.native-editor-actions').getByRole('button',{name:'保存',exact:true}).click();
  await page.getByText('主题文件已在外部更新，当前草稿仍然保留').waitFor({timeout:7000});
  await page.evaluate(()=>window.dispatchEvent(new Event('focus'))); await page.waitForTimeout(300);
  assert.ok(await page.getByText(/主题文件已在外部更新/).isVisible());
  const afterConflict=await page.evaluate(async()=>(await import('/src/themes/themeBindings.ts')).loadThemeBindings());
  assert.deepEqual(afterConflict.filter(b=>['live','windows'].includes(b.targetId)),chosen);
  save('save-apply-coordination',{bindings:chosen,liveEvent,auxEvent,externalConflict:'显示且未更改绑定'});
} finally { await browser.close(); }
