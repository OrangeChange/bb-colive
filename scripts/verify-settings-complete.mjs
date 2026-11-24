import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const entry=`
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {mockIPC,mockWindows} from '@tauri-apps/api/mocks';
import {ThemeVisualPropertyField} from '/src/components/ThemeVisualPropertyField.tsx';
import {ThemeColorField} from '/src/components/ThemeColorField.tsx';
import '/src/App.css';
import '/src/components/nativeThemeEditor.css';
const root=createRoot(document.getElementById('root'));let sequence=0;
mockWindows('main');
mockIPC(command=>command==='plugin:app|version'?'0.5.1':command==='plugin:event|listen'?1:command==='obs_service_status'?{port:17920,running:true,clients:0}:command.includes('audio')&&command.includes('devices')?[]:null);
function Field({property,initialValue,mixed:initialMixed=false,controlled=false}){
 const [value,setValue]=useState(initialValue),[mixed,setMixed]=useState(initialMixed);
 const change=value=>{window.changes.push(value);setValue(value);setMixed(false)};
 return React.createElement('div',{className:'native-property-panel',style:{width:'100%',padding:16}},
 React.createElement(ThemeVisualPropertyField,{property,value,mixed,controlled,status:mixed?'混合值':'继承主题',fontFamilyOptions:[],onOpenFonts:()=>{},onChange:change,onPreviewChange:change,onRestore:()=>change(initialValue)}),
 React.createElement('output',{'data-current-value':true,hidden:true},JSON.stringify(value)));
}
function Color({initialValue,opaque=false}){const[value,setValue]=useState(initialValue);return React.createElement(ThemeColorField,{label:'测试颜色',value,opaque,onChange:setValue,onPreviewChange:setValue,inline:true})}
window.showField=props=>{window.changes=[];root.render(React.createElement(Field,{...props,key:++sequence}))};
window.showColor=props=>root.render(React.createElement(Color,{...props,key:++sequence}));
window.showPreview=async()=>{const{StylePreviewActions}=await import('/src/components/StylePreviewActions.tsx');Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{if(window.clipboardFail)throw Error('Clipboard unavailable');window.clipboardText=text}}});root.render(React.createElement(StylePreviewActions,{key:++sequence}));};
window.showCloud=async ready=>{
 const {CloudRecoverySettings}=await import('/src/components/CloudRecoverySettings.tsx');
 const {cloudRecoveryBindingClient}=await import('/src/cloudSync/cloudRecoveryRuntime.ts');
 cloudRecoveryBindingClient.load=async()=>ready?{status:'ready',binding:{baseUrl:'http://127.0.0.1:17990',serverId:'verification-server',serviceVersion:'0.3.0'}}:{status:'unbound',binding:null};
 cloudRecoveryBindingClient.save=async()=>{throw Error('network')};
 root.render(React.createElement(CloudRecoverySettings,{repository:null,key:++sequence}));
};
window.showBasic=async()=>{
 const{NativeThemeBasicSettings}=await import('/src/components/NativeThemeBasicSettings.tsx');
 const{createDefaultNativeThemeDisplaySettings}=await import('/src/themes/nativeComponentAppearance.ts');
 function Basic(){const[display,setDisplay]=useState(createDefaultNativeThemeDisplaySettings),[visibility,setVisibility]=useState(undefined);return React.createElement('div',{className:'native-editor',style:{width:'100%'}},React.createElement(NativeThemeBasicSettings,{display,visibility,onDisplayChange:setDisplay,onVisibilityChange:setVisibility}),React.createElement('output',{'data-basic-value':true,hidden:true},JSON.stringify(display)))}
 root.render(React.createElement(Basic,{key:++sequence}));
};
window.showReview=async()=>{const{ReviewStyleSettings}=await import('/src/components/ReviewStyleSettings.tsx');root.render(React.createElement(ReviewStyleSettings,{key:++sequence}))};
window.showSettings=async()=>{
 const {SettingsPanel}=await import('/src/components/SettingsPanel.tsx');
 const {createDefaultSceneSettings}=await import('/src/components/sceneSettings.ts');
 function Settings(){const[scene,setScene]=useState(createDefaultSceneSettings);const noop=()=>{};return React.createElement('div',{style:{height:'850px',width:'100%'}},React.createElement(SettingsPanel,{sceneSettings:scene,setSceneSettings:setScene,displayOpen:false,displayLocked:false,giftOpen:false,giftLocked:false,revenueSelection:{mode:'combined',selected:[]},onRevenueWindowMode:()=>{},onToggleDisplay:noop,onToggleDisplayLock:noop,onToggleGift:noop,onToggleGiftLock:noop,onResetWindowLayout:noop,onResetDisplayWindowLayout:noop,onResetGiftWindowLayout:noop,onResetAllWindowLayout:noop,diagnosticStatus:null,diagnosticMarkers:[],onMarkDiagnosticIssue:noop,onExportDiagnosticBundle:noop,onDiagnosticExportStateChange:noop,onOpenDiagnosticDirectory:noop}))}
 root.render(React.createElement(Settings,{key:++sequence}));
};
window.showField({property:'visible',initialValue:true,mixed:true});
`;
const vite=await createServer({server:{port:1438,strictPort:true,open:false},plugins:[{
 name:'settings-complete-verification',resolveId(id){if(id==='virtual:settings-complete')return '\0settings-complete'},
 load(id){if(id==='\0settings-complete')return entry},configureServer(server){server.middlewares.use('/__settings-complete',async(_req,res)=>{
 res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await server.transformIndexHtml('/__settings-complete','<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><link rel="icon" href="data:,"></head><body><div id="root"></div><script type="module" src="/@id/virtual:settings-complete"></script></body></html>'));
 })}
}]});
let browser;
try{
 await vite.listen();browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:400,height:900}});
 page.on('pageerror',error=>console.error(error.message));
 await page.goto('http://localhost:1438/__settings-complete');
 await page.locator('.native-property-group').waitFor();
 await page.evaluate(()=>window.showPreview());
 await page.getByRole('button',{name:'复制预览链接',exact:true}).click();
 await page.waitForFunction(()=>Boolean(window.clipboardText));
 await page.waitForTimeout(30);
 assert.equal(await page.getByRole('status').filter({hasText:'预览链接已复制'}).count(),1,'复制成功应在按钮附近反馈');
 await page.evaluate(()=>{window.clipboardFail=true});
 await page.getByRole('button',{name:'复制预览链接',exact:true}).click();await page.waitForTimeout(30);
 assert.equal(await page.getByRole('status').filter({hasText:'预览链接已复制'}).count(),0,'复制失败不能显示成功');
 await page.evaluate(()=>window.showField({property:'visible',initialValue:true,mixed:true}));
 await page.locator('.native-property-group').waitFor();
 assert.equal(await page.getByRole('switch',{name:'可见性',exact:true}).count(),1,'可见性应提供开关');
 assert.equal(await page.getByRole('switch',{name:'可见性',exact:true}).getAttribute('aria-checked').then(v=>v==='true'?1:0),0,'混合值不能默认覆盖');
 assert.equal(await page.evaluate(()=>window.changes.length),0);
 await page.getByRole('switch',{name:'可见性',exact:true}).click();
 assert.equal(await page.locator('[data-current-value]').textContent(),'true');
 await page.evaluate(()=>window.showField({property:'visible',initialValue:true,controlled:true}));
 await page.getByText('由 CSS 控制',{exact:true}).waitFor();
 assert.equal(await page.getByRole('switch',{name:'可见性',exact:true}).count(),0);
 await page.evaluate(()=>window.showField({property:'fontWeight',initialValue:620}));
 await page.getByRole('spinbutton',{name:'字重精确值',exact:true}).waitFor();
 assert.equal(await page.getByRole('radiogroup',{name:'常用字重',exact:true}).locator('input:checked').count(),0);
 await page.getByRole('radio',{name:'粗体',exact:true}).locator('..').click();
 assert.equal(await page.locator('[data-current-value]').textContent(),'700');
 await page.getByRole('spinbutton',{name:'字重精确值',exact:true}).fill('650');
 assert.equal(await page.locator('[data-current-value]').textContent(),'650');
 await page.evaluate(()=>window.showField({property:'color',initialValue:'',mixed:true}));
 await page.getByRole('button',{name:'颜色',exact:true}).click();
 await page.getByRole('group',{name:'常用颜色',exact:true}).waitFor();
 assert.equal(await page.getByRole('group',{name:'常用颜色',exact:true}).locator('[aria-pressed=true]').count(),0,'混合颜色不能将白色色样标为已选');
 assert.equal(await page.evaluate(()=>window.changes.length),0);
 await page.evaluate(()=>window.showColor({initialValue:'rgba(10, 20, 30, 0.35)'}));
 await page.getByRole('button',{name:'B站粉',exact:true}).click();
 assert.equal(await page.locator('.theme-color-precise input').inputValue(),'rgba(251, 114, 153, 0.35)');
 await page.evaluate(()=>window.showColor({initialValue:'transparent'}));
 await page.getByRole('button',{name:'B站粉',exact:true}).click();
 assert.equal(await page.locator('.theme-color-precise input').inputValue(),'#fb7299');
 for(const width of [320,400])for(const zoom of [1,1.25,1.5]){
  await page.setViewportSize({width,height:900});await page.evaluate(zoom=>document.documentElement.style.zoom=String(zoom),zoom);
  for(const property of ['visible','fontWeight']){
   await page.evaluate(property=>window.showField({property,initialValue:property==='visible'?true:620}),property);
   await page.waitForTimeout(30);assert.equal(await page.locator('.native-property-group').evaluate(e=>e.scrollWidth>e.clientWidth+1),false,property+' 不应横向溢出');
  }
 }
 await page.evaluate(()=>{document.documentElement.style.zoom='1';return window.showSettings()});
 await page.locator('.settings-panel-frame').waitFor();
 assert.equal(await page.getByRole('radiogroup',{name:'明暗',exact:true}).count(),1,'副窗口明暗应直接选择');
 await page.getByRole('radiogroup',{name:'明暗',exact:true}).getByRole('radio',{name:'深色',exact:true}).locator('..').click();
 const outputMode=await page.evaluate(async()=>{const{useGeneralSettings}=await import('/src/generalSettings.ts');return useGeneralSettings.getState().windowScheme});
 assert.equal(outputMode,'dark');
 assert.equal(await page.getByRole('radiogroup',{name:'显示方式',exact:true}).getByRole('radio',{name:'分窗显示',exact:true}).count(),1);
 await page.evaluate(()=>window.showCloud(false));
 const connection=page.getByRole('region',{name:'云端记录服务',exact:true});
 await connection.getByRole('textbox',{name:'服务器地址',exact:true}).fill('http://127.0.0.1:17990');
 await connection.locator('input[type=password]').fill('verification-token');
 await connection.getByRole('button',{name:'连接服务器',exact:true}).click();
 await connection.getByRole('alert').waitFor();
 assert.match(await connection.getByRole('alert').innerText(),/无法连接服务器/);
 assert.equal(await connection.locator('input[type=password]').inputValue(),'verification-token');
 await connection.locator('summary[aria-label="连接说明"]').click();
 assert.equal(await connection.locator('details').getAttribute('open')!==null,true);
 await page.keyboard.press('Escape');assert.equal(await connection.locator('details').getAttribute('open'),null);
 await page.evaluate(()=>window.showCloud(true));
 const recovery=page.getByRole('region',{name:'记录恢复',exact:true});
 await recovery.getByRole('textbox',{name:'直播间号',exact:true}).fill('25034104');
 await recovery.getByRole('button',{name:'恢复记录',exact:true}).click();
 assert.match(await recovery.getByRole('alert').innerText(),/回看档案暂不可用/);
 await page.evaluate(()=>window.showBasic());
 const identity=page.getByRole('radiogroup',{name:'大航海身份显示方式',exact:true});
 await identity.getByRole('radio',{name:'文字',exact:true}).locator('..').click();
 assert.equal(JSON.parse(await page.locator('[data-basic-value]').textContent()).guardIdentityDisplayMode,'text');
 for(const width of [320,400])for(const zoom of [1,1.25,1.5]){
  await page.setViewportSize({width,height:900});await page.evaluate(zoom=>document.documentElement.style.zoom=String(zoom),zoom);
  assert.equal(await page.locator('.native-theme-mode-grid').evaluate(e=>e.scrollWidth>e.clientWidth+1),false,`身份形式在${width}px/${zoom}倍下不应溢出`);
 }
 await page.evaluate(()=>{document.documentElement.style.zoom='1';return window.showReview()});
 await page.getByRole('button',{name:'样式设置',exact:true}).click();
 const range=page.getByRole('slider',{name:'基准字号滑动调整',exact:true});await range.focus();await page.keyboard.press('Home');
 assert.equal(await page.getByRole('spinbutton',{name:'基准字号',exact:true}).inputValue(),'14');
 await page.getByRole('spinbutton',{name:'基准字号',exact:true}).fill('20');await page.keyboard.press('Tab');
 assert.equal(await range.inputValue(),'20');
 console.log('样式混合值、CSS控制、可见性、字重精确值、色样透明度、窄宽缩放及副窗口选择通过');
}finally{await browser?.close();await vite.close()}
