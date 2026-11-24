import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveCoLiveState, resolveCoLiveColors } from '../src/coliveLogo.ts';
import { contrastRatio } from '../src/customPalette.ts';

test('Windows 默认图标首帧使用256px并保留全部尺寸', () => {
  const ico = readFileSync('src-tauri/icons/icon.ico');
  const sizes = Array.from({ length: ico.readUInt16LE(4) }, (_, i) => ico[6 + i * 16] || 256);
  assert.equal(sizes[0], 256, 'Tauri 读取 ICO 首帧作为窗口与托盘图标');
  assert.deepEqual([...sizes].sort((a, b) => a - b), [16, 20, 24, 32, 40, 48, 64, 128, 256]);
});

test('连接状态优先于残留直播状态', () => {
  for (const status of ['idle', 'closed']) assert.equal(resolveCoLiveState(status, 1), 'idle');
  assert.equal(resolveCoLiveState('error', 1), 'error');
  for (const status of ['connecting', 'reconnecting']) assert.equal(resolveCoLiveState(status, 1), 'connecting');
  assert.equal(resolveCoLiveState('connected', undefined), 'connecting');
  assert.equal(resolveCoLiveState('connected', 0), 'rest');
  for (const live of [1, 2]) assert.equal(resolveCoLiveState('connected', live), 'live');
});

test('普通主题保留原色，浅主题只加深五官', () => {
  assert.deepEqual(resolveCoLiveColors('#f34b79', 'light'), { frame: '#f34b79', character: '#ffffff', face: '#f34b79' });
  assert.deepEqual(resolveCoLiveColors('#fb7299', 'dark'), { frame:'#ffffff', character:'#fb7299', face:'#ffffff' });
  for (const scheme of ['light', 'dark']) {
    const colors = resolveCoLiveColors('#f6cbd8', scheme);
    assert.equal(scheme === 'light' ? colors.frame : colors.character, '#f6cbd8');
    assert.ok(contrastRatio(colors.face, colors.character) >= 3.2);
  }
});
