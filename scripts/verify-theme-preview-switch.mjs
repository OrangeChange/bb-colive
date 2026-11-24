import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const base = process.env.PREVIEW_TEST_URL || "http://localhost:1420";
try {
  for (const asset of ["missing", "delay"]) {
    const page = await browser.newPage();
    await page.goto(`${base}/tests/fixtures/nativePreviewSwitch.html?asset=${asset}`);
    const open = async name => {
      await page.locator(".theme-library-card").filter({ has: page.getByText(name, { exact: true }) })
        .getByRole("button", { name: "编辑", exact: true }).click();
      await page.locator(".native-editor-heading h1").filter({ hasText: name }).waitFor();
    };
    const read = async () => page.frameLocator("iframe").locator(".message").first().evaluate(element => ({
      color: getComputedStyle(element).color,
      size: getComputedStyle(element).fontSize,
    }));
    const back = () => page.getByRole("button", { name: "返回样式", exact: true }).click();
    await open("测试A");
    assert.deepEqual(await read(), { color: "rgb(180, 0, 0)", size: "20.5px" });
    const fontInput = page.getByLabel("基准字号", { exact: false });
    for (const size of ["20", "20.5", "32"]) await fontInput.fill(size);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForTimeout(200);
    assert.equal(await fontInput.inputValue(), "32", "恢复窗口焦点不得恢复较早的草稿字号");
    assert.equal((await read()).size, "32px", "预览应保留最后一次编辑的字号");
    await back();
    await open("测试B");
    await back();
    await open("测试A");
    assert.equal(await fontInput.inputValue(), "32", "切换主题后应恢复该主题的最新草稿");
    await page.getByLabel("基准字号", { exact: false }).fill("24");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    assert.deepEqual(await read(), { color: "rgb(180, 0, 0)", size: "24px" });
    await back();
    await open("测试B");
    assert.deepEqual(await read(), { color: "rgb(0, 180, 0)", size: "32px" });
    await page.waitForTimeout(1200);
    assert.deepEqual(await read(), { color: "rgb(0, 180, 0)", size: "32px" });
    await back();
    await open("测试A");
    assert.deepEqual(await read(), { color: "rgb(180, 0, 0)", size: "24px" });
    await back();
    await open("原生默认");
    assert.equal((await read()).size, "16px");
    assert.ok(!["rgb(180, 0, 0)", "rgb(0, 180, 0)"].includes((await read()).color));
    await page.close();
    console.log(`主题切换、保存与预览隔离通过：资源${asset === "missing" ? "缺失" : "延迟"}`);
  }
} finally {
  await browser.close();
}
