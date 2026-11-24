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
  const page = await browser.newPage({ viewport: { width: 600, height: 320 } });
  await page.setContent(
    '<style>body{margin:0;background:white}.host{position:absolute;left:100px;top:100px;width:300px;height:100px;overflow:visible}</style><div class="host"></div><style id="custom"></style>',
  );
  await page.addScriptTag({ content: output.outputFiles[0].text });
  await page.evaluate(() => {
    const make = (id, color, patch) => ({
      id,
      source:
        "data:image/svg+xml," +
        encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="${color}"/></svg>`,
        ),
      slot: "before",
      visible: true,
      flow: false,
      width: 80,
      height: 40,
      alignment: [0, 0],
      anchor: [
        { value: 0, unit: "%" },
        { value: 0, unit: "%" },
      ],
      move: [
        { value: -20, unit: "px" },
        { value: 0, unit: "px" },
      ],
      ...patch,
    });
    window.images = [
      make("red", "red"),
      make("blue", "blue", {
        alignment: [100, 100],
        anchor: [
          { value: 100, unit: "%" },
          { value: 100, unit: "%" },
        ],
        move: [
          { value: 12, unit: "px" },
          { value: 0, unit: "px" },
        ],
      }),
    ];
    window.paint = () => {
      document.querySelector("#custom").textContent = window.renderImages(
        { target: window.images },
        () => ".host",
      );
    };
    window.paint();
  });
  const pixel = async (x, y) => {
    const data =
      "data:image/png;base64," + (await page.screenshot()).toString("base64");
    return page.evaluate(
      async ({ data, x, y }) => {
        const img = new Image();
        img.src = data;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        return [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3);
      },
      { data, x, y },
    );
  };
  await page.waitForFunction(
    () =>
      getComputedStyle(
        document.querySelector(".host"),
        "::before",
      ).backgroundImage.includes("blue") ||
      getComputedStyle(
        document.querySelector(".host"),
        "::before",
      ).backgroundImage.includes("%23"),
  );
  assert.deepEqual(await pixel(85, 105), [255, 0, 0]);
  assert.deepEqual(await pixel(405, 165), [0, 0, 255]);
  await page.evaluate(() => {
    window.images[1].visible = false;
    window.paint();
  });
  assert.deepEqual(await pixel(85, 105), [255, 0, 0]);
  await page.evaluate(() => {
    window.images[1].visible = true;
    window.images[0].anchor[0] = { value: 50, unit: "%" };
    window.images[0].move[0] = { value: 25, unit: "%" };
    window.paint();
  });
  assert.deepEqual(await pixel(137, 105), [255, 0, 0]);
  await page.evaluate(() => {
    document.querySelector(".host").style.width = "400px";
  });
  assert.deepEqual(await pixel(162, 105), [255, 0, 0]);
  assert.deepEqual(await pixel(505, 165), [0, 0, 255]);
  await page.evaluate(() => {
    window.images[0].basis = { variable: "--event-base-size", value: 16 };
    document
      .querySelector(".host")
      .style.setProperty("--event-base-size", "20px");
    window.paint();
  });
  assert.deepEqual(await pixel(152, 105), [255, 0, 0]);
  assert.deepEqual(await pixel(149, 105), [255, 255, 255]);
  await page.evaluate(() => {
    document.querySelector(".host").classList.add("chat");
    document.querySelector("#custom").textContent = window.renderImages(
      {
        "common|chat|all|main|username": [],
        "common|all|all|main|username": window.images,
      },
      (key) => (key.split("|")[1] === "chat" ? ".host:where(.chat)" : ".host"),
    );
  });
  assert.deepEqual(await pixel(152, 105), [255, 255, 255]);
  await page.evaluate(() => {
    document.querySelector("#custom").textContent = window.renderImages(
      { "common|all|all|main|username": window.images },
      () => ".host",
    );
  });
  assert.deepEqual(await pixel(152, 105), [255, 0, 0]);
  console.log("同层多图外扩、隐藏还原、百分比移动与容器缩放的实际像素通过");
} finally {
  await browser.close();
}
