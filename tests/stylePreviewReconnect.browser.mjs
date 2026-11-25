import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.FEED_TEST_URL || 'http://127.0.0.1:1437';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 520, height: 400 } });
  const html = await (await page.request.get(`${origin}/obs.html`)).text();
  await page.route(`${origin}/preview`, route => route.fulfill({ status: 200, contentType: 'text/html', body: html }));
  await page.addInitScript(() => {
    const Original = window.WebSocket;
    window.__previewSockets = [];
    window.WebSocket = class {
      constructor(url, ...args) {
        if (!String(url).includes('preview=current')) return new Original(url, ...args);
        window.__previewSockets.push(this);
      }
      close() {}
    };
  });
  await page.goto(`${origin}/preview`);
  await page.waitForFunction(() => window.__previewSockets.length === 1);
  const state = await page.evaluate(async () => {
    const { createStylePreviewPartEvents } = await import('/src/components/stylePreviewEvents.ts');
    const { DEFAULT_EVENT_STYLE_SETTINGS } = await import('/src/eventStyleSettings.ts');
    const { DEFAULT_EVENT_DISPLAY_PREFERENCES } = await import('/src/eventDisplaySettings.ts');
    const { DEFAULT_STICKY_EVENT_SETTINGS } = await import('/src/windows/stickyEventModel.ts');
    const sample = createStylePreviewPartEvents('弹幕')[0];
    return { kind: 'native', ownerId: 'test', revision: 1, width: 520, height: 400, palette: 'pine', scheme: 'light', frame: { epoch: 0, restart: 0 }, content: {
      previewCss: '', previewMotion: 'static', context: 'live', mode: 'all', events: Array.from({ length: 80 }, (_, i) => ({ ...sample, id: `test-${i}`, reactKey: `test-${i}`, text: `测试 ${i}` })),
      eventStyleSettings: DEFAULT_EVENT_STYLE_SETTINGS, displayPreferences: DEFAULT_EVENT_DISPLAY_PREFERENCES, eventFontSize: 16, windowEventFontSize: 16, stickySettings: DEFAULT_STICKY_EVENT_SETTINGS, previewScheme: 'light',
    } };
  });
  const send = state => page.evaluate(value => window.__previewSockets.at(-1).onmessage({ data: JSON.stringify({ type: 'preview:replace', state: value }) }), state);
  await send(state);
  const frame = page.frameLocator('.shared-style-preview-content iframe');
  const list = frame.locator('.native-preview-message-scroll');
  await list.waitFor();
  await page.waitForTimeout(500);
  await list.hover();
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(300);
  const read = () => list.evaluate(node => {
    const row = [...node.querySelectorAll('[data-event-id]')].find(item => item.getBoundingClientRect().bottom > node.getBoundingClientRect().top);
    return { id: row?.getAttribute('data-event-id'), offset: row?.getBoundingClientRect().top - node.getBoundingClientRect().top, top: node.scrollTop };
  });
  const before = await read();
  assert.ok(before.top > 0, '已滚动到其他样例');
  await page.evaluate(() => window.__previewSockets.at(-1).onclose());
  assert.equal(await page.locator('.shared-style-preview-content').count(), 1);
  await page.waitForFunction(() => window.__previewSockets.length === 2);
  await send(state);
  await page.waitForTimeout(300);
  assert.deepEqual(await read(), before, '重连后保留本页锚点');
  await send({ ...state, revision: 2, frame: { ...state.frame, restart: 1 } });
  await page.waitForTimeout(300);
  assert.ok(await list.evaluate(node => node.scrollTop <= 4), '明确重播恢复静态样例起始位置');
  console.log(JSON.stringify({ page: '/preview', transport: '模拟 WebSocket', reconnect: before, restart: 'static-start' }));
} finally { await browser.close(); }
