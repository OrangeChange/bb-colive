import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relativePath) => readFileSync(`${root}/${relativePath}`, "utf8");

test("现场与回看使用同一槽位且不生成空白节点", async () => {
  const slotPath = `${root}/src/components/EventRowSlot.tsx`;
  assert.equal(existsSync(slotPath), true);
  const vite = await createServer({configFile:false,esbuild:{jsx:"automatic"},cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-eventSpacingConsistency.test.mjs", root, server: {watch:null, middlewareMode: true }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } });
  try {
    const { EventRowSlot } = await vite.ssrLoadModule("/src/components/EventRowSlot.tsx");
    for (const eventSpacing of [0, 8]) {
      const html = renderToStaticMarkup(React.createElement(EventRowSlot, { eventSpacing }, React.createElement("div", { className: "event" }, "事件背景")));
      assert.doesNotMatch(html, /event-row-slot-spacer/);
      assert.match(html, /data-event-spacing/);
      assert.doesNotMatch(html, /height:|margin:/, "不能行内锁死CSS间距和测量");
    }
    assert.doesNotMatch(renderToStaticMarkup(React.createElement(EventRowSlot, { showEventSpacing: false }, "末行")), /event-row-slot-spacer/);
  } finally { await vite.close(); }

  for (const sourcePath of [
    "src/components/EventList.tsx",
    "src/components/ReviewSessionTimeline.tsx",
    "src/components/StylePreviewArea.tsx",
    "src/windows/FloatingEventWindow.tsx",
    "src/windows/FloatingEventWindow.tsx",
  ]) {
    const source = read(sourcePath);
    assert.match(source, /EventRowSlot/);
    assert.doesNotMatch(source, /paddingBottom:\s*[^\n]*eventSpacing/);
  }
});

test("回看只在相邻事件之间添加间距，不给场次边界额外加事件间距", () => {
  const timeline = read("src/components/ReviewSessionTimeline.tsx");
  assert.match(timeline, /showEventSpacing=\{[^}]*entry\.kind === "event"/);
  assert.match(timeline, /timelineEntries\[virtualRow\.index \+ 1\]\?\.kind === "event"/);
});

test("事件间距估算与实际槽位规则一致，不把间距无条件加到所有回看条目", () => {
  const timeline = read("src/components/ReviewSessionTimeline.tsx");
  assert.doesNotMatch(timeline, /estimateSize:\s*\(\) => 42[\s\S]*\+ displayPreferences\.eventSpacing/);
  assert.match(timeline, /estimateSize:\s*\(index\) =>/);
});
