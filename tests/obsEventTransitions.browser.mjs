import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.OBS_TRANSITIONS_TEST_URL || 'http://127.0.0.1:1437';

test('OBS 追加、更新和退场保持事件与动画状态', async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.route(`${base}/obs-transition-test`, route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
    await page.goto(`${base}/obs-transition-test`);
    await page.evaluate(async () => {
      const reactModule = await import('/node_modules/.vite-style-audit-1437/deps/react.js');
      const React = reactModule.default ?? reactModule;
      const dom = await import('/node_modules/.vite-style-audit-1437/deps/react-dom_client.js');
      const createRoot = dom.createRoot ?? dom.default.createRoot;
      const { useObsEventTransitions } = await import('/src/obs/useObsEventTransitions.ts');
      const { DEFAULT_EVENT_WINDOW_PREFERENCES } = await import('/src/windows/eventWindowPreferences.ts');
      const prefs = { ...DEFAULT_EVENT_WINDOW_PREFERENCES, capacity: 1, display: { ...DEFAULT_EVENT_WINDOW_PREFERENCES.display, eventAnimationPreset: 'fade', eventAnimationDurationMs: 200 } };
      window.__commits = [];
      function Surface({ events, removed = [] }) {
        const result = useObsEventTransitions(events, prefs, removed);
        React.useLayoutEffect(() => { window.__commits.push(result.events.map(e => e.id).join(',')); });
        return React.createElement('div', null, result.events.map(e => React.createElement('span', { key: e.id, 'data-removing': result.removingEventIds.has(e.id) }, `${e.id}:${e.text}`)));
      }
      const root = createRoot(document.getElementById('root'));
      window.__render = (events, removed = []) => root.render(React.createElement(Surface, { events, removed }));
    });
    await page.evaluate(() => window.__render([{ id: 'a', text: 'one' }]));
    await page.locator('span').first().waitFor();
    await page.evaluate(() => { window.__commits = []; window.__render([{ id: 'a', text: 'updated' }, { id: 'b', text: 'new' }]); });
    await page.getByText('a:updated').waitFor();
    assert.deepEqual(await page.evaluate(() => window.__commits), ['a,b']);
    await page.evaluate(() => window.__render([{ id: 'b', text: 'new' }]));
    await page.locator('[data-removing="true"]').waitFor();
    assert.equal(await page.locator('[data-removing="true"]').textContent(), 'a:updated');
    await page.locator('[data-removing="true"]').waitFor({ state: 'detached' });
    assert.deepEqual(await page.locator('span').allTextContents(), ['b:new']);
    await page.evaluate(() => window.__render([{ id: 'c', text: 'new' }], ['b']));
    await page.getByText('c:new').waitFor();
    assert.deepEqual(await page.locator('span').allTextContents(), ['c:new']);
  } finally {
    await browser.close();
  }
});
