import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const bundle = await build({
  entryPoints: ["tests/fixtures/previewPolicyNotifications.tsx"],
  bundle: true,
  write: false,
  format: "iife",
  jsx: "automatic",
  define: { "import.meta.hot": "undefined" },
  loader: {
    ".css": "empty",
    ".png": "dataurl",
    ".webp": "dataurl",
    ".svg": "dataurl",
  },
});
const browser = await chromium.launch({ headless: true, channel: "chrome" });
try {
  const page = await browser.newPage();
  await page.route("http://localhost:47191/", (route) =>
    route.fulfill({ body: '<div id="root"></div>', contentType: "text/html" }),
  );
  await page.goto("http://localhost:47191/");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.locator("output").waitFor();
  const before = await page.evaluate(() => window.policyReport.reads);
  await page.waitForTimeout(450);
  const idleReads =
    (await page.evaluate(() => window.policyReport.reads)) - before;
  await page.evaluate(() => window.changeScene(12));
  await page.waitForFunction(
    () => document.querySelector("output").textContent === "12",
  );
  await page.evaluate(() => window.changeOtherWindow(34));
  await page.waitForFunction(
    () => document.querySelector("output").textContent === "34",
  );
  await page.evaluate(() => window.unmountPolicy());
  const afterUnmount = await page.evaluate(() => window.policyReport.reads);
  await page.evaluate(() => window.changeScene(56));
  const cleanup = await page.evaluate(
    (count) => window.policyReport.reads === count,
    afterUnmount,
  );
  console.log(
    JSON.stringify({ idleReads, sameWindow: true, otherWindow: true, cleanup }),
  );
  assert.equal(idleReads, 0, "未修改设置时不轮询浏览器存储");
  assert.equal(cleanup, true, "卸载后停止订阅");
} finally {
  await browser.close();
}
