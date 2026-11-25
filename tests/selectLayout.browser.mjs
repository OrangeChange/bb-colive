import { chromium } from "playwright";
import assert from "node:assert/strict";
const b = await chromium.launch({ channel: "msedge", headless: true });
try {
  for (const width of [380, 960]) {
    const p = await b.newPage({
      viewport: { width, height: 720 },
      reducedMotion: "reduce",
    });
    await p.goto(
      "http://127.0.0.1:1436/tests/fixtures/shadcn/select-layout.html",
    );
    for (const w of [120, 320]) {
      const trigger = p.getByRole("combobox", { name: "选项宽度" + w });
      const a = await trigger.boundingBox();
      await trigger.press("Enter", { delay: 50 });
      const list = p.getByRole("listbox");
      await list.waitFor();
      const r = await list.boundingBox();
      assert.ok(r.width >= a.width - 1);
      assert.ok(r.x >= 7 && r.x + r.width <= width - 7);
      if (a.x + r.width <= width - 8) assert.ok(Math.abs(a.x - r.x) < 1);
      for (const option of await list.getByRole("option").all()) {
        assert.equal(
          await option.evaluate((n) => getComputedStyle(n).whiteSpace),
          "nowrap",
        );
        assert.ok((await option.boundingBox()).height < 40);
      }
      await p.waitForFunction(
        () => document.activeElement?.getAttribute("role") === "option",
      );
      await p.keyboard.press("End", { delay: 50 });
      await p.keyboard.press("Enter", { delay: 50 });
      await list.waitFor({ state: "hidden" });
      assert.match(await trigger.innerText(), /长选项/);
    }
    const right = p.getByRole("combobox", { name: "右侧选项" });
    const anchor = await right.boundingBox();
    await right.press("Enter", { delay: 50 });
    const popup = p.getByRole("listbox");
    await popup.waitFor();
    await p.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
    const box = await popup.boundingBox();
    if (anchor.x + anchor.width - box.width >= 8)
      assert.ok(
        Math.abs(box.x + box.width - anchor.x - anchor.width) < 2,
        "右侧控件右对齐",
      );
    assert.ok(box.x >= 7 && box.x + box.width <= width - 7);
    await p.keyboard.press("Escape");
    await p.close();
  }
  console.log("短/长选项、不同触发框宽度、窗口边缘及键盘选择通过");
} finally {
  await b.close();
}
