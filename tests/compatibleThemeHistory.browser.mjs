import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const baseUrl = process.env.PREVIEW_TEST_URL || "http://127.0.0.1:1420";
const browser = await chromium.launch({ headless: true, channel: "msedge" });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(baseUrl);
  await page.evaluate(async () => {
    const componentSource = await (await fetch("/src/components/EventList.tsx")).text();
    const entrySource = await (await fetch("/src/main.tsx")).text();
    const reactUrl = componentSource.match(/"([^"\n]*\/react\.js[^"\n]*)"/)[1];
    const domUrl = entrySource.match(/"([^"\n]*\/react-dom_client\.js[^"\n]*)"/)[1];
    const React = (await import(reactUrl)).default;
    const { createRoot } = (await import(domUrl)).default;
    const { EventList } = await import(`/src/components/EventList.tsx?history-qa=${Date.now()}`);
    const { createFeedScrollSession } = await import("/src/events/feedScroll.ts");
    const host = document.createElement("section");
    host.style.cssText = "position:fixed;inset:20px;z-index:99999;background:#101714;display:flex;flex-direction:column";
    document.body.append(host);
    const qa = globalThis.__compatibleHistoryQA = { host, errors: [], root: null, target: null, append: null, count: 0 };
    qa.root = createRoot(host, { onUncaughtError: error => qa.errors.push(String(error)), onCaughtError: error => qa.errors.push(String(error)) });
    function Case() {
      const [events, setEvents] = React.useState(() => Array.from({ length: 10000 }, (_, index) => ({ id: `history-${index}`, reactKey: `history-${index}`, roomId: 1, ts: 1700000000000 + index, msgType: 0, user: { uid: "qa", uname: "历史验收" }, text: `历史消息 ${index}` })));
      const [targetKey, setTargetKey] = React.useState(null);
      const session = React.useRef(createFeedScrollSession(0));
      qa.count = events.length;
      qa.target = () => setTargetKey("history-5000");
      qa.append = () => setEvents(current => [...current, ...Array.from({ length: 250 }, (_, index) => ({ ...current[0], id: `new-${index}`, reactKey: `new-${index}`, ts: 1700000010000 + index, text: `新增消息 ${index}` }))]);
      return React.createElement(EventList, { events, visibleIndices: events.map((_, index) => index), viewKey: "history", feedKey: "history", feedSession: session.current, liveLayout: true, scrollDirection: "bottom", eventMenuHandlers: { regionKey: "history", contextTargetRegionKey: "history", contextTargetKey: targetKey, isFavorite: () => false, onToggleFavorite: () => {}, isMarked: () => false, onToggleMark: () => {}, onContextTargetConsumed: () => setTargetKey(null) } });
    }
    qa.root.render(React.createElement(Case));
  });
  await page.waitForFunction(() => globalThis.__compatibleHistoryQA?.count === 10000 && document.querySelectorAll("[data-event-id]").length > 0);
  await page.evaluate(() => globalThis.__compatibleHistoryQA.target());
  await page.waitForFunction(() => document.querySelector('[data-event-id="history-5000"]'));
  const before = await page.locator('[data-event-id="history-5000"]').boundingBox();
  await page.evaluate(() => globalThis.__compatibleHistoryQA.append());
  await page.waitForFunction(() => globalThis.__compatibleHistoryQA?.count === 10250 && document.querySelector('button[aria-label="回到最新消息"]'));
  const after = await page.locator('[data-event-id="history-5000"]').boundingBox();
  assert.deepEqual(await page.evaluate(() => globalThis.__compatibleHistoryQA.errors), []);
  assert.ok(before && after && Math.abs(before.y - after.y) <= 2, "追加事件时阅读位置必须保持");
  assert.ok(await page.locator("[data-event-id]").count() < 100, "一万条历史必须保持虚拟化");
  await page.getByRole("button", { name: "回到最新消息" }).click();
  await page.waitForFunction(() => document.querySelector('[data-event-id="new-249"]'));
  assert.equal(await page.evaluate(() => globalThis.__compatibleHistoryQA.count), 10250);
  console.log(JSON.stringify({ retainedEvents: 10250, renderedRows: await page.locator("[data-event-id]").count(), anchorDelta: Math.abs(before.y - after.y), latestVisible: true }));
} finally {
  await browser.close();
}
