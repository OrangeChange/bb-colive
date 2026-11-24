import assert from 'node:assert/strict';
import {measureHonorLayout} from './fixtures/nativeHonorLayout.mjs';
import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createStylePreviewEvents} from '../src/components/stylePreviewEvents.ts';
import {DEFAULT_EVENT_DISPLAY_PREFERENCES} from '../src/eventDisplaySettings.ts';
import {scopeThemeCss} from '../src/themes/themeCssScope.ts';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE);
const server=await createServer({configFile:false,server:{middlewareMode:true,watch:null},logLevel:'silent'});
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL || 'msedge',headless:true});
const page=await browser.newPage({viewport:{width:600,height:1200}});
const out=process.env.NATIVE_STYLE_ACCEPTANCE_DIR || 'docs/superpowers/acceptance/2026-11-14-native-style-polish';await mkdir(out,{recursive:true});
try{
 const {EventRow}=await server.ssrLoadModule('/src/components/EventRow.tsx');
 const events=createStylePreviewEvents('混合流');
 const chosen=[events.find(e=>e.msgType===0&&!e.emoticon),events.find(e=>e.msgType===0&&e.emoticon),events.find(e=>e.gift&&!e.gift.isFree),events.find(e=>e.guard),events.find(e=>e.honor),events.find(e=>e.lottery?.winners?.length)].filter(Boolean);
 chosen.push(...events.filter(e=>e.guard&&/高天亮|冻鳗/.test(e.user?.uname??'')));
 chosen[0].user.currentRank=1;chosen[0].text='普通弹幕首行与头像对齐，长文字换行仍保持自然阅读。';
 let fonts='';for(const [f,w]of[['Regular',400],['Medium',500],['Semibold',700]])fonts+=`@font-face{font-family:MiSans;font-weight:${w};src:url(data:font/woff2;base64,${(await readFile('src/assets/fonts/MiSans-'+f+'.woff2')).toString('base64')})}`;
 const base=await readFile('src/themes/nativeDefaultStyle.generated.css','utf8');const data=[];
 for(const theme of ['default','card','bubble'])for(const dark of [false,true])for(const width of [480,280]){
 const css=theme==='default'?'':scopeThemeCss(await readFile('src/themes/native'+(theme==='card'?'Card':'Bubble')+'Theme.css','utf8'),'.theme-surface');
 let rows=chosen.map(ev=>renderToStaticMarkup(React.createElement(EventRow,{ev,liveLayout:true,showTime:false,allowWinnerExpansion:true,displayPreferences:{...DEFAULT_EVENT_DISPLAY_PREFERENCES,showCurrentRank:true}}))).join('');
 for(const match of [...rows.matchAll(/(?:src|href)="(\/(?:media|src\/assets)\/[^"]+)"/g)]){try{const bytes=await readFile(match[1].startsWith('/media/') ? 'public'+match[1] : '.'+match[1]);const ext=match[1].split('.').pop();rows=rows.replaceAll(match[1],`data:image/${ext==='jpg'?'jpeg':ext};base64,${bytes.toString('base64')}`);}catch{}}
 await page.setContent(`<style>${fonts}*{box-sizing:border-box}body{margin:0;padding:12px;background:${dark?'#20232a':'#f3f4f6'}}@layer utilities{.inline-flex{display:inline-flex}.flex{display:flex}.items-center{align-items:center}.flex-wrap{flex-wrap:wrap}.shrink-0{flex-shrink:0}.min-w-0{min-width:0}.max-w-full{max-width:100%}.avatar-wrap{display:inline-flex;flex-shrink:0}}.event-list{display:flex;flex-direction:column;gap:8px}${base}${css}</style><div class="${dark?'dark':''}"><div class="theme-surface event-area live" style="width:${width}px;--event-base-size:16px;--event-config-avatar-size:24px"><div class="event-list">${rows}</div></div></div>`);
 await page.evaluate(()=>document.fonts.ready);
 const metrics=await page.locator('.event-area').evaluate(a=>{const center=e=>{let r=e.getBoundingClientRect();return r.y+r.height/2};let chat=a.querySelector('.type-chat'),rank=chat?.querySelector('.rank-badge'),name=chat?.querySelector('.username'),gift=a.querySelector('.type-gift');return {overflow:[...a.querySelectorAll('.event')].filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.className),rankGap:rank&&name?name.getBoundingClientRect().left-rank.getBoundingClientRect().right:null,rankDelta:rank&&name?center(rank)-center(name):null,quantity:gift?[...gift.querySelectorAll('.gift-name,.quantity')].map(e=>getComputedStyle(e).fontSize):[],honorAvatar:!!a.querySelector('.type-guard-honor .avatar-wrap'),honorFont:parseFloat(getComputedStyle(a.querySelector('.honor-heading')).fontSize),guardFont:parseFloat(getComputedStyle(a.querySelector('.guard-name')).fontSize),guardAvatarSize:a.querySelector(".type-guard .avatar-wrap").getBoundingClientRect().width,honorAvatarSize:a.querySelector('.type-guard-honor .avatar-wrap').getBoundingClientRect().width,honorNumberFont:getComputedStyle(a.querySelector(".honor-milestone")).fontSize,honorPrefixFont:getComputedStyle(a.querySelector(".honor-summary > :not(.honor-milestone)")).fontSize,honorItalic:getComputedStyle(a.querySelector('.honor-milestone')).fontStyle};});
 assert.equal(metrics.overflow.length,0,theme+' 横向溢出');assert.ok(metrics.honorAvatar,theme+' 主播头像');assert.equal(metrics.honorFont,theme==='bubble'?metrics.guardFont*0.875:metrics.guardFont,theme+' 成就字号');assert.equal(metrics.honorAvatarSize,theme==='default'?metrics.honorFont*2:metrics.guardAvatarSize,theme+' 成就头像尺寸');if(theme!=='card')assert.equal(metrics.honorNumberFont,metrics.honorPrefixFont,theme+' 成就数字与正文同字号');assert.equal(metrics.honorItalic,'normal',theme+' 成就数字正体');assert.ok(metrics.quantity.every(size=>size===metrics.quantity[0]),theme+' 礼物名称和数量字号');const toggleDelta=await page.locator('.winner-list').first().evaluate(e=>{let t=e.querySelector('summary'),before=t.getBoundingClientRect().y;e.open=true;e.classList.add('is-expanded');let delta=t.getBoundingClientRect().y-before;e.open=false;e.classList.remove('is-expanded');return delta});assert.ok(Math.abs(toggleDelta)<=0.5,theme+' 名单展开位置固定');
 const honor = await page.locator('.type-guard-honor').evaluate(measureHonorLayout);
 assert.equal(honor.summary, chosen.find(event => event.honor).honor.secondLine.replaceAll(/<%|%>/g, ''));
 assert.match(honor.milestone, /^\d+$/);
 assert.equal(honor.imageLoaded, true, theme + ' 成就图片已加载');
 assert.equal(honor.overlapsText, false, theme + ' 勋章与原文未重叠');
 const guardOverlap = await page.locator('.type-guard.event-normal').evaluateAll(rows => rows.flatMap(row => {
   const avatar = row.querySelector('.avatar-wrap')?.getBoundingClientRect();
   if (!avatar) return [];
   const parts = row.querySelectorAll('.content .action, .guard-name, .guard-duration, .content .price, .guard-companion-days, .guard-purchase-icon');
   return [...parts].filter(part => {
     const range = document.createRange();
     range.selectNodeContents(part);
     const rects = part.matches('.guard-purchase-icon') ? part.getClientRects() : range.getClientRects();
     return [...rects].some(rect => rect.width && rect.height && avatar.left < rect.right - 1 &&
       avatar.right > rect.left + 1 && avatar.top < rect.bottom - 1 && avatar.bottom > rect.top + 1);
   }).map(part => part.className);
 }));
 assert.deepEqual(guardOverlap, [], theme + ' 大航海头像与购买部件不重叠');
 data.push({theme,dark,width,toggleDelta,...metrics});await page.screenshot({path:`${out}/${theme}-${dark?'dark':'light'}-${width}.png`,fullPage:true});
 }
 await writeFile(out+'/metrics.json',JSON.stringify(data,null,2));console.log(JSON.stringify(data));
}finally{await browser.close();await server.close();}
