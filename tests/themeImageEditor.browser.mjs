import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { readFile, mkdir } from "node:fs/promises";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const result = await build({
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
    viewport: { width: 1000, height: 900 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const html =
    "<style>" +
    (await readFile("src/components/themeImageEditor.css", "utf8")) +
    '</style><div id="root"></div>';
  await page.route("http://localhost:47191/", (route) =>
    route.fulfill({ contentType: "text/html", body: html }),
  );
  await page.route("**/assets/example.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect x="2" y="2" width="76" height="36" rx="8" fill="none" stroke="teal" stroke-width="4"/></svg>',
    }),
  );
  await page.goto("http://localhost:47191/");
  await page.addScriptTag({ content: result.outputFiles[0].text });
  await page.getByRole("button", { name: "图片背景", exact: true }).click();
  await selectValue(page, "图片素材", "示例");
  await page.getByRole("button", { name: "添加图片", exact: true }).click();
  await page
    .getByLabel("图片宽度")
    .waitFor({ timeout: 4000 })
    .catch(async (e) => {
      console.log(await page.locator("body").innerText(), errors);
      throw e;
    });
  assert.equal(await page.getByLabel("图片宽度").inputValue(), "80");
  await page.setViewportSize({ width: 900, height: 650 });
  const imageDialog = page.getByRole("dialog", {
    name: "图片背景",
    exact: true,
  });
  assert.equal(await imageDialog.locator("select").count(), 0);
  const footerBounds = await imageDialog.locator("footer").boundingBox();
  assert.ok(
    footerBounds.y + footerBounds.height <= 650,
    "短窗口中应用和取消保持可见",
  );
  await page.setViewportSize({ width: 1000, height: 900 });
  await page.getByRole("button", { name: "置于填充后", exact: true }).click();
  assert.match(
    await page.locator(".theme-image-layer-name").first().textContent(),
    /渐变/,
  );
  await page.getByRole("button", { name: "置于填充前", exact: true }).click();
  assert.match(
    await page.locator(".theme-image-layer-name").first().textContent(),
    /示例/,
  );
  await page.getByLabel("图片宽度").fill("160");
  assert.equal(await page.getByLabel("图片高度").inputValue(), "80");
  await page.getByRole("button", { name: "右下", exact: true }).click();
  await page.getByLabel("图片左右移动").fill("");
  await page.getByLabel("图片左右移动").pressSequentially("-12");
  await page.getByLabel("图片左右移动").press("Enter");
  assert.equal(await page.getByLabel("图片左右移动").inputValue(), "-12");
  await page.getByLabel("图片左右移动").fill("20");
  assert.doesNotMatch(
    await page.locator("#value").textContent(),
    /example.svg/,
  );
  assert.match(
    await page
      .locator("#sample")
      .evaluate((node) => getComputedStyle(node).backgroundImage),
    /example.svg/,
  );
  await page.getByRole("button", { name: "完成设置", exact: true }).click();
  let value = await page.locator("#value").textContent();
  assert.match(value, /assets\/example.svg/);
  assert.match(value, /calc\(100% \+ 20px\)/);
  assert.match(value, /linear-gradient/);
  assert.match(value, /rgb\(1, 2, 3\)/);
  await page.getByRole("button", { name: "图片背景", exact: true }).click();
  assert.equal(
    await page.getByLabel("图片宽度").inputValue({ timeout: 3000 }),
    "160",
  );
  assert.equal(await page.getByLabel("图片左右移动").inputValue(), "20");
  await page.getByLabel("图片宽度").fill("200");
  await page.getByRole("button", { name: "完成设置", exact: true }).click();
  assert.match(
    await page.locator("#value").textContent(),
    /calc\(100% \+ 20px\)/,
  );
  await page.getByRole("button", { name: "图片背景", exact: true }).click();
  await page
    .getByRole("button", { name: "显示或隐藏图层 1", exact: true })
    .click();
  await page.getByRole("button", { name: "完成设置", exact: true }).click();
  assert.doesNotMatch(
    await page.locator("#value").textContent(),
    /example.svg/,
  );
  await page.getByRole("button", { name: "图片背景", exact: true }).click();
  await page
    .getByRole("button", { name: "显示或隐藏图层 1", exact: true })
    .click();
  await page.getByRole("button", { name: "完成设置", exact: true }).click();
  assert.match(await page.locator("#value").textContent(), /example.svg/);
  await page.getByRole("button", { name: "图片背景", exact: true }).click();
  await selectValue(page, "图片素材", "示例");
  await page.getByRole("button", { name: "添加图片", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelectorAll(".theme-image-layers > div").length === 3,
  );
  await page.getByLabel("图片宽度").fill("120");
  await page.getByRole("button", { name: "完成设置", exact: true }).click();
  await page.getByRole("button", { name: "背景填充", exact: true }).click();
  await page.getByRole("button", { name: "添加色点", exact: true }).click();
  const merged = await page.locator("#value").textContent();
  assert.match(merged, /120px 60px/);
  assert.match(merged, /200px 100px/);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "图片背景", exact: true }).click();
  await page
    .getByRole("button", { name: "移除图片 1", exact: true })
    .click();
  await page.getByRole("button", { name: "移除图片 1" }).click();
  await page.getByRole("button", { name: "完成设置", exact: true }).click();
  value = await page.locator("#value").textContent();
  assert.doesNotMatch(value, /example.svg/);
  assert.match(value, /linear-gradient/);
  assert.deepEqual(errors, []);
  await page.getByRole("button", { name: "图片背景", exact: true }).click();
  await mkdir(".superpowers/sdd/theme-image-editor", { recursive: true });
  await page.screenshot({
    path: ".superpowers/sdd/theme-image-editor/background-panel.png",
  });
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "图片边框", exact: true }).click();
  await selectValue(page, "边框图片", "示例");
  await page.getByRole("button", { name: "使用图片", exact: true }).click();
  await page.locator(".theme-image-slice-preview img").waitFor();
  await page.getByLabel("切片上", { exact: true }).fill("8");
  const knob = page
    .getByRole("button", { name: "拖动上切片", exact: true });
  const box = await knob.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 12, {
    steps: 8,
  });
  await page.mouse.up();
  assert.ok(
    Number(await page.getByLabel("切片上", { exact: true }).inputValue()) > 8,
    "拖线应同步切片输入",
  );
  await page.getByLabel("切片上", { exact: true }).fill("8");
  await page.getByRole("button", { name: "完成设置", exact: true }).click();
  assert.match(
    await page.locator("#border-output").textContent(),
    /8% 20% 20% 20%/,
  );
  await page
    .frameLocator('iframe[title="装饰目标"]')
    .locator("body")
    .evaluate((node) => (node.style.overflow = "hidden"));
  await page.getByRole("button", { name: "装饰图", exact: true }).click();
  await page
    .getByRole("dialog")
    .locator("summary")
    .filter({ hasText: "裁切范围：" })
    .click();
  await page.getByRole("button", { name: "查看裁切区域", exact: true }).hover();
  assert.match(
    await page
      .frameLocator('iframe[title="装饰目标"]')
      .locator(".clip")
      .evaluate((node) => node.style.outline),
    /dashed/,
  );
  await selectValue(page, "装饰图片", "示例");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^(添加图片|使用图片)$/, exact: true })
    .click();
  await page.getByLabel("装饰宽度").waitFor();
  await selectValue(page, "装饰排列", "自由定位");
  await page.getByRole("button", { name: "装饰居中", exact: true }).click();
  await page.getByLabel("装饰左右移动", { exact: true }).fill("20");
  await page.getByRole("button", { name: "完成设置", exact: true }).click();
  const decoration = await page
    .frameLocator('iframe[title="装饰目标"]')
    .locator(".host")
    .evaluate((node) => {
      const s = getComputedStyle(node, "::before");
      return {
        left: s.left,
        width: s.width,
        transform: s.transform,
        content: s.content,
      };
    });
  assert.equal(decoration.left, "220px");
  assert.equal(decoration.width, "80px");
  assert.match(decoration.transform, /-40/);
  assert.equal(decoration.content, '""');
  await page.getByRole("button", { name: "装饰图", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByText("图片锚点", { exact: true })
    .first()
    .click();
  await page.getByLabel("图片锚点横向", { exact: true }).fill("0");
  await page.waitForFunction(
    () =>
      getComputedStyle(
        document.querySelector("iframe").contentDocument.querySelector(".host"),
        "::before",
      ).left === "180px",
  );
  assert.equal(
    await page.getByLabel("装饰左右移动", { exact: true }).inputValue(),
    "-20",
  );
  await page.getByRole("button", { name: "完成设置", exact: true }).click();
  assert.equal(await page.locator("#decor-count").textContent(), "1");
  await page.getByRole("button", { name: "装饰图", exact: true }).click();
  await page.getByLabel("装饰宽度", { exact: true }).fill("100");
  await page.waitForFunction(
    () =>
      getComputedStyle(
        document.querySelector("iframe").contentDocument.querySelector(".host"),
        "::before",
      ).width === "100px",
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () =>
      getComputedStyle(
        document.querySelector("iframe").contentDocument.querySelector(".host"),
        "::before",
      ).width === "80px",
  );
  await page
    .locator("#sample")
    .screenshot({ path: "D:/CodexBuild/theme-image-editor/border-render.png" });
  await page.getByRole("button", { name: "头像框", exact: true }).click();
  await page.getByRole("button", { name: "自定义", exact: true }).click();
  await selectValue(page, "装饰图片", "示例");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^(添加图片|使用图片)$/, exact: true })
    .click();
  await page.getByLabel("装饰宽度", { exact: true }).waitFor();
  await page.getByRole("button", { name: "完成设置", exact: true }).click();
  await page.getByRole("button", { name: "头像框", exact: true }).click();
  await page.getByRole("button", { name: "自定义", exact: true }).click();
  await page.getByLabel("装饰宽度", { exact: true }).fill("40");
  await page.waitForFunction(
    () =>
      getComputedStyle(
        document
          .querySelector("iframe")
          .contentDocument.querySelector(".avatar-host"),
        "::before",
      ).width === "40px",
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () =>
      Math.abs(
        parseFloat(
          getComputedStyle(
            document
              .querySelector("iframe")
              .contentDocument.querySelector(".avatar-host"),
            "::before",
          ).width,
        ) - 28.8,
      ) < 0.1,
  );
  const avatarWidth = await page
    .frameLocator("iframe")
    .locator(".avatar-host")
    .evaluate((n) => parseFloat(getComputedStyle(n, "::before").width));
  assert.ok(Math.abs(avatarWidth - 28.8) < 0.1);
  console.log("图片背景、图片边框、装饰定位及头像框预览操作通过");
} finally {
  await browser.close();
}

async function selectValue(page, label, option) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
