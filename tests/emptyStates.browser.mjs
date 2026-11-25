import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:1436';
const browser = await chromium.launch({channel:process.env.TEST_BROWSER || 'msedge',headless:true});
const page = await browser.newPage({viewport:{width:900,height:600}});
page.setDefaultTimeout(8000);
const html = await (await fetch(origin+'/obs.html')).text();
await page.route(origin+'/preview',route=>route.fulfill({contentType:'text/html',body:html}));
await page.route(origin+'/obs**',route=>route.fulfill({contentType:'text/html',body:html}));
let socket;
await page.routeWebSocket('**/ws**',ws=>{socket=ws;});
const centered = async locator => {
 const rect=await locator.evaluate(n=>{const r=document.createRange();r.selectNodeContents(n);return r.getBoundingClientRect().toJSON()});
 assert.ok(Math.abs(rect.y+rect.height/2-300)<3,'等待或空样例文字应垂直居中');
 assert.ok(Math.abs(rect.x+rect.width/2-450)<3,'等待或空样例文字应水平居中');
};
const shot=async name=>{if(process.env.EMPTY_SCREENSHOTS)await page.screenshot({path:process.env.EMPTY_SCREENSHOTS+'/'+name+'.png',omitBackground:true});};
try {
 await page.goto(origin+'/preview');
 const waiting=page.getByText('请在软件中打开样式预览',{exact:true});await waiting.waitFor();await centered(waiting);await shot('after-external-wait');
 const data=await page.evaluate(async()=>{
  const [{createBuiltinNativeTheme},{projectNativeTheme},{createObsSnapshot},{DEFAULT_STICKY_EVENT_SETTINGS},{DEFAULT_EVENT_WINDOW_PREFERENCES},{DEFAULT_EVENT_DISPLAY_PREFERENCES},{createStylePreviewPartEvents}]=await Promise.all([import('/src/themes/nativeBuiltinThemes.ts'),import('/src/themes/nativeThemeProjection.ts'),import('/src/obs/createObsSnapshot.ts'),import('/src/windows/stickyEventModel.ts'),import('/src/windows/eventWindowPreferences.ts'),import('/src/eventDisplaySettings.ts'),import('/src/components/stylePreviewEvents.ts')]);
  const doc=createBuiltinNativeTheme('native-default'),projection=projectNativeTheme(doc);
  return {preview:{ownerId:'empty-check',revision:1,kind:'native',width:900,height:600,palette:'sakura',scheme:'light',frame:{epoch:0,cursor:0},content:{previewCss:projection.css,context:'obs',mode:'all',events:[],eventStyleSettings:projection.settings,displayPreferences:DEFAULT_EVENT_DISPLAY_PREFERENCES,eventFontSize:16,windowEventFontSize:16,previewScheme:'light',stickySettings:DEFAULT_STICKY_EVENT_SETTINGS,previewBackground:'transparent'}},obs:{type:'state',identity:'empty-check',sequence:1,snapshot:createObsSnapshot(doc,'empty-check','1',1,DEFAULT_STICKY_EVENT_SETTINGS),events:[],sticky:[],preferences:DEFAULT_EVENT_WINDOW_PREFERENCES,scheme:'light',palette:'sakura',connection:{status:'connected',roomId:1},roomUpdates:[],sampleAt:Date.now()},event:createStylePreviewPartEvents('弹幕')[0]};
 });
 socket.send(JSON.stringify({type:'preview:replace',state:data.preview}));
 const frame=page.frameLocator('iframe');await frame.getByRole('status').waitFor();await centered(frame.getByRole('status').locator('p'));await shot('after-external-empty');
 socket.close({code:1001});
 await page.getByText('与软件的连接已断开，请确认软件正在运行',{exact:true}).waitFor();
 const banner=await page.locator('.style-preview-connection-status').boundingBox(),body=await page.locator('.style-preview-body').boundingBox();
 assert.ok(body.y>=banner.y+banner.height-1,'断线提示不得覆盖预览内容');await shot('after-external-disconnected');
 await page.waitForFunction(()=>document.querySelector('.style-preview-connection-status'));
 await page.waitForTimeout(1550);socket.send(JSON.stringify({type:'preview:replace',state:data.preview}));await page.locator('.style-preview-connection-status').waitFor({state:'detached'});
 await page.goto(origin+'/obs?config=missing');
 socket.send(JSON.stringify({type:'status',message:'OBS 配置不存在，请在软件中保存配置后重新复制地址'}));await page.waitForTimeout(100);
 assert.equal(await page.locator('body').innerText(),'','OBS 配置错误文字不得进入直播输出');await shot('after-obs-invalid');
 socket.send(JSON.stringify(data.obs));await page.locator('.obs-native-root').waitFor();
 assert.equal(await page.locator('body').innerText(),'');assert.equal(await page.locator('body').evaluate(n=>getComputedStyle(n).backgroundColor),'rgba(0, 0, 0, 0)');await shot('after-obs-output-empty');
 socket.send(JSON.stringify({...data.obs,sequence:2,events:[data.event]}));await page.locator('.event-row-slot').first().waitFor();
 socket.close({code:1001});await page.locator('.event-row-slot').waitFor({state:'detached'});assert.equal(await page.locator('body').innerText(),'');await shot('after-obs-disconnected');
 await page.waitForTimeout(1550);socket.send(JSON.stringify({...data.obs,sequence:1,events:[data.event]}));await page.locator('.event-row-slot').first().waitFor();
 for(const width of [380,1100]){await page.setViewportSize({width,height:600});await page.goto(origin+'/preview');await waiting.waitFor();assert.equal(await page.locator('html').evaluate(n=>n.scrollWidth>n.clientWidth),false);}
 console.log('预览居中、断线分区、恢复、窄窗口与 OBS 透明输出通过');
} finally { await browser.close(); }
