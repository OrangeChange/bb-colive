import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:1436';
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage();
page.setDefaultTimeout(15000);
const html=await(await fetch(origin+'/obs.html')).text();
await page.route(origin+'/preview',r=>r.fulfill({contentType:'text/html',body:html}));
let socket;await page.routeWebSocket('**/ws**',ws=>socket=ws);
try{
 await page.goto(origin+'/preview');await page.evaluate(async()=>{window.i18nUrl=(await(await fetch('/src/i18n/react.ts')).text()).match(/from \"([^\"]*i18n\/index.ts[^\"]*)\"/)[1]});await page.getByRole('status').waitFor();
 for(const language of ['en','ja','zh-Hant','zh-CN']){
  socket.send(JSON.stringify({type:'ui-language',uiLanguage:language}));
  const expected=(await(await fetch(origin+'/src/i18n/'+language+'.json')).json())['stylePreviewPage.StylePreviewPage.connect'];
  await page.getByRole('status').filter({hasText:expected}).waitFor();
 }
 await page.evaluate(async()=>{const React=(await import('/node_modules/.vite-1436/deps/react.js')).default;const {createRoot}=(await import('/node_modules/.vite-1436/deps/react-dom_client.js')).default;const{CommandDialog}=await import('/src/components/shadcn/command.tsx');const mount=document.createElement('div');document.body.append(mount);window.commandRoot=createRoot(mount);window.commandRoot.render(React.createElement(CommandDialog,{open:true},React.createElement("div",null,"Test command")));});
 for(const language of ['en','ja','zh-Hant','zh-CN']){
  const expected=await page.evaluate(async language=>{const i=await import(window.i18nUrl);i.setUiLanguage(language);return [i.uiText('commandDialog.title'),i.uiText('commandDialog.description')]},language);
  await page.getByRole('dialog',{name:expected[0],exact:true}).waitFor();
  assert.equal(await page.getByRole('dialog').getAttribute('aria-describedby')!==null,true);
  await page.getByText(expected[1],{exact:true}).waitFor();
 }
 console.log('四种语言：外置预览等待状态、命令面板标题与说明即时切换通过');
}finally{await browser.close()}
