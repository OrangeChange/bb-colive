import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// 在已选择直播间、玻璃材质的桌面程序上运行；仅通过 CDP 操作窗口。
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${process.env.CDP_PORT || 9845}`);
const context = browser.contexts()[0];
const main = context.pages().find(page => page.url() === 'http://tauri.localhost/');
assert.ok(main, '请先启动开启 CDP 的桌面程序');
const original = [];
try {
  await main.getByRole('button', { name: '打开设置', exact: true }).waitFor({ timeout: 30000 });
  const connect = main.getByRole('button', { name: '连接', exact: true }).first();
  if (await connect.isVisible()) await connect.click();
  await main.getByText('已连接', { exact: true }).first().waitFor({ timeout: 30000 });
  for (const name of ['打开弹幕窗', '打开收益窗']) {
    const button = main.getByRole('button', { name, exact: true });
    if (await button.count()) await button.click();
  }
  for (const label of ['display', 'gift']) {
    let page;
    for (let attempt = 0; attempt < 300; attempt++) {
      page = context.pages().find(page => page.url().includes(`window=${label}`));
      if (page) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(page, `${label} 未打开`);
    await page.locator('[data-material="glass"]').waitFor();
    const size = await page.evaluate(label => window.__TAURI_INTERNALS__.invoke('plugin:window|inner_size', { label }), label);
    const position = await page.evaluate(label => window.__TAURI_INTERNALS__.invoke('plugin:window|outer_position', { label }), label);
    original.push({ page, label, size, position });
  }
  const started = Date.now();
  await Promise.all(original.map(({ page, label, size }) => page.evaluate(async ({ label, size }) => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    for (let index = 0; index < 240; index++) {
      await invoke('plugin:window|set_size', { label, value: { Physical: {
        width: size.width + (index % 2) * 24,
        height: size.height + (index % 3) * 16,
      } } });
      await new Promise(resolve => setTimeout(resolve, 60));
    }
  }, { label, size })));
  const gift = original.find(value => value.label === 'gift');
  await main.getByRole('button', { name: '关闭收益窗', exact: true }).click();
  await main.getByRole('button', { name: '打开收益窗', exact: true }).waitFor();
  await main.getByRole('button', { name: '打开收益窗', exact: true }).click();
  for (let attempt = 0; attempt < 300; attempt++) {
    const reopened = context.pages().find(page => page !== gift.page && page.url().includes('window=gift'));
    if (reopened) { gift.page = reopened; break; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  await gift.page.locator('[data-material="glass"]').waitFor();
  while (Date.now() - started < 180000) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    await main.getByText('已连接', { exact: true }).first().waitFor({ timeout: 3000 });
    for (const { page } of original) {
      assert.equal(await page.locator('[data-material="glass"]').count(), 1);
      assert.ok(await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:app|version')));
    }
  }
  console.log(JSON.stringify({ connected: true, glassWindows: original.map(value => value.label), resizeCount: 480, elapsedSeconds: (Date.now() - started) / 1000 }));
} finally {
  for (const { page, label, size, position } of original) {
    if (!page.isClosed()) await page.evaluate(async ({ label, size, position }) => {
      await window.__TAURI_INTERNALS__.invoke('plugin:window|set_size', { label, value: { Physical: size } });
      await window.__TAURI_INTERNALS__.invoke('plugin:window|set_position', { label, value: { Physical: position } });
    }, { label, size, position }).catch(() => {});
  }
  await browser.close();
}
