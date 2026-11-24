import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const bundle = await build({
  entryPoints: ["tests/fixtures/themeImageEditor.tsx"],
  bundle: true,
  write: false,
  format: "iife",
  jsx: "automatic",
  loader: { ".css": "empty", ".png": "dataurl", ".webp": "dataurl", ".gif": "dataurl", ".svg": "dataurl" },
});
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1100, height: 760 },
  });
  const css = await readFile("src/components/themeImageEditor.css", "utf8");
  await page.route("http://localhost:47191/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<style>${css}</style><div id="root"></div>`,
    }),
  );
  await page.goto("http://localhost:47191/");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.getByRole("button", { name: "头像框", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "头像框", exact: true });
  await dialog.getByRole("button", { name: "不显示", exact: true }).click();
  assert.equal(
    await dialog
      .getByRole("button", { name: "不显示", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(await dialog.locator(".theme-image-layers").count(), 0);
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  assert.equal(await page.locator("#decor-count").textContent(), "0");
  await page.getByRole("button", { name: "图片背景", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "图片背景", exact: true });
  assert.equal(
    await dialog.getByRole("button", { name: "完成设置", exact: true }).count(),
    1,
  );
  assert.match(
    await dialog.locator(".theme-image-scope").textContent(),
    /普通礼物.*用户信息.*浅色/,
  );
  await dialog.getByRole("button", { name: "添加图片", exact: true }).click();
  await dialog.getByLabel("图片宽度", { exact: true }).waitFor();
  assert.equal(
    await dialog.getByLabel("图片宽度", { exact: true }).inputValue(),
    "80",
  );
  assert.match(await page.locator("#value").textContent(), /linear-gradient/);
  assert.doesNotMatch(
    await page.locator("#value").textContent(),
    /imported.svg/,
  );
  await dialog.getByRole("combobox", { name: "显示方式", exact: true }).click();
  await page.getByRole("option", { name: "铺满", exact: true }).click();
  await dialog.getByRole("button", { name: "完成设置", exact: true }).click();
  assert.match(
    await page.locator("#value").textContent(),
    /imported.svg.*cover/,
  );
  await page.getByRole("button", { name: "装饰图", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "装饰图", exact: true });
  await dialog.getByRole("combobox", { name: "装饰图片", exact: true }).click();
  await page.getByRole("option", { name: "示例", exact: true }).click();
  await dialog.getByRole("button", { name: "添加图片", exact: true }).click();
  await dialog.getByLabel("装饰宽度", { exact: true }).fill("120");
  await dialog.getByLabel("装饰宽度", { exact: true }).fill("130");
  assert.equal(await dialog.getByLabel("装饰宽度", { exact: true }).inputValue(), "130");
  await dialog.getByLabel("装饰宽度", { exact: true }).fill("120");
  assert.equal(
    await dialog.getByLabel("装饰宽度", { exact: true }).inputValue(),
    "120",
  );
  await dialog.getByRole("button", { name: "添加图片", exact: true }).click();
  await dialog.getByRole("button", { name: "添加图片", exact: true }).click();
  assert.match(
    await dialog.getByRole("status").textContent(),
    /最多放两张随文图片/,
  );
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "头像框", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "头像框", exact: true });
  await dialog.getByRole("button", { name: "自定义", exact: true }).click();
  assert.equal(
    await dialog
      .getByRole("button", { name: "完成设置", exact: true })
      .isDisabled(),
    true,
  );
  await dialog.getByRole("combobox", { name: "装饰图片", exact: true }).click();
  await page.getByRole("option", { name: "示例", exact: true }).click();
  await dialog.getByRole("button", { name: "使用图片", exact: true }).click();
  await dialog.getByLabel("装饰宽度", { exact: true }).fill("40");
  await dialog.getByRole("button", { name: "不显示", exact: true }).click();
  await dialog.getByRole("button", { name: "自定义", exact: true }).click();
  assert.equal(
    await dialog.getByLabel("装饰宽度", { exact: true }).inputValue(),
    "40",
  );
  assert.equal(
    await dialog
      .getByRole("combobox", { name: "装饰排列", exact: true })
      .count(),
    0,
  );
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "图片背景", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "图片背景", exact: true });
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "图片边框", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "图片边框", exact: true });
  assert.equal(await dialog.getByText("边框效果", { exact: true }).count(), 1);
  await dialog.getByRole("combobox", { name: "边框图片", exact: true }).click();
  await page.getByRole("option", { name: "示例", exact: true }).click();
  await dialog.getByRole("button", { name: "使用图片", exact: true }).click();
  await dialog.getByRole("button", { name: "完成设置", exact: true }).click();
  const border = await page.locator("#border-output").textContent();
  await page.getByRole("button", { name: "图片边框", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "图片边框", exact: true });
  await dialog
    .getByRole("button", { name: "移除图片", exact: true })
    .click();
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  assert.equal(await page.locator("#border-output").textContent(), border);
  await page.getByRole("button", { name: "图片背景", exact: true }).click();
  for (const width of [1100, 600, 390]) {
    await page.setViewportSize({ width, height: 720 });
    const bounds = await page.getByRole("dialog").boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
    assert.equal(
      await page
        .getByRole("dialog")
        .evaluate((node) => node.scrollWidth <= node.clientWidth),
      true,
    );
  }
  console.log("头像框模式、取消、图片面板完成操作与边框效果入口通过");
} finally {
  await browser.close();
}
