import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "vite";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import postcss from "postcss";
import { scopeThemeCss } from "../src/themes/themeCssScope.ts";

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = process.env.LAYOUT_ACCEPTANCE_DIR || "D:/CodexBuild/native-live-highlight";
await mkdir(out, { recursive: true });
const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null }, optimizeDeps: { noDiscovery: true, include: [] }, logLevel: "silent" });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
try {
  const { NativeLayoutFixture } = await server.ssrLoadModule("/tests/fixtures/nativeLayoutRepair.tsx");
  const assets = await readdir("dist/assets");
  const utilities = postcss.parse(await readFile("dist/assets/" + assets.find(name => /^register-.*\.css$/.test(name)), "utf8"));
  for (const node of [...utilities.nodes]) if (node.type !== "atrule" || node.name !== "layer" || !["theme", "base", "utilities"].includes(node.params)) node.remove();
  const css = utilities.toString()
    + (await readFile("src/App.css", "utf8")).replace(/^@import[^;]+;|^@source[^;]+;/gm, "")
    + scopeThemeCss(await readFile("src/eventStyle.css", "utf8"), ".theme-surface");
  const page = await browser.newPage({ viewport: { width: 700, height: 1100 } });
  for (const theme of ["default", "card", "bubble"]) for (const dark of [false, true]) for (const width of [280, 480]) for (const avatar of [false, true]) {
    const html = renderToStaticMarkup(React.createElement(NativeLayoutFixture, { initialState: { theme, dark, width, avatar, typographyOnly: true, target: "live" } }));
    await page.setContent(`<style>${css}body{margin:0}</style>${html}`, { waitUntil: "domcontentloaded" });
    const rows = await page.locator(".event-row-slot-content").evaluateAll(slots => slots.map(slot => {
      const event = slot.querySelector(".event"), box = slot.getBoundingClientRect();
      const gap = parseFloat(getComputedStyle(slot.querySelector(".event-row-slot-content")).paddingBottom) || 0;
      const highlight = getComputedStyle(slot, "::before"), fade = getComputedStyle(event, "::after");
      const actions = event.querySelector(".event-row-actions")?.getBoundingClientRect();
      return { event: event.className, width: box.width, height: box.height - gap, highlightWidth: parseFloat(highlight.width), highlightHeight: parseFloat(highlight.height), fadeTop: parseFloat(fade.top), fadeHeight: parseFloat(fade.height), transform: fade.transform, centerDelta: actions ? actions.y + actions.height / 2 - box.y - (box.height - gap) / 2 : null };
    }));
    for (const row of rows) {
      assert(Math.abs(row.width - row.highlightWidth) <= 1 && Math.abs(row.height - row.highlightHeight) <= 1, "高亮覆盖整行，排除事件间隔：" + JSON.stringify(row));
      assert(row.centerDelta === null || Math.abs(row.centerDelta) <= 1, "快捷按钮相对完整事件居中");
    }
    const first = page.locator(".event-row-slot-content").filter({ has: page.locator(".type-superchat") }).first();
    await first.hover();
    await page.waitForTimeout(170);
    assert.equal(await first.evaluate(node => getComputedStyle(node, "::before").opacity), "1", "悬停整行显示高亮");
    const active = await first.evaluate(slot => {
      const event = slot.querySelector(".event"), fade = getComputedStyle(event, "::after");
      const gap = parseFloat(getComputedStyle(slot.querySelector(".event-row-slot-content")).paddingBottom) || 0;
      return { top: parseFloat(fade.top), height: parseFloat(fade.height), expected: slot.getBoundingClientRect().height - gap, transform: fade.transform };
    });
    assert(active.top === 0 && Math.abs(active.height - active.expected) <= 1 && active.transform === "none", "悬停多行事件时渐变覆盖完整高度");
    const restingHeight = await page.locator(".event-row-with-menu").first().evaluate(event => {
      event.classList.add("event-row-has-persistent-action");
      const height = parseFloat(getComputedStyle(event, "::after").height);
      event.classList.remove("event-row-has-persistent-action");
      return height;
    });
    assert.equal(restingHeight, 24, "常驻标记未悬停时保留紧凑渐变");
    results.push({ theme, dark, width, avatar, rows: rows.length });
    if (avatar && width === 480) await page.screenshot({ path: `${out}/${theme}-${dark ? "dark" : "light"}.png`, fullPage: true });
  }
  const html = renderToStaticMarkup(React.createElement(NativeLayoutFixture, { initialState: { theme: "bubble", dark: false, width: 480, avatar: true, target: "window" } }));
  await page.setContent(`<style>${css}</style>${html}`, { waitUntil: "domcontentloaded" });
  assert(await page.locator(".event-row-slot-content").evaluateAll(slots => slots.every(node => getComputedStyle(node, "::before").content === "none")), "副窗口不增加现场高亮层");
  await writeFile(`${out}/results.json`, JSON.stringify({ cases: results, windowUnaffected: true }, null, 2));
  console.log(JSON.stringify({ cases: results.length, fullEventHighlight: true, buttonsCentered: true, windowUnaffected: true }));
} finally {
  await browser.close();
  await server.close();
}
