import { chromium } from "playwright";
import assert from "node:assert/strict";
const b = await chromium.connectOverCDP("http://127.0.0.1:9436");
const p = b.contexts()[0].pages()[0];
p.setDefaultTimeout(10000);
const out = ".superpowers/shadcn-ui/";
try {
  await p.reload();
  await p.getByRole("button", { name: "语音（TTS播报）", exact: true }).click();
  const tone = p.locator(".voice-select-tone");
  await tone.waitFor();
  assert.ok((await tone.boundingBox()).width <= 321);
  await tone.scrollIntoViewIfNeeded();
  await p.screenshot({ path: out + "tone-constrained.png" });
  await tone.click();
  const list = p.getByRole("listbox");
  if (await list.count()) {
    await list.waitFor();
    await list.evaluate(async (n) => {
      await Promise.all(
        n
          .getAnimations({ subtree: true })
          .map((a) => a.finished.catch(() => {})),
      );
    });
    const box = await list.boundingBox(),
      trigger = await tone.boundingBox();
    assert.ok(box.width >= trigger.width - 1);
    const align = await tone.evaluate(async (node) => {
      const { popupAlignment } = await import("/src/components/ui/popupAlignment.ts");
      return popupAlignment(node);
    });
    assert.ok(Math.abs(align === "end"
      ? box.x + box.width - trigger.x - trigger.width
      : box.x - trigger.x) < 2);
    assert.ok(
      await list
        .getByRole("option")
        .evaluateAll((ns) =>
          ns.every((n) => getComputedStyle(n).whiteSpace === "nowrap"),
        ),
    );
    await p.screenshot({ path: out + "tone-dropdown.png" });
    await p.keyboard.press("Escape");
    await list.waitFor({ state: "hidden" });
  }
  await p.getByRole("button", { name: "回看", exact: true }).click();
  await p.getByRole("tab").first().waitFor();
  const tabs = p.locator('.ui-segmented[role="tablist"]');
  assert.equal(await tabs.count(), 1);
  await tabs.screenshot({ path: out + "review-tabs-normalized.png" });
  await p.getByRole("button", { name: "样式", exact: true }).click();
  await p.getByRole("button", { name: "OBS 设置", exact: true }).click();
  const obs = p.locator(".obs-service-settings");
  await obs.waitFor();assert.equal(await obs.locator(".obs-effect-reset").count(),0);
  for (const width of [1000, 1600]) {
    await p.setViewportSize({ width, height: 900 });
    await p.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
    assert.equal(
      await obs.evaluate((n) => getComputedStyle(n).display),
      "flex",
    );
    assert.ok(await obs.evaluate((n) => n.scrollWidth <= n.clientWidth + 1));
    await obs.screenshot({ path: out + "obs-settings-" + width + ".png" });
  }
  await p.reload();
  await p.getByRole("button", { name: "样式", exact: true }).click();
  await p.getByRole("button", { name: "编辑", exact: true }).first().click();
  await p.getByRole("tab", { name: "可视化编辑", exact: true }).click();
  const nav = p.locator(".native-visual-body nav");
  await nav.waitFor();
  const button = nav.locator("button:visible").first();
  assert.ok(
    ["flex-start", "flow-start", "start"].includes(
      await button.evaluate((n) => getComputedStyle(n).justifyContent),
    ),
  );
  assert.equal(
    await button.evaluate((n) => getComputedStyle(n).textAlign),
    "left",
  );
  await nav.screenshot({ path: out + "visual-navigation-left.png" });
  console.log("音色限宽、下拉单行与定位、回看分段、OBS分组、导航左对齐通过");
} finally {
  await b.close();
}
