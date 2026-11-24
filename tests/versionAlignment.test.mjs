import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("前端、Cargo 和 Tauri bundle 使用同一版本", () => {
  const version = JSON.parse(readFileSync("package.json", "utf8")).version;
  assert.equal(JSON.parse(readFileSync("package-lock.json", "utf8")).version, version);
  assert.match(readFileSync("src-tauri/Cargo.toml", "utf8"), new RegExp(`^version = "${version.replace(/\./g, "\\.")}"`, "m"));
  assert.match(readFileSync("src-tauri/tauri.conf.json", "utf8"), new RegExp(`"version": "${version.replace(/\./g, "\\.")}"`));
  assert.match(readFileSync("src-tauri/Cargo.lock", "utf8").replace(/\r\n/g, "\n"), new RegExp(`\\[\\[package\\]\\]\\nname = "bb-colive"\\nversion = "${version.replace(/\./g, "\\.")}"`));
});
