import test from 'node:test';
import assert from 'node:assert/strict';
import {componentRuntime,findElement} from './helpers/componentRuntime.mjs';
const props=()=>({eventOptions:['弹幕','礼物'].map(value=>({value,label:value})),eventValues:[],onEventsChange(){},scheme:'light',motion:'static',background:'transparent',width:340,onSchemeChange(){},onMotionChange(){},onBackgroundChange(){},onWidthChange(){}});
test('窗口宽度只显示数值和单位，明暗只保留一个切换按钮',()=>{
 const runtime=componentRuntime('src/components/StylePreviewToolbar.tsx');let next;
 const tree=runtime.render('StylePreviewToolbar',{...props(),onSchemeChange:value=>next=value});
 assert.ok(findElement(tree,n=>n.type==='input'&&n.props['aria-label']==='窗口宽度'));
 const width=findElement(tree,n=>n.type==='label'&&n.props.title==='窗口宽度');assert.ok(width);assert.equal(findElement(width,n=>n.type==='span'&&n.props.children==='窗口宽度'),null);
 const toggle=findElement(tree,n=>n.type==='button'&&n.props['aria-label']==='切换为深色');assert.ok(toggle);toggle.props.onClick();assert.equal(next,'dark');
});
test('全部事件有可见选中状态，恢复全部后不残留分类选择',()=>{
 const runtime=componentRuntime('src/components/StylePreviewToolbar.tsx');let value=['礼物'];
 const render=()=>runtime.render('StylePreviewToolbar',{...props(),eventValues:value,onEventsChange:next=>value=next});
 const all=tree=>findElement(tree,n=>n.type==='button'&&n.props.children?.includes?.('全部事件'));
 all(render()).props.onClick();assert.deepEqual(value,[]);
 assert.equal(all(render()).props['aria-pressed'],true);assert.match(all(render()).props.className,/is-active/);
});
test('实时事件入口位于标题操作且明确表达激活状态',()=>{
 const runtime=componentRuntime('src/components/StylePreviewActions.tsx');let toggled=false;
 const tree=runtime.render('StylePreviewActions',{realtime:true,onRealtimeChange:()=>toggled=true});
 const button=findElement(tree,n=>n.type==='button'&&n.props['aria-label']==='实时事件');assert.ok(button);assert.equal(button.props['aria-pressed'],true);button.props.onClick();assert.equal(toggled,true);
});

test('OBS 实时开关订阅已保存配置，关闭后停止订阅并返回原样例',async()=>{
 const Actions=()=>null,Sample=()=>null;const sent=[];let receive,stopped=0;
 const runtime=componentRuntime('src/obs/ObsManagementPreview.tsx',{
  '@tauri-apps/api/event':{listen:async(_event,callback)=>{receive=callback;return()=>stopped++},emit:async(...args)=>sent.push(args)},
  '../components/StylePreviewActions.tsx':{StylePreviewActions:Actions},
  '../preview/EditorSamplePreview.tsx':{EditorSamplePreview:Sample},
  './obsSamples.ts':{OBS_SAMPLE_KINDS:['混合流','弹幕','礼物']},
 });
 const props={configuration:{id:'saved',themeId:'theme',roomId:'42'},saved:{id:'saved',themeId:'theme',roomId:'42'},displayScale:1,loadDocument:async()=>({mode:'native',themeId:'theme'}),previewHeaderTarget:{}};
 let tree=runtime.render('ObsManagementPreview',props);runtime.effects();await Promise.resolve();
 findElement(tree,n=>n.type===Actions).props.onRealtimeChange();tree=runtime.render('ObsManagementPreview',props);runtime.effects();await Promise.resolve();
 const subscription=sent.find(([event])=>event==='obs:subscribe');assert.equal(subscription[1].query.config,'saved');
 receive({payload:{clientId:subscription[1].clientId,message:{type:'state',events:[],connection:{message:''}}}});
 tree=runtime.render('ObsManagementPreview',props);assert.equal(findElement(tree,n=>n.type===Actions).props.realtime,true);
 findElement(tree,n=>n.type===Actions).props.onRealtimeChange();tree=runtime.render('ObsManagementPreview',props);runtime.effects();
 assert.equal(stopped,1);assert.ok(sent.find(([event])=>event==='obs:unsubscribe'));assert.ok(findElement(tree,n=>n.type===Sample));
 runtime.close();
});


test('OBS宽度输入请求工作台调整，数值跟随工作台宽度',()=>{
 const Toolbar=()=>null;let delta;
 const runtime=componentRuntime('src/obs/ObsManagementPreview.tsx',{
  '../components/StylePreviewToolbar.tsx':{StylePreviewToolbar:Toolbar},
  './obsSamples.ts':{OBS_SAMPLE_KINDS:['混合流']},
 });
 const tree=runtime.render('ObsManagementPreview',{configuration:{id:'saved',themeId:'theme'},displayScale:1,loadDocument:async()=>({mode:'native'}),geometry:{width:480,resizeBy:value=>delta=value}});
 const toolbar=findElement(tree,n=>n.type===Toolbar);assert.equal(toolbar.props.width,480);toolbar.props.onWidthChange(520);assert.equal(delta,40);
});
