import assert from "node:assert/strict";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const app = await chromium.connectOverCDP(process.env.PREVIEW_TEST_CDP || "http://127.0.0.1:9257");
const main = app.contexts()[0].pages().find(page => page.url() === "http://tauri.localhost/");
assert.match(await main.evaluate(() => window.__TAURI_INTERNALS__.invoke("plugin:app|identifier")), /^cc\.orange\.danmu-app\.shared-preview-/);
await main.evaluate(async () => {
  const path = performance.getEntriesByType("resource").find(entry => entry.name.includes("obsOutputState-")).name;
  const module = await import(path);
  const session = Object.values(module).find(value => typeof value === "function" && typeof value.getState === "function" && "phase" in value.getState());
  session.setState({ phase: "loggedIn", session: { cookie: "", refreshToken: "", mid: "0", uname: "预览验收", savedAt: Date.now() }, error: null });
});
await main.waitForTimeout(700);
const button = name => main.getByRole("button", { name, exact: true }).evaluate(element => element.click());
await button("样式");
if (await main.getByRole("button", { name: "返回样式", exact: true }).count()) await button("返回样式");
await main.locator(".theme-library-card").filter({ has: main.locator("strong").filter({ hasText: /^BLC 开放版默认$/ }) }).getByRole("button", { name: "编辑", exact: true }).evaluate(element => element.click());
await button("动态");
await main.getByRole("combobox", { name: "动态速度", exact: true }).evaluate(element => element.click());
await main.getByRole("option", { name: "3×", exact: true }).evaluate(element => element.click());
const url = process.env.PREVIEW_TEST_URL || "http://127.0.0.1:17927/preview";
const port = Number(new URL(url).port);
await main.evaluate(async port => {
  const status = await window.__TAURI_INTERNALS__.invoke("obs_service_status");
  if (!status.running || status.port !== port) await window.__TAURI_INTERNALS__.invoke("obs_set_service_port", { port });
}, port);
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const first = await browser.newPage({ viewport: { width: 450, height: 300 } });
  const second = await browser.newPage({ viewport: { width: 450, height: 300 } });
  await Promise.all([first.goto(url), second.goto(url)]);
  const frame = page => page.locator(".shared-style-preview-content iframe").first().contentFrame();
  const scroll = page => frame(page).locator("#item-scroller");
  const snapshot = page => scroll(page).evaluate(node => {
    const top = node.getBoundingClientRect().top;
    const rows = [...node.querySelectorAll("#chat-items > [data-compatible-event-id]")];
    const anchor = rows.find(row => row.getBoundingClientRect().bottom > top);
    return { top: node.scrollTop, max: node.scrollHeight - node.clientHeight, anchor: anchor?.dataset.compatibleEventId, offset: anchor ? anchor.getBoundingClientRect().top - top : 0, ids: rows.map(row => row.dataset.compatibleEventId) };
  });
  const wait = async check => {
    const deadline = Date.now() + 30000;
    for (;;) {
      try { return await check(); } catch (error) { if (Date.now() >= deadline) throw error; await first.waitForTimeout(100); }
    }
  };
  await wait(async () => { assert((await snapshot(first)).max > 500, "动态固定预览应具有可滚动内容"); assert((await snapshot(second)).max > 500); });
  await wait(async () => { const state = await snapshot(second); assert(state.max - state.top <= 4); });
  const box = await scroll(first).boundingBox();
  await first.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await first.mouse.wheel(0, -500);
  await first.waitForTimeout(500);
  const before = await snapshot(first);
  assert(before.anchor && before.max - before.top > 100, "滚轮应进入历史位置");
  await first.waitForTimeout(5000);
  const after = await snapshot(first), following = await snapshot(second);
  assert(after.ids.some(id => !before.ids.includes(id)), "历史浏览期间应继续接收事件");
  assert.equal(after.anchor, before.anchor, "新事件不应改变历史锚点");
  assert(Math.abs(after.offset - before.offset) <= 4, "新事件不应改变历史偏移");
  assert(following.max - following.top <= 4, "另一页面应继续跟随最新");
  await first.mouse.wheel(0, 10000);
  await wait(async () => { const current = await snapshot(first); assert(current.max - current.top <= 4); });
  console.log(JSON.stringify({ scroll: true, anchor: before.anchor, offsetBefore: before.offset, offsetAfter: after.offset, otherPageFollowing: true }));
} finally {
  await browser.close();
  await app.close();
}
