import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';

const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out=process.env.NATIVE_BEHAVIOR_OUTPUT ?? 'design/native-dom-layout-20261121/behavior';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:820,height:1000}});
const results=[];
let caseId=0;
async function render(state){
  const id=++caseId;
  await page.evaluate(s=>window.setNativeLayoutCase(s),{theme:'default',target:'live',width:480,baseSize:16,baseSizeCase:true,avatar:true,icons:true,rank:true,semantic:true,sampleKeys:['text'],...state,caseId:id});
  await page.locator(`[data-fixture-case="${id}"]`).waitFor();
  await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
}
async function fits(label){
  const bad=await page.locator('.event:not(.event-sticky)').evaluateAll(es=>es.flatMap(e=>[...e.querySelectorAll('*')].filter(n=>{
    const r=n.getBoundingClientRect(),a=e.closest('.fixture-surface').getBoundingClientRect();
    return n.checkVisibility()&&getComputedStyle(n).position!=='absolute'&&r.width>0&&(r.right>a.right+1||r.left<a.left-1);
  }).map(n=>n.className)));
  assert.deepEqual(bad,[],`${label} 内容溢出`);
}
try {
  await page.goto('http://127.0.0.1:1420/tests/fixtures/nativeLayoutRepair.html');
  await page.waitForFunction(()=>typeof window.setNativeLayoutCase==='function');
  const rich={uid:'layout-check',uname:'测试用户',avatar:'/media/native-preview/guard-redpocket-sender.jpg',guardLevel:1,currentRank:1,wealthLevel:7,medal:{name:'测试牌',level:12,color:6729215}};
  for(const theme of ['default','card','bubble'])for(const [width,baseSize] of [[480,16],[260,24]]) {
    const state={theme,width,baseSize};
    for(const hide of ['', '.rank-badge', '.username', '.badges', '.avatar-wrap', '.username,.badges,.rank-badge']) {
      const customCss=hide?hide.split(',').map(s=>`.event ${s}{display:none}`).join('\n'):'';
      await render({...state,eventChanges:{user:rich,danmuRepeatCount:3},customCss});
      await fits(`${theme}-${width}-${hide}`);
      const groups=await page.locator('.user,.badges').evaluateAll(es=>es.map(e=>({display:getComputedStyle(e).display,gap:parseFloat(getComputedStyle(e).columnGap),margin:[...e.children].filter(n=>getComputedStyle(n).display!=='none').map(n=>getComputedStyle(n).marginRight)})));
      for(const g of groups)if(g.display!=='none'){assert.ok(g.display.endsWith('flex'));assert.ok(Math.abs(g.gap-baseSize*.25)<.5);assert.ok(g.margin.every(m=>m==='0px'));}
    }
    await render({...state,eventChanges:{user:rich,danmuRepeatCount:3},visualModel:{common:{'all|all|message':{visible:{source:'custom',value:false}}},light:{},dark:{}}});
    assert.equal(await page.locator('.repeat-count').evaluate(e=>getComputedStyle(e).marginInlineStart),'0px',`${theme} 正文关闭后合并标记不叠加间距`);
    const hiddenModel={common:Object.fromEntries(['username','rank','guardBadge','anchorBadge','adminBadge','honor','medal'].map(part=>[`all|all|${part}`,{visible:{source:'custom',value:false}}])),light:{},dark:{}};
    await render({...state,eventChanges:{user:rich},visualModel:hiddenModel});
    assert.equal(await page.locator('.user').first().evaluate(e=>getComputedStyle(e).display),'none',`${theme} 隐藏所有用户部件`);
    await render({...state,eventChanges:{user:rich},visualModel:{...hiddenModel,common:{...hiddenModel.common,'all|all|username':{visible:{source:'custom',value:true}}}}});
    assert.notEqual(await page.locator('.user').first().evaluate(e=>getComputedStyle(e).display),'none',`${theme} 恢复用户名`);
    await render({...state,sampleKeys:['lottery-result','pocket-result']});
    for(const toggle of await page.locator('.winner-list-toggle').all())await toggle.click();
    assert.equal(await page.locator('.winner-list[open]').count(),2);
    await fits(`${theme}-${width}-展开名单`);
    await page.locator('.fixture-surface').screenshot({path:`${out}/${theme}-${width}-winners.png`});
    await render({...state,timestamp:true,sampleKeys:['lottery-result'],eventChanges:{lottery:{awardName:'测试奖品',awardNum:2,winners:[{uid:'1',uname:'用于检查展开名单与时间关系的长用户名一'},{uid:'2',uname:'用于检查展开名单与时间关系的长用户名二'}]}}});
    if(!await page.locator('.winner-list').evaluate(e=>e.open))await page.locator('.winner-list-toggle').click();
    await page.waitForFunction(()=>!document.querySelector('.event:not(.event-sticky) > .time')?.classList.contains('time-inline'));
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const overlap=await page.locator('.event:not(.event-sticky)').evaluate(e=>{
      const t=e.querySelector(':scope > .time').getBoundingClientRect();
      const list=e.querySelector('.winner-list-items').getBoundingClientRect();
      return [...e.querySelectorAll('.winner-list-item')].some(n=>{const r=n.getBoundingClientRect();return Math.min(t.right,r.right,list.right)>Math.max(t.left,r.left,list.left)+1&&Math.min(t.bottom,r.bottom,list.bottom)>Math.max(t.top,r.top,list.top)+1;});
    });
    assert.equal(overlap,false,`${theme}-${width} 展开名单与时间不重叠`);
    await render({...state,sampleKeys:['reply','mixed-emote','big-emote','banner-emote','block','silent','admin','room-change','live-start','live-end','warning','cutoff']});
    await page.waitForFunction(()=>[...document.querySelectorAll(".big-emote,.banner-emote,.inline-emote")].every(e=>e.complete&&e.naturalWidth>0));
    assert.equal(await page.locator(".big-emote,.banner-emote").count(),2);
    await fits(`${theme}-${width}-表情及系统`);
    assert.equal(await page.locator('.reply').count(),1);
    const alignment=await page.locator('.system-message').evaluateAll(es=>es.map(e=>{
      const icon=e.querySelector('.system-message-icon'),copy=e.querySelector('.system-message-copy');
      if(!icon||!copy)return 0;
      const r=icon.getBoundingClientRect(),c=copy.getBoundingClientRect();
      return Math.abs(r.top+r.height/2-c.top-parseFloat(getComputedStyle(copy).lineHeight)/2);
    }));
    assert.ok(alignment.every(d=>d<1),`${theme}-${width} 系统图标第一行居中 ${alignment}`);
    await page.locator('.fixture-surface').screenshot({path:`${out}/${theme}-${width}-systems.png`});
    for(const target of ['window','review']){
      await render({...state,target,sampleKeys:['text','blind-gift','translated-sc','guard','honor','lottery-result','pocket-result','block']});
      await fits(`${theme}-${width}-${target}`);
      await page.locator('.fixture-surface').screenshot({path:`${out}/${theme}-${width}-${target}.png`});
    }
    await render({...state,previewContext:'obs',sampleKeys:['text','normal-gift','guard','translated-sc','lottery-result']});
    assert.ok(await page.locator('.theme-target-obs .event:not(.event-sticky)').count()>0);
    await fits(`${theme}-${width}-OBS预览`);
    results.push({theme,width,baseSize,visibility:true,winners:true,systems:true,window:true,review:true,obs:true});
  }
  for(const theme of ['default','card','bubble']) {
    await render({theme});
    const menu=await page.locator('.event-row-actions').first().evaluate(e=>({right:e.getBoundingClientRect().right,slot:e.closest('.event-row-slot-content').getBoundingClientRect().right}));
    assert.ok(Math.abs(menu.right-menu.slot+8)<=1,`${theme} 菜单按整行右侧定位 ${JSON.stringify(menu)}`);
    await render({theme,eventChanges:{user:rich}});
    const centers=await page.locator('.user,.badges').evaluateAll(es=>es.flatMap(e=>{
      const rs=[...e.children].map(n=>n.getBoundingClientRect());
      return rs.flatMap((r,i)=>rs.slice(i+1).filter(s=>Math.min(r.bottom,s.bottom)>Math.max(r.top,s.top)).map(s=>Math.abs(r.top+r.height/2-s.top-s.height/2)));
    }));
    assert.ok(centers.every(d=>d<1),`${theme} 用户信息组内居中 ${centers}`);
    for(const contentScale of [1,1.25,1.5]){
      await render({theme,contentScale,sampleKeys:['text','normal-gift','guard','sc']});
      await fits(`${theme}-${contentScale} 缩放`);
    }
    await render({theme,eventChanges:{user:rich},customCss:'.user > .username{order:2}.user > .badges{order:1}'});
    assert.ok(await page.locator('.user').first().evaluate(e=>e.querySelector('.badges').getBoundingClientRect().left<e.querySelector('.username').getBoundingClientRect().left));
    for(const key of ['normal-gift','blind-gift']){
      await render({theme,sampleKeys:[key],customCss:'.content > .gift-price{order:-1;margin-inline-start:0}'});
      assert.ok(await page.locator('.content').first().evaluate(e=>e.querySelector('.gift-price').getBoundingClientRect().left<e.querySelector('.gift').getBoundingClientRect().left));
    }
    await render({theme,sampleKeys:['sc'],customCss:'.info > .price{order:-1;margin-inline-start:0}'});
    assert.ok(await page.locator('.info').evaluate(e=>{const p=e.querySelector('.price').getBoundingClientRect(),u=e.querySelector('.user').getBoundingClientRect();return p.top<u.top-1||p.left<u.left;}));
    await render({theme,visualModel:{common:{'all|all|card':{background:{source:'custom',value:'#abcdef'}}},light:{},dark:{}}});
    assert.equal(await page.locator('.event:not(.event-sticky)').first().evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(171, 205, 239)');
  }
  await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));
  console.log('部件开关、CSS调序、名单展开、表情、系统、副窗和回看检查通过');
} finally {await browser.close();}
