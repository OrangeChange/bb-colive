import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const sourcePath = fileURLToPath(new URL("../src/components/EventList.tsx", import.meta.url));
const source = readFileSync(sourcePath, "utf8");
let vite, EventList, createFeedScrollSession;
before(async () => {
  vite = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-eventListLayout.test.mjs",optimizeDeps:{noDiscovery:true,include:[]}, configFile: false, esbuild: { jsx: "automatic" }, root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true, watch: null }, appType: "custom", logLevel: "silent" });
  ({ EventList } = await vite.ssrLoadModule("/src/components/EventList.tsx"));
  ({ createFeedScrollSession } = await vite.ssrLoadModule("/src/events/feedScroll.ts"));
});
after(async () => { await vite?.close(); });

test("未读提示沿最新事件方向悬浮，不改变事件区间距", () => {
  for (const [scrollDirection, edge, padding, arrow] of [["top", "top-3", "pt-14", "↑"], ["bottom", "bottom-3", "pb-14", "↓"]]) {
    for (const unreadCount of [0, 2]) {
      const html = renderToStaticMarkup(React.createElement(EventList, {
        events: [], visibleIndices: [], viewKey: "fixed", feedKey: "fixed", liveLayout: true,
        scrollDirection, feedSession: { ...createFeedScrollSession(0), unreadCount },
      }));
      assert.match(html, /<div class="relative h-full min-h-0">/);
      const classes = [...html.matchAll(/class="([^"]*)"/g)].map((match) => match[1].split(/\s+/));
      const scroll = classes.find((tokens) => tokens.includes("event-area"));
      for (const name of ["h-full", "overflow-y-auto", "overflow-x-hidden", "scene-live-list"]) assert.ok(scroll.includes(name));
      assert.equal(scroll.includes(padding), false);
      assert.equal(scroll.includes(scrollDirection === "top" ? "pb-14" : "pt-14"), false);
      const overlay = classes.find((tokens) => tokens.includes("absolute") && tokens.includes("z-20"));
      if (unreadCount > 0) {
        assert.ok(overlay.includes(edge));
        assert.ok(overlay.includes("inset-x-0"));
        assert.ok(overlay.includes("pointer-events-none"));
        assert.match(html, new RegExp(`>${arrow}</span>`));
        assert.match(html, /回到最新/);
      } else assert.equal(overlay, undefined);
    }
  }
});

test("现场借鉴弹幕窗的间距，但保留原有滚动机制", () => {
  const cssPath = fileURLToPath(new URL("../src/App.css", import.meta.url));
  const css = readFileSync(cssPath, "utf8");
  assert.match(source, /liveLayout \? "scene-live-list" : ""/);
  assert.match(source, /scene-live-list/);
  assert.match(source, /overflow-y-auto/);
  assert.match(css, /\.scene-live-list\s*\{[\s\S]*padding:\s*8px/);
  assert.match(css, /\.scene-live-list\.pb-14\s*\{[\s\S]*padding-bottom:\s*56px/);
  assert.match(css, /\.scene-live-list\.pt-14\s*\{[\s\S]*padding-top:\s*56px/);
  assert.match(css, /\.scene-live-list\s+\.event-row/);
});

test("现场时间消费主题开关，回看事件保留时间", () => {
  const rows = [...source.matchAll(/<EventRow\b[\s\S]*?\/>/g)];
  assert.ok(rows.length > 0, "列表需要渲染事件行");
  for (const [row] of rows) {
    assert.match(row, /\bliveLayout\s*=\s*\{liveLayout\}/);
    assert.match(row, /\bshowTime\s*=\s*\{!liveLayout \|\| \(eventStyleSettings as EventStyleSettings & \{ display\?: \{ showTimestamp\?: boolean \} \}\)\.display\?\.showTimestamp === true\}/);
  }
});

test("现场统一事件槽位按基准比例计入事件间距，背景色不会覆盖间隙", () => {
  for (const [displayPreferences, ratio] of [[undefined, 0.375], [{ eventSpacing: 8, eventPadding: 10 }, 0.5]]) {
    const html = renderToStaticMarkup(React.createElement(EventList, { events: [], visibleIndices: [], viewKey: "fixed", feedKey: "fixed", liveLayout: true, feedSession: createFeedScrollSession(0), displayPreferences }));
    assert.ok(html.includes(`--event-config-spacing-scale:${ratio};`));
    assert.equal((html.match(/<style data-event-style-config=/g) ?? []).length, 1);
  }
  assert.match(source, /<EventRowSlot/);
  assert.match(source, /showEventSpacing=\{virtualRow\.index < orderedVisibleIndices\.length - 1\}/);
  assert.match(source, /estimateSize: \(index\) => estimateScaledEventRow\([\s\S]*spacing: index < orderedVisibleIndices\.length - 1 \? eventSpacing : 0/);
  assert.match(source, /eventPadding/);
  assert.match(source, /\[eventSpacing, eventPadding, contentScale, contentAlignment, rowVirtualizer, markLayoutChange, scrollDirection\]/);
});

test("顶部追加使用稳定锚点和主动滚动保护", () => {
  assert.match(source, /useLayoutEffect/);
  assert.match(source, /readingAnchorRef/);
  assert.match(source, /getTopAppendScrollTop/);
  assert.match(source, /shouldAdjustTopAppendAnchor/);
  assert.match(source, /programmaticScrollRef/);
});
