import { chromium } from "playwright";
import assert from "node:assert/strict";
const b = await chromium.launch({ channel: "msedge", headless: true });
try {
  for (const scheme of ["light", "dark"]) {
    const p = await b.newPage({
      viewport: { width: 1360, height: 1200 },
      reducedMotion: "reduce",
    });
    await p.goto(
      "http://127.0.0.1:1436/tests/fixtures/shadcn/visual-editor.html?scheme=" +
        scheme,
    );
    await p
      .locator('.native-property-field.is-visible [data-slot="toggle-group"]')
      .waitFor();
    const groups = p.locator(".ui-segmented");
    assert.ok((await groups.count()) > 1);
    for (const group of await groups.all()) {
      if (!(await group.isVisible())) continue;
      const g = await group.evaluate((n) => ({
        r: n.getBoundingClientRect().toJSON(),
        overflow: getComputedStyle(n).overflow,
        radius: getComputedStyle(n).borderRadius,
        children: [...n.children]
          .filter((n) => n.tagName === "BUTTON")
          .map((n) => ({
            r: n.getBoundingClientRect().toJSON(),
            radius: getComputedStyle(n).borderRadius,
          })),
      }));
      assert.equal(g.overflow, "hidden");
      for (const c of g.children) {
        assert.equal(c.radius, "0px");
        assert.ok(Math.abs(c.r.height - (g.r.height - 2)) < 2, "分段填充高度");
      }
      for (let i = 1; i < g.children.length; i++)
        assert.ok(
          Math.abs(g.children[i].r.x - g.children[i - 1].r.right) < 2,
          "分段间隙",
        );
    }
    await p
      .locator(".native-property-panel")
      .screenshot({
        path: ".superpowers/shadcn-ui/segmented-" + scheme + ".png",
      });
    await p.goto("http://127.0.0.1:1436/tests/fixtures/shadcn/migration.html");
    await p.getByRole("button", { name: "关于", exact: true }).click();
    const dialog = p.getByRole("dialog");
    await dialog.waitFor();
    const rect = await dialog.boundingBox();
    assert.ok(Math.abs(rect.x + rect.width / 2 - 680) < 2);
    const logo = await dialog.locator(".about-character").boundingBox();
    assert.ok(logo.height > 120);
    assert.equal(
      await dialog.locator('a[href="https://ui.shadcn.com/"]').count(),
      1,
    );
    await dialog
      .locator("img")
      .evaluateAll((ns) => Promise.all(ns.map((n) => n.decode())));
    assert.equal(
      await dialog
        .locator("img")
        .evaluateAll((ns) => ns.every((n) => n.complete && n.naturalWidth > 0)),
      true,
    );
    await p.close();
  }
  console.log("分段填充、内外圆角、关于页布局与图片通过");
} finally {
  await b.close();
}
