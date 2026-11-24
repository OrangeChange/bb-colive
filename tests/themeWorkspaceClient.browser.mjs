import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {zipSync} from 'fflate';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');

// Requires an explicitly provisioned independent client; never defaults to the normal client.
test('独立客户端工作区逐项确认导入、失败保留当前项及高级场景输入保存', {skip: !process.env.THEME_CLIENT_CDP}, async t=>{
  const expectedId=process.env.THEME_CLIENT_IDENTIFIER;
  assert.ok(expectedId && expectedId!=='cc.orange.danmu-app');
  const program=path.resolve(process.env.THEME_CLIENT_PROGRAM);
  const fixtures=path.resolve(process.env.THEME_CLIENT_FIXTURES);
  assert.ok(program.includes(path.sep+'.superpowers'+path.sep), '只在独立验收目录运行');
  fs.mkdirSync(fixtures,{recursive:true});
  const browser=await chromium.connectOverCDP(process.env.THEME_CLIENT_CDP);
  const page=browser.contexts()[0].pages().find(p=>p.url()==='http://tauri.localhost/');
  page.setDefaultTimeout(15000);
  const invoke=(command,args)=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
  const root=path.join(program,'style/native'),saved=path.join(fixtures,'native-during-failure');
  let moved=false;
  try{
    assert.equal(await invoke('plugin:app|identifier'),expectedId);
    const stateFiles=['native-theme-bindings.local.json','native-theme-runtime.local.json','compatible-theme-runtime.local.json','native-obs-configurations.local.json','native-obs-themes.local.json'];
    const stateRoot=path.join(process.env.APPDATA,expectedId);
    const before=stateFiles.map(name=>fs.readFileSync(path.join(stateRoot,name)));
    if(await page.getByRole('button',{name:'返回样式',exact:true}).isVisible())await page.getByRole('button',{name:'返回样式',exact:true}).click();
    await page.locator('article.theme-library-card').first().waitFor();
    await page.evaluate(()=>{const original=window.fetch.bind(window);window.testFiles=[];window.fetch=(url,options)=>decodeURIComponent(String(url)).split('/').pop()==='plugin:dialog|open'?Promise.resolve(new Response(JSON.stringify(window.testFiles),{headers:{'Content-Type':'application/json','Tauri-Response':'ok'}})):original(url,options)});
    const confirm=()=>page.getByRole('dialog',{name:'确认导入主题',exact:true});
    const select=async paths=>{await page.evaluate(paths=>window.testFiles=paths,paths);await page.getByRole('button',{name:'导入',exact:true}).click();const dialog=page.getByRole('dialog',{name:'导入主题',exact:true});await dialog.getByRole('button',{name:'选择文件',exact:true}).click();await dialog.getByRole('button',{name:'导入',exact:true}).click();await dialog.waitFor({state:'hidden'});await confirm().waitFor()};
    const id='queue-'+Date.now(),name='队列验收-'+Date.now();
    const base=await invoke('read_theme_document',{themeId:'native-default'});
    const create=(suffix,font)=>{const doc=structuredClone(base);doc.themeId=id;doc.origin='custom';doc.metadata.name=name;doc.settings.display.baseFontSize=font;const{settings,styles,...manifest}=doc,enc=new TextEncoder();const file=path.join(fixtures,suffix+'.zip');fs.writeFileSync(file,zipSync({'theme.json':enc.encode(JSON.stringify(manifest)),'settings.json':enc.encode(JSON.stringify(settings)),'base.css':enc.encode(styles.baseCss),'visual.css':enc.encode(styles.visualCss),'custom.css':enc.encode(styles.customCss)}));return file};
    const first=create('first',19),second=create('second',23),bad=path.join(fixtures,'bad.zip');fs.writeFileSync(bad,'invalid ZIP');
    await t.test('好坏包混选、确认前不写入、同ID更新复制与跳过',async()=>{
      await select([first,bad,second]);assert.equal((await invoke('list_theme_summaries')).some(d=>d.themeId===id),false);
      await confirm().getByRole('button',{name:'导入主题',exact:true}).click();
      await page.waitForFunction(id=>document.querySelector('[aria-label="确认导入主题"]')?.textContent?.includes(id),id);
      assert.equal((await invoke('read_theme_document',{themeId:id})).settings.display.baseFontSize,19);
      await confirm().getByRole('button',{name:'更新现有主题',exact:true}).click();await confirm().waitFor({state:'hidden'});
      assert.equal((await invoke('read_theme_document',{themeId:id})).revision,2);assert.equal((await invoke('read_theme_document',{themeId:id})).settings.display.baseFontSize,23);assert.match(await page.locator('body').innerText(),/bad.zip：无法导入/);
      await select([first,second]);await confirm().getByRole('button',{name:'跳过导入',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[aria-label="确认导入主题"]')?.textContent?.includes('主题标识'));
      assert.equal((await invoke('read_theme_document',{themeId:id})).revision,2);
      await confirm().getByRole('button',{name:'导入为副本',exact:true}).click();await confirm().waitFor({state:'hidden'});
      const copy=(await invoke('list_theme_summaries')).find(d=>d.name===name+' 副本');assert.ok(copy);assert.notEqual(copy.themeId,id);
    });
    await t.test('真实写入失败不出队，恢复后仅消费当前项',async()=>{
      await select([first,second]);assert.ok(root.startsWith(program+path.sep));assert.ok(saved.startsWith(fixtures+path.sep));
      fs.renameSync(root,saved);moved=true;fs.writeFileSync(root,'test-mode-root-obstruction');
      await confirm().getByRole('button',{name:'更新现有主题',exact:true}).click();await confirm().getByRole('alert').waitFor();assert.match(await confirm().innerText(),new RegExp(id));
      fs.renameSync(root,path.join(fixtures,'root-obstruction.txt'));fs.renameSync(saved,root);moved=false;
      await confirm().getByRole('button',{name:'更新现有主题',exact:true}).click();await page.waitForFunction(id=>document.querySelector('[aria-label="确认导入主题"]')?.textContent?.includes(id),id);
      await page.waitForFunction(async id=>(await window.__TAURI_INTERNALS__.invoke('read_theme_document',{themeId:id})).revision===3,id);
      await confirm().getByRole('button',{name:'跳过导入',exact:true}).click();await confirm().waitFor({state:'hidden'});
    });
    await t.test('高级场景输入写回，基础字号修改保留场景，保存后重开',async()=>{
      const cardFor=title=>page.locator('article.theme-library-card').filter({has:page.locator('strong').filter({hasText:new RegExp('^'+title+'$')})});
      const card=cardFor(name+'-场景');
      const sourceCard=cardFor('LAPLACE 气泡 Next × 明前奶绿');
      await sourceCard.getByRole('button',{name:'编辑',exact:true}).click();await page.getByRole('tab',{name:'高级编辑',exact:true}).click();await page.getByLabel('场景',{exact:true}).fill('blue');
      await page.getByRole('tab',{name:'基础设置',exact:true}).click();await page.locator('label.native-theme-number-field').filter({hasText:'基准字号 B'}).locator('input').fill('24');await page.getByRole('tab',{name:'高级编辑',exact:true}).click();assert.equal(await page.getByLabel('场景',{exact:true}).inputValue(),'blue');await page.getByRole('button',{name:'另存为',exact:true}).click();const info=page.getByRole('dialog',{name:'主题信息',exact:true});await info.getByLabel('主题名称',{exact:true}).fill(name+'-场景');await info.getByRole('button',{name:'保存',exact:true}).click();await info.waitFor({state:'hidden'});
      await page.getByRole('button',{name:'返回样式',exact:true}).click();await card.getByRole('button',{name:'编辑',exact:true}).click();await page.getByRole('tab',{name:'高级编辑',exact:true}).click();assert.equal(await page.getByLabel('场景',{exact:true}).inputValue(),'blue');
      await page.getByLabel('场景',{exact:true}).fill('spring');await page.getByRole('button',{name:'保存并更新',exact:true}).click();await page.getByRole('button',{name:'返回样式',exact:true}).click();
    });
    stateFiles.forEach((name,index)=>assert.deepEqual(fs.readFileSync(path.join(stateRoot,name)),before[index],name));
  }finally{
    if(moved){if(fs.existsSync(root)&&fs.statSync(root).isFile())fs.renameSync(root,path.join(fixtures,'root-obstruction.txt'));fs.renameSync(saved,root)}
    await browser.close();
  }
});
