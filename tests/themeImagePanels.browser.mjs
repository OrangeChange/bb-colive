import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const output = process.env.ACCEPTANCE_DIRECTORY || ".superpowers/sdd/theme-image-panels";
await mkdir(output, { recursive: true });
try {
  for (const [mode, theme] of [
    ["native", "native-default"],
    ["native", "native-card"],
    ["native", "native-bubble"],
    ["laplace", ""],
    ["blivechat", ""],
    ["blivechat-open", ""],
  ]) {
    if (
      process.env.IMAGE_PANEL_MODES &&
      !process.env.IMAGE_PANEL_MODES.split(",").includes(mode)
    )
      continue;
    const page = await browser.newPage({
      viewport: { width: 1500, height: 1000 },
    });
    page.setDefaultTimeout(12000);
    await page.goto(
      (process.env.THEME_IMAGE_TEST_URL || "http://127.0.0.1:1420") +
        "/tests/fixtures/themeImageMatrix.html?" +
        new URLSearchParams({ mode, theme }),
    );
    await page.getByRole("tab", { name: "可视化编辑", exact: true }).click();
    await page.waitForFunction(() =>
      [...document.querySelectorAll("iframe")].some((f) =>
        f.contentDocument?.querySelector(
          ".event,yt-live-chat-text-message-renderer",
        ),
      ),
    );
    if (mode.startsWith("blivechat"))
      await page
        .locator(".native-event-scope-primary")
        .getByRole("button", { name: "弹幕", exact: true })
        .click();
    for (const title of ["图片背景", "装饰图", "图片边框", "头像框"]) {
      await page
        .locator('nav[aria-label="语义部件"] details')
        .evaluateAll((nodes) => nodes.forEach((n) => (n.open = true)));
      const part = title === "头像框" ? "avatarFrame" : "username";
      await page
        .locator(
          `nav[aria-label="语义部件"] button[data-native-part-id="${part}"]:visible`,
        )
        .last()
        .click();
      if(mode.startsWith("blivechat")) await page.locator('.native-identity-scope').getByRole('button',{name:'普通用户',exact:true}).click();
      await page
        .locator(".native-property-sections details")
        .evaluateAll((nodes) => nodes.forEach((n) => (n.open = true)));
      try {
        await page
          .locator(".native-property-panel")
          .getByRole("button", { name: title, exact: true })
          .click();
      } catch (e) {
        console.log(await page.locator(".native-property-panel").innerText());
        await page.screenshot({ path: output + "/failed-" + mode + ".png" });
        throw e;
      }
      const dialog = page.getByRole("dialog", { name: title, exact: true });
      if (title === "头像框")
        await dialog
          .getByRole("button", { name: "自定义", exact: true })
          .click();
      await dialog
        .getByRole("combobox", {
          name:
            title === "图片背景"
              ? "图片素材"
              : title === "图片边框"
                ? "边框图片"
                : "装饰图片",
          exact: true,
        })
        .click();
      await page.getByRole("option", { name: "示例图片", exact: true }).click();
      await dialog
        .getByRole("button", {
          name:
            title === "头像框" || title === "图片边框" ? "使用图片" : "添加图片",
          exact: true,
        })
        .click();
      for (const view of ["当前部件", "事件效果"]) {
        await dialog.getByRole("button", { name: view, exact: true }).click();
        await page.waitForFunction(() => {
          const canvas = document.querySelector('.theme-image-effect-canvas');
          const find = root => {
            const node = root.querySelector('[data-image-preview-focus]');
            if(node) return node;
            for(const frame of root.querySelectorAll('iframe')) { const result=frame.contentDocument && find(frame.contentDocument);if(result)return result; }
          };
          const node = canvas && find(canvas);
          if(!node)return false;
          const r=node.getBoundingClientRect();let x=r.x+r.width/2,y=r.y+r.height/2,doc=node.ownerDocument;
          while(doc!==document){const f=doc.defaultView.frameElement,b=f.getBoundingClientRect();x+=b.x;y+=b.y;doc=f.ownerDocument;}
          const c=canvas.getBoundingClientRect();
          return r.width>0&&r.height>0&&Math.abs(x-c.x-c.width/2)<2&&Math.abs(y-c.y-c.height/2)<2&&node.ownerDocument.defaultView.getComputedStyle(node).visibility==='visible';
        });
      }
      await page.screenshot({
        path: `${output}/${theme || mode}-${title}.png`,
      });
      assert.equal(
        await dialog.evaluate((n) => n.scrollWidth <= n.clientWidth),
        true,
      );
      await dialog.getByRole("button", { name: "取消", exact: true }).click();
      console.log("passed", theme || mode, title);
    }
    await page.close();
  }
} finally {
  await browser.close();
}
