import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out='design/native-proportional-20261122/checks';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:2200,height:1100}});const errors=[],results=[];
page.on('pageerror',e=>errors.push(e.message));let id=0;
async function render(state){const caseId=++id;await page.evaluate(s=>window.setNativeLayoutCase(s),{theme:'default',target:'live',width:480,baseSize:16,avatar:true,icons:true,rank:true,semantic:true,baseSizeCase:true,timestamp:true,...state,caseId});await page.locator(`[data-fixture-case="${caseId}"]`).waitFor();await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))});}
async function read(){return page.locator('.event-list .event').first().evaluate(e=>{const value=(s,p)=>{const n=e.querySelector(s);return n?parseFloat(getComputedStyle(n)[p]):null};return {font:parseFloat(getComputedStyle(e).fontSize),avatar:value('.avatar-wrap','width'),emote:value('.inline-emote','height'),border:parseFloat(getComputedStyle(e).borderTopWidth),radius:parseFloat(getComputedStyle(e).borderTopLeftRadius),padding:parseFloat(getComputedStyle(e).paddingLeft),gap:value('.user','columnGap')};});}
try{
 await page.goto('http://127.0.0.1:1420/tests/fixtures/nativeLayoutRepair.html',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.setNativeLayoutCase);
 for(const theme of ['default','card','bubble']){
  await render({theme,sampleKeys:['mixed-emote']});const base=await read();
  await render({theme,width:960,baseSize:32,sampleKeys:['mixed-emote']});const large=await read();
  for(const key of ['font','avatar','emote','border','radius','padding','gap'])if(base[key]>0)assert.ok(Math.abs(large[key]-base[key]*2)<1,`${theme} ${key}: ${base[key]} -> ${large[key]}`);
  await render({theme,sampleKeys:['mixed-emote'],customCss:'.event.type-chat {--event-font-size:24px}'});const local=await read();
  assert.equal(local.font,24);assert.equal(local.avatar,base.avatar*1.5,`${theme} 局部头像`);assert.equal(local.emote,30);
  await render({theme,baseSize:32,sampleKeys:['mixed-emote'],customCss:'.event-area {--avatar-size:32px;--emote-size:18px}'});const fixed=await read();assert.equal(fixed.avatar,32);assert.equal(fixed.emote,18);
  await render({theme,sampleKeys:['mixed-emote'],visualModel:{common:{'all|all|event':{fontSize:{source:'custom',value:{mode:'base-relative',ratio:1.5}}}},light:{},dark:{}}});assert.equal((await read()).font,24);assert.equal((await read()).avatar,base.avatar*1.5);
  const user={uid:'scale',uname:'测试用户',avatar:'/media/native-preview/guard-redpocket-sender.jpg',guardLevel:1,isAdmin:true,isAnchor:true,wealthLevel:17,medal:{name:'测试牌',level:23}};
  for(const [width,baseSize]of [[480,16],[260,24]]){
   await render({theme,width,baseSize,textIdentity:true,sampleKeys:['text'],eventChanges:{user}});
   const badges=await page.locator('.guard-badge,.streamer-badge,.mod-badge,.wealth-medal').evaluateAll(es=>es.map(e=>({font:parseFloat(getComputedStyle(e).fontSize),height:e.getBoundingClientRect().height,center:e.getBoundingClientRect().y+e.getBoundingClientRect().height/2,wrap:getComputedStyle(e).whiteSpace})));
   assert.ok(badges.every(e=>Math.abs(e.font-baseSize*.75)<.1));assert.ok(badges.every(e=>Math.abs(e.height-baseSize*1.125)<.5));
   assert.ok(await page.locator('.user,.badges').evaluateAll(es=>es.every(e=>getComputedStyle(e).flexWrap==='wrap')));
   await page.locator('.fixture-surface').screenshot({path:`${out}/${theme}-text-${width}.png`});
  }
  const css='.guard-level-3 {--priority-probe:green;--only-captain:yes}.mod {--priority-probe:blue}.guard-level-3 .guard-badge {text-decoration:underline}';
  for(const adminFirst of [false,true]){await render({theme,sampleKeys:['text'],eventChanges:{user},customCss:css,adminFirst});const rule=await page.locator('.event-list .event').evaluate(e=>({probe:getComputedStyle(e).getPropertyValue('--priority-probe').trim(),captain:getComputedStyle(e).getPropertyValue('--only-captain').trim(),identity:['guard-level-3','streamer','mod'].every(c=>e.classList.contains(c))}));assert.equal(rule.probe,adminFirst?'blue':'green');assert.equal(rule.captain,'yes');assert.ok(rule.identity);}
  results.push({theme,base,large,local,fixed});
 }
 for(const size of [14,21]){await page.evaluate(size=>window.setNativeReviewSize(size),size);await render({target:'review',baseSize:size,sampleKeys:['lottery-result']});await page.locator('.winner-list-toggle').click();const max=await page.locator('.winner-list-items').evaluate(e=>parseFloat(getComputedStyle(e).maxHeight));assert.ok(Math.abs(max-240*size/14)<.5);results.push({reviewSize:size,winnerMaxHeight:max});}
 assert.deepEqual(errors,[]);await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));console.log('三主题全局及局部字号、固定覆盖、文字身份、身份排序、独立回看通过');
}finally{await browser.close();}
