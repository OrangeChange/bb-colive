import {chromium} from 'playwright';import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();await page.goto(`${process.env.TEST_ORIGIN??'http://127.0.0.1:1446'}/tests/fixtures/laplaceCascade.html`,{timeout:45000});
 const frame=page.frames().find(f=>f.url().includes('/laplace/product/'));await frame.waitForFunction(()=>window.__laplaceQA);
 const sample=await frame.evaluate(()=>window.__laplaceQA.getOriginalSamples('static').find(e=>e.type==='message'&&!e.emote));let sequence=0;
 for(const mode of ['dashboard','obs'])for(const reply of [{uid:0,uname:'',avatar:''},{uid:0,uname:'ア***'},{uid:2,uname:'回复用户',avatar:'/icon.svg'}]){
  await frame.evaluate(payload=>window.__laplaceQA.render(payload),{channel:'bb-laplace',version:1,type:'render',generation:1,sequence:++sequence,events:[{...sample,id:'reply-check',reply}],stickyEvents:[],settings:{showSpoiler:true},css:{cloud:'',remote:'',custom:''},preview:false,scrollable:true,rate:0,renderMode:mode});
  await frame.waitForFunction(name=>{const node=document.querySelector('.event--message');return node&&Boolean(node.querySelector('.reply'))===Boolean(name);},reply.uname);
  assert.equal(await frame.locator('.reply-avatar').count(),reply.uname?1:0,`${mode}: 仅真实回复显示目标头像`);
 }
 console.log('LAPLACE 现场与输出：空回复无头像，匿名及实名回复保留');
}finally{await browser.close();}
