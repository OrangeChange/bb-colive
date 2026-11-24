import { readUiSource } from "./helpers/readUiSource.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("主题保存使用目录级暂存与替换", () => {
  const source = readUiSource("src-tauri/src/theme_store.rs", "utf8");
  assert.match(source, /write_theme_directory_atomically/);
  assert.match(source, /staging/);
  assert.match(source, /backup/);
});

test("旧修订不能覆盖磁盘新修订", () => {
  const source = readUiSource("src-tauri/src/theme_store.rs", "utf8");
  assert.match(source, /theme-file-conflict/);
  assert.match(source, /incoming_revision/);
  assert.match(source, /stored_revision/);
});

test("主题导入复用原子文档和资源保存入口", () => {
  const source = readUiSource("src/themes/themeImport.ts", "utf8");
  assert.match(source, /existing\.revision \+ 1/);
  assert.match(source, /assetChanges/);
  assert.match(source, /saveThemeDocument/);
});

test("主题根目录固定在可执行文件旁且不回退应用数据目录", () => {
  const source = readUiSource("src-tauri/src/theme_store.rs", "utf8");
  const resolver = source.match(/fn theme_root\(\)[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(resolver, /current_exe/);
  assert.match(resolver, /join\("style"\)/);
  assert.doesNotMatch(resolver, /data_paths::root/);
});

test("磁盘模式目录遵循 v1.2 名称", () => {
  const source = readUiSource("src-tauri/src/theme_store.rs", "utf8");
  assert.match(source, /"blivechat"\s*=>\s*Ok\("blc"\)/);
  assert.match(source, /"blivechat-open"\s*=>\s*Ok\("blc-open"\)/);
});

test("主题按清单稳定标识查找并以名称短标识创建目录", () => {
  const source = readUiSource("src-tauri/src/theme_store.rs", "utf8");
  assert.match(source, /find_theme_file/);
  assert.match(source, /theme_directory_name/);
  assert.doesNotMatch(source, /root\.join\(mode\)\.join\(theme_id\)/);
});

test("旧应用数据主题只复制到程序目录且不删除来源", () => {
  const source = readUiSource("src-tauri/src/theme_store.rs", "utf8");
  assert.match(source, /migrate_legacy_themes/);
  assert.match(source, /data_paths::root/);
  assert.doesNotMatch(source, /remove_dir_all\(legacy/);
});

test("程序目录不可写时提供可执行的错误说明", () => {
  const source = readUiSource("src-tauri/src/theme_store.rs", "utf8");
  assert.match(source, /theme-directory-unwritable/);
  const messages = JSON.parse(readUiSource("src/i18n/zh-CN.json", "utf8"));
  assert.match(messages["backend.theme_store.program_style_write_error"], /调整文件夹权限或将程序安装到可写位置后重试/);
});
