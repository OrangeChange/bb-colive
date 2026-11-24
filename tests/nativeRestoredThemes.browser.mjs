import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';

const {chromium} = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = process.env.THEME_SCREENSHOTS;
const browser = await chromium.launch({channel: 'chrome', headless: true});
const results = [];
try {
  const page = await browser.newPage({viewport: {width: 650, height: 1000}});
  await page.goto('http://127.0.0.1:1420/tests/fixtures/nativeLayoutRepair.html');
  await page.waitForFunction(() => window.setNativeLayoutCase);
  if (output) await mkdir(output, {recursive: true});
  for (const theme of ['card', 'bubble']) {
    for (const dark of [false, true]) {
      for (const [width, baseSize] of [[480, 16], [260, 24]]) {
        const caseId = `${theme}-${dark ? 'dark' : 'light'}-${width}-${baseSize}`;
        await page.evaluate(state => window.setNativeLayoutCase(state), {
          caseId, theme, dark, width, baseSize, avatar: true, typographyOnly: true,
          timestamp: true,
        });
        await page.locator(`[data-fixture-case="${caseId}"]`).waitFor();
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(180);
        const metrics = await page.locator('.event-area').evaluate(area => {
          const rect = e => {
            const r = e.getBoundingClientRect();
            return {x: r.x, y: r.y, width: r.width, height: r.height};
          };
          const guard = area.querySelector('.type-guard');
          return {
            overflow: [...area.querySelectorAll('.event')].filter(e => e.scrollWidth > e.clientWidth + 2).map(e => e.className),
            guard: Object.fromEntries(['.avatar-wrap', '.user', '.action', '.guard-companion-days'].map(s => [s, rect(guard.querySelector(s))])),
            rows: [...area.querySelectorAll('.event')].map(e => ({classes: e.className, ...rect(e)})),
          };
        });
        assert.deepEqual(metrics.overflow, [], caseId);
        if (theme === 'bubble' && width === 480) {
          const g = metrics.guard;
          assert(Math.abs(g['.user'].y - g['.action'].y) < 2, '舰长姓名与购买动作在首行');
          assert(Math.abs(g['.user'].x - g['.guard-companion-days'].x) < 1, '陪伴说明对齐文字列');
        }
        if (output) await page.screenshot({path: `${output}/${caseId}.png`, fullPage: true});
        results.push({caseId, ...metrics});
      }
    }
  }
  for (const avatar of [true, false]) {
    for (const [width, baseSize] of [[480, 16], [260, 24]]) {
      const caseId = `guard-avatar-${avatar}-${width}`;
      await page.evaluate(state => window.setNativeLayoutCase(state), {
        caseId, theme: 'bubble', target: 'window', width, baseSize, avatar,
        baseSizeCase: true, sampleKeys: ['guard'],
        eventChanges: {user: {uid: 'fixture', uname: '很长的用户名用于确认头像与文字接续', guardLevel: 1}},
      });
      await page.locator(`[data-fixture-case="${caseId}"]`).waitFor();
      const event = page.locator('.type-guard');
      await page.waitForTimeout(100);
      const bounds = await event.evaluate(e => ({width: e.clientWidth, scroll: e.scrollWidth}));
      assert(bounds.scroll <= bounds.width + 2, caseId + JSON.stringify(bounds));
      if (avatar) assert(await event.evaluate(e => e.querySelector('.user').getBoundingClientRect().top < e.querySelector('.avatar-wrap').getBoundingClientRect().bottom), '长用户名应与头像从同一行开始');
      if (!avatar) assert.equal(await event.locator('.guard-companion-days').evaluate(e => getComputedStyle(e).marginLeft), '0px');
    }
  }
  if (output) await writeFile(`${output}/metrics.json`, JSON.stringify(results, null, 2));
  console.log('两套主题在明暗、正常及窄幅大字号下无横溢出；轻语舰长首行及陪伴说明对齐，关闭头像不留缩进');
} finally {
  await browser.close();
}
