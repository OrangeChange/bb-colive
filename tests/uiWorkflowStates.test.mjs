import { readUiSource } from "./helpers/readUiSource.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import { componentRuntime, findElement } from './helpers/componentRuntime.mjs';

const text = tree => typeof tree === 'string' || typeof tree === 'number' ? String(tree) : Array.isArray(tree) ? tree.map(text).join('') : tree && typeof tree === 'object' ? text(tree.props?.children) : '';

test('主题页头显示草稿保留状态，处理期间阻止重复应用', () => {
  const runtime = componentRuntime('src/components/ThemeEditorChrome.tsx');
  const props = { document:{metadata:{name:'原生默认'}},description:'原生样式',applyTarget:'live',onSave(){},onBack(){},onEditMetadata(){},onApply(){},onApplyTargetChange(){} };
  let tree=runtime.render('ThemeEditorHeader',{...props,dirty:true,saving:false});
  assert.match(text(tree),/草稿已保留/);
  tree=runtime.render('ThemeEditorHeader',{...props,dirty:true,saving:true});
  assert.match(text(tree),/处理中/);
  assert.equal(findElement(tree,el=>el.type==='button'&&text(el)==='应用').props.disabled,true);
  tree=runtime.render('ThemeEditorHeader',{...props,dirty:false,saving:false});
  assert.match(text(tree),/已保存/);
});

test('主题应用菜单保留更新已有输出与显式应用位置', () => {
  const ThemeActionMenu=()=>null;
  const calls=[];
  const runtime=componentRuntime('src/components/ThemeEditorChrome.tsx',{'./ThemeActionMenu.tsx':{ThemeActionMenu}});
  const target={label:'应用到现场',action:()=>calls.push('live')};
  const tree=runtime.render('ThemeEditorHeader',{document:{metadata:{name:'原生默认'}},description:'原生样式',
    onBack(){},onEditMetadata(){},onApply:()=>calls.push('references'),applyTargets:[target]});
  const menu=findElement(tree,node=>node.type===ThemeActionMenu&&node.props.label==='选择应用位置');
  assert.ok(menu);
  assert.deepEqual(menu.props.items.map(item=>item.label),['更新已有输出','应用到现场']);
  menu.props.items[0].action();menu.props.items[1].action();
  assert.deepEqual(calls,['references','live']);
  runtime.close();
});

test('首次历史检索失败可保留条件重试', () => {
  let retried=0,cleared=0;
  const runtime=componentRuntime('src/components/ReviewOwnerEventResults.tsx',{'../generalSettings.ts':{useGeneralSettings:select=>select({eventDisplayPreferences:{}})}});
  const tree=runtime.render('ReviewOwnerEventResults',{page:null,loading:false,error:'暂时无法读取',hasConditions:true,onRetry(){retried++},onClear(){cleared++}});
  const retry=findElement(tree,el=>el.type==='button'&&text(el)==='重试');
  assert.ok(retry);retry.props.onClick();assert.equal(retried,1);assert.equal(cleared,0);
});

test('连接信息读取失败可重新查询，恢复已有连接而不填写身份码', async () => {
  let calls=0;
  const runtime=componentRuntime('src/components/CloudRecoverySettings.tsx',{
    '../diagnostics/featureDiagnostics.ts':{recordFeatureDiagnostic(){}},
    '../cloudSync/cloudRecoveryRuntime.ts':{
      cloudRecoveryBindingClient:{load:async()=>{if(++calls===1)throw new Error('读取失败');return {status:'ready',binding:{baseUrl:'http://localhost',serverId:'test',serviceVersion:'1'}};}},
      cloudRecoveryTask:{subscribe(){return ()=>{}},getSnapshot(){return {status:'idle'}}},
    },
  });
  runtime.render('CloudRecoverySettings',{repository:null});runtime.effects();
  await new Promise(resolve=>setImmediate(resolve));
  let tree=runtime.render('CloudRecoverySettings',{repository:null});
  const retry=findElement(tree,el=>el.type==='button'&&text(el)==='重新查询');
  assert.ok(retry);retry.props.onClick();
  runtime.render('CloudRecoverySettings',{repository:null});runtime.effects();
  await new Promise(resolve=>setImmediate(resolve));
  tree=runtime.render('CloudRecoverySettings',{repository:null});
  assert.equal(calls,2);assert.match(text(tree),/已连接/);assert.doesNotMatch(text(tree),/读取失败/);
  runtime.close();
});

test('首次保存和另存期间共用保存状态，结束后释放', async () => {
  const source=ts.createSourceFile('ThemeWorkspace.tsx',readUiSource('src/components/ThemeWorkspace.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let callback;
  function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(source)==='saveAs')callback=node.initializer.getText(source);ts.forEachChild(node,visit);}visit(source);
  let saving=new Set(),release;
  const bindings={session:{themeId:'draft',document:{themeId:'draft'}},themeInfoDraft:{name:'副本',author:'',version:''},savingThemeInfo:false,
    setSavingThemeInfo(){},setSavingThemes(update){saving=update(saving)},sessionHost:{saveThemeSessionAs:()=>new Promise(resolve=>release=resolve),discardThemeSession(){}},setThemeInfoDraft(){},setSession(){},refresh:async()=>{},pendingApply:false,setPendingApply(){},removeDraftRecord:async()=>true,setError(){},themeSaveErrorMessage:()=>''};
  const saveAs=new Function(...Object.keys(bindings),ts.transpile(`return (${callback});`,{target:ts.ScriptTarget.ES2022}))(...Object.values(bindings));
  const pending=saveAs();assert.equal(saving.has('draft'),true);release({themeId:'copy'});await pending;assert.equal(saving.has('draft'),false);
});


test('应用保存当前内容并更新全部既有引用，无引用时只保存', async () => {
  const {saveAndUpdateThemeReferences,listThemeReferences,ThemeReferenceUpdateError}=await import('../src/themes/themeReferences.ts');
  const source=ts.createSourceFile('ThemeWorkspace.tsx',readUiSource('src/components/ThemeWorkspace.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let callback;
  function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(source)==='apply')callback=node.initializer.getText(source);ts.forEachChild(node,visit);}visit(source);
  for(const used of [true,false]){
    const events=[],session={themeId:'theme-a',persisted:true,dirty:true,saved:{themeId:'theme-a',revision:1}};
    let notice='',applying=new Set();
    const references=used?[{targetId:'live',targetKind:'live',themeId:'theme-a',revision:1},{targetId:'windows',targetKind:'windows',themeId:'theme-a',revision:1},{targetId:'obs-a',targetKind:'obs',themeId:'theme-a',revision:1},{targetId:'obs-b',targetKind:'obs',themeId:'theme-b',revision:1}]:[];
    const bindings={session,editorApplyTarget:null,setPendingApply(){},setApplyingThemes:f=>{applying=f(applying)},save:async()=>{events.push('save');session.dirty=false;return{themeId:'theme-a',revision:2}},drafts:()=>({remove:async()=>{events.push('draft')}}),loadThemeBindings:async()=>references,saveAndUpdateThemeReferences,listThemeReferences,publishSavedReference:async(d,b)=>{events.push(b.targetId);assert.equal(d.revision,2)},setFailedPublication(){},setError:v=>{notice=v},ThemeReferenceUpdateError,themeSaveErrorMessage:e=>e.message};
    const apply=new Function(...Object.keys(bindings),ts.transpile(`return (${callback});`,{target:ts.ScriptTarget.ES2022}))(...Object.values(bindings));
    await apply();assert.deepEqual(events,used?['save','draft','live','windows','obs-a']:['save','draft']);assert.equal(applying.size,0);assert.match(notice,used?/所有使用此主题的输出/:/没有输出/);
  }
});
