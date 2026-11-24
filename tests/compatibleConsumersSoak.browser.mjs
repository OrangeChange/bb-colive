import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const baseUrl = process.env.PREVIEW_TEST_URL || "http://127.0.0.1:1420";
const windowBaseUrl = process.env.NATIVE_EVENT_TEST_URL || baseUrl;
const duration = Number(process.env.SOAK_MS || 900_000);
const interval = Number(process.env.SOAK_SAMPLE_MS || 60_000);
const browser = await chromium.launch({ headless: true, channel: "msedge" });
try {
  const context = await browser.newContext({ viewport: { width: 1200, height: 820 } });
  const targets = [];
  for (const kind of ["display", "gift"]) {
    const page = await context.newPage();
    await page.goto(`${windowBaseUrl}/tests/fixtures/nativeEventWindow.html?kind=${kind}`);
    await page.waitForSelector("#window-status");
    await page.evaluate(async selected => {
      const ports = await import("/tests/helpers/nativeEventBrowserPorts.ts");
      const channels = await import("/src/windows/eventWindowChannels.ts");
      const readyEvent = selected === "display" ? channels.DISPLAY_READY_EVENT : channels.revenueWindowChannels(selected).readyEvent;
      await ports.nativeEventBrowserPorts.emitTo("main", readyEvent, { roomId: 6431492, generation: 1 });
    }, kind);
    await page.waitForFunction(() => {
      const status = document.querySelector("#window-status")?.textContent;
      return status ? JSON.parse(status).ready === true : false;
    });
    targets.push({ name: `${kind}-window`, page, session: await context.newCDPSession(page), frames: 1 });
  }
  for (const mode of ["blivechat", "blivechat-open", "laplace"]) {
    const page = await context.newPage();
    await page.goto(`${baseUrl}/tests/fixtures/compatibleEditorBridge.html?mode=${mode}`);
    await page.getByRole("group", { name: "预览状态" }).getByRole("button", { name: "动态", exact: true }).click();
    targets.push({ name: mode, page, session: await context.newCDPSession(page), frames: 2 });
  }
  for (const target of targets) await target.session.send("Performance.enable");
  const startedAt = Date.now();
  while (Date.now() - startedAt < duration) {
    await new Promise(resolve => setTimeout(resolve, Math.min(interval, duration - (Date.now() - startedAt))));
    const point = { elapsedMs: Date.now() - startedAt, targets: {} };
    for (const target of targets) {
      if (target.name.endsWith("-window")) await target.page.click("#send-samples");
      const metrics = Object.fromEntries((await target.session.send("Performance.getMetrics")).metrics.map(item => [item.name, item.value]));
      assert.equal(target.page.frames().length, target.frames, `${target.name} frame 数不得增长`);
      point.targets[target.name] = {
        heapBytes: metrics.JSHeapUsedSize,
        nodes: metrics.Nodes,
        documents: metrics.Documents,
        taskSeconds: metrics.TaskDuration,
        rows: await target.page.locator("[data-event-id]").count(),
      };
    }
    console.log(JSON.stringify(point));
  }
} finally {
  await browser.close();
}
