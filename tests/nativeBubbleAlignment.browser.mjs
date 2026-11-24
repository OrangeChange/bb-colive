import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getNativeEventSample } from './fixtures/nativeEventSamples.ts';
import { DEFAULT_EVENT_DISPLAY_PREFERENCES } from '../src/eventDisplaySettings.ts';
import { DEFAULT_EVENT_STYLE_SETTINGS } from '../src/eventStyleSettings.ts';
import { scopeThemeCss } from '../src/themes/themeCssScope.ts';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null }, logLevel: 'silent' });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 620, height: 1000 } });
const output = 'docs/superpowers/acceptance/2026-11-13-native-bubble/alignment';
await mkdir(output, { recursive: true });
try {
  const { EventRow } = await server.ssrLoadModule('/src/components/EventRow.tsx');
  const { StickyEventCard } = await server.ssrLoadModule('/src/components/StickyEventCard.tsx');
  let fonts = '';
  for (const [file, weight] of [['MiSans-Medium.woff2', 500], ['MiSans-Semibold.woff2', 700]]) {
    const data = (await readFile(`src/assets/fonts/${file}`)).toString('base64');
    fonts += `@font-face{font-family:MiSans;font-weight:${weight};src:url(data:font/woff2;base64,${data})}`;
  }
  const foundation = await readFile('src/themes/nativeDefaultStyle.generated.css', 'utf8');
  const theme = scopeThemeCss(await readFile('src/themes/nativeBubbleTheme.css', 'utf8'), '.theme-surface');
  const text = getNativeEventSample('text');
  const big = { ...structuredClone(text), id: 'big-alignment', danmuRepeatCount: 3, emoticon: { url: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="pink"/></svg>', width: 100, height: 100 } };
  big.user.medal = { name: '羊柚串', level: 26, isCurrentRoom: true, isLighted: true };
  const samples = [text, big, getNativeEventSample('normal-gift'), getNativeEventSample('guard'), getNativeEventSample('sc'), getNativeEventSample('honor'), getNativeEventSample('lottery-result')];
  for (const key of ['text', 'normal-gift', 'guard', 'sc', 'entry']) {
    const sample = getNativeEventSample(key);
    sample.id += '-long';
    sample.user = { ...sample.user, uname: '长用户名与多个身份同时换行', currentRank: 1, isAnchor: true, isAdmin: true, medal: { name: '样例牌', level: 26, isCurrentRoom: true, isLighted: true } };
    samples.push(sample);
  }
  const failures = [], results = [];
  for (const [size, width, dark, avatar] of [[16, 480, false, true], [16, 320, true, true], [24, 260, false, true], [16, 480, false, false]]) {
    const rows = samples.map(ev => renderToStaticMarkup(React.createElement(EventRow, { ev, liveLayout: true, showTime: false, allowWinnerExpansion: true, animateOnMount: false, displayPreferences: { ...DEFAULT_EVENT_DISPLAY_PREFERENCES, showAvatar: avatar } }))).join('');
    const sticky = renderToStaticMarkup(React.createElement(StickyEventCard, { card: { event: samples[3], amount: 198, startedAt: 0, expiresAt: 100000, occurredAt: 0 }, now: 0, eventStyleSettings: DEFAULT_EVENT_STYLE_SETTINGS, display: { ...DEFAULT_EVENT_DISPLAY_PREFERENCES, showAvatar: avatar } }));
    const utilities = '@layer utilities{.inline-flex{display:inline-flex}.flex-wrap{flex-wrap:wrap}.items-center{align-items:center}.shrink-0{flex-shrink:0}.max-w-full{max-width:100%}}';
    await page.setContent(`<style>${fonts}*{box-sizing:border-box}body{margin:0;padding:12px;background:${dark ? '#171820' : '#dde2e8'}}${utilities}${foundation}${theme}</style><div class="${dark ? 'dark' : ''}"><div class="theme-surface event-area live" style="width:${width}px;--event-base-size:${size}px;--event-config-avatar-size:${size * 1.5}px;--font-ui:MiSans,sans-serif"><div class="sticky-area">${sticky}</div>${rows}</div></div>`);
    await page.evaluate(() => document.fonts.ready);
    const data = await page.locator('.event-area').evaluate(area => {
      const center = e => { const r = e.getBoundingClientRect(); return r.y + r.height / 2; };
      const firstTextCenter = e => { const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) if (n.textContent.trim()) { const r = document.createRange(); r.setStart(n, 0); r.setEnd(n, 1); const q = r.getBoundingClientRect(); return q.y + q.height / 2; } return center(e); };
      const avatarDelta = row => { const a = row.querySelector('.avatar-wrap'), n = row.querySelector('.username'); return a && n ? center(a) - firstTextCenter(n) : 0; };
      const rows = [...area.querySelectorAll('.event-normal')], honor = area.querySelector('.type-guard-honor'), result = area.querySelector('.lottery-result');
      return {
        avatarDeltas: rows.filter(e => e.querySelector('.username') && !e.matches('.lottery-result')).map(e => ({ type: e.className, delta: avatarDelta(e) })),
        bigNameDelta: firstTextCenter(rows[1].querySelector('.username')) - rows[1].getBoundingClientRect().top - (firstTextCenter(rows[0].querySelector('.username')) - rows[0].getBoundingClientRect().top),
        bigTopDelta: rows[1].querySelector('.big-emote').getBoundingClientRect().top - rows[1].querySelector('.username').getBoundingClientRect().top,
        bigRepeatDelta: center(rows[1].querySelector('.repeat-count')) - rows[1].querySelector('.big-emote').getBoundingClientRect().top - parseFloat(getComputedStyle(rows[1].querySelector('.username')).lineHeight) / 2,
        bigMedalLines: (() => { const r = document.createRange(); r.selectNodeContents(rows[1].querySelector('.medal-name')); return r.getClientRects().length; })(),
        honorWatermark: getComputedStyle(honor.querySelector('.honor-icon')).position === 'absolute' && Number(getComputedStyle(honor.querySelector('.honor-icon')).opacity) === 1,
        honorOverlap: (()=>{const a=honor.querySelector('.honor-heading').getBoundingClientRect(),b=honor.querySelector('.honor-milestone').getBoundingClientRect();return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top})(),
        honorPadding: getComputedStyle(honor.querySelector('.event-card')).padding,
        resultFill: getComputedStyle(result.querySelector('.event-card')).backgroundColor,
        resultTitleDelta: center(result.querySelector('.event-header .native-event-icon')) - firstTextCenter(result.querySelector('.result-title')),
        resultTitleLines: (() => { const r = document.createRange(); r.selectNodeContents(result.querySelector('.result-title')); return r.getClientRects().length; })(),
        narrowPurchaseOffset: area.querySelector('.type-guard.event-normal .content').getBoundingClientRect().left - area.querySelector('.type-guard.event-normal .event-card').getBoundingClientRect().left - parseFloat(getComputedStyle(area.querySelector('.type-guard.event-normal .event-card')).paddingLeft) - 1,
        stickyCenterDelta: area.querySelector('.event-sticky .avatar-wrap') ? center(area.querySelector('.event-sticky .avatar-wrap')) - center(area.querySelector('.event-sticky .content')) : 0,
        overflow: rows.filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.className),
      };
    });
    const check = (ok, message) => { if (!ok) failures.push({ size, width, dark, avatar, message, data }); };
    check(data.avatarDeltas.every(row => Math.abs(row.delta) <= 2), '头像对齐首行');
    check(Math.abs(data.bigNameDelta) <= 1, '大表情不改变用户名首行位置');
    check(Math.abs(data.bigRepeatDelta) <= 1, '大表情合并数量对齐表情首行');
    check(data.bigMedalLines === 1, '大表情不挤压粉丝牌文字');
    check(data.honorWatermark && !data.honorOverlap, '成就水印不占文字行且不挤压文字');
    check(Math.abs(data.resultTitleDelta) <= 2, '开奖图标对齐标题首行');
    check(data.resultFill === (dark ? 'rgb(64, 56, 79)' : 'rgb(241, 235, 252)'), '开奖使用同类事件配色');
    check(data.overflow.length === 0, '无横向溢出');
    if (width <= 320) check(Math.abs(data.narrowPurchaseOffset) <= 1, '窄幅购买正文通栏');
    if (width <= 320) check(data.resultTitleLines === 1, '窄幅开奖标题保持单行');
    if (width <= 320) check(data.honorPadding === '8px 12px', '窄幅成就保留设计稿紧凑内边距');
    check(Math.abs(data.stickyCenterDelta) <= 1, '置顶保持整行居中');
    const customLine = await page.locator('.event-area').evaluate(area => {
      area.style.setProperty('--event-line-height', '2');
      const value = getComputedStyle(area.querySelector('.type-gift.event-normal .content')).lineHeight;
      area.style.removeProperty('--event-line-height');
      return value;
    });
    check(customLine === `${size * 2}px`, '公共行高覆盖购买内容');
    const paddedButtonDelta = await page.locator('.event-area').evaluate(area => {
      area.style.setProperty('--event-padding', '20px');
      const result = area.querySelector('.lottery-result'), title = result.querySelector('.result-title'), toggle = result.querySelector('.winner-list-toggle');
      const r = document.createRange(); r.selectNodeContents(title); const text = r.getBoundingClientRect(), button = toggle.getBoundingClientRect();
      const delta = button.y + button.height / 2 - text.y - text.height / 2;
      area.style.removeProperty('--event-padding'); return delta;
    });
    check(Math.abs(paddedButtonDelta) <= 1, '显式内边距下按钮与开奖标题居中');
    const directPaddingDelta = await page.locator('.lottery-result .event-card').evaluate(card => {
      const original = card.getAttribute('style'); card.style.paddingBlock = '20px';
      const title = card.querySelector('.result-title'), toggle = card.querySelector('.winner-list-toggle');
      const r = document.createRange(); r.selectNodeContents(title); const text = r.getBoundingClientRect(), button = toggle.getBoundingClientRect();
      const delta = button.y + button.height / 2 - text.y - text.height / 2;
      if (original === null) card.removeAttribute('style'); else card.setAttribute('style', original); return delta;
    });
    check(Math.abs(directPaddingDelta) <= 1, '直接修改卡片内边距仍对齐按钮');
    await page.locator('.winner-list').evaluate(e => { e.open = true; e.classList.add('is-expanded'); });
    const list = await page.locator('.winner-list-items').evaluate(e => ({ width: e.clientWidth, card: e.closest('.event-card').clientWidth, padding: parseFloat(getComputedStyle(e.closest('.event-card')).paddingLeft) }));
    check(list.width >= list.card - list.padding * 2 - 2, '名单占满内容宽度');
    await page.screenshot({ path: `${output}/${size}-${width}-${dark ? 'dark' : 'light'}-${avatar ? 'avatar' : 'plain'}.png`, fullPage: true });
    results.push({ size, width, dark, avatar, ...data, list });
  }
  await writeFile(`${output}/组件对齐.json`, JSON.stringify(results, null, 2));
  assert.deepEqual(failures, [], JSON.stringify(failures.map(({ data, ...item }) => item)));
  console.log('首行头像、大表情、成就、开奖及窄幅名单对齐通过');
} finally {
  await browser.close();
  await server.close();
}
