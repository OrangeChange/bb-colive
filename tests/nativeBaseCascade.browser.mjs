import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const {chromium} = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({channel: 'chrome', headless: true});
try {
  const page = await browser.newPage();
  await page.goto((process.env.VITE_URL || 'http://127.0.0.1:1420') + '/tests/fixtures/nativeLayoutRepair.html');
  await page.waitForFunction(() => window.setNativeLayoutCase);
  for (const context of ['live', 'window-chat', 'window-pay', 'obs']) {
    const caseId = 'layers-' + context;
    await page.evaluate(state => window.setNativeLayoutCase(state), {
      caseId, theme: 'default', target: 'live', previewContext: context,
      baseSizeCase: true, semantic: true, avatar: true, width: 480, baseSize: 16,
    });
    await page.locator(`[data-fixture-case="${caseId}"]`).waitFor();
    const rows = page.locator('.theme-surface .event');
    assert(await rows.count() > 0, context);
    for (const [layer, color] of [['default', 'rgb(11, 22, 33)'], ['config', 'rgb(44, 55, 66)'], ['custom', 'rgb(77, 88, 99)']]) {
      const style = await page.addStyleTag({content: `@layer ${layer} { :where(.theme-surface) .event { background: ${color}; } }`});
      await style.evaluate((node, layer) => node.dataset.layerCheck = layer, layer);
      assert.deepEqual(await rows.evaluateAll(es => [...new Set(es.map(e => getComputedStyle(e).backgroundColor))]), [color], context + ': ' + layer);
    }
    await page.locator('style[data-layer-check]').evaluateAll(es => es.forEach(e => e.remove()));
  }
  console.log('现场、弹幕窗、收益窗及 OBS 预览的普通主题、配置和用户 CSS 依次覆盖底座');
} finally {
  await browser.close();
}
