import { readUiSource } from "./helpers/readUiSource.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = file => readUiSource(file, 'utf8');
test('BB CoLive 发行身份与作者一致', () => {
  const config = JSON.parse(read('src-tauri/tauri.conf.json'));
  assert.equal(config.identifier, 'orange.bbcolive');
  assert.equal(config.productName, 'BB CoLive');
  assert.equal(config.version, JSON.parse(read('package.json')).version);
  assert.match(read('src/components/AboutDialog.tsx'), /橙橙子君 Orange/);
  assert.equal(config.bundle.publisher, '橙橙子君（Orange）');
  assert.doesNotMatch(read('src/components/AboutDialog.tsx'), /setLicenses|license-search/);
});
test('JSON 与 SQL 连接使用品牌数据目录，附属窗口共享品牌 WebView 目录', () => {
  for (const file of ['src/protocol/login.ts', 'src/protocol/anchors.ts', 'src/themes/themeBindings.ts']) {
    assert.doesNotMatch(read(file), /from ['"]@tauri-apps\/plugin-store['"]/);
  }
  assert.match(read('src/archive/archiveRepository.ts'), /appDataFile/);
  assert.match(read('src-tauri/src/archive_database.rs'), /data_paths::root/);
  assert.ok(read('src-tauri/src/data_paths.rs').includes('.data_directory(root()?.join("WebView"))'));
  assert.ok(read('src-tauri/src/lib.rs').includes('.data_directory(data_paths::root()?.join("WebView"))'));
  for (const file of ['src/windows/displayBridge.ts','src/windows/giftBridge.ts','src/windows/nativeStylePreviewBridge.ts']) assert.match(read(file), /createAppWindow/);
});
