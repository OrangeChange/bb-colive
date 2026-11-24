import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const baseUrl = process.env.PREVIEW_TEST_URL || "http://127.0.0.1:1420";
const duration = Number(process.env.SOAK_MS || 900_000);
const interval = Number(process.env.SOAK_SAMPLE_MS || 60_000);

const browser = await chromium.launch({ headless: true, channel: "msedge" });
try {
  const samples = [];
  const pages = [];
  for (const mode of ["blivechat", "blivechat-open", "laplace"]) {
    const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
    await page.goto(`${baseUrl}/tests/fixtures/compatibleEditorBridge.html?mode=${mode}`);
    await page.getByRole("group", { name: "预览状态" }).getByRole("button", { name: "动态", exact: true }).click();
    const session = await page.context().newCDPSession(page);
    await session.send("Performance.enable");
    pages.push({ mode, page, session });
  }
  const startedAt = Date.now();
  while (Date.now() - startedAt < duration) {
    await new Promise(resolve => setTimeout(resolve, Math.min(interval, duration - (Date.now() - startedAt))));
    const point = { elapsedMs: Date.now() - startedAt, modes: {} };
    for (const { mode, page, session } of pages) {
      const metrics = Object.fromEntries((await session.send("Performance.getMetrics")).metrics.map(item => [item.name, item.value]));
      const frames = page.frames().length;
      assert.equal(frames, 2, `${mode} 长时运行不得增长 iframe`);
      const frame = page.frames().find(value => value !== page.mainFrame());
      const runtime = frame ? await frame.evaluate(() => ({
        elements: document.querySelectorAll("*").length,
        rows: document.querySelectorAll("#chat-items > *").length,
        status: globalThis.__bbOpenLiveQA?.getRuntime
          ? {
              records: globalThis.__bbOpenLiveQA.getRuntime().records.size,
              messages: globalThis.__bbOpenLiveQA.getRenderer().messages.length,
              buffer: globalThis.__bbOpenLiveQA.getRenderer().messagesBuffer.length,
              queue: globalThis.__bbOpenLiveQA.getRenderer().smoothedMessageQueue.flat().length,
            }
          : null,
      })) : null;
      if (mode === "blivechat-open") assert.ok(runtime && runtime.rows <= 61, `blivechat-open 动态预览事件窗口失去上限：${runtime?.rows ?? "不可读"}`);
      point.modes[mode] = { frames, heapBytes: metrics.JSHeapUsedSize, nodes: metrics.Nodes, documents: metrics.Documents, runtime };
    }
    samples.push(point);
    console.log(JSON.stringify(point));
  }
  for (const mode of ["blivechat", "blivechat-open", "laplace"]) {
    const values = samples.map(sample => sample.modes[mode].heapBytes);
    assert.ok(values.every(Number.isFinite), `${mode} 必须可读取堆内存`);
  }
} finally {
  await browser.close();
}
