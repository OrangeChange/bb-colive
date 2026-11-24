import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseUrl = process.env.VITE_URL || 'http://127.0.0.1:1420';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const theme of ['native-default', 'native-card', 'native-bubble']) {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
    await page.route('**/media/noface.gif', route => route.abort());
    await page.goto(`${baseUrl}/tests/fixtures/nativeVisualConditions.html?theme=${theme}`);
    await page.getByRole('spinbutton', { name: '水平内边距精确值', exact: true, includeHidden: true }).waitFor({ state: 'attached' });
    const frame = page.frames().find(item => item.url() === 'about:blank');
    await frame.locator('.avatar-placeholder').waitFor();
    await frame.locator('.winner-list-toggle').click();
    for (const [part, selector] of [['avatarPlaceholder', '.avatar-placeholder'], ['blindGiftCount', '.blind-gift-count'], ['winnerListCount', '.winner-list-count']]) {
      await page.locator('nav[aria-label="语义部件"] details').evaluateAll(nodes => nodes.forEach(node => { node.open = true; }));
      await page.locator(`button[data-native-part-id="${part}"]:visible`).first().click();
      await page.locator('.native-property-sections>details').evaluateAll(nodes => nodes.forEach(node => { node.open = true; }));
      const input = page.getByRole('spinbutton', { name: '水平内边距精确值', exact: true });
      await input.fill('12');
      await input.press('Tab');
      assert.equal(await frame.locator(selector).first().evaluate(node => getComputedStyle(node).paddingLeft), '12px', `${theme}: ${part}`);
    }
    await page.goto(`${baseUrl}/tests/fixtures/themeImageMatrix.html?mode=native&theme=${theme}`);
    await page.getByRole('button', { name: '点选', exact: true }).click();
    await page.getByRole('tab', { name: '可视化编辑', exact: true }).click();
    await page.locator('nav[aria-label="语义部件"] details').evaluateAll(nodes => nodes.forEach(node => { node.open = true; }));
    await page.locator('button[data-native-part-id="avatar"]:visible').first().click();
    await page.locator('.native-property-sections>details').evaluateAll(nodes => nodes.forEach(node => { node.open = true; }));
    for (const [label, value] of [['宽度精确值', 48], ['高度精确值', 32]]) {
      const input = page.getByRole('spinbutton', { name: label, exact: true });
      await input.fill(String(value));
      await input.press('Tab');
    }
    const surface = page.frames().find(item => item.url() === 'about:blank');
    const avatar = surface.locator('.event-list .avatar-wrap').first();
    assert.deepEqual(await avatar.evaluate(node => {
      const style = getComputedStyle(node);
      return [style.width, style.height];
    }), ['48px', '32px'], `${theme}: 头像容器宽高分别生效`);
    await page.locator('.native-property-group.is-height').getByRole('button', { name: '恢复继承', exact: true }).click();
    assert.deepEqual(await avatar.evaluate(node => {
      const style = getComputedStyle(node);
      return [style.width, style.height];
    }), ['48px', '48px'], `${theme}: 恢复高度保留宽度`);
    const widthInput = page.getByRole('spinbutton', { name: '宽度精确值', exact: true });
    await widthInput.fill('-10');
    await widthInput.press('Tab');
    assert.equal(await widthInput.inputValue(), '0', `${theme}: 尺寸不能保存负数`);
    await page.locator('button[data-native-part-id="username"]:visible').first().click();
    await page.locator('.native-property-sections>details').evaluateAll(nodes => nodes.forEach(node => { node.open = true; }));
    const weight = page.getByRole('spinbutton', { name: '字重精确值', exact: true });
    await weight.fill('');
    await weight.pressSequentially('700');
    await weight.press('Tab');
    assert.equal(await weight.inputValue(), '700', `${theme}: 连续输入不受最小值干扰`);
    await page.locator('.native-property-group.is-color').getByRole('button', { name: '颜色', exact: true }).click();
    const picker = await page.locator('.react-colorful__saturation').boundingBox();
    await page.mouse.move(picker.x + picker.width * 0.35, picker.y + picker.height * 0.4);
    await page.mouse.down();
    await page.mouse.move(picker.x + picker.width * 0.6, picker.y + picker.height * 0.65, { steps: 4 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.mouse.up();
    await page.waitForFunction(() => window.nativeVisualAcceptance.getDocument().settings.visualModel.common['all|all|username']?.color?.source === 'custom');
    await page.getByRole('button', { name: '关闭颜色面板', exact: true }).click();
    await page.locator('button[data-native-part-id="row"]:visible').first().click();
    await page.getByRole('combobox', { name: '金额档位', exact: true }).click();
    await page.getByRole('option', { name: '基础档（不足下一档）', exact: true }).click();
    assert.equal(await page.locator('.native-property-panel').getByRole('button', { name: '图片背景', exact: true }).count(), 0, `${theme}: 档位核心底色只提供颜色编辑`);
    console.log(`${theme}: 延迟部件读取、条件部件编辑和头像宽高恢复通过`);
    await page.close();
  }
} finally {
  await browser.close();
}
