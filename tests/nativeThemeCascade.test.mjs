import test from 'node:test';
import assert from 'node:assert/strict';
import postcss from 'postcss';
import { createBuiltinNativeTheme } from '../src/themes/nativeBuiltinThemes.ts';
import { projectNativeTheme } from '../src/themes/nativeThemeProjection.ts';
import { composeNativeThemeCss, assignNativeCssLayer, tryComposeNativePreviewCss } from '../src/themes/nativeThemeCascade.ts';
import { readManagedNativeEventVisibility, renderManagedNativeCss } from '../src/themes/nativeManagedCss.ts';
import { buildNativeThemeCssExport } from '../src/themes/themeCssExport.ts';
import { createThemeFromCss } from '../src/themes/themeImport.ts';

test('原生普通声明按来源归属 default config custom', () => {
  const theme = createBuiltinNativeTheme('native-default');
  theme.styles = {
    baseCss: '.message { color: red }',
    visualCss: '.message { color: green }',
    customCss: '.message { color: blue }',
  };
  const root = postcss.parse(projectNativeTheme(theme).css);
  const actual = [];
  root.walkDecls('color', declaration => {
    if (['red', 'green', 'blue'].includes(declaration.value)) actual.push([declaration.value, declaration.parent.parent.name, declaration.parent.parent.params]);
  });
  assert.deepEqual(actual, [['red', 'layer', 'default'], ['green', 'layer', 'config'], ['blue', 'layer', 'custom']]);
});

test('条件规则归层而关键帧字体和显式层保持原作用域', () => {
  const css = assignNativeCssLayer('@media (width > 1px){.message{color:red}} @keyframes move{to{opacity:0}} @font-face{font-family:demo;src:url(demo.woff)} @layer own{.message{color:blue}}', 'custom');
  const root = postcss.parse(css);
  const media = root.nodes.find(n => n.name === 'media');
  assert.equal(media.nodes[0].name, 'layer');
  assert.equal(media.nodes[0].params, 'custom');
  assert.equal(root.nodes.find(n => n.name === 'keyframes').nodes[0].type, 'rule');
  assert.equal(root.nodes.find(n => n.name === 'font-face').parent, root);
  assert.equal(root.nodes.find(n => n.params === 'own').parent, root);
});

test('完整导出复用投影且分层受管显隐仍可读回', () => {
  const theme = createBuiltinNativeTheme('native-default');
  theme.settings.eventVisibility.categories.gift = false;
  assert.equal(buildNativeThemeCssExport(theme, 'complete'), projectNativeTheme(theme).css);
  const original = readManagedNativeEventVisibility(renderManagedNativeCss(theme.settings));
  assert.deepEqual(readManagedNativeEventVisibility(projectNativeTheme(theme).css), original);
});

test('显式层不被重命名或嵌套且保存源不变', () => {
  const theme = createBuiltinNativeTheme('native-default');
  theme.styles.customCss = '@layer custom { .message { color: blue !important } }';
  const before = JSON.stringify(theme);
  const root = postcss.parse(projectNativeTheme(theme).css);
  const layers = [];
  root.walkAtRules('layer', layer => { if (layer.nodes) layers.push([layer.params, layer.parent.type]); });
  assert.deepEqual(layers.filter(([name]) => name === 'custom'), [['custom', 'root']]);
  assert.equal(JSON.stringify(theme), before);
});

test('可恢复的未完成草稿保留预览且不抛出渲染异常', () => {
  const theme = createBuiltinNativeTheme('native-default');
  theme.styles.customCss = '.message {';
  const result = tryComposeNativePreviewCss(theme, '.preview');
  assert.doesNotThrow(() => postcss.parse(result.css));
  assert.equal(result.error, null);
});

test('普通导入指定所属层，显式导入层保留且所有导入位于规则之前', () => {
  const theme = createBuiltinNativeTheme('native-default');
  theme.styles.baseCss = '@import "base.css" screen; .message{color:red}';
  theme.styles.customCss = '@import url(custom.css) supports(display:grid); @import "explicit.css" layer(own);';
  const root = postcss.parse(projectNativeTheme(theme).css);
  const imports = root.nodes.filter(n => n.name === 'import');
  assert.deepEqual(imports.map(n => n.params), ['"base.css" layer(default) screen', 'url(custom.css) layer(custom) supports(display:grid)', '"explicit.css" layer(own)']);
  assert(root.nodes.indexOf(imports.at(-1)) < root.nodes.findIndex(n => n.type === 'atrule' && n.name === 'layer' && n.nodes));
});

test('scope 内普通规则归层，显式子层保持原样', () => {
  const root = postcss.parse(assignNativeCssLayer('@scope (.event-area){.message{color:red}@layer own{.message{color:green}}}', 'default'));
  assert.equal(root.nodes[0].nodes[0].params, 'default');
  assert.equal(root.nodes[0].nodes[1].params, 'own');
});

test('层与条件关键字大小写不改变显式归属', () => {
  const css = assignNativeCssLayer('@IMPORT "one.css" LAYER(Author); @MEDIA (width > 1px){.message{color:red}}', 'custom');
  const root = postcss.parse(css);
  assert.equal(root.nodes[0].params, '"one.css" LAYER(Author)');
  assert.equal(root.nodes[1].nodes[0].params, 'custom');
});

test('CSS 导入的空结构化设置仍可投影且不修改导入文档', () => {
  const document = createThemeFromCss({ themeId: 'cascade-import', mode: 'native', name: 'CSS导入', css: '.message{color:blue}', importedAt: '2026-11-03' });
  document.settings = {};
  assert.match(projectNativeTheme(document).css, /@layer default/);
  assert.deepEqual(document.settings, {});
  assert.match(buildNativeThemeCssExport(document, 'complete'), /@layer default/);
  assert.doesNotThrow(() => buildNativeThemeCssExport(document, 'visual'));
});

test('基础与可视化导出复用完整组合的导入顺序', () => {
  const document = createBuiltinNativeTheme('native-default');
  document.styles.baseCss = '.message{color:red}';
  document.styles.visualCss = '@import "visual.css"; .message{color:green}';
  document.styles.customCss = '.message{color:blue}';
  const css = buildNativeThemeCssExport(document, 'base-visual');
  assert.equal(css, composeNativeThemeCss({ ...document, styles: { ...document.styles, customCss: '' } }));
  const root = postcss.parse(css);
  assert.equal(root.nodes[1].name, 'import');
});


test('自定义身份变量按主题优先级编排，不改变原文与匹配条件',()=>{
 const document=createBuiltinNativeTheme('native-default');
 document.styles.customCss='.guard-level-3{--bg:green}.mod{--bg:blue}';
 const source=document.styles.customCss;
 for(const priority of [['admin','captain'],['captain','admin']]){
  document.settings.display.identityPriority=[...priority,'viceroy','admiral','anchor','normal'];
  const css=projectNativeTheme(document).css;
  assert.equal(css.indexOf('--bg:green')<css.indexOf('--bg:blue'),priority[0]==='admin');
  assert.doesNotMatch(css,/guard-level-3:where/);
  assert.equal(document.styles.customCss,source);
 }
});
