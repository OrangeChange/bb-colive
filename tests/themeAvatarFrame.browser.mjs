import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const output = await build({
  stdin: {
    contents:
      'import {renderThemeImageDecorations} from "./src/themes/themeImageDecorations.ts";window.renderImages=renderThemeImageDecorations;',
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: "iife",
});
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(
    '<style>.avatar{width:24px;height:24px;overflow:hidden;border-radius:50%}.avatar img{width:100%;height:100%}</style><div class="avatar"><img></div><style id="custom"></style>',
  );
  await page.addScriptTag({ content: output.outputFiles[0].text });
  const result = await page.evaluate(() => {
    const image = {
      id: "frame",
      source: "frame.svg",
      slot: "before",
      visible: true,
      width: 28.8,
      height: 28.8,
      flow: false,
      alignment: [50, 50],
      anchor: [
        { value: 50, unit: "%" },
        { value: 50, unit: "%" },
      ],
      move: [
        { value: 0, unit: "px" },
        { value: 0, unit: "px" },
      ],
      avatarRatio: { width: 1.2, height: 1.2 },
      avatarClipRadius: "50%",
    };
    const node = document.querySelector(".avatar"),
      style = document.querySelector("#custom");
    style.textContent = window.renderImages(
      { "common|all|all|main|avatarFrame": [image] },
      () => ".avatar",
    );
    const custom = {
      position: getComputedStyle(node).position,
      overflow: getComputedStyle(node).overflow,
      width: parseFloat(getComputedStyle(node, "::before").width),
      radius: getComputedStyle(node.querySelector("img")).borderRadius,
    };
    node.style.width = "40px";
    node.style.height = "40px";
    const resized = parseFloat(getComputedStyle(node, "::before").width);
    style.textContent = window.renderImages(
      { "common|all|all|main|avatarFrame": [] },
      () => ".avatar",
    );
    return {
      custom,
      resized,
      restored: {
        position: getComputedStyle(node).position,
        overflow: getComputedStyle(node).overflow,
        content: getComputedStyle(node, "::before").content,
      },
    };
  });
  assert.equal(result.custom.position, "relative");
  assert.equal(result.custom.overflow, "visible");
  assert.equal(result.custom.radius, "50%");
  assert.ok(Math.abs(result.custom.width - 28.8) < 0.1);
  assert.equal(result.resized, 48);
  assert.equal(result.restored.position, "static");
  assert.equal(result.restored.overflow, "hidden");
  assert.equal(result.restored.content, "none");
  console.log("头像框定位、外扩、头像圆角、尺寸跟随和沿用主题恢复通过");
} finally {
  await browser.close();
}
