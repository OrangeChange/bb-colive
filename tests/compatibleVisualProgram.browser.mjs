import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import {BLIVECHAT_CAPABILITY} from '../src/compat/blivechat/theme.ts';
import {OPENLIVE_CAPABILITY} from '../src/compat/openlive/theme.ts';
import {LAPLACE_CAPABILITY} from '../src/compat/laplace/theme.ts';
import {buildCompatibleVisualNavigation} from '../src/themes/compatibleVisualNavigation.ts';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=process.env.ACCEPTANCE_DIRECTORY||'.superpowers/sdd/2026-10-28-compatible-visual-editor-implementation';
const b=await chromium.connectOverCDP(process.env.PROGRAM_CDP||'http://127.0.0.1:9231');
const p=b.contexts()[0].pages().find(page=>!page.url().includes('window='));
if(process.env.PROGRAM_COVERAGE==='1'){
 await b.contexts()[0].addInitScript(()=>{
  window.addEventListener('message',event=>{
   const message=event.data;
   if(message?.channel==='bb-laplace'&&message.type==='render'){
    const plain=message.events.filter(e=>e.type==='message');
    if(plain[0]){plain[0].message='正文 ||剧透内容||';plain[0].userType=100;plain[0].wealthMedalLevel=30;plain[0].currentRank=1;}
    if(plain[1]){plain[1].message='正文 [表情]';plain[1].bmotes={'[表情]':{url:'/media/noface.gif'}};}
    for(const e of message.events){
     if(e.type==='toast')e.toastAmount=3;
     if(e.type==='superchat'){e.message='留言 ||剧透内容||';e.transMark=1;e.messageTrans='平台已有译文';e.deleted=true;}
     if((e.type==='red-envelope-result'||e.type==='lottery-result')&&e.list?.length){const existing=e.list;e.list=Array.from({length:80},(_,i)=>({...existing[i%existing.length],uid:900000+i,uname:`中奖用户${i+1}`}));}
    }
   }
   if((message?.type==='bb-blivechat'||message?.type==='bb-openlive')&&message.command==='hydrate'){
    const text=message.data?.records?.find(e=>e.method==='onAddText');if(text){const payload=text.payload??text.data;payload.isAdmin=true;payload.authorType=message.type==='bb-openlive'?2:1;payload.privilegeType=0;}
   }
  });
 });
 await p.reload();
}

p.setDefaultTimeout(5000);
async function openAncestors(target){
 for(let round=0;round<16&&!await target.isVisible();round++){
  let opened=false;
  for(const ancestor of await target.locator('xpath=ancestor::details').all()){
   if(await ancestor.getAttribute('open')!==null)continue;
   const summary=ancestor.locator(':scope > summary');
   if(await summary.isVisible()){await summary.click({position:{x:5,y:8}});opened=true;break;}
  }
  if(!opened)break;
 }
}
async function goHome(){await p.evaluate(async()=>await(await import('/node_modules/@tauri-apps/api/window.js')).getCurrentWindow().setFocus());const back=p.getByRole('button',{name:'返回样式',exact:true});if(await back.count())await back.click();const discard=p.getByRole('button',{name:'放弃修改',exact:true});if(await discard.isVisible().catch(()=>false))await discard.click();}
async function setPreview(label){const select=p.getByRole('combobox',{name:'预览目标',exact:true});if((await select.innerText()).includes(label))return;await select.click();await p.getByRole('option',{name:label,exact:true}).click();const frame=p.frames().find(f=>f.url().includes('/laplace/product/'));if(frame)await frame.waitForSelector(label==='现场'?'main[data-page=dashboard]':'main[data-page=obs]');}
const results=[];
try{

 for(const [cap,name] of [[BLIVECHAT_CAPABILITY,'BLC 原版默认'],[OPENLIVE_CAPABILITY,'BLC 开放版默认'],[LAPLACE_CAPABILITY,'LAPLACE 默认']]){
  if(process.env.PROGRAM_MODE&&process.env.PROGRAM_MODE!==cap.mode)continue;
  await goHome();if(!await p.locator('.theme-library-card').count())await p.getByRole('button',{name:'样式',exact:true}).click();
  await p.locator('.theme-library-card').filter({hasText:name}).getByRole('button',{name:'编辑',exact:true}).click();await p.getByRole('tab',{name:'可视化编辑'}).click();
  await p.waitForFunction(()=>[...document.querySelectorAll('.compatible-theme-preview:not(.is-thumbnail) iframe')].some(f=>f.contentDocument?.querySelector('yt-live-chat-item-list-renderer #item-scroller [data-compatible-event-id],.event-list .event')));
  let frame;
  for(const candidate of p.frames().slice(1)){
    const owner=await candidate.frameElement().catch(()=>null);
    if(owner&&await owner.evaluate(e=>Boolean(e.closest('.compatible-theme-preview:not(.is-thumbnail)')))){frame=candidate;break;}
  }
  if(!frame)throw Error('The editor preview frame is not attached');
  const entries=[];function collect(items,path=[]){for(const item of items){const next=[...path,item.label];if(item.part)entries.push({item,path:next.join(' / ')});collect(item.children??[],next)}}
  for(const group of buildCompatibleVisualNavigation(cap.mode,cap.parts))collect(group.items,[group.label]);
  for(const {item,path} of entries){
   if(item.placement==='detail' && process.env.PROGRAM_DETAILS!=='1')continue;
   if(process.env.PROGRAM_PART&&!process.env.PROGRAM_PART.split(',').includes(item.id))continue;
   const row={mode:cap.mode,id:item.id,path,placement:item.placement,part:item.part};
   try{
    if(cap.mode==='laplace')await setPreview(['timestampWrap','winnerToggle','deleted'].includes(item.part)?'现场':'副窗口');
    const target=p.locator(`[data-navigation-id="${item.id}"]`);await openAncestors(target);await target.click();
    if(item.placement==='main'&&cap.mode==='laplace'&&['timestampWrap','winnerToggle','deleted'].includes(item.part))await setPreview('现场');
    if(!item.event&&!item.global&&item.part!=='event'){
     const all=p.locator('.native-event-scope-primary').getByRole('button',{name:'全部事件',exact:true});if(await all.isVisible())await all.click();
    }
    await p.waitForTimeout(80);
    const selected=frame.locator('[data-compatible-editor-selected]');
    if(!await selected.count()){
     if(item.placement==='main'&&cap.mode==='laplace'){await setPreview('现场');await p.waitForTimeout(180);}
    }
    if(!await selected.count()&&item.id==='sticky-gift-image'){const showAll=p.getByRole('switch',{name:'显示全部部件'});if(await showAll.getAttribute('aria-checked')==='true')await showAll.click();await selected.first().waitFor({timeout:3000}).catch(()=>{});}
    if(!await selected.count()){row.result='未验';row.reason='当前来源样例没有匹配节点';results.push(row);continue;}
    const part=cap.parts[item.part];let property,field,input;
    for(const candidate of ['fontSize','paddingX','width','marginX'].filter(property=>part.properties.includes(property))){
     const candidateField=p.locator(`.native-property-field.is-${candidate}`),candidateInput=candidateField.locator('input[role=spinbutton]');
     await openAncestors(candidateInput);
     if(await candidateInput.isVisible()){property=candidate;field=candidateField;input=candidateInput;break;}
    }
    if(!input){row.result='未验';row.reason='当前字段由 CSS 控制或没有实际值';results.push(row);continue;}
    const value=property==='fontSize'?23:property==='width'?17:9,css=property==='fontSize'?'font-size':property==='paddingX'?'padding-inline-start':property==='marginX'?'margin-inline-start':'width';
    const before=await selected.first().evaluate((e,css)=>getComputedStyle(e).getPropertyValue(css),css);
    await input.fill(String(value));
    await input.press('Tab');
    await frame.waitForFunction(({css,value})=>[...document.querySelectorAll('[data-compatible-editor-selected]')].some(e=>Math.abs(parseFloat(getComputedStyle(e).getPropertyValue(css))-value)<0.1),{css,value},{timeout:4000});
    row.property=property;row.value=value;row.actual=await selected.first().evaluate((e,css)=>getComputedStyle(e).getPropertyValue(css),css);
    await field.getByRole('button',{name:'恢复继承'}).click();
    await frame.waitForFunction(({css,before})=>[...document.querySelectorAll('[data-compatible-editor-selected]')].some(e=>getComputedStyle(e).getPropertyValue(css)===before),{css,before},{timeout:4000});
    row.result='通过';row.restored=before;
   }catch(error){row.result='失败';row.reason=String(error).slice(0,500);}
   results.push(row);writeFileSync(`${output}/program-nodes-${cap.mode}${process.env.PROGRAM_PART?"-targeted":""}.json`,JSON.stringify(results.filter(x=>x.mode===cap.mode),null,2));
  }
  console.log(cap.mode,JSON.stringify(results.filter(x=>x.mode===cap.mode).reduce((counts,row)=>(counts[row.result]=(counts[row.result]??0)+1,counts),{})));
 }
 writeFileSync(`${output}/program-nodes${process.env.PROGRAM_PART?"-targeted":""}.json`,JSON.stringify(results,null,2));
 console.log('remaining',results.filter(x=>x.result!=='通过').map(x=>({mode:x.mode,id:x.id,result:x.result,reason:x.reason})));
}finally{await b.close()}
