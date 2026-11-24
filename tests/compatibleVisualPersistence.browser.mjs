import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const b=await chromium.connectOverCDP(process.env.PROGRAM_CDP||'http://127.0.0.1:9231');
const p=b.contexts()[0].pages().find(p=>!p.url().includes('window='));p.setDefaultTimeout(7000);
const results=[];const run=Date.now();
async function home(){if(await p.getByRole('button',{name:'返回样式',exact:true}).count())await p.getByRole('button',{name:'返回样式',exact:true}).click();const discard=p.getByRole('button',{name:'放弃修改',exact:true});if(await discard.isVisible().catch(()=>false))await discard.click();if(!await p.locator('.theme-library-card').count())await p.getByRole('button',{name:'样式',exact:true}).click();}
async function edit(name){await home();await p.locator('.theme-library-card').filter({has:p.locator('strong',{hasText:name})}).getByRole('button',{name:'编辑',exact:true}).click();await p.getByRole('tab',{name:'可视化编辑'}).click();await p.locator('[data-navigation-id="username"]').click();await p.locator('.native-event-scope-primary').getByRole('button',{name:'弹幕',exact:true}).click();await p.locator('.native-property-field.is-fontSize').waitFor();}
async function data(name){return p.evaluate(async name=>{const{invoke}=await import('/node_modules/@tauri-apps/api/core.js');const list=await invoke('list_theme_summaries');const item=list.find(x=>x.name===name);return item?invoke('read_theme_document',{themeId:item.themeId}):null;},name);}
async function saveAs(name){await p.getByRole('button',{name:'另存为',exact:true}).click();const dialog=p.getByRole('dialog',{name:'主题信息',exact:true});await dialog.getByRole('textbox',{name:'主题名称'}).fill(name);await dialog.getByRole('button',{name:'保存',exact:true}).click();await dialog.waitFor({state:'hidden'});}
async function frame(){await p.waitForFunction(()=>[...document.querySelectorAll('.compatible-theme-preview:not(.is-thumbnail) iframe')].some(e=>e.contentDocument?.querySelector('.event-list .event,yt-live-chat-item-list-renderer #item-scroller [data-compatible-event-id]')));for(const f of p.frames().slice(1)){const e=await f.frameElement().catch(()=>null);if(e&&await e.evaluate(e=>Boolean(e.closest('.compatible-theme-preview:not(.is-thumbnail)'))))return f;}throw Error('Preview not attached');}
const selector=mode=>mode==='laplace'?'.event-list .event--message .username':"yt-live-chat-text-message-renderer[data-"+(mode==='blivechat'?'blc':'openlive')+"-placement='main'] #author-name";
async function actual(mode,value){const f=await frame();await f.waitForFunction(({s,value})=>[...document.querySelectorAll(s)].some(e=>Math.abs(parseFloat(getComputedStyle(e).fontSize)-value)<.15),{s:selector(mode),value});return f.locator(selector(mode)).first().evaluate(e=>getComputedStyle(e).fontSize);}
async function save(){await p.locator('.native-editor-actions').getByRole('button',{name:'保存',exact:true}).click();await p.waitForTimeout(250);}
async function bindings(){return p.evaluate(async()=>{const{load}=await import('/node_modules/@tauri-apps/plugin-store/dist-js/index.js');const store=await load('native-theme-bindings.local.json',{autoSave:false,defaults:{}});return await store.get('bindings')??[];});}
try{
for(const [mode,name]of[['blivechat','BLC 原版默认'],['blivechat-open','BLC 开放版默认'],['laplace','LAPLACE 默认']]){
 if(process.env.PROGRAM_MODE&&process.env.PROGRAM_MODE!==mode)continue;
 const A=`验收-${mode}-${run}-A`,B=`验收-${mode}-${run}-B`;const row={mode};
 try{
 await edit(name);const builtinBefore=await data(name);const beforeBindings=await bindings();
 await p.getByRole('spinbutton',{name:'字号精确值'}).fill('24');await actual(mode,24);assert.deepEqual(await bindings(),beforeBindings);
 await saveAs(A);row.builtinProtected=JSON.stringify(await data(name))===JSON.stringify(builtinBefore);
 const first=await data(A);assert.ok(first);row.unit=first.settings.visualModel.common['danmaku|all|main|username'].fontSize.value;
 await p.getByRole('tab',{name:'基础设置'}).click();
 if(mode==='blivechat'){await p.getByRole('spinbutton',{name:'整体比例 G',exact:true}).fill('1.5');await actual(mode,36);await p.getByRole('spinbutton',{name:'字体比例 F',exact:true}).fill('2');row.scaled=await actual(mode,72);await p.getByRole('spinbutton',{name:'整体比例 G',exact:true}).fill('1');await p.getByRole('spinbutton',{name:'字体比例 F',exact:true}).fill('1');}
 if(mode==='laplace'){await p.getByRole('spinbutton',{name:'基准字号 B',exact:true}).fill('30');row.scaled=await actual(mode,36);await p.getByRole('spinbutton',{name:'基准字号 B',exact:true}).fill('20');}
 if(mode==='blivechat-open')row.scaled=await actual(mode,24);
 await p.getByRole('tab',{name:'高级编辑'}).click();await p.getByRole('button',{name:'自定义 CSS',exact:true}).click();const input=p.locator('.monaco-editor .view-lines');await input.waitFor();await p.getByRole('textbox',{name:'编辑自定义 CSS',exact:true}).waitFor();await input.click({position:{x:5,y:5}});await p.keyboard.press('ControlOrMeta+A');await p.keyboard.insertText('/* retained declaration */\n:root { --acceptance-value: 7; }\n'+selector(mode)+' { font-size: 24px !important; }');await p.waitForTimeout(400);await save();
 if(mode!=='blivechat-open'){await p.getByRole('tab',{name:'基础设置'}).click();await p.getByRole('spinbutton',{name:mode==='laplace'?'基准字号 B':'整体比例 G',exact:true}).fill(mode==='laplace'?'30':'1.5');row.fixed=await actual(mode,24);await p.getByRole('spinbutton',{name:mode==='laplace'?'基准字号 B':'整体比例 G',exact:true}).fill(mode==='laplace'?'20':'1');await save();}
 const aBefore=await data(A);await edit(name);await p.getByRole('spinbutton',{name:'字号精确值'}).fill('31');await actual(mode,31);await saveAs(B);const bBefore=await data(B);await edit(A);row.reopened=await actual(mode,24);assert.deepEqual(await data(B),bBefore);assert.deepEqual(await data(A),aBefore);assert.deepEqual(await data(name),builtinBefore);
 await p.locator('.native-editor-actions').getByRole('button',{name:'应用',exact:true}).click();await p.waitForTimeout(300);const live=await bindings();assert.equal(live.find(x=>x.targetKind==='live')?.themeId,aBefore.themeId);assert.equal(live.find(x=>x.targetKind==='windows')?.themeId,beforeBindings.find(x=>x.targetKind==='windows')?.themeId);
 await p.getByRole('combobox',{name:'应用位置'}).click();await p.getByRole('option',{name:'副窗口',exact:true}).click();await p.locator('.native-editor-actions').getByRole('button',{name:'应用',exact:true}).click();await p.waitForTimeout(300);const windows=await bindings();assert.equal(windows.find(x=>x.targetKind==='live')?.themeId,aBefore.themeId);assert.equal(windows.find(x=>x.targetKind==='windows')?.themeId,aBefore.themeId);row.applyIsolation=true;
 await home();await p.reload();await edit(A);row.reload=await actual(mode,24);assert.deepEqual(await data(A),aBefore);assert.deepEqual(await data(B),bBefore);assert.deepEqual(await data(name),builtinBefore);row.result='通过';
 }catch(e){row.result='失败';row.error=String(e.stack||e).slice(0,1400);}
 results.push(row);writeFileSync((process.env.ACCEPTANCE_DIRECTORY||'.superpowers/sdd/2026-10-28-compatible-visual-editor-implementation')+'/program-persistence.json',JSON.stringify(results,null,2));console.log(row);
}
assert.ok(results.every(row=>row.result==='通过'),JSON.stringify(results));
}finally{await b.close();}
