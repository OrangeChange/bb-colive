import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const direction of ['bottom', 'top']) for (const input of ['batch', '200ms']) for (const command of ['scroll-latest', 'restore-scroll']) {
    const page = await browser.newPage({ viewport: { width: 420, height: 600 } });
    try {
      await page.goto((process.env.FEED_TEST_URL || 'http://127.0.0.1:1437') + '/openlive/renderer.html');
      await page.waitForFunction(() => document.querySelector('yt-live-chat-renderer')?.__vue__);
      await page.evaluate(async direction => {
        const send = (command, data) => window.postMessage({ type: 'bb-openlive', command, data }, location.origin);
        send('host', { managed: true, direction, scale: 1, tickerEnabled: false });
        const sample = (await import('/src/components/stylePreviewEvents.ts')).createStylePreviewEvents('弹幕')[0];
        const project = (await import('/src/compat/openlive/projection.ts')).projectOpenLiveCallback;
        window.__followTestRecords = Array.from({ length: 12 }, (_, i) => {
          const id = `follow-${direction}-${i}`;
          return project({ ...sample, id, reactKey: id, text: id, roomId: 24125, ts: Date.now() + i }, i);
        });
        send('hydrate', { records: window.__followTestRecords.slice(0, 1) });
      }, direction);
      await page.waitForTimeout(1300);
      await page.evaluate(() => { document.querySelector('yt-live-chat-renderer').__vue__.atBottom = false; });
      for (let i = 1; i < 12; i++) {
        await page.evaluate(i => window.postMessage({ type: 'bb-openlive', command: 'event', data: window.__followTestRecords[i] }, location.origin), i);
        if (input === '200ms') await page.waitForTimeout(200);
      }
      await page.waitForTimeout(1500);
      const read = () => page.evaluate(() => {
        const renderer = document.querySelector('yt-live-chat-renderer').__vue__;
        const scroller = document.querySelector('#item-scroller');
        return { ids: renderer.messages.map(message => message.id), buffered: renderer.messagesBuffer.length, top: scroller.scrollTop, max: scroller.scrollHeight - scroller.clientHeight };
      });
      const before = await read();
      assert.ok(before.buffered > 0 && before.max === 0, `${direction}/${input}：已缓冲且没有可滚动空间`);
      await page.evaluate(command => window.postMessage({ type: 'bb-openlive', command, data: command === 'restore-scroll' ? { followingLatest: true, scrollTop: 0 } : undefined }, location.origin), command);
      await page.waitForTimeout(1500);
      const after = await read();
      assert.equal(after.buffered, 0, `${direction}/${input}/${command}：回到最新后释放缓冲`);
      assert.equal(new Set(after.ids).size, 12, `${direction}/${input}/${command}：全部事件各显示一次`);
      assert.ok(direction === 'top' ? after.top <= 4 : after.max - after.top <= 4, `${direction}/${input}/${command}：保持跟随`);
    } finally { await page.close(); }
  }
  console.log('BLC 开放版：两方向批量与 200 ms 输入的缓冲释放通过');
} finally { await browser.close(); }
