import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
const out = ".superpowers/shadcn-ui";
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: "msedge", headless: true });
const p = await b.newPage({
  viewport: { width: 1400, height: 1400 },
  deviceScaleFactor: 1,
});
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
const host = process.env.BB_COLIVE_TEST_BASE_URL ?? "http://127.0.0.1:1436";
const base = host + "/tests/fixtures/shadcn/index.html";
async function ready(scheme = "light", palette = "sakura", width = 1400) {
  await p.setViewportSize({ width, height: 1400 });
  await p.goto(`${base}?scheme=${scheme}&palette=${palette}`);
  for (const title of ["迁移前", "迁移后"])
    await p
      .frameLocator(`iframe[title="${title}"]`)
      .getByRole("heading", { name: "样式与显示" })
      .waitFor();
  for (const f of p.frames()) await f.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(150);
}
await ready();
const after = p.frameLocator('iframe[title="迁移后"]');
await after.getByRole("switch", { name: "显示头像" }).click();
await after
  .getByRole("switch", { name: "显示头像" })
  .getAttribute("aria-checked")
  .then((v) => assert.equal(v, "false"));
await after.getByRole("switch", { name: "显示头像" }).press("Space");
assert.equal(
  await after
    .getByRole("switch", { name: "显示头像" })
    .getAttribute("aria-checked"),
  "true",
);
await after.getByRole("combobox", { name: "界面字体" }).click();
await after.getByRole("option", { name: "跟随系统", exact: true }).click();
assert.match(
  await after.getByRole("combobox", { name: "界面字体" }).innerText(),
  /跟随系统/,
);
await after.getByRole("combobox", { name: "界面字体" }).click();
await after.getByRole("option", { name: "MiSans", exact: true }).click();
await after.getByRole("button", { name: "更多操作", exact: true }).click();
await after.getByRole("menuitem", { name: "保存调整", exact: true }).waitFor();
await p.keyboard.press("Escape");
await after.getByRole("slider", { name: "播报音量" }).focus();
await p.keyboard.press("ArrowRight");
assert.equal(
  await after
    .getByRole("slider", { name: "播报音量" })
    .getAttribute("aria-valuenow"),
  "66",
);
await p.keyboard.press("ArrowLeft");
await after.getByRole("button", { name: "编辑主题", exact: true }).click();
const dialog = after.getByRole("dialog", { name: "主题设置" });
await dialog.waitFor();
await dialog.getByRole("combobox").click();
await after.getByRole("option", { name: "MiSans", exact: true }).focus();
await after
  .getByRole("listbox")
  .evaluate(
    async (e) =>
      await Promise.all(
        e
          .getAnimations({ subtree: true })
          .map((a) => a.finished.catch(() => {})),
      ),
  );
await p.keyboard.press("Escape");
await dialog.waitFor({ state: "visible" });
assert.equal(await after.getByRole("option").count(), 0);
await p.keyboard.press("Escape");
await dialog.waitFor({ state: "hidden" });
assert(
  await after
    .getByRole("button", { name: "编辑主题", exact: true })
    .evaluate((e) => e === document.activeElement),
);
await ready();
await p.screenshot({ path: out + "/comparison-light.png", fullPage: true });
const metrics = [];
for (const f of p.frames().slice(1)) {
  metrics.push(
    await f.evaluate(() => ({
      kind: new URLSearchParams(location.search).get("kind"),
      font: getComputedStyle(document.body).fontFamily,
      fontsReady: document.fonts.status,
      overflow: document.documentElement.scrollWidth > innerWidth,
      button: document.querySelector("button")?.getBoundingClientRect().height,
      sections: [...document.querySelectorAll(".sample-row")].map(
        (s) => s.getBoundingClientRect().height,
      ),
    })),
  );
}
async function dialogs(name) {
  const before = p.frameLocator('iframe[title="迁移前"]'),
    after = p.frameLocator('iframe[title="迁移后"]');
  await before.getByRole("button", { name: "编辑主题", exact: true }).click();
  await after.getByRole("button", { name: "编辑主题", exact: true }).click();
  await p.waitForTimeout(180);
  const boxes = [
    await before.getByRole("alertdialog", { name: "主题设置" }).boundingBox(),
    await after.getByRole("dialog", { name: "主题设置" }).boundingBox(),
  ];
  const y = Math.max(0, Math.min(...boxes.map((v) => v.y)) - 40),
    bottom = Math.max(...boxes.map((v) => v.y + v.height)) + 40;
  await p.screenshot({
    path: out + `/dialogs-${name}.png`,
    clip: { x: 52, y, width: 1296, height: bottom - y },
  });
}
await dialogs("light");
await ready("dark");
await p.screenshot({ path: out + "/comparison-dark.png", fullPage: true });
await dialogs("dark");
await ready("light", "pine");
await p.screenshot({ path: out + "/comparison-pine.png", fullPage: true });
await ready("light", "sakura", 760);
for (const f of p.frames().slice(1))
  assert.equal(
    await f.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
await p.screenshot({ path: out + "/comparison-narrow.png", fullPage: true });
await p.goto(host + "/tests/fixtures/shadcn/panel.html?kind=after");
await p.setViewportSize({ width: 380, height: 1000 });
await p.getByRole("heading", { name: "样式与显示" }).waitFor();
await p.evaluate(() => document.fonts.ready);
assert.equal(
  await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
  false,
);
await p.getByRole("button", { name: "编辑主题", exact: true }).click();
await p.getByRole("dialog").waitFor();
const box = await p.getByRole("dialog").boundingBox();
assert(box.x >= 0 && box.x + box.width <= 380);
for (let i = 0; i < 12; i++) {
  await p.keyboard.press("Tab");
  assert(
    await p
      .getByRole("dialog")
      .evaluate((e) => e.contains(document.activeElement)),
  );
}
await p.keyboard.press("Escape");
assert.deepEqual(errors, []);
fs.writeFileSync(
  out + "/acceptance.json",
  JSON.stringify(
    {
      metrics,
      keyboard:
        "switch, select, menu, slider, nested Escape, focus restoration, modal focus containment",
      sizes: "1400,760,380",
      schemes: "light,dark",
      palettes: "sakura,pine",
      errors,
    },
    null,
    2,
  ),
);
console.log("组件交互、嵌套弹层、深浅色、两套配色及窄窗口核对完成。");
await b.close();
