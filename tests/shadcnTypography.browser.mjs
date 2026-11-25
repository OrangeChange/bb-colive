import{chromium}from'playwright';import assert from'node:assert/strict';
const b=await chromium.launch({channel:'msedge',headless:true});const p=await b.newPage({viewport:{width:900,height:750}});
try{await p.goto((process.env.TEST_ORIGIN||'http://127.0.0.1:1436')+'/tests/fixtures/shadcn/typography.html');await p.locator('#ordinary').waitFor();await p.evaluate(()=>document.fonts.ready);
const weight=loc=>loc.evaluate(n=>getComputedStyle(n).fontWeight);
assert.equal(await weight(p.locator('#ordinary')),'400','普通按钮应使用400');assert.equal(await weight(p.locator('label')),'400','设置标签应使用400');assert.equal(await weight(p.locator('#field')),'400');
assert.equal(await weight(p.locator('#emphasis')),'600','保留明确强调');assert.equal(await weight(p.getByText('弹窗标题',{exact:true})),'600');
for(const name of ['选中导航','选中分段','选中设置'])assert.equal(await weight(p.getByText(name,{exact:true})),'600',name);
for(const name of ['普通导航','普通分段','普通设置'])assert.equal(await weight(p.getByText(name,{exact:true})),'400',name);
if(process.env.TYPE_SCREENSHOT)await p.screenshot({path:process.env.TYPE_SCREENSHOT});console.log('控件400、标题600、选中600及显式强调通过');}finally{await b.close()}
