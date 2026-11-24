import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const root = fileURLToPath(new URL("..", import.meta.url));
const styleEditorSource = readFileSync(new URL("../src/components/NativeThemeBasicSettings.tsx", import.meta.url), "utf8");
let vite;
let EventRow;
let MsgType;
let displaySettings;

before(async () => {
  vite = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-honorLevelDisplay.test.mjs",optimizeDeps:{noDiscovery:true,include:[]},
    root,
    configFile: false, esbuild: { jsx: "automatic" },
    server: { middlewareMode: true, watch: null },
    appType: "custom",
    logLevel: "silent",
  });
  [{ EventRow }, { MsgType }, displaySettings] = await Promise.all([
    vite.ssrLoadModule("/src/components/EventRow.tsx"),
    vite.ssrLoadModule("/src/protocol/types.ts"),
    vite.ssrLoadModule("/src/eventDisplaySettings.ts"),
  ]);
});

after(async () => {
  await vite?.close();
});

const eventFor = (wealthLevel = 57) => ({
  id: "honor-event",
  msgType: MsgType.Danmu,
  roomId: 123,
  ts: 1_780_000_000_000,
  user: {
    uid: "7001",
    uname: "测试用户",
    guardLevel: 0,
    wealthLevel,
    wealthIconUrl: "https://example.invalid/remote-wealth.png",
  },
  text: "你好",
});

const render = (wealthLevel, mode, visible = true) => renderToStaticMarkup(React.createElement(EventRow, {
  ev: eventFor(wealthLevel),
  showTime: false,
  displayPreferences: {
    ...displaySettings.DEFAULT_EVENT_DISPLAY_PREFERENCES,
    showHonorLevel: visible,
    ...(mode === undefined ? {} : { honorLevelDisplayMode: mode }),
  },
}));

test("荣耀等级样式默认图标，旧设置和无效值也归一为图标", () => {
  assert.equal(displaySettings.DEFAULT_EVENT_DISPLAY_PREFERENCES.honorLevelDisplayMode, "icon");
  assert.equal(displaySettings.normalizeEventDisplayPreferences({}).honorLevelDisplayMode, "icon");
  assert.equal(displaySettings.normalizeEventDisplayPreferences({ honorLevelDisplayMode: "text" }).honorLevelDisplayMode, "text");
  assert.equal(displaySettings.normalizeEventDisplayPreferences({ honorLevelDisplayMode: "unexpected" }).honorLevelDisplayMode, "icon");
});

test("大航海与荣耀等级设置位于主题元素显示组，样式选项命名为图标和文字", () => {
  assert.match(styleEditorSource, /大航海身份/);
  assert.match(styleEditorSource, /荣耀勋章/);
  assert.match(styleEditorSource, /value: "icon", label: "图标"/);
  assert.match(styleEditorSource, /value: "text", label: "文字"/);
});

test("图标模式显示本地徽章，超出本地图片范围时保留数字回退", () => {
  const supported = render(57, "icon");
  assert.match(supported, /src="\/wealth-levels\/57\.png"/);
  assert.doesNotMatch(supported, /remote-wealth\.png/);

  const unsupported = render(88, "icon");
  assert.match(unsupported, />88</);
  assert.doesNotMatch(unsupported, /Lv88/);
});

test("文字模式显示 Lv 加等级数字，且显示开关仍可独立关闭", () => {
  const text = render(57, "text");
  assert.match(text, />Lv57</);
  assert.doesNotMatch(text, /wealth-levels\/57\.png/);

  const hidden = render(57, "text", false);
  assert.doesNotMatch(hidden, /Lv57|wealth-levels\/57\.png/);
});
