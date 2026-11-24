import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const cargo = readFileSync(`${root}/src-tauri/Cargo.toml`, "utf8");
const source = readFileSync(`${root}/src-tauri/src/lib.rs`, "utf8");

test("桌面程序启用单实例，避免主分支与功能分支同时产生重复连接", () => {
  assert.match(cargo, /tauri-plugin-single-instance/);
  assert.match(source, /tauri_plugin_single_instance::init/);
});
