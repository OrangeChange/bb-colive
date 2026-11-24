import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const entry=`
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ThemeVisualPropertyField} from '/src/components/ThemeVisualPropertyField.tsx';
import {SettingsChoiceControl} from '/src/components/SettingsChoiceControl.tsx';
import {ThemeVisualPropertyPanel} from '/src/components/ThemeVisualPropertyPanel.tsx';
import '/src/App.css';import '/src/components/nativeThemeEditor.css';
const root=createRoot(document.getElementById('root'));let sequence=0;
function Field({property='fontWeight',initial=500,custom=false,mixed=false}){
 const[value,setValue]=useState(initial),[local,setLocal]=useState(custom),[isMixed,setMixed]=useState(mixed),[saved,setSaved]=useState(false);window.markSaved=()=>setSaved(true);
 const change=next=>{setSaved(false);setValue(next);setLocal(true);setMixed(false)};
 const restore=()=>{setValue(initial);setLocal(false)};
 return <ThemeVisualPropertyPanel title="普通事件" context={[{label:'部件',value:'显示区域 / 事件 / 普通事件',path:true}]} canRestore={local} onRestore={restore}>
 <div className="native-property-sections"><details open><summary>文字</summary><div className="native-property-grid"><ThemeVisualPropertyField property={property} value={value} mixed={isMixed} saved={saved} status={local?'当前层覆盖':'继承主题'} fontFamilyOptions={[]} onOpenFonts={()=>{}} onChange={change} onPreviewChange={change} onRestore={local?restore:undefined}/></div></details></div>
 <output data-state hidden>{JSON.stringify({value,local})}</output></ThemeVisualPropertyPanel>
}
window.showField=props=>root.render(<Field {...props} key={++sequence}/>);
function Choices(){const[value,setValue]=useState('top');return <SettingsChoiceControl label="显示位置" value={value} options={[{value:'top',label:'顶部'},{value:'bottom',label:'底部'}]} onChange={setValue}/>}
window.showChoices=()=>root.render(<Choices key={++sequence}/>);
window.showField({});
`;
const vite=await createServer({server:{port:1439,strictPort:true},plugins:[{name:'settings-refinement',resolveId:id=>id==='virtual:refinement'?'\0refinement':undefined,load:id=>id==='\0refinement'?{code:entry,map:null}:undefined,transform(code,id){if(id==='\0refinement')return import('esbuild').then(({transform})=>transform(code,{loader:'jsx',jsx:'automatic'}))},configureServer(server){server.middlewares.use('/__refinement',async(_req,res)=>{res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/__refinement','<html lang="zh-CN"><head><meta charset="utf-8"><link rel="icon" href="data:,"></head><body><div id="root"></div><script type="module" src="/@id/virtual:refinement"></script></body></html>'))})}}]});
let browser;
try{
 await vite.listen();browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:700,height:900}});
 await page.goto('http://localhost:1439/__refinement');await page.locator('output[data-state]').waitFor({state:'attached'});
 const state=()=>page.locator('output[data-state]').textContent().then(JSON.parse);
 await page.getByRole('spinbutton',{name:'字重精确值'}).fill('700');assert.equal((await state()).local,true);
 await page.getByRole('spinbutton',{name:'字重精确值'}).fill('500');assert.equal((await state()).local,false,'切回继承值应恢复继承');
 await page.evaluate(()=>window.showField({custom:true}));await page.getByRole('spinbutton',{name:'字重精确值'}).fill('700');await page.getByRole('spinbutton',{name:'字重精确值'}).fill('500');assert.equal((await state()).local,true,'已有自定义不能被自动清除');
 await page.evaluate(()=>window.showField({}));await page.getByRole('spinbutton',{name:'字重精确值'}).fill('700');await page.evaluate(()=>window.markSaved());await page.getByRole('spinbutton',{name:'字重精确值'}).fill('500');assert.equal((await state()).local,true,'保存后的自定义值不沿用之前的继承基准');
 await page.evaluate(()=>window.showField({property:'visible',initial:true}));const visible=page.getByRole('switch',{name:'可见性',exact:true});await visible.click();assert.equal((await state()).value,false);await visible.click();assert.deepEqual(await state(),{value:true,local:false});
 await page.evaluate(()=>window.showField({property:'visible',initial:true,mixed:true}));await page.getByRole('switch',{name:'可见性',exact:true}).click();assert.equal((await state()).local,true,'混合值选择须产生明确覆盖');
 await page.evaluate(()=>window.showField({property:'color',initial:'#ffffff'}));await page.getByRole('button',{name:'颜色',exact:true}).click();await page.getByLabel('精确值',{exact:true}).fill('#ff0000');assert.equal((await state()).local,true);await page.getByLabel('精确值',{exact:true}).fill('rgb(255, 255, 255)');assert.equal((await state()).local,false,'颜色格式不同但颜色相同应恢复继承');
 await page.keyboard.press('Escape');await page.evaluate(()=>window.showField({custom:true}));await page.getByRole('button',{name:'全部恢复继承',exact:true}).waitFor();
 for(const width of [320,700,1600]){await page.setViewportSize({width,height:900});await page.evaluate(()=>document.documentElement.style.zoom='1.25');assert.deepEqual(await page.locator('.native-property-panel > header').evaluate(e=>({overflow:e.scrollWidth>e.clientWidth+1,restoreWidth:e.querySelector('button').getBoundingClientRect().width})),{overflow:false,restoreWidth:40},'恢复按钮不被上下文挤压');}
 await page.evaluate(()=>{document.documentElement.style.zoom='1';window.showChoices()});const radios=page.getByRole('radio');await radios.first().waitFor();assert.equal(await radios.count(),2);await page.getByRole('radio',{name:'底部',exact:true}).locator('..').click();assert.equal(await page.locator('input[type=radio]:checked').count(),1);await page.getByRole('radio',{name:'底部',exact:true}).press('ArrowLeft');assert.equal(await page.getByRole('radio',{name:'顶部',exact:true}).isChecked(),true);
 console.log('继承往返、已有覆盖、混合值、可见性开关与单选键盘行为通过');
}finally{await browser?.close();await vite.close()}
