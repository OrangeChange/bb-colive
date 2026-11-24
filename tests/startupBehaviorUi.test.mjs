import { readApplicationSources } from "./helpers/applicationSources.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${root}/${path}`, "utf8");

test("自启注册带有静默启动参数，普通启动才显示主窗口", () => {
  const rust = read("src-tauri/src/lib.rs");
  const config = read("src-tauri/tauri.conf.json");
  assert.match(rust, /autostart::Builder::new\([\s\S]*\.app_name\(if data_paths::portable_mode\(\)[\s\S]*\.args\(\["--background"\]\)/);
  assert.match(rust, /is_background_start/);
  assert.match(rust, /if !is_background_start[\s\S]*show_main_window/);
  assert.match(config, /"visible":\s*false/);
});

test("启动自动连接等待登录和主播记录恢复，并只使用最近连接主播", () => {
  const app = readApplicationSources();
  assert.match(app, /autoConnectOnStartup/);
  assert.match(app, /Promise\.all\(\[restore\(\), initAnchors\(\)\]\)/);
  assert.match(app, /lastConnectedAt/);
  assert.match(app, /connect\([^\n]*cookie[^\n]*mid/);
  assert.match(app, /startupAutoConnectAttempted/);
});

test("最近连接主播选择器为空列表返回空，否则取最后连接者", async () => {
  const { getMostRecentAnchor } = await import("../src/protocol/anchors.ts");
  assert.equal(typeof getMostRecentAnchor, "function");
  assert.equal(getMostRecentAnchor([]), null);
  assert.equal(getMostRecentAnchor([
    { roomIdInput: "1", realRoomId: 1, uname: "旧主播", lastConnectedAt: 10 },
    { roomIdInput: "2", realRoomId: 2, uname: "新主播", lastConnectedAt: 20 },
  ]).uname, "新主播");
});
