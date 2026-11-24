import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const baseUrl = process.env.PREVIEW_TEST_URL || "http://127.0.0.1:1420";

async function chooseEvent(page, option) {
  await page.locator(".native-event-scope-primary, .native-event-scope-children").getByRole("button", { name: option, exact: true }).first().click();
}
async function setNumber(page, label, value) {
  await page.locator('.native-property-sections details').evaluateAll(nodes => nodes.forEach(node => { node.open = true; }));
  const input = () => page.locator('.native-property-panel').getByRole('spinbutton', { name: new RegExp(`^${label}(?:精确值)?$`) });
  const fillAndWait = async expected => {
    await input().fill(String(expected));
    await input().press('Tab');
    for (let attempt = 0; attempt < 20 && await input().inputValue() !== String(expected); attempt += 1) {
      await page.waitForTimeout(10);
    }
    assert.ok(Math.abs(Number(await input().inputValue()) - expected) < 0.05);
  };
  await fillAndWait(value - 1);
  await fillAndWait(value);
}
async function selectPart(page, name) {
  await page.locator('nav[aria-label="语义部件"] details').evaluateAll(nodes => nodes.forEach(node => { node.open = true; }));
  const id = { '头像': 'avatar', '金额': 'amount', '所有事件': 'all-events' }[name];
  if (id) await page.locator(`nav[aria-label="语义部件"] [data-navigation-id="${id}"]`).click();
  else await page.locator('nav[aria-label="语义部件"]').getByRole('button', { name, exact: true }).click();
}

test("LAPLACE 实际控件保存重开后保持 B24 实际值并物化到注册预览", async () => {
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.setDefaultTimeout(8000);
    await page.goto(`${baseUrl}/tests/fixtures/laplaceEditorLifecycle.html`);
    await page.getByText("基准字号").locator("..").locator('input[type="number"]').fill("24");
    await page.getByRole("tab", { name: "可视化编辑" }).click();

    await chooseEvent(page, "礼物"); await selectPart(page, "头像"); await setNumber(page, "宽度", 48); await setNumber(page, "高度", 48);
    await chooseEvent(page, "醒目留言"); await selectPart(page, "头像"); await setNumber(page, "宽度", 60); await setNumber(page, "高度", 60);
    await chooseEvent(page, "大航海"); await selectPart(page, "头像"); await setNumber(page, "宽度", 60); await setNumber(page, "高度", 60);
    await chooseEvent(page, "礼物"); await selectPart(page, "金额"); await setNumber(page, "字号", 14.4);
    await chooseEvent(page, "弹幕"); await selectPart(page, "所有事件"); await setNumber(page, "水平内边距", 12); await setNumber(page, "垂直内边距", 3);

    const edited = await page.evaluate(() => window.laplaceLifecycleQa.snapshot());
    await page.getByRole("button", { name: "应用", exact: true }).click();
    await page.waitForFunction(() => window.laplaceLifecycleQa.snapshot().revision === 2);
    await page.evaluate(() => window.laplaceLifecycleQa.reopen());

    const persisted = await page.evaluate(() => window.laplaceLifecycleQa.snapshot());
    assert.ok(persisted.settings.visualModel, JSON.stringify(persisted.settings));
    const model = persisted.settings.visualModel.common;
    assert.equal(persisted.settings.baseFontSize, 24);
    assert.deepEqual(persisted.settings.visualModel, edited.settings.visualModel);
    for (const key of ['gift|all|main|avatar','superchat|all|main|avatar','guard|all|main|avatar','gift|all|main|amount']) assert.ok(model[key]);

    await page.getByRole("tab", { name: "可视化编辑" }).click();
    await chooseEvent(page, "礼物"); await selectPart(page, "头像");
    await page.locator('.native-property-sections details').evaluateAll(nodes => nodes.forEach(node => { node.open = true; }));
    await page.waitForFunction(() => [...document.querySelectorAll('.native-property-panel input')].some(node => /^宽度(?:精确值)?$/.test(node.getAttribute('aria-label') || '') && node.value === '48'));
    assert.equal(await page.locator('.native-property-panel').getByRole('spinbutton', { name: /^宽度(?:精确值)?$/ }).inputValue(), "48");
    await selectPart(page, "金额");
    await page.locator('.native-property-sections details').evaluateAll(nodes => nodes.forEach(node => { node.open = true; }));
    assert.equal(await page.locator('.native-property-panel').getByRole('spinbutton', { name: '字号精确值', exact: true }).inputValue(), "14.4");

    const frame = page.frameLocator('iframe[title="LAPLACE 隔离预览"]');
    const customCss = await frame.locator("body").evaluate(() => [...document.querySelectorAll("style#dynamic-custom-css")].map(style => style.textContent ?? ""));
    assert.equal(customCss.length, 1);
    assert.ok(customCss[0].length > 0);
    assert.equal(await frame.locator(".event-list .event--gift img.avatar").first().evaluate(element => getComputedStyle(element).width), "48px");
    assert.equal(await frame.locator(".event-list .event--superchat img.avatar").first().evaluate(element => getComputedStyle(element).width), "60px");
    assert.equal(await frame.locator(".event-list .event--toast img.avatar").first().evaluate(element => getComputedStyle(element).width), "60px");
    assert.equal(await frame.locator(".event-list .event--gift .price").first().evaluate(element => getComputedStyle(element).fontSize), "14.4px");
    const padding = await frame.locator(".event--message").first().evaluate(element => ({ x: getComputedStyle(element).paddingInline, y: getComputedStyle(element).paddingBlock }));
    assert.deepEqual(padding, { x: "12px", y: "3px" });
  } finally { await browser.close(); }
});
