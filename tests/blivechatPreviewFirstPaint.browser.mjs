import { createBlivechatSourceConfig } from "../src/compat/blivechat/sourceConfig.ts";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const server = http.createServer(async (req, res) => {
  if (req.url === "/") {
    res.setHeader("content-type", "text/html");
    res.end(
      '<iframe src="/blivechat/renderer.html" style="width:500px;height:600px"></iframe>',
    );
    return;
  }
  try {
    const file = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname.slice(1),
    );
    res.setHeader(
      "content-type",
      {
        ".html": "text/html",
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".css": "text/css",
      }[path.extname(file)] || "application/octet-stream",
    );
    res.end(await fs.readFile(path.join("public", file)));
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const frame = page.frames().find((f) => f.url().includes("renderer.html"));
  await frame.waitForFunction(
    () => !!document.querySelector("yt-live-chat-renderer")?.__vue__,
  );
  await page.evaluate(
    (data) =>
      document
        .querySelector("iframe")
        .contentWindow.postMessage(
          { type: "bb-blivechat", command: "config", data },
          location.origin,
        ),
    createBlivechatSourceConfig({}),
  );
  await page.waitForTimeout(100);
  await page.evaluate(() =>
    document
      .querySelector("iframe")
      .contentWindow.postMessage(
        {
          type: "bb-blivechat",
          command: "host",
          data: { managed: true, tickerEnabled: false, direction: "bottom" },
        },
        location.origin,
      ),
  );
  await page.waitForTimeout(100);
  await frame.evaluate(() => {
    window.__firstPaints = [];
    window.__starts = [];
    window.__nodes = [];
    const seen = new WeakSet();
    const tick = () => {
      for (const n of document.querySelectorAll(
        "#items.yt-live-chat-item-list-renderer > [data-compatible-event-id]",
      ))
        if (!seen.has(n)) {
          seen.add(n);
          window.__nodes.push(n);
          window.__firstPaints.push({
            id: n.dataset.compatibleEventId,
            opacity: getComputedStyle(n).opacity,
            enter: n.hasAttribute("data-event-motion-entering"),
          });
        }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    document.addEventListener(
      "transitionrun",
      (e) => {
        if (e.propertyName === "opacity")
          window.__starts.push(e.target.dataset.compatibleEventId);
      },
      true,
    );
  });
  const messages = [];
  for (let i = 1; i <= 3; i++) {
    const id = `first-event-${i}`;
    messages.push({
      id,
      type: 0,
      authorName: "观众",
      authorType: 0,
      privilegeType: 0,
      content: `弹幕 ${i}`,
      contentParts: [{ type: 0, text: `弹幕 ${i}` }],
      avatarUrl: "/media/noface.gif",
      time: new Date().toISOString(),
      addTime: new Date().toISOString(),
    });
    await page.evaluate(
      (data) =>
        document
          .querySelector("iframe")
          .contentWindow.postMessage(
            { type: "bb-blivechat", command: "preview-present", data },
            location.origin,
          ),
      {
        messages,
        paidMessages: [],
        epoch: 1,
        restart: 1,
        hostPresentation: {
          layout: messages.map((m) => ({ kind: "source", eventId: m.id })),
          stickyRecords: [],
          direction: "bottom",
          position: "top",
          contentAlignment: "top",
          animation: { preset: "fade", durationMs: 200 },
        },
      },
    );
    await page.waitForTimeout(300);
  }
  const result = await frame.evaluate(() => ({
    first: window.__firstPaints,
    starts: window.__starts,
    retained: window.__nodes.every((n) => n.isConnected),
  }));
  assert.equal(result.first.length, 3);
  for (const item of result.first)
    assert.ok(
      item.enter && Number(item.opacity) === 0,
      `${item.id} must start hidden before its first painted frame: ${JSON.stringify(item)}`,
    );
  assert.deepEqual(result.starts, [
    "first-event-1",
    "first-event-2",
    "first-event-3",
  ]);
  assert.equal(result.retained, true);
  console.log(JSON.stringify(result));
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
}
