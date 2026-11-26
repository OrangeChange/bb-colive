import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const mode of ['laplace', 'blivechat', 'blivechat-open']) {
    for (const target of ['live', 'windows', 'obs']) {
      const page = await browser.newPage();
      await page.goto(`${process.env.TEST_ORIGIN ?? 'http://127.0.0.1:1446'}/tests/fixtures/styleCommonBehavior.html?mode=${mode}&target=${target}&roomSwitch&animation=none`, { timeout: 45000 });
      await page.getByRole('button', { name: '追加事件', exact: true }).click();
      const isRendererFrame = frame => frame.parentFrame() !== null && frame.url() !== 'about:blank';
      const frame = page.frames().find(isRendererFrame) ?? await page.waitForEvent('framenavigated', { predicate: isRendererFrame });
      assert.ok(frame, `${mode}/${target}: 渲染器已加载`);
      await frame.getByText('房间 1 事件 1', { exact: false }).first().waitFor();
      await page.getByRole('button', { name: '切换房间', exact: true }).click();
      await page.getByRole('button', { name: '追加事件', exact: true }).click();
      if (target === 'obs') {
        await page.waitForTimeout(300);
        assert.equal(await frame.getByText('房间 2 事件 2', { exact: false }).count(), 0, `${mode}: OBS 不跟随现场`);
      } else {
        const activeFrame = page.frames().find(frame => frame.parentFrame() !== null && frame.url() !== 'about:blank');
        await activeFrame.getByText('房间 2 事件 2', { exact: false }).first().waitFor();
        assert.equal(await activeFrame.getByText('房间 1 事件 1', { exact: false }).count(), 0, `${mode}/${target}: 旧房间不混入`);
      }
      console.log(`${mode}/${target}: 切房显示符合目标范围`);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
