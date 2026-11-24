import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createBuiltinCompatibleTheme } from '../src/themes/builtinThemeDefaults.ts';
import { composeBlivechatThemeCss } from '../src/compat/blivechat/css.ts';
import { createBlivechatSourceConfig } from '../src/compat/blivechat/sourceConfig.ts';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/') { res.setHeader('content-type', 'text/html'); res.end('<style>body{margin:0}iframe{border:0;width:800px;height:800px}</style><iframe src="/blivechat/renderer.html"></iframe>'); return; }
  try {
    const file = decodeURIComponent(url.pathname.slice(1));
    const data = await fs.readFile(path.join('public', file));
    res.setHeader('content-type', ({ '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html' })[path.extname(file)] || 'application/octet-stream'); res.end(data);
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const document = createBuiltinCompatibleTheme('blivechat');
  document.styles.customCss = `yt-live-chat-text-message-renderer{margin-bottom:50px}yt-live-chat-text-message-renderer #content{font-size:60px;line-height:60px}#items,#item-scroller{overflow:hidden!important}@keyframes author-entry{from{opacity:0;transform:translateY(50%);filter:blur(12px)}to{opacity:1;transform:translateY(0);filter:blur(0)}}yt-live-chat-text-message-renderer{animation:author-entry 800ms linear}`;
  for (const preset of ['none', 'slide']) {
    const page = await browser.newPage({ viewport: { width: 800, height: 800 } });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => document.querySelector('iframe')?.contentDocument?.querySelector('yt-live-chat-renderer')?.__vue__);
    const frame = page.frames().find(f => f.url().includes('/blivechat/renderer.html'));
    await frame.evaluate(() => {
      window.__motion = [];
      document.addEventListener('animationstart', e => {
        if (e.animationName === 'author-entry' && !e.pseudoElement) window.__motion.push(e.target.dataset.compatibleEventId);
      }, true);
    });
    const post = (command, data) => page.evaluate(({ command, data }) => document.querySelector('iframe').contentWindow.postMessage({ type: 'bb-blivechat', command, data }, location.origin), { command, data });
    await post('config', createBlivechatSourceConfig({ showGiftName: false }));
    await post('css', { css: composeBlivechatThemeCss(document) });
    await post('host', { managed: true, scale: 1, tickerEnabled: false, direction: 'bottom', renderMode: 'output' });
    const ids = [], records = [];
    const started = Date.now();
    for (let index = 0; index < 130; index++) {
      const id = `${preset}-${index}`; ids.push(id);
      const record = { method: 'onAddText', receivedAt: Date.now(), sequence: index + 1, payload: { id, authorName: '观众', authorType: 0, privilegeType: 0, content: `第${index}条弹幕`, contentParts: [{ type: 0, text: `第${index}条弹幕` }], avatarUrl: '/media/noface.gif', isMobileVerified: true } };
      records.push(record);
      const presentation = { layout: ids.slice(-50).map(eventId => ({ kind: 'source', eventId })), stickyRecords: [], direction: 'bottom', contentAlignment: 'top', animation: { preset, durationMs: 300 } };
      await post(index === 0 ? 'hydrate' : 'event-batch', { records: [record], presentation });
      const remaining = started + (index + 1) * 1000 / 30 - Date.now();
      if (remaining > 0) await new Promise(r => setTimeout(r, remaining));
    }
    await frame.waitForFunction(last => document.querySelector('#items > [data-compatible-event-id="' + last + '"]'), ids.at(-1));
    await new Promise(r => setTimeout(r, 850));
    const result = await frame.evaluate(() => ({ starts: window.__motion, ids: [...document.querySelectorAll('#items.yt-live-chat-item-list-renderer > [data-compatible-event-id]')].map(n => n.dataset.compatibleEventId) }));
    assert.deepEqual(result.ids, ids.slice(-50), '容量滑动后保留的事件及顺序正确');
    const counts = new Map(); for (const id of result.starts) counts.set(id, (counts.get(id) || 0) + 1);
    assert.deepEqual([...counts].filter(([, count]) => count > 1), [], `${preset} 旧事件不能重播作者入场动画`);
    assert.equal(result.starts.length, records.length, `${preset} 每条新事件只播放一次`);
    await frame.evaluate(() => { document.querySelector('yt-live-chat-renderer').__vue__.atBottom = false; });
    const id = `${preset}-paused`;
    const buffered = { ...records.at(-1), receivedAt: Date.now(), sequence: 131, payload: { ...records.at(-1).payload, id, content: '缓冲事件', contentParts: [{ type: 0, text: '缓冲事件' }] } };
    const presentation = { layout: [...ids.slice(-49), id].map(eventId => ({ kind: 'source', eventId })), stickyRecords: [], direction: 'bottom', contentAlignment: 'top', animation: { preset, durationMs: 300 } };
    await post('event-batch', { records: [buffered], presentation });
    await frame.waitForFunction(() => document.querySelector('yt-live-chat-renderer').__vue__.messagesBuffer.length === 1);
    await post('scroll-latest');
    await frame.waitForFunction(id => document.querySelector('yt-live-chat-renderer').__vue__.messagesBuffer.length === 0 && [...document.querySelectorAll('[data-compatible-event-id]')].some(n => n.dataset.compatibleEventId === id), id);
    await new Promise(r => setTimeout(r, 850));
    const starts = await frame.evaluate(() => window.__motion);
    assert.equal(starts.length, records.length + 1, '回到最新只为缓冲的新事件播放入场');
    assert.equal(new Set(starts).size, starts.length, '释放缓冲不重播旧事件');
    console.log(preset, '30条/秒、130条输入、容量50，作者动画各一次');
    await page.close();
  }
} finally { await browser?.close(); await new Promise(r => server.close(r)); }
