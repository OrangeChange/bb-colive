import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
page.setDefaultTimeout(7000);
const focused = async (locator) =>
  assert.equal(
    await locator.evaluate((node) => node === document.activeElement),
    true,
  );
try {
  await page.goto("http://127.0.0.1:1436/tests/fixtures/shadcn/keyboard.html");
  const anchor = page.getByRole("button", { name: /主播一/ }).first();
  await anchor.press("Enter", { delay: 50 });
  const first = page.locator(".anchor-menu-select").first();
  await first.waitFor();
  await focused(first);
  await page.keyboard.press("Tab");
  await focused(page.getByRole("button", { name: /删除.*主播一/ }));
  await page.keyboard.press("Escape");
  await first.waitFor({ state: "hidden" });
  await focused(anchor);
  const menu = page.locator(".event-menu-trigger");
  await menu.press("ArrowDown", { delay: 50 });
  const items = page.locator("[role=menuitem]:not(:disabled)");
  await items.first().waitFor();
  await focused(items.first());
  await page.keyboard.press("ArrowDown", { delay: 50 });
  await focused(items.nth(1));
  await page.keyboard.press("End");
  await focused(items.last());
  await page.keyboard.press("Escape");
  await items.first().waitFor({ state: "hidden" });
  await focused(menu);
  const color = page.getByRole("button", { name: "颜色", exact: true });
  await color.press("Enter", { delay: 50 });
  const picker = page.locator(".theme-color-popover");
  await picker.waitFor();
  const hue = picker.locator('.react-colorful__hue [role="slider"]');
  const before = await page.locator("#color-value").innerText();
  await hue.focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(
    (value) => document.querySelector("#color-value").textContent !== value,
    before,
  );
  await page.keyboard.press("Escape");
  await picker.waitFor({ state: "hidden" });
  await focused(color);
  const fill = page.getByRole("button", { name: "背景填充", exact: true });
  await fill.press("Enter", { delay: 50 });
  const gradient = page.locator(".theme-background-popover");
  await gradient.waitFor();
  const stop = gradient.locator(".theme-gradient-stop").first();
  await stop.focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(await stop.getAttribute("aria-valuenow"), "1");
  const angle = gradient.locator(".theme-angle-dial");
  await angle.focus();
  const old = Number(await angle.getAttribute("aria-valuenow"));
  await page.keyboard.press("ArrowRight");
  assert.equal(Number(await angle.getAttribute("aria-valuenow")), old + 1);
  await page.keyboard.press("Escape");
  await gradient.waitFor({ state: "hidden" });
  await focused(fill);
  console.log("主播列表、事件菜单、颜色与渐变纯键盘操作通过");
} finally {
  await browser.close();
}
