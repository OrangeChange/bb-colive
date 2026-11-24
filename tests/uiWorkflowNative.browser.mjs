import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {unzipSync,strFromU8} from 'fflate';

const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.connectOverCDP(process.env.UI_AUDIT_CDP || 'http://127.0.0.1:9235');
const page=browser.contexts()[0].pages()[0];page.setDefaultTimeout(12000);
const out='.hallmark/workflow-audit/after';fs.mkdirSync(out,{recursive:true});
const results=[];
const capture=async name=>{await page.screenshot({path:`${out}/${name}.png`});};
const record=(name,details={})=>{results.push({name,...details});fs.writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));};
try {
  assert.equal(await page.evaluate(()=>__TAURI_INTERNALS__.invoke('plugin:app|identifier')),'cc.orange.danmu-app.ui-refinement');
  await page.reload();
  await page.waitForFunction(()=>Boolean(window.__TAURI_INTERNALS__));
  await page.waitForFunction(async()=>(await import('/src/stores/session.ts')).useSession.getState().phase!=='restoring');
  await page.evaluate(async()=>{
    const {useSession}=await import('/src/stores/session.ts');
    useSession.setState({startLogin:()=>{}});
    await useSession.getState().logout();
    const auditSession={phase:'loggedIn',session:{cookie:'',refreshToken:'',mid:'0',uname:'界面验收',savedAt:Date.now()}};
    const {useGeneralSettings}=await import('/src/generalSettings.ts');useGeneralSettings.getState().setUiScale(1);
    const {useTheme}=await import('/src/theme.ts');useTheme.getState().setPalette('sakura');useTheme.getState().setMode('light');
    const originalFetch=window.fetch.bind(window);
    const originalPost=window.chrome.webview.postMessage.bind(window.chrome.webview);
    window.__workflowProbe={originalFetch,originalPost,delaySave:false,savePath:null,failBinding:true};
    window.chrome.webview.postMessage=message=>{
      const data=typeof message==='string'?JSON.parse(message):message;const probe=window.__workflowProbe;
      const reply=(id,value)=>setTimeout(()=>__TAURI_INTERNALS__.runCallback(id,value),0);
      if(data.cmd==='plugin:dialog|save' && probe.savePath)return reply(data.callback,probe.savePath);
      if(probe.failBinding && data.cmd==='load_cloud_recovery_binding')return reply(data.error,'连接信息读取失败');
      if(data.cmd==='write_theme_document' && probe.delaySave)return setTimeout(()=>originalPost(message),1200);
      originalPost(message);
    };
    window.fetch=async(input,init)=>{
      const url=decodeURIComponent(String(input));const probe=window.__workflowProbe;
      if(probe.failBinding && url.includes('load_cloud_recovery_binding'))
        return new Response('连接信息读取失败',{headers:{'Content-Type':'text/plain','Tauri-Response':'error'}});
      if(url.includes('ipc.localhost/') && url.includes('plugin:dialog|save') && probe.savePath)
        return new Response(JSON.stringify(probe.savePath),{headers:{'Content-Type':'application/json','Tauri-Response':'ok'}});
      if(url.includes('ipc.localhost/write_theme_document') && probe.delaySave)await new Promise(resolve=>setTimeout(resolve,1200));
      return originalFetch(input,init);
    };
    window.__workflowAuthCleanup=useSession.subscribe(state=>{if(state.phase!=='loggedIn')useSession.setState(auditSession);});
    useSession.setState(auditSession);
  });
  await page.getByRole('button',{name:'样式',exact:true}).click();
  if(await page.getByRole('button',{name:'返回样式',exact:true}).isVisible())await page.getByRole('button',{name:'返回样式',exact:true}).click();
  await page.locator('.theme-current-use-card').first().getByRole('button',{name:'编辑',exact:true}).click();
  await page.getByRole('tab',{name:'可视化编辑',exact:true}).click();
  for(const mode of ['light','dark'])for(const scale of [1,1.25]) {
    await page.evaluate(async({mode,scale})=>{(await import('/src/theme.ts')).useTheme.getState().setMode(mode);(await import('/src/generalSettings.ts')).useGeneralSettings.getState().setUiScale(scale);},{mode,scale});
    await page.waitForTimeout(350);
    const dimensions=await page.locator('.native-property-panel').evaluate(e=>({width:e.clientWidth,height:e.clientHeight}));
    assert.ok(dimensions.height>=240,JSON.stringify(dimensions));
    if(scale===1.25){await page.getByRole('combobox',{name:'事件范围',exact:true}).click();await page.getByRole('option',{name:'礼物 / 天选 / 天选开奖',exact:true}).click();await page.getByRole('combobox',{name:'用户身份',exact:true}).focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('Home');await page.keyboard.press('Enter');await page.getByRole('combobox',{name:'事件范围',exact:true}).click();await page.getByRole('option',{name:'全部事件',exact:true}).click();}
    else await page.locator('.native-event-scope-primary').getByRole('button',{name:'全部事件',exact:true}).click();
    await page.locator('.native-property-panel').scrollIntoViewIfNeeded();
    await capture(`native-editor-${mode}-${scale}`);record('原生编辑器',{mode,scale,...dimensions});
  }
  await page.evaluate(async()=>{(await import('/src/generalSettings.ts')).useGeneralSettings.getState().setUiScale(1);(await import('/src/theme.ts')).useTheme.getState().setMode('light');window.__workflowProbe.delaySave=true;});
  await page.getByRole('tab',{name:'基础设置',exact:true}).click();
  const toggle=page.getByRole('switch',{name:'按价格梯度配色',exact:true});
  await toggle.click();await page.locator('.native-editor-save-state').filter({hasText:'未保存'}).waitFor();
  await page.getByRole('button',{name:'保存调整',exact:true}).click();await page.locator('.native-editor-save-state').filter({hasText:'保存中'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'保存调整',exact:true}).isDisabled(),true);
  await toggle.click();await capture('saving-newer-draft');
  await page.getByText('此前调整已保存，仍有未保存的更改',{exact:true}).waitFor();assert.equal(await page.locator('.native-editor-save-state').innerText(),'未保存');
  await page.evaluate(()=>{window.__workflowProbe.delaySave=false;});
  await page.getByRole('button',{name:'保存调整',exact:true}).click();await page.getByText('调整已保存，应用后更新输出',{exact:true}).waitFor();
  assert.equal(await page.locator('.native-editor-save-state').innerText(),'已保存');
  await page.getByRole('button',{name:'应用',exact:true}).click();await page.getByText(/已应用/).first().waitFor();await capture('saved-applied');record('保存期间新草稿保留，保存与应用完成');
  await page.evaluate(()=>{window.__workflowProbe.delaySave=true;});
  await page.getByRole('button',{name:'另存为',exact:true}).click();
  const themeDialog=page.getByRole('dialog',{name:'主题信息',exact:true});await themeDialog.getByRole('textbox',{name:'主题名称',exact:true}).fill(`界面验收副本 ${Date.now()}`);
  await themeDialog.getByRole('button',{name:'保存',exact:true}).click();await themeDialog.getByRole('status').waitFor();assert.equal(await themeDialog.getByRole('button',{name:'保存',exact:true}).isDisabled(),true);await page.keyboard.press('Escape');assert.equal(await themeDialog.isVisible(),true);await capture('save-copy-busy');await themeDialog.waitFor({state:'hidden'});await page.evaluate(()=>{window.__workflowProbe.delaySave=false;});record('另存状态可见，忙碌弹窗保留');

  await page.evaluate(async()=>{
    const {getArchiveRepository,notifyArchiveRevision}=await import('/src/archive/archiveRuntime.ts');const repository=await getArchiveRepository();
    const ownerId='hallmark-audit-owner',sessionId='hallmark-audit-session',roomId=99887766,startedAt=Date.now()-3600000;
    await repository.upsertOwner({ownerId,roomId,uid:String(roomId),name:'界面审阅主播：较长的名称用于检查列表和页头的排版',createdAt:startedAt,updatedAt:Date.now()});
    await repository.upsertSession({ownerId,sessionId,roomId,title:'界面审阅场次：长标题、历史检索、收藏与数据导出',startedAt,endedAt:startedAt+1800000,status:'ended',recordingStatus:'stopped',quality:'complete'});
    await repository.appendEvents(Array.from({length:12},(_,i)=>({eventKey:`${sessionId}:${i}`,sessionId,roomId,ordinal:i,eventTs:startedAt+i*10000,primaryCategory:'danmu',userUid:`audit-${i}`,userName:`审阅用户${i}`,searchText:`界面审阅消息 ${i}`,payload:{id:`hallmark-audit-${i}`,roomId,ts:startedAt+i*10000,msgType:0,text:`界面审阅消息 ${i}`,user:{uid:`audit-${i}`,uname:`审阅用户${i}`,guardLevel:0}}})));
    notifyArchiveRevision();
  });
  await page.getByTitle('回看',{exact:true}).click();
  if(await page.getByRole('button',{name:'返回所有主播档案馆',exact:true}).isVisible())await page.getByRole('button',{name:'返回所有主播档案馆',exact:true}).click();
  await page.getByRole('tab',{name:'主播档案',exact:true}).click();
  const owner=page.getByRole('button',{name:/打开界面审阅主播.*的主播档案/});assert.equal(await owner.count(),1);await capture('review-owner-long-name');await owner.click();
  await page.getByRole('button',{name:'事件检索',exact:true}).click();
  if(await page.getByRole('button',{name:'清除条件',exact:true}).isVisible())await page.getByRole('button',{name:'清除条件',exact:true}).click();
  const keyword=page.getByRole('combobox',{name:'关键词',exact:true});
  await keyword.evaluate(element=>{
    let fiber=element[Object.keys(element).find(key=>key.startsWith('__reactFiber'))];
    while(fiber && fiber.type?.name!=='ReviewPanel')fiber=fiber.return;
    if(!fiber)throw new Error('未找到回看工作台');
    const repository=fiber.memoizedProps.repository;window.__workflowProbe.repository=repository;window.__workflowProbe.query=repository.queryOwnerEventGroups;
    repository.queryOwnerEventGroups=async()=>{throw new Error('暂时无法读取，请重试');};
  });
  await keyword.fill('审阅消息 11');await page.getByRole('button',{name:'添加',exact:true}).click();
  await page.getByRole('button',{name:'重试',exact:true}).waitFor();await capture('review-search-failed');
  await page.evaluate(()=>{window.__workflowProbe.repository.queryOwnerEventGroups=window.__workflowProbe.query;});
  await page.getByRole('button',{name:'重试',exact:true}).click();await page.getByRole('region',{name:'按直播场次分组的符合条件事件'}).waitFor();
  await page.getByText('符合条件 1 条',{exact:true}).waitFor();await capture('review-search-recovered');record('长名称单一进入焦点，首次检索失败保留条件重试');

  const exportPath=path.resolve(`${out}/archive-flow.xlsx`);
  await page.evaluate(file=>{window.__workflowProbe.savePath=file;},exportPath);
  await page.getByRole('button',{name:'导出数据',exact:true}).click();await page.getByRole('button',{name:'开始导出',exact:true}).click();
  await page.getByText(/已导出 1 条事件：/).waitFor();await capture('export-completed');
  const entries=unzipSync(fs.readFileSync(exportPath));assert.ok(Object.values(entries).some(bytes=>strFromU8(bytes).includes('界面审阅')));record('原生写入 Excel',{bytes:fs.statSync(exportPath).size});
  await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).last().click();
  await page.evaluate(()=>{window.__workflowProbe.failBinding=true;});
  await page.getByRole('button',{name:'从云端恢复',exact:true}).click();await page.getByRole('button',{name:'服务器设置',exact:true}).click();await page.getByRole('button',{name:'重新查询',exact:true}).waitFor();await capture('cloud-binding-failed');
  await page.evaluate(()=>{window.__workflowProbe.failBinding=false;});
  await page.getByRole('button',{name:'重新查询',exact:true}).click();await page.locator('[data-settings-anchor="cloud-recovery"]').getByText('未连接',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'重新查询',exact:true}).count(),0);await capture('cloud-binding-recovered');record('连接信息重新查询，无需重新填写身份码');
  console.log(JSON.stringify(results));
} finally {
  await page.evaluate(async()=>{window.__workflowAuthCleanup?.();delete window.__workflowAuthCleanup;const probe=window.__workflowProbe;if(probe){window.fetch=probe.originalFetch;window.chrome.webview.postMessage=probe.originalPost;if(probe.repository)probe.repository.queryOwnerEventGroups=probe.query;delete window.__workflowProbe;}(await import('/src/generalSettings.ts')).useGeneralSettings.getState().setUiScale(1);});
  await browser.close();
}
