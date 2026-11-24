import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const bundle = await build({
  entryPoints: ["tests/fixtures/inputAndFavoriteDialog.tsx"],
  bundle: true,
  write: false,
  format: "iife",
  jsx: "automatic",
  loader: {
    ".css": "empty",
    ".png": "dataurl",
    ".webp": "dataurl",
    ".svg": "dataurl",
    ".woff2": "dataurl",
  },
});
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_EXECUTABLE
    ? { executablePath: process.env.BROWSER_EXECUTABLE }
    : { channel: "chrome" }),
});
try {
  const page = await browser.newPage();
  await page.setContent(
    '<button id="before">背景前项</button><div id="root"></div>',
  );
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.getByRole("button", { name: "编辑收藏", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  const openedInside = await dialog.evaluate((el) =>
    el.contains(document.activeElement),
  );
  await dialog.getByRole("button", { name: "保存整理" }).focus();
  await page.keyboard.press("Tab");
  // Native modal dialogs may move focus to browser chrome at the boundary.
  const backgroundNotFocused = await page.evaluate(
    () => !["before", "open", "outside"].includes(document.activeElement.id),
  );
  await page.keyboard.press("Tab");
  const tabContained =
    backgroundNotFocused &&
    (await dialog.evaluate((el) => el.contains(document.activeElement)));
  const tag = dialog.getByRole("textbox", { name: "新标签名称" });
  await tag.fill("测试标签");
  await composingEnter(tag, true, 229);
  const tagNotSubmitted = await page.evaluate(
    () => window.inputReport.tags.length === 0,
  );
  await composingEnter(tag, false, 229);
  const legacyTagNotSubmitted = await page.evaluate(
    () => window.inputReport.tags.length === 0,
  );
  // The plain Enter path remains usable after composition finishes.
  await tag.fill("标签完成");
  await tag.press("Enter");
  await page.waitForFunction(() =>
    window.inputReport.tags.includes("标签完成"),
  );
  await page.keyboard.press("Escape");
  const escapeClosed = await page.evaluate(
    () => window.inputReport.cancelled === 1,
  );
  if (!escapeClosed)
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
  const focusReturned = await page
    .locator("#open")
    .evaluate((el) => el === document.activeElement);

  await page.getByRole("button", { name: "添加预设", exact: true }).click();
  const name = page.getByLabel("预设名称", { exact: true });
  await name.fill("中文预设");
  await composingEnter(name, true, 229);
  const presetNotSubmitted = await page.evaluate(
    () => window.inputReport.saved.length === 0,
  );
  if (!(await name.isVisible()))
    await page.getByRole("button", { name: "添加预设", exact: true }).click();
  await name.fill("已完成预设");
  await name.press("Enter");
  await page.waitForFunction(() =>
    window.inputReport.saved.includes("已完成预设"),
  );
  await page.getByRole("button", { name: "管理预设", exact: true }).click();
  await page.getByRole("button", { name: "重命名预设 原预设" }).click();
  const rename = page.getByLabel("重命名预设", { exact: true });
  await rename.fill("修改名称");
  await composingEnter(rename, true, 229);
  const renameNotSubmitted = await page.evaluate(
    () => window.inputReport.renamed.length === 0,
  );
  if (!(await rename.isVisible()))
    await page.getByRole("button", { name: "重命名预设 原预设" }).click();
  await rename.fill("修改完成");
  await rename.press("Enter");
  await page.waitForFunction(() =>
    window.inputReport.renamed.includes("修改完成"),
  );
  await page.getByRole("button", { name: "编辑收藏", exact: true }).click();
  const pending = page.getByRole("dialog");
  await pending.getByRole("textbox", { name: "新标签名称" }).fill("保存中标签");
  await pending.getByRole("button", { name: "添加标签", exact: true }).click();
  const selected = pending.getByRole("button", { name: /标签 保存中标签/ });
  await selected.waitFor();
  await pending.getByRole("button", { name: "保存整理", exact: true }).click();
  const pendingLocked =
    (await pending.getByRole("textbox", { name: "备注" }).isDisabled()) &&
    (await selected.isDisabled());
  await page.evaluate(() => window.finishFavoriteSave());
  await pending.waitFor({ state: "hidden" });
  const result = {
    browser: browser.version(),
    openedInside,
    tabContained,
    escapeClosed,
    focusReturned,
    tagNotSubmitted,
    legacyTagNotSubmitted,
    presetNotSubmitted,
    renameNotSubmitted,
    pendingLocked,
  };
  console.log(JSON.stringify(result));
  for (const [key, value] of Object.entries(result))
    if (key !== "browser") assert.equal(value, true, key);
} finally {
  await browser.close();
}

async function composingEnter(input, isComposing, keyCode) {
  await input.evaluate(
    (el, data) =>
      el.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, ...data }),
      ),
    { isComposing, keyCode },
  );
}
