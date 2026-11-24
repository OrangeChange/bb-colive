import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${root}/${path}`, "utf8");

test("Windows 字体列表由 DirectWrite 系统字体集合提供", () => {
  const cargo = read("src-tauri/Cargo.toml");
  const source = read("src-tauri/src/lib.rs");
  assert.match(cargo, /Win32_Graphics_DirectWrite/);
  assert.match(source, /list_installed_fonts/);
  assert.match(source, /DWriteCreateFactory/);
  assert.match(source, /GetSystemFontCollection/);
  assert.match(source, /GetFontFamilyCount/);
});
