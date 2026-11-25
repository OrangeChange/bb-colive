import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.LAYOUT_ACCEPTANCE_DIR||'.superpowers/shadcn-ui/color-drag';await mkdir(out,{recursive:true});
const url=(process.env.BB_COLIVE_TEST_BASE_URL||'http://127.0.0.1:1436')+'/tests/fixtures/shadcn/color-drag.html';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1000,height:800}});page.on('pageerror',error=>console.log('pageerror',error.message));
 await page.goto(url);
 await page.getByRole('button',{name:'拖动测试',exact:true}).click();await page.waitForTimeout(120);const area=page.locator('.theme-color-popover .react-colorful__saturation');const box=await area.boundingBox();
 await page.screenshot({path:out+'/color-before.png'});await page.mouse.move(box.x+box.width*.15,box.y+box.height*.3);await page.mouse.down();let maxError=0;const panels=[];
 for(let i=0;i<45;i++){
  const x=box.x+box.width*(.15+.7*(i%15)/14),y=box.y+box.height*(.3+.4*Math.floor(i/15)/2);
  await page.mouse.move(x,y);await page.waitForTimeout(8);
  if(!await page.locator('.theme-color-popover').count()){await page.screenshot({path:out+'/color-missing.png'});throw Error('颜色面板关闭，步骤 '+i);}
  const data=await page.locator('.theme-color-popover').evaluate(p=>{const dot=p.querySelector('.react-colorful__saturation-pointer').getBoundingClientRect(),r=p.getBoundingClientRect();return{x:dot.x+dot.width/2,y:dot.y+dot.height/2,left:r.left,top:r.top};});
  maxError=Math.max(maxError,Math.hypot(data.x-x,data.y-y));panels.push([data.left,data.top]);
 }
 await page.mouse.up();await page.waitForTimeout(100);
 const report=await page.evaluate(()=>window.colorDragReport);
 await writeFile(out+'/color-drag.json',JSON.stringify({maxError,panels,report},null,2));
 assert(maxError<=3,`拖动圆点偏移 ${maxError}px`);assert.equal(new Set(panels.map(p=>p.join(','))).size,1,'拖动时浮层位置固定');assert.equal(report.commits.length,1,'松手只提交一次');
 console.log(JSON.stringify({maxError,stablePopover:true,commits:report.commits.length}));
 await page.goto(url+'?opaque=1#opaque');
 await page.getByRole('button',{name:'拖动测试',exact:true}).click();await page.waitForTimeout(120);
 const opaquePanel=page.locator('.theme-color-popover');assert.equal(await opaquePanel.locator('.react-colorful__alpha').count(),0);
 const opaqueBox=await opaquePanel.locator('.react-colorful__saturation').boundingBox();await page.mouse.move(opaqueBox.x+opaqueBox.width*.1,opaqueBox.y+opaqueBox.height*.8);await page.mouse.down();await page.mouse.move(opaqueBox.x+opaqueBox.width*.8,opaqueBox.y+opaqueBox.height*.3);await page.keyboard.press('Escape');await page.mouse.up();await page.waitForTimeout(150);
 assert.equal((await page.evaluate(()=>window.colorDragReport)).commits.length,0,'取消不透明色板拖动不能提交');
 await page.getByRole('button',{name:'拖动测试',exact:true}).click();assert.equal(await page.locator('.theme-color-precise input').inputValue(),'#ba5359','重新打开显示保存值');
 console.log('不透明色板取消拖动通过');
 page.setDefaultTimeout(3000);
 await opaquePanel.getByRole('combobox',{name:'颜色格式'}).click();await page.getByRole('option',{name:'RGB',exact:true}).click();
 assert.match(await opaquePanel.locator('.theme-color-precise input').inputValue(),/^rgb\(/);
 await opaquePanel.locator('.theme-color-precise input').fill('rgb(20, 100, 160)');await opaquePanel.locator('.theme-color-precise input').blur();
 assert.equal(await opaquePanel.locator('.theme-color-precise input').inputValue(),'rgb(20, 100, 160)');
 await opaquePanel.getByRole('combobox',{name:'颜色格式'}).click();await page.getByRole('option',{name:'HSL',exact:true}).click();
 assert.match(await opaquePanel.locator('.theme-color-precise input').inputValue(),/^hsl\(/);
 assert.equal(await opaquePanel.getByRole('button',{name:'透明',exact:true}).count(),0);
 console.log('不透明色板格式切换和精确输入通过');


}finally{await browser.close()}
