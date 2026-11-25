import assert from "node:assert/strict";
import { chromium } from "playwright";
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 400, height: 850 } });
  await page.goto(
    "http://127.0.0.1:1435/tests/fixtures/localizedControls.html?mode=settings&lang=en",
  );
  await page.locator(".settings-search-trigger").click();
  const search = page.locator(".settings-search-input-wrap input");
  for (const query of ["置顶", "置頂", "pinned", "ピン留め"]) {
    await search.fill(query);
    await page.locator(".settings-search-result").first().waitFor();
    assert.ok(
      (await page.locator(".settings-search-results").innerText()).includes(
        "Pinned",
      ),
    );
  }
  await page
    .locator(".settings-search-result")
    .filter({ hasText: "Pinned bar" })
    .first()
    .click();
  await page.locator('[data-settings-search="sticky-events"]').waitFor();
  assert.equal(await page.locator(".settings-search-input-wrap").count(), 0);
  await page.screenshot({
    path: ".superpowers/locale-audit/multilingual-search-en.png",
  });
  await page.goto(
    "http://127.0.0.1:1435/tests/fixtures/localizedControls.html?mode=formats&lang=en",
  );
  await page.locator(".theme-metadata-details").waitFor();
  const source = await page
    .locator(".theme-metadata-details dd")
    .nth(1)
    .getAttribute("title");
  assert.ok(
    (
      await page.locator(".theme-metadata-details dd").nth(1).innerText()
    ).startsWith("09/25/2026"),
  );
  assert.ok(
    (await page.locator(".gift-threshold-input-control").innerText()).includes(
      "CNY",
    ),
  );
  const input = page.locator(".gift-threshold-input-field");
  assert.equal(await input.inputValue(), "1234.5");
  assert.ok(
    (await input.evaluate((e) => e.getBoundingClientRect().width)) >= 60,
  );
  await page.evaluate(() => window.auditLanguage("ja"));
  await page.waitForTimeout(50);
  assert.ok(
    (
      await page.locator(".theme-metadata-details dd").nth(1).innerText()
    ).startsWith("2026/09/25"),
  );
  assert.equal(
    await page
      .locator(".theme-metadata-details dd")
      .nth(1)
      .getAttribute("title"),
    source,
  );
  assert.equal(await input.inputValue(), "1234.5");
  await page.screenshot({
    path: ".superpowers/locale-audit/localized-formats-ja.png",
  });
  console.log("跨语言设置搜索、定位、本地日期与CNY输入框通过");
} finally {
  await browser.close();
}
