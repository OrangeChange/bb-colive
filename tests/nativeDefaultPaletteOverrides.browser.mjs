import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {scopeThemeCss} from '../src/themes/themeCssScope.ts';
import {DEFAULT_EVENT_STYLE_SETTINGS} from '../src/eventStyleSettings.ts';
import {createEventAreaConfigCss} from '../src/eventAreaStyleConfig.ts';

const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage();
const foundation=scopeThemeCss(await readFile('src/eventStyle.css','utf8'),'.theme-surface');
const config=createEventAreaConfigCss('palette',{settings:DEFAULT_EVENT_STYLE_SETTINGS,layout:'window',fontSize:16,padding:0,spacing:4});
const colors={name:'rgb(11, 211, 31)',body:'rgb(211, 31, 11)',secondary:'rgb(31, 11, 211)'};
const variables=`.event-area{--text-name:${colors.name};--text-body:${colors.body};--text-secondary:${colors.secondary};--name-captain:rgb(101,1,201)}`;
const markup=`<section class="theme-surface event-area" data-event-style-scope="palette">
  <article id="ordinary" class="event type-chat" data-event-role="normal" data-event-style-type="danmu"><span class="username">普通用户</span><span class="content"><span class="message">正文</span></span><span class="bili-translation">译文</span><span class="time">12:00</span><span class="status deleted">已撤回</span></article>
  <article id="captain" class="event type-chat guard-level-3" data-event-role="captain" data-event-style-type="danmu"><span class="username">舰长</span></article>
  <article class="event event-sticky type-lottery"><span id="sticky" class="lottery">天选</span></article>
  <article class="event type-lottery lottery-start"><span id="urgent" class="activity-status activity-urgent">00:20</span></article>
  <article class="event type-gift gift-blind"><span id="gain" class="blind-profit is-gain">+1</span><span id="loss" class="blind-profit is-loss">-1</span><span id="reply" class="reply">@用户</span></article>
</section>`;
const color=selector=>page.locator(selector).evaluate(e=>getComputedStyle(e).color);
const failures=[];
try{
  for(const dark of [false,true]){
    await page.setContent(`<html class="${dark?'dark':''}"><head><style>${foundation}${config}</style></head><body>${markup}</body></html>`);
    assert.deepEqual(await Promise.all(['#ordinary .username','#ordinary .message','#ordinary .time'].map(color)),dark?['rgb(237, 237, 237)','rgb(213, 215, 216)','rgb(153, 155, 158)']:['rgb(8, 8, 8)','rgb(20, 20, 20)','rgb(40, 40, 40)'],'原生默认使用已确认的文字配色');
    const semanticBefore=await Promise.all(['#gain','#loss','#reply'].map(color));
    await page.addStyleTag({content:variables});
    for(const [selector,expected]of[['#ordinary .username',colors.name],['#ordinary .message',colors.body],['#ordinary .bili-translation',colors.secondary],['#ordinary .time',colors.secondary],['#ordinary .status',colors.secondary],['#captain .username','rgb(101, 1, 201)'],['#sticky',colors.body]]){
      const actual=await color(selector);
      if(actual!==expected)failures.push({dark,selector,expected,actual});
    }
    const urgent=await page.locator('#urgent').evaluate(e=>{
      const sample=document.createElement('span');
      sample.style.color='color-mix(in srgb, var(--status-danger) 45%, var(--text-body))';
      e.parentElement.append(sample);
      const expected=getComputedStyle(sample).color;sample.remove();
      return{actual:getComputedStyle(e).color,expected};
    });
    if(urgent.actual!==urgent.expected)failures.push({dark,selector:'#urgent',...urgent});
    assert.deepEqual(await Promise.all(['#gain','#loss','#reply'].map(color)),semanticBefore,'公共文字色不改动独立语义色');
    await page.addStyleTag({content:'#ordinary{--username-color:rgb(121,57,199);--message-color:rgb(21,143,211);--event-secondary-color:rgb(81,91,101)}'});
    assert.equal(await color('#ordinary .username'),'rgb(121, 57, 199)');
    assert.equal(await color('#ordinary .message'),'rgb(21, 143, 211)');
    const localTranslation=await color('#ordinary .bili-translation');
    if(localTranslation!=='rgb(21, 143, 211)')failures.push({dark,selector:'译文局部颜色',expected:'rgb(21, 143, 211)',actual:localTranslation});
    assert.equal(await page.locator('#ordinary').evaluate(e=>getComputedStyle(e).getPropertyValue('--native-secondary').trim()),'rgb(81,91,101)');
  }
  assert.deepEqual(failures,[],'公开颜色变量应在两种明暗模式下生效');
  console.log('原生默认公开颜色、译文、置顶天选、临期混色及局部覆盖核验通过');
}finally{await browser.close()}
