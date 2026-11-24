import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MsgType } from '../src/protocol/types.ts';
import { getNativeEventSample } from './fixtures/nativeEventSamples.ts';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out = 'D:/CodexBuild/theme-image-editor/review-price';
await mkdir(out, { recursive: true });
const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null }, optimizeDeps: { noDiscovery: true, include: [] }, logLevel: 'silent' });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
 const { EventRow } = await server.ssrLoadModule('/src/components/EventRow.tsx');
 const { useGeneralSettings } = await server.ssrLoadModule('/src/generalSettings.ts');
 const { REVIEW_PRICE_GRADIENT_CSS, normalizeReviewStyleSettings } = await server.ssrLoadModule('/src/reviewStyleSettings.ts');
 const { priceBandColor, normalizePriceGradient } = await server.ssrLoadModule('/src/themes/nativePriceGradient.ts');
 const model = normalizePriceGradient();
 const names = await readdir('dist/assets');
 const css = (await Promise.all(names.filter(n => /^App-.*\.css$/.test(n)).map(n => readFile('dist/assets/' + n, 'utf8')))).join('\n') + await readFile('src/archiveEventStyle.css', 'utf8') + await readFile('src/components/UserAvatar.css', 'utf8') + REVIEW_PRICE_GRADIENT_CSS;
 const rows = [];
 for (const type of ['normal','blind','superchat']) for (const amount of [0.2,30,50,100,500,1000,2000]) {
  const event = getNativeEventSample(type === 'superchat' ? 'sc' : 'normal-gift');
  event.msgType = type === 'superchat' ? MsgType.SuperChat : MsgType.Gift;
  if (type === 'superchat') event.sc = { ...event.sc, price: amount, message: '醒目留言正文' };
  else event.gift = { ...event.gift, isFree: false, coinType: 'gold', count: 1, totalRmb: amount, priceRmb: amount, ...(type === 'blind' ? { blindGiftName: '幸运盲盒', blindHitPriceRmb: amount, paymentRmb: 9 } : {}) };
  rows.push(event);
 }
 const missing = getNativeEventSample('normal-gift'); missing.gift = { ...missing.gift, isFree: false, priceRmb: 0, totalRmb: 0.2, count: 2 };
 rows.push(missing);
 const award = getNativeEventSample('lottery-result');
 award.lottery.winners = Array.from({length:15}, (_,i) => ({uid:String(i+1),uname:i===14?'很长的中奖用户名用于检查自动换行和容器宽度':'中奖用户'+(i+1)}));
 rows.push(award);

 const render = () => rows.map(ev => renderToStaticMarkup(React.createElement(EventRow, { ev, reviewLayout: true, allowWinnerExpansion: true, showTime: true }))).join('');
 const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
 const results = [];
 for (const dark of [false,true]) for (const width of [280,800]) for (const enabled of [false,true]) for (const uniform of [false,true]) {
  useGeneralSettings.getInitialState().reviewStyleSettings = normalizeReviewStyleSettings({usePriceGradient:enabled,uniformTextColor:uniform});
  await page.setContent(`<html class="${dark?'dark':''}"><head><style>${css}</style></head><body><main style="width:${width}px">${render()}</main></body></html>`);
  await page.locator('details').evaluateAll(nodes => nodes.forEach(n => n.open = true));
  const metrics = await page.locator('main').evaluate(n => {
   const s=e=>getComputedStyle(e), r=e=>e.getBoundingClientRect();
   const items=[...n.querySelectorAll('.winner-list-item')];
   return {prices:[...n.querySelectorAll('.price-gradient-active')].map(e=>({color:s(e.querySelector('.price:not(.blind-price)')).color,bg:s(e).backgroundColor})),
    paidClass:n.querySelectorAll('.type-gift')[14].className,
    winners:{first:r(items[0]).y,second:r(items[1]).y,wrap:items.some(e=>r(e).y>r(items[0]).y),overflow:items.some(e=>r(e).right>r(n).right+1),avatarWidth:r(items[0].querySelector('.winner-avatar')).width,center:items.map(e=>{const a=e.querySelector('.winner-avatar'),u=e.querySelector('.username');return Math.abs((r(a).top+r(a).bottom-r(u).top-r(u).bottom)/2)})}};
  });
  assert(!metrics.paidClass.includes('gift-free'));
  if(enabled){assert.equal(metrics.prices.length,22); for(let i=0;i<21;i++){const band=model.bands[i%7];assert.equal(metrics.prices[i].color,uniform ? (dark?'rgb(205, 212, 221)':'rgb(25, 39, 59)') : priceBandColor(model,'common',band.id,dark?'dark':'light','color'));assert.equal(metrics.prices[i].bg,priceBandColor(model,'common',band.id,dark?'dark':'light','background'));}}
  else assert.equal(metrics.prices.length,0);
  if(width===800) assert.equal(metrics.winners.first,metrics.winners.second);
  assert.equal(metrics.winners.avatarWidth,24); assert(metrics.winners.wrap); assert(!metrics.winners.overflow); assert(metrics.winners.center.every(x=>x<1));
  results.push({dark,width,enabled,uniform,...metrics});
  if(enabled&&width===800&&!uniform) await page.screenshot({path:`${out}/${dark?'dark':'light'}.png`,fullPage:true});
 }
 await writeFile(out+'/metrics.json',JSON.stringify(results,null,2));
 console.log('回看七档明暗配色、固定配色及宽窄名单布局通过');
} finally { await browser.close(); await server.close(); }
