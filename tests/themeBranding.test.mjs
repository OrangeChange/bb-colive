import test from 'node:test';
import assert from 'node:assert/strict';
import { getThemeModeDefinition } from '../src/themes/themeModes.ts';
import { createBuiltinCompatibleTheme } from '../src/themes/builtinThemeDefaults.ts';

test('LAPLACE 显示名称统一，内部格式和主题标识保持不变', () => {
  const mode = getThemeModeDefinition('laplace');
  const theme = createBuiltinCompatibleTheme('laplace');
  assert.equal(mode.label, 'LAPLACE');
  assert.equal(mode.mode, 'laplace');
  assert.equal(theme.metadata.name, 'LAPLACE 默认');
  assert.equal(theme.themeId, 'laplace-default');
  assert.equal(theme.mode, 'laplace');
});
