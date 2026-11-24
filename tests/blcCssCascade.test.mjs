import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import postcss from 'postcss';
import { createRequire } from 'node:module';
const SafeParser = createRequire(import.meta.url)('postcss-safe-parser/lib/safe-parser');

let vite, adapters, blc, open;
before(async () => {
  vite = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-blcCssCascade.test.mjs", configFile: false, server: { middlewareMode: true, watch: null }, optimizeDeps: {include:[], noDiscovery: true }, appType: 'custom', logLevel: 'silent' });
  adapters = await vite.ssrLoadModule('/src/themes/themeModeAdapters.ts');
  blc = await vite.ssrLoadModule('/src/compat/blivechat/css.ts');
  open = await vite.ssrLoadModule('/src/compat/openlive/css.ts');
});
after(async () => vite?.close());

for (const mode of ['blivechat', 'blivechat-open']) {
  test(`${mode} 普通声明分层，显式层和导入保持浏览器作用域`, () => {
    const doc = adapters.createCompatibleThemeModeAdapter(mode).createBuiltinTheme();
    doc.styles.baseCss = '#message{color:red}';
    doc.styles.customCss = '@import "custom.css"; @import "author.css" layer(author); .probe{color:blue} @layer author{.probe{color:purple!important}}';
    const before = JSON.stringify(doc);
    const css = mode === 'blivechat' ? blc.composeBlivechatThemeCss(doc) : open.composeOpenLiveThemeCss(doc);
    const root = postcss.parse(css);
    const colors = [];
    root.walkDecls('color', d => { if (['red', 'blue', 'purple'].includes(d.value)) colors.push([d.value, d.parent.parent.params]); });
    assert.deepEqual(colors, [['red', 'default'], ['blue', 'custom'], ['purple', 'author']]);
    assert.match(css, /^(?:@layer yt;\n)?@layer default, config, custom;/);
    assert.deepEqual(root.nodes.filter(n => n.name === 'import').map(n => n.params), ['"custom.css" layer(custom)', '"author.css" layer(author)']);
    assert.ok(root.nodes.findIndex(n => n.name === 'import') < root.nodes.findIndex(n => n.name === 'layer' && n.nodes));
    assert.equal(JSON.stringify(doc), before);
  });
}

test('开放版独立文档基础覆盖仍属于 default', () => {
  const doc = adapters.createCompatibleThemeModeAdapter('blivechat-open').createBuiltinTheme();
  doc.styles.baseCss = '#message{color:red}';
  doc.styles.customCss = '.probe{color:blue}';
  const result = open.createOpenLiveDocumentCss(doc);
  const colors = [];
  postcss.parse(result.css).walkDecls('color', d => colors.push([d.value, d.parent.parent.params]));
  assert.deepEqual(colors, [['red', 'default'], ['blue', 'custom']]);
});

test('CSS 内容相同的连续组合不重复解析，修改后重新解析', async () => {
  const { composeCompatibleCssLayers } = await vite.ssrLoadModule('/src/themes/compatibleThemeCascade.ts');
  const parse = SafeParser.prototype.parse;
  let calls = 0;
  SafeParser.prototype.parse = function (...args) { calls++; return parse.apply(this, args); };
  try {
    const css = composeCompatibleCssLayers([['.parse-probe{color:red}', 'custom']]);
    assert.ok(calls > 0);
    calls = 0;
    assert.equal(composeCompatibleCssLayers([['.parse-probe{color:red}', 'custom']]), css);
    assert.equal(calls, 0);
    assert.match(composeCompatibleCssLayers([['.parse-probe{color:blue}', 'custom']]), /color:blue/);
    assert.ok(calls > 0);
  } finally { SafeParser.prototype.parse = parse; }
});

test('提升导入时保留作者在导入前声明的层序', async () => {
  const { composeCompatibleCssLayers } = await vite.ssrLoadModule('/src/themes/compatibleThemeCascade.ts');
  const css = composeCompatibleCssLayers([['@layer a,b; @import "blue.css" layer(b); @layer a{.message{color:red}} @layer c,a;', 'custom']]);
  const root = postcss.parse(css);
  const authorOrder = root.nodes.findIndex(n => n.name === 'layer' && n.params === 'a,b');
  const imported = root.nodes.findIndex(n => n.name === 'import');
  const body = root.nodes.findIndex(n => n.name === 'layer' && n.nodes);
  const trailingOrder = root.nodes.findIndex(n => n.name === 'layer' && n.params === 'c,a');
  assert.ok(authorOrder >= 0 && authorOrder < imported);
  assert.ok(imported < body && body < trailingOrder);
});
