import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import postcss from 'postcss';
import {NATIVE_LAYER_ORDER} from '../src/themes/nativeThemeCascade.ts';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('框架重置低于工具类，事件底座低于主题、配置与用户 CSS', () => {
  assert.equal(NATIVE_LAYER_ORDER, '@layer theme, utilities, base, default, config, custom;');
  const app = postcss.parse(read('src/App.css'));
  assert.equal(app.nodes[0].toString() + ';', NATIVE_LAYER_ORDER);
  const imports = app.nodes.filter(n => n.type === 'atrule' && n.name === 'import').map(n => n.params);
  assert(imports.includes('"tailwindcss/theme.css" layer(theme)'));
  assert(imports.includes('"tailwindcss/preflight.css" layer(theme)'));
  assert(imports.includes('"tailwindcss/utilities.css" layer(utilities)'));
  assert(!imports.includes('"tailwindcss"'));
});

test('完整原生底座和头像规则归入 base，生成文件沿用源层级', () => {
  for (const file of ['src/eventStyle.css', 'src/components/UserAvatar.css', 'src/themes/nativeDefaultStyle.generated.css']) {
    const root = postcss.parse(read(file));
    let count = 0;
    root.walkRules(rule => {
      if (rule.parent.type === 'atrule' && rule.parent.name === 'keyframes') return;
      let layer = rule.parent;
      while (layer && !(layer.type === 'atrule' && layer.name === 'layer')) layer = layer.parent;
      assert.equal(layer?.params, 'base', file + ': ' + rule.selector);
      count++;
    });
    assert(count > 0);
  }
});
