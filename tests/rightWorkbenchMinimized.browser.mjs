import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH ||
  'playwright');
const browser = await chromium.connectOverCDP(process.env.APP_CDP || 'http://127.0.0.1:19241');
try {
  const page = browser.contexts()[0].pages().find(item => item.url() === 'http://tauri.localhost/');
  assert.ok(page, '需要已登录的实际调试程序');
  const native = (command) => page.evaluate(command => window.__TAURI_INTERNALS__.invoke(`plugin:window|${command}`, { label: 'main' }), command);
  const readThemes = () => page.evaluate(async () => {
    const summaries = await window.__TAURI_INTERNALS__.invoke('list_theme_summaries');
    return Promise.all(summaries.map(item => window.__TAURI_INTERNALS__.invoke('read_theme_document', { themeId: item.themeId })));
  });
  const before = await readThemes();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const warnings = [];
  page.on('console', message => { if (message.type() === 'warning') warnings.push(message.text()); });
  const session = await page.context().newCDPSession(page);
  let counts = {};
  session.on('Network.requestWillBeSent', ({ request }) => {
    const url = new URL(request.url);
    if (url.hostname === 'ipc.localhost') {
      const command = decodeURIComponent(url.pathname.slice(1));
      counts[command] = (counts[command] || 0) + 1;
    }
  });
  await session.send('Network.enable');
  const click = locator => locator.evaluate(element => element.click());
  const back = page.getByRole('button', { name: '返回样式', exact: true });
  if (await back.isVisible()) await click(back);
  if (!await page.locator('.theme-library-card').count()) await click(page.getByRole('button', { name: '样式', exact: true }));
  await native('minimize');
  await page.waitForTimeout(250);
  const card = page.locator('.theme-library-card').filter({ has: page.locator('strong').getByText('LAPLACE 气泡 Next × 明前奶绿', { exact: true }) });
  await click(card.getByRole('button', { name: '编辑', exact: true }));
  await page.getByRole('button', { name: '静态', exact: true }).waitFor({ state: 'attached' });
  await page.waitForTimeout(500);
  counts = {};
  await page.waitForTimeout(5000);
  const minimized = { ...counts };
  for (const command of ['set_size', 'set_position', 'inner_size', 'outer_position']) {
    assert.equal(minimized[`plugin:window|${command}`] || 0, 0, `最小化时不应反复执行 ${command}`);
  }
  await native('unminimize');
  await page.waitForFunction(() => {
    const state = JSON.parse(sessionStorage.getItem('right-workbench-window') || '{}');
    return state.adjusted && Math.abs(innerWidth - state.adjusted.width) <= 1;
  });
  await page.waitForFunction(() => document.querySelector('aside[aria-label="功能工作台"] button[aria-expanded="true"]:not(:disabled)'));
  await page.frameLocator('iframe[title="LAPLACE 隔离预览"]').locator('.event-list .event').first().waitFor({ state: 'attached' });
  const restored = await native('inner_size');
  assert.ok(restored.width > 500 && restored.height > 400);
  for (let round = 0; round < 3; round++) {
    await click(page.getByRole('tab', { name: '高级编辑', exact: true }));
    await click(page.getByRole('tab', { name: '基础设置', exact: true }));
    await native('minimize');
    await page.waitForTimeout(150);
    await native('unminimize');
    await page.waitForTimeout(500);
  }
  await click(back);
  await page.waitForTimeout(1500);
  assert.deepEqual(await readThemes(), before, '验收不能修改主题文档');
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings.filter(message => message.includes('工作台窗口尺寸调整失败')), []);
  const result = { minimizedRequests: minimized, restored, switches: 3, themesUnchanged: before.length, errors, warnings };
  if (process.env.EVIDENCE_PATH) fs.writeFileSync(process.env.EVIDENCE_PATH, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
