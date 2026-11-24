import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.NATIVE_DETAIL_OUTPUT||'D:/CodexBuild/native-detail-final';
await mkdir(out,{recursive:true});
const browser=await chromium.connectOverCDP(process.env.NATIVE_ACCEPTANCE_CDP||'http://127.0.0.1:9223');
const page=browser.contexts()[0].pages().find(p=>p.url()==='http://tauri.localhost/');
assert(page,'需要运行实际程序并开启WebView2调试端口');
async function theme(name){
 if(await page.getByRole('button',{name:'返回样式',exact:true}).count())await page.getByRole('button',{name:'返回样式',exact:true}).click();
 else if(!await page.getByRole('tab',{name:'原生',exact:true}).count()){await page.getByRole('button',{name:'样式',exact:true}).click();await page.locator('.theme-library-card').first().waitFor();}
 await page.getByRole('tab',{name:'原生',exact:true}).click();
 await page.locator('.theme-library-card').filter({has:page.locator('strong').filter({hasText:new RegExp('^'+name+'$')})}).getByRole('button',{name:'编辑',exact:true}).click();
 await page.getByRole('combobox',{name:'预览样例',exact:true}).waitFor();
}
async function doc(){return page.locator('.native-theme-editor').evaluate(el=>{let f=el[Object.keys(el).find(k=>k.startsWith('__reactFiber'))];while(f){if(f.memoizedProps?.document&&f.memoizedProps?.onSettingsChange)return f.memoizedProps.document;f=f.return}})}
async function settings(s){await page.locator('.native-theme-editor').evaluate((el,s)=>{let f=el[Object.keys(el).find(k=>k.startsWith('__reactFiber'))];while(f){if(f.memoizedProps?.onSettingsChange){f.memoizedProps.onSettingsChange(s);return;}f=f.return}},s)}
async function scheme(label){await page.getByRole('combobox',{name:'预览主题',exact:true}).click();await page.getByRole('option',{name:label,exact:true}).click();}
const results=[];
try{for(const name of ['原生默认','卡片','轻量气泡']){
 await theme(name);const original=await doc();await writeFile(out+'/'+name+'-acceptance-before.json',JSON.stringify(original));
 try{
 assert(original.settings.display.usePriceGradient);assert.equal(original.styles.customCss.trim(),'');

 if(name==='卡片'){
  const icons=async()=>{const frame=page.frames().find(f=>f.parentFrame());await frame.evaluate(()=>document.fonts.ready);return frame.evaluate(()=>[...document.querySelectorAll('.event-normal')].flatMap(e=>[...e.querySelectorAll('.content > .gift-icon,.guard-purchase-icon,.event-media')].map(icon=>{const card=e.querySelector('.event-card'),a=icon.getBoundingClientRect(),b=card.getBoundingClientRect();return{type:e.className.replace(/\s+/g,' '),center:a.y+a.height/2-b.y}})))};
  await settings({...original.settings,display:{...original.settings.display,showTimestamp:false}});await page.waitForTimeout(200);const off=await icons();
  await settings({...original.settings,display:{...original.settings.display,showTimestamp:true}});await page.waitForTimeout(200);const on=await icons();
  assert.equal(off.length,on.length);for(let i=0;i<off.length;i++)assert(Math.abs(off[i].center-on[i].center)<1,JSON.stringify({off:off[i],on:on[i]}));
 }
 await settings({...original.settings,display:{...original.settings.display,showTimestamp:true}});
 await page.getByRole('combobox',{name:'预览样例',exact:true}).click();await page.getByRole('option',{name:'混合流',exact:true}).click();
 await page.getByRole('tab',{name:'基础设置',exact:true}).click();
 const alignment=await page.evaluate(()=>{const a=document.querySelector('.native-theme-baseline-fields .native-theme-setting-row button'),b=document.querySelector('.native-theme-subgroup .native-theme-toggle-grid .native-theme-setting-row:nth-child(2) button');return{basic:a.getBoundingClientRect().x,lower:b.getBoundingClientRect().x}});assert(Math.abs(alignment.basic-alignment.lower)<1,JSON.stringify(alignment));
 await page.getByRole('tab',{name:'可视化编辑',exact:true}).click();
 const scope=await page.evaluate(()=>({top:document.querySelector('.native-scope-strip > div button').getBoundingClientRect().x,price:document.querySelector('.native-price-gradient-scope button').getBoundingClientRect().x}));assert(Math.abs(scope.top-scope.price)<1,JSON.stringify(scope));
 for(const mode of ['浅色主题','深色主题']){
  await scheme(mode);await page.waitForTimeout(250);const frame=page.frames().find(f=>f.parentFrame());await frame.evaluate(()=>document.fonts.ready);
  const data=await frame.evaluate(()=>{
   const s=e=>getComputedStyle(e),r=e=>{const x=e.getBoundingClientRect();return{x:x.x,y:x.y,right:x.right,bottom:x.bottom,w:x.width,h:x.height}};
   const profit=[...document.querySelectorAll('.event.gift-blind')].map(e=>({sticky:e.classList.contains('event-sticky'),parts:[...e.querySelectorAll('.price,.blind-profit')].map(x=>({cls:x.className,color:s(x).color,size:s(x).fontSize,weight:s(x).fontWeight})),gap:e.classList.contains('event-sticky')?r(e.querySelector('.blind-profit')).x-r(e.querySelector('.price')).right:null}));
   const times=[...document.querySelectorAll('.event-normal .time:not(.lifecycle-time)')].map(t=>{const e=t.closest('.event'),card=e.querySelector('.event-card'),surface=card&&r(card).h?card:e;return{type:e.className,display:s(t).display,inline:t.classList.contains('time-inline'),parent:t.parentElement.className,rect:r(t),surface:r(surface)}});
   return{honor:document.querySelectorAll('.type-guard-honor .time').length,profit,times};
  });
  assert.equal(data.honor,0);assert(data.times.every(t=>t.parent.split(' ').includes('event-layout')));
  for(const positive of ['text-danger','text-success']){const sticky=data.profit.filter(p=>p.sticky).flatMap(p=>p.parts).find(p=>p.cls.includes(positive)),normal=data.profit.filter(p=>!p.sticky).flatMap(p=>p.parts).find(p=>p.cls.includes(positive));if(sticky&&normal)assert.equal(sticky.color,normal.color);}
  assert(data.profit.filter(p=>p.sticky).every(p=>Math.abs(p.gap-4)<1));
  if(name==='轻量气泡'){
   assert(data.profit.every(p=>{const a=p.parts.find(x=>x.cls.includes('gift-price')),b=p.parts.find(x=>x.cls.includes('blind-profit'));return a.size===b.size&&a.weight===b.weight}),JSON.stringify(data.profit));
   assert(data.times.filter(t=>t.type.includes('type-interaction')).every(t=>t.display==='inline'));
   assert(data.times.filter(t=>!t.type.includes('type-interaction')).every(t=>Math.abs(t.rect.x-t.surface.right-2)<=1));
  }else assert(data.times.some(t=>t.inline),'有空间的时间应同行');
  await frame.locator('.event-normal.gift-blind').last().screenshot({path:out+'/'+name+'-盲盒-'+mode+'.png'});
  await frame.locator('.event-normal.type-chat:not(:has(.big-emote,.banner-emote))').first().screenshot({path:out+'/'+name+'-弹幕-'+mode+'.png'});
  results.push({theme:name,mode,alignment,scope,...data});
 }
 await settings(original.settings);await page.getByRole('button',{name:'保存调整',exact:true}).click();
 }catch(error){await settings(original.settings);await page.getByRole('button',{name:'保存调整',exact:true}).click();throw error;}
 console.log(name+'：时间、盈亏及界面对齐通过');
 }
 await theme('原生默认');await page.getByRole('tab',{name:'可视化编辑',exact:true}).click();const original=await doc();let counter=original.settings.priceGradient?.nextCustomId??0;
 try{
 await page.getByRole('button',{name:'管理档位',exact:true}).click();let modal=page.getByRole('dialog',{name:'管理金额档位'});
 await modal.getByRole('spinbutton',{name:'档位 30 起始金额',exact:true}).fill('80');await modal.getByRole('button',{name:'完成',exact:true}).click();await page.getByRole('button',{name:'保存调整',exact:true}).click();await theme('原生默认');let current=await doc();assert.equal(current.settings.priceGradient.bands.find(b=>b.id==='band-1').min,80);assert.equal(current.styles.customCss,original.styles.customCss);
 await page.getByRole('tab',{name:'可视化编辑',exact:true}).click();await page.getByRole('button',{name:'管理档位',exact:true}).click();modal=page.getByRole('dialog',{name:'管理金额档位'});await modal.getByRole('button',{name:'添加档位',exact:true}).click();const first=(await doc()).settings.priceGradient.bands.at(-1);await modal.getByRole('button',{name:`删除 ${first.min} 元档位`,exact:true}).click();await modal.getByRole('button',{name:'添加档位',exact:true}).click();current=await doc();const second=current.settings.priceGradient.bands.at(-1);assert.notEqual(first.id,second.id);counter=current.settings.priceGradient.nextCustomId;await modal.getByRole('button',{name:'完成',exact:true}).click();results.push({thresholdSaved:true,cssStable:true,firstId:first.id,secondId:second.id});
 }finally{await settings({...original.settings,priceGradient:{...original.settings.priceGradient,nextCustomId:counter}});await page.getByRole('button',{name:'保存调整',exact:true}).click();}
 await scheme('跟随软件');await writeFile(out+'/verification.json',JSON.stringify(results,null,2));console.log('门槛修改、保存重开、增删档位标识通过');
}finally{await browser.close();}
