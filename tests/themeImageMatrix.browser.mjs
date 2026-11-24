import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { writeFile, mkdir } from "node:fs/promises";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : { channel: "chrome" }) });
const results = [];
const output = process.env.ACCEPTANCE_DIRECTORY || ".superpowers/sdd/theme-image-matrix";
await mkdir(output, { recursive: true });
try {
  for (const [mode, theme] of [
    ["native", "native-default"],
    ["native", "native-card"],
    ["native", "native-bubble"],
    ["laplace", ""],
    ["blivechat", ""],
    ["blivechat-open", ""],
  ]) {
    if (process.argv[2] && !process.argv[2].split(",").includes(mode)) continue;
    console.log("checking", mode, theme);
    const page = await browser.newPage({
      viewport: { width: 1500, height: 1000 },
    });
    page.setDefaultTimeout(30000);
    await page.goto(
      (process.env.THEME_IMAGE_TEST_URL || "http://127.0.0.1:1420") + "/tests/fixtures/themeImageMatrix.html?" +
        new URLSearchParams({ mode, theme }),
      { waitUntil: "domcontentloaded" },
    );
    await page.getByRole("tab", { name: "可视化编辑", exact: true }).click();
    await page.waitForFunction(() =>
      [...document.querySelectorAll("iframe")].some((frame) => {
        try {
          return frame.contentDocument?.querySelector(
            ".event,yt-live-chat-text-message-renderer",
          );
        } catch {
          return false;
        }
      }),
    );

    await page
      .locator(
        'nav[aria-label="语义部件"] button[data-native-part-id="' +
          (mode === "native"
            ? "whole"
            : mode.startsWith("blivechat")
              ? "event"
              : "eventArea") +
          '"]:visible',
      )
      .first()
      .click();
    if (mode.startsWith("blivechat"))
      await page
        .locator(".native-event-scope-primary")
        .getByRole("button", { name: "弹幕", exact: true })
        .click();
    await page.getByRole("button", { name: "图片背景", exact: true }).click();
    await selectValue(page, "图片素材", "示例图片");
    await page.getByRole("button", { name: "添加图片", exact: true }).click();
    await page.getByLabel("图片宽度").waitFor();
    await page.waitForFunction(() => {
      const frame = document.querySelector(".theme-image-effect iframe");
      const doc = frame?.contentDocument;
      return (
        doc &&
        [...doc.querySelectorAll("*")].some((node) =>
          doc.defaultView
            .getComputedStyle(node)
            .backgroundImage.includes("stroke%3D%22teal%22"),
        )
      );
    });
    assert.equal(await page.getByLabel("图片宽度").inputValue(), "80");
    await page.getByRole("button", { name: "添加图片", exact: true }).click();
    await page.getByLabel("图片左右移动", { exact: true }).fill("20");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "完成设置", exact: true })
      .click();
    await page.getByRole("button", { name: "应用", exact: true }).click();
    await page
      .getByRole("button", { name: "重新载入已保存主题", exact: true })
      .click();
    await page.getByRole("button", { name: "图片背景", exact: true }).click();
    assert.equal(
      await page.getByLabel("图片左右移动", { exact: true }).inputValue(),
      "20",
    );
    assert.equal(await page.locator(".theme-image-layers > div").count(), 2);
    await page.getByLabel("显示或隐藏图层 1", { exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "完成设置", exact: true })
      .click();
    await page.getByRole("button", { name: "应用", exact: true }).click();
    await page
      .getByRole("button", { name: "重新载入已保存主题", exact: true })
      .click();
    await page.getByRole("button", { name: "图片背景", exact: true }).click();
    assert.equal(await page.locator(".theme-image-layers > div").count(), 2);
    assert.equal(
      await page
        .locator(".theme-image-layers > div")
        .first()
        .locator(".lucide-eye-off")
        .count(),
      1,
    );
    await page.keyboard.press("Escape");
    let base = 1,
      next = 1;
    await page.getByRole("tab", { name: "基础设置", exact: true }).click();
    const label = mode === "blivechat" ? "整体比例" : "基准字号";
    const input = page
      .locator("label")
      .filter({ has: page.getByText(label, { exact: true }) })
      .locator("input");
    if (await input.count()) {
      base = Number(await input.inputValue());
      next = base * 1.25;
      await input.fill(String(next));
      await page.getByRole("tab", { name: "可视化编辑", exact: true }).click();
      await page.getByRole("button", { name: "图片背景", exact: true }).click();
      assert.ok(
        Math.abs(Number(await page.getByLabel("图片宽度").inputValue()) - 100) <
          0.1,
      );
      await page.keyboard.press("Escape");
    }
    const painted = await (
      await page.waitForFunction(() => {
        const count = (doc) =>
          [...doc.querySelectorAll("*")].filter((node) =>
            doc.defaultView
              .getComputedStyle(node)
              .backgroundImage.includes("url("),
          ).length +
          [...doc.querySelectorAll("iframe")].reduce(
            (sum, frame) =>
              sum + (frame.contentDocument ? count(frame.contentDocument) : 0),
            0,
          );
        return [
          ...[...document.querySelectorAll("iframe")].filter(frame => !frame.closest(".theme-image-effect")),
        ].reduce(
          (sum, frame) =>
            sum + (frame.contentDocument ? count(frame.contentDocument) : 0),
          0,
        );
      })
    ).jsonValue();
    assert.ok(painted, mode + " renders selected background");
    for (const scheme of ["深色", "浅色"]) {
      await page.getByRole("button", { name: `切换为${scheme}`, exact: true }).click();
    }
    await page.getByRole("tab", { name: "可视化编辑", exact: true }).click();
    await page.getByRole("button", { name: "图片背景", exact: true }).click();
    await page.setViewportSize({ width: 600, height: 900 });
    const bounds = await page.getByRole("dialog").boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 601);
    assert.ok(
      await page
        .getByRole("dialog")
        .evaluate((node) => node.scrollWidth <= node.clientWidth),
    );
    await page.keyboard.press("Escape");
    results.push({
      mode,
      theme,
      saveReload: true,
      hiddenLayer: true,
      base,
      next,
      painted,
    });
    await writeFile(
      `${output}/plan-matrix-results.json`,
      JSON.stringify(results, null, 2),
    );
    console.log("passed", mode, theme, base, next);
    await page.close();
  }
} finally {
  await browser.close();
}

async function selectValue(page, label, option) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
