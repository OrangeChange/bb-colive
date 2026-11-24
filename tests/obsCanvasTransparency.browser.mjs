import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';

const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.OBS_CANVAS_TEST_URL||'http://127.0.0.1:17921';
const fixture=JSON.parse(await readFile(process.env.OBS_CANVAS_CONFIGS_FILE,'utf8'));
const configurations=Array.isArray(fixture)?fixture:fixture.configurations;

async function corner(page,omitBackground){
  const png=await page.screenshot({omitBackground});
  return page.evaluate(async data=>{
    const image=new Image();image.src=`data:image/png;base64,${data}`;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
    const context=canvas.getContext('2d');context.drawImage(image,0,0);
    return [...context.getImageData(image.width-2,image.height-2,1,1).data];
  },png.toString('base64'));
}

test('OBS 画布始终透明，事件明暗不改变浏览器底板',async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    for(const configuration of configurations){
      const page=await browser.newPage({viewport:{width:700,height:2000}});
      await page.addInitScript(()=>{
        const Original=WebSocket;
        window.WebSocket=class extends Original{
          constructor(...args){
            super(...args);window.__canvasSocket=this;
            this.addEventListener('message',event=>{
              const message=JSON.parse(event.data);
              if(message.type==='state')window.__canvasState=message;
            });
          }
        };
      });
      await page.goto(`${base}/obs?${new URLSearchParams({config:configuration.id,theme:configuration.themeId,room:String(configuration.roomId||24125),preview:'sample',kind:'弹幕'})}`);
      await page.waitForFunction(()=>window.__canvasState&&document.querySelector('.obs-native-root'),undefined,{timeout:20000});
      const mode=await page.evaluate(()=>window.__canvasState.snapshot.mode||'native');
      const results=[];
      for(const scheme of ['dark','light']){
        await page.evaluate(scheme=>{
          const state={...window.__canvasState,scheme,sequence:window.__canvasState.sequence+1};
          window.__canvasSocket.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(state)}));
        },scheme);
        await page.waitForFunction(scheme=>document.documentElement.classList.contains('dark')===(scheme==='dark'),scheme);
        await page.waitForTimeout(350);
        const canvas=await page.evaluate(()=>({
          scheme:getComputedStyle(document.documentElement).colorScheme,
          backgrounds:['html','body','#root','.obs-output-root'].map(selector=>getComputedStyle(document.querySelector(selector)).backgroundColor),
        }));
        assert.equal(canvas.scheme,'light',`${mode}/${scheme}: 页面画布未与事件配色分离`);
        assert(canvas.backgrounds.every(color=>color==='rgba(0, 0, 0, 0)'));
        const transparent=await corner(page,true),opaque=await corner(page,false);
        assert.equal(transparent[3],0,`${mode}/${scheme}: 输出背景不透明`);
        assert.deepEqual(opaque,[255,255,255,255],`${mode}/${scheme}: 浏览器底板发生变化`);
        const frame=mode==='native'?page:await(await page.locator('.obs-native-root iframe').first().elementHandle()).contentFrame();
        const message=frame.locator(mode==='native'||mode==='laplace'?'.message':'#message').filter({hasText:/\S/}).first();
        await message.waitFor();
        const color=await message.evaluate(element=>getComputedStyle(element).color);
        results.push({scheme,canvasScheme:canvas.scheme,transparent,opaque,eventColor:color});
      }
      if(mode==='native'||mode==='laplace')assert.notEqual(results[0].eventColor,results[1].eventColor,`${mode}: 事件配色未随明暗切换`);
      console.log(JSON.stringify({mode,results}));
      await page.close();
    }
  }finally{await browser.close();}
});
