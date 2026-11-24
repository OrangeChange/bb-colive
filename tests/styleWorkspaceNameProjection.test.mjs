import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
let vite, blc, open, lap, row, appearance, display, styles;
before(async()=>{
 vite=await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-styleWorkspaceNameProjection.test.mjs",configFile:false,server:{middlewareMode:true,watch:null},optimizeDeps:{include:[],noDiscovery:true},appType:'custom',logLevel:'silent'});
 [blc,open,lap,row,appearance,display,styles]=await (async()=>{const result=[];for(const path of [
 '/src/compat/blivechat/runtime.tsx','/src/compat/openlive/runtime.tsx','/src/compat/laplace/runtime.tsx',
 '/src/components/EventRow.tsx','/src/themes/nativeComponentAppearance.ts','/src/eventDisplaySettings.ts','/src/eventStyleSettings.ts'
 ])result.push(await vite.ssrLoadModule(path));return result;})();
});
after(async()=>vite?.close());
const event={id:'mask-one',roomId:1,ts:1700000000000,msgType:0,text:'正文',user:{uid:'1',uname:'星河',guardLevel:0}};
for(const [mode,load] of [['blivechat',()=>blc.resolvePublishedBlivechatRender],['blivechat-open',()=>open.resolvePublishedOpenLiveRender]]){
 test(`${mode} 实际输出投影只转换副窗和 OBS 姓名且不污染事件`,()=>{
  const original=structuredClone(event);
  for(const target of ['windows','obs','live']){
   const document={themeId:'test',mode,revision:1,settings:{maskUsername:true,showUsername:true},styles:{baseCss:'',visualCss:'',customCss:''}};
   const context={target,targetId:'test',roomId:1,placement:'main',displayScale:1};
   const render=load()({document,context:{...context,roomId:'1'}},context);
   const record=render.listSurface.project(event,1);
   assert.equal(record.payload.authorName,target==='live'?'星河':'星***');
   assert.doesNotMatch(render.listSurface.css+(render.listSurface.appearanceCss??''),/font-size:\s*0\s*!important|#author-name\)::before/);
  }
  assert.deepEqual(event,original);
 });
}
test('LAPLACE 仅改已有姓名，不从空回复或空名单对象创建姓名',()=>{
 const source={type:'message',username:'星河',reply:{},receiver:{uname:''},list:[{},[1,'海盐',null],{uname:'李',uid:3}],message:'正文'};
 const result=lap.maskLaplaceProductEvent(source);
 assert.equal(result.username,'星***');
 assert.deepEqual(result.reply,{});
 assert.deepEqual(result.receiver,{uname:''});
 assert.deepEqual(result.list,[{},[1,'海***',null],{uname:'李***',uid:3}]);
 assert.deepEqual(lap.maskLaplaceProductEvent(result),result);
 assert.equal(source.username,'星河');
});
test('原生实际行显示首字三星，空姓名不产生星号',()=>{
 for(const [uname,want] of [['星河','星***'],['Alice','A***'],['李','李***'],['','']]){
  const html=renderToStaticMarkup(React.createElement(row.EventRow,{ev:{...event,user:{...event.user,uname}},liveLayout:true,maskUsername:true,
    displayPreferences:display.DEFAULT_EVENT_DISPLAY_PREFERENCES,eventStyleSettings:styles.createDefaultEventStyleSettings()}));
  if(want)assert.ok(html.includes(want),html);else assert.ok(!html.includes('***'),html);
 }
});





test('原生预览按目标传递打码，显示全部不绕过设置',async()=>{
 const {NativeStylePreviewSurface}=await vite.ssrLoadModule('/src/components/NativeStylePreviewSurface.tsx');
 for(const context of ['live','review','window-chat','window-pay','obs'])for(const mode of ['all','current']){
  const payload={context,mode,eventStyleSettings:{...styles.createDefaultEventStyleSettings(),display:{maskUsername:true}},events:[event]};
  const element=NativeStylePreviewSurface({payload});
  const area=element.props.children;
  assert.equal(area.props.maskUsername,!['live','review'].includes(context));
 }
});
test('两个 BLC 预览注册入口把目标打码交给姓名投影',async()=>{
 for(const [path,name] of [['blivechat','BlivechatPreview'],['openlive','OpenLivePreview']]){
  const mod=await vite.ssrLoadModule(`/src/compat/${path}/register.tsx`);
  for(const target of ['live','windows','obs']){
   const html=renderToStaticMarkup(React.createElement(mod[name],{document:{themeId:'t',mode:path==='openlive'?'blivechat-open':path,settings:{maskUsername:true},styles:{baseCss:'',visualCss:'',customCss:''}},previewTarget:target,thumbnail:false,previewMode:'static',displayAll:true}));
   assert.doesNotMatch(html,/#author-name[^<]*font-size:0/);
  }
 }
});
test('原生回复与名单沿实际行打码且保留正文、原始回调身份',()=>{
 const reply={uid:'2',uname:'海盐',guardLevel:0};
 const html=renderToStaticMarkup(React.createElement(row.EventRow,{ev:{...event,replyTo:reply},liveLayout:true,maskUsername:true,
  displayPreferences:display.DEFAULT_EVENT_DISPLAY_PREFERENCES,eventStyleSettings:styles.createDefaultEventStyleSettings()}));
 assert.ok(html.includes('@海***'),html);
 assert.equal(reply.uname,'海盐');
});

test('预览帧只在消费时转换记录和已呈现姓名，关闭恢复原名',async()=>{
 const {projectSourceNameFrame}=await vite.ssrLoadModule('/src/events/displayNameProjection.ts');
 const frame={epoch:1,records:[{payload:{id:'1',authorName:'星河',content:'正文'}}],presentation:{messages:[{id:'1',authorName:'星河',content:'正文'}],paidMessages:[{id:'1',authorName:'星河'}]}};
 const masked=projectSourceNameFrame(frame,true);
 assert.equal(masked.records[0].payload.authorName,'星***');
 assert.equal(masked.presentation.messages[0].authorName,'星***');
 assert.equal(masked.presentation.paidMessages[0].authorName,'星***');
 const replay={...frame,presentation:masked.presentation};
 assert.equal(projectSourceNameFrame(replay,false).presentation.messages[0].authorName,'星河');
 assert.equal(frame.records[0].payload.authorName,'星河');
 assert.equal(frame.presentation.messages[0].content,'正文');
});

test('两个 BLC 实际预览消息通道在静态和动态下开关打码',async()=>{
 const {createRequire}=await import('node:module');
 const {JSDOM}=createRequire(import.meta.url)('../vendor/blivechat/node_modules/jsdom');
 const {createRoot}=await import('react-dom/client');
 const {act}=await import('react');
 for(const [path,name,channel] of [['blivechat','BlivechatSourcePreview','bb-blivechat'],['openlive','OpenLiveSourcePreview','bb-openlive']])for(const previewMode of ['static','simulation']){
  const mod=await vite.ssrLoadModule(`/src/compat/${path}/${name.replace('Preview','Surface')}.tsx`);
  const dom=new JSDOM('<div id="root"></div>',{url:'https://bb.invalid/',pretendToBeVisual:true});
  const keys=['window','document','location','Element','Node','MutationObserver','IS_REACT_ACT_ENVIRONMENT'];
  const previous=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,location:dom.window.location,Element:dom.window.Element,Node:dom.window.Node,MutationObserver:dom.window.MutationObserver,IS_REACT_ACT_ENVIRONMENT:true});
  const root=createRoot(dom.window.document.getElementById('root'));
  const props={css:'',appearanceCss:'',config:{},thumbnail:false,previewMode,previewPlaying:false,displayAll:true};
  try{
   await act(async()=>root.render(React.createElement(mod[name],{...props,maskUsername:true})));
   const frame=dom.window.document.querySelector('iframe'),sent=[];
   frame.contentWindow.postMessage=message=>sent.push(message);
   const dispatch=(command,data)=>dom.window.dispatchEvent(new dom.window.MessageEvent('message',{source:frame.contentWindow,origin:dom.window.location.origin,data:{type:channel,command,data}}));
   await act(async()=>dispatch('ready'));
   if(previewMode==='static'){
    const records=sent.find(m=>m.command==='preview-window').data.records;
    assert.ok(records.filter(r=>(r.payload??r.data)?.authorName).every(r=>(r.payload??r.data).authorName.endsWith('***')),path);
   }else{
    await act(async()=>dispatch('preview-frame',{epoch:1,records:[{method:'onAddText',receivedAt:event.ts,payload:{id:'one',authorName:'星河',content:'正文'}}],presentation:{messages:[{id:'one',authorName:'星河',type:0}],paidMessages:[]}}));
    assert.equal(sent.filter(m=>m.command==='preview-present').at(-1)?.data.messages[0]?.authorName,'星***',path);
   }
   sent.length=0;
   await act(async()=>root.render(React.createElement(mod[name],{...props,maskUsername:false})));
   if(previewMode==='static')assert.ok(sent.find(m=>m.command==='preview-window').data.records.some(r=>(r.payload??r.data)?.authorName&&!(r.payload??r.data).authorName.endsWith('***')),path);
   else assert.equal(sent.filter(m=>m.command==='preview-present').at(-1)?.data.messages[0]?.authorName,'星河',path);
  }finally{await act(async()=>root.unmount());dom.window.close();Object.assign(globalThis,previous);}
 }
});
test('原生中奖名单的姓名和回复提示采用相同规则',()=>{
 const ev={...event,msgType:5,lottery:{winners:[{uid:'2',uname:'海盐'}]}};
 const html=renderToStaticMarkup(React.createElement(row.EventRow,{ev,allowWinnerExpansion:true,liveLayout:true,maskUsername:true,displayPreferences:display.DEFAULT_EVENT_DISPLAY_PREFERENCES,eventStyleSettings:styles.createDefaultEventStyleSettings()}));
 assert.ok(html.includes('海***'),html);
 assert.ok(!html.includes('海盐'),html);
});



test('LAPLACE 实际渲染保留回复有无且现场原名不变',async()=>{
 const {LaplaceEvent}=await vite.ssrLoadModule('/src/compat/laplace/components.tsx');
 const {createDefaultCompatibleThemeSettings}=await vite.ssrLoadModule('/src/themes/compatThemeSettings.ts');
 const settings={...createDefaultCompatibleThemeSettings('laplace'),maskUsername:true};
 for(const mode of ['obs','dashboard']){
  const html=renderToStaticMarkup(React.createElement(LaplaceEvent,{event,placement:'main',settings,mode}));
  assert.ok(html.includes(mode==='obs'?'星***':'星河'),html);
  assert.ok(!html.includes('reply-username'),html);
 }
 const html=renderToStaticMarkup(React.createElement(LaplaceEvent,{event:{...event,replyTo:{uid:'2',uname:'海盐',guardLevel:0}},placement:'main',settings}));
 assert.ok(html.includes('海***'),html);
});
