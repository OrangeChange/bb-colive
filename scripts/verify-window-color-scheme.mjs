import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const entry=`
import React from 'react';import {createRoot} from 'react-dom/client';
import {applyThemeToDocument,useTheme} from '/src/theme.ts';import {useGeneralSettings} from '/src/generalSettings.ts';
import {useCompatibleOutputScheme,CompatibleOutputSchemeContext} from '/src/themes/compatPreviewScheme.ts';
import {resolveWindowSurfaceColor,DEFAULT_WINDOW_APPEARANCE} from '/src/windowAppearance.ts';
import {createBuiltinNativeTheme} from '/src/themes/nativeBuiltinThemes.ts';
import {setNativeVisualProperty} from '/src/themes/nativeComponentAppearance.ts';
import {renderManagedNativeCss} from '/src/themes/nativeManagedCss.ts';import '/src/App.css';
const theme=createBuiltinNativeTheme('native-default');const target={event:'danmaku',identity:'all',part:'message'};
theme.settings.visualModel=setNativeVisualProperty(theme.settings.visualModel,target,'color',{source:'custom',value:'#123456'},'light');
theme.settings.visualModel=setNativeVisualProperty(theme.settings.visualModel,target,'color',{source:'custom',value:'#abcdef'},'dark');
const style=document.createElement('style');style.textContent=renderManagedNativeCss(theme.settings);document.head.append(style);
function Scheme({id}){const scheme=useCompatibleOutputScheme();return <output id={id}>{scheme}</output>}
createRoot(document.getElementById('root')).render(<><Scheme id="actual"/><CompatibleOutputSchemeContext.Provider value="light"><Scheme id="explicit"/></CompatibleOutputSchemeContext.Provider><div className="event-area"><div className="event type-chat user-normal"><span className="message event-user-content">验收</span></div></div></>);
window.configure=(palette,software,content,output='display')=>{document.documentElement.dataset.window=output;useTheme.setState({palette,mode:software,customColor:'#7c3aed'});useGeneralSettings.setState({windowScheme:content});const softwareScheme=software==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):software;applyThemeToDocument(palette,content==='follow'||output==='main'?softwareScheme:content,'#7c3aed');return {light:document.documentElement.classList.contains('light'),dark:document.documentElement.classList.contains('dark'),lightSurface:resolveWindowSurfaceColor(DEFAULT_WINDOW_APPEARANCE,'light'),darkSurface:resolveWindowSurfaceColor(DEFAULT_WINDOW_APPEARANCE,'dark'),custom:resolveWindowSurfaceColor({...DEFAULT_WINDOW_APPEARANCE,surfaceColor:{r:124,g:58,b:237,a:.6}},'dark')}};
`;
const vite=await createServer({server:{port:1449,strictPort:true,watch:{ignored:['**/src-tauri/target/**']}},optimizeDeps:{entries:[]},plugins:[{name:'window-color-fixture',resolveId:id=>id==='virtual:window-color'?'\0window-color':undefined,load:id=>id==='\0window-color'?{code:entry,map:null}:undefined,transform(code,id){if(id==='\0window-color')return import('esbuild').then(({transform})=>transform(code,{loader:'jsx',jsx:'automatic'}));},configureServer(server){server.middlewares.use('/__window-color',async(_req,res)=>{res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/__window-color','<html><head><meta charset="utf-8"></head><body><div id="root"></div><script type="module" src="/@id/virtual:window-color"></script></body></html>'));});}}]});
let browser;
try {await vite.listen();browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();await page.goto('http://localhost:1449/__window-color',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.configure);
for(const palette of ['sakura','pine','custom'])for(const software of ['light','dark'])for(const content of ['follow','light','dark'])for(const output of ['display','gift','gift-only','superchat','guard']){
const data=await page.evaluate(([p,s,c,o])=>window.configure(p,s,c,o),[palette,software,content,output]);const expected=content==='follow'?software:content;await page.waitForFunction(x=>document.querySelector('#actual')?.textContent===x,expected);
assert.equal(data.light,expected==='light');assert.equal(data.dark,expected==='dark');assert.equal(await page.locator('#explicit').textContent(),'light');
assert.equal(await page.locator('.message').evaluate(e=>getComputedStyle(e).color),expected==='light'?'rgb(18, 52, 86)':'rgb(171, 205, 239)');
assert.deepEqual(data.custom,{r:124,g:58,b:237,a:.6});if(palette==='sakura')assert.deepEqual(data.darkSurface,{r:26,g:22,b:24,a:1});if(palette==='pine')assert.deepEqual(data.darkSurface,{r:20,g:26,b:24,a:1});
}
await page.evaluate(()=>window.configure('sakura','light','dark','main'));await page.waitForFunction(()=>document.querySelector('#actual').textContent==='light');await page.emulateMedia({colorScheme:'dark'});await page.evaluate(()=>window.configure('sakura','system','follow','main'));await page.waitForFunction(()=>document.querySelector('#actual').textContent==='dark');await page.emulateMedia({colorScheme:'light'});await page.waitForFunction(()=>document.querySelector('#actual').textContent==='light');console.log('主题表面、浅深色事件规则、五类副窗口内容明暗与显式预览优先级通过');
} finally {await browser?.close();await vite.close();}
