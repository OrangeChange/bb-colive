import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import tailwindcss from '@tailwindcss/vite';
import { tmpdir } from 'node:os';

const server = await createServer({ configFile: false, cacheDir: tmpdir() + '/danmu-semantic-browser', plugins: [tailwindcss()], esbuild: { jsx: 'automatic' }, optimizeDeps: { entries: ['tests/fixtures/nativeLayoutRepair.html'], include: ['react', 'react-dom/client', 'react/jsx-runtime'] }, define: { __DANMU_BUILD_ID__: '"semantic-acceptance"' }, server: { host: '127.0.0.1', port: 0, hmr: false, watch: null }, logLevel: 'error' });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 800, height: 1000 } });
  page.on('pageerror', error => console.error(error.message));
  await page.route('**/*', route => /^(?:https?:\/\/)?(?:127\.0\.0\.1|localhost)(?::|\/)/.test(route.request().url()) ? route.continue() : route.abort());
  await page.goto(server.resolvedUrls.local[0] + 'tests/fixtures/nativeLayoutRepair.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.setNativeLayoutCase === 'function');
  let caseId = 0;
  const render = async state => {
    await page.evaluate(state => window.setNativeLayoutCase(state), {
      theme: 'default', target: 'live', width: 480, baseSizeCase: true, baseSize: 16,
      semantic: true, avatar: true, textIdentity: true, timestamp: true, ...state, caseId: ++caseId,
    });
    await page.locator(`[data-fixture-case="${caseId}"]`).waitFor();
    await page.evaluate(async () => { await document.fonts.ready; await new Promise(requestAnimationFrame); });
  };
  for (const theme of ['default', 'card', 'bubble']) for (const dark of [false, true]) {
    await render({ theme, dark, sampleKeys: ['text', 'normal-gift'], eventChanges: { user: { uid: 'multi', uname: '多重身份', guardLevel: 1, isAdmin: true } } });
    const rows = page.locator('.event.type-chat');
    assert.equal(await rows.count(), 1);
    assert.ok(await rows.first().evaluate(el => el.classList.contains('event-role-captain') && el.classList.contains('mod') && el.classList.contains('guard-level-3')));
    assert.equal(await rows.first().locator('.guard-badge').evaluate(el => getComputedStyle(el).color), await rows.first().evaluate(el => getComputedStyle(el).getPropertyValue('--name-captain').trim()).then(async value => page.evaluate(value => { const el = document.createElement('span'); el.style.color = value; document.body.append(el); const color = getComputedStyle(el).color; el.remove(); return color; }, value)));
    const slots = page.locator('.event-row-slot-content');
    assert.ok(await slots.first().evaluate(el => el.classList.contains('event-spacing-enabled') && parseFloat(getComputedStyle(el).paddingBottom) > 0));
    assert.equal(await slots.last().evaluate(el => el.classList.contains('event-spacing-enabled')), false);
    await render({ theme, dark, sampleKeys: ['lottery-result', 'pocket-result'] });
    for (const list of await page.locator('.winner-list').all()) {
      assert.equal(await list.locator('.winner-list-expand').isVisible(), true);
      assert.equal(await list.locator('.winner-list-collapse').isVisible(), false);
      await list.locator('summary').click();
      await page.waitForFunction(el => el.open && el.classList.contains('is-expanded'), await list.elementHandle());
      assert.equal(await list.locator('.winner-list-collapse').isVisible(), true);
      assert.equal(await list.locator('.winner-list-expand').isVisible(), false);
      await list.locator('summary').press('Enter');
      await page.waitForFunction(el => !el.open && !el.classList.contains('is-expanded'), await list.elementHandle());
    }
    for (const [role, user, color] of [
      ['captain', { guardLevel: 1 }, 'captain'], ['admiral', { guardLevel: 2 }, 'admiral'],
      ['viceroy', { guardLevel: 3 }, 'governor'], ['admin', { guardLevel: 0, isAdmin: true }, 'admin'],
      ['anchor', { guardLevel: 0, isAnchor: true }, 'anchor'],
    ]) {
      await render({ theme, dark, target: 'review', sampleKeys: ['text'], eventChanges: { user: { uid: role, uname: '身份配色', ...user } } });
      const row = page.locator('.event-surface-archive');
      assert.ok(await row.evaluate((el, role) => el.classList.contains('event-role-' + role), role));
      assert.equal(await row.evaluate(el => getComputedStyle(el).getPropertyValue('--review-role').trim()), await row.evaluate((el, color) => getComputedStyle(el).getPropertyValue('--review-' + color).trim(), color));
    }
  }
  console.log('三主题明暗模式：身份优先级、回看配色、名单鼠标/键盘展开和槽位间距通过');
} finally {
  await browser?.close();
  await server.close();
}
