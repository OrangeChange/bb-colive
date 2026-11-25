import { chromium } from "playwright";
import assert from "node:assert/strict";
const b = await chromium.connectOverCDP("http://127.0.0.1:9436");
const p = b.contexts()[0].pages()[0];
p.setDefaultTimeout(8000);
try {
  await p.reload();
  await p.getByRole("button", { name: "语音（TTS播报）", exact: true }).click();
  const list = p.locator(".voice-pronunciation-list");
  await list.waitFor({ state: "attached" });
  await list.scrollIntoViewIfNeeded();
  const result = await list.evaluate((n) => ({
    height: n.clientHeight,
    scrollHeight: n.scrollHeight,
    width: n.clientWidth,
    scrollWidth: n.scrollWidth,
  }));
  console.log("发音修正", result);
  assert.equal(result.height, result.scrollHeight);
  assert.equal(result.width, result.scrollWidth);
  await p.screenshot({
    path: ".superpowers/shadcn-ui/pronunciation-fixed.png",
  });
  await p.getByRole("button", { name: "样式", exact: true }).click();
  await p.locator(".theme-category-tabs").waitFor();
  for (const width of [1000, 1600]) {
    await p.setViewportSize({ width, height: 900 });
    await p.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
    const boxes = await p
      .locator(".theme-library-toolbar")
      .evaluate((n) => ({
        search: n
          .querySelector(".theme-library-search")
          .getBoundingClientRect()
          .toJSON(),
        buttons: [...n.querySelectorAll(".theme-category-tabs button")].map(
          (n) => n.getBoundingClientRect().toJSON(),
        ),
        tabs: {
          h: n.querySelector(".theme-category-tabs").clientHeight,
          sh: n.querySelector(".theme-category-tabs").scrollHeight,
        },
      }));
    assert.ok(
      boxes.buttons.every((r) => Math.abs(r.height - boxes.search.height) < 1),
    );
    const last = boxes.buttons.at(-1);
    assert.ok(
      Math.abs(boxes.search.y - boxes.buttons[0].y) < 1 ||
        boxes.search.y >= last.bottom,
      "搜索框同排顶对齐或整组换行",
    );
    assert.equal(boxes.tabs.h, boxes.tabs.sh);
    console.log("主题库", width, JSON.stringify(boxes));
    await p.screenshot({
      path: ".superpowers/shadcn-ui/library-aligned-" + width + ".png",
    });
  }
} finally {
  await b.close();
}
