import test from 'node:test';
import assert from 'node:assert/strict';
import { readThemePackageFile, writeThemePackageFile } from '../src/themes/themePackageFiles.ts';
test('主题文件以二进制跨IPC传输，中文路径不进入大文件正文',async()=>{
 const bytes=new Uint8Array(2*1024*1024);bytes[0]=80;bytes[bytes.length-1]=75;
 const calls=[];globalThis.window={__TAURI_INTERNALS__:{invoke:async(...args)=>{calls.push(args);return bytes.buffer}}};
 assert.deepEqual(await readThemePackageFile('C:\\验收\\合集.zip'),bytes);
 await writeThemePackageFile('C:\\验收\\合集.zip',bytes);
 assert.equal(calls[0][0],'read_theme_package_raw');assert.equal(calls[1][0],'write_theme_package_raw');assert.equal(calls[1][1],bytes);
 assert.equal(new TextDecoder().decode(Uint8Array.from(atob(calls[1][2].headers['x-theme-path']),c=>c.charCodeAt(0))),'C:\\验收\\合集.zip');
});
