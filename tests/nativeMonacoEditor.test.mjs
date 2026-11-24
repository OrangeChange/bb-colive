import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test from "node:test";
import assert from "node:assert/strict";
import {
  createNativeMonacoModelUri,
  nativeMonacoHoverDescription,
  NATIVE_MONACO_OPTIONS,
} from "../src/components/nativeMonacoEditorConfig.ts";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

let vite;
test.after(async () => { await vite?.close(); });

test("Monaco 为两个 CSS 层建立稳定且互不冲突的模型地址", () => {
  assert.equal(createNativeMonacoModelUri("visual"), "inmemory://danmu-theme/visual.css");
  assert.equal(createNativeMonacoModelUri("custom"), "inmemory://danmu-theme/custom.css");
  assert.notEqual(createNativeMonacoModelUri("theme-a:custom"), createNativeMonacoModelUri("theme-b:custom"));
});

test("Monaco 使用中文友好的 CSS 编辑选项", () => {
  assert.equal(NATIVE_MONACO_OPTIONS.language, "css");
  assert.equal(NATIVE_MONACO_OPTIONS.contextmenu, true);
  assert.equal(NATIVE_MONACO_OPTIONS.minimap.enabled, false);
  assert.equal(NATIVE_MONACO_OPTIONS.automaticLayout, true);
  assert.equal(Object.hasOwn(NATIVE_MONACO_OPTIONS, "fontFamily"), false);
  assert.equal(NATIVE_MONACO_OPTIONS.fontSize, 14);
  assert.equal(NATIVE_MONACO_OPTIONS.lineHeight, 20);
  assert.equal(NATIVE_MONACO_OPTIONS.find.addExtraSpaceOnTop, false);
});

test("Monaco 主题使用软件明暗状态和语义颜色", async () => {
  const monacoTheme = await import("../src/components/nativeMonacoTheme.ts").catch(() => ({}));
  assert.equal(typeof monacoTheme.buildNativeMonacoTheme, "function");
  const theme = monacoTheme.buildNativeMonacoTheme({
    dark: true,
    background: "#141a18",
    raised: "#1b2220",
    border: "#33413d",
    text: "#ecefed",
    muted: "#79837f",
    accent: "#4c9a8d",
    accentSubtle: "#203c37",
  });
  assert.equal(theme.base, "vs-dark");
  assert.equal(theme.colors["editor.background"], "#141a18");
  assert.equal(theme.colors["editorWidget.background"], "#1b2220");
  assert.equal(theme.colors["editorCursor.foreground"], "#4c9a8d");
  assert.equal(typeof monacoTheme.resolveNativeMonacoColor, "function");
});

test("可视化标记悬停解释紧凑注释而不接受旧编码格式", () => {
  assert.equal(
    nativeMonacoHoverDescription("/* visual:common|gift|captain|price */"),
    "可视化样式：通用配色 · 礼物 · 舰长 · 价格整体",
  );
  assert.equal(nativeMonacoHoverDescription("/* danmu-visual:all%7Call%7Cprice */"), undefined);
});

test("Monaco 初始化期间提供明确加载状态", async () => {
  vite ??= await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-nativeMonacoEditor.test.mjs",optimizeDeps:{noDiscovery:true,include:[]}, root: fileURLToPath(new URL("..", import.meta.url)), configFile: false, esbuild: { jsx: "automatic" }, server: {watch:null, middlewareMode: true }, logLevel: "silent" });
  const { NativeCssCodeEditor } = await vite.ssrLoadModule("/src/components/NativeCssCodeEditor.tsx");
  const html = renderToStaticMarkup(React.createElement(NativeCssCodeEditor, {
    value: "", documentKey: "custom", readOnly: false, label: "编辑自定义 CSS", onChange() {}, onSave() {},
  }));
  assert.match(html, /正在加载编辑器/);
});
