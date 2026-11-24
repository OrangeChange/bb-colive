import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const bundle = await build({
  entryPoints: ["tests/fixtures/pausedStickyPreview.tsx"],
  bundle: true,
  write: false,
  format: "iife",
  jsx: "automatic",
  loader: {
    ".css": "empty",
    ".png": "dataurl",
    ".webp": "dataurl",
    ".svg": "dataurl",
  },
});
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  page.on("pageerror", (error) => console.log(error.message));
  await page.route("http://localhost:47191/", (route) =>
    route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }),
  );
  await page.goto("http://localhost:47191/");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.waitForFunction(
    () =>
      document
        .querySelector("iframe")
        ?.contentWindow.commands?.some(
          (item) => item.command === "preview-present",
        ),
    null,
    { timeout: 5000 },
  );
  const presentation = await page.evaluate(
    () =>
      document
        .querySelector("iframe")
        .contentWindow.commands.filter(
          (item) => item.command === "preview-present",
        )
        .at(-1).data,
  );
  assert.equal(presentation.messages.length, 0);
  assert.deepEqual(
    presentation.paidMessages.map((item) => item.id),
    ["pinned-gift"],
    "主流已移除的礼物仍保留置顶快照",
  );
  console.log("暂停预览恢复仅置顶礼物通过");
} finally {
  await browser.close();
}
