import assert from "node:assert/strict";
import { chromium } from "playwright";
const origin = process.env.TEST_ORIGIN ?? "http://127.0.0.1:1443";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const failures = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1100, height: 800 },
  });
  page.setDefaultTimeout(10000);
  const check = async (name, run) => {
    try {
      await run();
      console.log(name);
    } catch (error) {
      failures.push(`${name}: ${error.message}`);
    }
  };
  const home = async () => {
    await page.goto(`${origin}/tests/fixtures/reviewNavigation.html`, {
      waitUntil: "domcontentloaded",
    });
    await page.locator("article button").first().waitFor();
  };
  const owner = async () => {
    await home();
    await page.locator("article button").first().click();
    await page.locator(".review-session-row").first().waitFor();
  };
  await home();
  await check("主播卡高度包住头像且没有内层边框", async () => {
    const state = await page
      .locator("article button")
      .first()
      .evaluate((n) => ({
        height: n.getBoundingClientRect().height,
        avatar: n.querySelector("img").getBoundingClientRect().height,
        border: getComputedStyle(n).borderTopWidth,
      }));
    assert.ok(state.height >= state.avatar, JSON.stringify(state));
    assert.equal(state.border, "0px");
  });
  await owner();
  await check("场次内容自然撑高并从左侧排列", async () => {
    const state = await page
      .locator(".review-session-row")
      .first()
      .locator("button")
      .last()
      .evaluate((n) => ({
        height: n.getBoundingClientRect().height,
        align: getComputedStyle(n).alignItems,
        border: getComputedStyle(n).borderTopWidth,
      }));
    assert.ok(state.height > 40, JSON.stringify(state));
    assert.equal(state.align, "stretch");
    assert.equal(state.border, "0px");
  });
  await page.getByRole("button", { name: "导出数据", exact: true }).click();
  await check("导出弹窗保持原有672px上限", async () => {
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    assert.ok((await dialog.boundingBox()).width <= 673);
  });
  await home();
  await page.getByRole("tab", { name: "收藏", exact: true }).click();
  await check("收藏移除操作文字与背景保持不同颜色", async () => {
    const button = page.getByRole("button", { name: "取消收藏", exact: true });
    await button.waitFor();
    const colors = await button.evaluate((n) => ({
      text: getComputedStyle(n).color,
      bg: getComputedStyle(n).backgroundColor,
    }));
    assert.notEqual(colors.text, colors.bg);
  });
  await page.getByRole("button", { name: "编辑收藏", exact: true }).click();
  await check("编辑收藏弹窗保持原有520px上限", async () => {
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    assert.ok((await dialog.boundingBox()).width <= 521);
  });
  await owner();
  await page.getByRole("radio", { name: "事件检索", exact: true }).click();
  await page.getByRole("button", { name: "只看收益", exact: true }).click();
  await check("检索结果标题保持文本操作而非居中按钮", async () => {
    const button = page
      .locator(".review-owner-event-results button[aria-expanded]")
      .first();
    await button.waitFor();
    const styles = await button.evaluate((n) => ({
      justify: getComputedStyle(n).justifyContent,
      border: getComputedStyle(n).borderTopWidth,
    }));
    assert.match(styles.justify, /^(flex|flow)-start$/);
    assert.equal(styles.border, "0px");
  });
  await page.getByRole("button", { name: "更多筛选", exact: true }).click();
  await page.getByRole("button", { name: "礼物", exact: true }).last().hover();
  await check("分类子菜单左对齐且不带独立外框", async () => {
    const item = page.getByRole("menuitemcheckbox").first();
    await item.waitFor();
    const styles = await item.evaluate((n) => ({
      justify: getComputedStyle(n).justifyContent,
      border: getComputedStyle(n).borderTopWidth,
    }));
    assert.match(styles.justify, /^(flex|flow)-start$/);
    assert.equal(styles.border, "0px");
    const frame = page.locator("[data-slot=popover-content]").last();
    assert.equal(
      await frame.evaluate((n) => getComputedStyle(n).borderTopWidth),
      "0px",
    );
    assert.ok((await frame.boundingBox()).width < 220);
  });
  await owner();
  await page.locator(".review-session-row").first().locator("button").last().click();
  await page.locator(".review-timeline-display-wrap > button").click();
  await check("时间线显示菜单使用无内框的菜单项", async () => {
    const item = page.locator(".review-timeline-menu-item").first();
    await item.waitFor();
    assert.equal(await item.evaluate(n => getComputedStyle(n).borderTopWidth), "0px");
  });
} finally {
  await browser.close();
}
assert.deepEqual(failures, []);
