import { chromium } from "playwright";
import assert from "node:assert/strict";
const b = await chromium.launch({ channel: "msedge", headless: true });
try {
  const p = await b.newPage({ viewport: { width: 980, height: 720 } });
  await p.goto(
    "http://127.0.0.1:1436/tests/fixtures/shadcn/detail-panel.html?section=date&kind=after",
  );
  await p.locator("main").waitFor();
  const input = p.locator('input[placeholder="YYYY-MM-DD HH:mm"]');
  assert.equal(await input.count(), 1, "日期时间必须支持直接键盘编辑");
  await input.fill("2026-11-25 19:30");
  await p
    .getByRole("button", { name: "开始时间：选择日期", exact: true })
    .click();
  const hours = p.getByRole("radiogroup", { name: "小时", exact: true }),
    minutes = p.getByRole("radiogroup", { name: "分钟", exact: true });
  assert.equal(await hours.getByRole("radio").count(), 24);
  assert.equal(await minutes.getByRole("radio").count(), 60);
  const calendar = await p.locator(".rdp-root").boundingBox(),
    time = await hours.boundingBox();
  assert.ok(time.x >= calendar.x + calendar.width - 1, "时分列应在日历右侧");
  await hours.getByRole("radio", { name: "21", exact: true }).click();
  await minutes.getByRole("radio", { name: "47", exact: true }).click();
  assert.equal(await input.inputValue(), "2026-11-25 21:47");
  await minutes
    .getByRole("radio", { name: "47", exact: true })
    .press("ArrowDown", { delay: 50 });
  await p.waitForFunction(
    () =>
      document.querySelector('input[placeholder="YYYY-MM-DD HH:mm"]').value ===
      "2026-11-25 21:48",
  );
  await p.keyboard.press("Escape");
  await input.fill("2026-11-24 08:09");
  await input.press("ArrowUp");
  await p.waitForFunction(() => document.querySelector('input[placeholder="YYYY-MM-DD HH:mm"]').value !== "2026-11-24 08:09");
  await input.fill("2026-11-24 08:09");
  await p
    .getByRole("button", { name: "开始时间：选择日期", exact: true })
    .click();
  await p
    .getByRole("button", { name: /2026年11月26日 星期四$/ })
    .click();
  assert.match(await input.inputValue(), /2026-11-26 /);
  await p.getByRole("button", { name: "清空", exact: true }).click();
  assert.equal(await input.inputValue(), "");
  await p.getByRole("button", { name: "今天", exact: true }).click();
  const now = new Date();
  assert.equal(
    (await input.inputValue()).slice(0, 10),
    [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-"),
  );
  console.log("日期键盘输入、日历与时分同组、选择同步、清空和今天通过");
} finally {
  await b.close();
}
