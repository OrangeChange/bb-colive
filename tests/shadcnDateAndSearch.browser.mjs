import { chromium } from "playwright";
import assert from "node:assert/strict";
const b = await chromium.launch({ channel: "msedge", headless: true });
try {
  const p = await b.newPage({ viewport: { width: 950, height: 900 } });
  p.setDefaultTimeout(7000);
  await p.goto("http://127.0.0.1:1436/tests/fixtures/shadcn/migration.html");
  await p.getByRole("switch", { name: "显示头像" }).waitFor();
  for (const [lang, label, next, clear] of [
    ["zh-CN", "时间", "前往下个月", "清空"],
    ["zh-Hant", "時間", "前往下個月", "清空"],
    ["en", "Time", "Go to the Next Month", "Clear"],
    ["ja", "時刻", "次の月へ", "クリア"],
  ]) {
    await p.evaluate(async (lang) => {
      (await import("/src/i18n/index.ts")).setUiLanguage(lang);
    }, lang);
    await p.locator(".date-time-field-trigger").click();
    console.log(
      lang,
      await p
        .locator('[data-slot="popover-content"] button')
        .evaluateAll((ns) =>
          ns
            .filter((n) => n.getAttribute("aria-label"))
            .slice(0, 3)
            .map((n) => n.getAttribute("aria-label")),
        ),
    );
    const panel = p.locator('[data-slot="popover-content"]');
    assert.equal(await panel.getAttribute("lang"), lang);
    assert.equal(await panel.getByRole("button", { name: next, exact: true }).count(), 1);
    assert.equal(await panel.getByRole("button", { name: clear, exact: true }).count(), 1);
    const time = p.locator('[data-slot="popover-content"] input[type="time"]');
    assert.equal(await time.inputValue(), "19:30");
    await time.fill("21:45");
    const stamp = Number(await p.locator("[data-date]").innerText());
    assert.equal(new Date(stamp).getHours(), 21);
    await time.fill("19:30");
    await p.keyboard.press("Escape");
  }
  const search = p.getByRole("combobox", { name: "搜索建议" });
  await search.fill("礼物");
  await p.getByRole("option", { name: /礼物名称/ }).waitFor();
  assert.equal(await search.getAttribute("aria-expanded"), "true");
  assert.equal(
    await p
      .locator('[id="' + (await search.getAttribute("aria-controls")) + '"]')
      .count(),
    1,
  );
  await search.press("ArrowDown");
  assert.equal(
    await p
      .locator(
        '[id="' + (await search.getAttribute("aria-activedescendant")) + '"]',
      )
      .count(),
    1,
  );
  await p.getByRole("option", { name: /礼物名称/ }).click();
  assert.equal(await search.inputValue(), "礼物名称");
  await search.fill("");
  await search.press("ArrowDown");
  await search.press("Enter");
  assert.notEqual(await search.inputValue(), "");
  console.log("四语言日期时间、本地时间保存、搜索建议选择通过");
} finally {
  await b.close();
}
