import { readUiSource } from "./helpers/readUiSource.mjs";
import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { createDefaultEventStyleSettings } from "../src/eventStyleSettings.ts";
import { getNativeEventSample } from "./fixtures/nativeEventSamples.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = readUiSource(`${root}/src/components/ThemeWorkspace.tsx`, "utf8");
const styleSource = readUiSource(`${root}/src/eventStyleSettings.ts`, "utf8");

test("颜色设置使用完整身份范围和原生主题编辑器", () => {
  const editorSource = readUiSource(`${root}/src/components/NativeThemeEditor.tsx`, "utf8");
  const visualSource = readUiSource(`${root}/src/components/NativeThemeVisualEditor.tsx`, "utf8");
  const capabilitySource = readUiSource(`${root}/src/themes/nativeThemeCapabilities.ts`, "utf8");
  for (const label of ["所有用户", "普通用户", "舰长", "提督", "总督", "房管", "主播"]) assert.match(capabilitySource, new RegExp(label));
  assert.match(source, /NativeThemeEditor/);
  assert.match(visualSource, /ThemeVisualPropertyField/);
  assert.match(readUiSource(`${root}/src/components/ThemeVisualPropertyField.tsx`, "utf8"), /ThemeColorField/);
  assert.match(visualSource, /clearNativeVisualTarget/);
  assert.match(visualSource, /hasLocalOverrides/);
  assert.match(styleSource, /fontFamily/);
  assert.match(styleSource, /textStroke/);
  assert.match(visualSource, /source: "custom"/);
  assert.match(visualSource, /当前层覆盖/);
});

test("事件样式模型包含用户名、正文和背景三种颜色部位", () => {
  for (const part of ["username", "content", "background", "stroke"]) assert.match(styleSource, new RegExp(part));
  assert.match(styleSource, /rgbaToCss/);
});

test("非透明背景接入圆角消费且不以内联背景阻断custom", async () => {
  const vite = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-eventStyleSettingsUi.test.mjs", configFile: false, esbuild: { jsx: "automatic" }, root, server: { middlewareMode: true, watch: null }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] } });
  try {
    const { EventRow } = await vite.ssrLoadModule("/src/components/EventRow.tsx");
    const settings = createDefaultEventStyleSettings(); settings.roles.normal.background = { r: 10, g: 20, b: 30, a: .5 };
    const ev = getNativeEventSample("text"); ev.user.guardLevel = 0; ev.user.isAnchor = false; ev.user.isAdmin = false;
    const html = renderToStaticMarkup(React.createElement(EventRow, { ev, eventStyleSettings: settings }));
    assert.ok(html.includes("event-row-custom-bg"));
    assert.doesNotMatch(html, /background-color:|border-radius:/);
    const plain = renderToStaticMarkup(React.createElement(EventRow, { ev, eventStyleSettings: createDefaultEventStyleSettings() }));
    assert.ok(!plain.includes("event-row-custom-bg"));
  } finally { await vite.close(); }
});
