import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBuiltinNativeTheme, createBuiltinNativeThemes } from '../src/themes/nativeBuiltinThemes.ts';
import {nativeVisualCodeDefault} from '../src/themes/nativeThemeDefaults.ts';
import {normalizePriceGradient, themePriceGradient} from '../src/themes/nativePriceGradient.ts';

test('轻量气泡作为独立原生主题提供可编辑的基础样式', () => {
  const theme = createBuiltinNativeTheme('native-bubble');
  assert.equal(theme.metadata.name, '轻语气泡');
  assert.equal(theme.mode, 'native');
  assert.equal(theme.settings.avatarSize, 24);
  assert.match(theme.styles.baseCss, /\.event\.type-superchat/);
  assert.match(theme.styles.baseCss, /@container/);
  assert.equal(theme.styles.customCss, '');
  assert.equal(theme.styles.baseCss, readFileSync('src/themes/nativeBubbleTheme.css', 'utf8').replaceAll('\r\n', '\n'));
  assert.ok(createBuiltinNativeThemes().some(item => item.themeId === theme.themeId));
});

test('新增主题保留原生默认与卡片的既有默认设置', () => {
  assert.equal(createBuiltinNativeTheme('native-default').styles.baseCss, '');
  assert.equal(createBuiltinNativeTheme('native-card').settings.avatarSize, 32);
});

test('主题精简尺寸变量后仍使用对应的可视化默认值和价格配色', () => {
  for (const kind of ['card', 'bubble']) {
    const theme = createBuiltinNativeTheme('native-' + kind);
    assert.deepEqual(themePriceGradient(undefined, theme.styles.baseCss), normalizePriceGradient(undefined, kind));
    assert.deepEqual(nativeVisualCodeDefault({event: 'superchat', identity: 'all', part: 'translation'}, 'fontSize', theme.settings, theme.styles.baseCss), {mode: 'base-relative', ratio: .875});
  }
});
