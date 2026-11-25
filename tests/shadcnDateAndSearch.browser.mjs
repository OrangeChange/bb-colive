import { chromium } from "playwright";
import assert from "node:assert/strict";
const b = await chromium.launch({ channel: "msedge", headless: true });
try {
  const p = await b.newPage({ viewport: { width: 950, height: 900 } });
  p.setDefaultTimeout(7000);
  await p.goto("http://127.0.0.1:1436/tests/fixtures/shadcn/migration.html");
  await p.getByRole("switch", { name: "显示头像" }).waitFor();
  const languageModule = await p.evaluate(async () =>
    (await (await fetch("/src/i18n/react.ts")).text())
      .match(/from "([^"]*i18n\/index.ts[^"]*)"/)[1],
  );
  for (const [lang, hour, minute, next, clear] of [
    ["zh-CN", "小时", "分钟", "前往下个月", "清空"],
    ["zh-Hant", "小時", "分鐘", "前往下個月", "清空"],
    ["en", "Hour", "Minute", "Go to the Next Month", "Clear"],
    ["ja", "時", "分", "次の月へ", "クリア"],
  ]) {
    await p.evaluate(async ({ lang, languageModule }) => {
      (await import(languageModule)).setUiLanguage(lang);
    }, { lang, languageModule });
    await p.locator(".date-time-field-open").click();
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
    const panel = p.locator(
      '.date-time-picker[data-state="open"][lang="' + lang + '"]',
    );
    await panel.waitFor();
    assert.equal(await panel.getAttribute("lang"), lang);
    assert.equal(
      await panel.getByRole("button", { name: next, exact: true }).count(),
      1,
    );
    assert.equal(
      await panel.getByRole("button", { name: clear, exact: true }).count(),
      1,
    );
    const hours = panel.getByRole("radiogroup", { name: hour, exact: true });
    const minutes = panel.getByRole("radiogroup", {
      name: minute,
      exact: true,
    });
    assert.equal(
      await hours
        .getByRole("radio", { name: "19", exact: true })
        .getAttribute("aria-checked"),
      "true",
    );
    await hours.getByRole("radio", { name: "21", exact: true }).click();
    await minutes.getByRole("radio", { name: "45", exact: true }).click();
    const stamp = Number(await p.locator("[data-date]").innerText());
    assert.equal(new Date(stamp).getHours(), 21);
    assert.equal(new Date(stamp).getMinutes(), 45);
    await hours.getByRole("radio", { name: "19", exact: true }).click();
    await minutes.getByRole("radio", { name: "30", exact: true }).click();
    await p.keyboard.press("Escape");
  }
  await p.locator(".date-time-picker").waitFor({ state: "detached" });
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
