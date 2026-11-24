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
for(const theme of ['default','card','bubble'])for(const [width,baseSize]of[[480,16],[260,24]]){
 await render({theme,width,baseSize,sampleKeys:['text'],eventChanges:{danmuRepeatCount:3}});
 check(await page.locator('.event-row-slot-spacer').count()===0,theme+' 无空白节点');
 check(await page.locator('.repeat-count').evaluate((e,size)=>Math.abs(parseFloat(getComputedStyle(e).marginInlineStart)-size*.25)<.5,baseSize),theme+' 合并标记间距');
 const edge=await page.locator('.event-normal').evaluate(e=>({left:getComputedStyle(e).marginLeft,right:getComputedStyle(e).marginRight}));check(edge.left==='0px'&&edge.right==='0px',theme+' 左右外边距 '+JSON.stringify(edge));
 await render({theme,width,baseSize,sampleKeys:['blind-gift']});
 check(await page.locator('.blind-price').first().evaluate((e,size)=>parseFloat(getComputedStyle(e).marginInlineEnd)>=size*.25-.5,baseSize),theme+' 盲盒开出间距');
 check(await page.locator('.blind-profit.is-gain,.blind-profit.is-loss').count()>0,theme+' 盈亏语义');check(await page.locator('.blind-profit.text-danger,.blind-profit.text-success').count()===0,theme+' 无颜色状态');
 await render({theme,width,baseSize,sampleKeys:['pocket-start']});
 const baselines=await page.locator('.event-normal.redpocket-start').evaluate(e=>{const get=n=>{const t=[...n.childNodes].find(t=>t.nodeType===3&&t.textContent.trim());const r=document.createRange();r.setStart(t,0);r.setEnd(t,1);const b=r.getBoundingClientRect(),s=getComputedStyle(n),c=document.createElement('canvas').getContext('2d');c.font=s.fontWeight+' '+s.fontSize+' '+s.fontFamily;return {y:b.y+c.measureText(t.textContent[0]).fontBoundingBoxAscent,top:b.top}};return{action:get(e.querySelector('.activity-action .action')),price:get(e.querySelector('.price-value'))}});
 if(Math.abs(baselines.action.top-baselines.price.top)<baseSize*.5)check(Math.abs(baselines.action.y-baselines.price.y)<.6,theme+' 红包金额与动作共基线 '+JSON.stringify(baselines));
 const line=await page.locator('.redpocket-command').first().evaluate(e=>parseFloat(getComputedStyle(e).lineHeight));check(Math.abs(line-baseSize*(theme==='card'?1.5:1.25))<.6,theme+' 红包口令行高 '+line);
 await render({theme,width,baseSize,sampleKeys:['lottery-result','pocket-result']});
 const positions=await page.locator('.event-normal').evaluateAll(es=>es.map(e=>{const h=e.querySelector('.event-header').getBoundingClientRect(),b=e.querySelector('.winner-list-toggle').getBoundingClientRect(),c=e.querySelector('.event-card').getBoundingClientRect();return {headerTop:h.top,headerBottom:h.bottom,buttonTop:b.top,buttonBottom:b.bottom,right:c.right-b.right}}));for(const q of positions)check(q.buttonTop<q.headerBottom&&q.buttonBottom>q.headerTop&&q.right>=0,theme+' 名单在标题右侧 '+JSON.stringify(q));
 for(const t of await page.locator('.winner-list-toggle').all())await t.click();check(await page.locator('.winner-list[open]').count()===2,theme+' 名单展开');
 for(const scale of[1,1.25,1.5]){await render({theme,width,baseSize,contentScale:scale,sampleKeys:['text','normal-gift']});const g=await page.locator('.event-row-slot-content').evaluateAll(es=>es.map(e=>{const s=getComputedStyle(e);return{gap:parseFloat(s.paddingBottom),mark:e.hasAttribute('data-event-spacing'),slot:e.parentElement.getBoundingClientRect().height,content:e.getBoundingClientRect().height}}));check(Math.abs(g[0].gap-baseSize*.25)<.6&&g[1].gap===0,theme+' 间距与末行 '+JSON.stringify(g));check(g.every(x=>Math.abs(x.slot-x.content)<.6),theme+' 槽位完整计量 '+JSON.stringify(g));}
}
assert.deepEqual(failures,[]);console.log('部件间距、红包排版与缩放测量通过');}finally{await browser.close();await server.close()}
