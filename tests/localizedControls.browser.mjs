import assert from "node:assert/strict";
import { chromium } from "playwright";
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 400, height: 850 } });
  await page.goto(
    `${process.env.UI_TEST_URL || "http://127.0.0.1:1435"}/tests/fixtures/localizedControls.html?mode=settings`,
  );
  await page.waitForFunction(() => typeof window.auditLanguage === "function");
  await page.locator(".settings-font-size-input").first().waitFor();
  for (const language of ["zh-CN", "en", "ja", "zh-CN"]) {
    await page.evaluate((value) => window.auditLanguage(value), language);
    await page.waitForTimeout(100);
    const inputs = await page
      .locator(".settings-font-size-input")
      .evaluateAll((elements) =>
        elements.map((element) => ({
          value: element.value,
          width: element.getBoundingClientRect().width,
        })),
      );
    assert.ok(inputs.length > 0);
    for (const input of inputs)
      assert.ok(input.width >= 50, `${language}: 数值区宽度 ${input.width}`);
  }
  await page.goto(
    `${process.env.UI_TEST_URL || "http://127.0.0.1:1435"}/tests/fixtures/localizedControls.html?mode=colors`,
  );
  await page.waitForFunction(() => typeof window.auditLanguage === "function");
  await page.locator(".theme-color-trigger").first().click();
  for (const language of ["en", "ja", "zh-CN"]) {
    await page.evaluate((value) => window.auditLanguage(value), language);
    await page.waitForTimeout(100);
    const panel = page.locator(".theme-background-popover");
    const box = await panel.boundingBox();
    assert.ok(
      box.x >= 0 && box.x + box.width <= 400,
      `${language}: 色板超出窗口`,
    );
    assert.equal(
      await panel.locator(".theme-color-precise input").inputValue(),
      "#fb7299",
    );
    assert.ok(
      (await panel
        .locator(".theme-color-opacity input")
        .evaluate((e) => e.getBoundingClientRect().width)) >= 50,
    );
    if (language !== "en")
      assert.equal(
        await page.locator("[role=slider][aria-label=Color]").count(),
        0,
      );
  }
  const panel = page.locator(".theme-background-popover");
  await panel.locator(".theme-color-precise input").fill("#336699");
  await panel.locator(".theme-color-opacity input").fill("60");
  await panel.locator(".theme-color-opacity input").press("ArrowUp");
  await panel.locator(".theme-color-opacity input").blur();
  const opacity = Number(
    await panel.locator(".theme-color-opacity input").inputValue(),
  );
  assert.ok(Math.abs(opacity - 61) < 0.2);
  const color = await panel.locator(".theme-color-precise input").inputValue();
  await page.evaluate(() => window.auditLanguage("ja"));
  assert.equal(
    await panel.locator(".theme-color-precise input").inputValue(),
    color,
  );
  assert.equal(
    Number(await panel.locator(".theme-color-opacity input").inputValue()),
    opacity,
  );
  await page.goto(
    `${process.env.UI_TEST_URL || "http://127.0.0.1:1435"}/tests/fixtures/localizedControls.html?mode=tiers&lang=en`,
  );
  const tiers = page.getByRole("combobox", {
    name: "Price tiers",
    exact: true,
  });
  await tiers.waitFor();
  assert.equal(await tiers.innerText(), "Base tier");
  assert.match(await tiers.getAttribute("title"), /below next tier/);
  await tiers.click();
  await page.getByRole("option", { name: "Fixed color", exact: true }).click();
  assert.equal(await tiers.innerText(), "Fixed color");
  assert.equal(
    await page
      .getByRole("radio", { name: "Gradient", exact: true })
      .isChecked(),
    true,
  );
  await page.evaluate(() => window.auditLanguage("ja"));
  const japaneseTiers = page.getByRole("combobox", {
    name: "金額帯",
    exact: true,
  });
  assert.equal(await japaneseTiers.innerText(), "固定配色");
  await japaneseTiers.click();
  await page.getByRole("option", { name: "基本帯", exact: true }).click();
  assert.match(await japaneseTiers.getAttribute("title"), /次の帯未満/);
  console.log("多语言控件、编辑值与金额档位短标签通过");
} finally {
  await browser.close();
}
