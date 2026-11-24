import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({server:{host:'127.0.0.1',port:0,hmr:false},logLevel:'error'});
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1000,height:1000}});
const failures=[];let id=0;
async function render(state){await page.evaluate(s=>window.setNativeLayoutCase(s),{theme:'default',target:'live',baseSizeCase:true,baseSize:16,width:480,avatar:true,timestamp:true,semantic:true,sampleKeys:['text'],...state,caseId:++id});await page.locator('[data-fixture-case="'+id+'"]').waitFor();await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))});}
function check(ok,label){if(!ok)failures.push(label)}
try{await server.listen();await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/nativeLayoutRepair.html');await page.waitForFunction(()=>typeof window.setNativeLayoutCase==='function');
for(const theme of ['default','card','bubble'])for(const [width,baseSize]of [[480,16],[260,24]]){
 await render({theme,width,baseSize,previewContext:'obs',sampleKeys:['lottery-result','pocket-result']});
 check(await page.locator('.winner-list-toggle').count()===2,theme+' OBS预览展开入口');
 for(const b of await page.locator('.winner-list-toggle').all())await b.click();await page.waitForTimeout(100);
 check(await page.locator('.winner-list[open]').count()===2,theme+' 实际展开');
 const overlaps=await page.locator('.event-normal').evaluateAll(es=>es.map(e=>{const t=e.querySelector('.event-layout > .time'),l=e.querySelector('.winner-list-items');if(!t||!l)return false;const a=t.getBoundingClientRect(),b=l.getBoundingClientRect();return a.width>0&&a.top<b.bottom-1&&a.bottom>b.top+1&&a.left<b.right&&a.right>b.left}));check(overlaps.every(x=>!x),theme+' 名单与时间不能重叠');
 await render({theme,width,baseSize,sampleKeys:['text'],eventChanges:{text:'正文内容',user:{uid:'alignment',uname:'用户名',guardLevel:0,medal:{name:'粉丝牌',level:15,color:6729215}}}});
 const m=await page.locator('.type-chat').evaluate(e=>{const text=n=>{const w=document.createTreeWalker(n,NodeFilter.SHOW_TEXT);let t;while(t=w.nextNode())if(t.textContent.trim())break;const r=document.createRange();r.setStart(t,0);r.setEnd(t,1);const b=r.getBoundingClientRect(),s=getComputedStyle(t.parentElement),c=document.createElement('canvas').getContext('2d');c.font=s.fontWeight+' '+s.fontSize+' '+s.fontFamily;const a=c.measureText(t.textContent[0]);return {center:b.y+a.fontBoundingBoxAscent+(a.actualBoundingBoxDescent-a.actualBoundingBoxAscent)/2,baseline:b.y+a.fontBoundingBoxAscent}};const body=text(e.querySelector('.message')),name=text(e.querySelector('.username'));return {body,name,graphics:[...e.querySelectorAll('.avatar-wrap,.fan-medal')].map(n=>{const r=n.getBoundingClientRect();return r.y+r.height/2})}});
 // 只比较同排的文字与图形，不拿分行后的正文中心比较首行头像。
 if(width===480){check(Math.abs(m.name.baseline-m.body.baseline)<1,theme+' 姓名正文共基线');check(m.graphics.every(c=>Math.abs(c-m.body.center)<=1.3),theme+' 图形与完整文字行中心一致 '+JSON.stringify(m));}
 await render({theme,width,baseSize,designKeys:['sc-band-4','sc-band-5']});
 const split=await page.locator('.sc-price').evaluateAll(es=>es.some(e=>{const a=e.querySelector('.price').getBoundingClientRect(),b=e.querySelector('.native-event-icon');if(!b||!b.getBoundingClientRect().width)return false;const r=b.getBoundingClientRect();return a.bottom<=r.top||r.bottom<=a.top}));check(!split,theme+' SC金额图标成组');
 await render({theme,width,baseSize,sampleKeys:['lottery-start','pocket-start']});
 const columns=await page.locator('.event-activity-card').evaluateAll(cs=>cs.map(c=>{const l=c.querySelector('.event-layout').getBoundingClientRect(),b=c.querySelector('.event-content').getBoundingClientRect();return b.left-l.left}));if(width===260)check(columns.every(x=>Math.abs(x)<1),theme+' 窄活动正文通栏');
 for(const dark of [false,true]){await render({theme,width,baseSize,dark,designKeys:['body-reply']});check(await page.locator('.reply').count()>0,theme+' 回复存在');const color=await page.locator('.reply').first().evaluate(e=>getComputedStyle(e).color);check(color===(dark?'rgb(255, 159, 186)':'rgb(251, 114, 153)'),theme+' 回复明暗 '+color);}
}
for(const dark of [false,true]){await render({target:'review',dark,designKeys:['body-reply']});check(await page.locator('.event-surface-archive .reply').count()>0,'回看回复存在');const color=await page.locator('.reply').first().evaluate(e=>getComputedStyle(e).color);check(color===(dark?'rgb(255, 159, 186)':'rgb(251, 114, 153)'),'回看回复明暗 '+color);}
for(const previewContext of ['live','window-chat','window-pay','review']){await render({previewContext,sampleKeys:['lottery-result','pocket-result']});check(await page.locator('.winner-list-toggle').count()===(previewContext==='window-chat'?0:2),previewContext+' 预览按事件范围提供展开入口');}
if(process.env.ALIGNMENT_SCREENSHOTS){await mkdir(process.env.ALIGNMENT_SCREENSHOTS,{recursive:true});for(const theme of ['default','card','bubble'])for(const [width,baseSize]of [[480,16],[260,24]]){await render({theme,width,baseSize,semantic:true,typographyOnly:true,sampleKeys:undefined});await page.locator('.fixture-surface').screenshot({path:process.env.ALIGNMENT_SCREENSHOTS+'/'+theme+'-'+width+'-'+baseSize+'.png'});}}
assert.deepEqual(failures,[]);console.log('整体对齐、结果展开与回复配色通过');}finally{await browser.close();await server.close()}
