import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { getNativeEventSample } from "./fixtures/nativeEventSamples.ts";

const sourcePath = fileURLToPath(new URL("../src/components/EventRow.tsx", import.meta.url));
const source = readFileSync(sourcePath, "utf8");

test('大航海购买以专用图片作为事件图标，用户栏不重复身份', async () => {
  const vite = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-guardRender.test.mjs",optimizeDeps:{noDiscovery:true,include:[]},configFile:false,root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true,watch:null},logLevel:'silent'});
  try {
    const {EventRow} = await vite.ssrLoadModule('/src/components/EventRow.tsx');
    for (const layout of [{liveLayout:true},{reviewLayout:true},{}]) {
      const html = renderToStaticMarkup(React.createElement(EventRow,{ev:getNativeEventSample('guard-special'),showTime:false,...layout}));
      assert.match(html, /<img[^>]*class="event-icon/);
      assert.doesNotMatch(html,/class="guard-badge/);
      assert.doesNotMatch(html,/🚢/);
    }
  } finally { await vite.close(); }
});

test("大航海单次购买且服务端单位含时长时保留时长", async () => {
  const vite = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-guardRender.test.mjs",optimizeDeps:{noDiscovery:true,include:[]},configFile:false, root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true, watch:null }, appType: "custom", logLevel: "silent" });
  try {
    const { EventRow } = await vite.ssrLoadModule("/src/components/EventRow.tsx");
    for (const layout of [{ liveLayout: true }, { reviewLayout: true }, {}]) {
      const html = renderToStaticMarkup(React.createElement(EventRow, { ev: getNativeEventSample("guard-special"), showTime: false, ...layout }));
      assert.match(html, /class="guard-duration[^\"]*"[^>]*><span class="prefix quantity-prefix">×<\/span><span class="number quantity-number">5<\/span><span class="unit quantity-unit">天<\/span><\/span>/);
    }
  } finally { await vite.close(); }
});

test("礼物数量接入正文行高并保留行内居中，不以内联冻结文本盒", async () => {
  const vite = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-guardRender.test.mjs",configFile:false, root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true, watch:null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } });
  try {
    const { EventRow } = await vite.ssrLoadModule("/src/components/EventRow.tsx");
    for (const layout of [{ liveLayout: true }, { reviewLayout: true }, {}]) {
      const html = renderToStaticMarkup(React.createElement(EventRow, { ev: getNativeEventSample("normal-gift"), showTime: false, ...layout }));
      const count = html.match(/<span class="quantity gift-count[^>]*><span class="prefix quantity-prefix">×<\/span><span class="number quantity-number">1<\/span><\/span>/)?.[0];
      assert.ok(count);
      assert.match(count, /quantity-number/);
      assert.doesNotMatch(count, /style=/, "数量必须能从真实CSS消费行高与尺寸");
    }
  } finally { await vite.close(); }
});

test("主播、大航海和房管用户名使用身份色", () => {
  assert.match(source, /function identityNameClass/);
  assert.match(source, /text-ev-sc/);
  assert.match(source, /text-success/);
  assert.match(source, /GUARD_NAME_CLASS/);
  assert.match(source, /1: "text-ev-guard1"/);
  assert.match(source, /2: "text-ev-guard2"/);
  assert.match(source, /3: "text-ev-guard3"/);
});
