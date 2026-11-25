import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.connectOverCDP(
  process.env.BB_COLIVE_TEST_CDP ?? "http://127.0.0.1:9436",
);
const page = browser.contexts()[0].pages()[0];
page.setDefaultTimeout(10000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const focused = async (locator) =>
  assert.equal(
    await locator.evaluate((node) => node === document.activeElement),
    true,
  );
async function activate(locator) {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await locator.focus();
  await focused(locator);
  await page.keyboard.press("Enter", { delay: 50 });
}
async function waitGone(locator) {
  await locator.waitFor({ state: "hidden" });
}
try {
  await page.reload();
  await page.getByRole("button", { name: "回看", exact: true }).waitFor({ timeout: 30000 });
  await activate(page.getByRole("button", { name: "回看", exact: true }));
  const tabs = page.getByRole("tab");
  await tabs.first().waitFor();
  await tabs.first().focus();
  await page.keyboard.press("ArrowRight", { delay: 50 });
  await focused(tabs.nth(1));
  assert.equal(await tabs.nth(1).getAttribute("aria-selected"), "true");
  await page.keyboard.press("Home", { delay: 50 });
  await focused(tabs.first());
  assert.equal(await tabs.first().getAttribute("aria-selected"), "true");
  const user = page.getByRole("button", { name: /已登录：/ });
  await activate(user);
  await page.getByRole("button", { name: "退出登录", exact: true }).waitFor();
  await focused(page.getByRole("button", { name: "退出登录", exact: true }));
  await page.keyboard.press("Escape");
  await waitGone(page.getByRole("button", { name: "退出登录", exact: true }));
  await focused(user);
  await activate(page.getByRole("button", { name: "打开设置", exact: true }));
  await page.locator("#ui-language").waitFor();
  const nav = page.locator(".settings-section-navigator");
  await activate(nav);
  const opts = page.locator('.settings-section-navigator-menu [role="option"]');
  await opts.first().waitFor();
  await focused(opts.first());
  await page.keyboard.press("End");
  await focused(opts.last());
  await page.keyboard.press("Escape");
  await waitGone(opts.first());
  await focused(nav);
  const lang = page.locator("#ui-language");
  await activate(lang);
  await page.getByRole("option", { name: "简体中文", exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await waitGone(page.getByRole("option", { name: "简体中文", exact: true }));
  await focused(lang);
  const toggle = page.getByRole("switch", {
    name: "启动后自动连接",
    exact: true,
  });
  const old = await toggle.getAttribute("aria-checked");
  await toggle.focus();
  await page.keyboard.press("Space");
  assert.notEqual(await toggle.getAttribute("aria-checked"), old);
  await page.keyboard.press("Space");
  assert.equal(await toggle.getAttribute("aria-checked"), old);
  await activate(nav);
  await activate(page.getByRole("option", { name: "回看", exact: true }));
  await waitGone(opts.first());
  const date = page.locator('.settings-panel-frame .date-time-field-trigger.is-date-only input').first();
  await date.focus();
  await page.keyboard.press("Alt+ArrowDown");
  await page.locator(".date-time-picker").waitFor();
  assert.equal(await page.locator(".date-time-picker-time").count(), 0);
  await page.keyboard.press("Escape");
  await waitGone(page.locator(".date-time-picker"));
  await focused(date);
  await activate(
    page.getByRole("button", { name: "退出设置并收起工作台", exact: true }),
  );
  await activate(page.getByRole("button", { name: "样式", exact: true }));
  const category = page.locator('.theme-category-tabs [role="tab"]');
  await category.first().waitFor();
  await category.first().focus();
  await page.keyboard.press("ArrowRight", { delay: 50 });
  await focused(category.nth(1));
  assert.equal(await category.nth(1).getAttribute("aria-selected"), "true");
  await page.keyboard.press("Home", { delay: 50 });
  await focused(category.first());
  await activate(
    page.getByRole("button", { name: "编辑", exact: true }).first(),
  );
  await page.getByRole("tab", { name: "可视化编辑", exact: true }).waitFor();
  await page.getByRole("tab", { name: "基础设置", exact: true }).focus();
  await page.keyboard.press("ArrowRight", { delay: 50 });
  await focused(page.getByRole("tab", { name: "可视化编辑", exact: true }));
  await page.locator(".native-property-panel").waitFor();
  const prop = page
    .locator(".native-property-sections details")
    .filter({ has: page.locator(".native-property-field.is-fontWeight") })
    .first();
  if ((await prop.getAttribute("open")) === null)
    await activate(prop.locator("summary"));
  const weight = page.locator(".native-property-field.is-fontWeight");
  const number = weight.getByRole("spinbutton");
  await number.fill("500");
  await number.press("Enter");
  await number.focus();
  await number.press("ArrowUp");
  assert.equal(await number.inputValue(), "600");
  await number.press("Escape");
  const image = page
    .locator(".native-property-panel")
    .getByRole("button", { name: "图片背景", exact: true });
  await activate(image);
  const dialog = page.getByRole("dialog", { name: "图片背景", exact: true });
  await dialog.waitFor();
  for (let i = 0; i < 22; i++) {
    await page.keyboard.press(i < 11 ? "Tab" : "Shift+Tab");
    assert.equal(
      await dialog.evaluate((node) => node.contains(document.activeElement)),
      true,
    );
  }
  const select = dialog.getByRole("combobox").first();
  if (await select.isVisible()) {
    await activate(select);
    await page.getByRole("option").first().waitFor();
    await page.keyboard.press("Escape");
    await waitGone(page.getByRole("option").first());
    await dialog.waitFor();
  }
  await page.keyboard.press("Escape");
  await waitGone(dialog);
  await focused(image);
  for (const details of await page
    .locator('nav[aria-label="语义部件"] details')
    .all()) {
    if (
      (await details.getAttribute("open")) === null &&
      (await details.locator("summary").first().isVisible())
    )
      await activate(details.locator("summary").first());
  }
  for (const title of ["图片背景", "装饰图", "图片边框", "头像框"]) {
    const part = title === "头像框" ? "avatarFrame" : "username";
    await activate(
      page
        .locator(
          `nav[aria-label="语义部件"] button[data-native-part-id="${part}"]`,
        )
        .last(),
    );
    for (const details of await page
      .locator(".native-property-sections details")
      .all())
      if (
        (await details.getAttribute("open")) === null &&
        (await details.locator("summary").first().isVisible())
      )
        await activate(details.locator("summary").first());
    const trigger = page
      .locator(".native-property-panel")
      .getByRole("button", { name: title, exact: true });
    await activate(trigger);
    const panel = page.getByRole("dialog", { name: title, exact: true });
    await panel.waitFor();
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      assert.equal(
        await panel.evaluate((node) => node.contains(document.activeElement)),
        true,
      );
    }
    await page.keyboard.press("Escape");
    await waitGone(panel);
    await focused(trigger);
  }
  assert.deepEqual(errors, []);
  console.log(
    "隔离程序键盘操作通过：导航、菜单、标签、开关、日期、属性及嵌套图片弹窗",
  );
} finally {
  await browser.close();
}
