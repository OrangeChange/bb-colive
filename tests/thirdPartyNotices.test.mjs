import { readUiSource } from "./helpers/readUiSource.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const entries = JSON.parse(readUiSource('licenses/notices.json', 'utf8')).entries;
test('离线许可目录包含运行依赖、兼容渲染与字体原文', () => {
  assert.ok(entries.length > 500);
  assert.equal(new Set(entries.map(entry => entry.id)).size, entries.length);
  for (const entry of entries) {
    assert.ok(entry.text.trim(), entry.id);
    assert.doesNotMatch(entry.text, /C:\\Users\\Orange|C:\/Users\/Orange/, entry.id);
  }
  for (const name of ['react', 'tauri', 'selectors', 'MiSans', '仓耳与墨', 'video-animation-player']) assert.ok(entries.some(entry => entry.name === name), name);
  assert.ok(entries.find(entry => entry.name === 'MiSans').text.length > 6000);
  assert.equal(entries.find(entry => entry.name === '仓耳与墨').images.length, 2);
  assert.equal(entries.some(entry => entry.name === 'IBM Plex Mono'), false);
  assert.match(entries.find(entry => entry.name === 'Barlow Condensed').text, /Copyright 2017 The Barlow Project Authors/);
  const siphasher = entries.find(entry => entry.id === 'siphasher@1.0.3');
  assert.match(siphasher.text, /TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION/);
  assert.match(siphasher.text, /Permission is hereby granted/);
});
test('安装版与便携版保留离线许可，关于展示选定项目与个人主页', () => {
  const config = JSON.parse(readUiSource('src-tauri/tauri.conf.json', 'utf8'));
  assert.equal(config.bundle.resources['../licenses/distribution/'], 'licenses/');
  assert.ok(readUiSource('scripts/package-windows-portable.ps1', 'utf8').includes('licenses/distribution'));
  const text = readUiSource('licenses/distribution/THIRD_PARTY_NOTICES.txt', 'utf8');
  assert.ok(text.includes('BB CoLive 软件与源码使用许可协议'));
  for (const entry of entries) {
    assert.ok(text.includes(entry.url), entry.id);
    if (entry.id !== 'font/仓耳与墨') assert.ok(text.includes(entry.text.trim()), entry.id);
  }
  assert.ok(fs.readFileSync('licenses/distribution/Tsanger.pdf').equals(fs.readFileSync('licenses/fonts/Tsanger.pdf')));
  const links = readUiSource('src/components/ThirdPartyNotices.tsx', 'utf8');
  for (const name of ['Blivechat', 'LAPLACE Chat', 'React', 'Tauri', 'Tailwind CSS', 'shadcn/ui', 'https://space.bilibili.com/4261481', 'https://afdian.com/a/orangeee']) assert.ok(links.includes(name), name);
  assert.doesNotMatch(links, /本软件使用 MiSans 字体|完整许可声明|<h3>致谢/);
  assert.doesNotMatch(links, /lucide-react|@tabler\/icons-react/);
  const about = readUiSource('src/components/AboutDialog.tsx', 'utf8');
  assert.ok(about.includes('懂你的直播伙伴。'));
  assert.ok(about.includes('© 2026 橙橙子君 Orange'));
  assert.ok(!readUiSource('src/components/AboutDialog.tsx', 'utf8').includes('setLicenses'));
});
