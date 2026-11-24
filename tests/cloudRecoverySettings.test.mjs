import { readUiSourceAsync } from "./helpers/readUiSource.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readUiSourceAsync(new URL('../src/components/CloudRecoverySettings.tsx', import.meta.url), 'utf8');

test('云端恢复设置使用用户语言并覆盖连接、恢复、暂停与错误状态', () => {
  for (const text of ['云端记录服务', '记录恢复', '连接服务器', '恢复记录', '暂停', '直播间号', '无法连接服务器']) assert.match(source, new RegExp(text));
});

test('身份码默认隐藏并提供可访问的显示切换', () => {
  assert.match(source, /type=\{showToken \? 'text' : 'password'\}/);
  assert.match(source, /aria-label=\{showToken \? ["']隐藏身份码["'] : ["']显示身份码["']\}/);
  assert.doesNotMatch(source, /localStorage\.setItem\([^\n]*token/);
});
