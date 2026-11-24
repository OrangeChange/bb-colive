import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const baseUrl = process.env.PREVIEW_TEST_URL || "http://127.0.0.1:1420";

test("三版基础设置在实际编辑器中更新并在切页后保持", async () => {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    for (const mode of ["blivechat", "blivechat-open", "laplace"]) {
      const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
      await page.goto(`${baseUrl}/tests/fixtures/compatibleEditorBridge.html?mode=${mode}`);
      await page.getByRole("tab", { name: "基础设置", exact: true }).click();
      const giftGroup = page.getByRole("region", { name: "礼物细项", exact: true });
      const gift = page.getByRole("switch", { name: "礼物", exact: true });
      await giftGroup.getByRole("button", { name: "清空", exact: true }).click();
      assert.equal(await gift.getAttribute("aria-checked"), "true");
      assert.equal(await page.getByRole("switch", { name: "醒目留言", exact: true }).getAttribute("aria-checked"), "true");
      assert.equal(await page.getByRole("switch", { name: "免费礼物", exact: true }).getAttribute("aria-checked"), "false");
      await gift.click();
      assert.equal(await page.getByRole("switch", { name: "免费礼物", exact: true }).isDisabled(), true);
      await gift.click();
      assert.equal(await page.getByRole("switch", { name: "免费礼物", exact: true }).getAttribute("aria-checked"), "false");
      await giftGroup.getByRole("button", { name: "全选", exact: true }).click();
      const frame = page.frameLocator("iframe").first();
      const gifts = frame.locator(mode === "laplace" ? ".event--gift" : "yt-live-chat-paid-message-renderer");
      await gifts.first().waitFor();
      if (mode === "laplace") {
        const allParts = page.getByRole("switch", { name: "显示全部部件", exact: true });
        if (await allParts.getAttribute("aria-checked") === "true") await allParts.click();
        await gift.click();
        await gifts.first().waitFor({ state: "detached" });
        await gift.click();
        await gifts.first().waitFor();
      }
      const time = page.getByRole("switch", { name: "时间", exact: true });
      await time.click();
      assert.equal(await time.getAttribute("aria-checked"), "true");
      if (mode === "blivechat") {
        await page.getByLabel("整体比例 G", { exact: true }).fill("1.5");
        await page.getByLabel("字体比例 F", { exact: true }).fill("1.5");
        await page.getByRole("switch", { name: "显示礼物名称与数量" }).click();
      } else if (mode === "blivechat-open") {
        assert.equal(await page.getByText("大表情大小", { exact: true }).count(), 0);
        await page.getByRole("switch", { name: "来源默认皮肤", exact: true }).click();
      } else {
        await page.getByLabel("基准字号 B", { exact: true }).fill("24");
        await page.getByLabel("场景", { exact: true }).fill("游戏");
        await page.getByRole("switch", { name: "头像", exact: true }).click();
        assert.equal(await page.getByRole("switch", { name: "用户名", exact: true }).getAttribute("aria-checked"), "true");
        await page.getByRole("switch", { name: "经典控制范围" }).click();
      }
      await page.getByRole("tab", { name: "可视化编辑", exact: true }).click();
      await page.getByRole("tab", { name: "基础设置", exact: true }).click();
      assert.equal(await time.getAttribute("aria-checked"), "true");
      if (mode === "blivechat") assert.equal(await page.getByLabel("整体比例 G", { exact: true }).inputValue(), "1.5");
      if (mode === "laplace") {
        assert.equal(await page.getByLabel("基准字号 B", { exact: true }).inputValue(), "24");
        assert.equal(await page.getByLabel("场景", { exact: true }).inputValue(), "游戏");
        assert.equal(await page.getByRole("switch", { name: "头像", exact: true }).getAttribute("aria-checked"), "false");
      }
      await page.close();
    }
  } finally { await browser.close(); }
});

test("时间和用户名打码只在副窗口与 OBS 预览生效", async () => {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    for (const mode of ["blivechat", "blivechat-open", "laplace"]) {
      const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
      await page.goto(`${baseUrl}/tests/fixtures/compatibleEditorBridge.html?mode=${mode}`);
      await page.getByRole("switch", { name: "时间", exact: true }).click();
      await page.getByRole("switch", { name: "用户名打码", exact: true }).click();
      const target = page.getByRole("combobox", { name: "预览目标" });
      const frame = page.frames().find(value => value !== page.mainFrame());
      assert.ok(frame);
      if (mode === "laplace") {
        await frame.waitForFunction(() => [...document.querySelectorAll(".username-text")].some(element => element.textContent === "***"));
        await target.click(); await page.getByRole("option", { name: "现场", exact: true }).click();
        await frame.waitForFunction(() => [...document.querySelectorAll(".username-text")].some(element => element.textContent && element.textContent !== "***"));
        assert.equal(await frame.locator(".timestamp:not(.inline)").evaluateAll(elements => elements.filter(element => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && getComputedStyle(element).display !== "none";
        }).length), 0);
        assert.ok(await frame.locator(".timestamp.inline").evaluateAll(elements => elements.filter(element => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && getComputedStyle(element).display !== "none";
        }).length) > 0);
      } else {
        const author = frame.locator("#author-name").filter({ visible: true }).first();
        await author.waitFor();
        assert.equal(await author.evaluate(element => getComputedStyle(element).fontSize), "0px");
        await target.click(); await page.getByRole("option", { name: "现场", exact: true }).click();
        await frame.waitForFunction(() => {
          const element = [...document.querySelectorAll("#author-name")].find(node => node.getBoundingClientRect().width > 0);
          return element && getComputedStyle(element).fontSize !== "0px";
        });
        assert.equal(await frame.locator("#timestamp").evaluateAll(elements => elements.filter(element => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && getComputedStyle(element).display !== "none";
        }).length), 0);
      }
      await page.close();
    }
  } finally { await browser.close(); }
});
