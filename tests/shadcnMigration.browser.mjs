import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage();
const errors = [];
page.setDefaultTimeout(8000);
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(
    (process.env.BB_COLIVE_TEST_BASE_URL ?? "http://127.0.0.1:1436") +
      "/tests/fixtures/shadcn/migration.html",
  );
  const toggle = page.getByRole("switch", { name: "显示头像" });
  await toggle.waitFor();
  assert.equal(await toggle.getAttribute("data-slot"), "switch");
  await toggle.press("Space");
  assert.equal(await toggle.getAttribute("aria-checked"), "true");
  await page.getByRole("radio", { name: "纵向", exact: true }).click();
  assert.equal(
    await page
      .getByRole("radio", { name: "纵向", exact: true })
      .getAttribute("aria-checked"),
    "true",
  );
  await page.getByRole("combobox", { name: "字体" }).click();
  await page.getByRole("option", { name: "MiSans", exact: true }).click();
  assert.match(
    await page.getByRole("combobox", { name: "字体" }).innerText(),
    /MiSans/,
  );
  await page.getByRole("combobox", { name: "字体" }).click();
  await page.getByRole("option", { name: "继承主题", exact: true }).click();
  await page.getByRole("listbox").waitFor({ state: "detached" });
  const typeahead = page.locator('[role="combobox"][aria-label="字体"]');
  await typeahead.focus(); await page.keyboard.press("a");
  const fontList = page.getByRole("listbox"); await fontList.waitFor();
  await page.waitForFunction(() => document.activeElement?.textContent === "Arial");
  assert.equal(await typeahead.innerText(), "继承主题");
  await fontList.evaluate(node => node.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", isComposing: true, bubbles: true, cancelable: true })));
  assert.equal(await typeahead.getAttribute("aria-expanded"), "true");
  await page.keyboard.press("Escape"); await fontList.waitFor({ state: "hidden" });
  assert.equal(await typeahead.innerText(), "继承主题");
  await typeahead.press("a"); await fontList.waitFor();
  await page.waitForFunction(() => document.activeElement?.textContent === "Arial");
  await page.keyboard.press("Enter"); await fontList.waitFor({ state: "hidden" });
  assert.equal(await typeahead.innerText(), "Arial");
  await page.getByRole("button", { name: /清空.*搜索/ }).click();
  assert.equal(await page.getByRole("searchbox").inputValue(), "");
  assert.equal(
    await page
      .getByRole("searchbox")
      .evaluate((e) => e === document.activeElement),
    true,
  );
  await page.getByRole("button", { name: "删除档案", exact: true }).click();
  const dialog = page.getByRole("alertdialog", { name: "删除档案" });
  await dialog.waitFor();
  await dialog.evaluate(node => node.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", isComposing: true, bubbles: true, cancelable: true })));
  await dialog.waitFor({ state: "visible" });
  await dialog.getByRole("button", { name: "删除", exact: true }).click();
  await page.keyboard.press("Escape");
  await dialog.getByRole("alert").waitFor();
  await dialog.getByRole("button", { name: "删除", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(
    await page
      .getByRole("button", { name: "删除档案", exact: true })
      .evaluate((e) => e === document.activeElement),
    true,
  );
  await page.getByRole("button", { name: "新建主题", exact: true }).click();
  const create = page.getByRole("dialog");
  await create.waitFor();
  await create.evaluate(node => node.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", isComposing: true, bubbles: true, cancelable: true })));
  await create.waitFor({ state: "visible" });
  for (const box of await create.getByRole("radio").all()) {
    const size = await box.boundingBox();
    assert.ok(size.width <= 20 && size.height <= 20, "单选尺寸");
  }
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "新建主题", exact: true }).waitFor();
  await page.waitForFunction(
    () => document.activeElement?.textContent === "新建主题",
  );
  await page.getByRole("button", { name: "关于", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.setViewportSize({ width: 1000, height: 500 });
  await page.getByRole("button", { name: "样式设置", exact: true }).click();
  const styleDialog = page.getByRole("dialog");
  await styleDialog.waitFor();
  assert.ok(await styleDialog.evaluate(node => node.scrollHeight <= node.clientHeight + 1));
  assert.ok(await styleDialog.locator("footer").evaluate(node => node.getBoundingClientRect().bottom <= innerHeight));
  const options = styleDialog.locator(".review-style-options");
  assert.ok(await options.evaluate(node => node.scrollHeight > node.clientHeight));
  await options.evaluate(node => { node.scrollTop = node.scrollHeight; });
  await styleDialog.getByRole("button", { name: "完成", exact: true }).click();
  await styleDialog.waitFor({ state: "hidden" });
  assert.deepEqual(errors, []);
  console.log("共享控件、空值选择、搜索焦点、异步确认重试通过");
} finally {
  await browser.close();
}
