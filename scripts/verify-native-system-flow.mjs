import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
import fs from 'node:fs';
(async()=>{
 const b=await chromium.launch({channel:'chrome',headless:true});const p=await b.newPage({viewport:{width:1200,height:1700}});
 const out='design/native-system-flow-20261122';fs.mkdirSync(out,{recursive:true});const results=[];let caseId=0;
 try{
 await p.goto('http://127.0.0.1:1420/tests/fixtures/nativeLayoutRepair.html');await p.waitForFunction(()=>window.setNativeLayoutCase);
 for(const theme of ['default','card','bubble'])for(const [width,baseSize] of [[480,16],[260,24]])for(const avatar of [true,false])for(const icons of [true,false]){
  await p.evaluate(o=>window.setNativeLayoutCase(o),{caseId:++caseId,theme,width,baseSize,baseSizeCase:true,semantic:true,avatar,icons,target:'live',sampleKeys:['admin','block','silent','room-change','live-start','live-end','warning','cutoff'],eventChanges:{user:{uid:'flow',uname:'测试者',guardLevel:0}}});
  await p.locator('[data-fixture-case="'+caseId+'"]').waitFor();
  const data=await p.locator('.system-message').evaluateAll(es=>es.map(e=>{
   const box=x=>{if(!x)return null;const r=x.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,center:r.y+r.height/2,right:r.right}};
   const chars=x=>{if(!x)return[];const walker=document.createTreeWalker(x,NodeFilter.SHOW_TEXT);const result=[];let n;while(n=walker.nextNode())for(let i=0;i<n.length;i++){if(!n.textContent[i].trim())continue;const r=document.createRange();r.setStart(n,i);r.setEnd(n,i+1);result.push({text:n.textContent[i],...box(r)});}return result};
   return {type:e.closest('.event').className,copy:box(e.querySelector('.system-message-copy')),icon:box(e.querySelector('.system-message-icon')),avatar:box(e.querySelector('.avatar,.avatar-placeholder')),user:box(e.querySelector('.user')),name:chars(e.querySelector('.username')),message:chars(e.querySelector('.system-message-title > .message')),line:parseFloat(getComputedStyle(e).lineHeight)};
  }));
  for(const e of data){
   if(e.name.length){const a=e.name.at(-1),m=e.message[0];if(Math.abs(a.y-m.y)>.5)throw Error(JSON.stringify({theme,width,avatar,icons,error:'动作文字未接续用户名',e}));
    if(e.avatar&&Math.abs(e.avatar.center-e.user.center)>.5)throw Error(JSON.stringify({theme,width,error:'头像与用户信息未居中',e}));
    if(e.icon&&Math.abs(e.icon.center-e.user.center)>.5)throw Error(JSON.stringify({theme,width,error:'图标与用户信息未居中',e}));
   }
   if(e.icon&&Math.abs(e.icon.center-e.copy.y-e.line/2)>.5)throw Error(JSON.stringify({theme,width,error:'外侧图标未对齐首行',e}));
  }
  if(theme==='default'&&width===260&&avatar&&icons&&data[0].message.at(-1).y===data[0].message[0].y)throw Error('窄幅场景未覆盖文字部分接续、部分换行');
  results.push({theme,width,baseSize,avatar,icons,data});
  if(avatar&&icons)await p.locator('.fixture-surface').screenshot({path:`${out}/${theme}-${width}-${baseSize}.png`});
 }
 fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));console.log(`${results.length}组系统消息自然接续、部分换行、头像与图标对齐检查通过`);
 }finally{await b.close()}
})().catch(e=>{console.error(e.message);process.exit(1)});
