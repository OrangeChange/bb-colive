import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import {build} from 'esbuild';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.LAYOUT_ACCEPTANCE_DIR||'D:/CodexBuild/background-gradient-polish';await mkdir(out,{recursive:true});
const built=await build({entryPoints:['tests/fixtures/themeBackgroundEditor.tsx'],bundle:true,write:false,format:'iife',jsx:'automatic',loader:{'.css':'empty','.png':'dataurl','.webp':'dataurl','.svg':'dataurl','.gif':'dataurl','.woff2':'dataurl'}});
const css=await readFile('src/components/nativeThemeEditor.css','utf8');
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1100,height:720}});page.setDefaultTimeout(8000);
 await page.setContent(`<style>:root{--color-bg:#f7f9f9;--color-raised:#fff;--color-line:#cbd5d5;--color-t1:#152d32;--color-t2:#405a60;--color-t3:#52676d;--color-accent:#307e72;--font-ui:Arial}body{font-family:Arial}button{cursor:pointer}.ui-select-trigger{display:flex;align-items:center;justify-content:space-between;height:32px}*{box-sizing:border-box}${css}</style><div id="root" style="margin:100px 340px"></div>`);
 await page.addScriptTag({content:built.outputFiles[0].text});await page.getByRole('button',{name:'事件背景',exact:true}).click();
 const pixelEnd=page.getByRole('slider',{name:'色点 2',exact:true}),pixelBox=await pixelEnd.boundingBox(),pixelTrack=await page.locator('.theme-gradient-track').boundingBox();
 await page.mouse.move(pixelBox.x+pixelBox.width/2,pixelBox.y+pixelBox.height/2);await page.mouse.down();const pixelValues=[];
 for(let i=0;i<6;i++){await page.mouse.move(pixelTrack.x+pixelTrack.width*.8+(i%2)*.01,pixelTrack.y+26);await page.waitForTimeout(30);pixelValues.push(Number(await pixelEnd.getAttribute('aria-valuenow')));}
 await page.mouse.up();assert(Math.max(...pixelValues)-Math.min(...pixelValues)<.1,'像素末端在同一光标位置保持数值稳定');
 await page.getByRole('combobox',{name:'背景图层'}).click();await page.getByRole('option',{name:'底层 · 底色',exact:true}).click();const layered=await page.locator('#value').textContent();
 await page.getByRole('button',{name:'纯色',exact:true}).click();assert.equal(await page.locator('#value').textContent(),layered,'点击已选填充类型不丢失其他层');
 await page.getByRole('combobox',{name:'背景图层'}).click();await page.getByRole('option',{name:'顶层 · 渐变',exact:true}).click();
 const angle=page.getByRole('spinbutton',{name:'渐变角度'});await angle.focus();await angle.press('Control+A');await angle.pressSequentially('-45');await angle.press('Enter');
 assert.match(await page.locator('#value').textContent(),/-45deg/,'正常键盘输入负角度');
 const dial=page.getByRole('slider',{name:'渐变角度圆盘',exact:true}),dialBox=await dial.boundingBox();
 for(const [x,y,degrees] of [[.5,.1,0],[.9,.5,90],[.5,.9,180],[.1,.5,270]]){
  await page.mouse.click(dialBox.x+dialBox.width*x,dialBox.y+dialBox.height*y);
  assert.equal(Number(await angle.inputValue()),degrees,'圆盘方向与角度一致');
 }
 await dial.focus();await dial.press('ArrowRight');assert.equal(Number(await angle.inputValue()),271);
 await dial.press('Shift+ArrowLeft');assert.equal(Number(await angle.inputValue()),261);
 const commitsBefore=await page.evaluate(()=>window.backgroundReport.commits.length);
 await page.mouse.move(dialBox.x+dialBox.width*.9,dialBox.y+dialBox.height*.5);await page.mouse.down();
 await page.mouse.move(dialBox.x+dialBox.width*.5,dialBox.y+dialBox.height*.9,{steps:15});await page.mouse.up();
 assert.equal(await page.evaluate(()=>window.backgroundReport.commits.length),commitsBefore+1,'圆盘拖动仅提交一次');
 const position=page.getByRole('spinbutton',{name:'色点位置'});await position.focus();await position.press('Control+A');await position.pressSequentially('.5');await position.press('Enter');
 assert.match(await page.locator('#value').textContent(),/0.5%/,'正常键盘输入小数');
 for(let i=0;i<3;i++)await page.getByRole('button',{name:'添加色点',exact:true}).click();
 const positions=await page.locator('.theme-gradient-stop').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().x));assert.equal(new Set(positions).size,positions.length,'连续新增不重叠');
 const before=await page.locator('.theme-gradient-stop').count();const track=await page.locator('.theme-gradient-track').boundingBox();await page.mouse.click(track.x+track.width*.25,track.y+5);assert.equal(await page.locator('.theme-gradient-stop').count(),before+1,'点击轨道新增色点');
 await page.locator('.theme-gradient-stop.is-selected').focus();await page.waitForFunction(()=>document.activeElement.matches('.theme-gradient-stop.is-selected'));await page.keyboard.press('Delete');await page.waitForFunction(count=>document.querySelectorAll('.theme-gradient-stop').length===count,before);assert.equal(await page.locator('.theme-gradient-stop').count(),before,'Delete删除选中色点');
 await page.getByRole('slider',{name:'色点 1',exact:true}).click();
 const heights=[];for(const value of ['0','100','0','100']){const opacity=page.getByRole('spinbutton',{name:'不透明度'});await opacity.fill(value);await opacity.press('Enter');await page.waitForTimeout(40);heights.push(await page.locator('.theme-background-popover').evaluate(e=>{const r=e.getBoundingClientRect();return[r.x,r.y,r.width,r.height]}));}
 assert(heights.every(r=>r.every((v,i)=>Math.abs(v-heights[0][i])<.2)),'透明度端点不改变弹窗尺寸或位置');
 const alpha=page.locator('.theme-background-popover .react-colorful__alpha'),alphaBox=await alpha.boundingBox(),dragFrames=[];
 await page.mouse.move(alphaBox.x+alphaBox.width*.8,alphaBox.y+7);await page.mouse.down();
 for(let i=0;i<8;i++){await page.mouse.move(alphaBox.x+alphaBox.width*(i%2),alphaBox.y+7);await page.waitForTimeout(60);dragFrames.push(await page.locator('.theme-background-popover').evaluate(e=>{const r=e.getBoundingClientRect();return[r.x,r.y,r.width,r.height];}));}
 await page.mouse.up();assert(dragFrames.every(r=>r.every((v,i)=>Math.abs(v-dragFrames[0][i])<.2)),'圆点拖到透明度两端时不产生滚动条或弹窗跳动');
 await page.getByRole('button',{name:'径向',exact:true}).click();await page.getByRole('spinbutton',{name:'径向中心X'}).fill('35');await page.getByRole('spinbutton',{name:'径向中心X'}).press('Enter');
 assert.match(await page.locator('#value').textContent(),/at 35% 50%/);
 const unitChoices=page.getByRole('group',{name:'色点单位',exact:true});assert.equal(await unitChoices.getByRole('button').count(),2);await unitChoices.getByRole('button',{name:'px',exact:true}).click();await unitChoices.getByRole('button',{name:'%',exact:true}).click();
 const shapes=page.getByRole('group',{name:'径向形状',exact:true});assert.equal(await shapes.getByRole('button').count(),2);await shapes.getByRole('button',{name:'圆形',exact:true}).click();assert.match(await page.locator('#value').textContent(),/radial-gradient\(circle/);
 const marker=await page.locator('.theme-gradient-stop>span').first().evaluate(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return{w:r.width,h:r.height,radius:s.borderRadius};});assert.equal(marker.w,marker.h);assert(marker.w<=12&&marker.radius==='50%','色点使用小圆点');
 await page.getByRole('combobox',{name:'颜色格式',exact:true}).click();await page.getByRole('option',{name:'RGBA',exact:true}).click();const field=await page.locator('.theme-color-precise input').boundingBox();assert(field.width>220,'颜色完整值使用整行宽度');
 await page.screenshot({path:out+'/radial.png'});
 await page.getByRole('button',{name:'移除当前渐变层',exact:true}).click();assert.equal(await page.locator('#value').textContent(),'rgb(50, 70, 90)','移除渐变保留底色');
 assert.equal(await page.getByRole('spinbutton',{name:'不透明度'}).count(),1,'纯色也提供不透明度');
 console.log(JSON.stringify({negativeAngle:true,decimal:true,distinctStops:true,trackInsert:true,delete:true,stableOpacity:true,radial:true,removeLayer:true}));
 await page.getByRole('button',{name:'关闭背景面板',exact:true}).click();
 await page.setContent(`<style>${css}</style><div id="root" style="margin:100px 340px"></div>`);
 const image='url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E") center / cover no-repeat';
 await page.evaluate(initial=>{window.backgroundInitial=initial},`linear-gradient(#fff,#000), ${image}`);
 await page.addScriptTag({content:built.outputFiles[0].text});await page.getByRole('button',{name:'事件背景',exact:true}).click();
 assert.equal(await page.getByText('背景含图片',{exact:true}).count(),1);
 const imageAngle=page.getByRole('spinbutton',{name:'渐变角度',exact:true});await imageAngle.fill('120');await imageAngle.press('Enter');
 assert((await page.locator('#value').textContent()).endsWith(image),'修改渐变保留图片及定位尺寸');
 await page.screenshot({path:out+'/angle-image.png'});
}finally{await browser.close()}
