import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out = '.hallmark/implemented'; fs.mkdirSync(out,{recursive:true});
const source = `import React from 'react';import {createRoot} from 'react-dom/client';
import {applyCustomPalette} from './src/customPalette.ts';
import * as actions from './src/components/actionButtonStyles.ts';
import {UiSelect} from './src/components/ui/Select.tsx';import {UiCombobox} from './src/components/ui/Combobox.tsx';
import {PanelSwitch} from './src/components/voicePanelPrimitives.tsx';
import {StylePreviewToolbar} from './src/components/StylePreviewToolbar.tsx';
import {RuntimeQueueSummary} from './src/components/RuntimeQueueSummary.tsx';
import {LoginScreen} from './src/components/LoginCard.tsx';import {useSession} from './src/stores/session.ts';
import {ObsServiceSettings} from './src/obs/ObsServiceSettings.tsx';
import {CloudRecoverySettings} from './src/components/CloudRecoverySettings.tsx';
import {DiagnosticSettings} from './src/components/DiagnosticSettings.tsx';
import {ThemeImportDialog} from './src/components/ThemeImportDialog.tsx';
import {ReviewOwnerList} from './src/components/ReviewOwnerList.tsx';
window.audit={count:0};window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};let resolveObs,rejectObs;
window.__TAURI_INTERNALS__={invoke:async(command)=>{if(command==='obs_service_status')return new Promise((resolve,reject)=>{resolveObs=resolve;rejectObs=reject});if(command==='plugin:store|load')return 1;if(command==='plugin:store|get')return [null,false];return null;},transformCallback:()=>1};
window.finishObs=(fail)=>fail?rejectObs(new Error('query failed')):resolveObs({running:true,port:17920,clients:0});
window.applyCustom=seed=>applyCustomPalette(document,seed);
window.session=useSession;useSession.setState({phase:'loggingIn',qrUrl:null,qrStatus:null,error:null});
function Controls(){return <>
<button id="accent" className={actions.accentSolidButtonClass}>保存</button><button id="danger" className={actions.dangerSolidButtonClass}>删除</button>
<button id="filter" className={actions.filterActionButtonClass}>清除筛选</button>
<button id="disabled" disabled className={actions.accentSolidButtonClass}>禁用操作</button>
<div className="theme-transfer-panel"><button id="transfer" className="is-primary">导入</button><button id="transfer-disabled" disabled className="is-primary">禁用导入</button></div>
<div className="theme-obs-page"><button id="obs-primary" className="is-primary">新建配置</button></div>
<div className="native-editor-actions"><button id="native-primary" className="is-primary">保存调整</button></div>
<span id="accent-text" className="text-accent-text bg-raised">已选择</span><span id="tertiary" className="text-t3 bg-raised">辅助说明</span>
<span id="success" className="text-success bg-success/10">操作成功</span><span id="warning" className="text-warning bg-warning/10">请检查</span>
<UiSelect ariaLabel="选择配置" value="a" options={[{value:'a',label:'配置甲'},{value:'b',label:'配置乙'}]} onValueChange={()=>audit.count++}/>
<UiSelect ariaLabel="禁用选择" disabled value="a" options={[{value:'a',label:'配置甲'}]} onValueChange={()=>{}}/>
<UiCombobox ariaLabel="禁用搜索" disabled value="" options={[]} onValueChange={()=>{}}/>
<input className="settings-control-surface" aria-label="设置输入"/><div className="settings-font-size-control"><input aria-label="字号"/></div>
<PanelSwitch label="开关" checked onChange={()=>audit.count++}/>
<RuntimeQueueSummary current={'当前播报内容'.repeat(20)} pendingCount={12} discardedCount={3} failedCount={1}/>
</>}
function Preview(){const [motion,setMotion]=React.useState('static'),[width,setWidth]=React.useState(360),[all,setAll]=React.useState(false);return <><StylePreviewToolbar eventValue="a" eventOptions={[{value:'a',label:'普通弹幕'}]} windowValue="live" windowOptions={[{value:'live',label:'现场'}]} scheme="system" motion={motion} displayAll={all} width={width} background="#ffffff" onEventChange={()=>{}} onWindowChange={()=>{}} onSchemeChange={()=>{}} onMotionChange={setMotion} onDisplayAllChange={()=>setAll(!all)} onBackgroundChange={()=>{}} onWidthChange={setWidth}/><output id="preview-result">{width}:{String(all)}</output></>}
const root=createRoot(document.getElementById('root'));window.show=mode=>root.render(<main>{mode==='controls'?<Controls/>:mode==='preview'?<Preview/>:mode==='login'?<LoginScreen/>:mode==='obs'?<ObsServiceSettings/>:mode==='cloud'?<CloudRecoverySettings repository={null}/>:mode==='diagnostic'?<DiagnosticSettings status={null} markers={[]} onMarkIssue={()=>{}} onExport={()=>{}} onExportStateChange={()=>{}} onOpenDirectory={()=>{}}/>:mode==='import'?<ThemeImportDialog onClose={()=>window.show('controls')} onTheme={async()=>{}} onCss={async()=>{}} onUrl={()=>{}}/>:<ReviewOwnerList level="home" anchors={[]} owners={[]} sessions={[]} owner={null} ownerSearchText="无结果" onClearSearch={()=>audit.count++} onOpenOwner={()=>{}} onOpenSession={()=>{}}/>}</main>);window.show('controls');`;
const bundled=await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,format:'esm',outfile:'fixture.js',loader:{'.png':'dataurl','.webp':'dataurl'},define:{'process.env.NODE_ENV':'"production"','import.meta.env.DEV':'false','import.meta.env.PROD':'true','import.meta.env.MODE':'"test"'},plugins:[{name:'cloud-port',setup(b){b.onResolve({filter:/\?raw$/},args=>({path:path.resolve(args.resolveDir,args.path.replace(/\?raw$/,'')),namespace:'raw'}));b.onLoad({filter:/.*/,namespace:'raw'},args=>({contents:fs.readFileSync(args.path,'utf8'),loader:'text'}));b.onResolve({filter:/cloudRecoveryRuntime\.ts$/},()=>({path:'cloud',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`const snapshot={status:'idle'};export const cloudRecoveryTask={subscribe:()=>()=>{},getSnapshot:()=>snapshot};export const cloudRecoveryBindingClient={load:()=>new Promise((resolve,reject)=>{window.finishBinding=(fail)=>fail?reject(new Error('读取失败，请重新连接服务器')):resolve({status:'unbound',binding:null})})};`}));}}],logLevel:'silent'});
const js=bundled.outputFiles.find(f=>f.path.endsWith('.js')).text;
const css=fs.readdirSync('dist/assets').filter(f=>f.endsWith('.css')).map(f=>fs.readFileSync('dist/assets/'+f,'utf8')).join('\n');
const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/app.js'?'application/javascript':req.url==='/app.css'?'text/css':'text/html');res.end(req.url==='/app.js'?js:req.url==='/app.css'?css:'<!doctype html><html lang="zh-CN"><head><link rel="stylesheet" href="/app.css"><style>body{overflow:auto!important}main{display:flex;flex-wrap:wrap;align-items:start;gap:12px;padding:16px}main>*{max-width:100%}.runtime-queue-summary{width:100%}.native-preview-toolbar{width:100%}.theme-obs-page{height:auto!important}.settings-font-size-control input{width:60px}.theme-transfer-panel{width:auto}</style></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>')});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try {
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:960,height:720}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#accent').waitFor();
 const metrics=[];
 for(const theme of ['sakura','pine','custom'])for(const dark of [false,true])for(const seed of theme==='custom'?['#808080','#f5c542','#00ffaa','#fce9f2','#20df40','#cfe8ff']:['']){
  await page.evaluate(({theme,dark,seed})=>{document.documentElement.dataset.theme=theme;document.documentElement.classList.toggle('dark',dark);if(seed)window.applyCustom(seed);}, {theme,dark,seed});
  for(const state of ['normal','hover'])for(const id of ['accent','danger','filter','transfer','obs-primary','native-primary','accent-text','tertiary','success','warning']){
   if(state==='hover')await page.locator('#'+id).hover();else await page.mouse.move(950,710);
   await page.waitForTimeout(150);
   const pair=await page.locator('#'+id).evaluate(el=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d',{willReadFrequently:true});
    const rgba=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data]};
    const chain=[];for(let node=el;node;node=node.parentElement)chain.unshift(node);let bg=[255,255,255];for(const node of chain){const c=rgba(getComputedStyle(node).backgroundColor);bg=bg.map((v,i)=>v*(1-c[3]/255)+c[i]*c[3]/255)}
    const fg=rgba(getComputedStyle(el).color),rgb=bg.map((v,i)=>v*(1-fg[3]/255)+fg[i]*fg[3]/255);
    const lum=c=>c.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);const a=lum(rgb),b=lum(bg);return {ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),fg:rgb,bg};
   });if(['accent','danger','transfer','obs-primary','native-primary'].includes(id))assert.deepEqual(pair.fg,[255,255,255],id+' 白色文字');metrics.push({theme,dark,seed,state,id,...pair});
  }
 }
 fs.writeFileSync(out+'/contrast.json',JSON.stringify(metrics,null,2));const failures=metrics.filter(m=>m.ratio<4.5);assert.deepEqual(failures,[],'实际样式的普通文字配对');
 for(const selector of ['#disabled','#transfer-disabled','[aria-label="禁用选择"]','[aria-label="禁用搜索"]']){
  await page.mouse.move(950,710);const el=page.locator(selector);const read=()=>el.evaluate(e=>{const s=getComputedStyle(e);return [s.backgroundColor,s.borderColor,s.boxShadow,s.filter]});const before=await read();await el.hover({force:true});await page.waitForTimeout(160);assert.deepEqual(await read(),before,selector+' 禁用悬停');
 }
 const select=page.getByRole('combobox',{name:'选择配置',exact:true});await select.click();await page.getByRole('option',{name:'配置乙'}).click();await page.waitForTimeout(180);assert.equal(await page.evaluate(()=>audit.count),1);await select.focus();await page.keyboard.press('Tab');await page.getByRole('textbox',{name:'设置输入',exact:true}).focus();assert.notEqual(await page.getByRole('textbox',{name:'设置输入',exact:true}).evaluate(e=>getComputedStyle(e).boxShadow),'none');
 await page.emulateMedia({forcedColors:'active'});await select.focus();assert.notEqual(await select.evaluate(e=>getComputedStyle(e).outlineStyle),'none');await page.emulateMedia({forcedColors:'none'});
 await page.evaluate(()=>show('preview'));await page.getByText('预览设置',{exact:true}).click();await page.getByRole('spinbutton',{name:'画布宽度'}).fill('480');await page.getByRole('switch',{name:'显示全部部件'}).click();await page.locator('#preview-result').filter({hasText:'480:true'}).waitFor();await page.getByRole('button',{name:'动态',exact:true}).click();await page.getByRole('button',{name:'播放',exact:true}).waitFor();
 for(const width of [360,960]){await page.setViewportSize({width,height:720});await page.screenshot({path:out+'/preview-'+width+'.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'预览横向溢出');}
 await page.evaluate(()=>show('login'));await page.getByText('正在生成二维码…',{exact:true}).waitFor();await page.evaluate(()=>session.setState({qrUrl:'https://example.com/login'}));await page.getByRole('img',{name:'B 站登录二维码'}).waitFor();await page.getByText('打开 B 站 App 扫码登录',{exact:true}).waitFor();
 await page.evaluate(()=>show('obs'));await page.getByText('正在查询本机服务…',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'重试启动',exact:true}).count(),0);await page.evaluate(()=>finishObs(true));await page.getByRole('button',{name:'重新查询',exact:true}).click();await page.evaluate(()=>finishObs(false));await page.getByText('本机服务已启动',{exact:false}).waitFor();
 await page.evaluate(()=>show('cloud'));await page.getByText('正在读取连接信息…',{exact:true}).waitFor();await page.evaluate(()=>finishBinding(true));await page.getByText('连接状态未知，请重新连接服务器',{exact:true}).waitFor();
 await page.evaluate(()=>show('diagnostic'));await page.getByText('状态未知',{exact:true}).waitFor();assert.equal(await page.getByText('未知',{exact:true}).count(),2);
 await page.evaluate(()=>show('empty'));await page.getByRole('button',{name:'清除搜索',exact:true}).click();assert.equal(await page.evaluate(()=>audit.count),2);
 await page.evaluate(()=>show('import'));await page.getByRole('radio',{name:'LAPLACE',exact:true}).check();await page.getByRole('group',{name:'CSS 来源'}).waitFor();await page.getByRole('radio',{name:'远程 URL',exact:true}).check();await page.getByRole('textbox',{name:'CSS 网址'}).fill('https://example.com/theme.css');await page.getByRole('button',{name:'加载预览',exact:true}).waitFor();await page.keyboard.press('Escape');await page.locator('#accent').waitFor();
 assert.deepEqual(errors,[]);console.log(JSON.stringify({contrastPairs:metrics.length,minimum:Math.min(...metrics.map(m=>m.ratio)),states:'配色、禁用、焦点、预览、登录、OBS、云端、诊断、空状态、导入通过'}));
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
