import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const mode of (
    process.env.IMAGE_REUSE_MODES || "native,laplace,blivechat,blivechat-open"
  ).split(",")) {
    const page = await browser.newPage({
      viewport: { width: 1500, height: 1000 },
    });
    page.setDefaultTimeout(12000);
    await page.goto(
      (process.env.THEME_IMAGE_TEST_URL || "http://127.0.0.1:1420") +
        "/tests/fixtures/themeImageMatrix.html?" +
        new URLSearchParams({ mode, theme: "native-default" }),
    );
    await page.getByRole("tab", { name: "可视化编辑", exact: true }).click();
    await page.waitForFunction(() =>
      [...document.querySelectorAll("iframe")].some((f) =>
        f.contentDocument?.querySelector(
          ".event,yt-live-chat-text-message-renderer",
        ),
      ),
    );
    await page
      .locator('nav[aria-label="语义部件"] details')
      .evaluateAll((ns) => ns.forEach((n) => (n.open = true)));
    await page
      .locator('button[data-native-part-id="avatarFrame"]:visible')
      .last()
      .click();
    if (mode.startsWith("blivechat")) {
      await page
        .locator(".native-event-scope-primary")
        .getByRole("button", { name: "弹幕", exact: true })
        .click();
      await page
        .locator(".native-identity-scope")
        .getByRole("button", { name: "普通用户", exact: true })
        .click();
    }
    await page
      .locator(".native-property-panel")
      .getByRole("button", { name: "头像框", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.locator(".shared-style-preview-content").waitFor();
    await dialog.getByRole("button", { name: "自定义", exact: true }).click();
    await dialog.getByRole("combobox", { name: "装饰图片" }).click();
    await page.getByRole("option", { name: "示例图片", exact: true }).click();
    await dialog.getByRole("button", { name: "使用图片", exact: true }).click();
    await page.waitForFunction(() =>
      document
        .querySelector(".theme-image-effect iframe")
        ?.contentDocument?.querySelector("img"),
    );
    await dialog
      .locator("iframe")
      .first()
      .evaluate((f) => {
        window.reuseDoc = f.contentDocument;
        window.reuseImage = f.contentDocument.querySelector("img");
        window.reuseImageWidth =
          window.reuseImage.getBoundingClientRect().width;
      });
    for (const size of ["40", "44", "48"])
      await dialog.getByLabel("装饰宽度", { exact: true }).fill(size);
    const separator = dialog.getByRole("separator", { name: "调整预览宽度" }),
      r = await separator.boundingBox();
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    await page.mouse.down();
    await page.mouse.move(r.x + r.width / 2 + 48, r.y + r.height / 2, {
      steps: 10,
    });
    await page.mouse.up();
    assert.equal(
      await dialog
        .locator("iframe")
        .first()
        .evaluate(
          (f) =>
            f.contentDocument === window.reuseDoc &&
            f.contentDocument.querySelector("img") === window.reuseImage,
        ),
      true,
      "调值和拉伸保留文档及图片节点",
    );
    assert.equal(
      await dialog
        .locator("iframe")
        .first()
        .evaluate(
          (f) =>
            f.contentDocument.querySelectorAll(
              "[data-preview-part-selected],[data-preview-part-hover],[data-compatible-editor-selected]",
            ).length,
        ),
      0,
    );
    const widthAfter = await dialog
      .locator("iframe")
      .first()
      .evaluate(
        (f) =>
          f.contentDocument.querySelector("img").getBoundingClientRect().width,
      );
    assert.ok(
      Math.abs(
        widthAfter - (await page.evaluate(() => window.reuseImageWidth)),
      ) < 0.1,
      "拉伸不缩放头像",
    );
    await dialog.getByRole("button", { name: "事件效果", exact: true }).click();
    await dialog.getByRole("button", { name: "当前部件", exact: true }).click();
    assert.equal(
      await dialog
        .locator("iframe")
        .first()
        .evaluate((f) => f.contentDocument === window.reuseDoc),
      true,
    );
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    console.log("passed renderer reuse", mode);
    await page.close();
  }
} finally {
  await browser.close();
}
